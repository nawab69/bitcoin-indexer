import { DatabaseConnection } from '../database/connection';
import { BitcoinRpcClient } from './bitcoin-rpc';
import { ZmqService } from './zmq-service';
import { BitcoinBlock, BitcoinTransaction, AddressInfo, UTXO } from '../types/bitcoin';
import { logger } from '../utils/logger';

export interface IndexerConfig {
  rpc: {
    host: string;
    port: number;
    username: string;
    password: string;
    network: string;
  };
  zmq: {
    rawBlockPort: number;
    rawTxPort: number;
  };
  database: {
    path: string;
  };
  batchSize: number;
  reorgProtectionBlocks: number;
}

export class BitcoinIndexer {
  private db: DatabaseConnection;
  private rpc: BitcoinRpcClient;
  private zmq: ZmqService;
  private config: IndexerConfig;
  private isRunning = false;
  private isSyncing = false;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.db = new DatabaseConnection(config.database.path);
    this.rpc = new BitcoinRpcClient(config.rpc);
    this.zmq = new ZmqService(config.zmq);

    // Set up ZMQ event handlers
    this.zmq.on('rawblock', this.handleNewBlock.bind(this));
    this.zmq.on('rawtx', this.handleNewTransaction.bind(this));
    this.zmq.on('error', (error) => {
      logger.error('ZMQ error:', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer is already running');
      return;
    }

    try {
      // Initialize database
      await this.db.connect();
      await this.db.initialize();

      // Test RPC connection
      await this.rpc.ping();
      logger.info('Successfully connected to Bitcoin RPC');

      // Start ZMQ service
      await this.zmq.start();

      // Perform initial sync if needed
      await this.performInitialSync();

      this.isRunning = true;
      logger.info('Bitcoin indexer started successfully');
    } catch (error) {
      logger.error('Failed to start Bitcoin indexer:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.zmq.stop();
      await this.db.close();
      this.isRunning = false;
      logger.info('Bitcoin indexer stopped');
    } catch (error) {
      logger.error('Error stopping indexer:', error);
      throw error;
    }
  }

  private async performInitialSync(): Promise<void> {
    if (this.isSyncing) {
      logger.warn('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    logger.info('Starting initial blockchain sync...');

    try {
      const lastIndexedBlock = await this.getLastIndexedBlock();
      const currentBlockHeight = await this.rpc.getBlockCount();

      logger.info(`Last indexed block: ${lastIndexedBlock}, Current block height: ${currentBlockHeight}`);

      if (lastIndexedBlock < currentBlockHeight) {
        await this.syncBlocks(lastIndexedBlock + 1, currentBlockHeight);
      }

      await this.setIndexerState('lastIndexedBlock', currentBlockHeight.toString());
      logger.info('Initial sync completed');
    } catch (error) {
      logger.error('Error during initial sync:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncBlocks(fromHeight: number, toHeight: number): Promise<void> {
    const batchSize = this.config.batchSize;
    
    for (let height = fromHeight; height <= toHeight; height += batchSize) {
      const endHeight = Math.min(height + batchSize - 1, toHeight);
      logger.info(`Syncing blocks ${height} to ${endHeight}`);

      await this.db.beginTransaction();
      try {
        for (let blockHeight = height; blockHeight <= endHeight; blockHeight++) {
          const block = await this.rpc.getBlockByHeight(blockHeight);
          await this.indexBlock(block);
        }
        await this.db.commit();
        logger.debug(`Successfully indexed blocks ${height} to ${endHeight}`);
      } catch (error) {
        await this.db.rollback();
        logger.error(`Error indexing blocks ${height} to ${endHeight}:`, error);
        throw error;
      }
    }
  }

  private async indexBlock(block: BitcoinBlock): Promise<void> {
    // Insert block
    await this.db.run(`
      INSERT OR REPLACE INTO blocks (
        hash, height, version, merkle_root, timestamp, bits, nonce,
        difficulty, chainwork, tx_count, size, weight, previous_block_hash,
        next_block_hash, confirmations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      block.hash,
      block.height,
      block.version,
      block.merkleroot,
      block.time,
      block.bits,
      block.nonce,
      block.difficulty,
      block.chainwork,
      block.tx.length,
      block.size,
      block.weight,
      block.previousblockhash || null,
      block.nextblockhash || null,
      block.confirmations
    ]);

    // Index all transactions in the block
    for (const txid of block.tx) {
      const transaction = await this.rpc.getTransaction(txid);
      transaction.blockhash = block.hash;
      transaction.blockheight = block.height;
      transaction.blocktime = block.time;
      transaction.confirmations = block.confirmations;
      
      await this.indexTransaction(transaction);
    }

    logger.debug(`Indexed block ${block.height} with ${block.tx.length} transactions`);
  }

  private async indexTransaction(tx: BitcoinTransaction): Promise<void> {
    // Calculate transaction fee
    let totalInput = 0;
    let totalOutput = 0;

    // Insert transaction
    await this.db.run(`
      INSERT OR REPLACE INTO transactions (
        txid, hash, version, size, vsize, weight, locktime,
        block_hash, block_height, block_time, confirmations, fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tx.txid,
      tx.hash,
      tx.version,
      tx.size,
      tx.vsize,
      tx.weight,
      tx.locktime,
      tx.blockhash || null,
      tx.blockheight || null,
      tx.blocktime || null,
      tx.confirmations || 0,
      tx.fee || null
    ]);

    // Index transaction inputs
    for (let i = 0; i < tx.vin.length; i++) {
      const input = tx.vin[i];
      if (!input) continue;
      
      if (input.coinbase) {
        // Coinbase transaction
        await this.db.run(`
          INSERT OR REPLACE INTO transaction_inputs (
            txid, vout, script_sig, sequence, prev_txid, prev_vout
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [tx.txid, i, input.coinbase, input.sequence, null, null]);
      } else if (input.txid && input.vout !== undefined) {
        // Regular input - get previous output details
        const prevOutput = await this.getPreviousOutput(input.txid, input.vout);
        
        await this.db.run(`
          INSERT OR REPLACE INTO transaction_inputs (
            txid, vout, script_sig, sequence, prev_txid, prev_vout, prev_value, prev_address
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          tx.txid,
          i,
          input.scriptSig?.hex || null,
          input.sequence,
          input.txid,
          input.vout,
          prevOutput?.value || null,
          prevOutput?.address || null
        ]);

        // Mark previous output as spent
        await this.markOutputAsSpent(input.txid, input.vout, tx.txid, i);
        
        if (prevOutput?.value) {
          totalInput += prevOutput.value;
        }
      }
    }

    // Index transaction outputs
    for (let i = 0; i < tx.vout.length; i++) {
      const output = tx.vout[i];
      if (!output) continue;
      
      const address = this.extractAddress(output);
      const valueSatoshis = Math.round(output.value * 100000000); // Convert BTC to satoshis
      
      totalOutput += valueSatoshis;

      await this.db.run(`
        INSERT OR REPLACE INTO transaction_outputs (
          txid, vout, value, script_pub_key, address, is_spent
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        tx.txid,
        output.n,
        valueSatoshis,
        output.scriptPubKey.hex,
        address,
        false
      ]);

      // Add to UTXO set if not coinbase or has enough confirmations
      if (address && (!tx.vin[0]?.coinbase || (tx.confirmations || 0) >= 100)) {
        await this.addUTXO({
          txid: tx.txid,
          vout: output.n,
          address,
          value: valueSatoshis,
          scriptPubKey: output.scriptPubKey.hex,
          blockHeight: tx.blockheight || 0,
          isCoinbase: !!tx.vin[0]?.coinbase
        });
      }

      // Update address information
      if (address) {
        await this.updateAddressInfo(address, valueSatoshis, true, tx.blockheight);
      }
    }

    // Update transaction fee
    if (!tx.vin[0]?.coinbase && totalInput > 0) {
      const fee = totalInput - totalOutput;
      await this.db.run(`
        UPDATE transactions SET fee = ? WHERE txid = ?
      `, [fee, tx.txid]);
    }
  }

  private extractAddress(output: any): string | null {
    if (output.scriptPubKey?.address) {
      return output.scriptPubKey.address;
    }
    if (output.scriptPubKey?.addresses && output.scriptPubKey.addresses.length > 0) {
      return output.scriptPubKey.addresses[0];
    }
    return null;
  }

  private async getPreviousOutput(txid: string, vout: number): Promise<{value: number, address: string | null} | null> {
    const result = await this.db.get(`
      SELECT value, address FROM transaction_outputs 
      WHERE txid = ? AND vout = ?
    `, [txid, vout]);
    
    return result || null;
  }

  private async markOutputAsSpent(txid: string, vout: number, spentTxid: string, spentVout: number): Promise<void> {
    await this.db.run(`
      UPDATE transaction_outputs 
      SET is_spent = true, spent_txid = ?, spent_vout = ?, updated_at = CURRENT_TIMESTAMP
      WHERE txid = ? AND vout = ?
    `, [spentTxid, spentVout, txid, vout]);

    // Remove from UTXO set
    await this.db.run(`
      DELETE FROM utxos WHERE txid = ? AND vout = ?
    `, [txid, vout]);
  }

  private async addUTXO(utxo: UTXO): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO utxos (
        txid, vout, address, value, script_pub_key, block_height, is_coinbase
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      utxo.txid,
      utxo.vout,
      utxo.address,
      utxo.value,
      utxo.scriptPubKey,
      utxo.blockHeight,
      utxo.isCoinbase
    ]);
  }

  private async updateAddressInfo(address: string, value: number, isReceived: boolean, blockHeight?: number): Promise<void> {
    // Insert or update address
    await this.db.run(`
      INSERT OR IGNORE INTO addresses (address, first_seen_block) VALUES (?, ?)
    `, [address, blockHeight]);

    if (isReceived) {
      await this.db.run(`
        UPDATE addresses SET 
          received_count = received_count + 1,
          balance = balance + ?,
          total_received = total_received + ?,
          last_seen_block = COALESCE(?, last_seen_block),
          updated_at = CURRENT_TIMESTAMP
        WHERE address = ?
      `, [value, value, blockHeight, address]);
    } else {
      await this.db.run(`
        UPDATE addresses SET 
          sent_count = sent_count + 1,
          balance = balance - ?,
          total_sent = total_sent + ?,
          last_seen_block = COALESCE(?, last_seen_block),
          updated_at = CURRENT_TIMESTAMP
        WHERE address = ?
      `, [value, value, blockHeight, address]);
    }
  }

  private async handleNewBlock(data: any): Promise<void> {
    if (this.isSyncing) {
      return; // Skip real-time updates during sync
    }

    try {
      logger.info(`Processing new block: ${data.hash}`);
      const block = await this.rpc.getBlock(data.hash);
      
      await this.db.beginTransaction();
      await this.indexBlock(block);
      await this.setIndexerState('lastIndexedBlock', block.height.toString());
      await this.db.commit();
      
      logger.info(`Successfully indexed new block ${block.height}`);
    } catch (error) {
      await this.db.rollback();
      logger.error('Error processing new block:', error);
    }
  }

  private async handleNewTransaction(data: any): Promise<void> {
    if (this.isSyncing) {
      return; // Skip real-time updates during sync
    }

    try {
      logger.debug(`Processing new transaction: ${data.hash}`);
      // For mempool transactions, we might want to handle them differently
      // This is a placeholder for mempool transaction handling
    } catch (error) {
      logger.error('Error processing new transaction:', error);
    }
  }

  private async getLastIndexedBlock(): Promise<number> {
    const result = await this.db.get(`
      SELECT value FROM indexer_state WHERE key = 'lastIndexedBlock'
    `);
    return result ? parseInt(result.value) : -1;
  }

  private async setIndexerState(key: string, value: string): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO indexer_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value]);
  }

  // Public API methods
  async getAddressInfo(address: string): Promise<AddressInfo | null> {
    const result = await this.db.get(`
      SELECT * FROM addresses WHERE address = ?
    `, [address]);
    
    return result || null;
  }

  async getAddressTransactions(address: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    return await this.db.all(`
      SELECT at.*, t.block_height, t.block_time, t.confirmations
      FROM address_transactions at
      JOIN transactions t ON at.txid = t.txid
      WHERE at.address = ?
      ORDER BY t.block_height DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `, [address, limit, offset]);
  }

  async getAddressUTXOs(address: string): Promise<UTXO[]> {
    return await this.db.all(`
      SELECT * FROM utxos WHERE address = ?
      ORDER BY block_height DESC, value DESC
    `, [address]);
  }

  async getTransaction(txid: string): Promise<any | null> {
    const tx = await this.db.get(`
      SELECT * FROM transactions WHERE txid = ?
    `, [txid]);

    if (!tx) return null;

    // Get inputs and outputs
    const inputs = await this.db.all(`
      SELECT * FROM transaction_inputs WHERE txid = ? ORDER BY vout
    `, [txid]);

    const outputs = await this.db.all(`
      SELECT * FROM transaction_outputs WHERE txid = ? ORDER BY vout
    `, [txid]);

    return {
      ...tx,
      inputs,
      outputs
    };
  }

  async getBlock(hashOrHeight: string | number): Promise<any | null> {
    const isHeight = typeof hashOrHeight === 'number';
    const block = await this.db.get(`
      SELECT * FROM blocks WHERE ${isHeight ? 'height' : 'hash'} = ?
    `, [hashOrHeight]);

    if (!block) return null;

    // Get transaction count
    const txCount = await this.db.get(`
      SELECT COUNT(*) as count FROM transactions WHERE block_hash = ?
    `, [block.hash]);

    return {
      ...block,
      tx_count: txCount?.count || 0
    };
  }

  async getIndexerStats(): Promise<any> {
    const stats = await this.db.get(`
      SELECT 
        (SELECT COUNT(*) FROM blocks) as total_blocks,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        (SELECT COUNT(*) FROM addresses) as total_addresses,
        (SELECT COUNT(*) FROM utxos) as total_utxos,
        (SELECT value FROM indexer_state WHERE key = 'lastIndexedBlock') as last_indexed_block
    `);

    const currentHeight = await this.rpc.getBlockCount();
    
    return {
      ...stats,
      current_height: currentHeight,
      is_synced: parseInt(stats?.last_indexed_block || '0') >= currentHeight - 1,
      is_running: this.isRunning,
      is_syncing: this.isSyncing
    };
  }
} 
import dotenv from 'dotenv';
import { DatabaseConnection } from './database/connection';
import { BitcoinRpcClient } from './services/bitcoin-rpc';
import { ApiServer } from './api/server';
import { logger } from './utils/logger';
import { BitcoinBlock, BitcoinTransaction } from './types/bitcoin';

// Load environment variables
dotenv.config();

// Configuration
const config = {
  rpc: {
    host: process.env.BITCOIN_RPC_HOST || 'localhost',
    port: parseInt(process.env.BITCOIN_RPC_PORT || '18443'),
    username: process.env.BITCOIN_RPC_USERNAME || 'nawab',
    password: process.env.BITCOIN_RPC_PASSWORD || 'nawab123',
    network: process.env.BITCOIN_NETWORK || 'regtest',
  },
  database: {
    path: process.env.DATABASE_PATH || './indexer.db',
  },
  api: {
    port: parseInt(process.env.API_PORT || '3001'),
    host: process.env.API_HOST || 'localhost'
  },
  batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100'),
};

class SimpleIndexer {
  private db: DatabaseConnection;
  private rpc: BitcoinRpcClient;
  private isRunning = false;

  constructor() {
    this.db = new DatabaseConnection(config.database.path);
    this.rpc = new BitcoinRpcClient(config.rpc);
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

      this.isRunning = true;
      logger.info('Simple Bitcoin indexer started successfully');
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
      await this.db.close();
      this.isRunning = false;
      logger.info('Bitcoin indexer stopped');
    } catch (error) {
      logger.error('Error stopping indexer:', error);
      throw error;
    }
  }

  async syncBlocks(fromHeight: number, toHeight: number): Promise<void> {
    const batchSize = config.batchSize;
    
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
    logger.debug(`Block ${block.height} has ${block.tx.length} transactions`);
    
    for (let i = 0; i < block.tx.length; i++) {
      const txid = block.tx[i];
      
      // Ensure txid is a string, not an object
      const txidString = typeof txid === 'string' ? txid : (txid as any).txid || JSON.stringify(txid);
      
      logger.debug(`Processing transaction ${i + 1}/${block.tx.length}: ${txidString}`);
      
      try {
        // Skip genesis block coinbase transaction (it can't be retrieved via RPC)
        if (block.height === 0 && i === 0) {
          logger.debug('Skipping genesis block coinbase transaction');
          await this.db.run(`
            INSERT OR REPLACE INTO transactions (
              txid, hash, block_hash, block_height, block_time, confirmations,
              version, size, vsize, weight, locktime, fee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            txidString,
            txidString,
            block.hash,
            block.height,
            block.time,
            block.confirmations,
            1, 0, 0, 0, 0, null
          ]);
          continue;
        }

        // Get full transaction details
        const transaction = await this.rpc.getTransaction(txidString);
        transaction.blockhash = block.hash;
        transaction.blockheight = block.height;
        transaction.blocktime = block.time;
        transaction.confirmations = block.confirmations;
        
        await this.indexTransaction(transaction);
      } catch (error) {
        logger.warn(`Failed to get transaction details for ${txidString} in block ${block.height}, storing basic info only:`, error);
        
        // Fallback: store basic transaction info
        await this.db.run(`
          INSERT OR REPLACE INTO transactions (
            txid, hash, block_hash, block_height, block_time, confirmations,
            version, size, vsize, weight, locktime, fee
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          txidString,
          txidString,
          block.hash,
          block.height,
          block.time,
          block.confirmations,
          1, 0, 0, 0, 0, null
        ]);
      }
    }

    logger.debug(`Indexed block ${block.height} with ${block.tx.length} transactions`);
  }

  private async indexTransaction(tx: BitcoinTransaction): Promise<void> {
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
        await this.db.run(`
          INSERT OR REPLACE INTO transaction_inputs (
            txid, vout, script_sig, sequence, prev_txid, prev_vout
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [tx.txid, i, input.coinbase, input.sequence, null, null]);
      } else if (input.txid && input.vout !== undefined) {
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

        await this.markOutputAsSpent(input.txid, input.vout, tx.txid, i);
        
        if (prevOutput?.value) {
          totalInput += prevOutput.value;
          
          // Update address info for spending (if we have the address)
          if (prevOutput.address) {
            await this.updateAddressInfo(prevOutput.address, prevOutput.value, false, tx.blockheight);
          }
        }
      }
    }

    // Index transaction outputs
    for (let i = 0; i < tx.vout.length; i++) {
      const output = tx.vout[i];
      if (!output) continue;
      
      const address = this.extractAddress(output);
      const valueSatoshis = Math.round(output.value * 100000000);
      
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

      if (address) {
        await this.addUTXO({
          txid: tx.txid,
          vout: output.n,
          address,
          value: valueSatoshis,
          scriptPubKey: output.scriptPubKey.hex,
          blockHeight: tx.blockheight || 0,
          isCoinbase: !!tx.vin[0]?.coinbase
        });

        await this.updateAddressInfo(address, valueSatoshis, true, tx.blockheight);
      }
    }

    if (!tx.vin[0]?.coinbase && totalInput > 0) {
      const fee = totalInput - totalOutput;
      await this.db.run(`UPDATE transactions SET fee = ? WHERE txid = ?`, [fee, tx.txid]);
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
    const result = await this.db.get(`SELECT value, address FROM transaction_outputs WHERE txid = ? AND vout = ?`, [txid, vout]);
    return result || null;
  }

  private async markOutputAsSpent(txid: string, vout: number, spentTxid: string, spentVout: number): Promise<void> {
    await this.db.run(`
      UPDATE transaction_outputs 
      SET is_spent = true, spent_txid = ?, spent_vout = ?, updated_at = CURRENT_TIMESTAMP
      WHERE txid = ? AND vout = ?
    `, [spentTxid, spentVout, txid, vout]);

    await this.db.run(`DELETE FROM utxos WHERE txid = ? AND vout = ?`, [txid, vout]);
  }

  private async addUTXO(utxo: any): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO utxos (
        txid, vout, address, value, script_pub_key, block_height, is_coinbase
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [utxo.txid, utxo.vout, utxo.address, utxo.value, utxo.scriptPubKey, utxo.blockHeight, utxo.isCoinbase]);
  }

  private async updateAddressInfo(address: string, value: number, isReceived: boolean, blockHeight?: number): Promise<void> {
    await this.db.run(`INSERT OR IGNORE INTO addresses (address, first_seen_block) VALUES (?, ?)`, [address, blockHeight]);

    if (isReceived) {
      // Address is receiving money (from transaction outputs)
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
      // Address is spending money (from transaction inputs)
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

  // API methods
  async getAddressInfo(address: string): Promise<any> {
    return await this.db.get(`SELECT * FROM addresses WHERE address = ?`, [address]);
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

  async getAddressUTXOs(address: string): Promise<any[]> {
    return await this.db.all(`SELECT * FROM utxos WHERE address = ? ORDER BY block_height DESC, value DESC`, [address]);
  }

  async getTransaction(txid: string): Promise<any | null> {
    const tx = await this.db.get(`SELECT * FROM transactions WHERE txid = ?`, [txid]);
    if (!tx) return null;

    const inputs = await this.db.all(`SELECT * FROM transaction_inputs WHERE txid = ? ORDER BY vout`, [txid]);
    const outputs = await this.db.all(`SELECT * FROM transaction_outputs WHERE txid = ? ORDER BY vout`, [txid]);

    return { ...tx, inputs, outputs };
  }

  async getBlock(hashOrHeight: string | number): Promise<any | null> {
    const isHeight = typeof hashOrHeight === 'number';
    const block = await this.db.get(`SELECT * FROM blocks WHERE ${isHeight ? 'height' : 'hash'} = ?`, [hashOrHeight]);
    if (!block) return null;

    const txCount = await this.db.get(`SELECT COUNT(*) as count FROM transactions WHERE block_hash = ?`, [block.hash]);
    return { ...block, tx_count: txCount?.count || 0 };
  }

  async getIndexerStats(): Promise<any> {
    const stats = await this.db.get(`
      SELECT 
        (SELECT COUNT(*) FROM blocks) as total_blocks,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        (SELECT COUNT(*) FROM addresses) as total_addresses,
        (SELECT COUNT(*) FROM utxos) as total_utxos
    `);

    const currentHeight = await this.rpc.getBlockCount();
    
    return {
      ...stats,
      current_height: currentHeight,
      is_synced: parseInt(stats?.total_blocks || '0') >= currentHeight - 1,
      is_running: this.isRunning
    };
  }
}

async function main() {
  try {
    logger.info('🚀 Starting Simple Bitcoin Indexer...');

    const indexer = new SimpleIndexer();
    
    // Create API server that works with the simple indexer
    const apiServer = new ApiServer(
      indexer as any, // Type assertion for compatibility
      config.api.port,
      config.api.host
    );

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await indexer.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await indexer.start();
    await apiServer.start();

    logger.info('✅ Simple Bitcoin Indexer is running successfully!');
    logger.info(`🌐 API server available at http://${config.api.host}:${config.api.port}`);
    logger.info('📚 Available endpoints:');
    logger.info('  GET  /health - Health check');
         logger.info('  GET  /stats - Indexer statistics');
     logger.info('  GET  /address/:address - Get address information');
     logger.info('  GET  /transaction/:txid - Get transaction details');
     logger.info('  GET  /block/:hashOrHeight - Get block details');
     logger.info('  POST /sync/:fromHeight/:toHeight - Sync blocks in range');

  } catch (error) {
    logger.error('❌ Failed to start Simple Bitcoin Indexer:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    logger.error('Application failed to start:', error);
    process.exit(1);
  });
} 
import { DatabaseService } from './DatabaseService';
import { BitcoinRpcClient } from './bitcoin-rpc';
import { AddressInfo, UTXO } from '../types/bitcoin';
import { logger } from '../utils/logger';

export class TypeORMIndexerAdapter {
    private dbService: DatabaseService;
    private rpcClient: BitcoinRpcClient;

    constructor(dbService: DatabaseService, rpcClient: BitcoinRpcClient) {
        this.dbService = dbService;
        this.rpcClient = rpcClient;
    }

    // Expose database service for maintenance operations
    getDatabaseService(): DatabaseService {
        return this.dbService;
    }

    // API Server compatibility methods
    async getIndexerStats(): Promise<any> {
        return await this.dbService.getStats();
    }

    async getAddressInfo(address: string): Promise<AddressInfo | null> {
        try {
            const addressEntity = await this.dbService.getAddressInfo(address);
            if (!addressEntity) return null;

            return {
                address: addressEntity.address,
                balance: parseFloat(addressEntity.balance),
                totalReceived: parseFloat(addressEntity.total_received),
                totalSent: parseFloat(addressEntity.total_sent),
                receivedCount: Math.floor(addressEntity.transaction_count / 2), // Approximate
                sentCount: Math.floor(addressEntity.transaction_count / 2), // Approximate
                firstSeenBlock: addressEntity.first_seen_height || undefined,
                lastSeenBlock: addressEntity.last_activity_height || undefined
            };
        } catch (error) {
            logger.error('Error getting address info:', error);
            return null;
        }
    }

    async getAddressTransactions(address: string, limit: number = 50, offset: number = 0): Promise<any[]> {
        try {
            // This would need a more complex query in a real implementation
            // For now, return empty array
            logger.info(`Getting transactions for address ${address} (limit: ${limit}, offset: ${offset})`);
            return [];
        } catch (error) {
            logger.error('Error getting address transactions:', error);
            return [];
        }
    }

    async getAddressUTXOs(address: string): Promise<UTXO[]> {
        try {
            const utxos = await this.dbService.getUTXOsByAddress(address);
            return utxos.map(utxo => ({
                txid: utxo.transaction_id,
                vout: utxo.output_index,
                address: utxo.address,
                value: parseFloat(utxo.value) / 100000000, // Convert satoshis to BTC
                scriptPubKey: utxo.script_pub_key,
                blockHeight: utxo.block_height,
                isCoinbase: false // Would need to check transaction type
            }));
        } catch (error) {
            logger.error('Error getting address UTXOs:', error);
            return [];
        }
    }

    async getTransaction(txid: string): Promise<any | null> {
        try {
            const transaction = await this.dbService.getTransactionByTxid(txid);
            if (!transaction) return null;

            return {
                txid: transaction.txid,
                hash: transaction.hash,
                version: transaction.version,
                size: transaction.size,
                vsize: transaction.vsize,
                weight: transaction.weight,
                locktime: transaction.locktime,
                blockhash: transaction.block_hash,
                blockheight: transaction.block_height,
                blocktime: transaction.block_time,
                // inputs and outputs would be loaded via relations
                vin: transaction.inputs || [],
                vout: transaction.outputs || []
            };
        } catch (error) {
            logger.error('Error getting transaction:', error);
            return null;
        }
    }

    async getBlock(hashOrHeight: string | number): Promise<any | null> {
        try {
            let block;
            if (typeof hashOrHeight === 'string') {
                block = await this.dbService.getBlockByHash(hashOrHeight);
            } else {
                block = await this.dbService.getBlockByHeight(hashOrHeight);
            }

            if (!block) return null;

            return {
                hash: block.hash,
                height: block.height,
                version: block.version,
                merkleroot: block.merkleroot,
                time: block.time,
                mediantime: block.mediantime,
                nonce: block.nonce,
                bits: block.bits,
                difficulty: parseFloat(block.difficulty),
                chainwork: block.chainwork,
                nTx: block.nTx,
                size: block.size,
                strippedsize: block.strippedsize,
                weight: block.weight,
                previousblockhash: block.previousblockhash,
                nextblockhash: block.nextblockhash,
                tx: block.transactions ? block.transactions.map(t => t.txid) : []
            };
        } catch (error) {
            logger.error('Error getting block:', error);
            return null;
        }
    }

    // Additional methods for indexing operations
    async syncBlocks(fromHeight: number, toHeight: number): Promise<void> {
        try {
            logger.info(`Syncing blocks from ${fromHeight} to ${toHeight}`);
            
            for (let height = fromHeight; height <= toHeight; height++) {
                // Check if block is already processed
                const existingBlock = await this.dbService.getBlockByHeight(height);
                if (existingBlock) {
                    logger.debug(`Block ${height} already processed, skipping`);
                    await this.dbService.setLastProcessedHeight(height);
                    continue;
                }

                const blockHash = await this.rpcClient.getBlockHash(height);
                const blockData = await this.rpcClient.getBlock(blockHash);
                
                // Save block
                await this.dbService.saveBlock(blockData);
                
                // Process transactions
                for (const txid of blockData.tx) {
                    try {
                        await this.processTransaction(txid, height, blockData.time);
                    } catch (error: any) {
                        if (error.code === -5 && height === 0) {
                            // Genesis block coinbase transaction - handle specially
                            logger.debug(`Skipping genesis block coinbase transaction: ${txid}`);
                            await this.processGenesisTransaction(txid, height, blockData.time);
                        } else {
                            logger.warn(`Error processing transaction ${txid}: ${error.message}`);
                            // Continue with other transactions instead of failing the entire block
                        }
                    }
                }
                
                await this.dbService.setLastProcessedHeight(height);
                logger.debug(`Processed block ${height}`);
            }
            
            logger.info(`Successfully synced blocks ${fromHeight} to ${toHeight}`);
        } catch (error) {
            logger.error('Error syncing blocks:', error);
            throw error;
        }
    }

    private async processTransaction(txid: string, blockHeight: number, blockTime: number): Promise<void> {
        try {
            const txData = await this.rpcClient.getTransaction(txid, true);
            
            // Save transaction
            await this.dbService.saveTransaction(txData, blockHeight, blockTime);
            
            // Process inputs and track spending
            if (txData.vin) {
                for (let i = 0; i < txData.vin.length; i++) {
                    await this.dbService.saveTransactionInput(txData.vin[i], txid);
                    
                    // Track spending of previous outputs (if not coinbase)
                    if (txData.vin[i].txid && txData.vin[i].vout !== undefined) {
                        await this.processInputSpending(txData.vin[i], txid, blockHeight);
                    }
                }
            }
            
            // Process outputs
            if (txData.vout) {
                for (const output of txData.vout) {
                    await this.dbService.saveTransactionOutput(output, txid);
                    
                    // Update address balances and UTXOs
                    const address = output.scriptPubKey?.address || output.scriptPubKey?.addresses?.[0];
                    if (address) {
                        const valueSatoshis = BigInt(Math.round(output.value * 100000000));
                        await this.dbService.updateAddressBalance(address, valueSatoshis, true, txid);
                        await this.dbService.saveUTXO(
                            txid,
                            output.n,
                            address,
                            valueSatoshis.toString(),
                            output.scriptPubKey.hex,
                            blockHeight,
                            blockTime
                        );
                    }
                }
            }
        } catch (error) {
            logger.error(`Error processing transaction ${txid}:`, error);
            throw error;
        }
    }

    private async processInputSpending(input: any, spendingTxid: string, blockHeight: number): Promise<void> {
        try {
            const previousTxid = input.txid;
            const previousVout = input.vout;

            // Find the UTXO being spent
            const utxo = await this.dbService.getUTXOByTxidAndIndex(previousTxid, previousVout);
            if (utxo && !utxo.is_spent) {
                // Mark UTXO as spent
                await this.dbService.spendUTXO(previousTxid, previousVout, spendingTxid, input.n || 0, blockHeight);
                
                // Update address balance (subtract the spent amount)
                const spentValue = BigInt(utxo.value);
                await this.dbService.updateAddressBalance(utxo.address, spentValue, false, spendingTxid);
                
                logger.debug(`Marked UTXO ${previousTxid}:${previousVout} as spent by ${spendingTxid}`);
            }
        } catch (error) {
            logger.error(`Error processing input spending for ${input.txid}:${input.vout}:`, error);
            // Don't throw - continue processing other inputs
        }
    }

    private async processGenesisTransaction(txid: string, blockHeight: number, blockTime: number): Promise<void> {
        try {
            // Create a basic transaction record for the genesis coinbase
            const genesisTx = {
                txid,
                hash: txid,
                version: 1,
                size: 204,  // Typical genesis transaction size
                vsize: 204,
                weight: 816,
                locktime: 0,
                vin: [{
                    coinbase: "04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73",
                    sequence: 4294967295
                }],
                vout: [{
                    value: 50.0,
                    n: 0,
                    scriptPubKey: {
                        asm: "04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f OP_CHECKSIG",
                        hex: "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
                        type: "pubkey",
                        addresses: ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"]
                    }
                }]
            };

            // Save transaction
            await this.dbService.saveTransaction(genesisTx, blockHeight, blockTime);
            
            // Process outputs only (no inputs for coinbase)
            if (genesisTx.vout) {
                for (const output of genesisTx.vout) {
                    await this.dbService.saveTransactionOutput(output, txid);
                    
                                         // Update address balances and UTXOs
                     const address = output.scriptPubKey?.addresses?.[0];
                     if (address) {
                         const valueSatoshis = BigInt(Math.round(output.value * 100000000));
                         await this.dbService.updateAddressBalance(address, valueSatoshis, true, txid);
                         await this.dbService.saveUTXO(
                             txid,
                             output.n,
                             address,
                             valueSatoshis.toString(),
                             output.scriptPubKey.hex,
                             blockHeight,
                             blockTime
                         );
                     }
                }
            }
        } catch (error) {
            logger.error(`Error processing genesis transaction ${txid}:`, error);
            throw error;
        }
    }
} 
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Block } from '../entities/Block';
import { Transaction } from '../entities/Transaction';
import { TransactionInput } from '../entities/TransactionInput';
import { TransactionOutput } from '../entities/TransactionOutput';
import { Address } from '../entities/Address';
import { UTXO } from '../entities/UTXO';
import { IndexerState } from '../entities/IndexerState';
import { BitcoinBlock, BitcoinTransaction } from '../types/bitcoin';
import { logger } from '../utils/logger';

export class DatabaseService {
    private blockRepo: Repository<Block>;
    private transactionRepo: Repository<Transaction>;
    private inputRepo: Repository<TransactionInput>;
    private outputRepo: Repository<TransactionOutput>;
    private addressRepo: Repository<Address>;
    private utxoRepo: Repository<UTXO>;
    private stateRepo: Repository<IndexerState>;

    constructor() {
        this.blockRepo = AppDataSource.getRepository(Block);
        this.transactionRepo = AppDataSource.getRepository(Transaction);
        this.inputRepo = AppDataSource.getRepository(TransactionInput);
        this.outputRepo = AppDataSource.getRepository(TransactionOutput);
        this.addressRepo = AppDataSource.getRepository(Address);
        this.utxoRepo = AppDataSource.getRepository(UTXO);
        this.stateRepo = AppDataSource.getRepository(IndexerState);
    }

    // Block operations
    async saveBlock(blockData: BitcoinBlock): Promise<Block> {
        try {
            // Check if block already exists
            const existingBlock = await this.blockRepo.findOne({ 
                where: { hash: blockData.hash } 
            });

            if (existingBlock) {
                logger.debug(`Block ${blockData.hash} already exists, skipping`);
                return existingBlock;
            }

            const block = this.blockRepo.create({
                hash: blockData.hash,
                height: blockData.height,
                previousblockhash: blockData.previousblockhash || null,
                nextblockhash: blockData.nextblockhash || null,
                version: blockData.version,
                merkleroot: blockData.merkleroot,
                time: blockData.time,
                mediantime: blockData.time, // Use time as fallback for mediantime
                nonce: blockData.nonce,
                bits: blockData.bits,
                difficulty: blockData.difficulty.toString(),
                chainwork: blockData.chainwork,
                nTx: blockData.tx.length, // Use tx array length for nTx
                size: blockData.size,
                strippedsize: blockData.size, // Use size as fallback for strippedsize
                weight: blockData.weight
            });

            return await this.blockRepo.save(block);
        } catch (error) {
            logger.error('Error saving block:', error);
            throw error;
        }
    }

    async getBlockByHash(hash: string): Promise<Block | null> {
        return await this.blockRepo.findOne({ 
            where: { hash },
            relations: ['transactions']
        });
    }

    async getBlockByHeight(height: number): Promise<Block | null> {
        return await this.blockRepo.findOne({ 
            where: { height },
            relations: ['transactions']
        });
    }

    async getLastBlockHeight(): Promise<number> {
        const result = await this.blockRepo
            .createQueryBuilder('block')
            .select('MAX(block.height)', 'max')
            .getRawOne();
        
        return result?.max || -1;
    }

    // Transaction operations
    async saveTransaction(txData: BitcoinTransaction, blockHeight?: number, blockTime?: number): Promise<Transaction> {
        try {
            // Check if transaction already exists
            const existingTx = await this.transactionRepo.findOne({ 
                where: { txid: txData.txid } 
            });

            if (existingTx) {
                logger.debug(`Transaction ${txData.txid} already exists, skipping`);
                return existingTx;
            }

            const transaction = this.transactionRepo.create({
                txid: txData.txid,
                hash: txData.hash,
                version: txData.version,
                size: txData.size,
                vsize: txData.vsize,
                weight: txData.weight,
                locktime: txData.locktime,
                block_hash: txData.blockhash || null,
                block_height: blockHeight || null,
                block_index: null, // blockindex not available in interface
                block_time: blockTime || null,
                is_coinbase: txData.vin?.[0]?.coinbase ? true : false,
                total_input_value: '0',
                total_output_value: '0',
                fee: '0'
            });

            return await this.transactionRepo.save(transaction);
        } catch (error) {
            logger.error('Error saving transaction:', error);
            throw error;
        }
    }

    async getTransactionByTxid(txid: string): Promise<Transaction | null> {
        return await this.transactionRepo.findOne({ 
            where: { txid },
            relations: ['inputs', 'outputs']
        });
    }

    // Input operations
    async saveTransactionInput(inputData: any, transactionId: string): Promise<TransactionInput> {
        try {
            // Check if input already exists
            const existingInput = await this.inputRepo.findOne({
                where: { 
                    transaction_id: transactionId,
                    input_index: inputData.n || 0
                }
            });

            if (existingInput) {
                logger.debug(`Transaction input ${transactionId}:${inputData.n || 0} already exists, skipping`);
                return existingInput;
            }

            const input = this.inputRepo.create({
                transaction_id: transactionId,
                input_index: inputData.n || 0,
                previous_output_txid: inputData.txid,
                previous_output_index: inputData.vout,
                script_sig: inputData.scriptSig?.hex,
                script_sig_asm: inputData.scriptSig?.asm,
                sequence: inputData.sequence,
                witness: inputData.txinwitness,
                coinbase: inputData.coinbase
            });

            return await this.inputRepo.save(input);
        } catch (error) {
            logger.error('Error saving transaction input:', error);
            throw error;
        }
    }

    // Output operations
    async saveTransactionOutput(outputData: any, transactionId: string): Promise<TransactionOutput> {
        try {
            // Check if output already exists
            const existingOutput = await this.outputRepo.findOne({
                where: { 
                    transaction_id: transactionId,
                    output_index: outputData.n
                }
            });

            if (existingOutput) {
                logger.debug(`Transaction output ${transactionId}:${outputData.n} already exists, skipping`);
                return existingOutput;
            }

            const output = this.outputRepo.create({
                transaction_id: transactionId,
                output_index: outputData.n,
                value: (outputData.value * 100000000).toString(), // Convert to satoshis
                script_pub_key: outputData.scriptPubKey?.hex,
                script_pub_key_asm: outputData.scriptPubKey?.asm,
                script_pub_key_type: outputData.scriptPubKey?.type,
                address: outputData.scriptPubKey?.address || outputData.scriptPubKey?.addresses?.[0]
            });

            return await this.outputRepo.save(output);
        } catch (error) {
            logger.error('Error saving transaction output:', error);
            throw error;
        }
    }

    // Address operations
    async getOrCreateAddress(addressStr: string): Promise<Address> {
        let address = await this.addressRepo.findOne({ where: { address: addressStr } });
        
        if (!address) {
            address = this.addressRepo.create({
                address: addressStr,
                balance: '0',
                total_received: '0',
                total_sent: '0',
                transaction_count: 0,
                utxo_count: 0
            });
            address = await this.addressRepo.save(address);
        }
        
        return address;
    }

    async updateAddressBalance(addressStr: string, balanceChange: bigint, isReceived: boolean = true, txid?: string): Promise<void> {
        try {
            // Use a transaction to ensure atomicity
            await this.addressRepo.manager.transaction(async transactionalEntityManager => {
                const addressRepo = transactionalEntityManager.getRepository(Address);
                
                let address = await addressRepo.findOne({ where: { address: addressStr } });
                
                if (!address) {
                    address = addressRepo.create({
                        address: addressStr,
                        balance: '0',
                        total_received: '0',
                        total_sent: '0',
                        transaction_count: 0,
                        utxo_count: 0
                    });
                }
                
                const currentBalance = BigInt(address.balance);
                const currentReceived = BigInt(address.total_received);
                const currentSent = BigInt(address.total_sent);
                
                if (isReceived) {
                    address.balance = (currentBalance + balanceChange).toString();
                    address.total_received = (currentReceived + balanceChange).toString();
                } else {
                    address.balance = (currentBalance - balanceChange).toString();
                    address.total_sent = (currentSent + balanceChange).toString();
                }
                
                address.transaction_count += 1;
                
                await addressRepo.save(address);
                
                logger.debug(`Updated address ${addressStr}: balance=${address.balance}, txid=${txid}`);
            });
        } catch (error) {
            logger.error('Error updating address balance:', error);
            // Don't throw - this is not critical for basic functionality
        }
    }

    async getAddressInfo(addressStr: string): Promise<Address | null> {
        return await this.addressRepo.findOne({ where: { address: addressStr } });
    }

    // UTXO operations
    async saveUTXO(txid: string, outputIndex: number, addressStr: string, value: string, scriptPubKey: string, blockHeight: number, blockTime: number): Promise<UTXO> {
        try {
            // Check if UTXO already exists
            const existingUTXO = await this.utxoRepo.findOne({
                where: { 
                    transaction_id: txid,
                    output_index: outputIndex
                }
            });

            if (existingUTXO) {
                logger.debug(`UTXO ${txid}:${outputIndex} already exists, skipping`);
                return existingUTXO;
            }

            const utxo = this.utxoRepo.create({
                transaction_id: txid,
                output_index: outputIndex,
                address: addressStr,
                value: value,
                script_pub_key: scriptPubKey,
                block_height: blockHeight,
                block_time: blockTime
            });

            return await this.utxoRepo.save(utxo);
        } catch (error) {
            logger.error('Error saving UTXO:', error);
            throw error;
        }
    }

    async spendUTXO(txid: string, outputIndex: number, spentByTxid: string, spentByInputIndex: number, spentAtHeight: number): Promise<void> {
        await this.utxoRepo.update(
            { transaction_id: txid, output_index: outputIndex },
            {
                is_spent: true,
                spent_by_txid: spentByTxid,
                spent_by_input_index: spentByInputIndex,
                spent_at_height: spentAtHeight,
                spent_at_time: Date.now()
            }
        );
    }

    async getUTXOsByAddress(addressStr: string): Promise<UTXO[]> {
        return await this.utxoRepo.find({
            where: { address: addressStr, is_spent: false }
        });
    }

    async getUTXOByTxidAndIndex(txid: string, outputIndex: number): Promise<UTXO | null> {
        return await this.utxoRepo.findOne({
            where: { 
                transaction_id: txid, 
                output_index: outputIndex 
            }
        });
    }

    // State management
    async getState(key: string): Promise<string | null> {
        const state = await this.stateRepo.findOne({ where: { key } });
        return state?.value || null;
    }

    async setState(key: string, value: string, description?: string): Promise<void> {
        let state = await this.stateRepo.findOne({ where: { key } });
        
        if (state) {
            state.value = value;
            if (description) state.description = description;
        } else {
            state = this.stateRepo.create({ key, value, description });
        }
        
        await this.stateRepo.save(state);
    }

    async getLastProcessedHeight(): Promise<number> {
        const height = await this.getState('last_processed_height');
        return height ? parseInt(height) : -1;
    }

    async setLastProcessedHeight(height: number): Promise<void> {
        await this.setState('last_processed_height', height.toString(), 'Last successfully processed block height');
    }

    // Statistics
    async getStats(): Promise<any> {
        const [
            blockCount,
            transactionCount,
            addressCount,
            utxoCount,
            lastHeight
        ] = await Promise.all([
            this.blockRepo.count(),
            this.transactionRepo.count(),
            this.addressRepo.count(),
            this.utxoRepo.count({ where: { is_spent: false } }),
            this.getLastBlockHeight()
        ]);

        return {
            blocks: blockCount,
            transactions: transactionCount,
            addresses: addressCount,
            utxos: utxoCount,
            lastBlockHeight: lastHeight
        };
    }

    // Search functionality
    async search(query: string): Promise<any> {
        const results: any = {};

        // Try to find by transaction hash
        if (query.length === 64) {
            const transaction = await this.getTransactionByTxid(query);
            if (transaction) {
                results.transaction = transaction;
            }

            const block = await this.getBlockByHash(query);
            if (block) {
                results.block = block;
            }
        }

        // Try to find by block height
        if (/^\d+$/.test(query)) {
            const height = parseInt(query);
            const block = await this.getBlockByHeight(height);
            if (block) {
                results.block = block;
            }
        }

        // Try to find by address
        const address = await this.getAddressInfo(query);
        if (address) {
            results.address = address;
        }

        return results;
    }

    // Cleanup methods for handling duplicates and data integrity
    async cleanupDuplicates(): Promise<void> {
        try {
            logger.info('🧹 Starting duplicate cleanup...');

            // Remove duplicate transaction inputs (keep the first one)
            await this.inputRepo.manager.query(`
                DELETE FROM transaction_inputs 
                WHERE id NOT IN (
                    SELECT DISTINCT ON (transaction_id, input_index) id 
                    FROM transaction_inputs 
                    ORDER BY transaction_id, input_index, created_at ASC
                )
            `);

            // Remove duplicate transaction outputs (keep the first one)
            await this.outputRepo.manager.query(`
                DELETE FROM transaction_outputs 
                WHERE id NOT IN (
                    SELECT DISTINCT ON (transaction_id, output_index) id 
                    FROM transaction_outputs 
                    ORDER BY transaction_id, output_index, created_at ASC
                )
            `);

            // Remove duplicate UTXOs (keep the first one)
            await this.utxoRepo.manager.query(`
                DELETE FROM utxos 
                WHERE id NOT IN (
                    SELECT DISTINCT ON (transaction_id, output_index) id 
                    FROM utxos 
                    ORDER BY transaction_id, output_index, created_at ASC
                )
            `);

            logger.info('✅ Duplicate cleanup completed');
        } catch (error) {
            logger.error('Error during duplicate cleanup:', error);
            // Don't throw - this is maintenance
        }
    }

    // Recount address balances from UTXOs
    async recalculateAddressBalances(): Promise<void> {
        try {
            logger.info('🔄 Recalculating address balances...');

            // Reset all address balances (find all addresses first)
            const allAddresses = await this.addressRepo.find();
            for (const addr of allAddresses) {
                await this.addressRepo.update({ id: addr.id }, {
                    balance: '0',
                    total_received: '0',
                    total_sent: '0',
                    transaction_count: 0,
                    utxo_count: 0
                });
            }

            // Recalculate from all UTXOs (both spent and unspent)
            const allUtxos = await this.utxoRepo.find();
            const spentUtxos = await this.utxoRepo.find({ where: { is_spent: true } });
            const unspentUtxos = await this.utxoRepo.find({ where: { is_spent: false } });
            
            const addressStats = new Map<string, { 
                balance: bigint, 
                totalReceived: bigint, 
                totalSent: bigint, 
                utxoCount: number,
                txCount: number 
            }>();

            // Calculate received amounts from all UTXOs (outputs)
            for (const utxo of allUtxos) {
                const current = addressStats.get(utxo.address) || { 
                    balance: BigInt(0), 
                    totalReceived: BigInt(0), 
                    totalSent: BigInt(0), 
                    utxoCount: 0,
                    txCount: 0
                };
                
                current.totalReceived += BigInt(utxo.value);
                current.txCount += 1;
                
                addressStats.set(utxo.address, current);
            }

            // Calculate sent amounts from spent UTXOs
            for (const utxo of spentUtxos) {
                const current = addressStats.get(utxo.address);
                if (current) {
                    current.totalSent += BigInt(utxo.value);
                }
            }

            // Calculate current balance from unspent UTXOs
            for (const utxo of unspentUtxos) {
                const current = addressStats.get(utxo.address);
                if (current) {
                    current.balance += BigInt(utxo.value);
                    current.utxoCount += 1;
                }
            }

            // Update address balances
            for (const [address, stats] of addressStats) {
                await this.addressRepo.update(
                    { address },
                    { 
                        balance: stats.balance.toString(),
                        total_received: stats.totalReceived.toString(),
                        total_sent: stats.totalSent.toString(),
                        utxo_count: stats.utxoCount,
                        transaction_count: stats.txCount
                    }
                );
            }

            logger.info('✅ Address balance recalculation completed');
        } catch (error) {
            logger.error('Error during balance recalculation:', error);
        }
    }

    // Maintenance method to check and fix data consistency
    async performMaintenance(): Promise<void> {
        logger.info('🔧 Starting database maintenance...');
        await this.cleanupDuplicates();
        await this.recalculateAddressBalances();
        logger.info('✅ Database maintenance completed');
    }
} 
import 'reflect-metadata';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './config/database';
import { DatabaseService } from './services/DatabaseService';
import { BitcoinRpcClient } from './services/bitcoin-rpc';
import { TypeORMIndexerAdapter } from './services/TypeORMIndexerAdapter';
import { TypeORMApiServer } from './api/typeorm-server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

class BitcoinIndexerTypeORM {
    private dbService: DatabaseService;
    private rpcService: BitcoinRpcClient;
    private indexerAdapter: TypeORMIndexerAdapter;
    private apiServer: TypeORMApiServer;
    private isRunning: boolean = false;

    constructor() {
        this.dbService = new DatabaseService();
        this.rpcService = new BitcoinRpcClient({
            host: process.env.BITCOIN_RPC_HOST || 'localhost',
            port: parseInt(process.env.BITCOIN_RPC_PORT || '18443'),
            username: process.env.BITCOIN_RPC_USERNAME || 'nawab',
            password: process.env.BITCOIN_RPC_PASSWORD || 'nawab123',
            network: process.env.BITCOIN_NETWORK || 'regtest'
        });
        this.indexerAdapter = new TypeORMIndexerAdapter(this.dbService, this.rpcService);
        this.apiServer = new TypeORMApiServer(this.indexerAdapter);
    }

    async start(): Promise<void> {
        try {
            logger.info('🚀 Starting Bitcoin Indexer with TypeORM...');

            // Initialize database connection
            await initializeDatabase();
            logger.info('✅ Database initialized');

            // Test Bitcoin RPC connection
            await this.rpcService.getBlockchainInfo();
            logger.info('✅ Bitcoin RPC connection verified');

            // Start API server
            await this.apiServer.start();
            logger.info('✅ API server started');

            this.isRunning = true;
            logger.info('🎉 Bitcoin Indexer is now running!');

            // Start basic synchronization (simplified for initial testing)
            await this.performBasicSync();

        } catch (error) {
            logger.error('❌ Failed to start Bitcoin Indexer:', error);
            await this.shutdown();
            process.exit(1);
        }
    }

    private async performBasicSync(): Promise<void> {
        try {
            logger.info('📊 Starting basic blockchain synchronization...');

            const chainInfo = await this.rpcService.getBlockchainInfo();
            const currentHeight = chainInfo.blocks;
            const lastProcessedHeight = await this.dbService.getLastProcessedHeight();

            logger.info(`Chain height: ${currentHeight}, Last processed: ${lastProcessedHeight}`);

            // Process blocks in batches (start from block 1 to avoid genesis block issues)
            const startHeight = Math.max(1, lastProcessedHeight + 1);
            const batchSize = 10; // Process 10 blocks at a time
            const maxBlocks = 50; // Process max 50 blocks per startup
            const endHeight = Math.min(currentHeight, startHeight + maxBlocks - 1);

            if (startHeight <= endHeight) {
                // Process in batches to avoid overwhelming the system
                for (let batchStart = startHeight; batchStart <= endHeight; batchStart += batchSize) {
                    const batchEnd = Math.min(batchStart + batchSize - 1, endHeight);
                    
                    try {
                        await this.indexerAdapter.syncBlocks(batchStart, batchEnd);
                        logger.info(`✅ Processed batch: blocks ${batchStart} to ${batchEnd}`);
                        
                        // Small delay between batches to prevent overwhelming
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        logger.error(`❌ Error processing batch ${batchStart}-${batchEnd}:`, error);
                        // Continue with next batch instead of failing completely
                    }
                }
                
                logger.info(`✅ Synchronization completed: processed blocks ${startHeight} to ${endHeight}`);
            } else {
                logger.info('✅ No new blocks to process');
            }
        } catch (error) {
            logger.error('❌ Error during synchronization:', error);
            // Don't throw - let the server continue running
        }
    }



    async shutdown(): Promise<void> {
        if (!this.isRunning) return;

        logger.info('🛑 Shutting down Bitcoin Indexer...');
        this.isRunning = false;

        try {
            await this.apiServer.stop();
            logger.info('✅ API server stopped');

            await closeDatabase();
            logger.info('✅ Database connection closed');

            logger.info('👋 Bitcoin Indexer shut down successfully');
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
        }
    }
}

// Handle graceful shutdown
const indexer = new BitcoinIndexerTypeORM();

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await indexer.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await indexer.shutdown();
    process.exit(0);
});

// Start the indexer
indexer.start().catch((error) => {
    logger.error('Failed to start indexer:', error);
    process.exit(1);
}); 
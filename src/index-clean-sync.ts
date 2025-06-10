import { initializeDatabase, AppDataSource } from './config/database';
import { BitcoinRpcClient } from './services/bitcoin-rpc';
import { TypeORMIndexerAdapter } from './services/TypeORMIndexerAdapter';
import { TypeORMApiServer } from './api/typeorm-server';
import { DatabaseService } from './services/DatabaseService';
import { logger } from './utils/logger';

const config = {
    bitcoin: {
        host: process.env.BITCOIN_RPC_HOST || 'localhost',
        port: parseInt(process.env.BITCOIN_RPC_PORT || '18443'),
        username: process.env.BITCOIN_RPC_USERNAME || 'nawab',
        password: process.env.BITCOIN_RPC_PASSWORD || 'nawab123',
        network: process.env.BITCOIN_NETWORK || 'regtest'
    }
};

async function cleanDatabase(): Promise<void> {
    logger.info('🧹 Cleaning database...');
    
    // Disable foreign key checks temporarily
    await AppDataSource.query('SET session_replication_role = replica');
    
    // Truncate all tables in the correct order
    const tables = [
        'transaction_inputs',
        'transaction_outputs', 
        'utxos',
        'addresses',
        'transactions',
        'blocks',
        'indexer_state'
    ];
    
    for (const table of tables) {
        try {
            logger.info(`Truncating table: ${table}`);
            await AppDataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
        } catch (error: any) {
            if (error.code === '42P01') {
                logger.debug(`Table ${table} does not exist, skipping`);
            } else {
                throw error;
            }
        }
    }
    
    // Re-enable foreign key checks
    await AppDataSource.query('SET session_replication_role = DEFAULT');
    
    logger.info('✅ Database cleaned successfully');
}

async function cleanSyncBlocks(): Promise<void> {
    let adapter: TypeORMIndexerAdapter | null = null;
    let apiServer: TypeORMApiServer | null = null;
    
    try {
        logger.info('🚀 Starting clean sync for blocks 900-914...');
        
        // Step 1: Initialize database
        await initializeDatabase();
        logger.info('✅ Database initialized');
        
        // Step 2: Clean the database
        await cleanDatabase();
        
        // Step 3: Initialize services
        const rpcClient = new BitcoinRpcClient(config.bitcoin);
        await rpcClient.ping();
        logger.info('✅ Bitcoin RPC connection verified');
        
        adapter = new TypeORMIndexerAdapter(new DatabaseService(), rpcClient);
        
        // Step 4: Start API server
        apiServer = new TypeORMApiServer(adapter);
        await apiServer.start();
        logger.info('✅ API server started on http://localhost:3001');
        
        // Step 5: Sync specific blocks (900-914)
        logger.info('📊 Starting sync for blocks 900-914...');
        await adapter.syncBlocks(900, 914);
        logger.info('✅ Blocks 900-914 synced successfully');
        
        // Step 6: Get final stats
        const stats = await adapter.getIndexerStats();
        logger.info('📈 Final stats:', stats);
        
        logger.info('🎉 Clean sync completed successfully!');
        logger.info('🔗 API available at http://localhost:3001');
        logger.info('📊 Check stats: curl http://localhost:3001/stats');
        
    } catch (error) {
        logger.error('💥 Clean sync failed:', error);
        throw error;
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the clean sync
cleanSyncBlocks()
    .then(() => {
        logger.info('✅ Clean sync process completed');
    })
    .catch((error) => {
        logger.error('❌ Clean sync process failed:', error);
        process.exit(1);
    }); 
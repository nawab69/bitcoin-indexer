import dotenv from 'dotenv';
import { BitcoinIndexer, IndexerConfig } from './services/indexer';
import { ApiServer } from './api/server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Configuration
const config: IndexerConfig = {
  rpc: {
    host: process.env.BITCOIN_RPC_HOST || 'localhost',
    port: parseInt(process.env.BITCOIN_RPC_PORT || '18443'),
    username: process.env.BITCOIN_RPC_USERNAME || 'nawab',
    password: process.env.BITCOIN_RPC_PASSWORD || 'nawab123',
    network: process.env.BITCOIN_NETWORK || 'regtest',
  },
  zmq: {
    rawBlockPort: parseInt(process.env.ZMQ_RAWBLOCK_PORT || '28332'),
    rawTxPort: parseInt(process.env.ZMQ_RAWTX_PORT || '28333'),
  },
  database: {
    path: process.env.DATABASE_PATH || './indexer.db',
  },
  batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100'),
  reorgProtectionBlocks: parseInt(process.env.REORG_PROTECTION_BLOCKS || '6'),
};

async function main() {
  try {
    logger.info('Starting Bitcoin Indexer...');
    logger.info('Configuration:', JSON.stringify(config, null, 2));

    // Create indexer instance
    const indexer = new BitcoinIndexer(config);

    // Create API server
    const apiServer = new ApiServer(
      indexer,
      parseInt(process.env.API_PORT || '3001'),
      process.env.API_HOST || 'localhost'
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

    // Register signal handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start the indexer
    await indexer.start();

    // Start the API server
    await apiServer.start();

    logger.info('Bitcoin Indexer is running successfully!');
    logger.info(`API server available at http://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '3001'}`);
    logger.info('Available endpoints:');
    logger.info('  GET /health - Health check');
    logger.info('  GET /stats - Indexer statistics');
    logger.info('  GET /address/:address - Get address information');
    logger.info('  GET /address/:address/transactions - Get address transactions');
    logger.info('  GET /address/:address/utxos - Get address UTXOs');
    logger.info('  GET /address/:address/balance - Get address balance');
    logger.info('  GET /transaction/:txid - Get transaction details');
    logger.info('  GET /block/:hashOrHeight - Get block details');
    logger.info('  GET /search/:query - Search for address, transaction, or block');

  } catch (error) {
    logger.error('Failed to start Bitcoin Indexer:', error);
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

// Start the application
if (require.main === module) {
  main().catch((error) => {
    logger.error('Application failed to start:', error);
    process.exit(1);
  });
} 
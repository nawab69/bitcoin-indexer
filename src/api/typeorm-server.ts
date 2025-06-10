import express from 'express';
import cors from 'cors';
import { TypeORMIndexerAdapter } from '../services/TypeORMIndexerAdapter';
import { logger } from '../utils/logger';

export class TypeORMApiServer {
    private app: express.Application;
    private indexer: TypeORMIndexerAdapter;
    private port: number;
    private host: string;
    private server: any;

    constructor(indexer: TypeORMIndexerAdapter, port: number = 3001, host: string = 'localhost') {
        this.app = express();
        this.indexer = indexer;
        this.port = port;
        this.host = host;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                service: 'bitcoin-indexer-typeorm'
            });
        });

        // Indexer stats
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = await this.indexer.getIndexerStats();
                res.json(stats);
            } catch (error) {
                logger.error('Error getting indexer stats:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Address endpoints
        this.app.get('/address/:address', async (req, res) => {
            try {
                const { address } = req.params;
                const addressInfo = await this.indexer.getAddressInfo(address);
                
                if (!addressInfo) {
                    return res.status(404).json({ error: 'Address not found' });
                }
                
                return res.json(addressInfo);
            } catch (error) {
                logger.error('Error getting address info:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/address/:address/transactions', async (req, res) => {
            try {
                const { address } = req.params;
                const limit = parseInt(req.query.limit as string) || 50;
                const offset = parseInt(req.query.offset as string) || 0;
                
                const transactions = await this.indexer.getAddressTransactions(address, limit, offset);
                res.json(transactions);
            } catch (error) {
                logger.error('Error getting address transactions:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/address/:address/utxos', async (req, res) => {
            try {
                const { address } = req.params;
                const utxos = await this.indexer.getAddressUTXOs(address);
                res.json(utxos);
            } catch (error) {
                logger.error('Error getting address UTXOs:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/address/:address/balance', async (req, res) => {
            try {
                const { address } = req.params;
                const addressInfo = await this.indexer.getAddressInfo(address);
                
                if (!addressInfo) {
                    return res.status(404).json({ error: 'Address not found' });
                }
                
                return res.json({
                    address,
                    balance: addressInfo.balance,
                    total_received: addressInfo.totalReceived,
                    total_sent: addressInfo.totalSent,
                    tx_count: addressInfo.receivedCount + addressInfo.sentCount
                });
            } catch (error) {
                logger.error('Error getting address balance:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Transaction endpoints
        this.app.get('/transaction/:txid', async (req, res) => {
            try {
                const { txid } = req.params;
                const transaction = await this.indexer.getTransaction(txid);
                
                if (!transaction) {
                    return res.status(404).json({ error: 'Transaction not found' });
                }
                
                return res.json(transaction);
            } catch (error) {
                logger.error('Error getting transaction:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Block endpoints
        this.app.get('/block/:hashOrHeight', async (req, res) => {
            try {
                const { hashOrHeight } = req.params;
                const isHeight = /^\d+$/.test(hashOrHeight);
                const identifier = isHeight ? parseInt(hashOrHeight) : hashOrHeight;
                
                const block = await this.indexer.getBlock(identifier);
                
                if (!block) {
                    return res.status(404).json({ error: 'Block not found' });
                }
                
                return res.json(block);
            } catch (error) {
                logger.error('Error getting block:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Search endpoint
        this.app.get('/search/:query', async (req, res) => {
            try {
                const { query } = req.params;
                
                // Try to determine what type of entity this is
                if (query.length === 64) {
                    // Likely a transaction hash or block hash
                    const transaction = await this.indexer.getTransaction(query);
                    if (transaction) {
                        return res.json({ type: 'transaction', data: transaction });
                    }
                    
                    const block = await this.indexer.getBlock(query);
                    if (block) {
                        return res.json({ type: 'block', data: block });
                    }
                } else if (/^\d+$/.test(query)) {
                    // Likely a block height
                    const blockHeight = parseInt(query);
                    const block = await this.indexer.getBlock(blockHeight);
                    if (block) {
                        return res.json({ type: 'block', data: block });
                    }
                } else {
                    // Likely an address
                    const addressInfo = await this.indexer.getAddressInfo(query);
                    if (addressInfo) {
                        return res.json({ type: 'address', data: addressInfo });
                    }
                }
                
                return res.status(404).json({ error: 'Not found' });
            } catch (error) {
                logger.error('Error searching:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Sync endpoint for manual block processing
        this.app.post('/sync/:fromHeight/:toHeight', async (req, res) => {
            try {
                const fromHeight = parseInt(req.params.fromHeight);
                const toHeight = parseInt(req.params.toHeight);
                
                if (isNaN(fromHeight) || isNaN(toHeight)) {
                    return res.status(400).json({ error: 'Invalid height parameters' });
                }
                
                if (toHeight - fromHeight > 100) {
                    return res.status(400).json({ error: 'Range too large, maximum 100 blocks per request' });
                }
                
                await this.indexer.syncBlocks(fromHeight, toHeight);
                
                return res.json({ 
                    message: `Successfully synced blocks ${fromHeight} to ${toHeight}`,
                    fromHeight,
                    toHeight,
                    blocksProcessed: toHeight - fromHeight + 1
                });
            } catch (error) {
                logger.error('Error syncing blocks:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Maintenance endpoint for database cleanup
        this.app.post('/maintenance', async (req, res) => {
            try {
                const action = req.query.action as string;
                
                if (action === 'cleanup') {
                    // Clean up duplicates
                    await this.indexer.getDatabaseService().cleanupDuplicates();
                    return res.json({ message: 'Duplicate cleanup completed successfully' });
                } else if (action === 'recalculate') {
                    // Recalculate address balances
                    await this.indexer.getDatabaseService().recalculateAddressBalances();
                    return res.json({ message: 'Address balance recalculation completed successfully' });
                } else if (action === 'full') {
                    // Full maintenance
                    await this.indexer.getDatabaseService().performMaintenance();
                    return res.json({ message: 'Full database maintenance completed successfully' });
                } else {
                    return res.status(400).json({ 
                        error: 'Invalid action. Use ?action=cleanup, ?action=recalculate, or ?action=full' 
                    });
                }
            } catch (error) {
                logger.error('Error during maintenance:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, this.host, () => {
                    logger.info(`TypeORM API server listening on http://${this.host}:${this.port}`);
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('TypeORM API server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getApp(): express.Application {
        return this.app;
    }
} 
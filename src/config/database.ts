import { DataSource } from 'typeorm';
import { Block } from '../entities/Block';
import { Transaction } from '../entities/Transaction';
import { TransactionInput } from '../entities/TransactionInput';
import { TransactionOutput } from '../entities/TransactionOutput';
import { Address } from '../entities/Address';
import { UTXO } from '../entities/UTXO';
import { IndexerState } from '../entities/IndexerState';

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'bitcoin_user',
    password: process.env.DB_PASSWORD || 'bitcoin_password',
    database: process.env.DB_NAME || 'bitcoin_indexer',
    synchronize: process.env.NODE_ENV !== 'production', // Auto sync in dev, use migrations in prod
    logging: process.env.NODE_ENV === 'development',
    entities: [
        Block,
        Transaction,
        TransactionInput,
        TransactionOutput,
        Address,
        UTXO,
        IndexerState
    ],
    migrations: [
        'src/migrations/*.ts'
    ],
    subscribers: [
        'src/subscribers/*.ts'
    ],
    extra: {
        // Connection pool settings
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    }
});

export const initializeDatabase = async (): Promise<void> => {
    try {
        await AppDataSource.initialize();
        console.log('✅ Database connection initialized successfully');
        
        if (process.env.NODE_ENV !== 'production') {
            // In development, ensure database schema is up to date
            await AppDataSource.synchronize();
            console.log('✅ Database schema synchronized');
        }
    } catch (error) {
        console.error('❌ Error during database initialization:', error);
        throw error;
    }
};

export const closeDatabase = async (): Promise<void> => {
    try {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            console.log('✅ Database connection closed successfully');
        }
    } catch (error) {
        console.error('❌ Error closing database connection:', error);
        throw error;
    }
}; 
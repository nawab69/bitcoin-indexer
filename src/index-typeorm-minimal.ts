import 'reflect-metadata';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './config/database';
import { DatabaseService } from './services/DatabaseService';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function testTypeORMSetup() {
    try {
        logger.info('🚀 Testing TypeORM setup...');

        // Initialize database connection
        await initializeDatabase();
        logger.info('✅ Database initialized successfully');

        // Test database service
        const dbService = new DatabaseService();
        
        // Get stats to test the service
        const stats = await dbService.getStats();
        logger.info('📊 Database stats:', stats);

        // Test state management
        await dbService.setState('test_key', 'test_value', 'Testing TypeORM setup');
        const testValue = await dbService.getState('test_key');
        logger.info('🔧 State test value:', testValue);

        logger.info('✅ TypeORM setup test completed successfully!');

    } catch (error) {
        logger.error('❌ TypeORM setup test failed:', error);
    } finally {
        // Close database connection
        await closeDatabase();
        logger.info('👋 Database connection closed');
    }
}

// Run the test
testTypeORMSetup().catch((error) => {
    logger.error('Failed to run TypeORM test:', error);
    process.exit(1);
}); 
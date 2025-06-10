import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from './schema';
import { logger } from '../utils/logger';

export class DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error(`Failed to connect to database: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Connected to SQLite database at ${this.dbPath}`);
          resolve();
        }
      });
    });
  }

  async initialize(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Enable foreign keys
    await this.run('PRAGMA foreign_keys = ON');
    
    // Set WAL mode for better concurrency
    await this.run('PRAGMA journal_mode = WAL');
    
    // Set synchronous mode
    await this.run('PRAGMA synchronous = NORMAL');

    // Create tables
    for (const sql of CREATE_TABLES_SQL) {
      await this.run(sql);
    }

    // Create indexes
    for (const sql of CREATE_INDEXES_SQL) {
      await this.run(sql);
    }

    logger.info('Database initialized successfully');
  }

  async run(sql: string, params?: any[]): Promise<sqlite3.RunResult> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params || [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this as sqlite3.RunResult);
        }
      });
    });
  }

  async get<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params || [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  async all<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params || [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          logger.error(`Failed to close database: ${err.message}`);
          reject(err);
        } else {
          logger.info('Database connection closed');
          this.db = null;
          resolve();
        }
      });
    });
  }

  getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }
} 
const BitcoinCore = require('bitcoin-core');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cors = require('cors');

// Configuration
const config = {
  bitcoin: {
    host: 'localhost',
    port: 18443,
    username: 'nawab',
    password: 'nawab123',
    network: 'regtest'
  },
  api: {
    port: 3001
  },
  db: {
    path: './indexer-demo.db'
  }
};

// Bitcoin RPC client
const bitcoin = new BitcoinCore(config.bitcoin);

// SQLite database
const db = new sqlite3.Database(config.db.path);

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const createTables = [
      `CREATE TABLE IF NOT EXISTS blocks (
        hash TEXT PRIMARY KEY,
        height INTEGER UNIQUE,
        timestamp INTEGER,
        tx_count INTEGER,
        size INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS transactions (
        txid TEXT PRIMARY KEY,
        block_hash TEXT,
        block_height INTEGER,
        value_out REAL,
        fee REAL
      )`,
      `CREATE TABLE IF NOT EXISTS addresses (
        address TEXT PRIMARY KEY,
        balance REAL DEFAULT 0,
        tx_count INTEGER DEFAULT 0
      )`
    ];

    let completed = 0;
    createTables.forEach(sql => {
      db.run(sql, (err) => {
        if (err) return reject(err);
        completed++;
        if (completed === createTables.length) resolve();
      });
    });
  });
}

// Index a block
async function indexBlock(height) {
  try {
    console.log(`Indexing block ${height}...`);
    
    const blockHash = await bitcoin.getBlockHash(height);
    const block = await bitcoin.getBlock(blockHash, 2);
    
    // Insert block
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO blocks (hash, height, timestamp, tx_count, size) VALUES (?, ?, ?, ?, ?)',
        [block.hash, block.height, block.time, block.tx.length, block.size],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    // Index transactions
    for (const tx of block.tx) {
      let totalOut = 0;
      
      // Calculate total output value
      if (tx.vout) {
        totalOut = tx.vout.reduce((sum, output) => sum + output.value, 0);
      }
      
      // Insert transaction
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO transactions (txid, block_hash, block_height, value_out) VALUES (?, ?, ?, ?)',
          [tx.txid, block.hash, block.height, totalOut],
          (err) => err ? reject(err) : resolve()
        );
      });
      
      // Index addresses from outputs
      if (tx.vout) {
        for (const output of tx.vout) {
          if (output.scriptPubKey && output.scriptPubKey.address) {
            const address = output.scriptPubKey.address;
            
            // Update address balance
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO addresses (address, balance, tx_count) VALUES (?, ?, 1)
                 ON CONFLICT(address) DO UPDATE SET 
                 balance = balance + ?,
                 tx_count = tx_count + 1`,
                [address, output.value, output.value],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
        }
      }
    }
    
    console.log(`✅ Block ${height} indexed with ${block.tx.length} transactions`);
    return block;
  } catch (error) {
    console.error(`❌ Error indexing block ${height}:`, error.message);
    throw error;
  }
}

// Get stats
function getStats() {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM blocks) as total_blocks,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        (SELECT COUNT(*) FROM addresses) as total_addresses,
        (SELECT SUM(balance) FROM addresses) as total_balance
    `, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Get address info
function getAddressInfo(address) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM addresses WHERE address = ?',
      [address],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Express API
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    const blockchainInfo = await bitcoin.getBlockchainInfo();
    res.json({
      ...stats,
      current_height: blockchainInfo.blocks,
      is_synced: stats.total_blocks >= blockchainInfo.blocks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Address endpoint
app.get('/address/:address', async (req, res) => {
  try {
    const addressInfo = await getAddressInfo(req.params.address);
    if (!addressInfo) {
      return res.status(404).json({ error: 'Address not found' });
    }
    res.json(addressInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync blocks
app.post('/sync/:fromHeight/:toHeight', async (req, res) => {
  try {
    const fromHeight = parseInt(req.params.fromHeight);
    const toHeight = parseInt(req.params.toHeight);
    
    console.log(`Starting sync from block ${fromHeight} to ${toHeight}`);
    
    for (let height = fromHeight; height <= toHeight; height++) {
      await indexBlock(height);
    }
    
    res.json({ 
      message: `Successfully synced blocks ${fromHeight} to ${toHeight}`,
      blocks_synced: toHeight - fromHeight + 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the application
async function start() {
  try {
    console.log('🚀 Starting Bitcoin Indexer Demo...');
    
    // Test Bitcoin connection
    console.log('📡 Testing Bitcoin Core connection...');
    const info = await bitcoin.getBlockchainInfo();
    console.log(`✅ Connected to Bitcoin Core (blocks: ${info.blocks})`);
    
    // Initialize database
    console.log('🗄️ Initializing database...');
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Start API server
    app.listen(config.api.port, () => {
      console.log(`🌐 API server running on http://localhost:${config.api.port}`);
      console.log('\n📚 Available endpoints:');
      console.log(`  GET  /health`);
      console.log(`  GET  /stats`);
      console.log(`  GET  /address/:address`);
      console.log(`  POST /sync/:fromHeight/:toHeight`);
      console.log('\n🔄 To start indexing, try:');
      console.log(`  curl -X POST http://localhost:${config.api.port}/sync/0/10`);
      console.log('\n📊 To check stats:');
      console.log(`  curl http://localhost:${config.api.port}/stats`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📴 Shutting down gracefully...');
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    else console.log('✅ Database closed');
    process.exit(0);
  });
});

// Start the demo
start(); 
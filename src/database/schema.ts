export const CREATE_TABLES_SQL = [
  // Blocks table
  `CREATE TABLE IF NOT EXISTS blocks (
    hash TEXT PRIMARY KEY,
    height INTEGER UNIQUE NOT NULL,
    version INTEGER NOT NULL,
    merkle_root TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    bits TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    difficulty REAL NOT NULL,
    chainwork TEXT NOT NULL,
    tx_count INTEGER NOT NULL,
    size INTEGER NOT NULL,
    weight INTEGER NOT NULL,
    previous_block_hash TEXT,
    next_block_hash TEXT,
    confirmations INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Transactions table
  `CREATE TABLE IF NOT EXISTS transactions (
    txid TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    version INTEGER NOT NULL,
    size INTEGER NOT NULL,
    vsize INTEGER NOT NULL,
    weight INTEGER NOT NULL,
    locktime INTEGER NOT NULL,
    block_hash TEXT,
    block_height INTEGER,
    block_time INTEGER,
    confirmations INTEGER NOT NULL DEFAULT 0,
    fee BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (block_hash) REFERENCES blocks(hash)
  )`,

  // Transaction inputs table
  `CREATE TABLE IF NOT EXISTS transaction_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txid TEXT NOT NULL,
    vout INTEGER NOT NULL,
    script_sig TEXT,
    sequence INTEGER NOT NULL,
    prev_txid TEXT,
    prev_vout INTEGER,
    prev_value BIGINT,
    prev_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (txid) REFERENCES transactions(txid),
    UNIQUE(txid, vout)
  )`,

  // Transaction outputs table
  `CREATE TABLE IF NOT EXISTS transaction_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txid TEXT NOT NULL,
    vout INTEGER NOT NULL,
    value BIGINT NOT NULL,
    script_pub_key TEXT NOT NULL,
    address TEXT,
    spent_txid TEXT,
    spent_vout INTEGER,
    is_spent BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (txid) REFERENCES transactions(txid),
    UNIQUE(txid, vout)
  )`,

  // Addresses table
  `CREATE TABLE IF NOT EXISTS addresses (
    address TEXT PRIMARY KEY,
    script_type TEXT,
    received_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    balance BIGINT DEFAULT 0,
    total_received BIGINT DEFAULT 0,
    total_sent BIGINT DEFAULT 0,
    first_seen_block INTEGER,
    last_seen_block INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Address transactions junction table
  `CREATE TABLE IF NOT EXISTS address_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    txid TEXT NOT NULL,
    block_height INTEGER,
    value_change BIGINT NOT NULL,
    is_input BOOLEAN NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (address) REFERENCES addresses(address),
    FOREIGN KEY (txid) REFERENCES transactions(txid),
    UNIQUE(address, txid, is_input)
  )`,

  // UTXO set table
  `CREATE TABLE IF NOT EXISTS utxos (
    txid TEXT NOT NULL,
    vout INTEGER NOT NULL,
    address TEXT NOT NULL,
    value BIGINT NOT NULL,
    script_pub_key TEXT NOT NULL,
    block_height INTEGER NOT NULL,
    is_coinbase BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (txid, vout),
    FOREIGN KEY (address) REFERENCES addresses(address),
    FOREIGN KEY (txid) REFERENCES transactions(txid)
  )`,

  // Indexer state table
  `CREATE TABLE IF NOT EXISTS indexer_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

export const CREATE_INDEXES_SQL = [
  // Block indexes
  'CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks(height)',
  'CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_blocks_previous_hash ON blocks(previous_block_hash)',

  // Transaction indexes
  'CREATE INDEX IF NOT EXISTS idx_transactions_block_hash ON transactions(block_hash)',
  'CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height)',
  'CREATE INDEX IF NOT EXISTS idx_transactions_block_time ON transactions(block_time)',

  // Transaction input indexes
  'CREATE INDEX IF NOT EXISTS idx_tx_inputs_txid ON transaction_inputs(txid)',
  'CREATE INDEX IF NOT EXISTS idx_tx_inputs_prev_txid ON transaction_inputs(prev_txid)',
  'CREATE INDEX IF NOT EXISTS idx_tx_inputs_prev_address ON transaction_inputs(prev_address)',

  // Transaction output indexes
  'CREATE INDEX IF NOT EXISTS idx_tx_outputs_txid ON transaction_outputs(txid)',
  'CREATE INDEX IF NOT EXISTS idx_tx_outputs_address ON transaction_outputs(address)',
  'CREATE INDEX IF NOT EXISTS idx_tx_outputs_spent ON transaction_outputs(is_spent)',
  'CREATE INDEX IF NOT EXISTS idx_tx_outputs_spent_txid ON transaction_outputs(spent_txid)',

  // Address indexes
  'CREATE INDEX IF NOT EXISTS idx_addresses_balance ON addresses(balance)',
  'CREATE INDEX IF NOT EXISTS idx_addresses_first_seen ON addresses(first_seen_block)',
  'CREATE INDEX IF NOT EXISTS idx_addresses_last_seen ON addresses(last_seen_block)',

  // Address transactions indexes
  'CREATE INDEX IF NOT EXISTS idx_address_txs_address ON address_transactions(address)',
  'CREATE INDEX IF NOT EXISTS idx_address_txs_txid ON address_transactions(txid)',
  'CREATE INDEX IF NOT EXISTS idx_address_txs_block_height ON address_transactions(block_height)',

  // UTXO indexes
  'CREATE INDEX IF NOT EXISTS idx_utxos_address ON utxos(address)',
  'CREATE INDEX IF NOT EXISTS idx_utxos_block_height ON utxos(block_height)',
  'CREATE INDEX IF NOT EXISTS idx_utxos_value ON utxos(value)'
]; 
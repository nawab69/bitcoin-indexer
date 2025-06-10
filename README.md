# Bitcoin Indexer

A comprehensive Bitcoin blockchain indexer that indexes all transactions, addresses, and balances in real-time. Built with TypeScript, SQLite, and designed to work with Bitcoin Core regtest.

## Features

- **Real-time Indexing**: Uses ZMQ to receive new blocks and transactions in real-time
- **Complete Data**: Indexes blocks, transactions, inputs, outputs, addresses, and UTXOs
- **REST API**: Query indexed data through a comprehensive REST API
- **Address Tracking**: Track address balances, transaction history, and UTXOs
- **Transaction Analysis**: Detailed transaction information with fee calculations
- **Block Explorer**: Browse blocks and their transactions
- **Search Functionality**: Search for addresses, transactions, or blocks
- **Reorg Protection**: Handles blockchain reorganizations gracefully

## Prerequisites

- Node.js 18+ and npm/yarn
- Bitcoin Core node running in regtest mode
- Docker and Docker Compose (for the Bitcoin node)

## Installation

1. **Install dependencies:**
   ```bash
   cd bitcoin-indexer
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Configuration

Create a `.env` file based on `env.example`:

```env
# Bitcoin RPC Configuration
BITCOIN_RPC_HOST=localhost
BITCOIN_RPC_PORT=18443
BITCOIN_RPC_USERNAME=nawab
BITCOIN_RPC_PASSWORD=nawab123
BITCOIN_NETWORK=regtest

# ZMQ Configuration
ZMQ_RAWBLOCK_PORT=28332
ZMQ_RAWTX_PORT=28333

# Database Configuration
DATABASE_PATH=./indexer.db

# API Server Configuration
API_PORT=3001
API_HOST=localhost

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/indexer.log

# Indexer Configuration
SYNC_BATCH_SIZE=100
REORG_PROTECTION_BLOCKS=6
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### With Docker
First, make sure your Bitcoin regtest node is running:
```bash
cd ..
docker-compose up -d bitcoin-regtest
```

Then start the indexer:
```bash
npm run dev
```

## API Endpoints

### Health Check
- `GET /health` - Check if the service is running

### Statistics
- `GET /stats` - Get indexer statistics and sync status

### Address Operations
- `GET /address/:address` - Get address information
- `GET /address/:address/transactions` - Get address transaction history
- `GET /address/:address/utxos` - Get address UTXOs
- `GET /address/:address/balance` - Get address balance summary

### Transaction Operations
- `GET /transaction/:txid` - Get transaction details

### Block Operations
- `GET /block/:hashOrHeight` - Get block details by hash or height

### Search
- `GET /search/:query` - Search for address, transaction, or block

## Database Schema

The indexer uses SQLite with the following main tables:

- `blocks` - Block information
- `transactions` - Transaction details
- `transaction_inputs` - Transaction inputs
- `transaction_outputs` - Transaction outputs
- `addresses` - Address summaries
- `address_transactions` - Address-transaction relationships
- `utxos` - Current UTXO set
- `indexer_state` - Indexer synchronization state

## Example Usage

### Get Address Information
```bash
curl http://localhost:3001/address/bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
```

### Get Transaction Details
```bash
curl http://localhost:3001/transaction/abc123...
```

### Get Block Information
```bash
curl http://localhost:3001/block/100
curl http://localhost:3001/block/00000000abc123...
```

### Search
```bash
curl http://localhost:3001/search/bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
```

## Development

### Project Structure
```
bitcoin-indexer/
├── src/
│   ├── api/           # REST API server
│   ├── database/      # Database schema and connection
│   ├── services/      # Core indexer services
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utility functions
│   └── index.ts       # Main entry point
├── dist/              # Compiled JavaScript
├── logs/              # Log files
└── indexer.db         # SQLite database
```

### Available Scripts
- `npm run build` - Build the TypeScript project
- `npm run dev` - Run in development mode with auto-reload
- `npm start` - Run the compiled application
- `npm test` - Run tests (if available)

## Monitoring

The indexer provides comprehensive logging and statistics:

- **Logs**: Written to `./logs/` directory
- **Statistics**: Available via `/stats` endpoint
- **Health Check**: Available via `/health` endpoint

## Performance Considerations

- **Batch Processing**: Configurable batch size for initial sync
- **Database Indexes**: Optimized indexes for common queries
- **WAL Mode**: SQLite uses WAL mode for better concurrency
- **Memory Usage**: Efficient memory usage with streaming processing

## Troubleshooting

### Common Issues

1. **Cannot connect to Bitcoin RPC**
   - Ensure Bitcoin Core is running
   - Check RPC credentials in `.env`
   - Verify Bitcoin Core RPC is enabled

2. **ZMQ connection issues**
   - Ensure ZMQ is enabled in Bitcoin Core
   - Check ZMQ port configuration
   - Verify firewall settings

3. **Database issues**
   - Check database file permissions
   - Ensure sufficient disk space
   - Check SQLite version compatibility

### Logs

Check the logs in the `./logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 
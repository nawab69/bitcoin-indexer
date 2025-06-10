#!/bin/bash

echo "Starting Bitcoin Indexer..."

# Check if Bitcoin node is running
echo "Checking Bitcoin Core connection..."
curl -s --user nawab:nawab123 --data-binary '{"jsonrpc":"1.0","id":"curltest","method":"getblockchaininfo","params":[]}' -H 'content-type: text/plain;' http://localhost:18443/ > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Bitcoin Core is running and accessible"
else
    echo "❌ Bitcoin Core is not accessible. Please start it first:"
    echo "   cd .. && docker-compose up -d bitcoin-regtest"
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp env.example .env
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the indexer in development mode
echo "Starting Bitcoin Indexer..."
echo "API will be available at: http://localhost:3001"
echo "Press Ctrl+C to stop"
echo ""

npm run dev 
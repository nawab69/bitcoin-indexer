#!/bin/bash

echo "🚀 Bitcoin Indexer - PostgreSQL Setup"
echo "======================================"
echo "ℹ️  Note: This setup assumes Bitcoin Core is already running from wallet-lib"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "📦 Starting PostgreSQL and Redis services..."
echo "ℹ️  Bitcoin node should be running separately from wallet-lib directory"
docker-compose up -d postgres redis

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Check if PostgreSQL is ready
until docker-compose exec postgres pg_isready -U bitcoin_user -d bitcoin_indexer; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp env.example .env
    echo "✅ Created .env file from env.example"
    echo "ℹ️  Please review and update .env file if needed"
fi

echo "📦 Installing dependencies..."
npm install

echo "🏗️  Building TypeScript..."
npm run build

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Available commands:"
echo "  npm run dev:typeorm     - Start development server with TypeORM"
echo "  npm run start:typeorm   - Start production server with TypeORM"
echo "  npm run docker:up       - Start all Docker services"
echo "  npm run docker:down     - Stop all Docker services"
echo "  npm run docker:logs     - View Docker logs"
echo ""
echo "📊 Database Connection Info:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: bitcoin_indexer"
echo "  Username: bitcoin_user"
echo "  Password: bitcoin_password"
echo ""
echo "🔗 Access URLs:"
echo "  API Server: http://localhost:3001 (when running indexer)"
echo "  PostgreSQL: postgresql://bitcoin_user:bitcoin_password@localhost:5432/bitcoin_indexer"
echo "  Redis: redis://localhost:6379"
echo "  Bitcoin RPC: http://localhost:18443 (external - from wallet-lib)"
echo ""
echo "⚠️  Prerequisites:"
echo "  Make sure Bitcoin Core is running from wallet-lib directory:"
echo "  cd /Users/nawab/Developer/library/wallet-lib && docker-compose up bitcoin-regtest"
echo ""

# Optionally start the indexer
read -p "Would you like to start the indexer now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting Bitcoin Indexer with TypeORM..."
    npm run dev:typeorm
fi 
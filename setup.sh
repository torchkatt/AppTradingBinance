#!/bin/bash

echo "🚀 Setting up Professional Trading System..."
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18.x first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be >= 18.x (current: $(node -v))"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check for PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "⚠️ PostgreSQL is not installed."
    echo "   Install it with: brew install postgresql@14"
    echo ""
    read -p "Continue without PostgreSQL? (Database features will be disabled) [y/N]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️ IMPORTANT: Edit .env file with your configuration:"
    echo "   - Set your exchange API credentials"
    echo "   - Configure risk parameters"
    echo "   - (Optional) Add Telegram bot credentials"
    echo ""
    echo "Run: nano .env"
else
    echo "✅ .env file already exists"
fi

# Create database if PostgreSQL is available
if command -v psql &> /dev/null; then
    echo ""
    read -p "Create database 'trading_system'? [Y/n]: " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        createdb trading_system 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ Database 'trading_system' created"
            
            # Run migrations
            echo "🔄 Running database migrations..."
            npm run db:migrate
            
            if [ $? -eq 0 ]; then
                echo "✅ Database schema initialized"
            else
                echo "⚠️ Migration failed, but you can run it later with: npm run db:migrate"
            fi
        else
            echo "ℹ️ Database 'trading_system' already exists"
        fi
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure your environment:"
echo "   $ nano .env"
echo ""
echo "2. IMPORTANT: Test with backtesting first (DO NOT skip this):"
echo "   $ npm run backtest -- --help"
echo ""
echo "3. Only after successful backtesting, start paper trading:"
echo "   $ npm run dev"
echo ""
echo "4. Read the documentation:"
echo "   $ cat README.md"
echo ""
echo "⚠️ REMEMBER: Never trade with real money until you've validated"
echo "   the system with at least 2 weeks of paper trading!"
echo ""

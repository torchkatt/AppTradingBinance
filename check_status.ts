
import { ExchangeConnector } from './src/core/ExchangeConnector.js';
import { config } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

async function checkStatus() {
    try {
        console.log('\n🔍 Checking Bot Status...\n');

        const exchange = new ExchangeConnector(
            config.EXCHANGE_NAME,
            config.EXCHANGE_API_KEY,
            config.EXCHANGE_API_SECRET,
            config.EXCHANGE_TESTNET
        );

        await exchange.initialize();

        // 1. Get Balance
        const balance = await exchange.getBalance();
        console.log(`💰 Balance Real: $${balance.total.toFixed(2)} USDT`);
        console.log(`💵 Capital Override: $${config.OVERRIDE_CAPITAL || 'N/A'}`);

        // 2. Get Positions
        const activeSymbols = config.SYMBOLS; // ['BTC/USDT', 'ETH/USDT', etc]
        console.log(`\n📊 Checking positions for: ${activeSymbols.join(', ')}`);

        let totalUnrealizedPnL = 0;
        let activePositionsCount = 0;

        // Fetch ALL positions once
        const positions = await exchange.getOpenPositions();

        for (const position of positions) {
            // Find if this position is in our active symbols list (optional, but good for filtering)
            if (activeSymbols.includes(position.symbol) && position.quantity > 0) { // Added position.quantity > 0 for robustness
                activePositionsCount++;
                // Calculate PnL if not provided directly (approximate or use what's available)
                // In our Position interface, we might not have 'unrealizedPnl' directly if it comes from common interface
                // But let's check what we get.

                // For Bybit specifically, let's try to get PnL if available in the raw data or if we can calculate it
                // The connectors getPositions usually maps to our Position interface

                // Let's assume we can get it or if not just show size/entry
                // If it's the custom Position interface from src/types/index.ts:
                /*
                export interface Position {
                    symbol: string;
                    side: 'long' | 'short';
                    entryPrice: number;
                    quantity: number;
                    timestamp: number;
                    stopLoss?: number;
                    takeProfit?: number;
                    unrealizedPnl?: number; // Add this if missing
                }
                */

                // Let's just print what we have
                console.log(`\n🟢 **${position.symbol}**`);
                const size = position.contracts || position.quantity; // Handle both potential field names
                console.log(`   Size: ${size} contracts`);
                console.log(`   Entry: $${position.entryPrice.toFixed(4)}`);
                console.log(`   Side: ${position.side}`);

                // If we have PnL in the object (it might be added by the connector)
                if ((position as any).unrealizedPnl !== undefined) {
                    console.log(`   PnL: $${(position as any).unrealizedPnl.toFixed(4)}`);
                    totalUnrealizedPnL += (position as any).unrealizedPnl;
                }
            }
        }

        console.log('\n════════════════════════════════');
        console.log(`🔢 Active Positions: ${activePositionsCount}/${activeSymbols.length}`);
        console.log(`📈 Total Unrealized PnL: $${totalUnrealizedPnL.toFixed(4)}`);
        console.log('════════════════════════════════\n');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error checking status:', error.message);
        process.exit(1);
    }
}

checkStatus();

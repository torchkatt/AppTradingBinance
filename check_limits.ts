/**
 * Script para diagnosticar límites de orden en Bybit Demo
 */
import { ExchangeConnector } from './src/core/ExchangeConnector.js';
import { config } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

async function checkOrderLimits() {
    try {
        const exchange = new ExchangeConnector(
            config.EXCHANGE_NAME,
            config.EXCHANGE_API_KEY,
            config.EXCHANGE_API_SECRET,
            config.EXCHANGE_TESTNET
        );

        await exchange.initialize();

        console.log('\n=== BYBIT DEMO ORDER LIMITS ===\n');

        // First,show ALL loaded symbols
        const allSymbols = Array.from(exchange['marketInfo' as any].keys());
        console.log(`Total symbols loaded: ${allSymbols.length}`);
        console.log(`First 10 symbols: ${allSymbols.slice(0, 10).join(', ')}\n`);

        const symbols = ['SOLUSDT', 'AVAXUSDT', 'XRPUSDT', 'BTCUSDT', 'ETHUSDT', 'DOGEUSDT',
            'SOL/USDT', 'AVAX/USDT', 'XRP/USDT', 'BTC/USDT', 'ETH/USDT', 'DOGE/USDT'];

        for (const symbol of symbols) {
            const limits = exchange.getMarketLimits(symbol);

            console.log(`${symbol}:`);
            console.log(`  Found: ${limits ? 'YES' : 'NO'}`);
            if (limits) {
                console.log(`  Min Qty: ${limits.minQty}`);
                console.log(`  Step Size: ${limits.stepSize}`);
                console.log(`  Min Notional: ${limits.minNotional || 'N/A'}`);
            }
            console.log('');
        }

        // Intentar crear una orden pequeña de prueba
        console.log('\n=== TESTING SMALL ORDER ===\n');

        try {
            const testOrder = await exchange.getExchange().createOrder(
                'SOL/USDT',
                'market',
                'buy',
                10, // 10 SOL
                undefined,
                { reduceOnly: false }
            );
            console.log('✅ Order created:', testOrder.id);
        } catch (error: any) {
            console.log('❌ Order failed:', error.message);
        }

        process.exit(0);

    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to check limits');
        process.exit(1);
    }
}

checkOrderLimits();

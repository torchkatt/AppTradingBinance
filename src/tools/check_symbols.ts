
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { tradeLogger as logger } from '../utils/logger.js';

// Mock logger
logger.info = () => { };
logger.error = () => { };

async function checkSymbols() {
    const exchange = new ExchangeConnector();
    console.log('Verifying symbols access on Binance Futures...');

    // Symbols to check
    const symbols = ['XAU/USDT', 'XAG/USDT', 'TSLA/USDT'];

    for (const symbol of symbols) {
        try {
            // Fetch just 1 candle to test access
            const candles = await exchange.fetchOHLCV(symbol, '5m', undefined, 1);
            if (candles && candles.length > 0) {
                const c = candles[0];
                console.log(`✅ ${symbol}: SUCCESS | Price: ${c.close} | Vol: ${c.volume}`);
            } else {
                console.log(`❌ ${symbol}: No data returned`);
            }
        } catch (error: any) {
            console.log(`❌ ${symbol}: FAILED - ${error.message}`);
        }
    }
}

checkSymbols();

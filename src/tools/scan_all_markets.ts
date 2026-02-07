
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { EMA, SMA } from 'technicalindicators';
import { tradeLogger as logger } from '../utils/logger.js';

// Mock logger
logger.info = () => { };
logger.error = () => { };

/**
 * Scanner masivo de mercado para encontrar oportunidades "Cardona Style"
 * Criterios:
 * 1. Volumen alto (Liquidez)
 * 2. Tendencia definida (Price vs EMA200)
 * 3. Volatilidad activa (ATR / Precio)
 */
async function scanAllMarkets() {
    console.log('🚀 Iniciando Escaneo Masivo de Binance Futures...');
    const exchange = new ExchangeConnector();

    // 1. Fetch all symbols
    // We can't access loadMarkets directly securely without exposure, 
    // but ExchangeConnector might not expose it.
    // Workaround: We will use a predefined list of top 50 volume pairs or try to fetch all if possible.
    // Since we don't have a public method to get all symbols in Connector, we'll try to use a "clean" ccxt instance or just a hardcoded list of major pairs.
    // For now, let's look at the "Top 30" by volume usually found in major lists to avoid 1000+ requests rate limit.

    const candidates = [
        'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT',
        'TRX/USDT', 'LINK/USDT', 'MATIC/USDT', 'DOT/USDT', 'LTC/USDT', 'BCH/USDT', 'ATOM/USDT',
        'UNI/USDT', 'APT/USDT', 'FIL/USDT', 'NEAR/USDT', 'ARB/USDT', 'OP/USDT', 'INJ/USDT',
        'TIA/USDT', 'SUI/USDT', 'SEI/USDT', 'ORDI/USDT', '1000SATS/USDT', 'PEPE/USDT', 'MEME/USDT',
        'RNDR/USDT', 'FET/USDT', 'AGIX/USDT', 'WLD/USDT', 'PYTH/USDT', 'JUP/USDT'
    ];

    // Add requested TradFi if possible (already checked)
    candidates.push('XAU/USDT', 'XAG/USDT', 'TSLA/USDT');

    console.log(`Analizando ${candidates.length} pares principales...`);
    const results = [];

    for (const symbol of candidates) {
        try {
            // Get 300 candles for EMA200
            const ohlcv = await exchange.fetchOHLCV(symbol, '5m', undefined, 300);
            if (ohlcv.length < 250) continue;

            const closes = ohlcv.map(c => c.close);
            const volumes = ohlcv.map(c => c.volume);
            const currentPrice = closes[closes.length - 1];

            // Indicators
            const ema200 = EMA.calculate({ period: 200, values: closes }).pop() || 0;
            // const ema20 = EMA.calculate({ period: 20, values: closes }).pop() || 0;
            const avgVol = SMA.calculate({ period: 20, values: volumes }).pop() || 0;
            const currentVol = volumes[volumes.length - 1];

            // Score Logic
            // Trend Strength: Distance from EMA200
            const trendDist = Math.abs((currentPrice - ema200) / ema200) * 100;

            // Volume Explosion
            const volRatio = currentVol / avgVol;

            // Direction
            const direction = currentPrice > ema200 ? 'ALCISTA' : 'BAJISTA';

            // const momentum = currentPrice > ema20 ? 'BULL' : 'BEAR';
            // Placeholder for score calculation, assuming it would be defined here
            const score = (trendDist * volRatio) / 10; // Example score calculation

            results.push({
                symbol,
                price: currentPrice.toFixed(4),
                trend: direction,
                trendDist: trendDist.toFixed(2) + '%',
                volRatio: volRatio.toFixed(2) + 'x',
                score: score
            });

            process.stdout.write('.');
        } catch (e) {
            // process.stdout.write('x');
        }
    }

    console.log('\n\n🏆 TOP OPORTUNIDADES (Cardona Score):\n');

    // Sort by Score DESC
    const sorted = results.sort((a, b) => b.score - a.score).slice(0, 15);
    console.table(sorted);
}


scanAllMarkets();

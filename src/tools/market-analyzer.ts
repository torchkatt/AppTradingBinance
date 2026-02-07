import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { TrendMomentumStrategy } from '../strategies/TrendMomentumStrategy.js';
import { config } from '../config/index.js';
// import { tradeLogger as logger } from '../utils/logger.js';

async function analyzeCurrentMarket() {
    console.log('\n🔍 --- ANÁLISIS DE TENDENCIAS (CARDONA STYLE) ---');
    console.log(`Timeframe: ${config.TIMEFRAME} | Symbols: ${config.SYMBOLS.length}\n`);

    const exchange = new ExchangeConnector();
    const strategy = new TrendMomentumStrategy(); // Usamos la nueva estrategia

    const results = [];

    for (const symbol of config.SYMBOLS) {
        try {
            const ohlcv = await exchange.fetchOHLCV(symbol, config.TIMEFRAME, undefined, 300); // Más data para EMA200
            const signal = await strategy.analyze(ohlcv);

            const closes = ohlcv.map(c => c.close);
            const volumes = ohlcv.map(c => c.volume);

            // Recalcular indicadores para mostrar info (La estrategia ya los calculó internamente)
            const ema20 = (strategy as any).getEMA(closes, 20).pop();
            const ema200 = (strategy as any).getEMA(closes, 200).pop();
            const currentPrice = closes[closes.length - 1];
            const currentVol = volumes[volumes.length - 1];
            const avgVol = (strategy as any).getSMA(volumes, 20).pop();

            const trend = currentPrice > ema200 ? 'ALCISTA 🟢' : 'BAJISTA 🔴';
            const momentum = currentPrice > ema20 ? 'BULL' : 'BEAR';
            const volStatus = currentVol > (avgVol * 1.2) ? 'ALTO 🔥' : 'NORMAL';

            results.push({
                symbol,
                price: currentPrice.toFixed(4),
                trend,
                momentum,
                vol: volStatus,
                signal: signal ? signal.type.toUpperCase() : 'ESPERANDO'
            });

        } catch (err: any) {
            console.error(`❌ Error analizando ${symbol}: ${err.message}`);
        }
    }

    console.table(results);
    console.log('\n💡 ESTADO DEL SURFISTA:');
    console.log('El bot está buscando "Rompus de Squeeze" a favor de la tendencia (EMA200).');
}

analyzeCurrentMarket();

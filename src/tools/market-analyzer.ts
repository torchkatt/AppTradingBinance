import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy.js';
import { config } from '../config/index.js';
import { tradeLogger as logger } from '../utils/logger.js';

async function analyzeCurrentMarket() {
    console.log('\n🔍 --- ANÁLISIS DE MERCADO EN TIEMPO REAL ---');
    console.log(`Timeframe: ${config.TIMEFRAME} | Symbols: ${config.SYMBOLS.length}\n`);

    const exchange = new ExchangeConnector();
    const strategy = new MeanReversionStrategy();

    // Configuración para simular el bot
    const results = [];

    for (const symbol of config.SYMBOLS) {
        try {
            const ohlcv = await exchange.fetchOHLCV(symbol, config.TIMEFRAME, undefined, 200);
            const signal = await strategy.analyze(ohlcv);

            // Extraer métricas (necesitamos acceder a las métricas internas de la estrategia)
            // Para este script, usaremos un truco: la estrategia MeanReversion guarda los últimos valores si la modificamos, 
            // pero como no queremos tocarla, sacaremos los datos manualmente aquí.

            const closes = ohlcv.map(c => c.close);
            const rsi = (strategy as any).getRSI(closes, 14).pop();
            const bb = (strategy as any).getBollingerBands(closes, 20, 2).pop();
            const ema200 = (strategy as any).getEMA(closes, 200).pop() || 0;
            const currentPrice = closes[closes.length - 1];

            const percentB = bb ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : 0;
            const trend = currentPrice > ema200 ? 'ALCISTA 🟢' : 'BAJISTA 🔴';

            results.push({
                symbol,
                price: currentPrice.toFixed(4),
                rsi: rsi?.toFixed(2),
                percentB: percentB.toFixed(3),
                trend,
                signal: signal ? signal.type.toUpperCase() : 'ESPERANDO'
            });

        } catch (err: any) {
            console.error(`❌ Error analizando ${symbol}: ${err.message}`);
        }
    }

    console.table(results);

    // Recomendación general
    const oversold = results.filter(r => parseFloat(r.rsi || '50') < 35).length;
    const overbought = results.filter(r => parseFloat(r.rsi || '50') > 65).length;

    console.log('\n💡 RESUMEN ESTRATÉGICO:');
    if (oversold > 0) {
        console.log(`✅ Hay ${oversold} monedas cerca de SOBREVENTA. Buen momento para Mean Reversion LONG.`);
    } else if (overbought > 0) {
        console.log(`✅ Hay ${overbought} monedas cerca de SOBRECOMPRA. Buen momento para Mean Reversion SHORT.`);
    } else {
        console.log('⚖️ El mercado está en equilibrio. Paciencia, no hay señales claras de reversión ahora.');
    }
}

analyzeCurrentMarket();

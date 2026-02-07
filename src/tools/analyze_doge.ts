
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { EMA, BollingerBands, SMA } from 'technicalindicators';
import { tradeLogger as logger } from '../utils/logger.js';

// Mock logger
logger.info = () => { };
logger.error = () => { };

async function analyzeDoge() {
    console.log('🐕 --- ANÁLISIS PROFUNDO DE DOGE/USDT ---');
    const exchange = new ExchangeConnector();
    const symbol = 'DOGE/USDT';

    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, '5m', undefined, 300);
        const closes = ohlcv.map(c => c.close);
        const volumes = ohlcv.map(c => c.volume);
        const latest = ohlcv[ohlcv.length - 1];

        // 1. Trend Analysis
        const ema200 = EMA.calculate({ period: 200, values: closes }).pop() || 0;
        // const ema20 = EMA.calculate({ period: 20, values: closes }).pop() || 0;
        const trend = latest.close < ema200 ? 'BAJISTA (Bearish)' : 'ALCISTA (Bullish)';
        const distEma200 = ((latest.close - ema200) / ema200) * 100;

        // 2. Volatility (Squeeze?)
        const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
        const lastBB = bb[bb.length - 1];
        const bandwidth = (lastBB.upper - lastBB.lower) / lastBB.middle;
        const avgBandwidth = bb.slice(-50).reduce((a, b) => a + (b.upper - b.lower) / b.middle, 0) / 50;

        const isSqueeze = bandwidth < (avgBandwidth * 0.8); // 20% tighter than usual

        // 3. Volume
        const avgVol = SMA.calculate({ period: 20, values: volumes }).pop() || 0;
        const volRatio = latest.volume / avgVol;

        console.log(`\n📊 DATOS TÉCNICOS:`);
        console.log(`Precio: ${latest.close}`);
        console.log(`Tendencia: ${trend} (Distancia EMA200: ${distEma200.toFixed(2)}%)`);
        console.log(`Bandwidth (Volatilidad): ${(bandwidth * 100).toFixed(2)}% (Promedio: ${(avgBandwidth * 100).toFixed(2)}%)`);
        console.log(`Squeeze Status: ${isSqueeze ? '✅ SI (Comprimido/Cargando energía)' : '❌ NO (Expandido)'}`);
        console.log(`Volumen: ${volRatio.toFixed(2)}x (vs Promedio)`);

        console.log(`\n🧠 DIAGNÓSTICO:`);
        if (Math.abs(distEma200) < 0.5) {
            console.log("⚠️ ZONA MUERTA: Pegado a la EMA200 (Ruido sin dirección).");
        } else if (isSqueeze) {
            console.log("💣 BOMBA DE TIEMPO: Se está comprimiendo. ¡Gran movimiento inminente!");
        } else if (volRatio > 1.5) {
            console.log("🔥 EN LLAMAS: Mucho volumen, el movimiento ya empezó.");
        } else {
            console.log("💤 DORMIDO: Movimiento normal sin señales extremas. Puede ser aburrido.");
        }

    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}

analyzeDoge();

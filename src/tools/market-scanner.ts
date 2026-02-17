
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { TrendMomentumStrategy } from '../strategies/TrendMomentumStrategy.js';
import { config } from '../config/index.js';

async function analyzeMarket() {
    console.log('\n🔍 ANALIZANDO MERCADO CON ESTRATEGIA ACTUAL... (Trend Momentum)\n');
    console.log(`CONFIGURACIÓN:`);
    console.log(`- Timeframe: ${config.TIMEFRAME}`);
    console.log(`- Símbolos: ${config.SYMBOLS.join(', ')}`);
    console.log(`- ADX Umbral: 20 (Ajustado)`);
    console.log(`- Volumen Min: +15% vs Promedio (Ajustado)`);
    console.log('---------------------------------------------------\n');

    const exchange = new ExchangeConnector();
    await exchange.initialize(true); // Solo público

    const strategy = new TrendMomentumStrategy();

    for (const symbol of config.SYMBOLS) {
        console.log(`📊 Analizando ${symbol}...`);
        try {
            // Descargar 250 velas para tener suficiente historial para EMA200
            const ohlcv = await exchange.fetchOHLCV(symbol, config.TIMEFRAME, undefined, 250);

            if (ohlcv.length < 200) {
                console.log(`❌ No hay suficientes datos para ${symbol}`);
                continue;
            }

            const signal = await strategy.analyze(ohlcv);
            const lastCandle = ohlcv[ohlcv.length - 1];

            // Hack para obtener indicadores internos (simulando lo que hace la estrategia)
            // Esto es solo para mostrar data al usuario
            const closes = ohlcv.map(d => d.close);
            const { EMA, ADX, RSI } = await import('technicalindicators');

            const ema20 = EMA.calculate({ period: 20, values: closes }).pop();
            const ema200 = EMA.calculate({ period: 200, values: closes }).pop();
            const rsi = RSI.calculate({ period: 14, values: closes }).pop();
            const adxData = ADX.calculate({
                high: ohlcv.map(d => d.high),
                low: ohlcv.map(d => d.low),
                close: closes,
                period: 14
            }).pop();

            console.log(`   Precio: $${lastCandle.close}`);

            if (ema20 !== undefined && ema200 !== undefined) {
                console.log(`   Tendencia: ${ema20 > ema200 ? '🟢 ALCISTA (EMA20 > EMA200)' : '🔴 BAJISTA (EMA20 < EMA200)'}`);
            } else {
                console.log('   Tendencia: Datos insuficientes para EMA');
            }

            if (adxData) {
                console.log(`   Fuerza (ADX): ${adxData.adx.toFixed(2)} ${adxData.adx > 20 ? '✅ FUERTE' : '⚠️ DÉBIL'}`);
            } else {
                console.log('   Fuerza (ADX): Datos insuficientes');
            }

            if (rsi !== undefined) {
                console.log(`   RSI: ${rsi.toFixed(2)}`);
            } else {
                console.log('   RSI: Datos insuficientes');
            }

            if (signal) {
                console.log(`\n   🎯 SEÑAL DETECTADA: ${signal.type.toUpperCase()} 🚀`);
                console.log(`   Confianza: ${signal.confidence * 100}%`);
                console.log(`   Stop Loss: ${signal.stopLoss}`);
                console.log(`   Take Profit: ${signal.takeProfit}`);
            } else {
                console.log(`\n   💤 Sin señal de entrada en este momento.`);
                // Explicar por qué
                if (adxData && adxData.adx <= 20) console.log(`      Razón: ADX bajo (${adxData.adx.toFixed(2)} <= 20)`);
                else if (rsi !== undefined && rsi > 70) console.log(`      Razón: RSI Sobrecompra (${rsi.toFixed(2)})`);
                else if (rsi !== undefined && rsi < 30) console.log(`      Razón: RSI Sobreventa (${rsi.toFixed(2)})`);
                else console.log(`      Razón: Esperando configuración técnica (Cruce/Volumen/Estructura)`);
            }
            console.log('\n---------------------------------------------------');

        } catch (error: any) {
            console.error(`Error analizando ${symbol}:`, error.message);
        }
    }
}

analyzeMarket().catch(console.error);

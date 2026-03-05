import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, SMA, ATR, RSI, ADX } from 'technicalindicators';

export class TrendMomentumStrategy extends Strategy {
    name = 'Trend Momentum';
    description = 'Estrategia de seguimiento de tendencia con stops dinámicos ATR (Cardona Style v2.3)';

    constructor(
        private fastEmaPeriod: number = 20,
        private midEmaPeriod: number = 50,   // EMA50: filtro de tendencia media
        private slowEmaPeriod: number = 200,
        private volMultiplier: number = 1.30, // Requiere 30% sobre el promedio
        private aggressiveMode: boolean = false,
        private atrPeriod: number = 14,
        private atrMultiplier: number = 2.5,  // Stop Loss = 2.5x ATR
        private trendLookback: number = 5,    // [v2.2] 3→5 barras de confirmación
        private rsiPeriod: number = 14,
        private rsiOverbought: number = 70,
        private rsiOversold: number = 30,
        private adxPeriod: number = 14,
        private adxThreshold: number = 25     // [v2.2] 20→25: solo tendencias fuertes
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        // Necesitamos al menos 200 velas para EMA200 + ATR + buffer
        if (data.length < Math.max(this.slowEmaPeriod, this.atrPeriod) + 15) return null;

        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const volumes = data.map(d => d.volume);

        // [AUDIT FIX] Usar velas CERRADAS para evitar repainting
        const signalBar = data[data.length - 2]; // Última vela cerrada
        const prevBar = data[data.length - 3];

        // 1. Calcular Indicadores
        const ema20 = EMA.calculate({ period: this.fastEmaPeriod, values: closes });
        const ema50 = EMA.calculate({ period: this.midEmaPeriod, values: closes });
        const ema200 = EMA.calculate({ period: this.slowEmaPeriod, values: closes });
        const avgVolume = SMA.calculate({ period: 20, values: volumes });

        // ATR para stops dinámicos
        const atr = ATR.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: this.atrPeriod
        });

        // Índices correspondientes a la signalBar (vela cerrada)
        const idx = ema20.length - 2;

        const valEma20  = ema20[idx];
        const valEma50  = ema50[ema50.length - 2];
        const valEma200 = ema200[ema200.length - 2];
        const valAvgVol = avgVolume[avgVolume.length - 2];
        const currentATR = atr[atr.length - 2];

        const rsiValues = RSI.calculate({ period: this.rsiPeriod, values: closes });
        const currentRSI = rsiValues[rsiValues.length - 2];

        // 1.1 Calcular ADX (Fuerza de Tendencia)
        const adxValues = ADX.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: this.adxPeriod
        });
        const currentADX = adxValues[adxValues.length - 2];

        // 1.2 [v2.2] Slope de EMA200 — confirma que la tendencia lenta va en la dirección correcta
        // Comparamos EMA200 actual vs 10 barras atrás
        const ema200SlopeLookback = 10;
        const valEma200Prev = ema200[ema200.length - 2 - ema200SlopeLookback];
        const isEma200Rising = valEma200 > valEma200Prev; // Alcista
        const isEma200Falling = valEma200 < valEma200Prev; // Bajista

        // 2. Determinar Estabilidad de Tendencia (Trend Stability)
        // [v2.2] trendLookback aumentado de 3 a 5 barras
        let isTrendStable = true;
        for (let i = 0; i < this.trendLookback; i++) {
            const hIdx = ema20.length - 2 - i;
            if (hIdx < 0 || hIdx >= ema200.length) continue;

            const pastEma20  = ema20[hIdx];
            const pastEma200 = ema200[ema200.length - 2 - i];

            if (valEma20 > valEma200 && pastEma20 <= pastEma200) isTrendStable = false;
            if (valEma20 < valEma200 && pastEma20 >= pastEma200) isTrendStable = false;
        }

        const isBullishTrend = valEma20 > valEma200;
        const isBearishTrend = valEma20 < valEma200;

        // Filtro RSI
        const isRsiOverbought = currentRSI > this.rsiOverbought;
        const isRsiOversold   = currentRSI < this.rsiOversold;

        // Stops dinámicos basados en ATR
        const atrStopDistance = currentATR * this.atrMultiplier;

        // LONG SIGNAL
        // [v2.2] Añadido: isEma200Rising — EMA200 debe estar subiendo para longs
        if (isBullishTrend &&
            isTrendStable &&
            isEma200Rising &&
            signalBar.close > valEma50 &&
            currentADX.adx > this.adxThreshold &&
            !isRsiOverbought &&
            signalBar.close > valEma20 &&
            (prevBar.close <= valEma20 || (this.aggressiveMode && signalBar.close > signalBar.open)) &&
            signalBar.volume > (valAvgVol * this.volMultiplier)
        ) {
            const rawStopLoss  = signalBar.low - atrStopDistance;
            const maxStopDist  = signalBar.close * 0.02;
            const safeStopLoss = Math.max(rawStopLoss, signalBar.close - maxStopDist);

            // [v2.3] TP = SL real × 3 → R:R 1:3 (EV positivo con WR ~30%)
            const actualSlDist = signalBar.close - safeStopLoss;
            const takeProfit   = signalBar.close + (actualSlDist * 3);

            return {
                type: 'long',
                confidence: this.aggressiveMode ? 0.6 : 0.85,
                stopLoss: safeStopLoss,
                takeProfit,
                metadata: {
                    reason: this.aggressiveMode
                        ? 'Trend Re-Entry (Stable)'
                        : 'Bullish Breakout (Stable + ADX25 + EMA50 + EMA200↑)',
                    ema20: valEma20,
                    ema50: valEma50,
                    ema200: valEma200,
                    atr: currentATR,
                    rsi: currentRSI,
                    adx: currentADX.adx,
                    rrRatio: '1:3',
                    slPercent: (actualSlDist / signalBar.close * 100).toFixed(2) + '%'
                }
            };
        }

        // SHORT SIGNAL
        // [v2.2] Añadido: isEma200Falling — EMA200 debe estar bajando para shorts
        if (isBearishTrend &&
            isTrendStable &&
            isEma200Falling &&
            signalBar.close < valEma50 &&
            currentADX.adx > this.adxThreshold &&
            !isRsiOversold &&
            signalBar.close < valEma20 &&
            (prevBar.close >= valEma20 || (this.aggressiveMode && signalBar.close < signalBar.open)) &&
            signalBar.volume > (valAvgVol * this.volMultiplier)
        ) {
            const rawStopLoss  = signalBar.high + atrStopDistance;
            const maxStopDist  = signalBar.close * 0.02;
            const safeStopLoss = Math.min(rawStopLoss, signalBar.close + maxStopDist);

            // [v2.3] TP = SL real × 3 → R:R 1:3 (EV positivo con WR ~30%)
            const actualSlDist = safeStopLoss - signalBar.close;
            const takeProfit   = signalBar.close - (actualSlDist * 3);

            return {
                type: 'short',
                confidence: this.aggressiveMode ? 0.6 : 0.85,
                stopLoss: safeStopLoss,
                takeProfit,
                metadata: {
                    reason: this.aggressiveMode
                        ? 'Trend Push (Stable)'
                        : 'Bearish Breakout (Stable + ADX25 + EMA50 + EMA200↓)',
                    ema20: valEma20,
                    ema50: valEma50,
                    ema200: valEma200,
                    atr: currentATR,
                    rsi: currentRSI,
                    adx: currentADX.adx,
                    rrRatio: '1:3',
                    slPercent: (actualSlDist / signalBar.close * 100).toFixed(2) + '%'
                }
            };
        }

        return null;
    }

    // Base class getBollingerBands is used now
}

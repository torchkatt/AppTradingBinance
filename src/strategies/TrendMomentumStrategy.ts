/**
 * TrendMomentumStrategy v3.0
 *
 * Mejoras sobre v2.3:
 * - [v3.0] Multi-Timeframe (MTF): confirmación en 20-min (agrupando 4 velas de 5m)
 * - [v3.0] Filtro de sesión: solo 07:00-21:00 UTC (Londres + Nueva York)
 * - [v3.0] ADX threshold subido a 28 (de 25) → señales de mayor calidad
 * - [v3.0] EMA200 slope lookback extendido a 15 barras (de 10) → tendencia más confirmada
 * - [v3.0] R:R mantenido en 1:3 pero con mejor selección de entradas
 */

import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, SMA, ATR, RSI, ADX } from 'technicalindicators';

export class TrendMomentumStrategy extends Strategy {
    name = 'Trend Momentum v3.0';
    description = 'Seguimiento de tendencia con MTF + filtro de sesión + ADX 28 (v3.0)';

    constructor(
        private readonly fastEmaPeriod: number   = 20,
        private readonly midEmaPeriod: number    = 50,
        private readonly slowEmaPeriod: number   = 200,
        private readonly volMultiplier: number   = 1.30,
        private readonly atrPeriod: number       = 14,
        private readonly atrMultiplier: number   = 2.5,
        private readonly trendLookback: number   = 5,
        private readonly rsiPeriod: number       = 14,
        private readonly rsiOverbought: number   = 70,
        private readonly rsiOversold: number     = 30,
        private readonly adxPeriod: number       = 14,
        private readonly adxThreshold: number    = 28,    // [v3.0] 25→28
        private readonly ema200SlopeLookback: number = 15 // [v3.0] 10→15
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        if (data.length < this.slowEmaPeriod + 20) return null;

        // ── [v3.0] Filtro de Sesión ──────────────────────────────────────
        // Usa el timestamp de la vela para ser compatible con backtesting
        const lastCandle = data[data.length - 2];
        const candleDate = new Date(lastCandle.timestamp);
        const hourUTC = candleDate.getUTCHours();
        if (hourUTC < 7 || hourUTC >= 21) return null;

        const closes  = data.map(d => d.close);
        const highs   = data.map(d => d.high);
        const lows    = data.map(d => d.low);
        const volumes = data.map(d => d.volume);

        // Usar vela CERRADA para evitar repainting
        const signalBar = data[data.length - 2];
        const prevBar   = data[data.length - 3];

        // ── Indicadores base ─────────────────────────────────────────────
        const ema20  = EMA.calculate({ period: this.fastEmaPeriod, values: closes });
        const ema50  = EMA.calculate({ period: this.midEmaPeriod,  values: closes });
        const ema200 = EMA.calculate({ period: this.slowEmaPeriod, values: closes });
        const avgVol = SMA.calculate({ period: 20, values: volumes });
        const atr    = ATR.calculate({ high: highs, low: lows, close: closes, period: this.atrPeriod });

        const valEma20  = ema20[ema20.length - 2];
        const valEma50  = ema50[ema50.length - 2];
        const valEma200 = ema200[ema200.length - 2];
        const valAvgVol = avgVol[avgVol.length - 2];
        const currentATR = atr[atr.length - 2];

        const rsiValues  = RSI.calculate({ period: this.rsiPeriod, values: closes });
        const currentRSI = rsiValues[rsiValues.length - 2];

        const adxValues  = ADX.calculate({ high: highs, low: lows, close: closes, period: this.adxPeriod });
        const currentADX = adxValues[adxValues.length - 2];

        // ── [v3.0] Multi-Timeframe: pseudo velas de 20-min ───────────────
        // Agrupa cada 4 velas de 5m → 1 vela de 20-min
        const htfData  = this.aggregateToHTF(data, 4);
        const htfValid = htfData.length >= 55;

        let htfBullish = true;
        let htfBearish = true;

        if (htfValid) {
            const htfCloses = htfData.map(d => d.close);
            const htfEma20  = EMA.calculate({ period: 20, values: htfCloses });
            const htfEma50  = EMA.calculate({ period: 50, values: htfCloses });
            const lastHtfE20 = htfEma20[htfEma20.length - 1];
            const lastHtfE50 = htfEma50[htfEma50.length - 1];
            htfBullish = lastHtfE20 > lastHtfE50; // HTF alcista
            htfBearish = lastHtfE20 < lastHtfE50; // HTF bajista
        }

        // ── Slope EMA200 ─────────────────────────────────────────────────
        const valEma200Prev   = ema200[ema200.length - 2 - this.ema200SlopeLookback];
        const isEma200Rising  = valEma200 > valEma200Prev;
        const isEma200Falling = valEma200 < valEma200Prev;

        // ── Estabilidad de Tendencia ─────────────────────────────────────
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
        const isRsiOverbought = currentRSI > this.rsiOverbought;
        const isRsiOversold   = currentRSI < this.rsiOversold;
        const atrStopDistance = currentATR * this.atrMultiplier;

        // ── SEÑAL LONG ───────────────────────────────────────────────────
        if (
            isBullishTrend &&
            isTrendStable &&
            isEma200Rising &&
            htfBullish &&                                          // [v3.0] MTF alcista
            signalBar.close > valEma50 &&
            currentADX.adx > this.adxThreshold &&
            !isRsiOverbought &&
            signalBar.close > valEma20 &&
            (prevBar.close <= valEma20) &&                         // Crossover reciente
            signalBar.volume > valAvgVol * this.volMultiplier
        ) {
            const rawStopLoss  = signalBar.low - atrStopDistance;
            const maxStopDist  = signalBar.close * 0.02;
            const safeStopLoss = Math.max(rawStopLoss, signalBar.close - maxStopDist);
            const actualSlDist = signalBar.close - safeStopLoss;
            const takeProfit   = signalBar.close + (actualSlDist * 3); // R:R 1:3

            return {
                type: 'long',
                confidence: 0.85,
                stopLoss: safeStopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: 'Bullish Breakout (MTF + ADX28 + EMA50 + EMA200↑)',
                    ema20: valEma20, ema50: valEma50, ema200: valEma200,
                    atr: currentATR, rsi: currentRSI, adx: currentADX.adx,
                    rrRatio: '1:3',
                    slPercent: (actualSlDist / signalBar.close * 100).toFixed(2) + '%',
                    sessionHour: hourUTC,
                },
            };
        }

        // ── SEÑAL SHORT ──────────────────────────────────────────────────
        if (
            isBearishTrend &&
            isTrendStable &&
            isEma200Falling &&
            htfBearish &&                                          // [v3.0] MTF bajista
            signalBar.close < valEma50 &&
            currentADX.adx > this.adxThreshold &&
            !isRsiOversold &&
            signalBar.close < valEma20 &&
            (prevBar.close >= valEma20) &&                         // Crossover reciente
            signalBar.volume > valAvgVol * this.volMultiplier
        ) {
            const rawStopLoss  = signalBar.high + atrStopDistance;
            const maxStopDist  = signalBar.close * 0.02;
            const safeStopLoss = Math.min(rawStopLoss, signalBar.close + maxStopDist);
            const actualSlDist = safeStopLoss - signalBar.close;
            const takeProfit   = signalBar.close - (actualSlDist * 3); // R:R 1:3

            return {
                type: 'short',
                confidence: 0.85,
                stopLoss: safeStopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: 'Bearish Breakout (MTF + ADX28 + EMA50 + EMA200↓)',
                    ema20: valEma20, ema50: valEma50, ema200: valEma200,
                    atr: currentATR, rsi: currentRSI, adx: currentADX.adx,
                    rrRatio: '1:3',
                    slPercent: (actualSlDist / signalBar.close * 100).toFixed(2) + '%',
                    sessionHour: hourUTC,
                },
            };
        }

        return null;
    }

    /**
     * Agrega N velas de 5m en pseudo-velas de timeframe superior
     * Ejemplo: aggregateToHTF(data, 4) → velas de 20-min
     */
    private aggregateToHTF(data: OHLCV[], period: number): OHLCV[] {
        const result: OHLCV[] = [];
        const start = data.length % period; // Alinear al último período completo
        for (let i = start; i + period <= data.length; i += period) {
            const slice = data.slice(i, i + period);
            result.push({
                timestamp: slice[0].timestamp,
                open:   slice[0].open,
                high:   Math.max(...slice.map(c => c.high)),
                low:    Math.min(...slice.map(c => c.low)),
                close:  slice[slice.length - 1].close,
                volume: slice.reduce((s, c) => s + c.volume, 0),
            });
        }
        return result;
    }
}

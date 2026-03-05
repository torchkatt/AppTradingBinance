/**
 * ScalpingStrategy v1.0
 *
 * Estrategia de momentum rápido para velas de 5m.
 * No requiere tendencia fuerte — busca impulsos de corta duración.
 *
 * Lógica:
 * 1. EMA8 cruza sobre/bajo EMA21 (crossover en las últimas 3 barras)
 * 2. RSI 14 en zona de momentum: 45-65 para LONG, 35-55 para SHORT
 *    (No extremos — en medio del impulso, no al final)
 * 3. Precio sobre EMA50 para LONG, bajo EMA50 para SHORT (sesgo estructural)
 * 4. Volumen 1.2x promedio
 * 5. ADX entre 15-30 (hay momentum pero no es tendencia fuerte ya capturada
 *    por TrendMomentum)
 * 6. Filtro de sesión: 07:30-20:30 UTC
 * 7. SL: ATR × 1.0 (tight stop)
 * 8. TP: ATR × 1.6 (R:R ~1:1.6)
 *
 * WR esperado: 50-60%
 * R:R típico: 1:1.5 a 1:2
 */

import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, ATR, RSI, ADX, SMA } from 'technicalindicators';

export class ScalpingStrategy extends Strategy {
    name = 'Scalping v1.0';
    description = 'Momentum rápido EMA8/21 — capturas de impulso en 5m (v1.0)';

    constructor(
        private readonly fastPeriod: number  = 8,
        private readonly slowPeriod: number  = 21,
        private readonly midPeriod: number   = 50,
        private readonly rsiPeriod: number   = 14,
        private readonly atrPeriod: number   = 14,
        private readonly atrSlMult: number   = 1.0,  // SL tight
        private readonly atrTpMult: number   = 1.6,  // TP: R:R 1:1.6
        private readonly volMultiplier: number = 1.20,
        private readonly adxMin: number      = 15,   // Algún momentum
        private readonly adxMax: number      = 30,   // No tendencia demasiado fuerte (la toma TrendMomentum)
        private readonly crossoverLookback: number = 3, // Barras para validar crossover
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        if (data.length < 60) return null;

        // ── Filtro de sesión: 07:00-21:00 UTC ────────────────────────────
        // Usa timestamp de la vela para ser compatible con backtesting
        const lastCandle = data[data.length - 2];
        const candleDate = new Date(lastCandle.timestamp);
        const hourUTC = candleDate.getUTCHours();
        if (hourUTC < 7 || hourUTC >= 21) return null;

        const closes  = data.map(d => d.close);
        const highs   = data.map(d => d.high);
        const lows    = data.map(d => d.low);
        const volumes = data.map(d => d.volume);

        const signalBar = data[data.length - 2]; // Última vela cerrada

        // ── Indicadores ─────────────────────────────────────────────────
        const ema8  = EMA.calculate({ period: this.fastPeriod, values: closes });
        const ema21 = EMA.calculate({ period: this.slowPeriod, values: closes });
        const ema50 = EMA.calculate({ period: this.midPeriod,  values: closes });

        const rsiValues  = RSI.calculate({ period: this.rsiPeriod, values: closes });
        const currentRSI = rsiValues[rsiValues.length - 2];

        const adxValues  = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentADX = adxValues[adxValues.length - 2]?.adx ?? 0;

        const avgVol     = SMA.calculate({ period: 20, values: volumes });
        const lastAvgVol = avgVol[avgVol.length - 2];

        const atrValues  = ATR.calculate({ period: this.atrPeriod, high: highs, low: lows, close: closes });
        const currentATR = atrValues[atrValues.length - 2] ?? 0;

        // Valores actuales y previos para crossover
        const curEma8  = ema8[ema8.length - 2];
        const curEma21 = ema21[ema21.length - 2];
        const curEma50 = ema50[ema50.length - 2];

        // ── Filtros comunes ──────────────────────────────────────────────
        if (currentADX < this.adxMin || currentADX > this.adxMax) return null;
        if (signalBar.volume < lastAvgVol * this.volMultiplier) return null;

        // ── Detectar crossover en las últimas N barras ───────────────────
        const bullCross = this.hasBullishCrossover(ema8, ema21, this.crossoverLookback);
        const bearCross = this.hasBearishCrossover(ema8, ema21, this.crossoverLookback);

        // ── SEÑAL LONG ────────────────────────────────────────────────────
        if (
            bullCross &&
            currentRSI >= 45 && currentRSI <= 68 &&     // Momentum alcista sin sobrecompra
            signalBar.close > curEma50                    // Sesgo estructural alcista
        ) {
            const stopLoss   = signalBar.close - currentATR * this.atrSlMult;
            const takeProfit = signalBar.close + currentATR * this.atrTpMult;
            const slDist     = signalBar.close - stopLoss;
            const tpDist     = takeProfit - signalBar.close;

            return {
                type: 'long',
                confidence: this.calcConfidence(currentRSI, currentADX, signalBar.volume / lastAvgVol, 'long'),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `Scalp Long — EMA8>EMA21, RSI ${currentRSI.toFixed(1)}, ADX ${currentADX.toFixed(1)}`,
                    ema8: curEma8, ema21: curEma21, ema50: curEma50,
                    rsi: currentRSI, adx: currentADX, atr: currentATR,
                    volRatio: (signalBar.volume / lastAvgVol).toFixed(2),
                    rrRatio: (tpDist / slDist).toFixed(2) + ':1',
                },
            };
        }

        // ── SEÑAL SHORT ───────────────────────────────────────────────────
        if (
            bearCross &&
            currentRSI >= 32 && currentRSI <= 55 &&     // Momentum bajista sin sobreVenta extrema
            signalBar.close < curEma50                    // Sesgo estructural bajista
        ) {
            const stopLoss   = signalBar.close + currentATR * this.atrSlMult;
            const takeProfit = signalBar.close - currentATR * this.atrTpMult;
            const slDist     = stopLoss - signalBar.close;
            const tpDist     = signalBar.close - takeProfit;

            return {
                type: 'short',
                confidence: this.calcConfidence(currentRSI, currentADX, signalBar.volume / lastAvgVol, 'short'),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `Scalp Short — EMA8<EMA21, RSI ${currentRSI.toFixed(1)}, ADX ${currentADX.toFixed(1)}`,
                    ema8: curEma8, ema21: curEma21, ema50: curEma50,
                    rsi: currentRSI, adx: currentADX, atr: currentATR,
                    volRatio: (signalBar.volume / lastAvgVol).toFixed(2),
                    rrRatio: (tpDist / slDist).toFixed(2) + ':1',
                },
            };
        }

        return null;
    }

    /**
     * Verifica si hubo un crossover alcista (EMA8 cruzó sobre EMA21) en las últimas N barras
     */
    private hasBullishCrossover(ema8: number[], ema21: number[], lookback: number): boolean {
        const len = Math.min(ema8.length, ema21.length);
        for (let i = 2; i <= lookback + 1; i++) {
            const idx = len - i;
            if (idx < 1) break;
            const prevFast = ema8[idx - 1];
            const prevSlow = ema21[idx - 1];
            const currFast = ema8[idx];
            const currSlow = ema21[idx];
            if (prevFast <= prevSlow && currFast > currSlow) return true;
        }
        return false;
    }

    /**
     * Verifica si hubo un crossover bajista (EMA8 cruzó bajo EMA21) en las últimas N barras
     */
    private hasBearishCrossover(ema8: number[], ema21: number[], lookback: number): boolean {
        const len = Math.min(ema8.length, ema21.length);
        for (let i = 2; i <= lookback + 1; i++) {
            const idx = len - i;
            if (idx < 1) break;
            const prevFast = ema8[idx - 1];
            const prevSlow = ema21[idx - 1];
            const currFast = ema8[idx];
            const currSlow = ema21[idx];
            if (prevFast >= prevSlow && currFast < currSlow) return true;
        }
        return false;
    }

    private calcConfidence(rsi: number, adx: number, volRatio: number, side: 'long' | 'short'): number {
        // RSI en zona óptima (50-60 para long, 40-50 para short)
        const rsiOptimal = side === 'long' ? Math.max(0, 1 - Math.abs(rsi - 55) / 15)
                                           : Math.max(0, 1 - Math.abs(rsi - 45) / 15);
        const adxScore   = Math.min(1, (adx - this.adxMin) / (this.adxMax - this.adxMin));
        const volScore   = Math.min(1, (volRatio - 1) / 2);
        return Math.min(0.82, 0.55 + rsiOptimal * 0.15 + adxScore * 0.07 + volScore * 0.05);
    }
}

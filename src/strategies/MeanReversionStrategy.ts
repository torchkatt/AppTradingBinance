/**
 * MeanReversionStrategy v2.2
 *
 * - [v2.2] Filtro de sesgo macro via slope EMA200 (20 barras):
 *          Solo LONG si slope positivo o neutro, solo SHORT si negativo o neutro.
 *          Evita comprar en tendencias bajistas sostenidas y vender en alcistas.
 * - [v2.2] RSI 30/70 (equilibrio entre v2.0 25/75 y v2.1 35/65)
 * - [v2.1] BB 2.0σ, maxEma200DevPct 10%, adxThreshold 25
 * - [v2.0] Stop Loss dinámico ATR * 1.5, Take Profit: BB midline
 * - R:R típico 1:1.2 a 1:1.8 con WR esperado 52-62%
 */

import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, ATR, RSI, BollingerBands, ADX } from 'technicalindicators';

export class MeanReversionStrategy extends Strategy {
    name = 'Mean Reversion v2.2';
    description = 'Reversión a la media — BB 2.0σ + RSI 30/70 + sesgo macro EMA200 (v2.2)';

    constructor(
        private readonly bbPeriod: number        = 20,
        private readonly bbStdDev: number        = 2.0,   // [v2.1] 2.5→2.0
        private readonly rsiPeriod: number       = 14,
        private readonly rsiOversold: number     = 30,    // [v2.2] equilibrio 25→30
        private readonly rsiOverbought: number   = 70,    // [v2.2] equilibrio 75→70
        private readonly atrMultiplier: number   = 1.5,
        private readonly adxThreshold: number    = 25,    // [v2.1] 22→25
        private readonly maxEma200DevPct: number = 0.10,  // [v2.1] 5%→10%
        private readonly slopeLookback: number   = 20,    // [v2.2] barras para medir slope EMA200
        private readonly slopeThreshold: number  = 0.002, // [v2.2] ±0.2% cambio = tendencia
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        if (data.length < Math.max(200, this.bbPeriod + 10)) return null;

        const closes = data.map(d => d.close);
        const highs  = data.map(d => d.high);
        const lows   = data.map(d => d.low);

        // Usar última vela cerrada
        const signalBar   = data[data.length - 2];
        const currentPrice = signalBar.close;

        // ── [v2.0] Verificar régimen: ADX debe ser bajo (mercado lateral) ─
        const adxValues  = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentADX = adxValues[adxValues.length - 2]?.adx ?? 99;

        if (currentADX >= this.adxThreshold) return null; // Mercado en tendencia → no revertir

        // ── Indicadores ─────────────────────────────────────────────────
        const bbValues = BollingerBands.calculate({ period: this.bbPeriod, stdDev: this.bbStdDev, values: closes });
        const lastBB   = bbValues[bbValues.length - 2];
        if (!lastBB) return null;

        const { upper, middle, lower } = lastBB;
        const percentB = (currentPrice - lower) / (upper - lower); // 0=lower, 1=upper

        const rsiValues  = RSI.calculate({ period: this.rsiPeriod, values: closes });
        const currentRSI = rsiValues[rsiValues.length - 2];

        const atrValues  = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentATR = atrValues[atrValues.length - 2] ?? 0;

        // ── [v2.2] Filtro EMA200: desviación y slope (sesgo macro) ─────────
        const ema200Series = EMA.calculate({ period: 200, values: closes });
        const ema200Now  = ema200Series[ema200Series.length - 1] ?? 0;
        const ema200Prev = ema200Series[ema200Series.length - 1 - this.slopeLookback] ?? ema200Now;

        const devFromEma200 = Math.abs(currentPrice - ema200Now) / ema200Now;
        if (devFromEma200 > this.maxEma200DevPct) return null;

        // Slope: cambio porcentual del EMA200 en los últimos N bars
        const ema200Slope = (ema200Now - ema200Prev) / ema200Prev;
        // bull = subiendo, bear = bajando, neutral = flat
        const trendBias = ema200Slope > this.slopeThreshold ? 'bull'
            : ema200Slope < -this.slopeThreshold ? 'bear'
            : 'neutral';

        // ── SEÑAL LONG: precio en banda inferior + RSI oversold ─────────
        // [v2.2] Solo si la macro-tendencia no es bajista (evita comprar en downtrends)
        if (percentB <= 0.10 && currentRSI < this.rsiOversold && trendBias !== 'bear') {
            const stopLoss   = currentPrice - currentATR * this.atrMultiplier;
            const takeProfit = middle;
            const actualSlDist = currentPrice - stopLoss;
            const tpDist       = takeProfit - currentPrice;

            if (tpDist < actualSlDist * 1.2) return null;

            return {
                type: 'long',
                confidence: this.calcConfidence(currentRSI, this.rsiOversold, percentB, 'long'),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `MR Long — %B ${percentB.toFixed(2)}, RSI ${currentRSI.toFixed(1)}, ADX ${currentADX.toFixed(1)}, bias ${trendBias}`,
                    percentB, rsi: currentRSI, adx: currentADX, trendBias,
                    upperBand: upper, midBand: middle, lowerBand: lower,
                    atr: currentATR,
                    rrRatio: (tpDist / actualSlDist).toFixed(2) + ':1',
                },
            };
        }

        // ── SEÑAL SHORT: precio en banda superior + RSI overbought ──────
        // [v2.2] Solo si la macro-tendencia no es alcista
        if (percentB >= 0.90 && currentRSI > this.rsiOverbought && trendBias !== 'bull') {
            const stopLoss   = currentPrice + currentATR * this.atrMultiplier;
            const takeProfit = middle; // BB midline como target natural
            const actualSlDist = stopLoss - currentPrice;
            const tpDist       = currentPrice - takeProfit;

            // Solo entrar si hay al menos R:R 1:1.2
            if (tpDist < actualSlDist * 1.2) return null;

            return {
                type: 'short',
                confidence: this.calcConfidence(currentRSI, this.rsiOverbought, percentB, 'short'),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `MR Short — %B ${percentB.toFixed(2)}, RSI ${currentRSI.toFixed(1)}, ADX ${currentADX.toFixed(1)}, bias ${trendBias}`,
                    percentB, rsi: currentRSI, adx: currentADX, trendBias,
                    upperBand: upper, midBand: middle, lowerBand: lower,
                    atr: currentATR,
                    rrRatio: (tpDist / actualSlDist).toFixed(2) + ':1',
                },
            };
        }

        return null;
    }

    private calcConfidence(rsi: number, threshold: number, percentB: number, side: 'long' | 'short'): number {
        if (side === 'long') {
            const rsiScore = Math.max(0, (threshold - rsi) / threshold);
            const bbScore  = Math.max(0, 0.1 - percentB) * 10;
            return Math.min(0.90, 0.55 + rsiScore * 0.25 + bbScore * 0.20);
        } else {
            const rsiScore = Math.max(0, (rsi - threshold) / (100 - threshold));
            const bbScore  = Math.max(0, percentB - 0.9) * 10;
            return Math.min(0.90, 0.55 + rsiScore * 0.25 + bbScore * 0.20);
        }
    }
}

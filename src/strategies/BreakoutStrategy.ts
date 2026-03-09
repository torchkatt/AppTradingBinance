/**
 * BreakoutStrategy v1.3
 *
 * Detecta rupturas de zonas de consolidación con volumen significativo.
 *
 * [v1.3] consolidationBars 30→20 (2.5h→1.7h en 5m).
 *        30 barras era demasiado exigente en producción: BTC rara vez consolida
 *        2.5h en rango <2%. 20 barras sigue siendo un setup válido con menos falsos negativos.
 * [v1.2] Filtro de sesgo macro EMA200 slope (no contra-tendencia)
 * [v1.1] maxRangePct 2.0%, vol 2.0x, TP ×2.0
 * [v1.0] Consolidación N barras, ADX 15-28, SL = lado opuesto + ATR
 *
 * WR esperado: 43-52% con sesgo macro
 * R:R típico: 1:1.8 a 1:2.5
 */

import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { ATR, ADX, SMA, EMA } from 'technicalindicators';

export class BreakoutStrategy extends Strategy {
    name = 'Breakout v1.3';
    description = 'Ruptura de consolidación — sesgo macro EMA200 + vol 2.0x + TP ×2.0 (v1.3)';

    constructor(
        private readonly consolidationBars: number  = 20,     // [v1.3] 30→20 barras (1.7h en 5m)
        private readonly maxRangePct: number         = 0.020, // [v1.2] 2.0% (equilibrio 1.5%-2.5%)
        private readonly volMultiplier: number       = 2.00,  // [v1.2] 1.8x→2.0x
        private readonly atrMultiplier: number       = 1.0,   // Buffer ATR para SL
        private readonly tpMultiplier: number        = 2.0,   // [v1.1] 2.5→2.0 (TP más alcanzable)
        private readonly minADXForValidity: number   = 15,
        private readonly maxADXForSetup: number      = 28,
        private readonly slopeLookback: number       = 20,    // [v1.2] barras para slope EMA200
        private readonly slopeThreshold: number      = 0.002, // [v1.2] ±0.2% = tendencia macro
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        if (data.length < this.consolidationBars + 20) return null;

        const closes  = data.map(d => d.close);
        const highs   = data.map(d => d.high);
        const lows    = data.map(d => d.low);
        const volumes = data.map(d => d.volume);

        // Vela actual (última cerrada)
        const signalBar = data[data.length - 2];

        // ── Verificar consolidación en las N barras ANTERIORES ───────────
        // Excluimos la vela de señal para evitar look-ahead bias
        const consolidationData = data.slice(-(this.consolidationBars + 2), -2);
        const rangeHighs = consolidationData.map(d => d.high);
        const rangeLows  = consolidationData.map(d => d.low);

        const rangeHigh = Math.max(...rangeHighs);
        const rangeLow  = Math.min(...rangeLows);
        const rangeMid  = (rangeHigh + rangeLow) / 2;
        const rangePct  = (rangeHigh - rangeLow) / rangeMid;

        // Si el rango es mayor al 2.5%, no es consolidación → sin señal
        if (rangePct > this.maxRangePct) return null;

        // ── ADX: validar que el mercado estaba lateral ───────────────────
        const adxValues  = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentADX = adxValues[adxValues.length - 2]?.adx ?? 0;

        // ADX debe estar en rango "latente" y no ser demasiado bajo (mercado muerto)
        if (currentADX >= this.maxADXForSetup) return null;
        if (currentADX < this.minADXForValidity) return null;

        // ── Volumen: verificar spike en la vela de señal ─────────────────
        const avgVol = SMA.calculate({ period: 20, values: volumes });
        const lastAvgVol = avgVol[avgVol.length - 2];
        if (signalBar.volume < lastAvgVol * this.volMultiplier) return null;

        // ── ATR para SL buffer ────────────────────────────────────────────
        const atrValues  = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentATR = atrValues[atrValues.length - 2] ?? 0;

        const rangeHeight = rangeHigh - rangeLow;

        // ── [v1.2] Sesgo macro via slope EMA200 ──────────────────────────
        const ema200Series = EMA.calculate({ period: 200, values: closes });
        const ema200Now    = ema200Series[ema200Series.length - 1] ?? 0;
        const ema200Prev   = ema200Series[ema200Series.length - 1 - this.slopeLookback] ?? ema200Now;
        const ema200Slope  = ema200Now > 0 ? (ema200Now - ema200Prev) / ema200Prev : 0;
        const trendBias    = ema200Slope > this.slopeThreshold ? 'bull'
            : ema200Slope < -this.slopeThreshold ? 'bear'
            : 'neutral';

        // ── SEÑAL LONG: ruptura alcista ──────────────────────────────────
        // Precio cierra CLARAMENTE sobre el techo del rango
        // [v1.2] No LONG si macro-tendencia es claramente bajista
        if (signalBar.close > rangeHigh && signalBar.close > signalBar.open && trendBias !== 'bear') {
            const stopLoss   = rangeLow - currentATR * this.atrMultiplier;  // Debajo del suelo del rango
            const takeProfit = signalBar.close + rangeHeight * this.tpMultiplier; // Movimiento medido
            const slDist     = signalBar.close - stopLoss;
            const tpDist     = takeProfit - signalBar.close;

            // Verificar R:R mínimo 1:1.5
            if (tpDist < slDist * 1.5) return null;

            return {
                type: 'long',
                confidence: this.calcConfidence(rangePct, signalBar.volume / lastAvgVol, currentADX),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `Breakout alcista — rango ${(rangePct * 100).toFixed(2)}%, vol ${(signalBar.volume / lastAvgVol).toFixed(1)}x`,
                    rangeHigh, rangeLow, rangeMid, rangePct,
                    atr: currentATR, adx: currentADX,
                    rrRatio: (tpDist / slDist).toFixed(2) + ':1',
                },
            };
        }

        // ── SEÑAL SHORT: ruptura bajista ─────────────────────────────────
        // Precio cierra CLARAMENTE bajo el suelo del rango
        // [v1.2] No SHORT si macro-tendencia es claramente alcista
        if (signalBar.close < rangeLow && signalBar.close < signalBar.open && trendBias !== 'bull') {
            const stopLoss   = rangeHigh + currentATR * this.atrMultiplier; // Sobre el techo del rango
            const takeProfit = signalBar.close - rangeHeight * this.tpMultiplier;
            const slDist     = stopLoss - signalBar.close;
            const tpDist     = signalBar.close - takeProfit;

            // Verificar R:R mínimo 1:1.5
            if (tpDist < slDist * 1.5) return null;

            return {
                type: 'short',
                confidence: this.calcConfidence(rangePct, signalBar.volume / lastAvgVol, currentADX),
                stopLoss,
                takeProfit,
                metadata: {
                    strategy: this.name,
                    reason: `Breakout bajista — rango ${(rangePct * 100).toFixed(2)}%, vol ${(signalBar.volume / lastAvgVol).toFixed(1)}x`,
                    rangeHigh, rangeLow, rangeMid, rangePct,
                    atr: currentATR, adx: currentADX,
                    rrRatio: (tpDist / slDist).toFixed(2) + ':1',
                },
            };
        }

        return null;
    }

    private calcConfidence(rangePct: number, volRatio: number, adx: number): number {
        // Cuanto más comprimido el rango, mejor la señal
        const rangeScore = Math.max(0, (this.maxRangePct - rangePct) / this.maxRangePct);
        // Cuanto más volumen, más confianza
        const volScore   = Math.min(1, (volRatio - this.volMultiplier) / 2);
        // ADX emergiendo es positivo
        const adxScore   = Math.min(1, adx / 25);
        return Math.min(0.85, 0.55 + rangeScore * 0.15 + volScore * 0.10 + adxScore * 0.05);
    }
}

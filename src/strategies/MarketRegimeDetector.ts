import { OHLCV } from '../types/index.js';
import { ADX, ATR, BollingerBands } from 'technicalindicators';

/**
 * Tipos de régimen de mercado detectados
 *
 * trending_bull  → Tendencia alcista fuerte (ADX > 28, +DI > -DI)
 * trending_bear  → Tendencia bajista fuerte (ADX > 28, -DI > +DI)
 * ranging        → Mercado lateral / sin tendencia (ADX < 22)
 * breakout       → BB comprimidas que empiezan a expandirse (explosión inminente)
 * volatile       → Volatilidad extrema — no operar
 */
export type MarketRegime =
    | 'trending_bull'
    | 'trending_bear'
    | 'ranging'
    | 'breakout'
    | 'volatile';

export interface RegimeResult {
    type: MarketRegime;
    adx: number;
    plusDI: number;
    minusDI: number;
    atrPct: number;
    bbWidth: number;
    confidence: number;
    description: string;
}

export class MarketRegimeDetector {
    /**
     * Analiza las velas y determina el régimen de mercado actual.
     * Requiere mínimo 60 velas.
     */
    detect(data: OHLCV[]): RegimeResult {
        const closes = data.map(d => d.close);
        const highs  = data.map(d => d.high);
        const lows   = data.map(d => d.low);
        const currentPrice = closes[closes.length - 1];

        // ── ADX (Fuerza y dirección de tendencia) ────────────────────────
        const adxValues = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
        const lastADX   = adxValues[adxValues.length - 1];
        const adx       = lastADX?.adx   ?? 0;
        const plusDI    = lastADX?.pdi   ?? 0;
        const minusDI   = lastADX?.mdi   ?? 0;

        // ── ATR % (Volatilidad relativa al precio) ─────────────────────────
        const atrValues  = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
        const currentATR = atrValues[atrValues.length - 1] ?? 0;
        const atrPct     = currentATR / currentPrice;

        // ── Bollinger Band Width (Compresión / Expansión) ─────────────────
        const bbValues  = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
        const lastBB    = bbValues[bbValues.length - 1];
        const bbWidth   = lastBB ? (lastBB.upper - lastBB.lower) / lastBB.middle : 0.05;

        // Comparar BB width actual vs hace 8 barras para detectar expansión
        const oldBB     = bbValues.length > 9 ? bbValues[bbValues.length - 9] : lastBB;
        const oldBBWidth = oldBB ? (oldBB.upper - oldBB.lower) / oldBB.middle : bbWidth;
        const bbExpanding = bbWidth > oldBBWidth * 1.35; // 35% de expansión reciente

        // ── REGLAS DE CLASIFICACIÓN (orden de prioridad) ─────────────────

        // 1. Volatilidad extrema → NO operar (ATR > 3% del precio)
        if (atrPct > 0.03) {
            return {
                type: 'volatile', adx, plusDI, minusDI, atrPct, bbWidth,
                confidence: 0.95,
                description: `⚠️ Volatilidad extrema (ATR ${(atrPct * 100).toFixed(1)}%)`,
            };
        }

        // 2. Breakout: BB estaban comprimidas y ahora se expanden con ADX aún bajo
        if (bbExpanding && bbWidth < 0.05 && adx < 28) {
            return {
                type: 'breakout', adx, plusDI, minusDI, atrPct, bbWidth,
                confidence: 0.72,
                description: `💥 Expansión de volatilidad (BBW ${(bbWidth * 100).toFixed(1)}% → ${(bbWidth * 100).toFixed(1)}%)`,
            };
        }

        // 3. Tendencia fuerte
        if (adx >= 28) {
            const isBull = plusDI > minusDI;
            const type: MarketRegime = isBull ? 'trending_bull' : 'trending_bear';
            const confidence = Math.min(0.5 + (adx - 28) / 44, 0.95); // 0.5 en ADX=28, 0.95 en ADX=70
            return {
                type, adx, plusDI, minusDI, atrPct, bbWidth, confidence,
                description: `${isBull ? '📈' : '📉'} Tendencia ${isBull ? 'alcista' : 'bajista'} (ADX ${adx.toFixed(1)})`,
            };
        }

        // 4. Mercado lateral
        return {
            type: 'ranging', adx, plusDI, minusDI, atrPct, bbWidth,
            confidence: 0.60,
            description: `↔️ Mercado lateral (ADX ${adx.toFixed(1)})`,
        };
    }
}

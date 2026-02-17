import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, SMA, ATR, RSI, ADX } from 'technicalindicators';

export class TrendMomentumStrategy extends Strategy {
    name = 'Trend Momentum';
    description = 'Estrategia de seguimiento de tendencia con stops dinámicos ATR (Cardona Style v2.0)';

    constructor(
        private fastEmaPeriod: number = 20,
        private slowEmaPeriod: number = 200,
        private volMultiplier: number = 1.15, // Lowered to 15% above average (was 20%)
        private aggressiveMode: boolean = false, // Methodical Mode by default (User Request)
        private atrPeriod: number = 14,
        private atrMultiplier: number = 1.5, // Stop Loss = 1.5x ATR from entry candle
        private trendLookback: number = 3, // How many candles to confirm trend
        private rsiPeriod: number = 14,
        private rsiOverbought: number = 70,
        private rsiOversold: number = 30,
        private adxPeriod: number = 14,
        private adxThreshold: number = 20 // Lowered to 20 for more aggressive entry (was 25)
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        // Necesitamos al menos 200 velas para EMA200 + ATR + buffer
        if (data.length < Math.max(this.slowEmaPeriod, this.atrPeriod) + 5) return null;

        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const volumes = data.map(d => d.volume);

        // [AUDIT FIX] Usar velas CERRADAS para evitar repainting
        const signalBar = data[data.length - 2]; // Última vela cerrada
        const prevBar = data[data.length - 3];

        // 1. Calcular Indicadores
        const ema20 = EMA.calculate({ period: this.fastEmaPeriod, values: closes });
        const ema200 = EMA.calculate({ period: this.slowEmaPeriod, values: closes });
        const avgVolume = SMA.calculate({ period: 20, values: volumes });

        // ✅ NUEVO: ATR para stops dinámicos
        const atr = ATR.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: this.atrPeriod
        });

        // Bollinger Bands para detectar Squeeze
        const bbBase = this.getBollingerBands(closes, 20, 2);
        const bb = bbBase.map((b: any) => ({
            ...b,
            bandwidth: (b.upper - b.lower) / b.middle
        }));

        // Índices correspondientes a la signalBar (vela cerrada)
        const idx = ema20.length - 2;

        const valEma20 = ema20[idx];
        const valEma200 = ema200[ema200.length - 2];
        const valAvgVol = avgVolume[avgVolume.length - 2];
        const currentATR = atr[atr.length - 2]; // ✅ ATR de la vela cerrada

        // Revisar bandwidth de las velas ANTERIORES a la señal (Pre-Squeeze)
        // Queremos que prevBar o prePrevBar hayan tenido volatilidad baja
        const bwPrev = bb[bb.length - 3].bandwidth;
        // bwPrePrev removed as it was unused
        // Threshold de Squeeze: Ancho de banda bajo (ej. < 0.05 o relativo)
        // Simplicidad: Si el ancho era menora un umbral, estaba "apretado"
        // NOTA: Para crypto, un bandwidth fijo es difícil. Mejor ver si se expandió.
        const bwSignal = bb[bb.length - 2].bandwidth;
        const isExplosion = bwSignal > bwPrev;

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
        const isTrendStrong = currentADX.adx > this.adxThreshold;

        // 2. Determinar Estabilidad de Tendencia (Trend Stability)
        let isTrendStable = true;
        for (let i = 0; i < this.trendLookback; i++) {
            const hIdx = ema20.length - 2 - i;
            // Check boundaries
            if (hIdx < 0 || hIdx >= ema200.length) continue;

            // Check crossover consistency
            const pastEma20 = ema20[hIdx];
            const pastEma200 = ema200[ema200.length - 2 - i];

            // Si la tendencia actual es ALCISTA, todas las velas anteriores deben ser ALCISTAS
            if (valEma20 > valEma200 && pastEma20 <= pastEma200) isTrendStable = false;
            // Si la tendencia actual es BAJISTA, todas deben ser BAJISTAS
            if (valEma20 < valEma200 && pastEma20 >= pastEma200) isTrendStable = false;
        }

        const isBullishTrend = valEma20 > valEma200;
        const isBearishTrend = valEma20 < valEma200;

        // 3. Validar Volumen
        const effectiveVolMult = this.aggressiveMode ? 1.0 : this.volMultiplier;
        const isVolumeOk = signalBar.volume > (valAvgVol * effectiveVolMult);

        // 4. Lógica de Entrada
        const requireExpansion = this.aggressiveMode ? false : true;
        const isStructureOk = requireExpansion ? isExplosion : true;

        // 5. [NUEVO] Análisis de Mechas (Wick Rejection)
        // Evitar entrar en dirección de una mecha de rechazo grande previa
        const rejectionThreshold = 0.4; // Si la mecha es 40% del cuerpo, es rechazo

        const prevBodySize = Math.abs(prevBar.open - prevBar.close);
        const prevUpperWick = prevBar.high - Math.max(prevBar.open, prevBar.close);
        const prevLowerWick = Math.min(prevBar.open, prevBar.close) - prevBar.low;

        // Rechazo ALCISTA (Upper Wick grande en vela verde o roja anterior indica venta)
        const hasBearishRejection = prevUpperWick > (prevBodySize * rejectionThreshold) && prevUpperWick > prevLowerWick;
        // Rechazo BAJISTA (Lower Wick grande indica compra)
        const hasBullishRejection = prevLowerWick > (prevBodySize * rejectionThreshold) && prevLowerWick > prevUpperWick;

        // 6. [NUEVO] Filtro RSI
        const isRsiOverbought = currentRSI > this.rsiOverbought;
        const isRsiOversold = currentRSI < this.rsiOversold;

        // ✅ MEJORADO: Stops y TPs dinámicos basados en ATR
        const atrStopDistance = currentATR * this.atrMultiplier;

        // LONG SIGNAL
        if (isBullishTrend &&
            isTrendStable && // ✅ Must be stable
            isTrendStrong && // ✅ ADX > 25 (No Choppy Markets)
            !isRsiOverbought && // ✅ Not buying at the top
            !hasBearishRejection && // ✅ No strong rejection recently
            signalBar.close > valEma20 &&
            (
                prevBar.close <= valEma20 || // 1. Normal Crossover
                (this.aggressiveMode && signalBar.close > signalBar.open) // 2. Aggressive: Green Candle
            ) &&
            isVolumeOk &&
            isStructureOk
        ) {
            return {
                type: 'long',
                confidence: this.aggressiveMode ? 0.6 : 0.85,
                stopLoss: signalBar.low - atrStopDistance, // ✅ ATR-based dynamic stop
                takeProfit: signalBar.close + (atrStopDistance * 2), // ✅ Risk:Reward 1:2
                metadata: {
                    reason: this.aggressiveMode ? 'Trend Re-Entry (Stable)' : 'Bullish Breakout (Stable + ADX)',
                    ema20: valEma20,
                    ema200: valEma200,
                    atr: currentATR,
                    rsi: currentRSI,
                    adx: currentADX.adx
                }
            };
        }

        // SHORT SIGNAL
        if (isBearishTrend &&
            isTrendStable && // ✅ Must be stable
            isTrendStrong && // ✅ ADX > 25 (No Choppy Markets)
            !isRsiOversold && // ✅ Not selling at the bottom
            !hasBullishRejection && // ✅ No strong rejection recently
            signalBar.close < valEma20 &&
            (
                prevBar.close >= valEma20 || // 1. Normal Crossover
                (this.aggressiveMode && signalBar.close < signalBar.open) // 2. Aggressive: Red Candle
            ) &&
            isVolumeOk &&
            isStructureOk
        ) {
            return {
                type: 'short',
                confidence: this.aggressiveMode ? 0.6 : 0.85,
                stopLoss: signalBar.high + atrStopDistance, // ✅ ATR-based dynamic stop
                takeProfit: signalBar.close - (atrStopDistance * 2), // ✅ Risk:Reward 1:2
                metadata: {
                    reason: this.aggressiveMode ? 'Trend Push (Stable)' : 'Bearish Breakout (Stable + ADX)',
                    ema20: valEma20,
                    ema200: valEma200,
                    atr: currentATR,
                    rsi: currentRSI,
                    adx: currentADX.adx
                }
            };
        }

        return null;
    }

    // Base class getBollingerBands is used now
}

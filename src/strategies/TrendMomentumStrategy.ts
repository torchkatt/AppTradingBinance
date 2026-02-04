import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { EMA, SMA } from 'technicalindicators';

export class TrendMomentumStrategy extends Strategy {
    name = 'Trend Momentum';
    description = 'Estrategia de seguimiento de tendencia basada en EMA 20/200 y volumen (Cardona Style)';

    constructor(
        private fastEmaPeriod: number = 20,    // La "20" de Cardona
        private slowEmaPeriod: number = 200,   // Tendencia largo plazo
        private volMultiplier: number = 1.2    // 120% volumen promedio
    ) {
        super();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        // Necesitamos al menos 200 velas para la EMA200 + buffer
        if (data.length < this.slowEmaPeriod + 5) return null;

        const closes = data.map(d => d.close);
        const volumes = data.map(d => d.volume);

        // [AUDIT FIX] Usar velas CERRADAS para evitar repainting
        // data[length-1] es la vela actual (en formación)
        // data[length-2] es la última vela cerrada (Signal Candle)
        const signalBar = data[data.length - 2];
        const prevBar = data[data.length - 3];
        const prePrevBar = data[data.length - 4]; // Para detectar consolidación

        // 1. Calcular Indicadores (sobre todos los datos, pero usamos índices correctos)
        const ema20 = EMA.calculate({ period: this.fastEmaPeriod, values: closes });
        const ema200 = EMA.calculate({ period: this.slowEmaPeriod, values: closes });
        const avgVolume = SMA.calculate({ period: 20, values: volumes });

        // Bollinger Bands para detectar Squeeze (Consolidación)
        // Usamos BB Bandwidth: (Upper - Lower) / Middle
        // [AUDIT FIX] Use base method and map to add bandwidth
        const bbBase = this.getBollingerBands(closes, 20, 2);
        const bb = bbBase.map((b: any) => ({
            ...b,
            bandwidth: (b.upper - b.lower) / b.middle
        }));

        // Índices correspondientes a la signalBar (length-2)
        // EMA array length might differ slightly dependent on library impl, let's align from end
        const idx = ema20.length - 2;

        const valEma20 = ema20[idx];
        const valEma200 = ema200[ema200.length - 2];
        const valAvgVol = avgVolume[avgVolume.length - 2];

        // Revisar bandwidth de las velas ANTERIORES a la señal (Pre-Squeeze)
        // Queremos que prevBar o prePrevBar hayan tenido volatilidad baja
        const bwPrev = bb[bb.length - 3].bandwidth;
        const bwPrePrev = bb[bb.length - 4].bandwidth;
        // Threshold de Squeeze: Ancho de banda bajo (ej. < 0.05 o relativo)
        // Simplicidad: Si el ancho era menora un umbral, estaba "apretado"
        // NOTA: Para crypto, un bandwidth fijo es difícil. Mejor ver si se expandió.
        const bwSignal = bb[bb.length - 2].bandwidth;
        const isExpasion = bwSignal > bwPrev; // ¿Se están abriendo las bandas?

        // 2. Determinar Tendencia General
        const isBullishTrend = valEma20 > valEma200;
        const isBearishTrend = valEma20 < valEma200;

        // 3. Validar Volumen (Explosión)
        // La vela de señal debe tener volumen superior al promedio
        const isVolumeHigh = signalBar.volume > (valAvgVol * this.volMultiplier);

        // 4. Lógica de Entrada (Breakout + Expansion)

        // LONG SIGNAL
        if (isBullishTrend &&
            signalBar.close > valEma20 &&
            prevBar.close <= valEma20 && // Cruce hacia arriba reciente
            isVolumeHigh &&
            isExpasion // Confirmamos que salimos de una contracción
        ) {
            return {
                type: 'long',
                confidence: 0.85, // Alta confianza por Squeeze
                stopLoss: signalBar.low * 0.99, // SL debajo de la vela de ruptura
                takeProfit: signalBar.close * 1.04, // 4% TP
                metadata: {
                    reason: 'Bullish Breakout (Squeeze Release)',
                    ema20: valEma20,
                    ema200: valEma200,
                    volumeRatio: (signalBar.volume / valAvgVol).toFixed(2),
                    expansion: true
                }
            };
        }

        // SHORT SIGNAL
        if (isBearishTrend &&
            signalBar.close < valEma20 &&
            prevBar.close >= valEma20 && // Cruce hacia abajo
            isVolumeHigh &&
            isExpasion
        ) {
            return {
                type: 'short',
                confidence: 0.85,
                stopLoss: signalBar.high * 1.01, // SL arriba de la vela
                takeProfit: signalBar.close * 0.96,
                metadata: {
                    reason: 'Bearish Breakout (Squeeze Release)',
                    ema20: valEma20,
                    ema200: valEma200,
                    volumeRatio: (signalBar.volume / valAvgVol).toFixed(2),
                    expansion: true
                }
            };
        }

        return null;
    }

    // Base class getBollingerBands is used now
}

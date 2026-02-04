import { OHLCV, Signal } from '../../types/index.js';

import { EMA, SMA, BollingerBands, RSI, ATR } from 'technicalindicators';

/**
 * Clase base abstracta para todas las estrategias de trading
 * 
 * Cada estrategia debe implementar:
 * - name: Nombre descriptivo
 * - description: Explicación de la estrategia
 * - analyze: Lógica de análisis que retorna señales
 */
export abstract class Strategy {
    abstract name: string;
    abstract description: string;

    /**
     * Analiza datos OHLCV y retorna señal de trading si detecta oportunidad
     * @param data Array de velas OHLCV
     * @returns Signal o null si no hay señal
     */
    abstract analyze(data: OHLCV[]): Promise<Signal | null>;

    /**
     * INDICADORES TÉCNICOS COMPARTIDOS
     * Métodos helper para calcular indicadores comunes
     */

    /**
     * Calcula EMA usando technicalindicators (Retorna Array)
     */
    protected getEMA(values: number[], period: number): number[] {
        return EMA.calculate({ period, values });
    }

    /**
     * Calcula SMA usando technicalindicators (Retorna Array)
     */
    protected getSMA(values: number[], period: number): number[] {
        return SMA.calculate({ period, values });
    }

    /**
     * Calcula RSI usando technicalindicators (Retorna Array)
     */
    protected getRSI(values: number[], period: number): number[] {
        return RSI.calculate({ period, values });
    }

    /**
     * Calcula Bollinger Bands usando technicalindicators (Retorna Array de Objetos)
     */
    protected getBollingerBands(values: number[], period: number, stdDev: number): any[] {
        return BollingerBands.calculate({ period, stdDev, values });
    }

    /**
     * Calcula ATR usando technicalindicators (Retorna Array)
     */
    protected getATR(data: OHLCV[], period: number): number[] {
        const high = data.map(d => d.high);
        const low = data.map(d => d.low);
        const close = data.map(d => d.close);
        return ATR.calculate({ period, high, low, close });
    }

    // Deprecated manual calculations below (kept for backward compatibility if needed)
    // Deprecated manual calculations below (kept for backward compatibility if needed)
    protected calculateSMA(data: number[], period: number): number {
        if (data.length < period) return 0;
        const slice = data.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    protected calculateEMA(data: number[], period: number): number {
        const results = this.getEMA(data, period);
        return results[results.length - 1] || 0;
    }

    protected calculateRSI(data: number[], period: number): number {
        const results = this.getRSI(data, period);
        return results[results.length - 1] || 0;
    }

    protected calculateATR(data: OHLCV[], period: number): number {
        const results = this.getATR(data, period);
        return results[results.length - 1] || 0;
    }

    protected calculateStdDev(data: number[]): number {
        if (data.length === 0) return 0;
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }

    protected detectCrossover(
        fast: number[],
        slow: number[],
        minLength: number = 2
    ): 'bullish' | 'bearish' | null {
        if (fast.length < minLength || slow.length < minLength) return null;

        const currentFast = fast[fast.length - 1];
        const currentSlow = slow[slow.length - 1];
        const prevFast = fast[fast.length - 2];
        const prevSlow = slow[slow.length - 2];

        // Bullish crossover: fast cruza por encima de slow
        if (prevFast <= prevSlow && currentFast > currentSlow) {
            return 'bullish';
        }

        // Bearish crossover: fast cruza por debajo de slow
        if (prevFast >= prevSlow && currentFast < currentSlow) {
            return 'bearish';
        }

        return null;
    }
}

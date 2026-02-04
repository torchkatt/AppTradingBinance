import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { logger } from '../utils/logger.js';
/**
 * Estrategia de Mean Reversion usando Bollinger Bands + RSI
 * 
 * Lógica:
 * - LONG: Precio toca banda inferior de Bollinger + RSI < 30 (oversold)
 * - SHORT: Precio toca banda superior de Bollinger + RSI > 70 (overbought)
 * - Stop Loss: 2 * ATR desde el precio de entrada
 * - Take Profit: Media móvil (centro de Bollinger Bands)
 * 
 * Mejor para: Mercados laterales con volatilidad moderada
 */
export class MeanReversionStrategy extends Strategy {
    name = 'Mean Reversion';
    description = 'Bollinger Bands con confirmación RSI para reversión a la media';
    constructor(
        private bbPeriod: number = 20,
        private bbStdDev: number = 2,
        private rsiPeriod: number = 14,
        private rsiOversold: number = 45,      // AGRESIVO: Máximas oportunidades
        private rsiOverbought: number = 55,    // AGRESIVO: Máximas oportunidades
        private atrMultiplier: number = 1.0    // OPTIMIZADO: ~0.8% SL para ratio R:R 1:1
    ) {
        super();
    }
    async analyze(data: OHLCV[]): Promise<Signal | null> {
        // Necesitamos suficiente historial
        if (data.length < Math.max(this.bbPeriod, this.rsiPeriod) + 1) {
            return null;
        }
        const closes = data.map(d => d.close);
        const currentBar = data[data.length - 1];
        const currentPrice = currentBar.close;
        // Calcular Bollinger Bands
        const sma = this.calculateSMA(closes, this.bbPeriod);
        const stdDev = this.calculateStdDev(closes.slice(-this.bbPeriod));
        const upperBand = sma + (this.bbStdDev * stdDev);
        const lowerBand = sma - (this.bbStdDev * stdDev);
        const bandwidth = ((upperBand - lowerBand) / sma) * 100;
        // Calcular RSI
        const rsi = this.calculateRSI(closes, this.rsiPeriod);
        // Calcular ATR para stop loss dinámico
        const atr = this.calculateATR(data, 14);
        // Calcular %B (posición del precio dentro de las bandas)
        const percentB = (currentPrice - lowerBand) / (upperBand - lowerBand);
        // Calcular EMA 200 para filtro de tendencia
        const ema200 = this.calculateEMA(closes, 200);
        // SEÑAL LONG: Precio en banda inferior + RSI oversold (AGRESIVO: umbral 0.3)
        // [FILTRO TENDENCIA] Solo operar LONG si el precio está POR ENCIMA de la EMA200 (Tendencia Alcista)
        if (percentB <= 0.3 && rsi < this.rsiOversold && currentPrice > ema200) {
            // OPTIMIZADO: Objetivo rápido de $5-6 USD (0.7% movimiento)
            // Con apalancamiento 10x en posición de $100 (exposición $1,000):
            // 0.7% × $1,000 = $7 bruto - $1.50 comisión = ~$5.50 ganancia neta
            const takeProfitPrice = currentPrice * 1.007; // +0.7%
            const signal: Signal = {
                type: 'long',
                confidence: this.calculateConfidence(rsi, this.rsiOversold, percentB, 'long'),
                stopLoss: currentPrice - (this.atrMultiplier * atr),
                takeProfit: takeProfitPrice,
                metadata: {
                    rsi,
                    percentB,
                    lowerBand,
                    upperBand,
                    sma,
                    bandwidth,
                    atr,
                    ema200,
                    strategy: this.name,
                    takeProfitPct: 0.7,  // Rastreo de porcentaje TP
                }
            };
            logger.info({
                signal: 'LONG',
                price: currentPrice,
                rsi,
                ema200,
                percentB: percentB.toFixed(3),
                confidence: signal.confidence
            }, 'Mean Reversion LONG signal detected (Trend Confirmed)');
            return signal;
        }
        // SEÑAL SHORT: Precio en banda superior + RSI overbought (AGRESIVO: umbral 0.7)
        // [FILTRO TENDENCIA] Solo operar SHORT si el precio está POR DEBAJO de la EMA200 (Tendencia Bajista)
        if (percentB >= 0.7 && rsi > this.rsiOverbought && currentPrice < ema200) {
            // OPTIMIZADO: Objetivo rápido de $5-6 USD (0.7% movimiento)
            const takeProfitPrice = currentPrice * 0.993; // -0.7%
            const signal: Signal = {
                type: 'short',
                confidence: this.calculateConfidence(rsi, this.rsiOverbought, percentB, 'short'),
                stopLoss: currentPrice + (this.atrMultiplier * atr),
                takeProfit: takeProfitPrice,
                metadata: {
                    rsi,
                    percentB,
                    lowerBand,
                    upperBand,
                    sma,
                    bandwidth,
                    atr,
                    ema200,
                    strategy: this.name,
                    takeProfitPct: 1.2,
                }
            };
            logger.info({
                signal: 'SHORT',
                price: currentPrice,
                rsi,
                ema200,
                percentB: percentB.toFixed(3),
                confidence: signal.confidence
            }, 'Mean Reversion SHORT signal detected (Trend Confirmed)');
            return signal;
        }
        return null;
    }
    /**
     * Calcula nivel de confianza basado en la fuerza de la señal
     */
    private calculateConfidence(
        rsi: number,
        rsiThreshold: number,
        percentB: number,
        side: 'long' | 'short'
    ): number {
        let confidence = 0.5;
        if (side === 'long') {
            // Cuanto más bajo el RSI, mayor confianza
            const rsiScore = Math.max(0, (rsiThreshold - rsi) / rsiThreshold);
            // Cuanto más cerca de 0 el %B, mayor confianza
            const bbScore = Math.max(0, 1 - percentB);
            confidence = (rsiScore * 0.6) + (bbScore * 0.4);
        } else {
            // Cuanto más alto el RSI, mayor confianza
            const rsiScore = Math.max(0, (rsi - rsiThreshold) / (100 - rsiThreshold));
            // Cuanto más cerca de 1 el %B, mayor confianza
            const bbScore = percentB;
            confidence = (rsiScore * 0.6) + (bbScore * 0.4);
        }
        return Math.min(0.95, Math.max(0.5, confidence));
    }
}

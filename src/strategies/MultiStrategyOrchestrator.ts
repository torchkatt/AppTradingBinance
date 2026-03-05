/**
 * MultiStrategyOrchestrator v1.0
 *
 * Orquestador inteligente que coordina las 4 estrategias según el régimen de mercado.
 *
 * Arquitectura:
 * ┌─────────────────────────────────────────────────────────────┐
 * │               MultiStrategyOrchestrator                     │
 * │                                                             │
 * │  MarketRegimeDetector                                       │
 * │         │                                                   │
 * │         ├── volatile       → 🚫 No operar                  │
 * │         ├── trending_bull  → 📈 TrendMomentum              │
 * │         │                      (fallback: Breakout)         │
 * │         ├── trending_bear  → 📉 TrendMomentum              │
 * │         │                      (fallback: Breakout)         │
 * │         ├── breakout       → 💥 BreakoutStrategy           │
 * │         │                      (fallback: TrendMomentum)   │
 * │         └── ranging        → ↔️ MeanReversion              │
 * │                               (fallback: Scalping)         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * El sistema elige la estrategia PRIMARIA según el régimen.
 * Si la primaria no genera señal, intenta la SECUNDARIA (fallback).
 * Esto maximiza las oportunidades sin comprometer la lógica por régimen.
 */

import { Strategy } from './base/Strategy.js';
import { OHLCV, Signal } from '../types/index.js';
import { MarketRegimeDetector, RegimeResult } from './MarketRegimeDetector.js';
import { TrendMomentumStrategy } from './TrendMomentumStrategy.js';
import { MeanReversionStrategy } from './MeanReversionStrategy.js';
import { BreakoutStrategy } from './BreakoutStrategy.js';
import { ScalpingStrategy } from './ScalpingStrategy.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class MultiStrategyOrchestrator extends Strategy {
    name = 'Multi-Strategy System v1.0';
    description = '4 estrategias con selección automática por régimen de mercado';

    private readonly regimeDetector: MarketRegimeDetector;
    private readonly trendStrategy: TrendMomentumStrategy;
    private readonly meanRevStrategy: MeanReversionStrategy;
    private readonly breakoutStrategy: BreakoutStrategy;
    private readonly scalpingStrategy: ScalpingStrategy;

    // Estado público para dashboard
    private lastRegime: RegimeResult | null = null;
    private lastActiveStrategy: string = 'none';
    private signalCounts: Record<string, number> = {
        trend: 0, meanReversion: 0, breakout: 0, scalping: 0, none: 0,
    };

    constructor() {
        super();
        this.regimeDetector   = new MarketRegimeDetector();
        this.trendStrategy    = new TrendMomentumStrategy();
        this.meanRevStrategy  = new MeanReversionStrategy();
        this.breakoutStrategy = new BreakoutStrategy();
        this.scalpingStrategy = new ScalpingStrategy();
    }

    async analyze(data: OHLCV[]): Promise<Signal | null> {
        if (data.length < 210) return null;

        // ── 1. Detectar régimen actual ────────────────────────────────────
        const regime = this.regimeDetector.detect(data);
        this.lastRegime = regime;

        logger.debug({
            regime: regime.type,
            adx: regime.adx.toFixed(1),
            atrPct: (regime.atrPct * 100).toFixed(2) + '%',
            bbWidth: (regime.bbWidth * 100).toFixed(2) + '%',
            description: regime.description,
        }, '🔍 Régimen de mercado detectado');

        // ── 2. Enrutar a estrategia según régimen ─────────────────────────
        let signal: Signal | null = null;

        switch (regime.type) {

            // ─ Volatilidad extrema: proteger capital ─────────────────────
            case 'volatile':
                logger.warn('⛔ [Orchestrator] Mercado volátil — sin señales');
                this.lastActiveStrategy = 'none (volatile)';
                this.signalCounts.none++;
                return null;

            // ─ Tendencia alcista ──────────────────────────────────────────
            case 'trending_bull':
                if (config.STRATEGY_TREND_ENABLED) {
                    signal = await this.trendStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'TrendMomentum'; this.signalCounts.trend++; break; }
                }
                // Fallback: breakout dentro de tendencia (pull-back roto)
                if (config.STRATEGY_BREAKOUT_ENABLED) {
                    signal = await this.breakoutStrategy.analyze(data);
                    if (signal) {
                        if (signal.type === 'short') signal = null;
                        else { this.lastActiveStrategy = 'Breakout (fallback bull)'; this.signalCounts.breakout++; }
                    }
                }
                break;

            // ─ Tendencia bajista ──────────────────────────────────────────
            case 'trending_bear':
                if (config.STRATEGY_TREND_ENABLED) {
                    signal = await this.trendStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'TrendMomentum'; this.signalCounts.trend++; break; }
                }
                // Fallback: solo SHORT en tendencia bajista
                if (config.STRATEGY_BREAKOUT_ENABLED) {
                    signal = await this.breakoutStrategy.analyze(data);
                    if (signal) {
                        if (signal.type === 'long') signal = null;
                        else { this.lastActiveStrategy = 'Breakout (fallback bear)'; this.signalCounts.breakout++; }
                    }
                }
                break;

            // ─ Ruptura de consolidación ───────────────────────────────────
            case 'breakout':
                if (config.STRATEGY_BREAKOUT_ENABLED) {
                    signal = await this.breakoutStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'Breakout'; this.signalCounts.breakout++; break; }
                }
                // Fallback: tendencia para capturar el movimiento ya iniciado
                if (config.STRATEGY_TREND_ENABLED) {
                    signal = await this.trendStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'TrendMomentum (fallback breakout)'; this.signalCounts.trend++; }
                }
                break;

            // ─ Mercado lateral ────────────────────────────────────────────
            case 'ranging':
                if (config.STRATEGY_MEAN_REVERSION_ENABLED) {
                    signal = await this.meanRevStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'MeanReversion'; this.signalCounts.meanReversion++; break; }
                }
                // Fallback: scalping para capturar impulsos cortos en el rango
                if (config.STRATEGY_SCALPING_ENABLED) {
                    signal = await this.scalpingStrategy.analyze(data);
                    if (signal) { this.lastActiveStrategy = 'Scalping (fallback ranging)'; this.signalCounts.scalping++; }
                }
                break;
        }

        // ── 3. Enriquecer señal con info del régimen ──────────────────────
        if (signal) {
            signal.metadata = {
                ...signal.metadata,
                orchestrator: {
                    regime: regime.type,
                    regimeDescription: regime.description,
                    adx: regime.adx,
                    atrPct: regime.atrPct,
                    activeStrategy: this.lastActiveStrategy,
                    confidence: regime.confidence,
                },
            };

            logger.info({
                strategy: this.lastActiveStrategy,
                type: signal.type,
                regime: regime.type,
                confidence: signal.confidence,
            }, `✅ [Orchestrator] Señal generada por: ${this.lastActiveStrategy}`);
        }

        return signal;
    }

    // ── Getters para dashboard y Telegram ────────────────────────────────

    public getCurrentRegime(): RegimeResult | null {
        return this.lastRegime;
    }

    public getActiveStrategy(): string {
        return this.lastActiveStrategy;
    }

    public getSignalCounts(): Record<string, number> {
        return { ...this.signalCounts };
    }

    /**
     * Resumen de estado para el comando /analisis de Telegram
     */
    public getSummary(): string {
        if (!this.lastRegime) return 'Sin datos de régimen aún';
        const r = this.lastRegime;
        const counts = this.signalCounts;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return [
            `📊 Régimen: ${r.description}`,
            `🔢 ADX: ${r.adx.toFixed(1)} | ATR: ${(r.atrPct * 100).toFixed(2)}%`,
            `🎯 Estrategia activa: ${this.lastActiveStrategy}`,
            '',
            `📈 Señales por estrategia (total ${total}):`,
            `  • Trend: ${counts.trend}`,
            `  • MeanRev: ${counts.meanReversion}`,
            `  • Breakout: ${counts.breakout}`,
            `  • Scalping: ${counts.scalping}`,
        ].join('\n');
    }
}

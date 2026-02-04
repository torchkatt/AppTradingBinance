import { config } from '../config/index.js';
import { riskLogger as logger } from '../utils/logger.js';
import { Position, Trade } from '../types/index.js';
import type { ExchangeConnector } from './ExchangeConnector.js';
import type { CapitalManager } from './CapitalManager.js';
import { saveRiskState, loadRiskState } from './RiskStatePersistence.js';
/**
 * Sistema de gestión de riesgo multinivel con circuit breakers
 * 
 * Responsabilidades:
 * - Calcular tamaño de posiciones basado en riesgo
 * - Implementar circuit breakers (pérdida diaria máxima)
 * - Limitar número de posiciones abiertas
 * - Tracking de PnL diario
 */
export class RiskManager {
    private dailyPnL: number = 0;
    private openPositions: Map<string, Position> = new Map();
    private lastResetDate: string = new Date().toISOString().split('T')[0];
    private dailyTrades: number = 0;
    private accountBalance: number = 0;
    private exchange: ExchangeConnector;
    private capitalManager?: CapitalManager;
    constructor(initialBalance: number, exchange: ExchangeConnector, capitalManager?: CapitalManager) {
        this.accountBalance = initialBalance;
        this.exchange = exchange;
        this.capitalManager = capitalManager;
        logger.info({ initialBalance }, 'RiskManager initialized');
    }
    /**
     * Obtiene el balance efectivo para cálculos de riesgo
     * Si hay CapitalManager, usa el operating capital, sino usa accountBalance
     */
    private getEffectiveBalance(): number {
        return this.capitalManager ? this.capitalManager.getOperatingCapital() : this.accountBalance;
    }
    /**
     * Inicializa el RiskManager cargando estado del día (si existe DB)
     */
    async initialize(): Promise<void> {
        // Cargar estado persistente
        const savedState = loadRiskState();
        if (savedState) {
            this.openPositions = savedState.positions;
            this.dailyPnL = savedState.dailyPnL;
            this.dailyTrades = savedState.dailyTrades;
            // Recalcular reset diario por si acaso
            this.checkDailyReset();
            logger.info({
                restoredPositions: this.openPositions.size,
                restoredPnL: this.dailyPnL,
            }, '✅ Estado de RiskManager restaurado desde disco');
        } else {
            // Primera ejecución o sin estado
            this.checkDailyReset();
            logger.info('Iniciando estado de RiskManager limpio');
        }
        logger.info({
            dailyPnL: this.dailyPnL,
            balance: this.accountBalance
        }, 'RiskManager ready');
    }
    /**
     * Calcula el tamaño de posición permitido basado en gestión de riesgo
     * 
     * Formula: Position Size = (Account Balance * Risk%) / Distance to Stop Loss
     */
    calculatePositionSize(
        entryPrice: number,
        stopLossPrice: number,
        symbol?: string
    ): number {
        const balance = this.getEffectiveBalance();

        // 1. Cálculo basado en Riesgo Fijo (1% del capital)
        const riskAmount = balance * config.RISK_PER_TRADE_PCT;
        const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
        const riskBasedSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;

        // 2. Cálculo basado en Apalancamiento Fijo (User Request: 10x)
        // Dividimos el capital total entre el máximo de posiciones y multiplicamos por el leverage
        const leverageBasedSize = (balance / config.MAX_OPEN_POSITIONS) * config.DEFAULT_LEVERAGE / entryPrice;

        // 3. Selección de tamaño: Priorizar apalancamiento solicitado por usuario
        // AUNQUE el riesgo sea mayor al 1%, el usuario pidió 10x leverage en TODAS las operaciones.
        let positionSize = leverageBasedSize;

        // Límite de seguridad: Nunca más del capital balance total * leverage total
        const absoluteMaxSize = (balance * config.DEFAULT_LEVERAGE) / entryPrice;
        positionSize = Math.min(positionSize, absoluteMaxSize);

        // Redondear al paso del exchange
        const roundedSize = this.roundToStepSize(positionSize, symbol);

        logger.info({
            entryPrice,
            stopLossPrice,
            riskBasedSize,
            leverageBasedSize,
            finalSize: positionSize,
            roundedSize,
            symbol,
            leverage: config.DEFAULT_LEVERAGE
        }, 'Position size calculated (Fixed Leverage Mode)');

        return roundedSize;
    }
    /**
     * Redondea la cantidad al step size del exchange según el símbolo
     */
    private roundToStepSize(quantity: number, symbol?: string): number {
        if (!symbol) {
            // Sin símbolo, usar valor por defecto conservador
            return Math.floor(quantity * 100) / 100; // 2 decimales
        }
        // Obtener límites del exchange dinámicamente
        const limits = this.exchange.getMarketLimits(symbol);
        if (!limits) {
            logger.warn({ symbol }, 'No market limits found, using conservative defaults');
            // Fallback a valores seguros si no hay metadata
            const minQty = 0.01;
            const stepSize = 0.01;
            const rounded = Math.floor(quantity / stepSize) * stepSize;
            return Math.max(rounded, minQty);
        }
        // Usar límites dinámicos del exchange
        const { stepSize, minQty } = limits;
        let rounded = Math.floor(quantity / stepSize) * stepSize;
        // Para step sizes enteros (>= 1), asegurar que sea entero
        if (stepSize >= 1) {
            rounded = Math.floor(rounded);
        }
        // Asegurar que cumple con el mínimo
        const finalQty = Math.max(rounded, minQty);
        logger.debug({
            symbol,
            requestedQty: quantity,
            stepSize,
            minQty,
            rounded,
            finalQty
        }, 'Quantity rounded using dynamic limits');
        return finalQty;
    }
    /**
     * Verifica si se puede abrir una nueva posición
     * Implementa múltiples circuit breakers
     */
    canOpenPosition(symbol: string): { allowed: boolean; reason?: string } {
        this.checkDailyReset();
        // Circuit Breaker #1: Pérdida diaria máxima
        const dailyLossPct = this.dailyPnL / this.accountBalance;
        if (dailyLossPct <= -config.MAX_DAILY_LOSS_PCT) {
            const reason = `🔴 CIRCUIT BREAKER: Pérdida diaria de ${(dailyLossPct * 100).toFixed(2)}% alcanzada (límite: ${(config.MAX_DAILY_LOSS_PCT * 100).toFixed(2)}%)`;
            logger.warn({ dailyPnL: this.dailyPnL, dailyLossPct }, reason);
            return { allowed: false, reason };
        }
        // Circuit Breaker #2: Número máximo de posiciones abiertas
        if (this.openPositions.size >= config.MAX_OPEN_POSITIONS) {
            const reason = `⚠️ Número máximo de posiciones abiertas alcanzado (${config.MAX_OPEN_POSITIONS})`;
            logger.warn({ openPositions: this.openPositions.size }, reason);
            return { allowed: false, reason };
        }
        // Circuit Breaker #3: Ya existe posición abierta para este símbolo
        if (this.openPositions.has(symbol)) {
            const reason = `⚠️ Ya existe una posición abierta para ${symbol}`;
            logger.warn({ symbol }, reason);
            return { allowed: false, reason };
        }
        // Circuit Breaker #4: Número máximo de trades diarios
        const MAX_DAILY_TRADES = 200; // Incrementado a 200 para estrategia de alta frecuencia
        if (this.dailyTrades >= MAX_DAILY_TRADES) {
            const reason = `⚠️ Número máximo de trades diarios alcanzado (${MAX_DAILY_TRADES})`;
            logger.warn({ dailyTrades: this.dailyTrades }, reason);
            return { allowed: false, reason };
        }
        return { allowed: true };
    }
    /**
     * Registra una nueva posición abierta
     */
    registerPosition(position: Position): void {
        this.openPositions.set(position.symbol, position);
        this.dailyTrades++;
        logger.info({
            symbol: position.symbol,
            side: position.side,
            quantity: position.quantity,
            entryPrice: position.entryPrice,
            openPositions: this.openPositions.size
        }, 'Position registered');
        // Persistir estado
        saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades);
    }
    /**
     * Actualiza el stop loss de una posición (Trailing Stop)
     */
    updatePositionStopLoss(symbol: string, newStopLoss: number): void {
        const position = this.openPositions.get(symbol);
        if (position) {
            const oldStopLoss = position.stopLoss;
            position.stopLoss = newStopLoss;
            this.openPositions.set(symbol, position);
            logger.info({
                symbol,
                side: position.side,
                oldStopLoss,
                newStopLoss
            }, '🔄 Stop Loss updated (Trailing)');
            // Persistir estado
            saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades);
        }
    }
    /**
     * Cierra una posición y actualiza métricas de PnL
     */
    closePosition(symbol: string, exitPrice: number): Trade | null {
        const position = this.openPositions.get(symbol);
        if (!position) {
            logger.error({ symbol }, 'Attempted to close non-existent position');
            return null;
        }
        const pnl = this.calculatePnL(position, exitPrice);
        const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;
        this.dailyPnL += pnl;
        this.accountBalance += pnl;
        const trade: Trade = {
            symbol,
            side: position.side,
            entryTime: position.timestamp,
            exitTime: Date.now(),
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            pnl,
            pnlPercent,
        };
        this.openPositions.delete(symbol);
        const emoji = pnl > 0 ? '✅' : '❌';
        logger.info({
            symbol,
            pnl,
            pnlPercent,
            dailyPnL: this.dailyPnL,
            balance: this.accountBalance,
            openPositions: this.openPositions.size
        }, `${emoji} Position closed`);
        // Persistir estado
        saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades);
        return trade;
    }
    /**
     * Calcula el PnL de una posición
     */
    private calculatePnL(position: Position, exitPrice: number): number {
        const multiplier = position.side === 'long' ? 1 : -1;
        return (exitPrice - position.entryPrice) * position.quantity * multiplier;
    }
    /**
     * Verifica si el día cambió y resetea métricas diarias
     */
    private checkDailyReset(): void {
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.lastResetDate) {
            logger.info({
                date: this.lastResetDate,
                dailyPnL: this.dailyPnL,
                dailyTrades: this.dailyTrades,
                finalBalance: this.accountBalance
            }, 'Daily reset - Previous day summary');
            this.dailyPnL = 0;
            this.dailyTrades = 0;
            this.lastResetDate = today;
            // Persistir estado (nuevo día)
            saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades);
        }
    }
    /**
     * Obtiene el estado actual del risk manager
     */
    getState() {
        return {
            accountBalance: this.accountBalance,
            dailyPnL: this.dailyPnL,
            dailyPnLPercent: (this.dailyPnL / this.accountBalance) * 100,
            dailyTrades: this.dailyTrades,
            openPositions: this.openPositions.size,
            positions: Array.from(this.openPositions.values()),
            date: this.lastResetDate,
        };
    }
    /**
     * Actualiza el balance de la cuenta (para sincronización con exchange)
     */
    updateBalance(newBalance: number): void {
        logger.info({
            oldBalance: this.accountBalance,
            newBalance,
            difference: newBalance - this.accountBalance
        }, 'Account balance updated');
        this.accountBalance = newBalance;
    }
}

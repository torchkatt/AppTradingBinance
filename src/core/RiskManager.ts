import { config } from '../config/index.js';
import { riskLogger as logger } from '../utils/logger.js';
import { Position, Trade } from '../types/index.js';
import type { ExchangeConnector } from './ExchangeConnector.js';
import type { CapitalManager } from './CapitalManager.js';
import { saveRiskState, loadRiskState } from './RiskStatePersistence.js';

// Definición de Grupos de Correlación
const CORRELATION_GROUPS: Record<string, string[]> = {
    GROUP_A: ['BTC', 'ETH', 'SOL', 'BNB', 'AVAX', 'ADA', 'XRP', 'DOT', 'LTC'], // Majors (Alta correlación)
    GROUP_B: ['DOGE', 'SHIB', 'PEPE', 'FLOKI'], // Memes (Alta volatilidad propia)
    GROUP_C: ['OTHERS'] // Resto del mercado
};
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

    // v4.0 Streak Control
    private consecutiveLosses: number = 0;
    private cooldownUntil: number = 0;
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
            this.lastResetDate = savedState.date; // [FIX] Restore date from file

            // Recalcular reset diario
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

        // Límite de seguridad: Nunca exceder el apalancamiento máximo asignado
        const absoluteMaxSize = (balance * config.DEFAULT_LEVERAGE) / entryPrice;
        positionSize = Math.min(positionSize, leverageBasedSize, absoluteMaxSize);

        logger.info({
            entryPrice,
            stopLossPrice,
            riskAmount,
            riskPerUnit,
            riskBasedSize,
            leverageBasedSize,
            finalSize: positionSize,
            symbol
        }, 'Calculated Position Size (Risk First)');

        // Redondear al paso del exchange
        const roundedSize = this.roundToStepSize(positionSize, symbol);

        // [FIX] Validar Valor Nocional Mínimo (Min Order Value)
        // Binance requiere min $5. Usamos $6 para evitar rechazos por fluctuación.
        const notionalValue = roundedSize * entryPrice;
        const MIN_NOTIONAL = 6.0;

        if (notionalValue < MIN_NOTIONAL) {
            logger.warn({
                symbol,
                notionalValue,
                MIN_NOTIONAL,
                roundedSize,
                entryPrice
            }, '⚠️ Position size too small (below Min Notional). Scaling up not possible without risking too much. SKIPPING.');
            return 0; // Rechazar entrada si es muy pequeña
        }

        logger.info({
            entryPrice,
            stopLossPrice,
            riskBasedSize,
            leverageBasedSize,
            finalSize: positionSize,
            roundedSize,
            notionalValue,
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
        let finalQty = Math.max(rounded, minQty);

        // [FIX] Validar Min Notional (Valor Mínimo en USD)
        // Binance Futures suele requerir ~$5 USD. Usamos $6 de buffer.
        // const minNotional = limits.minNotional || 5.0; // Default 5 si no hay info
        // Necesitamos el precio entry para validar (pero aquí no lo tenemos exacto, usamos el limits si es posible? no, el roundToStepSize no tiene precio).
        // Modificación: roundToStepSize debería recibir precio o validar fuera.
        // Como roundToStepSize es privado y solo llamado de calculatePositionSize, 
        // mejor validamos el Notional Value en calculatePositionSize que SÍ tiene el precio.

        return finalQty;
    }

    /**
     * Verifica si el símbolo está correlacionado con alguna posición abierta
     */
    private isCorrelated(newSymbol: string): boolean {
        // Encontrar grupo del nuevo símbolo
        const newAssetBase = newSymbol.split('/')[0];
        let newGroup = 'GROUP_C';

        for (const [groupName, assets] of Object.entries(CORRELATION_GROUPS)) {
            if (assets.includes(newAssetBase)) {
                newGroup = groupName;
                break;
            }
        }

        // Si es de "OTHERS", asumimos no correlación directa (simplificación)
        if (newGroup === 'GROUP_C') return false;

        // Verificar contra posiciones abiertas
        for (const [openSymbol] of this.openPositions) {
            const openAssetBase = openSymbol.split('/')[0];
            let openGroup = 'GROUP_C';

            for (const [groupName, assets] of Object.entries(CORRELATION_GROUPS)) {
                if (assets.includes(openAssetBase)) {
                    openGroup = groupName;
                    break;
                }
            }

            // Si ambos son del mismo grupo (y no son OTHERS), hay correlación
            if (openGroup === newGroup && newGroup !== 'GROUP_C') {
                logger.warn({
                    newSymbol,
                    correlatedWith: openSymbol,
                    group: newGroup
                }, '🚫 Trade rejected due to CORRELATION rule');
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si se puede abrir una nueva posición
     * Implementa múltiples circuit breakers
     */
    canOpenPosition(symbol: string): { allowed: boolean; reason?: string } {
        this.checkDailyReset();

        // Circuit Breaker #0: Cooldown por racha negativa (v4.0)
        if (Date.now() < this.cooldownUntil) {
            const minutesLeft = Math.ceil((this.cooldownUntil - Date.now()) / 60000);
            const reason = `❄️ COOLDOWN ACTIVO: Esperando ${minutesLeft} min tras ${this.consecutiveLosses} pérdidas seguidas.`;
            logger.warn({ cooldownUntil: this.cooldownUntil, minutesLeft }, reason);
            return { allowed: false, reason };
        }

        // Circuit Breaker #0.5: Meta Diaria Alcanzada (Take Profit Diario)
        if (this.isDailyGoalReached()) {
            const reason = `🎯 META DIARIA ALCANZADA: ${(config.MAX_DAILY_PROFIT_PCT * 100).toFixed(1)}% Profit. Bot descansando.`;
            logger.info({ dailyPnL: this.dailyPnL }, reason);
            return { allowed: false, reason };
        }

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
        // Circuit Breaker #4: Correlación de Activos
        if (this.isCorrelated(symbol)) {
            const reason = `⚠️ Activo correlacionado con posición existente (Grupo idéntico)`;
            return { allowed: false, reason };
        }
        // Circuit Breaker #5: Número máximo de trades diarios
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
        saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades, this.lastResetDate);
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
            saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades, this.lastResetDate);
        }
    }
    /**
     * Cierra una posición y actualiza métricas de PnL (Neto de Comisiones)
     */
    closePosition(symbol: string, exitPrice: number): Trade | null {
        const position = this.openPositions.get(symbol);
        if (!position) {
            logger.error({ symbol }, 'Attempted to close non-existent position');
            return null;
        }

        // 1. Calcular PnL Bruto
        const grossPnL = this.calculatePnL(position, exitPrice);

        // 2. Calcular Comisiones Estimadas (Entry + Exit)
        // Fee = Notional Value * Fee Rate
        const entryFee = (position.entryPrice * position.quantity) * config.ESTIMATED_FEE_PCT;
        const exitFee = (exitPrice * position.quantity) * config.ESTIMATED_FEE_PCT;
        const totalFee = entryFee + exitFee;

        // 3. Calcular PnL Neto
        const netPnL = grossPnL - totalFee;

        const pnlPercent = (netPnL / (position.entryPrice * position.quantity)) * 100;

        this.dailyPnL += netPnL; // Acumular PnL NETO
        this.accountBalance += netPnL; // Actualizar Balance con lo real

        const trade: Trade = {
            symbol,
            side: position.side,
            entryTime: position.timestamp,
            exitTime: Date.now(),
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            pnl: netPnL, // Guardar Neto
            pnlPercent,
        };
        this.openPositions.delete(symbol);
        const emoji = netPnL > 0 ? '✅' : '❌';

        // v4.0 Streak Logic relies on Net PnL now
        if (netPnL < 0) {
            this.consecutiveLosses++;
            logger.warn({ consecutiveLosses: this.consecutiveLosses }, '📉 Consecutive Loss recorded');
            if (this.consecutiveLosses >= config.MAX_CONSECUTIVE_LOSSES) {
                this.cooldownUntil = Date.now() + config.COOLDOWN_TIME_MS;
                logger.warn({
                    consecutiveLosses: this.consecutiveLosses,
                    cooldownMinutes: config.COOLDOWN_TIME_MS / 60000
                }, '❄️ MAX CONSECUTIVE LOSSES REACHED -> TRIGGERING COOLDOWN');
            }
        } else {
            // Reset streak on win
            if (this.consecutiveLosses > 0) {
                logger.info({ previousStreak: this.consecutiveLosses }, '🔁 Winning trade resets consecutive loss streak');
            }
            this.consecutiveLosses = 0;
        }

        logger.info({
            symbol,
            grossPnL,
            totalFee,
            netPnL,
            pnlPercent,
            dailyPnL: this.dailyPnL,
            balance: this.accountBalance,
            openPositions: this.openPositions.size,
            consecutiveLosses: this.consecutiveLosses
        }, `${emoji} Position closed (Fee Adjusted)`);

        // Persistir estado
        saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades, this.lastResetDate);
        return trade;
    }

    /**
     * Verifica si se ha alcanzado la meta diaria de ganancia (15%)
     */
    isDailyGoalReached(): boolean {
        // Evitar división por cero
        if (this.accountBalance === 0) return false;

        // const currentProfitPct = this.dailyPnL / (this.accountBalance - this.dailyPnL); // Profit sobre Capital Inicial del día (estimado)
        // O más simple: PnL / Balance Actual (conservador)
        // Usemos config.INITIAL_BALANCE o calculemos el balance de inicio del día si es posible.
        // Por simplicidad usaremos Balance Actual como base, lo cual es conservador si vamos ganando.
        // O mejor: Profit / (Balance - Profit) aprox = ROI del día.

        const startDayBalance = this.accountBalance - this.dailyPnL;
        const roi = startDayBalance > 0 ? this.dailyPnL / startDayBalance : 0;

        return roi >= config.MAX_DAILY_PROFIT_PCT;
    }

    /**
     * Calcula el PnL de una posición (Bruto)
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
            saveRiskState(this.openPositions, this.dailyPnL, this.dailyTrades, this.lastResetDate);
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
     * Obtiene una posición específica por símbolo
     */
    getPosition(symbol: string): Position | undefined {
        return this.openPositions.get(symbol);
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

import { Strategy } from '../strategies/base/Strategy.js';
import { OHLCV, Trade, BacktestResult } from '../types/index.js';
import { backtestLogger as logger } from '../utils/logger.js';

/**
 * Motor de backtesting profesional
 * 
 * Simula trades con datos históricos y calcula métricas institucionales
 */
export class BacktestEngine {
    private initialCapital: number;
    private currentCapital: number;
    private equity: number[] = [];
    private trades: Trade[] = [];
    private openPosition: { entry: OHLCV; quantity: number; side: 'long' | 'short' } | null = null;

    constructor(initialCapital: number = 10000) {
        this.initialCapital = initialCapital;
        this.currentCapital = initialCapital;
    }

    /**
     * Ejecuta backtest con una estrategia sobre datos históricos
     */
    async run(strategy: Strategy, data: OHLCV[]): Promise<BacktestResult> {
        logger.info({
            strategy: strategy.name,
            bars: data.length,
            period: `${new Date(data[0].timestamp).toISOString().split('T')[0]} to ${new Date(data[data.length - 1].timestamp).toISOString().split('T')[0]}`,
            initialCapital: this.initialCapital
        }, 'Starting backtest');

        // Reset estado
        this.currentCapital = this.initialCapital;
        this.equity = [this.initialCapital];
        this.trades = [];
        this.openPosition = null;

        // Iterar sobre los datos
        for (let i = 50; i < data.length; i++) {
            const historicalData = data.slice(0, i + 1);
            const currentBar = data[i];

            // Si hay posición abierta, verificar sl/tp
            if (this.openPosition) {
                const exitPrice = this.checkStopLossOrTakeProfit(currentBar);
                if (exitPrice) {
                    this.closePosition(currentBar, exitPrice);
                }
            }

            // Si no hay posición, buscar señal
            if (!this.openPosition) {
                const signal = await strategy.analyze(historicalData);

                if (signal && (signal.type === 'long' || signal.type === 'short')) {
                    this.openPosition = {
                        entry: currentBar,
                        quantity: this.calculatePositionSize(currentBar.close, signal.stopLoss || 0),
                        side: signal.type,
                    };

                    // Registrar trade entry
                    this.trades.push({
                        symbol: 'BACKTEST',
                        side: signal.type,
                        entryTime: currentBar.timestamp,
                        entryPrice: currentBar.close,
                        quantity: this.openPosition.quantity,
                        strategy: strategy.name,
                        metadata: {
                            ...signal.metadata,
                            stopLoss: signal.stopLoss,
                            takeProfit: signal.takeProfit
                        },
                    });

                    logger.debug({
                        type: signal.type,
                        price: currentBar.close,
                        confidence: signal.confidence,
                    }, 'Position opened');
                }
            }

            // Actualizar equity
            let currentEquity = this.currentCapital;
            if (this.openPosition) {
                const unrealizedPnL = this.calculateUnrealizedPnL(currentBar.close);
                currentEquity += unrealizedPnL;
            }
            this.equity.push(currentEquity);
        }

        // Cerrar posición abierta al final
        if (this.openPosition) {
            this.closePosition(data[data.length - 1], data[data.length - 1].close);
        }

        return this.calculateMetrics(strategy.name);
    }

    /**
     * Calcula tamaño de posición (simplificado para backtest)
     */
    private calculatePositionSize(entryPrice: number, stopLoss: number): number {
        const riskAmount = this.currentCapital * 0.01; // 1% risk
        const riskPerUnit = Math.abs(entryPrice - stopLoss);

        if (riskPerUnit === 0) return 0.01;

        const quantity = riskAmount / riskPerUnit;
        const maxQuantity = (this.currentCapital * 0.1) / entryPrice; // Max 10% position

        return Math.min(quantity, maxQuantity);
    }

    /**
     * Verifica si se debe cerrar posición por SL/TP
     */
    private checkStopLossOrTakeProfit(bar: OHLCV): number | null {
        if (!this.openPosition) return null;

        const lastTrade = this.trades[this.trades.length - 1];
        const stopLoss = lastTrade.metadata?.stopLoss;
        const takeProfit = lastTrade.metadata?.takeProfit;

        if (this.openPosition.side === 'long') {
            // Stop loss tocado
            if (stopLoss && bar.low <= stopLoss) {
                return stopLoss;
            }
            // Take profit tocado
            if (takeProfit && bar.high >= takeProfit) {
                return takeProfit;
            }
        } else {
            // Short position
            if (stopLoss && bar.high >= stopLoss) {
                return stopLoss;
            }
            if (takeProfit && bar.low <= takeProfit) {
                return takeProfit;
            }
        }

        return null;
    }

    /**
     * Calcula PnL no realizado
     */
    private calculateUnrealizedPnL(currentPrice: number): number {
        if (!this.openPosition) return 0;

        const multiplier = this.openPosition.side === 'long' ? 1 : -1;
        return (currentPrice - this.openPosition.entry.close) * this.openPosition.quantity * multiplier;
    }

    /**
     * Cierra posición y actualiza capital
     */
    private closePosition(bar: OHLCV, exitPrice: number): void {
        if (!this.openPosition) return;

        const lastTrade = this.trades[this.trades.length - 1];

        const multiplier = this.openPosition.side === 'long' ? 1 : -1;
        const pnl = (exitPrice - this.openPosition.entry.close) * this.openPosition.quantity * multiplier;
        const pnlPercent = (pnl / (this.openPosition.entry.close * this.openPosition.quantity)) * 100;

        // Actualizar trade
        lastTrade.exitTime = bar.timestamp;
        lastTrade.exitPrice = exitPrice;
        lastTrade.pnl = pnl;
        lastTrade.pnlPercent = pnlPercent;

        this.currentCapital += pnl;
        this.openPosition = null;

        logger.debug({
            pnl,
            pnlPercent: pnlPercent.toFixed(2),
            newCapital: this.currentCapital.toFixed(2),
        }, 'Position closed');
    }

    /**
     * Calcula todas las métricas de performance
     */
    private calculateMetrics(strategyName: string): BacktestResult {
        const completedTrades = this.trades.filter(t => t.exitTime !== undefined);

        if (completedTrades.length === 0) {
            logger.warn('No completed trades in backtest');
            return this.getEmptyResult();
        }

        const winningTrades = completedTrades.filter(t => t.pnl! > 0);
        const losingTrades = completedTrades.filter(t => t.pnl! < 0);

        const totalWin = winningTrades.reduce((sum, t) => sum + t.pnl!, 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0));
        const totalPnL = totalWin - totalLoss;

        const avgWin = winningTrades.length > 0 ? totalWin / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;

        const returns = this.calculateReturns();
        const sharpeRatio = this.calculateSharpeRatio(returns);
        const maxDrawdown = this.calculateMaxDrawdown();
        const maxDrawdownPercent = (maxDrawdown / this.initialCapital) * 100;

        const result: BacktestResult = {
            totalTrades: completedTrades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: winningTrades.length / completedTrades.length,
            totalReturn: totalPnL,
            totalReturnPercent: (totalPnL / this.initialCapital) * 100,
            sharpeRatio,
            maxDrawdown,
            maxDrawdownPercent,
            profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 999 : 0,
            avgWin,
            avgLoss,
            largestWin: Math.max(...completedTrades.map(t => t.pnl!)),
            largestLoss: Math.min(...completedTrades.map(t => t.pnl!)),
            trades: completedTrades,
            equityCurve: this.equity,
        };

        this.logResults(result, strategyName);
        return result;
    }

    /**
     * Calcula returns diarios
     */
    private calculateReturns(): number[] {
        const returns: number[] = [];
        for (let i = 1; i < this.equity.length; i++) {
            const dailyReturn = (this.equity[i] - this.equity[i - 1]) / this.equity[i - 1];
            returns.push(dailyReturn);
        }
        return returns;
    }

    /**
     * Calcula Sharpe Ratio anualizado
     */
    private calculateSharpeRatio(returns: number[]): number {
        if (returns.length === 0) return 0;

        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return 0;

        // Anualizado (asumiendo 252 días de trading)
        return (mean / stdDev) * Math.sqrt(252);
    }

    /**
     * Calcula Maximum Drawdown
     */
    private calculateMaxDrawdown(): number {
        let maxDrawdown = 0;
        let peak = this.equity[0];

        for (const value of this.equity) {
            if (value > peak) peak = value;
            const drawdown = peak - value;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        return maxDrawdown;
    }

    /**
     * Resultado vacío si no hay trades
     */
    private getEmptyResult(): BacktestResult {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0,
            totalReturn: 0,
            totalReturnPercent: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: 0,
            profitFactor: 0,
            avgWin: 0,
            avgLoss: 0,
            largestWin: 0,
            largestLoss: 0,
            trades: [],
            equityCurve: this.equity,
        };
    }

    /**
     * Log resultados del backtest
     */
    private logResults(result: BacktestResult, strategyName: string): void {
        logger.info('');
        logger.info('═══════════════════════════════════════════════════');
        logger.info(`  BACKTEST RESULTS - ${strategyName}`);
        logger.info('═══════════════════════════════════════════════════');
        logger.info('');
        logger.info(`  Initial Capital:  $${this.initialCapital.toFixed(2)}`);
        logger.info(`  Final Capital:    $${this.currentCapital.toFixed(2)}`);
        logger.info(`  Total Return:     $${result.totalReturn.toFixed(2)} (${result.totalReturnPercent.toFixed(2)}%)`);
        logger.info('');
        logger.info(`  Total Trades:     ${result.totalTrades}`);
        logger.info(`  Winning Trades:   ${result.winningTrades} (${(result.winRate * 100).toFixed(1)}%)`);
        logger.info(`  Losing Trades:    ${result.losingTrades}`);
        logger.info('');
        logger.info(`  Avg Win:          $${result.avgWin.toFixed(2)}`);
        logger.info(`  Avg Loss:         $${result.avgLoss.toFixed(2)}`);
        logger.info(`  Largest Win:      $${result.largestWin.toFixed(2)}`);
        logger.info(`  Largest Loss:     $${result.largestLoss.toFixed(2)}`);
        logger.info('');
        logger.info(`  Profit Factor:    ${result.profitFactor.toFixed(2)}`);
        logger.info(`  Sharpe Ratio:     ${result.sharpeRatio.toFixed(2)}`);
        logger.info(`  Max Drawdown:     $${result.maxDrawdown.toFixed(2)} (${result.maxDrawdownPercent.toFixed(2)}%)`);
        logger.info('');

        // Rating de la estrategia
        let grade = 'F';
        if (result.sharpeRatio >= 2 && result.winRate >= 0.5 && result.profitFactor >= 2) grade = 'A+';
        else if (result.sharpeRatio >= 1.5 && result.winRate >= 0.45 && result.profitFactor >= 1.5) grade = 'A';
        else if (result.sharpeRatio >= 1 && result.winRate >= 0.4 && result.profitFactor >= 1.2) grade = 'B';
        else if (result.sharpeRatio >= 0.5 && result.profitFactor >= 1) grade = 'C';
        else if (result.totalReturnPercent > 0) grade = 'D';

        logger.info(`  Strategy Grade:   ${grade}`);
        logger.info('');
        logger.info('═══════════════════════════════════════════════════');
        logger.info('');
    }
}

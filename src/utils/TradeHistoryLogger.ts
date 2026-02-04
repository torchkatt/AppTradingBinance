/**
 * Trade History Logger
 * Guarda historial de todos los trades en archivo JSON persistente
 */
import fs from 'fs';
import path from 'path';

export interface TradeRecord {
    timestamp: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    entryTime: string;
    exitTime?: string;

    // Señales
    signal: {
        type: 'long' | 'short';
        confidence: number;
        rsi: number;
        percentB: number;
        ema200: number;
    };

    // Take Profit / Stop Loss
    takeProfit: number;
    stopLoss: number;

    // Resultado
    status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
    pnl?: number;
    pnlPercent?: number;
    commissions?: number;

    // Metadata
    strategy: string;
    timeframe: string;
}

export interface DailyStats {
    date: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    totalCommissions: number;
    netPnL: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
}

export class TradeHistoryLogger {
    private historyFile: string;
    private statsFile: string;
    private historyDir: string;

    constructor() {
        this.historyDir = path.join(process.cwd(), 'trade_history');
        this.historyFile = path.join(this.historyDir, 'trades.json');
        this.statsFile = path.join(this.historyDir, 'daily_stats.json');

        // Crear directorio si no existe
        if (!fs.existsSync(this.historyDir)) {
            fs.mkdirSync(this.historyDir, { recursive: true });
        }

        // Crear archivos si no existen
        if (!fs.existsSync(this.historyFile)) {
            fs.writeFileSync(this.historyFile, JSON.stringify([], null, 2));
        }
        if (!fs.existsSync(this.statsFile)) {
            fs.writeFileSync(this.statsFile, JSON.stringify([], null, 2));
        }
    }

    /**
     * Registrar nuevo trade cuando se abre
     */
    logTradeOpen(trade: Omit<TradeRecord, 'timestamp' | 'entryTime' | 'status'>): void {
        const trades = this.loadTrades();

        const newTrade: TradeRecord = {
            ...trade,
            timestamp: new Date().toISOString(),
            entryTime: new Date().toISOString(),
            status: 'open'
        };

        trades.push(newTrade);
        this.saveTrades(trades);

        console.log(`✅ Trade registrado: ${trade.symbol} ${trade.side} @ ${trade.entryPrice}`);
    }

    /**
     * Actualizar trade cuando se cierra
     */
    logTradeClose(
        symbol: string,
        exitPrice: number,
        status: 'closed_tp' | 'closed_sl' | 'closed_manual',
        pnl: number,
        commissions: number
    ): void {
        const trades = this.loadTrades();

        // Buscar último trade abierto de este símbolo
        const openTradeIndex = trades.findIndex(
            t => t.symbol === symbol && t.status === 'open'
        );

        if (openTradeIndex === -1) {
            console.warn(`⚠️ No se encontró trade abierto para ${symbol}`);
            return;
        }

        const trade = trades[openTradeIndex];
        const entryPrice = trade.entryPrice;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 * (trade.side === 'long' ? 1 : -1);

        // Actualizar trade
        trades[openTradeIndex] = {
            ...trade,
            exitPrice,
            exitTime: new Date().toISOString(),
            status,
            pnl,
            pnlPercent,
            commissions
        };

        this.saveTrades(trades);
        this.updateDailyStats();

        console.log(`✅ Trade cerrado: ${symbol} | PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    }

    /**
     * Obtener todos los trades
     */
    loadTrades(): TradeRecord[] {
        try {
            const data = fs.readFileSync(this.historyFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Guardar trades
     */
    private saveTrades(trades: TradeRecord[]): void {
        fs.writeFileSync(this.historyFile, JSON.stringify(trades, null, 2));
    }

    /**
     * Actualizar estadísticas diarias
     */
    private updateDailyStats(): void {
        const trades = this.loadTrades();
        const today = new Date().toISOString().split('T')[0];

        // Filtrar trades completados de hoy
        const todayTrades = trades.filter(t =>
            t.exitTime && t.exitTime.startsWith(today)
        );

        if (todayTrades.length === 0) return;

        const wins = todayTrades.filter(t => (t.pnl || 0) > 0);
        const losses = todayTrades.filter(t => (t.pnl || 0) < 0);

        const totalPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const totalCommissions = todayTrades.reduce((sum, t) => sum + (t.commissions || 0), 0);

        const stats: DailyStats = {
            date: today,
            totalTrades: todayTrades.length,
            wins: wins.length,
            losses: losses.length,
            winRate: (wins.length / todayTrades.length) * 100,
            totalPnL,
            totalCommissions,
            netPnL: totalPnL - totalCommissions,
            averageWin: wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0,
            averageLoss: losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0,
            largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl || 0)) : 0,
            largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl || 0)) : 0
        };

        // Guardar stats
        const allStats = this.loadDailyStats();
        const existingIndex = allStats.findIndex(s => s.date === today);

        if (existingIndex >= 0) {
            allStats[existingIndex] = stats;
        } else {
            allStats.push(stats);
        }

        fs.writeFileSync(this.statsFile, JSON.stringify(allStats, null, 2));
    }

    /**
     * Cargar estadísticas diarias
     */
    loadDailyStats(): DailyStats[] {
        try {
            const data = fs.readFileSync(this.statsFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Obtener resumen de performance
     */
    getPerformanceSummary(days: number = 7): {
        totalTrades: number;
        winRate: number;
        totalPnL: number;
        averageDailyPnL: number;
        bestDay: number;
        worstDay: number;
    } {
        const stats = this.loadDailyStats();
        const recent = stats.slice(-days);

        const totalTrades = recent.reduce((sum, s) => sum + s.totalTrades, 0);
        const totalWins = recent.reduce((sum, s) => sum + s.wins, 0);
        const totalPnL = recent.reduce((sum, s) => sum + s.netPnL, 0);

        return {
            totalTrades,
            winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
            totalPnL,
            averageDailyPnL: recent.length > 0 ? totalPnL / recent.length : 0,
            bestDay: recent.length > 0 ? Math.max(...recent.map(s => s.netPnL)) : 0,
            worstDay: recent.length > 0 ? Math.min(...recent.map(s => s.netPnL)) : 0
        };
    }

    /**
     * Obtener trades abiertos actuales
     */
    getOpenTrades(): TradeRecord[] {
        return this.loadTrades().filter(t => t.status === 'open');
    }
}

// Exportar singleton
export const tradeHistory = new TradeHistoryLogger();

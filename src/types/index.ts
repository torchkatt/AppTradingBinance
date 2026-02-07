/**
 * Tipos compartidos en todo el sistema
 */

export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface Position {
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    quantity: number;
    timestamp: number;
    stopLoss?: number;
    takeProfit?: number;
    strategy?: string;
    metadata?: Record<string, any>;
}

export interface Trade {
    id?: number;
    symbol: string;
    side: 'long' | 'short';
    entryTime: number;
    exitTime?: number;
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    pnl?: number;
    pnlPercent?: number;
    commission?: number; // Total fee paid (entry + exit)
    strategy?: string;
    metadata?: Record<string, any>;
}

/**
 * Market limits and precision info loaded from exchange
 */
export interface MarketLimits {
    symbol: string;
    stepSize: number;          // Minimum quantity increment
    minQty: number;            // Minimum order quantity
    minNotional?: number;      // Minimum order value (price × quantity)
    pricePrecision?: number;   // Price decimal places
}

export interface Signal {
    type: 'long' | 'short' | 'close';
    confidence: number; // 0-1
    stopLoss?: number;
    takeProfit?: number;
    metadata?: Record<string, any>;
}

export interface BacktestResult {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalReturn: number;
    totalReturnPercent: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    trades: Trade[];
    equityCurve: number[];
}

export interface DailyMetrics {
    date: string;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
    winRate: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
}

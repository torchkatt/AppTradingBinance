// API Client for dashboard
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3005';
console.log('API Client initialized with URL:', API_BASE_URL);

const apiClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface BotStatus {
    isRunning: boolean;
    mode: 'running' | 'paused' | 'stopped' | 'cooldown';
    tradingMode?: string;
    uptime: number;
    lastUpdate: number;
}

export interface Position {
    symbol: string;
    side: 'buy' | 'sell';
    entryPrice: number;
    amount: number;
    stopLoss?: number;
    takeProfit?: number;
    timestamp: number;
}

export interface Metrics {
    balance: number;
    totalRealBalance?: number;
    dailyPnL: number;
    allTimePnL: number;
    unrealizedPnL: number;
    dailyTrades: number;
    winRate: number;
    consecutiveLosses: number;
    circuitBreakers: {
        dailyLoss: { active: boolean; current: number; limit: number };
        cooldown: { active: boolean; until: number | null };
        maxPositions: { active: boolean; current: number; limit: number };
    };
}

export interface Config {
    EXCHANGE_NAME: string;
    EXCHANGE_API_KEY: string;
    EXCHANGE_API_SECRET: string;
    EXCHANGE_TESTNET: boolean;
    MAX_POSITION_SIZE_PCT: number;
    MAX_DAILY_LOSS_PCT: number;
    RISK_PER_TRADE_PCT: number;
    MAX_OPEN_POSITIONS: number;
    DEFAULT_LEVERAGE: number;
    TAKE_PROFIT_ROI: number;
    STOP_LOSS_ROI: number;
    MAX_DAILY_PROFIT_PCT?: number;
    TRAILING_ACTIVATION_ROI: number;
    TRAILING_LOCK_ROI?: number;
    MAX_VOLATILITY_ATR_PCT?: number;
    SCAN_INTERVAL_MS: number;
    POSITION_CHECK_INTERVAL_MS: number;
    MAX_TRADE_DURATION_MS?: number;
    MAX_CONSECUTIVE_LOSSES?: number;
    COOLDOWN_TIME_MS?: number;
    SYMBOLS: string[];
    TIMEFRAME: string;
    [key: string]: unknown; // Allow for other fields
}

export const api = {
    async getStatus(): Promise<BotStatus> {
        const { data } = await apiClient.get('/status');
        return data;
    },

    async getPositions(): Promise<{ positions: Position[]; totalPnL: number; count: number }> {
        const { data } = await apiClient.get('/positions');
        return data;
    },

    async emergencyClose(): Promise<void> {
        await apiClient.post('/control', { action: 'emergency_close' });
    },

    async syncBalance(): Promise<void> {
        await apiClient.post('/control', { action: 'sync' });
    },

    async getMetrics(): Promise<Metrics> {
        const { data } = await apiClient.get('/metrics');
        return data;
    },

    async controlBot(action: 'start' | 'stop' | 'pause' | 'emergency_close'): Promise<{ success: boolean; message: string }> {
        const { data } = await apiClient.post('/control', { action });
        return data;
    },

    async getConfig(): Promise<{ config: Config }> {
        const { data } = await apiClient.get('/config');
        return data;
    },
    async getTrades(limit?: number): Promise<{ trades: any[] }> {
        const { data } = await apiClient.get(`/trades?limit=${limit || 50}`);
        return data;
    },
    async getBinanceHistory(days: number = 7): Promise<{ history: any[] }> {
        const { data } = await apiClient.get(`/binance-history?days=${days}`);
        return data;
    },

    async updateConfig(updates: Partial<Config>): Promise<{ success: boolean; message: string }> {
        const { data } = await apiClient.put('/config', updates);
        return data;
    },
    async restart(): Promise<{ success: boolean; message: string }> {
        const { data } = await apiClient.post('/restart');
        return data;
    },
};

export default api;

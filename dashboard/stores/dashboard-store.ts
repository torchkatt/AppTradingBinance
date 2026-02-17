import { create } from 'zustand';
import type { BotStatus, Position, Metrics } from '../lib/api';

export interface Trade {
    symbol: string;
    side: 'buy' | 'sell';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    pnl?: number;
    pnlPercent?: number;
    timestamp: number;
}

export interface Notification {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: number;
}

interface DashboardState {
    status: BotStatus | null;
    positions: Position[];
    metrics: Metrics | null;
    isLoading: boolean;
    error: string | null;
    isConnected: boolean;
    trades: Trade[];
    notifications: Notification[];

    setStatus: (status: BotStatus) => void;
    setPositions: (positions: Position[]) => void;
    setMetrics: (metrics: Metrics) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setConnected: (connected: boolean) => void;
    addTrade: (trade: Trade) => void;
    addNotification: (notification: Notification) => void;
    clearNotifications: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
    status: null,
    positions: [],
    metrics: null,
    isLoading: false,
    error: null,
    isConnected: false,
    trades: [],
    notifications: [],

    setStatus: (status) => set({ status }),
    setPositions: (positions) => set({ positions }),
    setMetrics: (metrics) => set({ metrics }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setConnected: (isConnected) => set({ isConnected }),
    addTrade: (trade) => set((state) => ({ trades: [trade, ...state.trades].slice(0, 100) })),
    addNotification: (notification) => set((state) => ({
        notifications: [notification, ...state.notifications].slice(0, 50)
    })),
    clearNotifications: () => set({ notifications: [] }),
}));

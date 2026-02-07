import fs from 'fs';
import path from 'path';
import { Position } from '../types/index.js';
import { logger } from '../utils/logger.js';

const STATE_FILE = path.join(process.cwd(), 'risk_state.json');

export interface RiskState {
    positions: Map<string, Position>;
    dailyPnL: number;
    dailyTrades: number;
    lastUpdated: number;
    date: string; // [FIX] Persist the date string to handle periodic resets correctly
}

/**
 * Guarda el estado del RiskManager en disco
 */
export function saveRiskState(
    positions: Map<string, Position>,
    dailyPnL: number,
    dailyTrades: number,
    date: string // [FIX] Require date
): void {
    try {
        const state = {
            positions: Array.from(positions.entries()),
            dailyPnL,
            dailyTrades,
            lastUpdated: Date.now(),
            date
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        logger.error({ error }, 'Failed to save risk state');
    }
}

/**
 * Carga el estado del RiskManager desde disco
 */
export function loadRiskState(): RiskState | null {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return null;
        }

        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        const state = JSON.parse(data);

        // Convert Array back to Map
        // Validate that yesterday's state doesn't pollute today if checked here, 
        // but RiskManager handles daily reset internally based on dates.
        return {
            positions: new Map(state.positions),
            dailyPnL: state.dailyPnL,
            dailyTrades: state.dailyTrades,
            lastUpdated: state.lastUpdated,
            date: state.date || new Date().toISOString().split('T')[0] // Fallback for old files
        };

    } catch (error) {
        logger.error({ error }, 'Failed to load risk state');
        return null;
    }
}

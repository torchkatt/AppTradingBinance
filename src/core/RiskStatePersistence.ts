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
}

/**
 * Guarda el estado del RiskManager en disco
 */
export function saveRiskState(
    positions: Map<string, Position>,
    dailyPnL: number,
    dailyTrades: number
): void {
    try {
        const state = {
            positions: Array.from(positions.entries()), // Convert Map to Array for JSON
            dailyPnL,
            dailyTrades,
            lastUpdated: Date.now()
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
            lastUpdated: state.lastUpdated
        };

    } catch (error) {
        logger.error({ error }, 'Failed to load risk state');
        return null;
    }
}

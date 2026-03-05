import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { botProvider } from './botProvider.js';
import { db } from '../database/index.js';

// Cache for daily PnL to avoid hammering Binance API (refresh every 30s)
let dailyPnLCache: { value: number; timestamp: number } | null = null;
const DAILY_PNL_CACHE_TTL_MS = 30_000;

export function createApiRoutes() {
    const router = Router();

    /**
     * GET /api/status
     */
    router.get('/status', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.json({
                    isRunning: false,
                    mode: 'initialization',
                    uptime: process.uptime(),
                    lastUpdate: Date.now(),
                    message: 'Bot is initializing...'
                });
                return;
            }
            res.json({
                isRunning: bot.botIsRunning(),
                mode: bot.botIsRunning() ? (bot.isInCooldown() ? 'cooldown' : 'running') : 'stopped',
                tradingMode: bot.getMode(),
                uptime: process.uptime(),
                lastUpdate: Date.now()
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get status');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/positions
     */
    router.get('/positions', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.json({ positions: [], totalPnL: 0, count: 0 });
                return;
            }
            const state = bot.getRiskState();
            const positions = Array.from(state.positions.values());

            res.json({
                positions,
                totalPnL: 0,
                count: positions.length
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get positions');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/metrics
     */
    router.get('/metrics', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.json({
                    balance: 0,
                    dailyPnL: 0,
                    dailyTrades: 0,
                    winRate: 0,
                    consecutiveLosses: 0,
                    circuitBreakers: {
                        dailyLoss: { active: false, current: 0, limit: 0 },
                        consecutiveLosses: { active: false, current: 0, limit: 0 }
                    }
                });
                return;
            }
            const state = bot.getRiskState();
            const riskManager = (bot as any).riskManager;
            const history = riskManager?.getDailyHistory() || [];
            const winningTrades = history.filter((t: any) => t.pnl && t.pnl > 0).length;
            const winRate = history.length > 0 ? winningTrades / history.length : 0;
            const consecutiveLosses = riskManager?.getConsecutiveLosses() || 0;

            // Fetch dailyPnL directly from Binance (cached 30s) — always today's data
            const now = Date.now();
            if (!dailyPnLCache || now - dailyPnLCache.timestamp > DAILY_PNL_CACHE_TTL_MS) {
                try {
                    const livePnL = await bot.getExchange().fetchDailyPnL();
                    dailyPnLCache = { value: livePnL, timestamp: now };
                } catch {
                    dailyPnLCache = { value: state.dailyPnL, timestamp: now };
                }
            }
            const dailyPnL = dailyPnLCache.value;

            res.json({
                balance: state.accountBalance,
                totalRealBalance: state.totalRealBalance,
                dailyPnL,
                allTimePnL: state.allTimePnL,
                unrealizedPnL: state.unrealizedPnL,
                dailyTrades: state.dailyTrades,
                winRate,
                consecutiveLosses,
                circuitBreakers: {
                    dailyLoss: {
                        active: dailyPnL <= -(state.accountBalance * config.MAX_DAILY_LOSS_PCT),
                        current: dailyPnL,
                        limit: -(state.accountBalance * config.MAX_DAILY_LOSS_PCT)
                    },
                    consecutiveLosses: {
                        active: consecutiveLosses >= (config.MAX_CONSECUTIVE_LOSSES || 5),
                        current: consecutiveLosses,
                        limit: config.MAX_CONSECUTIVE_LOSSES || 5
                    }
                }
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get metrics');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * POST /api/control
     */
    router.post('/control', async (req, res) => {
        const { action } = req.body;
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }

            switch (action) {
                case 'start':
                    await bot.start();
                    res.json({ success: true, message: 'Bot iniciado correctamente' });
                    break;
                case 'stop':
                    await bot.stop();
                    res.json({ success: true, message: 'Bot detenido correctamente' });
                    break;
                case 'pause':
                    bot.pause();
                    res.json({ success: true, message: 'Bot pausado' });
                    break;
                case 'resume':
                    bot.resume();
                    res.json({ success: true, message: 'Bot reanudado' });
                    break;
                case 'emergency_close':
                    await bot.emergencyCloseAll();
                    res.json({ success: true, message: 'Cierre de emergencia ejecutado' });
                    break;
                case 'sync':
                    const rm = bot.getRiskManager();
                    if (rm && (rm as any).syncBalanceWithExchange) {
                        await (rm as any).syncBalanceWithExchange();
                        res.json({ success: true, message: 'Balance y PnL sincronizados con el exchange' });
                    } else {
                        res.status(400).json({ error: 'Sincronización no disponible' });
                    }
                    break;
                default:
                    res.status(400).json({ error: 'Acción no válida' });
            }
        } catch (error: any) {
            logger.error({ error: error.message, action }, 'Failed to execute control action');
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * DELETE /api/positions/:symbol
     */
    router.delete('/positions/:symbol', async (req, res) => {
        const { symbol } = req.params;
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }
            await bot.closePositionFromDashboard(symbol);
            res.json({ success: true, message: `Cerrando posición para ${symbol}` });
        } catch (error: any) {
            logger.error({ error: error.message, symbol }, 'Failed to close position');
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/config
     */
    router.get('/config', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            const currentConfig = bot ? bot.getConfig() : config;
            res.json({ config: currentConfig });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get config');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * PUT /api/config
     */
    router.put('/config', async (req, res) => {
        try {
            const updates = req.body;
            const { updateEnvFile } = await import('../config/index.js');
            await updateEnvFile(updates);
            res.json({
                success: true,
                message: 'Configuración actualizada. Reinicie el bot para aplicar los cambios.'
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to update config');
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    });

    /**
     * POST /api/sync-balance
     */
    router.post('/sync-balance', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }
            await bot.getRiskManager().syncBalanceWithExchange();
            const state = bot.getRiskState();
            res.json({
                success: true,
                message: 'Balance sincronizado con el exchange',
                balance: state.accountBalance
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to sync balance');
            res.status(500).json({ error: error.message });
        }
    });
    /**
     * GET /api/trades
     */
    router.get('/trades', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const trades = await db.getRecentTrades(limit);
            res.json({ trades });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch trades');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/binance-history
     */
    router.get('/binance-history', async (req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }
            const days = parseInt(req.query.days as string) || 7;
            const history = await bot.getExchange().getIncomeHistory(days);
            res.json({ history });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch Binance history');
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/restart
     */
    router.post('/restart', async (_req, res) => {
        try {
            res.json({ success: true, message: 'Sistema reiniciando...' });

            // Delay exit to allow response to be sent
            setTimeout(() => {
                logger.info('🔄 Restarting system via API request...');
                process.exit(0);
            }, 1000);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to restart');
            res.status(500).json({ error: 'Failed to initiate restart' });
        }
    });

    /**
     * GET /api/analysis
     * Provides real-time scanner metrics (ADX, RSI, Trend) for all symbols
     */
    router.get('/analysis', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }
            res.json({
                analysis: bot.getMarketAnalysis(),
                timestamp: Date.now()
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get analysis');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/orchestrator
     * Returns current market regime, active strategy, and signal counts
     */
    router.get('/orchestrator', async (_req, res) => {
        try {
            const bot = botProvider.getBot();
            if (!bot) {
                res.status(503).json({ error: 'Bot is initializing' });
                return;
            }
            const info = bot.getOrchestratorInfo();
            if (!info) {
                res.json({ available: false, message: 'Orchestrator not active yet' });
                return;
            }
            res.json({ available: true, ...info, timestamp: Date.now() });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to get orchestrator info');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}

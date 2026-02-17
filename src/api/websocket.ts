import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { TradingBot } from '../core/TradingBot.js';
import { logger } from '../utils/logger.js';
import { botProvider } from './botProvider.js';

/**
 * WebSocket handler for real-time dashboard updates
 */
export function setupWebSocket(httpServer: HTTPServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    let connectedClients = 0;
    let currentBot: TradingBot | null = null;

    const bindBot = (bot: TradingBot) => {
        if (currentBot) return; // Already bound
        currentBot = bot;
        logger.info('🔗 WebSocket server bound to TradingBot');

        // Listen for trade closed events from bot
        bot.on('trade_closed', (trade) => {
            io.emit('trade_closed', {
                trade,
                timestamp: Date.now()
            });
            logger.info({ symbol: trade.symbol, pnl: trade.pnl }, '📊 Broadcasting trade closed to dashboard');
        });

        bot.on('alert', (alert) => {
            io.emit('alert', {
                type: alert.type,
                message: alert.message,
                timestamp: Date.now()
            });
            logger.debug({ type: alert.type }, '🔔 Broadcasting alert to dashboard');
        });
    };

    // Check if bot is already registered
    const existingBot = botProvider.getBot();
    if (existingBot) {
        bindBot(existingBot);
    }

    // Listen for future bot registration
    botProvider.on('registered', (bot: TradingBot) => {
        bindBot(bot);
    });

    io.on('connection', (socket) => {
        connectedClients++;
        logger.info({ socketId: socket.id, totalClients: connectedClients }, '📡 Dashboard client connected');

        socket.emit('connected', { timestamp: Date.now(), botLoaded: !!currentBot });

        if (currentBot) {
            sendFullUpdate(socket, currentBot);
        }

        socket.on('close_position', async (data) => {
            try {
                if (!currentBot) throw new Error('Bot not initialized');
                const { symbol } = data;
                logger.info({ symbol, socketId: socket.id }, '🔄 Close position request from dashboard');
                await currentBot.closePositionFromDashboard(symbol);
                socket.emit('position_closed', { success: true, symbol, timestamp: Date.now() });
            } catch (error: any) {
                logger.error({ error: error.message }, '❌ Failed to close position via WebSocket');
                socket.emit('error', { message: error.message });
            }
        });

        socket.on('control_bot', async (data) => {
            try {
                if (!currentBot) throw new Error('Bot not initialized');
                const { action } = data;
                logger.info({ action, socketId: socket.id }, '🎮 Bot control request from dashboard');

                switch (action) {
                    case 'pause':
                        currentBot.pause();
                        break;
                    case 'resume':
                        currentBot.resume();
                        break;
                    case 'emergency_close':
                        await currentBot.emergencyCloseAll();
                        break;
                }

                io.emit('bot_status_changed', {
                    mode: currentBot.getMode(),
                    isRunning: currentBot.botIsRunning(),
                    timestamp: Date.now()
                });

                socket.emit('control_success', { action, timestamp: Date.now() });
            } catch (error: any) {
                logger.error({ error: error.message }, '❌ Failed to control bot via WebSocket');
                socket.emit('error', { message: error.message });
            }
        });

        socket.on('disconnect', () => {
            connectedClients--;
            logger.info({ socketId: socket.id, totalClients: connectedClients }, '📴 Dashboard client disconnected');
        });
    });

    // Broadcast position updates every 2 seconds
    setInterval(() => {
        if (connectedClients > 0 && currentBot) {
            try {
                const state = currentBot.getRiskState();
                io.emit('positions_update', {
                    positions: Array.from(state.positions.values()),
                    timestamp: Date.now()
                });
            } catch (error: any) {
                logger.error({ error: error.message }, 'Failed to broadcast positions update');
            }
        }
    }, 2000);

    // Broadcast metrics update every 5 seconds
    setInterval(() => {
        if (connectedClients > 0 && currentBot) {
            try {
                const state = currentBot.getRiskState();
                const riskManager = (currentBot as any).riskManager;
                const history = riskManager?.getDailyHistory() || [];
                const winningTrades = history.filter((t: any) => t.pnl && t.pnl > 0).length;

                io.emit('metrics_update', {
                    balance: state.accountBalance,
                    dailyPnL: state.dailyPnL,
                    allTimePnL: state.allTimePnL,
                    unrealizedPnL: state.unrealizedPnL,
                    dailyTrades: state.dailyTrades,
                    winRate: history.length > 0 ? winningTrades / history.length : 0,
                    consecutiveLosses: riskManager?.getConsecutiveLosses() || 0,
                    timestamp: Date.now()
                });
            } catch (error: any) {
                logger.error({ error: error.message }, 'Failed to broadcast metrics update');
            }
        }
    }, 5000);

    logger.info('✅ WebSocket server initialized');
    return io;
}

/**
 * Send full state update to a newly connected client
 */
function sendFullUpdate(socket: any, bot: TradingBot) {
    try {
        const state = bot.getRiskState();

        socket.emit('positions_update', {
            positions: Array.from(state.positions.values()),
            timestamp: Date.now()
        });

        socket.emit('metrics_update', {
            balance: state.accountBalance,
            dailyPnL: state.dailyPnL,
            dailyTrades: state.dailyTrades,
            timestamp: Date.now()
        });

        socket.emit('bot_status_changed', {
            mode: bot.getMode(),
            isRunning: bot.botIsRunning(),
            timestamp: Date.now()
        });

        logger.debug('📤 Sent full state update to new client');
    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to send full update');
    }
}

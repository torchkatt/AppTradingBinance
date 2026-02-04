import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { RiskManager } from '../core/RiskManager.js';
import { TelegramNotifier } from '../monitoring/TelegramNotifier.js';
import { Strategy } from '../strategies/base/Strategy.js';
import { db } from '../database/index.js';
import { config } from '../config/index.js';
import { tradeLogger as logger } from '../utils/logger.js';
import { OHLCV, Position } from '../types/index.js';
import { Mutex } from 'async-mutex';
/**
 * Motor de trading en tiempo real
 * 
 * Responsabilidades:
 * - Monitorear mercado en tiempo real
 * - Ejecutar análisis de estrategias
 * - Abrir y cerrar posiciones
 * - Gestionar stop loss y take profit
 * - Recuperarse de errores
 */
export class TradingBot {
    private exchange: ExchangeConnector;
    private riskManager: RiskManager;
    private notifier: TelegramNotifier;
    private strategies: Strategy[];
    private isRunning: boolean = false;
    private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
    private statusInterval: NodeJS.Timeout | null = null;
    private mutex: Mutex = new Mutex();

    constructor(
        exchange: ExchangeConnector,
        riskManager: RiskManager,
        notifier: TelegramNotifier,
        strategies: Strategy[]
    ) {
        this.exchange = exchange;
        this.riskManager = riskManager;
        this.notifier = notifier;
        this.strategies = strategies;
    }
    /**
     * Inicia el bot de trading
     */
    async start(): Promise<void> {
        logger.info('🚀 Starting trading bot...');
        this.isRunning = true;
        // Configurar comandos de Telegram
        this.setupTelegramCommands();
        // Cargar posiciones abiertas del exchange (en caso de restart)
        await this.loadOpenPositions();
        // Iniciar monitoreo para cada símbolo
        for (const symbol of config.SYMBOLS) {
            await this.startMonitoring(symbol);
        }
        // Iniciar monitoreo de alta frecuencia (1s) para TP/SL
        this.startFastMonitoring();
        logger.info({
            symbols: config.SYMBOLS,
            strategies: this.strategies.map(s => s.name),
            timeframe: config.TIMEFRAME,
        }, '✅ Trading bot started');
        await this.notifier.sendStartupMessage();
        // Iniciar reporte periódico de estado (cada 1 minuto)
        this.startStatusReporting();
    }
    /**
     * Inicia el ciclo de reportes de estado
     */
    private startStatusReporting(): void {
        // Reporte cada 60 segundos
        const REPORT_INTERVAL = 60000;
        this.statusInterval = setInterval(async () => {
            if (!this.isRunning) return;
            try {
                const state = this.riskManager.getState();
                const positions = [];
                for (const pos of state.positions) {
                    try {
                        const currentPrice = await this.getCurrentPrice(pos.symbol);
                        const pnl = pos.side === 'long'
                            ? (currentPrice - pos.entryPrice) * pos.quantity
                            : (pos.entryPrice - currentPrice) * pos.quantity;
                        const pnlPercent = (pnl / (pos.entryPrice * pos.quantity)) * 100;
                        positions.push({
                            symbol: pos.symbol,
                            side: pos.side,
                            entryPrice: pos.entryPrice,
                            currentPrice,
                            quantity: pos.quantity,
                            pnl,
                            pnlPercent
                        });
                    } catch (error) {
                        logger.error({ error, symbol: pos.symbol }, 'Failed to get price for status report');
                    }
                }
                await this.notifier.sendPositionStatusReport({
                    balance: state.accountBalance,
                    dailyPnL: state.dailyPnL,
                    positions
                });
            } catch (error) {
                logger.error({ error }, 'Error in status reporting loop');
            }
        }, REPORT_INTERVAL);
        logger.info('⏱️ Status reporting loop started (1m interval)');
    }
    /**
     * Configura comandos interactivos de Telegram
     */
    private setupTelegramCommands(): void {
        // Comando /estado
        this.notifier.registerCommand('estado', async (bot, msg) => {
            const state = this.riskManager.getState();
            const statusMsg = [
                '🤖 <b>Estado del Bot</b>',
                '',
                `▶️ Corriendo: <code>${this.isRunning ? 'SÍ ✅' : 'NO ❌'}</code>`,
                `💰 Balance: <code>$${state.accountBalance.toFixed(2)}</code>`,
                `📊 Posiciones Abiertas: <code>${state.openPositions}</code>`,
                `📈 P&L Diario: <code>${state.dailyPnL >= 0 ? '+' : ''}$${state.dailyPnL.toFixed(2)}</code>`,
                '',
                state.positions.length > 0 ? '<b>Posiciones:</b>' : '<i>Sin posiciones abiertas</i>',
            ];
            for (const pos of state.positions) {
                const currentPrice = await this.getCurrentPrice(pos.symbol);
                const pnl = pos.side === 'long'
                    ? (currentPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - currentPrice) * pos.quantity;
                statusMsg.push(
                    `• ${pos.symbol} ${pos.side.toUpperCase()}`,
                    `  Entrada: <code>$${pos.entryPrice.toFixed(2)}</code> | Qty: <code>${pos.quantity.toFixed(6)}</code>`,
                    `  P&L: <code>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</code>`
                );
            }
            await bot.sendMessage(msg.chat.id, statusMsg.join('\n'), { parse_mode: 'HTML' });
            return;
        });
        // Comando /balance
        this.notifier.registerCommand('balance', async (bot, msg) => {
            const balance = await this.exchange.getBalance();
            const balanceMsg = [
                '💰 <b>Balance de Cuenta</b>',
                '',
                `Total: <code>$${balance.total.toFixed(2)} USDT</code>`,
                `Disponible: <code>$${balance.free.toFixed(2)} USDT</code>`,
                `En Uso: <code>$${balance.used.toFixed(2)} USDT</code>`,
            ];
            await bot.sendMessage(msg.chat.id, balanceMsg.join('\n'), { parse_mode: 'HTML' });
            return;
        });
        // Comando /metricas
        this.notifier.registerCommand('metricas', async (bot, msg) => {
            const state = this.riskManager.getState();
            const statsMsg = [
                '📊 <b>Estadísticas</b>',
                '',
                `P&L Diario: <code>${state.dailyPnL >= 0 ? '+' : ''}$${state.dailyPnL.toFixed(2)}</code>`,
                `Posiciones: <code>${state.openPositions}</code>`,
                `Balance: <code>$${state.accountBalance.toFixed(2)}</code>`,
                '',
                '<i>Más métricas próximamente...</i>',
            ];
            await bot.sendMessage(msg.chat.id, statsMsg.join('\n'), { parse_mode: 'HTML' });
            return;
        });
        // Comando /ordenes (Con IDs numéricos)
        this.notifier.registerCommand('ordenes', async (bot, msg) => {
            const state = this.riskManager.getState();
            if (state.positions.length === 0) {
                await bot.sendMessage(msg.chat.id, 'ℹ️ <i>No hay posiciones activas.</i>', { parse_mode: 'HTML' });
                return;
            }
            let msgLines = ['📦 <b>Posiciones Abiertas</b>', ''];
            for (let i = 0; i < state.positions.length; i++) {
                const pos = state.positions[i];
                const index = i + 1; // 1-based index for user
                const currentPrice = await this.getCurrentPrice(pos.symbol);
                const pnl = pos.side === 'long'
                    ? (currentPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - currentPrice) * pos.quantity;
                const pnlPercent = (pnl / (pos.entryPrice * pos.quantity)) * 100;
                const timeOpen = Math.floor((Date.now() - pos.timestamp) / 60000); // Minutes
                msgLines.push(
                    `<b>[${index}] ${pos.symbol}</b> ${pos.side.toUpperCase()}`,
                    `   ⏳ ${timeOpen} min | 💰 <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)</b>`,
                    `   📏 ${pos.quantity} @ $${pos.entryPrice.toFixed(4)} ➜ $${currentPrice.toFixed(4)}`,
                    `   🛑 SL: ${pos.stopLoss ? '$' + pos.stopLoss.toFixed(4) : '-'} | 🎯 TP: ${pos.takeProfit ? '$' + pos.takeProfit.toFixed(4) : '-'}`,
                    ''
                );
            }
            msgLines.push('<i>Para cerrar: /cerrar [número] (ej: /cerrar 1)</i>');
            await bot.sendMessage(msg.chat.id, msgLines.join('\n'), { parse_mode: 'HTML' });
            return;
        });
        // Comando /cerrar (Por ID o Símbolo)
        this.notifier.registerCommand('cerrar', async (bot, msg) => {
            const parts = msg.text.split(' ');
            if (parts.length < 2) {
                await bot.sendMessage(msg.chat.id, '⚠️ Uso: <code>/cerrar [ID o SIMBOLO]</code>\nEjemplo: <code>/cerrar 1</code> o <code>/cerrar BTC</code>', { parse_mode: 'HTML' });
                return;
            }
            const input = parts[1];
            const state = this.riskManager.getState();
            let symbol = '';
            // Check if input is a number
            const index = parseInt(input);
            if (!isNaN(index)) {
                // User provided a number
                if (index < 1 || index > state.positions.length) {
                    await bot.sendMessage(msg.chat.id, `❌ ID Inválido. Usa <code>/ordenes</code> para ver los IDs disponibles (1-${state.positions.length}).`, { parse_mode: 'HTML' });
                    return;
                }
                const position = state.positions[index - 1]; // 0-based index
                symbol = position.symbol;
            } else {
                // User provided a symbol
                symbol = input.toUpperCase();
                if (!symbol.includes('/')) symbol += '/USDT';
            }
            // Verify position exists
            const hasPosition = state.positions.some(p => p.symbol === symbol);
            if (!hasPosition) {
                await bot.sendMessage(msg.chat.id, `❌ No se encontró posición para <b>${symbol}</b>`, { parse_mode: 'HTML' });
                return;
            }
            await bot.sendMessage(msg.chat.id, `⏳ Cerrando <b>${symbol}</b>...`, { parse_mode: 'HTML' });
            try {
                // Call explicit close logic
                await this.closePosition(symbol); // This triggers notifications automatically
            } catch (error) {
                await bot.sendMessage(msg.chat.id, `❌ Error al cerrar: ${error}`, { parse_mode: 'HTML' });
            }
            return;
        });
        // Comando /pnl
        this.notifier.registerCommand('pnl', async (bot, msg) => {
            const state = this.riskManager.getState();
            const emoji = state.dailyPnL >= 0 ? '🟢' : '🔴';
            const pnlMsg = [
                '📅 <b>Daily Profit & Loss</b>',
                '',
                `${emoji} <b>Net PnL: $${state.dailyPnL.toFixed(2)}</b>`,
                `📊 Trades Today: ${state.dailyTrades}`,
                `💰 Balance: $${state.accountBalance.toFixed(2)}`,
                '',
                '<i>Resets automáticamente a las 00:00 UTC</i>'
            ].join('\n');
            await bot.sendMessage(msg.chat.id, pnlMsg, { parse_mode: 'HTML' });
            return;
        });
        logger.debug('Telegram interactive commands registered');
    }
    /**
     * Detiene el bot de trading
     */
    async stop(): Promise<void> {
        logger.info('⏸ Stopping trading bot...');
        this.isRunning = false;
        // Detener todos los intervalos de monitoreo
        for (const [symbol, interval] of this.monitoringIntervals) {
            clearInterval(interval);
            logger.debug({ symbol }, 'Monitoring stopped');
        }
        this.monitoringIntervals.clear();
        // Cerrar posiciones abiertas si es necesario
        const state = this.riskManager.getState();
        if (state.openPositions > 0) {
            logger.warn({ positions: state.positions }, 'Warning: Open positions exist');
            await this.notifier.sendAlert(
                'WARNING',
                `⚠️ Bot stopped with ${state.openPositions} open position(s).\n\nManual intervention may be required.`
            );
        }
        logger.info('✅ Trading bot stopped');
    }
    /**
     * Inicia el monitoreo de un símbolo específico
     */
    private async startMonitoring(symbol: string): Promise<void> {
        logger.info({ symbol }, 'Starting market monitoring');
        // Calcular intervalo en milisegundos
        const intervalMs = this.getIntervalMs(config.TIMEFRAME);
        // Ejecutar análisis inmediato
        await this.analyzeAndTrade(symbol);
        // Configurar intervalo de monitoreo
        const interval = setInterval(async () => {
            if (!this.isRunning) return;
            try {
                await this.analyzeAndTrade(symbol);
            } catch (error: any) {
                logger.error({ error: error.message, symbol }, 'Error in monitoring loop');
            }
        }, intervalMs);
        this.monitoringIntervals.set(symbol, interval);
    }
    /**
     * Analiza el mercado y ejecuta trades si hay señales
     */
    private async analyzeAndTrade(symbol: string): Promise<void> {
        // [MUTEX] Bloqueo exclusivo para evitar Race Conditions en entradas simultáneas
        await this.mutex.runExclusive(async () => {
            try {
                // 1. Obtener datos históricos
                const data = await this.exchange.fetchOHLCV(
                    symbol,
                    config.TIMEFRAME,
                    undefined,
                    300 // Suficiente para EMA 200 + margen de estabilización
                );

                if (data.length < 50) {
                    logger.warn({ symbol, bars: data.length }, 'Not enough data for analysis');
                    return;
                }

                // 2. Ejecutar cada estrategia
                for (const strategy of this.strategies) {
                    const signal = await strategy.analyze(data);
                    if (!signal) continue;

                    // 3. Procesar señal
                    if (signal.type === 'long' || signal.type === 'short') {
                        await this.openPosition(symbol, signal, data[data.length - 1]);
                    } else if (signal.type === 'close') {
                        await this.closePosition(symbol);
                    }
                }

                // 4. Monitorear posiciones abiertas
                // (Nota: Esto idealmente va fuera del mutex si solo monitorea, pero para consistencia lo dejamos aquí o en un loop separado)
                // En este diseño, monitorOpenPositions se llama también desde el Fast Loop, así que no es crítico aquí.
                await this.monitorOpenPositions(symbol, data[data.length - 1].close);

            } catch (error: any) {
                logger.error({ error: error.message, symbol }, 'Error analyzing market');
            }
        });
    }
    /**
     * Abre una nueva posición
     */
    private async openPosition(symbol: string, signal: any, currentBar: OHLCV): Promise<void> {
        try {
            // [NUEVO] 0. Verificación de Spread (Protección contra deslizamiento)
            // Obtener ticker para verificar spread en tiempo real
            const ticker = await this.exchange.getTicker(symbol);
            if (ticker && ticker.bid && ticker.ask) {
                const spread = (ticker.ask - ticker.bid) / ticker.ask;
                const MAX_SPREAD = 0.001; // 0.1% spread máximo
                if (spread > MAX_SPREAD) {
                    logger.warn({
                        symbol,
                        spread: (spread * 100).toFixed(3) + '%',
                        maxSpread: (MAX_SPREAD * 100) + '%'
                    }, '⚠️ Trade omitido por spread alto');
                    return;
                }
            }
            // 1. Verificar si se puede abrir posición
            const canOpen = this.riskManager.canOpenPosition(symbol);
            if (!canOpen.allowed) {
                logger.warn({ symbol, reason: canOpen.reason }, 'Cannot open position');
                if (canOpen.reason?.includes('CIRCUIT BREAKER')) {
                    await this.notifier.sendCircuitBreakerAlert(canOpen.reason, this.riskManager.getState().dailyPnL);
                }
                return;
            }
            // 2. Calcular tamaño de posición
            const stopLoss = signal.stopLoss || currentBar.close * 0.98; // 2% default SL
            const quantity = this.riskManager.calculatePositionSize(currentBar.close, stopLoss, symbol);
            if (quantity <= 0) {
                logger.warn({ symbol }, 'Calculated position size is 0 or negative');
                return;
            }
            logger.info({
                symbol,
                side: signal.type,
                price: currentBar.close,
                quantity,
                confidence: signal.confidence,
                stopLoss,
                takeProfit: signal.takeProfit,
            }, '📊 Opening position');
            // Notificar señal detectada
            await this.notifier.sendSignalAlert({
                symbol,
                type: signal.type.toUpperCase() as 'LONG' | 'SHORT',
                price: currentBar.close,
                rsi: (signal as any).rsi,
                confidence: signal.confidence,
            });
            // 3. Ejecutar orden en el exchange (o simular en DRY_RUN)
            const side = signal.type === 'long' ? 'buy' : 'sell';
            const isDryRun = process.env.DRY_RUN === 'true';

            if (isDryRun) {
                logger.info({ symbol, side, quantity }, '🧪 [DRY RUN] Simulación: Orden de entrada omitida');
                await this.notifier.sendTradeAlert({
                    symbol,
                    type: 'ENTRY',
                    side: signal.type as 'long' | 'short',
                    price: currentBar.close,
                    quantity,
                    isDryRun: true
                });
                return;
            }

            const order = await this.exchange.createOrderWithSLTP(
                symbol,
                side,
                quantity,
                stopLoss,
                signal.takeProfit
            );
            // 4. Registrar posición en RiskManager
            const position: Position = {
                symbol,
                side: signal.type,
                entryPrice: order.price || currentBar.close,
                quantity,
                timestamp: Date.now(),
                stopLoss,
                takeProfit: signal.takeProfit,
            };
            this.riskManager.registerPosition(position);
            // 5. Notificar
            await this.notifier.sendTradeAlert({
                symbol,
                type: 'ENTRY',
                side: signal.type,
                price: position.entryPrice,
                quantity,
            });
            logger.info({ symbol, orderId: order.id }, '✅ Position opened successfully');
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            logger.error({ error: errorMessage, symbol }, '❌ Failed to open position');
            // No enviar alertas de Telegram por limitaciones conocidas de Bybit Demo
            // Verificar tanto el mensaje como el objeto de error completo para asegurarnos
            const errorString = String(error) + (error.message || '') + JSON.stringify(error);
            const isKnownBybitDemoError = (
                errorString.includes('Demo trading are not supported') ||
                errorString.includes('10032') ||
                errorString.includes('retCode":10032')
            );
            if (!isKnownBybitDemoError) {
                await this.notifier.sendAlert('ERROR', `Error al abrir posición en ${symbol}: ${errorMessage}`);
            }
        }
    }
    /**
     * Cierra una posición existente
     */
    private async closePosition(symbol: string, exitPrice?: number): Promise<void> {
        try {
            logger.info({ symbol }, '🔄 Closing position');
            // 1. Cerrar posición en el exchange
            await this.exchange.closeAllPositions(symbol);
            // 2. Obtener precio de salida
            const currentPrice = exitPrice || (await this.getCurrentPrice(symbol));
            // 3. Actualizar RiskManager
            const trade = this.riskManager.closePosition(symbol, currentPrice);
            if (!trade) {
                logger.warn({ symbol }, 'No position found to close');
                return;
            }
            // 4. Guardar en base de datos
            await db.saveTrade(trade);
            // 5. Notificar
            await this.notifier.sendTradeAlert({
                symbol,
                type: 'EXIT',
                side: trade.side,
                price: currentPrice,
                quantity: trade.quantity,
                pnl: trade.pnl,
                pnlPercent: trade.pnlPercent,
            });
            // 6. Notificación especial para ganancias
            if (trade.pnl && trade.pnl > 0) {
                const profitEmoji = trade.pnl > 50 ? '🎉💰🎊' : trade.pnl > 20 ? '💰💰' : '💰';
                const pnlPercent = trade.pnlPercent || 0;
                await this.notifier.sendAlert(
                    'SUCCESS',
                    `${profitEmoji} ¡GANANCIA! ${profitEmoji}\n\n` +
                    `Par: ${symbol}\n` +
                    `Lado: ${trade.side.toUpperCase()}\n` +
                    `Entrada: ${trade.entryPrice.toFixed(2)} USDT\n` +
                    `Salida: ${currentPrice.toFixed(2)} USDT\n` +
                    `Cantidad: ${trade.quantity}\n\n` +
                    `💵 Ganancia: +${trade.pnl.toFixed(2)} USDT\n` +
                    `📊 ROI: +${pnlPercent.toFixed(2)}%`
                );
            } else if (trade.pnl && trade.pnl < 0) {
                const pnlPercent = trade.pnlPercent || 0;
                await this.notifier.sendAlert(
                    'WARNING',
                    `⚠️ Posición cerrada con pérdida\n\n` +
                    `Par: ${symbol}\n` +
                    `Pérdida: ${trade.pnl.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`
                );
            }
            logger.info({
                symbol,
                pnl: trade.pnl,
                pnlPercent: trade.pnlPercent,
            }, '✅ Position closed successfully');
        } catch (error: any) {
            logger.error({ error: error.message, symbol }, '❌ Failed to close position');
            await this.notifier.sendAlert('ERROR', `Failed to close position on ${symbol}: ${error.message}`);
        }
    }
    /**
     * Inicia monitoreo de alta frecuencia (3s) para TP/SL
     * Vital para scalping: detecta spikes de precio intra-vela
     */
    private startFastMonitoring(): void {
        const FAST_INTERVAL = 1000; // 1 segundo (Turbo Mode)
        setInterval(async () => {
            if (!this.isRunning) return;
            const state = this.riskManager.getState();
            // Iterar sobre posiciones vivas
            for (const position of state.positions) {
                try {
                    const currentPrice = await this.getCurrentPrice(position.symbol);
                    if (currentPrice > 0) {
                        await this.monitorOpenPositions(position.symbol, currentPrice);
                    }
                } catch (error) {
                    // Silenciar errores de conexión en el loop rápido para no saturar logs
                }
            }
        }, FAST_INTERVAL);

        logger.info('🚀 Fast Execution Loop started (3s interval)');
    }
    /**
     * Monitorea posiciones abiertas para verificar SL/TP
     */
    private async monitorOpenPositions(symbol: string, currentPrice: number): Promise<void> {
        const state = this.riskManager.getState();
        const position = state.positions.find(p => p.symbol === symbol);
        if (!position) return;
        let shouldClose = false;
        let reason = '';
        // Verificar Stop Loss
        if (position.stopLoss) {
            if (position.side === 'long') {
                // [NUEVO] Lógica de Trailing Stop (LONG) - AJUSTADO PARA SCALPING
                const pnlPercent = (currentPrice - position.entryPrice) / position.entryPrice;
                // 1. Activación: Ganancia > 0.35% (Mitad del camino al 0.7% TP)

                // 1. Activación: Ganancia > 0.15% (1.5% ROI) - GARANTIZA RENTABILIDAD
                if (pnlPercent > 0.0015) {
                    // Mover a Break-Even + 0.1% (cubrir comisiones 0.07% + ganancia)
                    const breakEvenPlus = position.entryPrice * 1.001;

                    // O mantener un Trailing del 0.05% de distancia (0.5% ROI)
                    const trailingLevel = currentPrice * 0.9995; // 0.05% distancia
                    // El nuevo SL debe ser el mayor de los dos
                    let newStopLoss = Math.max(breakEvenPlus, trailingLevel);
                    // Solo actualizar si el nuevo SL es mayor que el actual
                    if (newStopLoss > position.stopLoss) {
                        this.riskManager.updatePositionStopLoss(symbol, newStopLoss);
                    }
                }
                if (currentPrice <= position.stopLoss) {
                    shouldClose = true;
                    reason = 'Stop Loss alcanzado';
                } else if (position.takeProfit && currentPrice >= position.takeProfit) {
                    shouldClose = true;
                    reason = 'Take Profit alcanzado';
                }
            } else if (position.side === 'short') {
                // [NUEVO] Lógica de Trailing Stop (SHORT) - AJUSTADO PARA SCALPING
                const pnlPercent = (position.entryPrice - currentPrice) / position.entryPrice;
                // 1. Activación: Ganancia > 0.35%

                // 1. Activación: Ganancia > 0.15% (1.5% ROI) - GARANTIZA RENTABILIDAD
                if (pnlPercent > 0.0015) {
                    // Break-Even - 0.1%
                    const breakEvenPlus = position.entryPrice * 0.999;
                    const trailingLevel = currentPrice * 1.0005; // 0.05% distancia
                    // El nuevo SL debe ser el menor de los dos
                    let newStopLoss = Math.min(breakEvenPlus, trailingLevel);
                    // Solo actualizar si el nuevo SL es menor que el actual
                    if (newStopLoss < position.stopLoss) {
                        this.riskManager.updatePositionStopLoss(symbol, newStopLoss);
                    }
                }
                if (currentPrice >= position.stopLoss) {
                    shouldClose = true;
                    reason = 'Stop Loss alcanzado';
                } else if (position.takeProfit && currentPrice <= position.takeProfit) {
                    shouldClose = true;
                    reason = 'Take Profit alcanzado';
                }
            }
            // Verificar Take Profit
            if (position.takeProfit) {
                if (position.side === 'long' && currentPrice >= position.takeProfit) {
                    shouldClose = true;
                    reason = 'Take Profit alcanzado (Book)';
                } else if (position.side === 'short' && currentPrice <= position.takeProfit) {
                    shouldClose = true;
                    reason = 'Take Profit alcanzado (Book)';
                }
            }

            if (shouldClose) {
                // [SYNC] Antes de cerrar manualmente, verificar si la posición ya fue cerrada por órdenes programadas
                try {
                    const exchangePositions = await this.exchange.getOpenPositions(symbol);
                    const exPos = exchangePositions.find(p => p.symbol === symbol || p.info?.symbol === symbol.replace('/', ''));

                    if (!exPos || Math.abs(exPos.contracts || exPos.amount || 0) < 0.00001) {
                        logger.info({ symbol, reason }, '🎊 Posición ya cerrada por Orden Programada (MAKER). Sincronizando estado local...');
                        this.riskManager.closePosition(symbol, currentPrice);
                        return;
                    }
                } catch (e) {
                    // Si falla la verificación, procedemos con el cierre normal por seguridad
                }

                logger.info({ symbol, reason, currentPrice }, 'Closing position due to SL/TP');
                await this.closePosition(symbol, currentPrice);
            }
        }
    }
    /**
     * Carga posiciones abiertas del exchange (recovery)
     */
    private async loadOpenPositions(): Promise<void> {
        try {
            const currentRiskState = this.riskManager.getState();
            const existingPositions = new Map(currentRiskState.positions.map(p => [p.symbol, p]));
            for (const symbol of config.SYMBOLS) {
                const positions = await this.exchange.getOpenPositions(symbol);
                for (const pos of positions) {
                    logger.info({ symbol, position: pos }, 'Recovered open position from exchange');
                    // Check if we have local state for this position (to preserve SL/TP)
                    const existing = existingPositions.get(symbol);
                    // Registrar en RiskManager
                    const position: Position = {
                        symbol,
                        side: pos.side === 'long' ? 'long' : 'short',
                        entryPrice: pos.entryPrice,
                        quantity: pos.contracts,
                        timestamp: existing ? existing.timestamp : Date.now(),
                        stopLoss: existing?.stopLoss,     // Preserve SL
                        takeProfit: existing?.takeProfit, // Preserve TP
                    };
                    this.riskManager.registerPosition(position);
                    if (existing) {
                        logger.info({ symbol, sl: position.stopLoss, tp: position.takeProfit }, '✅ Restored SL/TP from local state');
                    }
                }
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error loading open positions');
        }
    }
    /**
     * Obtiene el precio actual de un símbolo
     */
    private async getCurrentPrice(symbol: string): Promise<number> {
        // [CORRECCIÓN] Usar el método wrapper que maneja Bybit Demo
        const ticker = await this.exchange.getTicker(symbol);
        return ticker?.last || 0;
    }
    /**
     * Convierte timeframe a milisegundos
     */
    private getIntervalMs(timeframe: string): number {
        const map: Record<string, number> = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
        };
        return map[timeframe] || 5 * 60 * 1000;
    }
    /**
     * Verifica si el bot está corriendo
     */
    isActive(): boolean {
        return this.isRunning;
    }
}

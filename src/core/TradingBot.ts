import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { RiskManager } from '../core/RiskManager.js';
import { TelegramNotifier } from '../monitoring/TelegramNotifier.js';
import { Strategy } from '../strategies/base/Strategy.js';
import { db } from '../database/index.js';
import { config } from '../config/index.js';
import { tradeLogger as logger } from '../utils/logger.js';
import { EMA, BollingerBands, ATR } from 'technicalindicators';
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
    // private statusInterval: NodeJS.Timeout | null = null;
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
        // Iniciar Housekeeping (Pruning de órdenes viejas)
        this.startHousekeepingLoop();
        // Iniciar Reporte Horario
        this.startHourlyReporting();
        // Iniciar Reporte Diario (Cada hora y al cierre)
        this.startHourlyReporting();

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
     * Ciclo de mantenimiento global (Limpieza de órdenes, etc)
     * Se ejecuta cada minuto, pero la limpieza respeta el TTL
     */
    private startHousekeepingLoop(): void {
        const INTERVAL = 60000; // Revisar cada minuto
        setInterval(async () => {
            if (!this.isRunning) return;
            await this.pruneStaleOrders();
        }, INTERVAL);
    }

    /**
     * Inicia reporte horario
     */
    private startHourlyReporting(): void {
        const INTERVAL = 60 * 60 * 1000; // 1 Hora
        setInterval(() => {
            if (this.isRunning) {
                this.sendDailyReport();
            }
        }, INTERVAL);
    }

    /**
     * Genera y envía el reporte detallado
     */
    private async sendDailyReport(): Promise<void> {
        const state = this.riskManager.getState();
        // @ts-ignore - Agregamos el getter dinámicamente
        const history = this.riskManager.getDailyHistory ? this.riskManager.getDailyHistory() : [];

        // Calcular totales
        let totalCommission = 0;
        let largestWin = 0;
        let largestLoss = 0;
        let winningTrades = 0;
        let losingTrades = 0;

        for (const trade of history) {
            if (trade.commission) totalCommission += trade.commission;
            if (trade.pnl && trade.pnl > 0) {
                winningTrades++;
                if (trade.pnl > largestWin) largestWin = trade.pnl;
            } else if (trade.pnl) {
                losingTrades++;
                if (trade.pnl < largestLoss) largestLoss = trade.pnl;
            }
        }

        const winRate = history.length > 0 ? winningTrades / history.length : 0;

        await this.notifier.sendDailyReport({
            date: new Date().toLocaleDateString(),
            totalTrades: history.length,
            winningTrades,
            losingTrades,
            winRate,
            totalPnl: state.dailyPnL,
            pnlPercent: state.dailyPnLPercent || 0,
            largestWin,
            largestLoss,
            totalCommission,
            trades: history
        });
    }

    /**
     * Cancela órdenes pendientes viejas (TTL) para liberar capital
     * Regla: Solo si NO hay posición abierta (para no borrar TP/SL)
     */
    private async pruneStaleOrders(): Promise<void> {
        try {
            // logger.info('🧹 Ejecutando limpieza de órdenes viejas (TTL)...');
            // Nota: Iteramos por símbolos para asegurar compatibilidad
            for (const symbol of config.SYMBOLS) {
                // Verificar si tenemos posición activa
                const position = this.riskManager.getPosition(symbol);
                if (position) continue; // Si hay posición, no tocamos nada por seguridad.

                const orders = await this.exchange.getOpenOrders(symbol);
                const now = Date.now();
                const ttlMs = config.ORDER_TTL_MINUTES * 60 * 1000;

                for (const order of orders) {
                    // Si la orden tiene más de TTL de antigüedad
                    if ((now - order.timestamp) > ttlMs) {
                        logger.warn({
                            symbol,
                            orderId: order.id,
                            ageMin: ((now - order.timestamp) / 60000).toFixed(1)
                        }, '🗑️ Orden expirada (TTL). Cancelando...');
                        await this.exchange.cancelOrder(order.id, symbol);
                    }
                }
            }
        } catch (error) {
            // Silencio errores leves, log solo si es grave
            // logger.error({ error }, '❌ Error en Housekeeping');
        }
    }
    /**
     * Inicia el ciclo de reportes de estado
     */
    private startStatusReporting(): void {
        // Reporte periódico deshabilitado temporalmente
        // Se puede habilitar con un timer local si se necesita el reporte cada 60s
        logger.info('⏱️ Status reporting available via Telegram commands');
    }
    /**
     * Configura comandos interactivos de Telegram
     */
    private setupTelegramCommands(): void {
        // Comando /reporte (Nuevo Reporting Avanzado)
        this.notifier.registerCommand('reporte', async () => {
            await this.sendDailyReport();
            return;
        });

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

        // Comando /analisis (Cardona Scanner)
        this.notifier.registerCommand('analisis', async (bot, msg) => {
            await bot.sendMessage(msg.chat.id, '🔍 <b>Analizando el mercado...</b>\n<i>Esto puede tomar unos segundos...</i>', { parse_mode: 'HTML' });

            const results = [];
            const symbols = config.SYMBOLS;

            for (const symbol of symbols) {
                try {
                    // Fetch candles
                    const candles = await this.exchange.fetchOHLCV(symbol, config.TIMEFRAME, undefined, 300);
                    if (!candles || candles.length < 200) continue;

                    const closes = candles.map(c => c.close);
                    const currentPrice = closes[closes.length - 1];

                    // EMA Trend
                    const ema200 = EMA.calculate({ period: 200, values: closes }).pop() || 0;

                    const isBullish = currentPrice > ema200;
                    const trendIcon = isBullish ? '🟢' : '🔴';
                    const trendText = isBullish ? 'ALCISTA' : 'BAJISTA';

                    // Squeeze (Volatilidad)
                    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
                    const lastBB = bb[bb.length - 1];
                    const bandwidth = (lastBB.upper - lastBB.lower) / lastBB.middle;
                    // Simple threshold for "squeeze" visualisation
                    const squeezeIcon = bandwidth < 0.05 ? '💣' : '〰️';

                    // Distance to EMA200
                    const dist = ((currentPrice - ema200) / ema200) * 100;

                    results.push(
                        `<b>${symbol}</b> ${trendIcon}\n` +
                        `   Trend: <b>${trendText}</b> (${dist > 0 ? '+' : ''}${dist.toFixed(2)}%)\n` +
                        `   Vol: ${squeezeIcon} ${(bandwidth * 100).toFixed(2)}%`
                    );

                } catch (e) {
                    logger.error({ error: e, symbol }, 'Error in telegram analysis');
                }
            }

            const header = '🧠 <b>ANÁLISIS DE MERCADO (Cardona)</b>\n\n';
            const footer = '\n💡 <i>Leyenda: 🔴/🟢 Tendencia, 💣 Squeeze, 🔥 Sobreactendido</i>';

            // Split into chunks if too long
            const report = results.join('\n\n');
            await bot.sendMessage(msg.chat.id, header + report + footer, { parse_mode: 'HTML' });
            return;
        });

        // Comando /apagar (Menú de opciones)
        this.notifier.registerCommand('apagar', async (bot, msg) => {
            const menu = [
                '🛑 <b>¿CÓMO QUIERES APAGAR EL BOT?</b>',
                '',
                '1️⃣ <b>Cerrar TODO y Apagar</b>',
                '   👉 Ejecuta: <code>/stop_close_all</code>',
                '   <i>(Vende todas las posiciones a mercado y se desconecta)</i>',
                '',
                '2️⃣ <b>Solo Apagar (Mantener Posiciones)</b>',
                '   👉 Ejecuta: <code>/stop_keep_positions</code>',
                '   <i>(Deja las operaciones abiertas en Binance y se desconecta)</i>'
            ].join('\n');
            await bot.sendMessage(msg.chat.id, menu, { parse_mode: 'HTML' });
        });

        // Comando /stop_close_all (Panic Button)
        this.notifier.registerCommand('stop_close_all', async (bot, msg) => {
            await bot.sendMessage(msg.chat.id, '🧨 <b>CERRANDO TODAS LAS POSICIONES...</b>', { parse_mode: 'HTML' });
            this.isRunning = false; // Stop monitoring first

            const state = this.riskManager.getState();
            for (const pos of state.positions) {
                try {
                    await this.closePosition(pos.symbol);
                    await bot.sendMessage(msg.chat.id, `✅ Cerrado: ${pos.symbol}`);
                } catch (e: any) {
                    await bot.sendMessage(msg.chat.id, `❌ Error cerrando ${pos.symbol}: ${e.message}`);
                }
            }

            await bot.sendMessage(msg.chat.id, '💀 <b>Bot Apagado (Positions Closed).</b> Bye!');
            logger.info('🛑 Bot stopped via Telegram (Close All)');
            process.exit(0);
        });

        // Comando /stop_keep_positions (Soft Stop)
        this.notifier.registerCommand('stop_keep_positions', async (bot, msg) => {
            await bot.sendMessage(msg.chat.id, '🛌 <b>Bot Apagado (Posiciones Abiertas).</b> Suerte!', { parse_mode: 'HTML' });
            logger.info('🛑 Bot stopped via Telegram (Keep Positions)');
            process.exit(0);
        });

        // Comando /reiniciar
        this.notifier.registerCommand('reiniciar', async (bot, msg) => {
            await bot.sendMessage(msg.chat.id, '🔄 <b>Reiniciando sistema...</b>\n<i>(Si no vuelve en 30s, inícialo manualmente)</i>', { parse_mode: 'HTML' });
            logger.info('🔄 Bot restarting via Telegram request');
            process.exit(1); // Exit 1 usually triggers restart in PM2/Docker
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
        // Calcular intervalo en milisegundos (v4.0 uses fixed SCAN_INTERVAL_MS)
        const intervalMs = config.SCAN_INTERVAL_MS;
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

                // [NUEVO] 1.5. Circuit Breaker de Volatilidad (Opción B del Usuario)
                // Calcular ATR para detectar si el mercado está "muy agresivo"
                const candlesATR = {
                    high: data.map(c => c.high),
                    low: data.map(c => c.low),
                    close: data.map(c => c.close),
                    period: 14,
                };
                const atrValues = ATR.calculate(candlesATR);

                if (atrValues.length > 0) {
                    const currentATR = atrValues[atrValues.length - 1];
                    const currentPrice = data[data.length - 1].close;
                    const atrPercent = currentATR / currentPrice;

                    // Si el ATR% supera el máximo configurado (ej. 2%), abortamos entrada.
                    // Esto evita operar durante mechas asesinas o crashes violentos.
                    if (atrPercent > config.MAX_VOLATILITY_ATR_PCT) {
                        logger.warn({
                            symbol,
                            currentATR,
                            currentPrice,
                            atrPercent: (atrPercent * 100).toFixed(2) + '%',
                            limit: (config.MAX_VOLATILITY_ATR_PCT * 100).toFixed(2) + '%'
                        }, '⛔ VOLATILITY ALERT: Market too volatile (Circuit Breaker). Skipping analysis.');

                        // Opcional: Notificar usuario si es la primera vez que pasa en un rato (para evitar spam)
                        return;
                    }
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
     * Inicia monitoreo de alta frecuencia (5s) para TP/SL y Timeouts
     * Vital para scalping: detecta spikes de precio intra-vela
     */
    private startFastMonitoring(): void {
        const FAST_INTERVAL = config.POSITION_CHECK_INTERVAL_MS;
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
     * Monitorea posiciones abiertas para verificar SL/TP y Meta Diaria
     */
    private async monitorOpenPositions(symbol: string, currentPrice: number): Promise<void> {
        const state = this.riskManager.getState();
        const position = state.positions.find(p => p.symbol === symbol);
        if (!position) return;

        // [NUEVO] Lógica de Salida por Meta Diaria (Graceful Exit)
        if (this.riskManager.isDailyGoalReached()) {
            const closed = await this.manageDailyProfitExit(position, currentPrice);
            if (closed) return; // Si se cerró, no seguir procesando
        }

        let shouldClose = false;
        let reason = '';

        // Timeout Check (v4.0)
        const duration = Date.now() - position.timestamp;
        const pnlPercentCurrent = position.side === 'long'
            ? (currentPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - currentPrice) / position.entryPrice;

        // Timeout: Close if max duration reached and not yet in profitable trailing zone
        if (duration >= config.MAX_TRADE_DURATION_MS && pnlPercentCurrent < config.TRAILING_ACTIVATION_ROI) {
            await this.closePosition(symbol); // Close immediately
            await this.notifier.sendAlert('INFO', `⏳ Timeout reached for ${symbol}. Closing trade.`);
            return;
        }

        // Verificar Stop Loss
        if (position.stopLoss) {
            if (position.side === 'long') {
                // [NUEVO] Lógica de Trailing Stop v4.0 (LONG)
                const activationPriceChange = position.entryPrice * (config.TRAILING_ACTIVATION_ROI / config.DEFAULT_LEVERAGE); // e.g., 3% ROI / 10 = 0.3% Price
                const lockPriceChange = position.entryPrice * (config.TRAILING_LOCK_ROI / config.DEFAULT_LEVERAGE); // e.g., 2.2% ROI / 10 = 0.22% Price

                // 1. Activación: Ganancia > 3% ROI
                if (currentPrice >= position.entryPrice + activationPriceChange) {
                    // Mover SL a Lock Level (2.2% ROI)
                    const lockLevel = position.entryPrice + lockPriceChange;

                    // Trailing dinámico: Mantener distancia de (Activation - Lock)
                    const trailingDistance = activationPriceChange - lockPriceChange;
                    const trailingLevel = currentPrice - trailingDistance;

                    // El nuevo SL debe ser el mayor (Lock inicial vs Trailing dinámico)
                    let newStopLoss = Math.max(lockLevel, trailingLevel);

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
                // [NUEVO] Lógica de Trailing Stop v4.0 (SHORT)
                const activationPriceChange = position.entryPrice * (config.TRAILING_ACTIVATION_ROI / config.DEFAULT_LEVERAGE);
                const lockPriceChange = position.entryPrice * (config.TRAILING_LOCK_ROI / config.DEFAULT_LEVERAGE);

                // 1. Activación: Ganancia > 3% ROI
                if (currentPrice <= position.entryPrice - activationPriceChange) {
                    // Mover SL a Lock Level 
                    const lockLevel = position.entryPrice - lockPriceChange;

                    // Trailing dinámico
                    const trailingDistance = activationPriceChange - lockPriceChange;
                    const trailingLevel = currentPrice + trailingDistance;

                    // El nuevo SL debe ser el menor (Lock inicial vs Trailing dinámico)
                    let newStopLoss = Math.min(lockLevel, trailingLevel);

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

                    // Check if we have local state for this position
                    const existing = existingPositions.get(symbol);

                    // [RECOVERY] Attempt to recover SL/TP from Open Orders if local state is missing
                    let recoveredSL = existing?.stopLoss;
                    let recoveredTP = existing?.takeProfit;

                    if (!recoveredSL) {
                        try {
                            const openOrders = await this.exchange.getOpenOrders(symbol);
                            const slOrder = openOrders.find(o =>
                                o.type === 'stop' ||
                                o.type === 'stop_market' ||
                                o.type === 'stop_loss' ||
                                o.type === 'stop_loss_limit' ||
                                (o.info && (o.info.stopPrice || o.info.triggerPrice))
                            );

                            if (slOrder) {
                                recoveredSL = parseFloat(slOrder.stopPrice || slOrder.triggerPrice || slOrder.price);
                                logger.info({ symbol, recoveredSL }, '✅ Recovered SL from Active Order');
                            } else {
                                // Fallback: Emergency SL based on Config (e.g. 2.5% ROI / 10x Lev = 0.25% Price)
                                // Prevent loose 50% ROI stops.
                                const sideMult = pos.side === 'long' ? 1 : -1;
                                const emergencyRisk = (config.STOP_LOSS_ROI || 0.025) / config.DEFAULT_LEVERAGE;
                                recoveredSL = pos.entryPrice * (1 - (sideMult * emergencyRisk));
                                logger.warn({ symbol, newSL: recoveredSL, riskPct: (emergencyRisk * 100).toFixed(2) + '%' }, '⚠️ No SL found. Applied Tight Emergency SL from Config');
                            }
                        } catch (err) {
                            logger.error({ symbol, err }, 'Failed to recover SL from orders');
                        }
                    }

                    // Registrar en RiskManager
                    const position: Position = {
                        symbol,
                        side: pos.side === 'long' ? 'long' : 'short',
                        entryPrice: pos.entryPrice,
                        quantity: pos.contracts,
                        timestamp: existing ? existing.timestamp : Date.now(),
                        stopLoss: recoveredSL,
                        takeProfit: recoveredTP,
                    };
                    this.riskManager.registerPosition(position);

                    if (existing || recoveredSL) {
                        logger.info({ symbol, sl: position.stopLoss, tp: position.takeProfit }, '✅ Position state restored');
                    }
                }
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error loading open positions');
        }
    }
    /**
     * Gestiona la salida de posiciones cuando se alcanza la meta diaria
     * Regla (Refinada por Usuario):
     * - Pérdida > 0.5% (ej. -3%) -> ESPERAR (Dejar recuperar)
     * - "Zona Segura" (Pérdida <= 0.5% o Ganancia) -> CERRAR
     */
    private async manageDailyProfitExit(position: Position, currentPrice: number): Promise<boolean> {
        // Calcular PnL Neto Estimado
        const grossPnL = position.side === 'long'
            ? (currentPrice - position.entryPrice) * position.quantity
            : (position.entryPrice - currentPrice) * position.quantity;

        // Fee Estimado (Entry + Exit)
        const fees = (position.entryPrice * position.quantity * config.ESTIMATED_FEE_PCT) +
            (currentPrice * position.quantity * config.ESTIMATED_FEE_PCT);

        const netPnL = grossPnL - fees;
        const netPnLPercent = netPnL / (position.entryPrice * position.quantity);

        // UMBRAL DE CORTE: -0.5%
        // Si estamos MEJOR que -0.5% (ej. -0.4%, 0%, +10%), cerramos para asegurar el día.
        if (netPnLPercent >= -0.005) {
            logger.info({
                symbol: position.symbol,
                netPnLPercent: (netPnLPercent * 100).toFixed(2) + '%'
            }, '🎯 Meta cumplida y posición en rango aceptable (>= -0.5%): CERRANDO.');
            await this.closePosition(position.symbol, currentPrice);
            return true;
        }

        // Si la pérdida es MAYOR a 0.5% (ej. -3%), NO cerramos.
        // Esperamos a que recupere terreno (o que toque el Stop Loss normal del sistema).
        logger.debug({
            symbol: position.symbol,
            netPnLPercent: (netPnLPercent * 100).toFixed(2) + '%'
        }, '⏳ Meta cumplida pero pérdida alta (> 0.5%): Esperando recuperación...');

        return false;
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
     * Verifica si el bot está corriendo
     */
    isActive(): boolean {
        return this.isRunning;
    }
}

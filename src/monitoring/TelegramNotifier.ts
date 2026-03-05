import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
interface TradeAlert {
    symbol: string;
    type: 'ENTRY' | 'EXIT';
    side: 'long' | 'short';
    price: number;
    quantity: number;
    pnl?: number;
    pnlPercent?: number;
    isDryRun?: boolean;
}
interface DailyReport {
    date: string;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    pnlPercent: number;
    largestWin: number;
    largestLoss: number;
    totalCommission?: number;
    trades?: any[]; // Detailed trade history
}
/**
 * Sistema de notificaciones vía Telegram
 * 
 * Envía:
 * - Alerta de cada trade (entrada y salida)
 * - Reportes diarios de performance
 * - Alertas de circuit breakers
 * - Alertas de errores críticos
 */
export class TelegramNotifier {
    private bot?: TelegramBot;
    private chatId?: string;
    private enabled: boolean = false;
    constructor() {
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
            try {
                this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
                this.chatId = config.TELEGRAM_CHAT_ID;
                this.enabled = true;
                this.setupCommands();
                logger.info('✅ Telegram notifier initialized with interactive commands');
            } catch (error) {
                logger.error({ error }, 'Failed to initialize Telegram bot');
            }
        } else {
            logger.warn('⚠️ Telegram credentials not provided, notifications disabled');
        }
    }
    /**
     * Configura los comandos del bot
     */
    private setupCommands(): void {
        if (!this.bot) return;
        // Comando /ayuda
        this.bot.onText(/\/ayuda/, async (msg) => {
            const helpMessage = [
                '🤖 <b>Trading Bot - Comandos Disponibles</b>',
                '',
                '/estado - Estado del sistema',
                '/ordenes - Ver posiciones abiertas (con ID)',
                '/cerrar [ID] - Cerrar posición por número (ej: /cerrar 1)',
                '/balance - Balance de cuenta',
                '/pnl - Ganancias y Pérdidas hoy',
                '/metricas - Estadísticas',
                '/ayuda - Mostrar este mensaje',
                '',
                '💡 <i>Las notificaciones son automáticas</i>'
            ].join('\n');
            await this.bot!.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
        });
        // Otros comandos serán inyectados desde TradingBot
        logger.debug('Telegram commands configured');
    }
    /**
     * Registra un callback para comandos personalizados
     */
    registerCommand(command: string, callback: (bot: TelegramBot, msg: any) => Promise<void>): void {
        if (!this.bot) return;
        this.bot.onText(new RegExp(`/${command}`), async (msg) => {
            try {
                await callback(this.bot!, msg);
            } catch (error) {
                logger.error({ error, command }, 'Error handling command');
            }
        });
    }
    /**
     * Envía alerta de trade (entrada o salida)
     */
    async sendTradeAlert(trade: TradeAlert): Promise<void> {
        if (!this.enabled || !this.bot || !this.chatId) return;
        try {
            const emoji = trade.isDryRun ? '🧪' : (trade.type === 'ENTRY'
                ? (trade.side === 'long' ? '🚀' : '🔻')
                : (trade.pnl && trade.pnl > 0 ? '✅' : '❌'));

            const dryRunLabel = trade.isDryRun ? '<b>[MODO PRUEBA]</b>\n' : '';

            const message = [
                `${dryRunLabel}${emoji} <b>${trade.type} ${trade.side.toUpperCase()}</b>`,
                '',
                `📊 Symbol: <code>${trade.symbol}</code>`,
                `💰 Price: <code>$${trade.price.toFixed(2)}</code>`,
                `📦 Quantity: <code>${trade.quantity.toFixed(6)}</code>`,
            ];
            if (trade.type === 'EXIT' && trade.pnl !== undefined && trade.pnlPercent !== undefined) {
                const pnlSign = trade.pnl > 0 ? '+' : '';
                message.push(
                    '',
                    `💵 PnL: <code>${pnlSign}${trade.pnl.toFixed(2)} USD</code>`,
                    `📈 Return: <code>${pnlSign}${trade.pnlPercent.toFixed(2)}%</code>`
                );
            }
            await this.bot.sendMessage(this.chatId, message.join('\n'), {
                parse_mode: 'HTML'
            });
            logger.debug({ trade }, 'Trade alert sent via Telegram');
        } catch (error) {
            logger.error({ error }, 'Failed to send Telegram trade alert');
        }
    }
    /**
     * Envía reporte diario de performance
     */
    async sendDailyReport(report: DailyReport): Promise<void> {
        if (!this.enabled || !this.bot || !this.chatId) return;
        try {
            const emoji = report.totalPnl > 0 ? '🎉' : '😔';
            const winRateEmoji = report.winRate >= 0.5 ? '✅' : '⚠️';
            const message = [
                `${emoji} <b>📊 Daily Report - ${report.date}</b>`,
                '',
                `📈 Total Trades: <code>${report.totalTrades}</code>`,
                `${winRateEmoji} Win Rate: <code>${(report.winRate * 100).toFixed(1)}%</code>`,
                `  ✅ Winning: <code>${report.winningTrades}</code>`,
                `  ❌ Losing: <code>${report.losingTrades}</code>`,
                '',
                `💰 P&L: <code>${report.totalPnl > 0 ? '+' : ''}${report.totalPnl.toFixed(2)} USD (${report.pnlPercent.toFixed(2)}%)</code>`,
                '',
                `🏆 Largest Win: <code>+${report.largestWin.toFixed(2)} USD</code>`,
                `💔 Largest Loss: <code>${report.largestLoss.toFixed(2)} USD</code>`,
                '',
                report.totalPnl > 0
                    ? '🎯 <i>Great job! Keep it consistent.</i>'
                    : '🔍 <i>Review strategy performance and adjust if needed.</i>',
            ];
            await this.bot.sendMessage(this.chatId, message.join('\n'), {
                parse_mode: 'HTML'
            });
            logger.info({ report }, 'Daily report sent via Telegram');
        } catch (error) {
            logger.error({ error }, 'Failed to send Telegram daily report');
        }
    }
    /**
     * Envía alerta de nivel informativo, warning o error
     */
    async sendAlert(level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS', message: string): Promise<void> {
        if (!this.enabled || !this.bot || !this.chatId) return;
        // Filtro global: No enviar alertas por limitaciones conocidas de Bybit Demo
        const msgLower = message.toLowerCase();
        // Filtrar por texto específico, código de error o estructura JSON común de Bybit
        if (
            msgLower.includes('demo trading') ||
            msgLower.includes('not supported') ||
            msgLower.includes('10032') ||
            msgLower.includes('retcode') ||
            msgLower.includes('retmsg')
        ) {
            // Log para confirmar que se bloqueó el mensaje
            logger.debug({ originalMessage: message }, '🚫 Alerta de Telegram suprimida (Limitación Bybit Demo)');
            return;
        }
        const emoji = {
            INFO: 'ℹ️',
            WARNING: '⚠️',
            ERROR: '🔴',
            SUCCESS: '✅'
        };
        const formattedMessage = `${emoji[level]} *${level}*\n\n${message}`;
        try {
            await this.bot.sendMessage(this.chatId, formattedMessage, {
                parse_mode: 'Markdown',
            });
            logger.debug({ level, message }, 'Alert sent via Telegram');
        } catch (error) {
            logger.error({ error, level, message }, 'Failed to send alert');
        }
    }
    /**
     * Envía mensaje de inicio del bot
     */
    async sendStartupMessage(): Promise<void> {
        if (!this.enabled) return;
        await this.sendAlert(
            'INFO',
            `🤖 <b>Trading Bot Started</b>\n\n` +
            `Exchange: <code>${config.EXCHANGE_NAME}</code>\n` +
            `Mode: <code>${config.EXCHANGE_TESTNET ? 'TESTNET' : 'LIVE'}</code>\n` +
            `Symbols: <code>${config.SYMBOLS.join(', ')}</code>\n` +
            `Timeframe: <code>${config.TIMEFRAME}</code>\n\n` +
            `⚡ Ready to trade!`
        );
    }
    /**
     * Envía mensaje de circuit breaker activado
     */
    async sendCircuitBreakerAlert(reason: string, currentPnL?: number): Promise<void> {
        if (!this.enabled) return;
        const message = [
            '🔴 <b>CIRCUIT BREAKER ACTIVATED</b>',
            '',
            `Reason: ${reason}`,
        ];
        if (currentPnL !== undefined) {
            message.push(`Current Daily P&L: <code>${currentPnL.toFixed(2)} USD</code>`);
        }
        message.push('', '⏸ Trading suspended until reset.');
        await this.sendAlert('ERROR', message.join('\n'));
    }
    /**
     * Envía alerta de señal detectada (antes de ejecutar orden)
     */
    async sendSignalAlert(signal: {
        symbol: string;
        type: 'LONG' | 'SHORT';
        price: number;
        rsi?: number;
        confidence?: number;
        strategy?: string;
        regime?: string;
    }): Promise<void> {
        if (!this.enabled || !this.bot || !this.chatId) return;
        try {
            const emoji = signal.type === 'LONG' ? '📈' : '📉';
            const message = [
                `${emoji} <b>SIGNAL DETECTED</b>`,
                '',
                `📊 Symbol: <code>${signal.symbol}</code>`,
                `🎯 Type: <b>${signal.type}</b>`,
                `💰 Price: <code>$${signal.price.toFixed(2)}</code>`,
            ];
            if (signal.strategy) {
                message.push(`🧠 Strategy: <code>${signal.strategy}</code>`);
            }
            if (signal.regime) {
                message.push(`🌐 Regime: <code>${signal.regime}</code>`);
            }
            if (signal.rsi) {
                message.push(`📊 RSI: <code>${signal.rsi.toFixed(2)}</code>`);
            }
            if (signal.confidence) {
                message.push(`🎲 Confidence: <code>${(signal.confidence * 100).toFixed(0)}%</code>`);
            }
            await this.bot.sendMessage(this.chatId, message.join('\n'), {
                parse_mode: 'HTML'
            });
            logger.debug({ signal }, 'Signal alert sent via Telegram');
        } catch (error) {
            logger.error({ error }, 'Failed to send Telegram signal alert');
        }
    }
    /**
     * Envía reporte periódico de estado de posiciones (cada minuto)
     */
    async sendPositionStatusReport(data: {
        balance: number;
        dailyPnL: number;
        positions: {
            symbol: string;
            side: string;
            entryPrice: number;
            currentPrice: number;
            quantity: number;
            pnl: number;
            pnlPercent: number;
        }[];
    }): Promise<void> {
        if (!this.enabled || !this.bot || !this.chatId) return;
        try {
            const header = `⏱️ <b>Actualización de Estado (1m)</b>\n\n` +
                `💰 Balance: <code>$${data.balance.toFixed(2)}</code>\n` +
                `📈 P&L Diario: <code>${data.dailyPnL >= 0 ? '+' : ''}$${data.dailyPnL.toFixed(2)}</code>\n` +
                `📊 Posiciones Activas: <code>${data.positions.length}</code>\n`;
            const positionLines = data.positions.map(pos => {
                const pnlEmoji = pos.pnl >= 0 ? '🟢' : '🔴';
                return `${pnlEmoji} <b>${pos.symbol}</b> ${pos.side.toUpperCase()}\n` +
                    `   Entry: <code>$${pos.entryPrice.toFixed(4)}</code> ➜ Curr: <code>$${pos.currentPrice.toFixed(4)}</code>\n` +
                    `   PnL: <code>${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)} (${pos.pnlPercent.toFixed(2)}%)</code>`;
            });
            const message = header + (positionLines.length > 0 ? '\n' + positionLines.join('\n') : '\n<i>Sin posiciones activas</i>');
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML',
                disable_notification: true // Send silently to avoid constant buzzing
            });
        } catch (error) {
            logger.error({ error }, 'Failed to send status report');
        }
    }
    /**
     * Verifica si las notificaciones están habilitadas
     */
    isEnabled(): boolean {
        return this.enabled;
    }
    /**
     * Obtiene la instancia del bot (para inyección de comandos)
     */
    getBot(): TelegramBot | undefined {
        return this.bot;
    }
    /**
     * Obtiene el chat ID
     */
    getChatId(): string | undefined {
        return this.chatId;
    }
}

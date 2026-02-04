import pino from 'pino';

/**
 * Sistema de logging profesional con niveles y formatos estructurados
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{levelLabel} - {msg}',
        },
    },
});

/**
 * Logger especializado para trades
 */
export const tradeLogger = logger.child({ component: 'trading' });

/**
 * Logger especializado para backtesting
 */
export const backtestLogger = logger.child({ component: 'backtest' });

/**
 * Logger especializado para risk management
 */
export const riskLogger = logger.child({ component: 'risk' });

/**
 * Logger especializado para API calls
 */
export const apiLogger = logger.child({ component: 'api' });

/**
 * Logger especializado para capital management
 */
export const capitalLogger = logger.child({ component: 'capital' });

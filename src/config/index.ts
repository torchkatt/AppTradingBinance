import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
    // Exchange Configuration
    EXCHANGE_NAME: z.enum(['binance', 'bybit', 'alpaca', 'kraken']),
    EXCHANGE_API_KEY: z.string().min(1, 'API Key is required'),
    EXCHANGE_API_SECRET: z.string().min(1, 'API Secret is required'),
    EXCHANGE_TESTNET: z.boolean().default(true),

    // Risk Management
    MAX_POSITION_SIZE_PCT: z.number().min(0).max(1).default(0.1), // 10% máximo por posición
    MAX_DAILY_LOSS_PCT: z.number().min(0).max(1).default(0.03), // 3% pérdida diaria máxima
    RISK_PER_TRADE_PCT: z.number().min(0).max(0.05).default(0.01), // 1% por trade (Conservador)
    MAX_OPEN_POSITIONS: z.number().int().min(1).default(2), // Max 2 trades simultáneos (v4.0)
    DEFAULT_LEVERAGE: z.number().min(1).max(125).default(10), // 10x por defecto
    MAX_STOP_LOSS_PCT: z.number().min(0).max(0.1).default(0.001),

    // v4.0 Trading Parameters
    TAKE_PROFIT_ROI: z.number().default(0.015), // 1.5% Price Move (= 15% ROI @ 10x)
    STOP_LOSS_ROI: z.number().default(0.025), // 2.5% ROI (Distance)

    // v4.0 Profit Goals & Fees
    MAX_DAILY_PROFIT_PCT: z.number().default(0.15), // 15% Daily Goal
    ESTIMATED_FEE_PCT: z.number().default(0.0005), // 0.05% Taker Fee (Binance Standard)
    TRAILING_ACTIVATION_ROI: z.number().default(0.03), // 3% ROI Activation
    TRAILING_LOCK_ROI: z.number().default(0.022), // 2.2% ROI Lock

    // Volatility Circuit Breaker
    MAX_VOLATILITY_ATR_PCT: z.number().default(0.02), // 2% ATR Threshold

    // v4.0 Timing & Filters
    SCAN_INTERVAL_MS: z.number().default(600000), // 10 min
    POSITION_CHECK_INTERVAL_MS: z.number().default(2000), // 2 sec
    MAX_TRADE_DURATION_MS: z.number().default(1200000), // 20 min
    // v4.0 Streak Control
    MAX_CONSECUTIVE_LOSSES: z.number().default(2),
    COOLDOWN_TIME_MS: z.number().default(1200000), // 20 min

    ORDER_TTL_MINUTES: z.number().default(30), // 30 min Order Expiry

    // Database
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Telegram Alerts
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // Server
    PORT: z.number().default(3000),
    WEBHOOK_SECRET: z.string().min(32, 'Webhook secret debe tener al menos 32 caracteres'),

    // Trading
    SYMBOLS: z.array(z.string()).default(['BTC/USDT']),
    TIMEFRAME: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('5m'),

    // Capital Override (for testing with specific amount)
    OVERRIDE_CAPITAL: z.number().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

function parseConfig(): Config {
    try {
        return ConfigSchema.parse({
            EXCHANGE_NAME: process.env.EXCHANGE_NAME,
            EXCHANGE_API_KEY: process.env.EXCHANGE_API_KEY?.trim() || '',
            EXCHANGE_API_SECRET: process.env.EXCHANGE_API_SECRET?.trim() || '',
            EXCHANGE_TESTNET: process.env.EXCHANGE_TESTNET === 'true',

            MAX_POSITION_SIZE_PCT: Number(process.env.MAX_POSITION_SIZE_PCT),
            MAX_DAILY_LOSS_PCT: Number(process.env.MAX_DAILY_LOSS_PCT),
            RISK_PER_TRADE_PCT: Number(process.env.RISK_PER_TRADE_PCT) || 0.01, // v4.0 default (Conservative)
            MAX_OPEN_POSITIONS: Number(process.env.MAX_OPEN_POSITIONS) || 2, // v4.0 default
            DEFAULT_LEVERAGE: Number(process.env.DEFAULT_LEVERAGE) || 10,
            MAX_STOP_LOSS_PCT: process.env.MAX_STOP_LOSS_PCT ? Number(process.env.MAX_STOP_LOSS_PCT) : 0.001,

            // v4.0 Trading Parameters (read from ENV or use Schema defaults)
            TAKE_PROFIT_ROI: process.env.TAKE_PROFIT_ROI ? Number(process.env.TAKE_PROFIT_ROI) : 0.08,
            STOP_LOSS_ROI: process.env.STOP_LOSS_ROI ? Number(process.env.STOP_LOSS_ROI) : 0.025,
            TRAILING_ACTIVATION_ROI: process.env.TRAILING_ACTIVATION_ROI ? Number(process.env.TRAILING_ACTIVATION_ROI) : 0.03,
            TRAILING_LOCK_ROI: process.env.TRAILING_LOCK_ROI ? Number(process.env.TRAILING_LOCK_ROI) : 0.022,

            // v4.0 Timing & Filters
            SCAN_INTERVAL_MS: process.env.SCAN_INTERVAL_MS ? Number(process.env.SCAN_INTERVAL_MS) : 600000,
            POSITION_CHECK_INTERVAL_MS: process.env.POSITION_CHECK_INTERVAL_MS ? Number(process.env.POSITION_CHECK_INTERVAL_MS) : 5000,
            MAX_TRADE_DURATION_MS: process.env.MAX_TRADE_DURATION_MS ? Number(process.env.MAX_TRADE_DURATION_MS) : 1200000,

            // v4.0 Streak Control
            MAX_CONSECUTIVE_LOSSES: process.env.MAX_CONSECUTIVE_LOSSES ? Number(process.env.MAX_CONSECUTIVE_LOSSES) : 2,
            COOLDOWN_TIME_MS: process.env.COOLDOWN_TIME_MS ? Number(process.env.COOLDOWN_TIME_MS) : 1200000,

            DATABASE_URL: process.env.DATABASE_URL,
            REDIS_URL: process.env.REDIS_URL,

            TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
            TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,

            PORT: Number(process.env.PORT) || 3000,
            WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,

            SYMBOLS: process.env.SYMBOLS?.split(',').map(s => s.trim()),
            TIMEFRAME: process.env.TIMEFRAME,

            OVERRIDE_CAPITAL: process.env.OVERRIDE_CAPITAL ? Number(process.env.OVERRIDE_CAPITAL) : undefined,

            // Volatility Circuit Breaker
            MAX_VOLATILITY_ATR_PCT: process.env.MAX_VOLATILITY_ATR_PCT ? Number(process.env.MAX_VOLATILITY_ATR_PCT) : 0.02,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ Error de configuración:');
            error.errors.forEach(err => {
                console.error(`  - ${err.path.join('.')}: ${err.message}`);
            });
            process.exit(1);
        }
        throw error;
    }
}

export const config = parseConfig();

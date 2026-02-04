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
    RISK_PER_TRADE_PCT: z.number().min(0).max(0.05).default(0.01), // 1% por trade
    MAX_OPEN_POSITIONS: z.number().int().min(1).default(6),
    DEFAULT_LEVERAGE: z.number().min(1).max(125).default(10), // 10x por defecto

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
            RISK_PER_TRADE_PCT: Number(process.env.RISK_PER_TRADE_PCT),
            MAX_OPEN_POSITIONS: Number(process.env.MAX_OPEN_POSITIONS) || 6,
            DEFAULT_LEVERAGE: Number(process.env.DEFAULT_LEVERAGE) || 10,

            DATABASE_URL: process.env.DATABASE_URL,
            REDIS_URL: process.env.REDIS_URL,

            TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
            TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,

            PORT: Number(process.env.PORT) || 3000,
            WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,

            SYMBOLS: process.env.SYMBOLS?.split(',').map(s => s.trim()),
            TIMEFRAME: process.env.TIMEFRAME,

            OVERRIDE_CAPITAL: process.env.OVERRIDE_CAPITAL ? Number(process.env.OVERRIDE_CAPITAL) : undefined,
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

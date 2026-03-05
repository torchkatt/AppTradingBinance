import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z.object({
    // Exchange Configuration
    EXCHANGE_NAME: z.enum(['binance', 'bybit', 'alpaca', 'kraken']),
    EXCHANGE_API_KEY: z.string().min(1, 'API Key is required'),
    EXCHANGE_API_SECRET: z.string().min(1, 'API Secret is required'),
    EXCHANGE_TESTNET: z.boolean().default(true),

    // Risk Management
    MAX_POSITION_SIZE_PCT: z.number().min(0).max(1).default(0.1), // 10% máximo por posición
    MAX_DAILY_LOSS_PCT: z.number().min(0).max(1).default(0.02), // 🔧 OPTIMIZADO: 2% pérdida diaria máxima (era 3%)
    RISK_PER_TRADE_PCT: z.number().min(0).max(0.05).default(0.005), // 🔧 OPTIMIZADO: 0.5% por trade (era 1%)
    MAX_OPEN_POSITIONS: z.number().int().min(1).default(2), // 🔧 OPTIMIZADO: 2 trades NO correlacionados (era 6)
    DEFAULT_LEVERAGE: z.number().min(1).max(125).default(3), // 🔧 OPTIMIZADO: 3x leverage (era 10x)
    MAX_STOP_LOSS_PCT: z.number().min(0).max(0.1).default(0.001),

    // v4.0 Trading Parameters
    TAKE_PROFIT_ROI: z.number().default(0.05), // 🔧 FINAL: 5% Price Move - Ratio 2.5:1 para rentabilidad
    STOP_LOSS_ROI: z.number().default(0.02), // 🔧 OPTIMIZADO: 2% ROI Distance (era 2.5%)

    // v4.0 Profit Goals & Fees
    MAX_DAILY_PROFIT_PCT: z.number().default(0.15), // 15% Daily Goal
    ESTIMATED_FEE_PCT: z.number().default(0.0005), // 0.05% Taker Fee (Binance Standard)
    TRAILING_ACTIVATION_ROI: z.number().default(0.03), // 3% ROI Activation
    TRAILING_LOCK_ROI: z.number().default(0.022), // 2.2% ROI Lock

    // Volatility Circuit Breaker
    MAX_VOLATILITY_ATR_PCT: z.number().default(0.02), // 2% ATR Threshold

    // v4.0 Timing & Filters
    SCAN_INTERVAL_MS: z.number().default(300000), // 5 min (debe coincidir con TIMEFRAME)
    POSITION_CHECK_INTERVAL_MS: z.number().default(2000), // 2 sec
    MAX_TRADE_DURATION_MS: z.number().default(86400000), // 24h (Desactivado efecto inmediato)
    // v4.0 Streak Control
    MAX_CONSECUTIVE_LOSSES: z.number().default(2),
    COOLDOWN_TIME_MS: z.number().default(3600000), // 1h Cooldown (era 20 min)

    ORDER_TTL_MINUTES: z.number().default(30), // 30 min Order Expiry

    // Database
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Telegram Alerts
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // Server
    PORT: z.number().default(3005),
    WEBHOOK_SECRET: z.string().min(32, 'Webhook secret debe tener al menos 32 caracteres'),

    // Trading
    SYMBOLS: z.array(z.string()).default(['BTC/USDT']),
    TIMEFRAME: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('5m'),

    // Capital Override (for testing with specific amount)
    OVERRIDE_CAPITAL: z.number().optional(),

    // Strategy enable/disable flags
    STRATEGY_TREND_ENABLED: z.boolean().default(true),
    STRATEGY_MEAN_REVERSION_ENABLED: z.boolean().default(true),
    STRATEGY_BREAKOUT_ENABLED: z.boolean().default(true),
    STRATEGY_SCALPING_ENABLED: z.boolean().default(true),
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
            RISK_PER_TRADE_PCT: Number(process.env.RISK_PER_TRADE_PCT) || 0.005, // 🔧 OPTIMIZADO: 0.5% default
            MAX_OPEN_POSITIONS: Number(process.env.MAX_OPEN_POSITIONS) || 1, // 🔧 OPTIMIZADO: 1 trade default
            DEFAULT_LEVERAGE: Number(process.env.DEFAULT_LEVERAGE) || 3, // 🔧 OPTIMIZADO: 3x default
            MAX_STOP_LOSS_PCT: process.env.MAX_STOP_LOSS_PCT ? Number(process.env.MAX_STOP_LOSS_PCT) : 0.001,

            // v4.0 Trading Parameters (read from ENV or use Schema defaults)
            // Note: TAKE_PROFIT_ROI optimized to 5% for better Risk:Reward (2.5:1)
            TAKE_PROFIT_ROI: process.env.TAKE_PROFIT_ROI ? Number(process.env.TAKE_PROFIT_ROI) : 0.05, // 🔧 FINAL
            STOP_LOSS_ROI: process.env.STOP_LOSS_ROI ? Number(process.env.STOP_LOSS_ROI) : 0.02, // 🔧 OPTIMIZADO
            TRAILING_ACTIVATION_ROI: process.env.TRAILING_ACTIVATION_ROI ? Number(process.env.TRAILING_ACTIVATION_ROI) : 0.03,
            TRAILING_LOCK_ROI: process.env.TRAILING_LOCK_ROI ? Number(process.env.TRAILING_LOCK_ROI) : 0.022,

            // v4.0 Timing & Filters
            SCAN_INTERVAL_MS: process.env.SCAN_INTERVAL_MS ? Number(process.env.SCAN_INTERVAL_MS) : 300000,
            POSITION_CHECK_INTERVAL_MS: process.env.POSITION_CHECK_INTERVAL_MS ? Number(process.env.POSITION_CHECK_INTERVAL_MS) : 5000,
            MAX_TRADE_DURATION_MS: process.env.MAX_TRADE_DURATION_MS ? Number(process.env.MAX_TRADE_DURATION_MS) : 86400000,

            // v4.0 Streak Control
            MAX_CONSECUTIVE_LOSSES: process.env.MAX_CONSECUTIVE_LOSSES ? Number(process.env.MAX_CONSECUTIVE_LOSSES) : 2,
            COOLDOWN_TIME_MS: process.env.COOLDOWN_TIME_MS ? Number(process.env.COOLDOWN_TIME_MS) : 3600000,

            DATABASE_URL: process.env.DATABASE_URL,
            REDIS_URL: process.env.REDIS_URL,

            TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
            TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,

            PORT: Number(process.env.PORT) || 3005,
            WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,

            SYMBOLS: process.env.SYMBOLS?.split(',').map(s => s.trim()),
            TIMEFRAME: process.env.TIMEFRAME,

            OVERRIDE_CAPITAL: process.env.OVERRIDE_CAPITAL ? Number(process.env.OVERRIDE_CAPITAL) : undefined,

            // Strategy flags (default true unless explicitly set to 'false')
            STRATEGY_TREND_ENABLED: process.env.STRATEGY_TREND_ENABLED !== 'false',
            STRATEGY_MEAN_REVERSION_ENABLED: process.env.STRATEGY_MEAN_REVERSION_ENABLED !== 'false',
            STRATEGY_BREAKOUT_ENABLED: process.env.STRATEGY_BREAKOUT_ENABLED !== 'false',
            STRATEGY_SCALPING_ENABLED: process.env.STRATEGY_SCALPING_ENABLED !== 'false',

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

import fs from 'fs';
import path from 'path';

export async function updateEnvFile(updates: Record<string, any>) {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';

    try {
        envContent = fs.readFileSync(envPath, 'utf-8');
    } catch (e) {
        console.warn('⚠️ No se encontró el archivo .env, se creará uno nuevo.');
    }

    for (const [key, value] of Object.entries(updates)) {
        // Ensure values are stringified correctly
        const stringValue = String(value);

        // Regex to find 'KEY=value' preserving comments if possible (simple regex)
        // Matches start of line, key, optional space, equals, optional space, rest of line
        const regex = new RegExp(`^${key}=.*`, 'm');

        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${stringValue}`);
        } else {
            // Append if not exists, ensure newline
            if (envContent && !envContent.endsWith('\n')) {
                envContent += '\n';
            }
            envContent += `${key}=${stringValue}\n`;
        }
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`✅ Archivo .env actualizado con: ${Object.keys(updates).join(', ')}`);
}


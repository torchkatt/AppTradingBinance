import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { RiskManager } from './core/RiskManager.js';
import { ExchangeConnector } from './core/ExchangeConnector.js';
import { TradingBot } from './core/TradingBot.js';
import { MultiStrategyOrchestrator } from './strategies/MultiStrategyOrchestrator.js';
import { TelegramNotifier } from './monitoring/TelegramNotifier.js';
import { db } from './database/index.js';
import { SingletonLock } from './utils/singleton.js';

/**
 * Sistema principal de trading automatizado
 * 
 * Entry point de la aplicación
 */
class TradingSystem {
    private exchange!: ExchangeConnector;
    private riskManager!: RiskManager;
    private tradingBot!: TradingBot;
    private notifier: TelegramNotifier;
    private readonly orchestrator: MultiStrategyOrchestrator;

    constructor() {
        // Sistema multi-estrategia con selección automática por régimen de mercado
        this.orchestrator = new MultiStrategyOrchestrator();

        // Inicializar notificador
        this.notifier = new TelegramNotifier();
    }

    /**
     * Inicializa todos los componentes del sistema
     */
    async initialize(): Promise<void> {
        try {
            logger.info('');
            // 1. Iniciar servidor API para dashboard INMEDIATAMENTE
            // Esto permite cambiar la configuración si el bot se queda pegado inicializando
            const { createApiServer } = await import('./api/server.js');
            createApiServer(3005);
            logger.info('🌐 API Server started on port 3005 (Boot mode)');

            // 2. Inicializar base de datos
            await db.initialize();
            logger.info('✅ Database initialized');

            // 2. Conectar al exchange
            this.exchange = new ExchangeConnector();
            await this.exchange.initialize();
            logger.info('✅ Exchange connected');

            // 3. Obtener balance real
            const balance = await this.exchange.getBalance();

            // Use override capital if set (for testing), otherwise use actual balance
            const effectiveBalance = config.OVERRIDE_CAPITAL || balance.total || 1000;

            if (config.OVERRIDE_CAPITAL) {
                logger.warn({
                    actualBalance: balance.total,
                    overrideCapital: config.OVERRIDE_CAPITAL
                }, '⚠️ Using OVERRIDE_CAPITAL for testing - ignoring actual exchange balance');
                logger.info(`✅ Balance Override: ${effectiveBalance} USDT (Simulating $${config.OVERRIDE_CAPITAL} startup)`);
            } else {
                logger.info(`✅ Balance: ${balance.total} USDT (Free: ${balance.free})`);
            }

            // 4. Inicializar capital manager
            const { CapitalManager } = await import('./core/CapitalManager.js');
            const capitalManager = new CapitalManager(effectiveBalance, this.notifier);
            await capitalManager.initialize();
            logger.info('✅ Capital Manager initialized');

            // 5. Inicializar risk manager con capital manager
            this.riskManager = new RiskManager(effectiveBalance, this.exchange, capitalManager);
            await this.riskManager.initialize();
            logger.info('✅ Risk Manager initialized');

            // 6. Crear trading bot
            this.tradingBot = new TradingBot(
                this.exchange,
                this.riskManager,
                this.notifier,
                [this.orchestrator]
            );
            logger.info('✅ Trading Bot created');

            // 7. Registrar bot en el API Provider
            const { botProvider } = await import('./api/botProvider.js');
            botProvider.setBot(this.tradingBot);
            logger.info('✅ Bot registered in API Provider');

            // 8. Enviar notificación de inicio
            await this.notifier.sendStartupMessage();

            logger.info('');
            logger.info('═══════════════════════════════════════════════════════════════');
            logger.info('  CONFIGURATION');
            logger.info('═══════════════════════════════════════════════════════════════');
            logger.info('');
            logger.info(`  Exchange:         ${config.EXCHANGE_NAME}`);
            logger.info(`  Mode:             ${config.EXCHANGE_TESTNET ? '⚠️  TESTNET' : '🔴 LIVE TRADING'}`);
            logger.info(`  Symbols:          ${config.SYMBOLS.join(', ')}`);
            logger.info(`  Timeframe:        ${config.TIMEFRAME}`);
            logger.info(`  Strategies:       ${this.orchestrator.name}`);
            logger.info(`  Balance:          ${effectiveBalance.toFixed(2)} USDT${config.OVERRIDE_CAPITAL ? ' (OVERRIDE)' : ''}`);
            logger.info('');
            logger.info('  Risk Management:');
            logger.info(`    Risk/Trade:     ${(config.RISK_PER_TRADE_PCT * 100).toFixed(1)}%`);
            logger.info(`    Daily Loss:     ${(config.MAX_DAILY_LOSS_PCT * 100).toFixed(1)}% max`);
            logger.info(`    Position Size:  ${(config.MAX_POSITION_SIZE_PCT * 100).toFixed(1)}% max`);
            logger.info('');
            logger.info('═══════════════════════════════════════════════════════════════');
            logger.info('');

            if (!config.EXCHANGE_TESTNET) {
                logger.warn('');
                logger.warn('⚠️  WARNING: LIVE TRADING MODE - Real money at risk!');
                logger.warn('⚠️  Make sure you have completed backtesting and paper trading');
                logger.warn('');
            }

        } catch (error) {
            logger.error({ error }, '❌ Failed to initialize trading system');
            throw error;
        }
    }

    /**
     * Inicia el sistema de trading
     */
    async start(): Promise<void> {
        logger.info('');
        logger.info('═══════════════════════════════════════════════════════════════');
        logger.info('  STARTING TRADING BOT');
        logger.info('═══════════════════════════════════════════════════════════════');
        logger.info('');

        await this.tradingBot.start();

        logger.info('');
        logger.info('✅ System is now active and monitoring markets');
        logger.info('');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('  Press Ctrl+C to stop gracefully');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('');
    }

    /**
     * Detiene el sistema de trading
     */
    async stop(): Promise<void> {
        logger.info('');
        logger.info('📴 Shutting down trading system...');
        logger.info('');

        // Detener trading bot
        if (this.tradingBot) {
            await this.tradingBot.stop();
        }

        // Cerrar base de datos
        await db.close();

        logger.info('');
        logger.info('✅ System stopped successfully');
        logger.info('');
    }
}

/**
 * Entry point
 */
async function main() {
    // 🔒 CRITICAL: Verificar que no haya otra instancia corriendo
    if (!SingletonLock.acquire()) {
        process.exit(1);
    }

    // Configurar limpieza automática del lock file
    SingletonLock.setupCleanup();

    const system = new TradingSystem();

    // Manejo de señales de terminación
    process.on('SIGINT', async () => {
        await system.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await system.stop();
        process.exit(0);
    });

    // Manejo de errores no capturados
    process.on('uncaughtException', async (error) => {
        logger.error({ error }, '💥 Uncaught exception');
        await system.stop();
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
        logger.error({ reason, promise }, '💥 Unhandled promise rejection');
        await system.stop();
        process.exit(1);
    });

    try {
        await system.initialize();
        await system.start();

        // Mantener el proceso corriendo
        await new Promise(() => { });

    } catch (error) {
        logger.error({ error }, '💥 Fatal error in main');
        await system.stop();
        process.exit(1);
    }
}

main();

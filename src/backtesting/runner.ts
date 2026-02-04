// ... types and imports
import { BacktestEngine } from './BacktestEngine.js';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy.js';
import { TrendMomentumStrategy } from '../strategies/TrendMomentumStrategy.js';
// ExchangeConnector se importa dinámicamente para forzar config
import { logger } from '../utils/logger.js';
import { OHLCV } from '../types/index.js';

// Helper to parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config: any = {
        symbol: 'BTC/USDT',
        timeframe: '5m',
        strategy: 'MeanReversion',
        initialCapital: 10000
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--symbol': config.symbol = args[++i]; break;
            case '--timeframe': config.timeframe = args[++i]; break;
            case '--strategy': config.strategy = args[++i]; break;
            case '--period':
                const parts = args[++i].split(':');
                config.startDate = parts[0];
                config.endDate = parts[1];
                break;
        }
    }
    return config;
}

// Helper to get strategy instance
function getStrategy(name: string) {
    switch (name) {
        case 'MeanReversion': return new MeanReversionStrategy();
        case 'TrendMomentum': return new TrendMomentumStrategy();
        default: throw new Error(`Unknown strategy: ${name}`);
    }
}

// Helper to download historical data
async function downloadHistoricalData(
    exchange: any,
    symbol: string,
    timeframe: string,
    startDateStr: string,
    endDateStr: string
): Promise<OHLCV[]> {
    logger.info({ symbol, timeframe, startDate: startDateStr, endDate: endDateStr }, 'Downloading historical data...');

    const startDate = new Date(startDateStr).getTime();
    const endDate = new Date(endDateStr).getTime();

    let allData: OHLCV[] = [];
    let since = startDate;
    const limit = 1000;

    try {
        while (since < endDate) {
            const data = await exchange.fetchOHLCV(symbol, timeframe, since, limit);

            if (data.length === 0) break;

            allData.push(...data);
            since = data[data.length - 1].timestamp + 1;

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Filter to ensure we stay within range
        return allData.filter(candle =>
            candle.timestamp >= startDate && candle.timestamp <= endDate
        );

    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to download data');
        throw error;
    }
}

async function run() {
    try {
        // FORZAR MODO PRODUCCIÓN para backtesting
        // Necesitamos datos reales históricos, no de testnet
        process.env.EXCHANGE_TESTNET = 'false';

        // Re-importar dinámicamente para que lea la nueva config
        const { ExchangeConnector } = await import('../core/ExchangeConnector.js');

        const config = parseArgs();

        logger.info('');
        logger.info('╔═══════════════════════════════════════════════════════════════╗');
        logger.info('║                   STARTING BACKTEST                           ║');
        logger.info('╚═══════════════════════════════════════════════════════════════╝');
        logger.info('');

        // Crear exchange connector
        const exchange = new ExchangeConnector();
        await exchange.initialize(true); // Solo público para backtesting

        // Descargar datos históricos
        const startDate = config.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = config.endDate || new Date().toISOString().split('T')[0];

        const data = await downloadHistoricalData(
            exchange,
            config.symbol,
            config.timeframe,
            startDate,
            endDate
        );

        if (data.length < 100) {
            logger.error('Not enough data to run backtest (minimum 100 bars required)');
            process.exit(1);
        }

        // Obtener estrategia
        const strategy = getStrategy(config.strategy);
        logger.info({ strategy: strategy.name, description: strategy.description });

        // Ejecutar backtest
        const engine = new BacktestEngine(config.initialCapital);
        const result = await engine.run(strategy, data);

        // Evaluar resultados
        logger.info('');
        logger.info('═══════════════════════════════════════════════════');
        logger.info('  EVALUATION');
        logger.info('═══════════════════════════════════════════════════');
        logger.info('');

        const checks = [
            { name: 'Sharpe Ratio > 1.5', pass: result.sharpeRatio >= 1.5, value: result.sharpeRatio.toFixed(2) },
            { name: 'Win Rate > 45%', pass: result.winRate >= 0.45, value: (result.winRate * 100).toFixed(1) + '%' },
            { name: 'Profit Factor > 1.5', pass: result.profitFactor >= 1.5, value: result.profitFactor.toFixed(2) },
            { name: 'Max Drawdown < 20%', pass: result.maxDrawdownPercent < 20, value: result.maxDrawdownPercent.toFixed(2) + '%' },
            { name: 'Positive Return', pass: result.totalReturnPercent > 0, value: result.totalReturnPercent.toFixed(2) + '%' },
        ];

        checks.forEach(check => {
            const icon = check.pass ? '✅' : '❌';
            logger.info(`  ${icon} ${check.name.padEnd(30)} ${check.value}`);
        });

        logger.info('');

        const allPassed = checks.every(c => c.pass);

        if (allPassed) {
            logger.info('🎉 ALL CHECKS PASSED! Strategy is ready for paper trading.');
            logger.info('');
            logger.info('Next steps:');
            logger.info('  1. Run paper trading for 2 weeks: npm run dev');
            logger.info('  2. Monitor daily performance via Telegram');
            logger.info('  3. Only after validation, consider live trading with minimal capital');
        } else {
            logger.warn('⚠️ Some checks failed. Strategy needs optimization.');
            logger.info('');
            logger.info('Suggestions:');
            logger.info('  - Adjust strategy parameters');
            logger.info('  - Try different timeframes');
            logger.info('  - Test on different market conditions');
            logger.info('  - Consider combining with other strategies');
        }

        logger.info('');
        logger.info('═══════════════════════════════════════════════════');

        process.exit(allPassed ? 0 : 1);

    } catch (error: any) {
        logger.error({ error: error.message }, 'Backtest failed');
        process.exit(1);
    }
}

run();

#!/usr/bin/env node
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { logger } from '../utils/logger.js';

/**
 * Script para verificar la configuración del sistema antes de operar
 * 
 * Verifica:
 * - Conexión al exchange
 * - Credenciales válidas
 * - Balance disponible
 * - Símbolos válidos
 * - Configuración de riesgo
 */

async function main() {
    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('  SYSTEM HEALTH CHECK');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    let allPassed = true;

    // 1. Verificar conexión al exchange
    logger.info('1️⃣  Checking exchange connection...');
    try {
        const exchange = new ExchangeConnector();
        await exchange.initialize();
        logger.info('   ✅ Exchange connected');

        // 2. Verificar balance
        logger.info('2️⃣  Checking account balance...');
        const balance = await exchange.getBalance();
        logger.info(`   ✅ Balance: ${balance.total} USDT (Free: ${balance.free})`);

        if (balance.total < 100) {
            logger.warn('   ⚠️  Balance is low. Minimum recommended: 500 USDT');
        }

        // 3. Verificar símbolos
        logger.info('3️⃣  Checking trading symbols...');
        const symbols = process.env.SYMBOLS?.split(',') || ['BTC/USDT'];

        for (const symbol of symbols) {
            try {
                const ticker = await exchange.getExchange().fetchTicker(symbol);
                logger.info(`   ✅ ${symbol}: ${ticker.last}`);
            } catch (error: any) {
                logger.error(`   ❌ ${symbol}: Invalid or unavailable`);
                allPassed = false;
            }
        }

        // 4. Verificar configuración de riesgo
        logger.info('4️⃣  Checking risk configuration...');

        logger.info(`   ✅ Daily Loss Limit: ${(parseFloat(process.env.MAX_DAILY_LOSS_PCT || '0.03') * 100).toFixed(1)}%`);
        logger.info(`   ✅ Risk Per Trade: ${(parseFloat(process.env.RISK_PER_TRADE_PCT || '0.01') * 100).toFixed(1)}%`);
        logger.info(`   ✅ Max Position Size: ${(parseFloat(process.env.MAX_POSITION_SIZE_PCT || '0.1') * 100).toFixed(1)}%`);

        // 5. Verificar modo testnet
        logger.info('5️⃣  Checking trading mode...');
        const isTestnet = process.env.EXCHANGE_TESTNET === 'true';

        if (isTestnet) {
            logger.info('   ✅ TESTNET mode - Safe for testing');
        } else {
            logger.warn('   ⚠️  LIVE TRADING mode - Real money at risk!');
            logger.warn('   ⚠️  Make sure you have completed backtesting and paper trading');
        }

    } catch (error: any) {
        logger.error(`   ❌ ${error.message}`);
        allPassed = false;
    }

    logger.info('');
    logger.info('═══════════════════════════════════════════════════');

    if (allPassed) {
        logger.info('✅ All checks passed! System is ready to trade.');
        logger.info('');
        logger.info('To start trading:');
        logger.info('  npm run bot    (development mode)');
        logger.info('  npm start      (production mode)');
    } else {
        logger.error('❌ Some checks failed. Please fix the issues before trading.');
        process.exit(1);
    }

    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');
}

main();

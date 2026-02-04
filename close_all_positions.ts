/**
 * Script para cerrar TODAS las posiciones abiertas actualmente
 */
import { ExchangeConnector } from './src/core/ExchangeConnector.js';
import { config } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

async function closeAllCurrentPositions() {
    try {
        logger.info('🔄 Cerrando todas las posiciones actuales...');

        const exchange = new ExchangeConnector(
            config.EXCHANGE_NAME,
            config.EXCHANGE_API_KEY,
            config.EXCHANGE_API_SECRET,
            config.EXCHANGE_TESTNET
        );

        await exchange.initialize();
        logger.info('✅ Conectado al exchange');

        // Obtener posiciones abiertas dinámicamente
        const positions = await exchange.getOpenPositions();

        if (positions.length === 0) {
            logger.info('ℹ️ No hay posiciones abiertas');
            process.exit(0);
        }

        logger.info({ positionCount: positions.length }, 'Posiciones encontradas');

        let closed = 0;
        let failed = 0;

        for (const position of positions) {
            try {
                const { symbol, side, contracts } = position;
                const closeSide = side === 'long' ? 'sell' : 'buy';

                logger.info({
                    symbol,
                    side,
                    contracts
                }, `🔄 Cerrando ${symbol}...`);

                // Crear orden para cerrar (usando el connector method)
                const order = await exchange.createMarketOrder(
                    symbol,
                    closeSide,
                    contracts
                );

                logger.info({
                    symbol,
                    orderId: order?.id
                }, `✅ ${symbol} cerrado`);

                closed++;
                await new Promise(resolve => setTimeout(resolve, 1500));

            } catch (error: any) {
                logger.error({
                    symbol: position.symbol,
                    error: error.message
                }, `❌ Error cerrando ${position.symbol}`);
                failed++;
            }
        }

        logger.info({ closed, failed, total: positions.length }, '✅ Proceso completado');
        process.exit(0);

    } catch (error: any) {
        logger.error({ error: error.message }, '❌ Error fatal');
        process.exit(1);
    }
}

closeAllCurrentPositions();

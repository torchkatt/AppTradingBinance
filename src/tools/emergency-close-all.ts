import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { config } from '../config/index.js';
import { tradeLogger as logger } from '../utils/logger.js';

async function emergencyCloseAll() {
    logger.info('🚀 Iniciando CIERRE DE EMERGENCIA de todas las posiciones...');

    const exchange = new ExchangeConnector();

    try {
        // 1. Obtener posiciones abiertas del exchange directamente
        const positions = await exchange.getOpenPositions();

        if (positions.length === 0) {
            logger.info('✅ No se encontraron posiciones abiertas en el exchange.');
            return;
        }

        logger.info(`📦 Encontradas ${positions.length} posiciones para cerrar.`);

        for (const pos of positions) {
            try {
                logger.info({ symbol: pos.symbol, side: pos.side, amount: pos.contracts }, `⏳ Cerrando ${pos.symbol}...`);

                // Determinar el lado opuesto para cerrar
                const closeSide = pos.side === 'long' ? 'sell' : 'buy';

                // Ejecutar orden de mercado para cerrar
                const order = await exchange.createMarketOrder(pos.symbol, closeSide, Math.abs(pos.contracts));

                logger.info({ symbol: pos.symbol, orderId: order.id }, `✅ ${pos.symbol} CERRADA con éxito.`);
            } catch (err: any) {
                logger.error({ symbol: pos.symbol, error: err.message }, `❌ Falló el cierre de ${pos.symbol}`);
            }
        }

        logger.info('🏁 Proceso de cierre de emergencia finalizado.');
    } catch (error: any) {
        logger.error({ error: error.message }, '💥 Error crítico durante el cierre de emergencia');
    }
}

emergencyCloseAll();

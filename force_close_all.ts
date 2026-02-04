/**
 * Script para cerrar TODAS las posiciones forzadamente
 */
import { ExchangeConnector } from './src/core/ExchangeConnector.js';
import { config } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

// Lista manual de posiciones detectadas
const POSITIONS_TO_CLOSE = [
    { symbol: 'BTC/USDT', side: 'long', contracts: 0.001 },
    { symbol: 'ETH/USDT', side: 'long', contracts: 59.58 },
    { symbol: 'SOL/USDT', side: 'long', contracts: 172.2 },
    { symbol: 'AVAX/USDT', side: 'long', contracts: 2454.1 },
    { symbol: 'XRP/USDT', side: 'long', contracts: 52371 },
    { symbol: 'DOGE/USDT', side: 'long', contracts: 799906 }
];

async function forceCloseAll() {
    try {
        logger.info('🔄 Forzando cierre de TODAS las posiciones...');

        // Conectar al exchange
        const exchange = new ExchangeConnector(
            config.EXCHANGE_NAME,
            config.EXCHANGE_API_KEY,
            config.EXCHANGE_API_SECRET,
            config.EXCHANGE_TESTNET
        );

        await exchange.initialize();
        logger.info('✅ Conectado al exchange');

        let closed = 0;
        let failed = 0;

        for (const position of POSITIONS_TO_CLOSE) {
            try {
                const { symbol, side, contracts } = position;
                const closeSide = side === 'long' ? 'sell' : 'buy';

                logger.info({
                    symbol,
                    side,
                    contracts
                }, `🔄 Cerrando ${symbol}...`);

                // Crear orden de mercado para cerrar
                const order = await exchange.getExchange().createOrder(
                    symbol,
                    'market',
                    closeSide,
                    contracts,
                    undefined,
                    {
                        reduceOnly: true
                    }
                );

                logger.info({
                    symbol,
                    orderId: order.id
                }, `✅ ${symbol} cerrado`);

                closed++;
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error: any) {
                logger.error({
                    symbol: position.symbol,
                    error: error.message
                }, `❌ Error: ${position.symbol}`);
                failed++;
            }
        }

        logger.info({ closed, failed, total: POSITIONS_TO_CLOSE.length }, '✅ Proceso completado');
        process.exit(0);

    } catch (error: any) {
        logger.error({ error: error.message }, '❌ Error fatal');
        process.exit(1);
    }
}

forceCloseAll();

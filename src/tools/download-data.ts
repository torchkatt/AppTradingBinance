#!/usr/bin/env node
import { logger } from '../utils/logger.js';

/**
 * Script para obtener y descargar datos históricos del mercado
 * 
 * Uso:
 * tsx src/tools/download-data.ts --symbol BTC/USDT --timeframe 5m --days 365
 */

async function main() {
    // FORZAR MODO PRODUCCIÓN para descargar datos reales
    // Los datos de testnet son irrelevantes para backtesting y causan problemas de conexión
    process.env.EXCHANGE_TESTNET = 'false';
    const { ExchangeConnector } = await import('../core/ExchangeConnector.js');

    const args = process.argv.slice(2);

    let symbol = 'BTC/USDT';
    let timeframe = '5m';
    let days = 30;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--symbol':
                symbol = args[++i];
                break;
            case '--timeframe':
                timeframe = args[++i];
                break;
            case '--days':
                days = parseInt(args[++i]);
                break;
        }
    }

    logger.info({ symbol, timeframe, days }, 'Downloading market data...');

    try {
        const exchange = new ExchangeConnector();
        // Usar modo público para permitir descarga sin API Keys
        await exchange.initialize(true);

        const endDate = Date.now();
        const startDate = endDate - (days * 24 * 60 * 60 * 1000);

        let allData = [];
        let since = startDate;
        const limit = 1000;

        while (since < endDate) {
            const data = await exchange.fetchOHLCV(symbol, timeframe, since, limit);

            if (data.length === 0) break;

            allData.push(...data);
            since = data[data.length - 1].timestamp + 1;

            logger.info(`Downloaded ${allData.length} candles...`);

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        logger.info({ total: allData.length }, '✅ Download complete');

        // Guardar en archivo JSON
        const fs = await import('fs/promises');
        const filename = `market-data-${symbol.replace('/', '-')}-${timeframe}-${days}d.json`;
        await fs.writeFile(filename, JSON.stringify(allData, null, 2));

        logger.info({ filename }, 'Data saved to file');

    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to download data');
        process.exit(1);
    }
}

main();

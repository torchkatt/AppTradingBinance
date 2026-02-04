import ccxt from 'ccxt';
import { config } from '../config/index.js';
import { apiLogger as logger } from '../utils/logger.js';
import { OHLCV, MarketLimits } from '../types/index.js';
import crypto from 'crypto';

/**
 * Wrapper para CCXT con manejo de errores y retry logic
 */
export class ExchangeConnector {
    private exchange: any; // Using any to avoid ccxt namespace issues
    private isTestnet: boolean;
    private marketInfo: Map<string, MarketLimits> = new Map();

    constructor() {
        this.isTestnet = config.EXCHANGE_TESTNET;

        let exchangeId: string = config.EXCHANGE_NAME;
        // Si es binance, usar preferiblemente binanceusdm para evitar problemas con sapi/spot en testnet
        if (exchangeId === 'binance') {
            exchangeId = 'binanceusdm';
        }

        const ExchangeClass = ccxt[exchangeId as keyof typeof ccxt] as typeof ccxt.Exchange;

        if (!ExchangeClass) {
            throw new Error(`Exchange ${exchangeId} not supported`);
        }

        // Base configuration
        const exchangeConfig: any = {
            apiKey: config.EXCHANGE_API_KEY,
            secret: config.EXCHANGE_API_SECRET,
            enableRateLimit: true,
            options: {
                defaultType: 'future',
                adjustForTimeDifference: true,
                recvWindow: 10000,
            },
        };

        // Specialized configuration for Testnet/Demo - INJECTED BEFORE INSTANTIATION
        if (this.isTestnet && exchangeId === 'bybit') {
            exchangeConfig.urls = {
                api: {
                    public: 'https://api-demo.bybit.com',
                    private: 'https://api-demo.bybit.com',
                    v5: 'https://api-demo.bybit.com',
                }
            };
            logger.info(`⚠️ Exchange configured for BYBIT DEMO (api-demo.bybit.com) INJECTED`);
        }

        this.exchange = new ExchangeClass(exchangeConfig);

        // Post-instantiation adjustments
        if (this.isTestnet) {
            // CRITICAL: Do NOT call setSandboxMode(true) for Bybit Demo, it resets URLs!
            if (exchangeId !== 'bybit') {
                this.exchange.setSandboxMode(true);
            } else {
                // Verify URL matches
                logger.info(`   API URL: ${(this.exchange as any).urls['api']['v5']}`);
            }

            // Binance specific legacy logic
            if (exchangeId === 'binanceusdm' || exchangeId === 'binance') {
                const demoUrls = (this.exchange as any).urls['demo'];
                const baseUrls = demoUrls || (this.exchange as any).urls['test'];
                if (baseUrls) {
                    this.exchange.urls['api'] = { ...this.exchange.urls['api'], ...baseUrls };
                    const type = demoUrls ? 'DEMO (Mock Trading)' : 'TESTNET (Legacy)';
                    logger.info(`⚠️ Exchange configured for ${exchangeId.toUpperCase()} ${type}`);
                }
                this.exchange.options['defaultType'] = 'future';
            } else if (exchangeId !== 'bybit') {
                // Already logged SANDBOX for others above if needed
                logger.info(`⚠️ Exchange configured for ${exchangeId.toUpperCase()} SANDBOX`);
            }
        }
    }

    /**
     * Inicializa y verifica conexión al exchange
     */
    async initialize(publicOnly: boolean = false): Promise<void> {
        try {
            // Si es solo público, eliminar credenciales ANTES de cualquier llamada
            if (publicOnly) {
                this.exchange.apiKey = undefined;
                this.exchange.secret = undefined;
                this.exchange.password = undefined;
                logger.info('⚠️ Initialized in PUBLIC ONLY mode (credentials cleared)');
            }

            // Verificar conexión (intentar cargar mercados)
            try {
                await this.exchange.loadMarkets();
                // Load market limits from CCXT markets
                await this.loadMarketLimits();
            } catch (marketError: any) {
                // FIX: Allow Bybit Demo to fail loadMarkets (often returns 10032 Demo not supported)
                if (publicOnly || (this.isTestnet && config.EXCHANGE_NAME === 'bybit')) {
                    logger.warn(`⚠️ Failed to load markets but continuing: ${marketError.message}`);
                    logger.warn('   (This is expected for Bybit Demo - markets will be manually defined)');
                    // Hack: Marcar como cargado para evitar que CCXT intente recargar y falle de nuevo
                    (this.exchange as any).loaded = true;
                    if (!this.exchange.markets) this.exchange.markets = {};
                    // For Bybit Demo, load market limits using native API
                    await this.loadMarketLimitsBybitDemo();
                } else {
                    throw marketError;
                }
            }

            // Si es solo público, no verificar balance ni autenticación
            if (publicOnly) {
                // Eliminar credenciales para evitar que CCXT intente llamar a endpoints privados
                this.exchange.apiKey = undefined;
                this.exchange.secret = undefined;
                this.exchange.password = undefined; // Por si acaso

                logger.info('⚠️ Initialized in PUBLIC ONLY mode (credentials cleared)');
                return;
            }

            // Verificar balance
            const balance = await this.getBalance();

            // Configurar seguridad (Aislado + 10x Leverage) para los símbolos activos
            await this.setupSafetySettings(config.SYMBOLS);

            logger.info({
                exchange: config.EXCHANGE_NAME,
                testnet: this.isTestnet,
                markets: Object.keys(this.exchange.markets).length,
            }, '✅ Exchange connected');

            logger.info({
                totalUSDT: balance.total || 0,
                freeUSDT: balance.free || 0,
            }, 'Account balance');

        } catch (error: any) {
            logger.error({
                error: error.message,
                exchange: config.EXCHANGE_NAME
            }, '❌ Failed to connect to exchange');
            throw error;
        }
    }

    /**
     * Configura el modo de margen aislado y el apalancamiento para una lista de símbolos
     */
    async setupSafetySettings(symbols: string[]): Promise<void> {
        if (this.isTestnet && config.EXCHANGE_NAME === 'bybit') {
            logger.info('⚠️ Skipping safety settings for Bybit Demo (Manual config required)');
            return;
        }

        logger.info('🛡️ Aplicando configuraciones de seguridad (Aislado + 10x Leverage)...');

        // Configuración Global para Binance: Single Asset Mode
        if (config.EXCHANGE_NAME === 'binance') {
            try {
                // Forzar modo de activo único (false = Single Asset Mode)
                await this.exchange.fapiPrivatePostMultiAssetsMargin({ multiAssetsMargin: 'false' });
                logger.info('✅ Account set to Single-Asset Mode');
            } catch (e: any) {
                if (e.message.includes('No need to change') || e.message.includes('already in')) {
                    logger.debug('ℹ️ Account already in Single-Asset Mode');
                } else {
                    logger.warn({ error: e.message }, '⚠️ Could not enforce Single-Asset Mode');
                }
            }
        }

        for (const symbol of symbols) {
            try {
                // 1. Configurar Apalancamiento (Max 10x)
                try {
                    await this.exchange.setLeverage(config.DEFAULT_LEVERAGE, symbol);
                    logger.debug({ symbol, leverage: config.DEFAULT_LEVERAGE }, '✅ Leverage set');
                } catch (e: any) {
                    if (e.message.includes('already set to')) {
                        logger.debug({ symbol }, 'ℹ️ Leverage already 10x');
                    } else {
                        logger.warn({ symbol, error: e.message }, '⚠️ Could not set leverage');
                    }
                }

                // 2. Configurar Modo de Margen (ISOLATED)
                try {
                    await this.exchange.setMarginMode('ISOLATED', symbol);
                    logger.debug({ symbol }, '✅ Margin mode set to ISOLATED');
                } catch (e: any) {
                    if (e.message.includes('already in') || e.message.includes('No need to change')) {
                        logger.debug({ symbol }, 'ℹ️ Margin mode already ISOLATED');
                    } else {
                        logger.warn({ symbol, error: e.message }, '⚠️ Could not set margin mode');
                    }
                }

            } catch (err: any) {
                logger.error({ symbol, error: err.message }, '❌ Failed to apply safety settings for symbol');
            }
        }
        logger.info('🛡️ Configuraciones de seguridad finalizadas.');
    }

    /**
     * Obtiene datos históricos OHLCV
     */
    async fetchOHLCV(
        symbol: string,
        timeframe: string = '5m',
        since?: number,
        limit?: number
    ): Promise<OHLCV[]> {
        try {
            // FIX: Manual Bybit V5 Demo Handler using NATIVE FETCH
            if (config.EXCHANGE_NAME === 'bybit' && this.isTestnet) {
                try {
                    const marketId = symbol.replace('/', '');
                    // KLINE Params
                    const baseUrl = 'https://api-demo.bybit.com';
                    const endpoint = '/v5/market/kline';

                    let interval = timeframe.replace('m', '');
                    if (timeframe.endsWith('h')) interval = (parseInt(timeframe) * 60).toString();
                    if (timeframe.endsWith('d')) interval = 'D';

                    const queryString = `category=linear&symbol=${marketId}&interval=${interval}&limit=${limit || 200}`;
                    const url = `${baseUrl}${endpoint}?${queryString}`;

                    // Public request - no headers needed for kline
                    const response = await fetch(url);
                    const data: any = await response.json();

                    if (data.retCode === 0 && data.result?.list) {
                        return data.result.list.map((c: any[]) => ({
                            timestamp: parseInt(c[0]),
                            open: parseFloat(c[1]),
                            high: parseFloat(c[2]),
                            low: parseFloat(c[3]),
                            close: parseFloat(c[4]),
                            volume: parseFloat(c[5]),
                        })).sort((a: any, b: any) => a.timestamp - b.timestamp);
                    }
                } catch (e: any) {
                    logger.warn(`Manual OHLCV fetch failed: ${e.message}, falling back...`);
                }
            }

            // Fallback to Standard CCXT
            if (this.isTestnet && !this.exchange.markets[symbol]) {
                const id = symbol.replace('/', '');
                this.exchange.markets[symbol] = {
                    id: id,
                    symbol: symbol,
                    base: symbol.split('/')[0],
                    quote: symbol.split('/')[1],
                    baseId: symbol.split('/')[0],
                    quoteId: symbol.split('/')[1],
                    active: true,
                    precision: { amount: 3, price: 2 },
                    limits: { amount: { min: 0.001, max: 1000 }, price: { min: 0.1, max: 1000000 } },
                } as any;
                this.exchange.ids = { ...this.exchange.ids, [id]: symbol };
            }

            const params = config.EXCHANGE_NAME === 'bybit' ? { category: 'linear' } : {};
            const data = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit, params);

            return data.map((candle: any) => ({
                timestamp: candle[0],
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5],
            }));
        } catch (error: any) {
            logger.error({
                error: error.message,
                symbol,
                timeframe
            }, 'Failed to fetch OHLCV');
            throw error;
        }
    }

    /**
     * Crea una orden de mercado "Inteligente" usando LIMIT POST-ONLY para ahorrar comisiones (Maker)
     * Si no se llena en unos segundos, re-intenta al nuevo precio.
     */
    async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number): Promise<any> {
        try {
            logger.info({ symbol, side, amount }, '🚀 Iniciando ejecución de Orden Smart Limit (Maker)...');

            const MAX_RETRIES = 3;
            let currentRetry = 0;

            while (currentRetry < MAX_RETRIES) {
                // 1. Obtener el mejor precio actual (Bid para Compra, Ask para Venta)
                const ticker = await this.getTicker(symbol);
                if (!ticker) throw new Error(`No se pudo obtener el ticker para ${symbol}`);

                // FALLBACK: Usar el mejor precio disponible (Bid/Ask) o el Precio Último
                const targetPrice = side === 'buy' ? (ticker.bid || ticker.last) : (ticker.ask || ticker.last);

                logger.info({
                    symbol,
                    side,
                    targetPrice,
                    retry: currentRetry + 1
                }, '⏳ Colocando orden Limit Post-Only...');

                try {
                    // 2. Colocar orden Limit con Post-Only
                    // Binance: timeInForce = 'GTX', Bybit: postOnly = true
                    const params: any = { postOnly: true };
                    if (config.EXCHANGE_NAME === 'binance') {
                        params.timeInForce = 'GTX';
                    }

                    const order = await this.exchange.createOrder(
                        symbol,
                        'limit',
                        side,
                        amount,
                        targetPrice,
                        params
                    );

                    logger.info({ orderId: order.id, price: targetPrice }, '✅ Orden colocada en el libro. Esperando llenado...');

                    // 3. Esperar un momento a que se llene (Maker orders no son instantáneas)
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // 4. Verificar estado
                    const updatedOrder = await this.exchange.fetchOrder(order.id, symbol);

                    if (updatedOrder.status === 'closed' || updatedOrder.status === 'filled') {
                        logger.info({ orderId: order.id }, '🎊 Orden LLENADA con éxito (Maker Fee aplicada).');
                        return updatedOrder;
                    }

                    // 5. Si no se llenó, cancelar e intentar de nuevo
                    logger.warn({ orderId: order.id, status: updatedOrder.status }, '⚠️ Orden no llenada a tiempo. Cancelando y re-intentando...');
                    await this.exchange.cancelOrder(order.id, symbol);
                    currentRetry++;

                } catch (e: any) {
                    // Si el error es que el precio ya cambió y no se pudo poner Post-Only, re-intentamos
                    logger.warn({ error: e.message }, '⚠️ Error al colocar Post-Only (posible cambio de precio). Re-intentando...');
                    currentRetry++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // 6. Fallback final: Si tras re-intentos falla, usamos market para no perder el trade (opcional)
            logger.warn('🚨 Fallaron re-intentos Limit Maker. Usando Market Order como respaldo...');
            return await this.exchange.createOrder(symbol, 'market', side, amount);

        } catch (error: any) {
            logger.error({
                error: error.message,
                symbol,
                side,
                amount
            }, '❌ Error crítico en ejecución de orden');
            throw error;
        }
    }

    /**
     * Crea una orden con stop loss y take profit
     */
    async createOrderWithSLTP(
        symbol: string,
        side: 'buy' | 'sell',
        amount: number,
        stopLoss?: number,
        takeProfit?: number
    ): Promise<any> {
        try {
            // Crear orden principal
            const mainOrder = await this.createMarketOrder(symbol, side, amount);

            // Crear stop loss si está especificado
            if (stopLoss) {
                const slSide = side === 'buy' ? 'sell' : 'buy';
                // CCXT for Binance requires 'stopPrice' in params (sometimes 'triggerPrice')
                const params: any = {
                    stopPrice: stopLoss,
                    triggerPrice: stopLoss,
                    reduceOnly: true
                };
                await this.exchange.createOrder(
                    symbol,
                    'stop_market',
                    slSide,
                    amount,
                    undefined, // stop_market doesn't use price arg in createOrder for some drivers
                    params
                );
                logger.debug({ stopLoss }, 'Stop loss order created');
            }

            // Crear take profit si está especificado
            if (takeProfit) {
                const tpSide = side === 'buy' ? 'sell' : 'buy';
                const params: any = {
                    reduceOnly: true
                };
                // Usamos 'limit' en lugar de 'take_profit_market' para entrar como MAKER
                await this.exchange.createOrder(
                    symbol,
                    'limit',
                    tpSide,
                    amount,
                    takeProfit,
                    params
                );
                logger.debug({ takeProfit }, 'Take profit order created');
            }

            return mainOrder;
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to create order with SL/TP');
            throw error;
        }
    }

    /**
     * Obtiene balance de la cuenta
     */
    async getBalance(): Promise<{ total: number; free: number; used: number }> {
        try {
            // FIX: Bybit V5 Demo only supports privateGetV5AccountWalletBalance for UTA
            if (config.EXCHANGE_NAME === 'bybit') {
                const response = await this.exchange.privateGetV5AccountWalletBalance({ accountType: 'UNIFIED' });
                // Response: { result: { list: [ { coin: [ { coin: 'USDT', walletBalance: ..., equity: ... } ] } ] } }
                if (response.result?.list?.[0]?.coin) {
                    const usdt = response.result.list[0].coin.find((c: any) => c.coin === 'USDT');
                    if (usdt) {
                        return {
                            total: parseFloat(usdt.walletBalance || usdt.equity || '0'),
                            free: parseFloat(usdt.walletBalance || usdt.availableToWithdraw || '0'),
                            used: 0 // Simplification
                        };
                    }
                }
                return { total: 0, free: 0, used: 0 };
            }

            const params = {};
            const balance = await this.exchange.fetchBalance(params);
            const usdt = balance.USDT || { total: 0, free: 0, used: 0 };

            return {
                total: usdt.total || 0,
                free: usdt.free || 0,
                used: usdt.used || 0,
            };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch balance');
            throw error;
        }
    }

    /**
     * Obtiene posiciones abiertas
     */
    async getOpenPositions(symbol?: string): Promise<any[]> {
        try {
            // FIX: Manual Bybit V5 Demo Handler for Positions using NATIVE FETCH using correct Headers
            if (config.EXCHANGE_NAME === 'bybit' && this.isTestnet) {
                const marketId = symbol ? symbol.replace('/', '') : undefined;
                const baseUrl = 'https://api-demo.bybit.com';
                const endpoint = '/v5/position/list';
                const timestamp = Date.now().toString();
                const recvWindow = '5000';

                let queryString = 'category=linear';
                if (marketId) queryString += `&symbol=${marketId}`;

                // Signature
                const toSign = timestamp + config.EXCHANGE_API_KEY + recvWindow + queryString;
                const signature = crypto.createHmac('sha256', config.EXCHANGE_API_SECRET).update(toSign).digest('hex');
                const url = `${baseUrl}${endpoint}?${queryString}`;

                const response = await fetch(url, {
                    headers: {
                        'X-BAPI-API-KEY': config.EXCHANGE_API_KEY,
                        'X-BAPI-TIMESTAMP': timestamp,
                        'X-BAPI-SIGN': signature,
                        'X-BAPI-RECV-WINDOW': recvWindow, // DASH required!
                    }
                });
                const data: any = await response.json();

                if (data.retCode === 0 && data.result?.list) {
                    return data.result.list.map((p: any) => ({
                        symbol: symbol || p.symbol,
                        contracts: parseFloat(p.size),
                        side: p.side === 'Buy' ? 'long' : 'short',
                        unrealizedPnl: parseFloat(p.unrealisedPnl),
                        leverage: parseFloat(p.leverage),
                        entryPrice: parseFloat(p.avgPrice)
                    })).filter((p: any) => p.contracts > 0);
                }
            }

            const params = config.EXCHANGE_NAME === 'bybit' ? { category: 'linear' } : {};
            const positions = await this.exchange.fetchPositions(symbol ? [symbol] : undefined, params);
            return positions.filter((p: any) => p.contracts > 0);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch positions');
            return [];
        }
    }

    /**
     * Cierra todas las posiciones de un símbolo
     */
    async closeAllPositions(symbol: string): Promise<void> {
        try {
            const positions = await this.getOpenPositions(symbol);

            for (const position of positions) {
                const side = position.side === 'long' ? 'sell' : 'buy';
                await this.createMarketOrder(symbol, side, position.contracts);
                logger.info({ symbol, side, amount: position.contracts }, 'Position closed');
            }
        } catch (error: any) {
            logger.error({ error: error.message, symbol }, 'Failed to close positions');
            // throw error; // Don't crash on closing error in loop
        }
    }

    /**
     * Obtiene el ticker actual (bid/ask)
     */
    async getTicker(symbol: string): Promise<any> {
        try {
            // FIX: Manual Bybit V5 Demo Handler for Ticker using NATIVE FETCH
            if (config.EXCHANGE_NAME === 'bybit' && this.isTestnet) {
                try {
                    const marketId = symbol.replace('/', '');
                    const baseUrl = 'https://api-demo.bybit.com';
                    const endpoint = '/v5/market/tickers';
                    const queryString = `category=linear&symbol=${marketId}`;
                    const url = `${baseUrl}${endpoint}?${queryString}`;

                    const response = await fetch(url);
                    const data: any = await response.json();

                    if (data.retCode === 0 && data.result?.list?.[0]) {
                        const t = data.result.list[0];
                        return {
                            symbol: symbol,
                            bid: parseFloat(t.bid1Price),
                            ask: parseFloat(t.ask1Price),
                            last: parseFloat(t.lastPrice),
                            timestamp: Date.now(),
                            datetime: new Date().toISOString()
                        };
                    }
                } catch (e: any) {
                    logger.warn(`Manual Ticker fetch failed: ${e.message}`);
                }
            }

            // Bybit V5 requires category=linear for futures
            const params = config.EXCHANGE_NAME === 'bybit' ? { category: 'linear' } : {};
            return await this.exchange.fetchTicker(symbol, params);
        } catch (error: any) {
            logger.warn({ error: error.message, symbol }, 'Failed to fetch ticker for spread check');
            return null;
        }
    }

    /**
     * Carga los límites de mercado desde CCXT markets (para exchanges normales)
     */
    private async loadMarketLimits(): Promise<void> {
        try {
            if (!this.exchange.markets || Object.keys(this.exchange.markets).length === 0) {
                logger.warn('No markets loaded, skipping market limits');
                return;
            }

            for (const symbol of Object.keys(this.exchange.markets)) {
                const market = this.exchange.markets[symbol];

                // Extract limits from CCXT market structure
                const limits: MarketLimits = {
                    symbol: symbol,
                    stepSize: market.precision?.amount || market.limits?.amount?.min || 0.01,
                    minQty: market.limits?.amount?.min || 0.01,
                    minNotional: market.limits?.cost?.min,
                    pricePrecision: market.precision?.price
                };

                this.marketInfo.set(symbol, limits);
            }

            logger.info({ marketsLoaded: this.marketInfo.size }, '✅ Market limits loaded from CCXT');
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to load market limits from CCXT');
        }
    }

    /**
     * Carga los límites de mercado para Bybit Demo usando API nativa
     */
    private async loadMarketLimitsBybitDemo(): Promise<void> {
        try {
            const baseUrl = 'https://api-demo.bybit.com';
            const endpoint = '/v5/market/instruments-info';
            const category = 'linear'; // USDT perpetual futures
            const url = `${baseUrl}${endpoint}?category=${category}`;

            const response = await fetch(url);
            const data: any = await response.json();

            if (data.retCode !== 0) {
                logger.error({ retCode: data.retCode, retMsg: data.retMsg }, 'Failed to fetch Bybit Demo instruments');
                return;
            }

            // Parse instrument info
            for (const instrument of data.result.list || []) {
                const symbol = instrument.symbol.replace('USDT', '/USDT'); // Convert BTCUSDT -> BTC/USDT

                const limits: MarketLimits = {
                    symbol: symbol,
                    stepSize: parseFloat(instrument.lotSizeFilter?.qtyStep || '0.01'),
                    minQty: parseFloat(instrument.lotSizeFilter?.minOrderQty || '0.01'),
                    minNotional: parseFloat(instrument.lotSizeFilter?.minNotionalValue || '0'),
                    pricePrecision: parseFloat(instrument.priceFilter?.tickSize || '0.01')
                };

                // Validate parsed values
                if (limits.stepSize > 0 && limits.minQty > 0) {
                    this.marketInfo.set(symbol, limits);
                }
            }

            logger.info({ marketsLoaded: this.marketInfo.size }, '✅ Market limits loaded from Bybit Demo API');
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to load Bybit Demo market limits');
        }
    }

    /**
     * Obtiene los límites de mercado para un símbolo
     */
    getMarketLimits(symbol: string): MarketLimits | null {
        return this.marketInfo.get(symbol) || null;
    }

    /**
     * Verifica si el exchange está en testnet
     */
    isInTestnet(): boolean {
        return this.isTestnet;
    }

    /**
     * Obtiene el exchange CCXT subyacente (para casos avanzados)
     */
    getExchange(): any {
        return this.exchange;
    }
}

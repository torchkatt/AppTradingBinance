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
                if (e.message.includes('No need to change') || e.message.includes('already in') || e.message.includes('-4171')) {
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
     * Crea una orden de mercado SIMPLE y CONFIABLE
     * Ejecuta al instante al mejor precio disponible (Taker)
     * Sin complicaciones de estado ni reintentos.
     */
    async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number): Promise<any> {
        try {
            logger.info({ symbol, side, amount }, '🚀 Ejecutando orden MARKET (garantía de ejecución)...');

            // Orden market simple - Se ejecuta INSTANTÁNEAMENTE
            const order = await this.exchange.createOrder(
                symbol,
                'market',
                side,
                amount
            );

            logger.info({
                orderId: order.id,
                price: order.average || order.price,
                filled: order.filled
            }, '✅ Orden MARKET ejecutada exitosamente');

            return order;

        } catch (error: any) {
            logger.error({
                error: error.message,
                symbol,
                side,
                amount
            }, '❌ Error en ejecución de orden MARKET');
            throw error;
        }
    }

    /**
     * Crea una orden MARKET con stop loss y take profit opcionales
     * SIMPLIFICADO: la orden principal es MARKET instantánea
     */
    async createOrderWithSLTP(
        symbol: string,
        side: 'buy' | 'sell',
        amount: number,
        stopLoss?: number,
        takeProfit?: number
    ): Promise<any> {
        try {
            // 1. Crear orden MARKET principal (ejecución garantizada)
            const mainOrder = await this.createMarketOrder(symbol, side, amount);

            logger.info({
                orderId: mainOrder.id,
                stopLoss,
                takeProfit
            }, 'Orden principal ejecutada. Colocando órdenes de protección...');

            // 2. Crear Stop Loss si está especificado
            if (stopLoss) {
                const slSide = side === 'buy' ? 'sell' : 'buy';
                try {
                    await this.exchange.createOrder(
                        symbol,
                        'stop_market', // Stop Market = ejecuta al instante cuando toca el precio
                        slSide,
                        amount,
                        undefined, // Sin limit price en stop_market
                        {
                            stopPrice: stopLoss,
                            reduceOnly: true
                        }
                    );
                    logger.info({ stopLoss }, '🛡️ Stop Loss colocado');
                } catch (e: any) {
                    logger.error({ error: e.message, stopLoss }, '❌ CRÍTICO: Fallo al colocar Stop Loss. Cerrando posición por seguridad.');
                    // SEGURIDAD: Sin SL en el exchange es inaceptable.
                    // Cerrar la posición inmediatamente para evitar pérdidas no controladas.
                    try {
                        await this.createMarketOrder(symbol, slSide, amount);
                        logger.info({ symbol }, '🔒 Posición cerrada por seguridad (fallo de SL)');
                    } catch (closeErr: any) {
                        logger.error({ error: closeErr.message, symbol }, '🚨 EMERGENCIA: No se pudo cerrar posición sin SL. Intervención manual requerida.');
                    }
                    throw new Error(`Stop Loss no pudo colocarse en el exchange: ${e.message}`);
                }
            }

            // 3. Crear Take Profit si está especificado
            if (takeProfit) {
                const tpSide = side === 'buy' ? 'sell' : 'buy';
                try {
                    await this.exchange.createOrder(
                        symbol,
                        'limit',
                        tpSide,
                        amount,
                        takeProfit,
                        { reduceOnly: true }
                    );
                    logger.info({ takeProfit }, '🎯 Take Profit colocado');
                } catch (e: any) {
                    logger.error({ error: e.message, takeProfit }, '⚠️ Fallo al colocar Take Profit');
                    // Continuar - la posición queda sin TP pero el SL está activo
                }
            }

            return mainOrder;

        } catch (error: any) {
            logger.error({ error: error.message }, 'Error al crear orden con SL/TP');
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
     * Cancela órdenes pendientes (SL/TP) ANTES del cierre para evitar órdenes huérfanas
     */
    async closeAllPositions(symbol: string): Promise<void> {
        try {
            // 1. Cancelar órdenes pendientes (SL/TP) para limpiar el estado del exchange
            try {
                const openOrders = await this.getOpenOrders(symbol);
                for (const order of openOrders) {
                    try {
                        await this.cancelOrder(order.id, symbol);
                        logger.debug({ orderId: order.id, symbol }, '🗑️ Orden pendiente cancelada antes de cerrar posición');
                    } catch (cancelErr: any) {
                        // No bloquear el cierre si no se puede cancelar una orden
                        logger.warn({ orderId: order.id, symbol, error: cancelErr.message }, 'No se pudo cancelar orden pendiente');
                    }
                }
            } catch (ordersErr: any) {
                logger.warn({ symbol, error: ordersErr.message }, 'No se pudo obtener órdenes pendientes para cancelar');
            }

            // 2. Cerrar posición con orden MARKET
            const positions = await this.getOpenPositions(symbol);
            for (const position of positions) {
                const side = position.side === 'long' ? 'sell' : 'buy';
                await this.createMarketOrder(symbol, side, position.contracts);
                logger.info({ symbol, side, amount: position.contracts }, 'Position closed');
            }
        } catch (error: any) {
            logger.error({ error: error.message, symbol }, 'Failed to close positions');
            throw error; // Propagate error for UI/Telegram feedback
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
     * Obtiene órdenes abiertas (pendientes)
     */
    async getOpenOrders(symbol?: string): Promise<any[]> {
        try {
            if (symbol) {
                return await this.exchange.fetchOpenOrders(symbol);
            } else {
                return await this.exchange.fetchOpenOrders();
            }
        } catch (error) {
            logger.error({ error, symbol }, 'Failed to fetch open orders');
            return [];
        }
    }

    /**
     * Cancela una orden específica
     */
    async cancelOrder(id: string, symbol: string): Promise<void> {
        try {
            await this.exchange.cancelOrder(id, symbol);
            logger.info({ id, symbol }, '🗑️ Order cancelled');
        } catch (error) {
            logger.error({ error, id, symbol }, 'Failed to cancel order');
            throw error;
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

    /**
     * Obtiene el balance de la cuenta
     */
    async fetchBalance(): Promise<any> {
        try {
            const params = config.EXCHANGE_NAME === 'bybit' ? { type: 'contract' } : {};
            return await this.exchange.fetchBalance(params);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch balance');
            throw error;
        }
    }

    /**
     * Obtiene el PnL realizado y comisiones reales de la última posición cerrada
     * Usa los trades recientes del exchange
     * 
     * @param symbol - Par de trading (ej: 'BTC/USDT')
     * @returns { realizedPnl: number, commission: number, exitPrice: number }
     */
    async getPositionPnL(symbol: string): Promise<{ realizedPnl: number; commission: number; exitPrice: number }> {
        try {
            logger.info({ symbol }, '🔍 Fetching real PnL from exchange...');

            // Obtener trades recientes para este símbolo
            const trades = await this.exchange.fetchMyTrades(symbol, undefined, 20);

            if (!trades || trades.length === 0) {
                logger.warn({ symbol }, 'No recent trades found for PnL calculation');
                return { realizedPnl: 0, commission: 0, exitPrice: 0 };
            }

            // Ordenar por timestamp descendente (más reciente primero)
            const sortedTrades = trades.sort((a: any, b: any) => b.timestamp - a.timestamp);

            // Calcular PnL realizado y comisiones totales de los últimos trades
            let totalRealizedPnl = 0;
            let totalCommission = 0;
            let exitPrice = 0;

            // Para Binance/Bybit futures, cada trade tiene:
            // - realizedPnl: PnL realizado en ese trade
            // - fee: comisión pagada
            // - price: precio de ejecución

            for (const trade of sortedTrades.slice(0, 5)) { // Últimos 5 trades
                const pnl = trade.info?.realizedPnl || trade.info?.realized_pnl || 0;
                const fee = trade.fee?.cost || 0;

                totalRealizedPnl += parseFloat(pnl.toString());
                totalCommission += parseFloat(fee.toString());

                // Usar el precio del trade más reciente como exit price
                if (exitPrice === 0) {
                    exitPrice = trade.price || 0;
                }

                logger.debug({
                    tradeId: trade.id,
                    timestamp: new Date(trade.timestamp).toISOString(),
                    price: trade.price,
                    amount: trade.amount,
                    side: trade.side,
                    realizedPnl: pnl,
                    fee: fee
                }, 'Trade detail');
            }

            logger.info({
                symbol,
                totalRealizedPnl,
                totalCommission,
                netPnl: totalRealizedPnl - totalCommission,
                exitPrice
            }, '✅ Real PnL fetched from exchange');

            return {
                realizedPnl: totalRealizedPnl,
                commission: totalCommission,
                exitPrice
            };

        } catch (error: any) {
            logger.error({ error: error.message, symbol }, '❌ Failed to fetch position PnL from exchange');
            // En caso de error, retornar 0s para que el sistema pueda continuar
            // pero logear el error para debugging
            return { realizedPnl: 0, commission: 0, exitPrice: 0 };
        }
    }

    /**
     * Sincroniza el balance de la cuenta desde el exchange
     * Útil para actualizar el balance real después de trades
     */
    async syncBalance(): Promise<number> {
        try {
            const balance = await this.fetchBalance();
            const usdtBalance = balance['USDT']?.total || balance.USDT?.free || 0;

            logger.info({ balance: usdtBalance }, '💰 Balance synced from exchange');
            return parseFloat(usdtBalance.toString());
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to sync balance');
            throw error;
        }
    }

    /**
     * Obtiene el PnL neto de hoy (Realized PnL - Commissions) desde Binance
     * Sincronización exacta con "Resultados de Hoy" en Binance
     */
    async fetchDailyPnL(): Promise<number> {
        if (config.EXCHANGE_NAME !== 'binance') return 0;

        try {
            // Hoy a las 00:00 UTC (Binance usa UTC)
            const now = new Date();
            const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();

            // 1. Obtener Realized PnL de hoy
            const income = await this.exchange.fapiPrivateGetIncome({
                incomeType: 'REALIZED_PNL',
                startTime: todayStart
            });

            // 2. Obtener Comisiones de hoy
            const fees = await this.exchange.fapiPrivateGetIncome({
                incomeType: 'COMMISSION',
                startTime: todayStart
            });

            const realizedPnL = (income || []).reduce((acc: number, item: any) => acc + parseFloat(item.income), 0);
            const commissions = (fees || []).reduce((acc: number, item: any) => acc + parseFloat(item.income), 0);

            const netPnL = realizedPnL + commissions; // Commissions son negativas en income

            logger.info({
                startTime: new Date(todayStart).toISOString(),
                realized: realizedPnL,
                fees: commissions,
                netDailyPnL: netPnL
            }, '💰 Sincronización de PnL Diaria con Binance completada');

            return netPnL;
        } catch (error: any) {
            logger.error({ error: error.message }, '❌ Error al sincronizar PnL de hoy con Binance');
            return 0; // Fallback
        }
    }

    async fetchAllTimePnL(): Promise<number> {
        if (config.EXCHANGE_NAME !== 'binance') return 0;

        try {
            const now = Date.now();
            const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

            // Función auxiliar para traer todo el historial paginado de un tipo en bloques de 7 días
            const fetchFullIncome = async (type: string) => {
                let allIncome: any[] = [];
                let currentStart = ninetyDaysAgo;
                const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

                while (currentStart < now) {
                    let currentEnd = Math.min(currentStart + sevenDaysMs, now);
                    let hasMoreInWindow = true;

                    while (hasMoreInWindow) {
                        const batch: any[] = await this.exchange.fapiPrivateGetIncome({
                            incomeType: type,
                            startTime: currentStart,
                            endTime: currentEnd,
                            limit: 1000
                        });

                        if (batch && batch.length > 0) {
                            allIncome = allIncome.concat(batch);
                            // Avanzar el inicio al siguiente ms del último registro para paginar dentro de la ventana
                            const lastTime = parseInt(batch[batch.length - 1].time);
                            if (isNaN(lastTime)) {
                                hasMoreInWindow = false;
                            } else {
                                currentStart = lastTime + 1;
                                if (batch.length < 1000) hasMoreInWindow = false;
                            }
                        } else {
                            hasMoreInWindow = false;
                        }

                        // Pequeño respiro para el event loop y evitar rate limits
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    // Asegurar que avanzamos la ventana aunque no hubiera registros en ella
                    currentStart = currentEnd + 1;
                }
                return allIncome;
            };

            const realized = await fetchFullIncome('REALIZED_PNL');
            const commissions = await fetchFullIncome('COMMISSION');
            const funding = await fetchFullIncome('FUNDING_FEE');

            const totalRealized = realized.reduce((acc, item) => acc + parseFloat(item.income), 0);
            const totalCommissions = commissions.reduce((acc, item) => acc + parseFloat(item.income), 0);
            const totalFunding = funding.reduce((acc, item) => acc + parseFloat(item.income), 0);

            const netTotal = totalRealized + totalCommissions + totalFunding;

            logger.info({
                records: realized.length + commissions.length + funding.length,
                netTotal
            }, '📊 PnL Histórico (últimos 90 días) recalculado con éxito');

            return netTotal;
        } catch (error: any) {
            logger.warn({ err: error.message }, 'Failed to fetch all-time PnL from Binance');
            return 0;
        }
    }

    /**
     * Obtiene el historial detallado de ingresos (PnL, Comisiones, Funding) de Binance
     */
    async getIncomeHistory(days: number = 7): Promise<any[]> {
        if (config.EXCHANGE_NAME !== 'binance') return [];

        try {
            const now = Date.now();
            const startTime = now - (days * 24 * 60 * 60 * 1000);

            const fetchType = async (type: string) => {
                const results = await this.exchange.fapiPrivateGetIncome({
                    incomeType: type,
                    startTime: startTime,
                    endTime: now,
                    limit: 1000
                });
                return results || [];
            };

            const [realized, commissions, funding] = await Promise.all([
                fetchType('REALIZED_PNL'),
                fetchType('COMMISSION'),
                fetchType('FUNDING_FEE')
            ]);

            // Combinar y formatear
            const all = [
                ...realized.map((i: any) => ({ ...i, type: 'PnL Realizado' })),
                ...commissions.map((i: any) => ({ ...i, type: 'Comisión' })),
                ...funding.map((i: any) => ({ ...i, type: 'Funding Fee' }))
            ];

            // Ordenar por tiempo descendente
            return all.sort((a, b) => parseInt(b.time) - parseInt(a.time));
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch income history from Binance');
            return [];
        }
    }

    /**
     * Obtiene el PnL No Realizado (Floating) total de la cuenta
     */
    async getUnrealizedPnL(): Promise<number> {
        try {
            if (config.EXCHANGE_NAME === 'binance') {
                const account = await this.exchange.fapiPrivateGetAccount();
                return parseFloat(account.totalUnrealizedProfit || '0');
            }

            const balance = await this.exchange.fetchBalance();
            return parseFloat(balance.info?.totalUnrealizedProfit || '0');
        } catch (error: any) {
            logger.debug({ error: error.message }, 'No se pudo obtener PnL no realizado de la cuenta');
            return 0;
        }
    }
}

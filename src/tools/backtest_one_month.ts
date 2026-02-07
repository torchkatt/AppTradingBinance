
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy.js';
// import { config } from '../config/index.js';
import { OHLCV } from '../types/index.js';
import { tradeLogger, riskLogger, logger } from '../utils/logger.js';

// --- MOCK LOGGERS TO SILENCE OUTPUT ---
const noop = () => { };
logger.info = noop;
logger.warn = noop;
logger.error = noop;
logger.debug = noop;
tradeLogger.info = noop;
tradeLogger.warn = noop;
tradeLogger.error = noop;
tradeLogger.debug = noop;
riskLogger.info = noop;
riskLogger.warn = noop;
// --------------------------------------

const BACKTEST_CONFIG = {
    INITIAL_CAPITAL: 1000,
    TP_ROI: 0.08,    // 8%
    SL_ROI: 0.025,   // 2.5%
    LEVERAGE: 10,
    RISK_PER_TRADE: 0.03, // 3%
    MAX_POSITIONS: 2,
    CORRELATION_GROUPS: {
        'BTC': 'A', 'ETH': 'A', 'SOL': 'A', 'BNB': 'A',
        'DOGE': 'B', 'SHIB': 'B', 'PEPE': 'B'
    } as Record<string, string>
};

interface BacktestPosition {
    symbol: string;
    entryPrice: number;
    sizeUsd: number;
    side: 'long' | 'short';
    tpPrice: number;
    slPrice: number;
    entryTime: number;
    group: string;
}

async function runBacktest() {
    console.log('⏳ --- CARGANDO DATA DE 30 DÍAS... ---');

    const exchange = new ExchangeConnector();
    const strategy = new MeanReversionStrategy();

    // Portfolio representativo
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'DOGE/USDT', 'BNB/USDT'];
    const marketData: Record<string, OHLCV[]> = {};

    // 1. Fetch Data
    for (const symbol of symbols) {
        // 30 days * 24h = 720 candles. Fetch 800 to be safe.
        // Binance limit is 1000.
        try {
            const data = await exchange.fetchOHLCV(symbol, '1h', undefined, 800);
            marketData[symbol] = data;
            console.log(`✅ ${symbol}: ${data.length} velas cargadas.`);
        } catch (e) {
            console.error(`❌ Error cargando ${symbol}`);
        }
    }

    // 2. Align Timestamps (Find common start/end)
    // Simple approach: Use the timestamps of the first symbol as master clock
    const masterTimeline = marketData['BTC/USDT'].map(d => d.timestamp);

    let capital = BACKTEST_CONFIG.INITIAL_CAPITAL;
    let maxDrawdown = 0;
    let peakCapital = capital;

    const openPositions: BacktestPosition[] = [];
    const history: any[] = [];

    console.log('\n🚀 --- INICIANDO SIMULACIÓN SINCRONIZADA ---');
    console.log(`Capital Inicial: $${capital}`);

    // Loop through time
    // Start at candle 50 to have history for indicators
    for (let t = 50; t < masterTimeline.length; t++) {
        const currentTime = masterTimeline[t];

        // A. Manage Open Positions (Check Exit conditions on current Candle)
        for (let i = openPositions.length - 1; i >= 0; i--) {
            const pos = openPositions[i];
            const candle = marketData[pos.symbol]?.find(d => d.timestamp === currentTime);

            if (!candle) continue; // No data for this symbol at this time? skip

            let exitPnl = 0;
            let closed = false;
            let reason = '';

            if (pos.side === 'long') {
                if (candle.low <= pos.slPrice) {
                    // SL Hit
                    exitPnl = -(pos.sizeUsd * (BACKTEST_CONFIG.SL_ROI / BACKTEST_CONFIG.LEVERAGE)); // Loss is SL% of size
                    // Actually calculation: Size * (Exit - Entry) / Entry
                    // Using fixed ROI for simplicity to match config logic exactly
                    // Loss = Size * 0.0025 roughly
                    closed = true; reason = 'SL 🛑';
                } else if (candle.high >= pos.tpPrice) {
                    // TP Hit
                    exitPnl = (pos.sizeUsd * (BACKTEST_CONFIG.TP_ROI / BACKTEST_CONFIG.LEVERAGE));
                    closed = true; reason = 'TP 🎯';
                }
            } else {
                if (candle.high >= pos.slPrice) {
                    exitPnl = -(pos.sizeUsd * (BACKTEST_CONFIG.SL_ROI / BACKTEST_CONFIG.LEVERAGE));
                    closed = true; reason = 'SL 🛑';
                } else if (candle.low <= pos.tpPrice) {
                    exitPnl = (pos.sizeUsd * (BACKTEST_CONFIG.TP_ROI / BACKTEST_CONFIG.LEVERAGE));
                    closed = true; reason = 'TP 🎯';
                }
            }

            if (closed) {
                capital += exitPnl;
                openPositions.splice(i, 1);
                history.push({
                    symbol: pos.symbol,
                    res: exitPnl > 0 ? 'WIN' : 'LOSS',
                    pnl: exitPnl,
                    cap: capital,
                    reason
                });

                // Track Drawdown
                if (capital > peakCapital) peakCapital = capital;
                const dd = (peakCapital - capital) / peakCapital;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }
        }

        // B. Check New Entries (Only if slots available)
        if (openPositions.length < BACKTEST_CONFIG.MAX_POSITIONS) {

            // Shuffle symbols to avoid bias? No, let's iterate.
            for (const symbol of symbols) {
                if (openPositions.length >= BACKTEST_CONFIG.MAX_POSITIONS) break;
                if (openPositions.find(p => p.symbol === symbol)) continue; // Already open

                const data = marketData[symbol];
                // Get slice up to current time t
                // We need the index of current time in this symbol's data
                // Assuming aligned 1h candles, index 't' should match if start is same. 
                // Using 't' directly for simplicity as we grabbed 800 for all.
                if (!data || !data[t]) continue;

                const currentData = data.slice(0, t + 1);

                // Check Correlation
                const base = symbol.split('/')[0];
                const group = BACKTEST_CONFIG.CORRELATION_GROUPS[base] || 'C';
                if (group !== 'C' && openPositions.some(p => p.group === group)) {
                    continue; // Correlation Blocked
                }

                // ANALYZE
                const signal = await strategy.analyze(currentData);

                if (signal) {
                    const price = currentData[t].close;
                    // Position Sizing: Risk 3%
                    const riskAmount = capital * BACKTEST_CONFIG.RISK_PER_TRADE;
                    const stopLossDistPct = (BACKTEST_CONFIG.SL_ROI / BACKTEST_CONFIG.LEVERAGE);
                    let sizeUsd = riskAmount / stopLossDistPct;

                    // Cap max size per trade to 50% of buying power (approx) to be realistic
                    const maxTradeSize = capital * 5;
                    if (sizeUsd > maxTradeSize) sizeUsd = maxTradeSize;

                    const tpDist = price * (BACKTEST_CONFIG.TP_ROI / BACKTEST_CONFIG.LEVERAGE);
                    const slDist = price * (BACKTEST_CONFIG.SL_ROI / BACKTEST_CONFIG.LEVERAGE);

                    const tpPrice = signal.type === 'long' ? price + tpDist : price - tpDist;
                    const slPrice = signal.type === 'long' ? price - slDist : price + slDist;

                    openPositions.push({
                        symbol,
                        entryPrice: price,
                        sizeUsd,
                        side: signal.type as 'long' | 'short',
                        tpPrice,
                        slPrice,
                        entryTime: currentTime,
                        group
                    });

                    // console.log(`➡️ OPEN ${symbol} ${signal.type.toUpperCase()} @ ${price}`);
                }
            }
        }
    }

    // Report
    console.log('\n🏁 --- RESULTADOS MENSUALES (30 DÍAS) ---');
    console.log(`Capital Final: $${capital.toFixed(2)}`);
    const profit = capital - BACKTEST_CONFIG.INITIAL_CAPITAL;
    const profitPct = (profit / BACKTEST_CONFIG.INITIAL_CAPITAL) * 100;

    console.log(`Retorno Neto: ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%`);
    console.log(`Max Drawdown: -${(maxDrawdown * 100).toFixed(2)}%`);

    const wins = history.filter(h => h.res === 'WIN').length;
    const loss = history.filter(h => h.res === 'LOSS').length;
    const total = wins + loss;

    console.log(`Trades Totales: ${total}`);
    console.log(`Win Rate: ${((wins / total) * 100).toFixed(1)}%`);
    console.log(`Ratio Promedio: ${(profitPct > 0 ? 'POSITIVO' : 'NEGATIVO')}`);

    console.log('\n📜 Últimos 5 Trades:');
    history.slice(-5).forEach(h => {
        console.log(`${h.res === 'WIN' ? '✅' : '❌'} ${h.symbol}: ${h.pnl > 0 ? '+' : ''}$${h.pnl.toFixed(2)} (${h.reason}) -> Cap: $${h.cap.toFixed(0)}`);
    });
}

runBacktest();

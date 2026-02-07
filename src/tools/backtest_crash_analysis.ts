
import { ExchangeConnector } from '../core/ExchangeConnector.js';
import { TrendMomentumStrategy } from '../strategies/TrendMomentumStrategy.js';
import { tradeLogger as logger, apiLogger, riskLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

// MOCK LOGGERS TO SILENCE OUTPUT (We only want the final report)
logger.info = () => { };
logger.warn = () => { };
logger.error = () => { };
logger.debug = () => { };
apiLogger.info = () => { };
riskLogger.info = () => { };

// Configuration
const SYMBOLS = config.SYMBOLS;
const TIMEFRAME = config.TIMEFRAME;
const HOURS_TO_ANALYZE = 24;
const INITIAL_CAPITAL = 100;

async function runCrashAnalysis() {
    console.log(`\n🔍 --- ANÁLISIS POST-MORTEM (${HOURS_TO_ANALYZE}H) ---`);
    console.log(`Estrategia: Trend Momentum (Semi-Agresiva)`);
    console.log(`Simulando crash de mercado...\n`);

    const exchange = new ExchangeConnector();
    const strategy = new TrendMomentumStrategy(20, 200, 1.2, true); // Semi-Aggressive

    let totalPnL = 0;
    let winCount = 0;
    let lossCount = 0;
    const tradeLog: any[] = [];

    // Fetch deep history (enough for EMA200 + 24h of 5m candles = ~300 + 288 = 600 candles)
    // 24h * 60m / 5m = 288 candles.
    // Need buffer for EMA: 200.
    // Total fetch: 500.

    for (const symbol of SYMBOLS) {
        try {
            process.stdout.write(`Analizando ${symbol}... `);
            const ohlcv = await exchange.fetchOHLCV(symbol, TIMEFRAME, undefined, 600);

            // We need to simulate candle by candle for the last 288 periods
            const analysisStartIdx = ohlcv.length - 288;

            let activePosition: any = null;

            for (let i = analysisStartIdx; i < ohlcv.length; i++) {
                // Slice data up to current point i
                const currentData = ohlcv.slice(0, i + 1);
                const currentCandle = currentData[currentData.length - 1];
                // const prevCandle = currentData[currentData.length - 2];

                // If in position, check for exit
                if (activePosition) {
                    let exitPrice = null;
                    // let pnl = 0;
                    let reason = '';

                    // Check TP/SL
                    if (activePosition.type === 'long') {
                        if (currentCandle.low <= activePosition.stopLoss) {
                            exitPrice = activePosition.stopLoss;
                            reason = 'Stop Loss';
                        } else if (currentCandle.high >= activePosition.takeProfit) {
                            exitPrice = activePosition.takeProfit;
                            reason = 'Take Profit';
                        }
                    } else { // Short
                        if (currentCandle.high >= activePosition.stopLoss) {
                            exitPrice = activePosition.stopLoss;
                            reason = 'Stop Loss';
                        } else if (currentCandle.low <= activePosition.takeProfit) {
                            exitPrice = activePosition.takeProfit;
                            reason = 'Take Profit';
                        }
                    }

                    if (exitPrice) {
                        // Calculate PnL (Simplified 10x leverage)
                        const leverage = 10;
                        const entryPrice = activePosition.entryPrice;
                        const priceDiffPct = activePosition.type === 'long'
                            ? (exitPrice - entryPrice) / entryPrice
                            : (entryPrice - exitPrice) / entryPrice; // Short PnL

                        const tradePnL = activePosition.size * priceDiffPct * leverage;

                        totalPnL += tradePnL;
                        if (tradePnL > 0) winCount++; else lossCount++;

                        tradeLog.push({
                            symbol,
                            type: activePosition.type,
                            entry: entryPrice,
                            exit: exitPrice,
                            pnl: tradePnL.toFixed(2),
                            reason,
                            time: new Date(currentCandle.timestamp).toLocaleTimeString()
                        });

                        activePosition = null; // Close
                    }
                }

                // If no position, check for entry
                if (!activePosition) {
                    const signal = await strategy.analyze(currentData);
                    if (signal) {
                        // Simulate Entry
                        activePosition = {
                            type: signal.type,
                            entryPrice: currentCandle.close,
                            stopLoss: signal.stopLoss,
                            takeProfit: signal.takeProfit,
                            size: 10, // 10 USDT Margin per trade (10% of 100)
                            startTime: currentCandle.timestamp
                        };
                    }
                }
            }
            console.log(`✅`);
        } catch (err) {
            console.log(`❌ Error: ${err}`);
        }
    }

    console.log(`\n📊 --- RESULTADOS DE SIMULACIÓN (24H) ---`);
    console.log(`Capital Inicial Simulado: $${INITIAL_CAPITAL}`);
    console.log(`Trades Totales: ${winCount + lossCount}`);
    console.log(`Ganados: ${winCount} | Perdidos: ${lossCount} | Winrate: ${((winCount / (winCount + lossCount)) * 100 || 0).toFixed(1)}%`);
    console.log(`PnL Total Estimado: $${totalPnL.toFixed(2)} USDT`);
    console.log(`Balance Final Estimado: $${(INITIAL_CAPITAL + totalPnL).toFixed(2)}`);

    if (tradeLog.length > 0) {
        console.log('\n📝 Detalle de Operaciones:');
        console.table(tradeLog);
    } else {
        console.log('\n💤 Sin operaciones generadas (El filtro de tendencia evitó pérdidas/ganancias).');
    }
}

runCrashAnalysis();

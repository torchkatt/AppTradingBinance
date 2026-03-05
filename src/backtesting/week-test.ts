/**
 * Backtest 3 Meses - Multi-Strategy System v4.0
 *
 * Descarga datos reales de Binance Futures (API pública, sin credenciales)
 * Corre el backtest completo del sistema de estrategias con orquestador:
 *   - TrendMomentumStrategy v3.0 (MTF + sesión + ADX 28)
 *   - MeanReversionStrategy v2.2 (BB 2.0σ + RSI 30/70 + sesgo macro EMA200)
 *   - BreakoutStrategy v1.2 (ruptura consolidación + sesgo macro EMA200 + vol 2.0x)
 *   - ScalpingStrategy v1.0 (DESACTIVADA — STRATEGY_SCALPING_ENABLED=false)
 *
 * Resultados v4.0 (90 días, BTC bajista $100k→$65k):
 *   PnL: +$113.22 (+1.13%) | WR: ~40% | Max DD: ~1.2%
 *   Breakout: 66 trades/47%/+$80 | Trend: 12 trades/33%/+$56 | MR: 17 trades/29%/-$23
 *
 * NOTA: Filtros de sesión usan hora de la vela (no hora actual) — correcto en backtest.
 *
 * Uso: npx tsx src/backtesting/week-test.ts
 */

import ccxt from 'ccxt';
import { BacktestEngine } from './BacktestEngine.js';
import { MultiStrategyOrchestrator } from '../strategies/MultiStrategyOrchestrator.js';
import { OHLCV, Trade } from '../types/index.js';

// ── Parámetros ────────────────────────────────────────────────────────────────
const SYMBOL      = 'BTC/USDT';
const TIMEFRAME   = '5m';
const INITIAL_CAP = 10_000;
const LEVERAGE    = 3;
const FEE_PCT     = 0.0005; // 0.05% taker fee Binance (por lado)
const DAYS        = 90;     // Período de prueba
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOHLCV(startMs: number, endMs: number): Promise<OHLCV[]> {
    const exchange = new (ccxt as any).binanceusdm({ enableRateLimit: true });
    await exchange.loadMarkets();

    const futuresSymbol = exchange.markets['BTC/USDT:USDT'] ? 'BTC/USDT:USDT' : SYMBOL;
    const all: OHLCV[] = [];
    let since = startMs;

    process.stdout.write('  Descargando datos');

    while (since < endMs) {
        const raw: any[][] = await exchange.fetchOHLCV(futuresSymbol, TIMEFRAME, since, 1000);
        if (!raw || raw.length === 0) break;

        for (const c of raw) {
            all.push({
                timestamp: c[0], open: c[1], high: c[2], low: c[3],
                close: c[4], volume: c[5],
            });
        }

        since = (raw[raw.length - 1][0] as number) + 1;
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 250));
    }

    process.stdout.write('\n');
    return all.filter(c => c.timestamp >= startMs && c.timestamp <= endMs);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) => n.toFixed(d);
const pnlStr = (n: number) => n >= 0 ? `+$${fmt(n)}` : `-$${fmt(Math.abs(n))}`;
const pctStr = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}%`;
const dateStr = (ts: number) =>
    new Date(ts).toLocaleString('es-CO', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function applyFees(trades: Trade[]): { pnl: number; wins: number; losses: number } {
    let pnl = 0; let wins = 0; let losses = 0;
    for (const t of trades) {
        const notional = t.entryPrice * t.quantity;
        const net = (t.pnl ?? 0) - notional * FEE_PCT * 2;
        pnl += net;
        if (net > 0) wins++; else losses++;
    }
    return { pnl, wins, losses };
}

function weeklyBreakdown(trades: Trade[], testStart: number): void {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    let weekStart = testStart;
    let weekNum = 1;

    console.log('\n  Semana | Trades | Win% | PnL neto  | Retorno | BTC range');
    console.log('  -------+--------+------+-----------+---------+----------');

    while (weekStart < Date.now()) {
        const weekEnd  = weekStart + weekMs;
        const wTrades  = trades.filter(t => t.entryTime >= weekStart && t.entryTime < weekEnd);
        const wLabel   = `${new Date(weekStart).toLocaleDateString('es-CO', { month:'short', day:'2-digit' })}`;

        if (wTrades.length > 0) {
            const { pnl, wins } = applyFees(wTrades);
            const wr = (wins / wTrades.length * 100).toFixed(0);
            const ret = (pnl / INITIAL_CAP * 100);
            const icon = pnl >= 0 ? '✅' : '❌';
            console.log(
                `  ${icon} S${String(weekNum).padStart(2,'0')} ${wLabel} | ` +
                `${String(wTrades.length).padStart(6)} | ` +
                `${String(wr+'%').padStart(4)} | ` +
                `${pnlStr(pnl).padStart(9)} | ` +
                `${pctStr(ret).padStart(7)}`
            );
        } else {
            console.log(`  ⬜ S${String(weekNum).padStart(2,'0')} ${wLabel} | sin trades (condiciones no cumplidas)`);
        }

        weekStart = weekEnd;
        weekNum++;
    }
}

function printTopTrades(trades: Trade[], label: string, n = 5): void {
    const sorted = [...trades].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
    const topN   = sorted.slice(0, n);
    const botN   = sorted.slice(-n).reverse();

    console.log(`\n  ${label}`);
    console.log('  ' + '─'.repeat(90));

    [...topN, null, ...botN].forEach((t) => {
        if (t === null) { console.log('  ── Peores ──'); return; }
        const notional = t.entryPrice * t.quantity;
        const net = (t.pnl ?? 0) - notional * FEE_PCT * 2;
        const dur = t.exitTime ? Math.round((t.exitTime - t.entryTime) / 60000) + 'min' : '---';
        const icon = net >= 0 ? '✅' : '❌';
        console.log(
            `  ${icon} ${t.side.toUpperCase().padEnd(5)} ` +
            `${dateStr(t.entryTime)} @$${fmt(t.entryPrice,0)} → ` +
            `${t.exitTime ? dateStr(t.exitTime) : '(abierto)'} @$${fmt(t.exitPrice ?? t.entryPrice,0)} ` +
            `[${dur.padStart(7)}] ${pnlStr(net).padStart(10)}`
        );
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const now       = Date.now();
    const testStart = now - DAYS * 24 * 60 * 60 * 1000;
    // Warmup: 210 barras de 5min extra para que EMA200 esté caliente
    const warmStart = testStart - 210 * 5 * 60 * 1000;

    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║      BACKTEST 3 MESES — Multi-Strategy System v4.0 | 5m        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    console.log(`  Símbolo   : ${SYMBOL} (Binance USDM Futures)`);
    console.log(`  Timeframe : ${TIMEFRAME} | Capital: $${INITIAL_CAP.toLocaleString()} | Leverage: ${LEVERAGE}x`);
    console.log(`  Período   : ${new Date(testStart).toLocaleDateString('es-CO')} → ${new Date(now).toLocaleDateString('es-CO')}`);
    console.log(`  Fee       : ${(FEE_PCT * 100).toFixed(3)}% por lado`);
    console.log('\n  Estrategias activas:');
    console.log('    • TrendMomentum v3.0  → Tendencia fuerte (ADX≥28, MTF, sesión)');
    console.log('    • MeanReversion v2.2  → Mercado lateral (ADX<25, BB 2.0σ, RSI 30/70, sesgo EMA200)');
    console.log('    • Breakout v1.2       → Ruptura consolidación (ADX 15-28, vol 2.0x, sesgo EMA200)');
    console.log('    • Scalping v1.0       → DESACTIVADA (STRATEGY_SCALPING_ENABLED=false)\n');

    // 1. Descargar datos
    const allData = await fetchOHLCV(warmStart, now);
    if (allData.length < 220) {
        console.error('  ❌ Datos insuficientes. Verifica la conexión.');
        process.exit(1);
    }
    console.log(`\n  Total velas: ${allData.length} (${allData.filter(c => c.timestamp >= testStart).length} en período de prueba)`);

    // 2. Correr backtest
    console.log('  Ejecutando backtest...\n');
    const strategy = new MultiStrategyOrchestrator();
    const engine   = new BacktestEngine(INITIAL_CAP);
    const result   = await engine.run(strategy, allData);

    // 3. Filtrar trades del período real de prueba
    const trades   = result.trades.filter(t => t.entryTime >= testStart);
    const { pnl: realPnL, wins: realWins, losses: realLosses } = applyFees(trades);

    const totalTrades  = trades.length;
    const winRate      = totalTrades > 0 ? (realWins / totalTrades) * 100 : 0;
    const returnPct    = (realPnL / INITIAL_CAP) * 100;
    const finalCapital = INITIAL_CAP + realPnL;

    // Avg Win / Avg Loss con fees
    const winTrades  = trades.filter(t => {
        const notional = t.entryPrice * t.quantity;
        return (t.pnl ?? 0) - notional * FEE_PCT * 2 > 0;
    });
    const lossTrades = trades.filter(t => {
        const notional = t.entryPrice * t.quantity;
        return (t.pnl ?? 0) - notional * FEE_PCT * 2 <= 0;
    });

    const avgWin  = winTrades.length > 0
        ? winTrades.reduce((s, t) => s + ((t.pnl ?? 0) - t.entryPrice * t.quantity * FEE_PCT * 2), 0) / winTrades.length
        : 0;
    const avgLoss = lossTrades.length > 0
        ? Math.abs(lossTrades.reduce((s, t) => s + ((t.pnl ?? 0) - t.entryPrice * t.quantity * FEE_PCT * 2), 0) / lossTrades.length)
        : 0;
    const realRR  = avgLoss > 0 ? avgWin / avgLoss : 0;

    // 4. Resumen General
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                      RESULTADOS GLOBALES                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    console.log(`  Capital inicial   : $${INITIAL_CAP.toLocaleString()}`);
    console.log(`  Capital final     : $${fmt(finalCapital)}`);
    console.log(`  PnL neto (c/fees) : ${pnlStr(realPnL)}`);
    console.log(`  Retorno 90 días   : ${pctStr(returnPct)}`);
    console.log(`  Retorno mensual ~ : ${pctStr(returnPct / 3)}`);
    console.log('');
    console.log(`  Total trades      : ${totalTrades}`);
    console.log(`  Ganadores         : ${realWins}   Perdedores: ${realLosses}`);
    console.log(`  Win Rate          : ${fmt(winRate)}%`);
    console.log(`  Avg Win           : ${pnlStr(avgWin)}`);
    console.log(`  Avg Loss          : -$${fmt(avgLoss)}`);
    console.log(`  R:R real          : 1:${fmt(realRR)}`);
    console.log(`  Profit Factor     : ${fmt(result.profitFactor)}`);
    console.log(`  Sharpe Ratio      : ${fmt(result.sharpeRatio)}`);
    console.log(`  Max Drawdown      : ${fmt(result.maxDrawdownPercent)}%`);

    // 5. Desglose semanal
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                     DESGLOSE SEMANAL                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    weeklyBreakdown(trades, testStart);

    // 6. Desglose por estrategia
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                  DESGLOSE POR ESTRATEGIA                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    const strategyMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
    for (const t of trades) {
        const stratName: string =
            (t.metadata?.orchestrator?.activeStrategy as string) ||
            (t.metadata?.strategy as string) ||
            'Desconocida';
        const key = stratName.split(' ')[0]; // Solo el nombre corto
        if (!strategyMap[key]) strategyMap[key] = { wins: 0, losses: 0, pnl: 0 };
        const notional = t.entryPrice * t.quantity;
        const net = (t.pnl ?? 0) - notional * FEE_PCT * 2;
        strategyMap[key].pnl += net;
        if (net > 0) strategyMap[key].wins++; else strategyMap[key].losses++;
    }

    console.log('  Estrategia         | Trades | Win% | PnL neto');
    console.log('  -------------------+--------+------+-----------');
    for (const [name, stats] of Object.entries(strategyMap)) {
        const total = stats.wins + stats.losses;
        const wr    = total > 0 ? (stats.wins / total * 100).toFixed(0) : '0';
        const icon  = stats.pnl >= 0 ? '✅' : '❌';
        console.log(
            `  ${icon} ${name.padEnd(17)} | ${String(total).padStart(6)} | ${String(wr + '%').padStart(4)} | ${pnlStr(stats.pnl).padStart(9)}`
        );
    }

    // 7. Mejores / Peores trades
    if (trades.length >= 2) {
        console.log('\n╔══════════════════════════════════════════════════════════════════╗');
        console.log('║                   MEJORES Y PEORES TRADES                       ║');
        console.log('╚══════════════════════════════════════════════════════════════════╝');
        printTopTrades(trades, '── Mejores ──', Math.min(5, Math.ceil(trades.length / 2)));
    }

    // 7. Diagnóstico
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                       DIAGNÓSTICO                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    const checks = [
        { label: 'Retorno positivo',       pass: realPnL > 0,                    val: pctStr(returnPct) },
        { label: 'Win Rate > 45%',         pass: winRate >= 45,                   val: fmt(winRate) + '%' },
        { label: 'Profit Factor > 1.2',    pass: result.profitFactor >= 1.2,     val: fmt(result.profitFactor) },
        { label: 'Max Drawdown < 5%',      pass: result.maxDrawdownPercent < 5,  val: fmt(result.maxDrawdownPercent) + '%' },
        { label: 'R:R real > 1.5',         pass: realRR >= 1.5,                  val: '1:' + fmt(realRR) },
        { label: 'Sharpe > 0.5',           pass: result.sharpeRatio > 0.5,       val: fmt(result.sharpeRatio) },
    ];

    checks.forEach(c => {
        console.log(`  ${c.pass ? '✅' : '❌'}  ${c.label.padEnd(25)} ${c.val}`);
    });

    const passed = checks.filter(c => c.pass).length;
    console.log(`\n  Checks aprobados: ${passed}/${checks.length}`);

    if (passed === checks.length) {
        console.log('\n  🎉 Todos los checks pasaron. La estrategia es viable para paper trading.');
    } else if (realPnL > 0 && passed >= 3) {
        console.log('\n  ⚠️  Retorno positivo pero hay margen de mejora. Recomendado: paper trading 2 semanas.');
    } else if (totalTrades < 5) {
        console.log('\n  📊 Muy pocos trades. El sistema es selectivo por diseño (ADX + régimen).');
        console.log('     Menos trades pero mayor calidad — el orquestador evita mercados desfavorables.');
    } else {
        console.log('\n  🔴 Resultados negativos. Considerar ajustar parámetros o cambiar el timeframe.');
    }

    console.log('\n  Nota: Backtest no incluye slippage (deslizamiento de precio). En vivo podría');
    console.log('  diferir ±0.1-0.3% por trade dependiendo de la liquidez del mercado.\n');
    console.log('═'.repeat(70) + '\n');

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Script para ver historial de trades y estadísticas
 */
import { TradeHistoryLogger } from './src/utils/TradeHistoryLogger.js';

const logger = new TradeHistoryLogger();

console.log('\n📊 HISTORIAL DE TRADING\n');
console.log('═'.repeat(80));

// Estadísticas generales
const summary = logger.getPerformanceSummary(30);
console.log('\n📈 RESUMEN (Últimos 30 días):');
console.log(`  Total trades: ${summary.totalTrades}`);
console.log(`  Win rate: ${summary.winRate.toFixed(1)}%`);
console.log(`  PnL total: $${summary.totalPnL.toFixed(2)}`);
console.log(`  PnL diario promedio: $${summary.averageDailyPnL.toFixed(2)}`);
console.log(`  Mejor día: $${summary.bestDay.toFixed(2)}`);
console.log(`  Peor día: $${summary.worstDay.toFixed(2)}`);

// Estadísticas diarias
const dailyStats = logger.loadDailyStats();
if (dailyStats.length > 0) {
    console.log('\n📅 ESTADÍSTICAS DIARIAS (últimos 7 días):');
    console.log('─'.repeat(80));

    dailyStats.slice(-7).forEach(stat => {
        const emoji = stat.netPnL > 0 ? '🟢' : '🔴';
        console.log(`\n${emoji} ${stat.date}:`);
        console.log(`  Trades: ${stat.totalTrades} | Wins: ${stat.wins} | Losses: ${stat.losses}`);
        console.log(`  Win Rate: ${stat.winRate.toFixed(1)}%`);
        console.log(`  PnL Bruto: $${stat.totalPnL.toFixed(2)}`);
        console.log(`  Comisiones: $${stat.totalCommissions.toFixed(2)}`);
        console.log(`  PnL Neto: $${stat.netPnL.toFixed(2)}`);
        console.log(`  Avg Win: $${stat.averageWin.toFixed(2)} | Avg Loss: $${stat.averageLoss.toFixed(2)}`);
    });
}

// Trades abiertos
const openTrades = logger.getOpenTrades();
if (openTrades.length > 0) {
    console.log('\n\n🔓 POSICIONES ABIERTAS:');
    console.log('─'.repeat(80));

    openTrades.forEach(trade => {
        console.log(`\n${trade.symbol} ${trade.side.toUpperCase()}`);
        console.log(`  Entrada: $${trade.entryPrice} @ ${trade.entryTime.split('T')[1].split('.')[0]}`);
        console.log(`  TP: $${trade.takeProfit.toFixed(2)} | SL: $${trade.stopLoss.toFixed(2)}`);
        console.log(`  RSI: ${trade.signal.rsi.toFixed(1)} | %B: ${trade.signal.percentB.toFixed(3)}`);
    });
}

// Últimos 10 trades cerrados
const allTrades = logger.loadTrades();
const closedTrades = allTrades.filter(t => t.status !== 'open').slice(-10);

if (closedTrades.length > 0) {
    console.log('\n\n📜 ÚLTIMOS 10 TRADES CERRADOS:');
    console.log('─'.repeat(80));

    closedTrades.forEach(trade => {
        const emoji = (trade.pnl || 0) > 0 ? '✅' : '❌';
        const status = trade.status === 'closed_tp' ? 'TP' : trade.status === 'closed_sl' ? 'SL' : 'MANUAL';

        console.log(`\n${emoji} ${trade.symbol} ${trade.side.toUpperCase()} [${status}]`);
        console.log(`  ${trade.entryPrice} → ${trade.exitPrice} (${trade.pnlPercent?.toFixed(2)}%)`);
        console.log(`  PnL: $${trade.pnl?.toFixed(2)} | Comisión: $${trade.commissions?.toFixed(2)}`);
        console.log(`  Duración: ${trade.entryTime.split('T')[1].split('.')[0]} → ${trade.exitTime?.split('T')[1].split('.')[0]}`);
    });
}

console.log('\n' + '═'.repeat(80) + '\n');

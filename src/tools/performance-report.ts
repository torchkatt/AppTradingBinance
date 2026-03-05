
import { db } from '../database/index.js';


async function generateReport() {
    try {
        await db.initialize();
        console.log('\n📊 REPORTE DE RENDIMIENTO (Últimos 5 días)\n');

        // 1. Daily Metrics
        const dailyMetrics = await db.pool.query('SELECT * FROM daily_metrics ORDER BY date DESC LIMIT 5');
        console.table(dailyMetrics.rows);

        console.log('\n📝 ÚLTIMOS 5 TRADES\n');
        // 2. Recent Trades
        const trades = await db.pool.query('SELECT * FROM trades ORDER BY entry_time DESC LIMIT 5');
        console.table(trades.rows);

        console.log('\n💰 ESTADO DE CAPITAL\n');
        // 3. Capital
        const capital = await db.pool.query('SELECT * FROM capital_snapshots ORDER BY timestamp DESC LIMIT 1');
        console.table(capital.rows);

    } catch (error) {
        console.error('Error generating report:', error);
    } finally {
        await db.close();
    }
}

generateReport();

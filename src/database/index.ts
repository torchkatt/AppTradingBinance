import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { Trade, DailyMetrics } from '../types/index.js';

const { Pool } = pg;

/**
 * Cliente de base de datos PostgreSQL
 * Maneja todas las operaciones de persistencia
 */
export class Database {
    private pool: InstanceType<typeof Pool>;

    constructor() {
        this.pool = new Pool({
            connectionString: config.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err: Error) => {
            logger.error({ error: err }, 'Unexpected database error');
        });
    }

    /**
     * Inicializa la base de datos y verifica conexión
     */
    async initialize(): Promise<void> {
        try {
            const client = await this.pool.connect();
            logger.info('✅ Database connection established');

            // Migración: Añadir columna commission si no existe
            await client.query('ALTER TABLE trades ADD COLUMN IF NOT EXISTS commission DECIMAL(20, 8);');

            client.release();
        } catch (error: any) {
            logger.warn({ error: error.message }, '⚠️ Could not connect to database. System will continue in OPTIONAL DATABASE mode (Results will only be shown in logs/Telegram)');
            // No lanzamos el error para permitir que el sistema continúe
        }
    }

    /**
     * Guarda un trade completado en la base de datos
     */
    async saveTrade(trade: Trade): Promise<number> {
        const query = `
      INSERT INTO trades (
        symbol, side, entry_price, exit_price, quantity,
        entry_time, exit_time, pnl, pnl_percent, strategy, metadata, commission
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

        const values = [
            trade.symbol,
            trade.side,
            trade.entryPrice,
            trade.exitPrice,
            trade.quantity,
            new Date(trade.entryTime),
            trade.exitTime ? new Date(trade.exitTime) : null,
            trade.pnl,
            trade.pnlPercent,
            trade.strategy,
            JSON.stringify(trade.metadata),
            trade.commission || 0,
        ];

        try {
            const result = await this.pool.query(query, values);
            const tradeId = result.rows[0].id;
            logger.debug({ tradeId }, 'Trade saved to database');
            return tradeId;
        } catch (error) {
            logger.error({ error, trade }, 'Failed to save trade');
            throw error;
        }
    }

    /**
     * Obtiene los últimos trades de la base de datos
     */
    async getRecentTrades(limit: number = 100): Promise<Trade[]> {
        const query = `
      SELECT id, symbol, side, entry_price as "entryPrice", exit_price as "exitPrice", 
             quantity, entry_time as "entryTime", exit_time as "exitTime", 
             pnl, pnl_percent as "pnlPercent", strategy, metadata, commission
      FROM trades 
      ORDER BY exit_time DESC NULLS LAST, entry_time DESC
      LIMIT $1
    `;

        try {
            const result = await this.pool.query(query, [limit]);
            return result.rows.map(row => ({
                ...row,
                entryPrice: parseFloat(row.entryPrice),
                exitPrice: row.exitPrice ? parseFloat(row.exitPrice) : null,
                quantity: parseFloat(row.quantity),
                pnl: row.pnl ? parseFloat(row.pnl) : null,
                pnlPercent: row.pnlPercent ? parseFloat(row.pnlPercent) : null,
                commission: row.commission ? parseFloat(row.commission) : 0,
                metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
            }));
        } catch (error) {
            logger.error({ error }, 'Failed to get recent trades');
            return [];
        }
    }

    /**
     * Obtiene métricas del día actual
     */
    async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
        const query = `
      SELECT * FROM daily_metrics WHERE date = $1
    `;

        try {
            const result = await this.pool.query(query, [date]);
            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            return {
                date: row.date,
                totalTrades: row.total_trades,
                winningTrades: row.winning_trades,
                losingTrades: row.losing_trades,
                totalPnl: parseFloat(row.total_pnl),
                winRate: parseFloat(row.win_rate),
                sharpeRatio: row.sharpe_ratio ? parseFloat(row.sharpe_ratio) : undefined,
                maxDrawdown: row.max_drawdown ? parseFloat(row.max_drawdown) : undefined,
            };
        } catch (error) {
            logger.error({ error, date }, 'Failed to get daily metrics');
            return null;
        }
    }

    /**
     * Actualiza o crea métricas diarias
     */
    async upsertDailyMetrics(metrics: DailyMetrics): Promise<void> {
        const query = `
      INSERT INTO daily_metrics (
        date, total_trades, winning_trades, losing_trades,
        total_pnl, win_rate, sharpe_ratio, max_drawdown
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (date) DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        winning_trades = EXCLUDED.winning_trades,
        losing_trades = EXCLUDED.losing_trades,
        total_pnl = EXCLUDED.total_pnl,
        win_rate = EXCLUDED.win_rate,
        sharpe_ratio = EXCLUDED.sharpe_ratio,
        max_drawdown = EXCLUDED.max_drawdown,
        updated_at = NOW()
    `;

        const values = [
            metrics.date,
            metrics.totalTrades,
            metrics.winningTrades,
            metrics.losingTrades,
            metrics.totalPnl,
            metrics.winRate,
            metrics.sharpeRatio,
            metrics.maxDrawdown,
        ];

        try {
            await this.pool.query(query, values);
            logger.debug({ date: metrics.date }, 'Daily metrics updated');
        } catch (error) {
            logger.error({ error, metrics }, 'Failed to upsert daily metrics');
            throw error;
        }
    }

    /**
     * Registra evento del sistema (audit log)
     */
    async logEvent(
        eventType: string,
        severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
        message: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        const query = `
      INSERT INTO system_events (event_type, severity, message, metadata)
      VALUES ($1, $2, $3, $4)
    `;

        const values = [
            eventType,
            severity,
            message,
            metadata ? JSON.stringify(metadata) : null,
        ];

        try {
            await this.pool.query(query, values);
        } catch (error) {
            logger.error({ error }, 'Failed to log system event');
        }
    }

    /**
     * Cierra el pool de conexiones
     */
    async close(): Promise<void> {
        await this.pool.end();
        logger.info('Database connection pool closed');
    }
}

// Export singleton instance
export const db = new Database();

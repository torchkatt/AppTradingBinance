-- Tabla de trades ejecutados
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8) NOT NULL,
  entry_time TIMESTAMP NOT NULL DEFAULT NOW(),
  exit_time TIMESTAMP,
  pnl DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),
  strategy VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl);

-- Tabla de métricas diarias
CREATE TABLE IF NOT EXISTS daily_metrics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  total_pnl DECIMAL(20, 8) DEFAULT 0,
  pnl_percent DECIMAL(10, 4),
  win_rate DECIMAL(5, 4),
  sharpe_ratio DECIMAL(10, 4),
  max_drawdown DECIMAL(10, 4),
  largest_win DECIMAL(20, 8),
  largest_loss DECIMAL(20, 8),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);

-- Tabla de OHLCV para backtesting
CREATE TABLE IF NOT EXISTS market_data (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  timestamp BIGINT NOT NULL,
  open DECIMAL(20, 8) NOT NULL,
  high DECIMAL(20, 8) NOT NULL,
  low DECIMAL(20, 8) NOT NULL,
  close DECIMAL(20, 8) NOT NULL,
  volume DECIMAL(20, 8) NOT NULL,
  UNIQUE(symbol, timeframe, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_market_data_lookup ON market_data(symbol, timeframe, timestamp);

-- Tabla de configuración de estrategias
CREATE TABLE IF NOT EXISTS strategy_configs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  parameters JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  backtest_result JSONB,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Tabla de posiciones abiertas (estado del sistema)
CREATE TABLE IF NOT EXISTS open_positions (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  strategy VARCHAR(50),
  opened_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de eventos del sistema (audit log)
CREATE TABLE IF NOT EXISTS system_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at);

-- Vista para análisis rápido de performance
CREATE OR REPLACE VIEW performance_summary AS
SELECT
  DATE(entry_time) as trade_date,
  COUNT(*) as total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
  SUM(pnl) as total_pnl,
  AVG(CASE WHEN pnl > 0 THEN pnl ELSE NULL END) as avg_win,
  AVG(CASE WHEN pnl < 0 THEN pnl ELSE NULL END) as avg_loss,
  MAX(pnl) as largest_win,
  MIN(pnl) as largest_loss
FROM trades
WHERE exit_time IS NOT NULL
GROUP BY DATE(entry_time)
ORDER BY trade_date DESC;

-- Función para calcular win rate
CREATE OR REPLACE FUNCTION calculate_win_rate(start_date DATE, end_date DATE)
RETURNS DECIMAL(5,4) AS $$
DECLARE
  win_rate DECIMAL(5,4);
BEGIN
  SELECT 
    CASE 
      WHEN COUNT(*) > 0 THEN
        CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS DECIMAL) / COUNT(*)
      ELSE 0
    END INTO win_rate
  FROM trades
  WHERE DATE(entry_time) BETWEEN start_date AND end_date
    AND exit_time IS NOT NULL;
  
  RETURN COALESCE(win_rate, 0);
END;
$$ LANGUAGE plpgsql;

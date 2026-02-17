# Sistema de Trading Automatizado Profesional

Sistema de trading algorítmico con backtesting, gestión de riesgo profesional y ejecución automatizada.

## 🚀 Características

- ✅ **Backtesting completo** con métricas institucionales (Sharpe, Drawdown, Profit Factor)
- ✅ **Gestión de riesgo multinivel** con circuit breakers automáticos
- ✅ **Múltiples estrategias** (Mean Reversion, Trend Following, Volatility Breakout)
- ✅ **Logging estructurado** con Pino para debugging profesional
- ✅ **Alertas vía Telegram** para cada trade y reportes diarios
- ✅ **Type-safe** con TypeScript y validación Zod
- ✅ **Soporte multi-exchange** vía CCXT (Binance, Bybit, Kraken, etc.)

## 📋 Pre-requisitos

- Node.js >= 18.x
- PostgreSQL >= 14.x
- Redis >= 6.x (opcional, para cache)
- Cuenta en exchange (Binance/Bybit recomendado)

## 🛠️ Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Crear base de datos
createdb trading_system

# 4. Ejecutar migraciones
npm run db:migrate
```

## ⚙️ Configuración

Edita el archivo `.env` con tus parámetros:

```env
# Exchange (IMPORTANTE: Empieza con testnet=true)
EXCHANGE_NAME=binance
EXCHANGE_TESTNET=true
EXCHANGE_API_KEY=tu_api_key
EXCHANGE_API_SECRET=tu_api_secret

# Gestión de Riesgo
RISK_PER_TRADE_PCT=0.01        # 1% por trade
MAX_DAILY_LOSS_PCT=0.03        # 3% pérdida diaria máxima
MAX_POSITION_SIZE_PCT=0.1      # 10% máximo en una posición

# Trading
SYMBOLS=BTC/USDT,ETH/USDT
TIMEFRAME=5m
```

## 🧪 Backtesting (PASO OBLIGATORIO)

**NO operes con dinero real sin antes hacer backtesting:**

```bash
# Backtest con datos históricos
npm run backtest -- --strategy MeanReversion --symbol BTCUSDT --period 2023-01-01:2024-01-01

# Criterios de éxito:
# - Sharpe Ratio > 1.5
# - Max Drawdown < 20%
# - Win Rate > 45%
# - Profit Factor > 1.5
```

## 🚦 Uso

### Paper Trading (Recomendado)

```bash
# Ejecutar en modo paper trading (sin dinero real)
npm run bot
```

### Live Trading (Solo después de validar)

```bash
# 1. Cambiar en .env: EXCHANGE_TESTNET=false
# 2. Compilar
npm run build

# 3. Ejecutar en producción
npm start
```

## 📊 Estructura del Proyecto

```
src/
├── config/           # Configuración type-safe con Zod
├── core/             # RiskManager y componentes críticos
├── strategies/       # Estrategias de trading
│   ├── base/         # Clase base Strategy
│   └── *.ts          # Implementaciones específicas
├── backtesting/      # Motor de backtesting
├── monitoring/       # Telegram notifier y alertas
├── database/         # Schemas y migraciones
├── utils/            # Logger y helpers
└── index.ts          # Entry point
```

## 📈 Estrategias Implementadas

### 1. Mean Reversion
- **Indicadores**: Bollinger Bands + RSI
- **Timeframe**: 5m-15m
- **Mejor para**: Mercados laterales
- **Win Rate esperado**: 50-60%

### 2. Trend Following (Próximamente)
- **Indicadores**: EMA crossover + ADX
- **Timeframe**: 1h-4h
- **Mejor para**: Tendencias fuertes

### 3. Volatility Breakout (Próximamente)
- **Indicadores**: ATR + Volume
- **Timeframe**: 5m-1h
- **Mejor para**: Sesiones de alta volatilidad

## 🔒 Gestión de Riesgo

El sistema implementa 4 niveles de circuit breakers:

1. **Pérdida Diaria Máxima**: Si pierdes 3% del capital en un día, el bot se detiene
2. **Posiciones Abiertas**: Máximo 3 posiciones simultáneas
3. **Tamaño de Posición**: Máximo 10% del capital en una sola operación
4. **Trades Diarios**: Máximo 20 trades por día

## 📊 Métricas y Monitoreo

El sistema calcula automáticamente:

- **Sharpe Ratio**: Retorno ajustado por riesgo
- **Max Drawdown**: Peor caída desde un pico
- **Profit Factor**: Ratio ganancia/pérdida
- **Win Rate**: Porcentaje de trades ganadores

## 🔔 Alertas de Telegram

Configura un bot de Telegram para recibir:

- ✅ Notificación de cada trade (entrada y salida)
- 📊 Reporte diario de performance
- 🔴 Alertas de circuit breakers activados

## ⚠️ Advertencias Importantes

> [!CAUTION]
> - **Empieza SIEMPRE con testnet/paper trading**
> - **Nunca arriesgues más del 1% por trade**
> - El trading tiene riesgos. El 80% de traders retail pierden dinero
> - Este software se proporciona "AS IS" sin garantías

## 📚 Recursos Adicionales

- [Documentación CCXT](https://docs.ccxt.com/)
- [Guía de Backtesting](./docs/backtesting.md) (Próximamente)
- [API Reference](./docs/api.md) (Próximamente)

## 📄 Licencia

MIT License - Ver [LICENSE](./LICENSE) para más detalles

---

**Desarrollado por Alexander Sandoval**

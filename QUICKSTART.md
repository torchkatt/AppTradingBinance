# 🚀 Inicio Rápido - Trading en Tiempo Real

## ⚠️ IMPORTANTE: Lee todo antes de empezar

Este sistema puede operar con dinero real. Sigue estos pasos **en orden** para evitar pérdidas.

---

## Paso 1: Instalación

```bash
# Ejecutar script de instalación
./setup.sh

# El script:
# - Verifica Node.js >= 18
# - Instala dependencias
# - Crea .env desde template
# - Configura base de datos (opcional)
```

---

## Paso 2: Configuración de Credenciales

### 2.1 Crear cuenta en Exchange (Testnet)

**Para Binance Testnet:**
1. Ve a https://testnet.binance.vision/
2. Crea una cuenta de prueba
3. Genera API Key y Secret
4. Anota las credenciales

**Para Bybit Testnet:**
1. Ve a https://testnet.bybit.com/
2. Crea cuenta de prueba
3. API Management → Create New Key
4. Anota las credenciales

### 2.2 Configurar .env

```bash
nano .env
```

Configuración **MÍNIMA** requerida:

```env
# Exchange
EXCHANGE_NAME=binance
EXCHANGE_TESTNET=true                    # ⚠️ SIEMPRE true al inicio
EXCHANGE_API_KEY=tu_api_key_aqui
EXCHANGE_API_SECRET=tu_secret_aqui

# Gestión de Riesgo
RISK_PER_TRADE_PCT=0.01                  # 1% por trade
MAX_DAILY_LOSS_PCT=0.03                  # 3% pérdida diaria máxima
MAX_POSITION_SIZE_PCT=0.1                # 10% máximo por posición

# Database
DATABASE_URL=postgresql://localhost:5432/trading_system
REDIS_URL=redis://localhost:6379

# Trading
SYMBOLS=BTC/USDT,ETH/USDT
TIMEFRAME=5m

# Seguridad
WEBHOOK_SECRET=$(openssl rand -hex 32)   # Genera uno aleatorio

# Telegram (OPCIONAL pero recomendado)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### 2.3 Configurar Telegram (Opcional pero recomendado)

```bash
# 1. Hablar con @BotFather en Telegram
# 2. Crear bot: /newbot
# 3. Copiar el token

# 4. Obtener tu Chat ID:
# - Escribe cualquier cosa a tu bot
# - Ve a: https://api.telegram.org/bot<TOKEN>/getUpdates
# - Copia el "chat":{"id": XXXXXX}

# 5. Agregar a .env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
```

---

## Paso 3: Verificar Configuración

```bash
# Verificar que todo está bien configurado
npm run health-check
```

**Output esperado:**
```
✅ Exchange connected
✅ Balance: 10000 USDT
✅ BTC/USDT: 42000
✅ TESTNET mode - Safe for testing
✅ All checks passed!
```

---

## Paso 4: Backtesting (OBLIGATORIO ⚠️)

**NO operes sin hacer backtesting primero.**

```bash
# Backtest básico con 1 año de datos
npm run backtest -- \
  --strategy MeanReversion \
  --symbol BTC/USDT \
  --period 2023-01-01:2024-01-01

# Output esperado:
# ═══════════════════════════════════════
#   BACKTEST RESULTS
# ═══════════════════════════════════════
#   Total Return:     +15.2%
#   Win Rate:         52.3%
#   Sharpe Ratio:     1.82
#   Max Drawdown:     -12.4%
#   Strategy Grade:   A
```

**Criterios para aprobar:**
- ✅ Sharpe Ratio > 1.5
- ✅ Win Rate > 45%
- ✅ Profit Factor > 1.5  
- ✅ Max Drawdown < 20%

Si **NO** pasa todos los criterios:
- Ajusta parámetros de la estrategia
- Prueba diferentes timeframes
- Considera otro período de datos

---

## Paso 5: Paper Trading (2 semanas mínimo)

Una vez que el backtest sea exitoso:

```bash
# Iniciar en modo desarrollo (auto-reload)
npm run bot
```

**Qué esperar:**
```
╔═══════════════════════════════════════════════════╗
║       PROFESSIONAL TRADING SYSTEM                 ║
╚═══════════════════════════════════════════════════╝

🚀 Initializing Trading System...
✅ Database initialized
✅ Exchange connected
✅ Balance: 10000 USDT
✅ Risk Manager initialized

⚠️  RUNNING IN TESTNET MODE - No real money at risk

▶️  Starting Trading Bot...

═══════════════════════════════════════════════════
  SYSTEM ACTIVE - Monitoring markets
═══════════════════════════════════════════════════

Press Ctrl+C to stop gracefully
```

**Durante las 2 semanas:**
- Monitorea las alertas de Telegram diariamente
- Revisa los logs en busca de errores
- Analiza las métricas de performance
- Ajusta estrategia si es necesario

---

## Paso 6: Análisis de Resultados

Después de 2 semanas de paper trading:

```bash
# Ver métricas en la base de datos
psql trading_system -c "SELECT * FROM performance_summary LIMIT 14;"

# Verificar última sesión
psql trading_system -c "SELECT * FROM daily_metrics ORDER BY date DESC LIMIT 7;"
```

**Pregúntate:**
- ¿El win rate se mantiene > 45%?
- ¿El drawdown es < 20%?
- ¿Los trades son consistentes con el backtest?
- ¿Hubo algún error crítico?

---

## Paso 7: Live Trading (Solo si todo lo anterior funciona)

### ⚠️ ADVERTENCIA FINAL

> [!CAUTION]
> - El trading tiene riesgos reales
> - Puedes perder todo tu capital
> - Solo opera con dinero que puedas perder
> - Empieza con capital MÍN IMO ($500-1000)

### 7.1 Cambiar a Live Trading

```bash
# Editar .env
nano .env

# Cambiar:
EXCHANGE_TESTNET=false                    # ⚠️ LIVE MODE

# Configurar API Keys de producción
EXCHANGE_API_KEY=tu_api_key_REAL
EXCHANGE_API_SECRET=tu_secret_REAL
```

### 7.2 Último Health Check

```bash
npm run health-check

# ⚠️ Verificar que dice: LIVE TRADING mode
```

### 7.3 Compilar y Ejecutar

```bash
# Compilar
npm run build

# Ejecutar en producción
npm start

# O ejecutar como daemon (recomendado)
npm install -g pm2
pm2 start dist/index.js --name trading-bot
pm2 logs trading-bot
pm2 monit
```

---

## 🆘 Troubleshooting

### Error: "API key invalid"

```bash
# Verificar que las credenciales sean correctas
# Verificar que la API tiene permisos de trading
# Si es testnet, usar keys de testnet
```

### Error: "Database connection failed"

```bash
# Iniciar PostgreSQL
brew services start postgresql@14

# Crear DB
createdb trading_system

# Ejecutar migrations
npm run db:migrate
```

### Error: "Not enough balance"

```bash
# Verificar balance en el exchange
# En testnet: solicitar más fondos ficticios
# En live: depositar USDT en tu cuenta
```

### Bot no ejecuta trades

```bash
# Verificar que hay señales:
# - Revisa los logs: mira si dice "signal detected"
# - Puede que no haya oportunidades en el momento
# - Verifica que los circuit breakers no estén activados
```

---

## 📊 Monitoreo Diario

### Comandos útiles

```bash
# Ver estado actual
pm2 monit

# Ver últimos logs
pm2 logs trading-bot --lines 50

# Ver trades de hoy
psql trading_system -c "
  SELECT * FROM trades 
  WHERE DATE(entry_time) = CURRENT_DATE 
  ORDER BY entry_time DESC;
"

# Ver PnL del día
psql trading_system -c "
  SELECT * FROM daily_metrics 
  WHERE date = CURRENT_DATE;
"
```

### Checklist diario:
- [ ] Revisar alertas de Telegram
- [ ] Verificar que el bot sigue corriendo
- [ ] Revisar PnL del día
- [ ] Verificar no hay errores en logs
- [ ] Confirmar que balance es correcto

---

## 🛑 Detener el Sistema

### Detención graciosa

```bash
# Si corrió con npm start:
Ctrl + C

# Si corrió con pm2:
pm2 stop trading-bot
```

El sistema:
- ✅ Cierra posiciones abiertas
- ✅ Guarda estado en DB
- ✅ Envía notificación de cierre
- ✅ Genera reporte final

---

## 📚 Recursos Adicionales

- [README.md](./README.md) - Documentación completa
- [Walkthrough](../brain/walkthrough.md) - Tour del sistema
- [Implementation Plan](../brain/implementation_plan.md) - Arquitectura detallada

---

## ⚡ Comandos Rápidos

```bash
# Health check
npm run health-check

# Backtest
npm run backtest -- --symbol BTC/USDT --period 2023-01-01:2024-01-01

# Paper trading
npm run bot

# Live trading (después de compilar)
npm start

# Ver logs (si usas pm2)
pm2 logs trading-bot

# Detener
pm2 stop trading-bot
```

---

**🎯 Recuerda: La paciencia y la disciplina son más rentables que la prisa.**

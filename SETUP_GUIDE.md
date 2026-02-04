# 📋 Guía Rápida de Configuración

## 🔐 Paso 1: Obtener credenciales de Binance Testnet

1. **Ir a Binance Testnet:**
   - Abre: https://testnet.binance.vision/
   
2. **Registrarse:**
   - Click en "Register" (arriba derecha)
   - Crea una cuenta con email (puede ser ficticio)
   - **Anota tu email y password**

3. **Obtener API Keys:**
   - Inicia sesión en testnet.binance.vision
   - Click en tu perfil → "API Management"
   - Click "Create API"
   - Nombra tu API (ej: "TradingBot")
   - **IMPORTANTE**: Guarda el API Key y Secret (solo se muestran una vez)

4. **Habilitar permisos:**
   - Marca: "Enable Spot & Margin Trading"
   - Marca: "Enable Futures"
   - **NO** marcar "Enable Withdrawals" (no es necesario)

5. **Obtener fondos de prueba:**
   - Testnet te da fondos automáticamente
   - Si necesitas más: https://testnet.binance.vision/en/futures/BTCUSDT

---

## ✏️ Paso 2: Configurar .env

Abre el archivo `.env` que acabo de crear y reemplaza:

```bash
EXCHANGE_API_KEY=tu_api_key_de_testnet_aqui
EXCHANGE_API_SECRET=tu_secret_de_testnet_aqui
```

---

## 📱 Paso 3: Configurar Telegram (Opcional pero recomendado)

1. **Crear Bot:**
   - Abre Telegram
   - Busca: `@BotFather`
   - Envía: `/newbot`
   - Elige nombre (ej: "My Trading Bot")
   - Elige username (ej: "mytradingbot123_bot")
   - **Copia el token** que te da

2. **Obtener Chat ID:**
   - Busca tu bot en Telegram
   - Envíale cualquier mensaje (ej: "hola")
   - Abre en navegador (reemplaza TOKEN):
     ```
     https://api.telegram.org/botTOKEN/getUpdates
     ```
   - Busca `"chat":{"id":123456789}`
   - **Copia ese número**

3. **Agregar a .env:**
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   TELEGRAM_CHAT_ID=123456789
   ```

---

## 🗄️ Paso 4: Configurar Base de Datos (Opcional)

Si tienes PostgreSQL instalado:

```bash
# Crear base de datos
createdb trading_system

# Ejecutar migrations
npm run db:migrate
```

Si **NO** tienes PostgreSQL:
- El sistema puede funcionar sin DB (sin persistencia de históricos)
- Comenta las líneas de DATABASE_URL en .env

---

## ✅ Paso 5: Verificar configuración

```bash
# Generar webhook secret
openssl rand -hex 32

# Copiar output y reemplazar en .env:
WEBHOOK_SECRET=el_hash_generado_aqui

# Verificar que todo está bien
npm run health-check
```

**Output esperado:**
```
✅ Exchange connected
✅ Balance: 10000 USDT
✅ BTC/USDT: 42000
✅ TESTNET mode - Safe for testing
```

---

## 📝 Tu checklist:

- [ ] Cuenta en testnet.binance.vision creada
- [ ] API Key y Secret obtenidos
- [ ] .env configurado con las credenciales
- [ ] Telegram bot creado (opcional)
- [ ] Webhook secret generado
- [ ] `npm run health-check` pasa

---

**Siguiente paso:** Una vez que todo esté configurado, puedes hacer tu primer backtest:

```bash
npm run backtest -- --symbol BTC/USDT --period 2023-01-01:2024-01-01
```

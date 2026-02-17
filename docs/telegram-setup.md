# Configuración de Telegram Bot para Trading System

## Paso 1: Crear el Bot

1. **Abre Telegram** y busca el usuario `@BotFather`
2. Inicia una conversación y envía el comando: `/newbot`
3. BotFather te pedirá un **nombre** para tu bot (ej: "My Trading Bot")
4. Luego te pedirá un **username** que debe terminar en "bot" (ej: "mytradingalerts_bot")
5. **¡Importante!** BotFather te dará un **TOKEN**. Guárdalo, tiene este formato:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

## Paso 2: Obtener tu Chat ID

### Método 1: Usando el Bot GetIDBot
1. Busca `@getidsbot` en Telegram
2. Inicia una conversación con el bot
3. Te mostrará tu **Chat ID** (un número como `123456789`)

### Método 2: Manual
1. Inicia una conversación con tu nuevo bot (el que creaste con BotFather)
2. Envía cualquier mensaje (por ejemplo: "Hola")
3. Abre en tu navegador:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
   Reemplaza `<TU_TOKEN>` con el token que te dio BotFather
4. Busca en el JSON el campo: `"chat":{"id":123456789...`
5. Ese número es tu **Chat ID**

## Paso 3: Configurar las Variables de Entorno

Abre el archivo `.env` en la raíz del proyecto y agrega:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

Reemplaza con tus valores reales.

## Paso 4: Reiniciar el Bot

Una vez configurado, reinicia el bot de trading:

```bash
npm run bot
```

Deberías recibir un mensaje de bienvenida en Telegram confirmando que el bot está conectado.

## Comandos Disponibles

Desde Telegram, podrás enviar estos comandos a tu bot:

- `/status` - Estado actual del bot y posiciones abiertas
- `/balance` - Balance de la cuenta
- `/stats` - Estadísticas de rendimiento
- `/help` - Lista de comandos disponibles

## Notificaciones Automáticas

El bot enviará automáticamente:
- ✅ Inicio/parada del sistema
- 📊 Señales de trading detectadas
- 💰 Órdenes ejecutadas (entrada/salida)
- 📈 Actualizaciones de balance
- ⚠️ Alertas de riesgo
- 📊 Resumen de rendimiento cada hora

## Solución de Problemas

**El bot no envía mensajes:**
- Verifica que el TOKEN y CHAT_ID sean correctos
- Asegúrate de haber iniciado una conversación con el bot en Telegram
- Revisa los logs del sistema para errores

**Error "Chat not found":**
- Asegúrate de enviar un mensaje al bot antes de obtener el Chat ID
- Verifica que el Chat ID no tenga espacios ni caracteres extra

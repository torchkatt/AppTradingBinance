/**
 * Script helper para obtener el Chat ID de Telegram
 * 
 * Uso:
 * 1. Envía UN mensaje a tu bot en Telegram
 * 2. Ejecuta: npx tsx get-telegram-chatid.ts
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TOKEN_HERE';

async function getChatId() {
    console.log('🔍 Buscando mensajes en tu bot...\n');

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
        const data: any = await response.json();

        if (!data.ok) {
            console.log('❌ Error:', data.description);
            console.log('\n💡 Verifica que:');
            console.log('1. El TOKEN sea correcto');
            console.log('2. Hayas enviado al menos un mensaje a tu bot');
            return;
        }

        if (data.result.length === 0) {
            console.log('⚠️  No se encontraron mensajes.');
            console.log('\n📱 Pasos:');
            console.log('1. Abre Telegram');
            console.log('2. Busca tu bot (el que creaste con BotFather)');
            console.log('3. Envía cualquier mensaje (ej: "Hola")');
            console.log('4. Ejecuta este script nuevamente');
            return;
        }

        // Obtener el chat ID del primer mensaje
        const chatId = data.result[0].message.chat.id;
        const username = data.result[0].message.chat.username || data.result[0].message.chat.first_name;

        console.log('✅ ¡Chat ID encontrado!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Información:');
        console.log(`   Usuario: ${username}`);
        console.log(`   Chat ID: ${chatId}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📝 Ahora agrega estos valores a tu archivo .env:\n');
        console.log(`TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`);
        console.log(`TELEGRAM_CHAT_ID=${chatId}`);
        console.log('\n✨ Luego reinicia el bot con: npm run bot');

    } catch (error: any) {
        console.log('❌ Error al conectar con Telegram:', error.message);
    }
}

getChatId();

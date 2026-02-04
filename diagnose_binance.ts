import ccxt from 'ccxt';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Diagnóstico detallado de conexión a Binance Futures Testnet
 */
async function diagnoseBinance() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('   BINANCE TESTNET - DIAGNÓSTICO COMPLETO');
    console.log('═══════════════════════════════════════════════════\n');

    const apiKey = process.env.EXCHANGE_API_KEY || '';
    const secret = process.env.EXCHANGE_API_SECRET || '';

    console.log('1️⃣  Verificando credenciales...');
    console.log(`   API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 10)}`);
    console.log(`   Secret: ${secret.substring(0, 10)}...***`);
    console.log('   ✅ Credenciales cargadas\n');

    console.log('2️⃣  Configurando Binance USDM Futures Testnet...');

    const exchange = new ccxt.binanceusdm({
        apiKey,
        secret,
        enableRateLimit: true,
        options: {
            defaultType: 'future',
            adjustForTimeDifference: true,
            recvWindow: 60000, // Aumentar ventana de tiempo
        },
    });

    // Activar modo testnet
    exchange.setSandboxMode(true);

    console.log('   Exchange ID:', exchange.id);
    console.log('   Default Type:', exchange.options.defaultType);
    console.log('   Sandbox Mode:', exchange.sandboxMode);

    // Mostrar URLs configuradas
    console.log('\n3️⃣  URLs configuradas:');
    const urls = exchange.urls;
    if (urls.test) {
        console.log('   Test URL:', urls.test);
    }
    if (urls.api) {
        console.log('   API URLs:', JSON.stringify(urls.api, null, 2));
    }

    console.log('\n4️⃣  Probando conexión pública (sin API Key)...');
    try {
        const ticker = await exchange.fetchTicker('BTC/USDT');
        console.log(`   ✅ Conexión pública OK - BTC/USDT: $${ticker.last}`);
    } catch (error: any) {
        console.log(`   ❌ Error en conexión pública: ${error.message}`);
    }

    console.log('\n5️⃣  Probando conexión privada (con API Key)...');
    console.log('   Test 1: Fetch Balance...');
    try {
        const balance = await exchange.fetchBalance();
        console.log('   ✅ Balance obtenido correctamente!');
        console.log('   Total USDT:', balance.USDT?.total || 0);
        console.log('   Free USDT:', balance.USDT?.free || 0);
        console.log('   Used USDT:', balance.USDT?.used || 0);
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);

        // Analizar el error
        if (error.message.includes('-2015')) {
            console.log('\n   🔍 ANÁLISIS DEL ERROR -2015:');
            console.log('   Este error indica que la API Key no tiene permisos correctos.');
            console.log('\n   ⚠️ SOLUCIÓN NECESARIA:');
            console.log('   1. Ve a: https://testnet.binancefuture.com/');
            console.log('   2. Login → API Management');
            console.log('   3. Edita tu API Key');
            console.log('   4. En "IP access restrictions":');
            console.log('      → Selecciona "Unrestricted"');
            console.log('   5. Guarda y vuelve a ejecutar este script');
        } else if (error.message.includes('-1021')) {
            console.log('\n   🔍 ANÁLISIS DEL ERROR -1021:');
            console.log('   Timestamp fuera de sync.');
            console.log('   Solución: Sincronizar reloj del sistema.');
        } else if (error.message.includes('-2014')) {
            console.log('\n   🔍 ANÁLISIS DEL ERROR -2014:');
            console.log('   API Key inválida o formato incorrecto.');
            console.log('   Verifica que copiaste las keys correctamente.');
        }

        console.log('\n   Detalles técnicos del error:');
        console.log('   ', error);
    }

    console.log('\n6️⃣  Información del servidor...');
    try {
        const time = await exchange.fetchTime();
        const serverTime = new Date(time);
        const localTime = new Date();
        const diff = Math.abs(serverTime.getTime() - localTime.getTime());

        console.log(`   Server time: ${serverTime.toISOString()}`);
        console.log(`   Local time: ${localTime.toISOString()}`);
        console.log(`   Difference: ${diff}ms`);

        if (diff > 2000) {
            console.log('   ⚠️ La diferencia de tiempo es alta (>2s), puede causar problemas');
        } else {
            console.log('   ✅ Sincronización de tiempo correcta');
        }
    } catch (error: any) {
        console.log(`   ⚠️ No se pudo obtener tiempo del servidor: ${error.message}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('   FIN DEL DIAGNÓSTICO');
    console.log('═══════════════════════════════════════════════════\n');
}

// Ejecutar
diagnoseBinance().catch(console.error);

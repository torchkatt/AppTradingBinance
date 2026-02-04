import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

async function testKeys() {
    const keys = {
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_API_SECRET,
    };

    if (!keys.apiKey || !keys.secret) {
        console.error('❌ Error: EXCHANGE_API_KEY or EXCHANGE_API_SECRET is not defined in .env file.');
        return;
    }

    console.log('Testing with API Key ending in:', keys.apiKey.slice(-5));

    // Test 1: Binance USDM Futures (Manual Bypass - Testnet)
    console.log('\n--- Testing Binance USDM Futures (Testnet) ---');
    const futures = new ccxt.binanceusdm(keys);
    futures.urls['api'] = { ...futures.urls['api'], ...futures.urls['test'] };
    futures.options['defaultType'] = 'future';

    try {
        const balance: any = await futures.fetchBalance();
        console.log('✅ Futures Testnet Success! Balance:', balance['total']['USDT']);
    } catch (e: any) {
        console.log('❌ Futures Testnet Failed:', e.message);
    }

    // Test 1.5: Binance USDM Futures (Manual Bypass - Demo Trading)
    console.log('\n--- Testing Binance USDM Futures (Demo Trading) ---');
    const demo = new ccxt.binanceusdm(keys);
    demo.urls['api'] = { ...demo.urls['api'], ...demo.urls['demo'] };
    demo.options['defaultType'] = 'future';

    try {
        const balance: any = await demo.fetchBalance();
        console.log('✅ Demo Trading Success! Balance:', balance['total']['USDT']);
    } catch (e: any) {
        console.log('❌ Demo Trading Failed:', e.message);
    }

    // Test 2: Binance Spot (Standard Sandbox)
    console.log('\n--- Testing Binance Spot ---');
    const spot = new ccxt.binance(keys);
    spot.setSandboxMode(true);
    try {
        const balance: any = await spot.fetchBalance();
        console.log('✅ Spot Success! USDT Balance:', balance['total']['USDT']);
    } catch (e: any) {
        console.log('❌ Spot Failed:', e.message);
    }

    // Test 3: Production (Check if keys are for live)
    console.log('\n--- Testing Binance Production (Diagnostic Only) ---');
    const prod = new ccxt.binanceusdm(keys);
    try {
        const balance: any = await prod.fetchBalance();
        console.log('✅ PRODUCTION SUCCESS! (Keys are Live):', balance['total']['USDT']);
    } catch (e: any) {
        console.log('❌ Production Failed:', e.message);
    }
}

testKeys();

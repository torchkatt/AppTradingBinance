import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Diagnostic Script for Bybit Mainnet DEMO (Unified Trading Account Demo)
 */
async function diagnosticBybitDemo() {
    console.log('--- BYBIT DEMO TRADING DIAGNOSTIC ---');
    console.log('Testing Key:', process.env.EXCHANGE_API_KEY?.slice(-5));

    // Initialize as normal Bybit
    const exchange = new ccxt.bybit({
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_API_SECRET,
        enableRateLimit: true,
        options: {
            'adjustForTimeDifference': true,
            'recvWindow': 10000,
        }
    });

    // Manually override URLs to point to Demo Trading environment
    // Note: Bybit V5 Demo API is often accessed via specific headers or endpoints.
    // However, common knowledge suggests 'api-demo.bybit.com' for V5 Demo.
    exchange.urls['api'] = {
        public: 'https://api-demo.bybit.com',
        private: 'https://api-demo.bybit.com',
    };

    // Also override V5 specific property if exists in CCXT structure
    // (CCXT structure varies, so we patch broadly)
    (exchange as any).urls['api']['v5'] = 'https://api-demo.bybit.com';

    exchange.options['defaultType'] = 'future';

    try {
        console.log('1. Connecting to Bybit Demo API (api-demo.bybit.com)...');
        await exchange.loadMarkets();
        console.log('✅ Public connection successful');

        const serverTime = await exchange.fetchTime();
        const localTime = Date.now();
        console.log(`⏰ Time check: Server=${serverTime}, Local=${localTime}, Diff=${localTime - serverTime}ms`);
        console.log(`🔑 Key Length: ${process.env.EXCHANGE_API_KEY?.length}`);
        console.log(`🔑 Secret Length: ${process.env.EXCHANGE_API_SECRET?.length}`);

        console.log('2. Fetching Balance (Private)...');
        // CCXT generic fetchBalance can be tricky with Bybit Demo/UTA.
        // Using explicit V5 endpoint wrapper to guarantee correct params.
        const response = await exchange.privateGetV5AccountWalletBalance({ accountType: 'UNIFIED' });

        // Parse raw response - structure is response.result.list[0].coin...
        const usdt = response.result.list[0].coin.find((c: any) => c.coin === 'USDT');

        console.log('✅ SUCCESS! Connected to Bybit Demo Trading.');
        if (usdt) {
            console.log('   Total USDT:', usdt.walletBalance);
            console.log('   Free USDT: ', usdt.walletBalance); // In UTA, walletBalance is often equity
        } else {
            console.log('   USDT not found in balance list (Check other coins)');
        }

    } catch (e: any) {
        console.log('❌ ERROR:', e.message);
        console.log('Full Error:', JSON.stringify(e));
    }
    console.log('--- BYBIT DEMO DIAGNOSTIC END ---');
}

diagnosticBybitDemo();

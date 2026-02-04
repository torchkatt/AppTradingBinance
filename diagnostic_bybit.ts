import ccxt from 'ccxt';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Diagnostic Script specifically for Bybit Testnet
 */
async function diagnosticBybit() {
    console.log('--- BYBIT DIAGNOSTIC START ---');
    console.log('Testing Key:', process.env.EXCHANGE_API_KEY?.slice(-5));

    const exchange = new ccxt.bybit({
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_API_SECRET,
        enableRateLimit: true,
    });

    // Enable Testnet Mode
    exchange.setSandboxMode(true);
    exchange.options['defaultType'] = 'future'; // Standard for Derivatives

    try {
        console.log('1. Connecting to Bybit Testnet...');
        // Force a simple public request first
        await exchange.loadMarkets();
        console.log('✅ Public connection successful');

        console.log('2. Fetching Balance (Private)...');
        const balance = await exchange.fetchBalance();
        console.log('✅ SUCCESS! Connected to Bybit Testnet.');
        const usdt = (balance as any).USDT || { total: 0, free: 0 };
        console.log('   Total USDT:', usdt.total);
        console.log('   Free USDT: ', usdt.free);



    } catch (e: any) {
        console.log('❌ ERROR:', e.message);

        if (e.message.includes('10003')) {
            console.log('\n>>> DIAGNOSIS: Invalid API Key');
            console.log('Make sure you are using keys from: https://testnet.bybit.com/app/user/api-management');
            console.log('NOT from the main Bybit site.');
        } else if (e.message.includes('10001')) {
            console.log('\n>>> DIAGNOSIS: Request Parameters Error');
            console.log('Check if your key permissions allow "Futures Trading" and "Account Reading".');
        }
    }
    console.log('--- BYBIT DIAGNOSTIC END ---');
}

diagnosticBybit();

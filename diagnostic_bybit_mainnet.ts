import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Diagnostic Script for Bybit MAINNET (Real Money)
 * Intended only to verify if the keys are valid Mainnet keys.
 */
async function diagnosticBybitMainnet() {
    console.log('--- BYBIT MAINNET DIAGNOSTIC ---');
    console.log('Testing Key:', process.env.EXCHANGE_API_KEY?.slice(-5));

    const exchange = new ccxt.bybit({
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_API_SECRET,
        enableRateLimit: true,
        options: {
            'adjustForTimeDifference': true,
            'recvWindow': 10000,
        }
    });

    // Explicitly NO Sandbox/Demo URLs
    // Default CCXT uses https://api.bybit.com

    try {
        console.log('1. Connecting to Bybit MAINNET...');
        await exchange.loadMarkets();
        console.log('✅ Public connection successful');

        console.log('2. Fetching Balance (Private)...');
        const balance = await exchange.fetchBalance();
        console.log('✅ SUCCESS! Connected to Bybit MAINNET (REAL MONEY).');
        console.log('   Total USDT:', balance['total']['USDT']);
        console.log('   Free USDT: ', balance['free']['USDT']);

    } catch (e: any) {
        console.log('❌ ERROR:', e.message);
    }
    console.log('--- BYBIT MAINNET DIAGNOSTIC END ---');
}

diagnosticBybitMainnet();

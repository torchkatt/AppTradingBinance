import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

async function testBybit() {
    const keys = {
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_API_SECRET,
    };

    console.log('Testing Key for Bybit:', keys.apiKey?.slice(-5));

    const bybit = new ccxt.bybit({
        apiKey: keys.apiKey,
        secret: keys.secret,
    });

    // Enable Testnet/Sandbox
    bybit.setSandboxMode(true);

    try {
        console.log('Fetching Bybit Testnet Balance...');
        const balance = await bybit.fetchBalance();
        console.log('✅ Bybit Testnet Success! USDT Balance:', balance['total']['USDT']);
    } catch (e: any) {
        console.log('❌ Bybit Testnet Failed:', e.message);
    }
}

testBybit();

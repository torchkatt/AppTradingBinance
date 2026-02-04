import ccxt from 'ccxt';
import * as dotenv from 'dotenv';
dotenv.config();

const config = {
    apiKey: process.env.EXCHANGE_API_KEY?.trim(),
    secret: process.env.EXCHANGE_API_SECRET?.trim(),
};

async function diagnostic() {
    console.log('Testing Key:', config.apiKey?.slice(-5));

    const exchange = new ccxt.binance({
        apiKey: config.apiKey,
        secret: config.secret,
        enableRateLimit: true,
        options: {
            defaultType: 'future',
            adjustForTimeDifference: true,
            recvWindow: 5000,
        }
    });

    // Usar URLs de Demo
    const demoUrls = (exchange as any).urls['demo'];
    if (demoUrls) {
        (exchange as any).urls['api'] = { ...(exchange as any).urls['api'], ...demoUrls };
    }

    console.log('Using endpoint:', (exchange as any).urls['api']['fapiPrivate'] || (exchange as any).urls['api']['private']);


    try {
        console.log('Fetching markets (Public)...');
        await exchange.loadMarkets();
        console.log('✅ Public OK!');

        console.log('Fetching balance (Private)...');
        const balance = await exchange.fetchBalance();
        const usdt = (balance as any).USDT || { total: 0 };
        console.log('✅ Success! Account Balance:', usdt.total);


    } catch (e: any) {
        console.log('❌ Error:', e.message);
        if (e.message.includes('-2008')) {
            console.log('\n--- DIAGNOSIS ---');
            console.log('The key is likely valid but the endpoint or account type is not recognized.');
            console.log('Possible reasons:');
            console.log('1. The Demo account needs to be "warmed up" (sometimes you need to do a manual trade in the web UI first).');
            console.log('2. The key was just created and needs a few minutes (Binance Demo is slow to sync).');
            console.log('3. Your IP is being blocked or requires manual whitelisting even if not restricted.');
        }
    }
}

diagnostic();

import ccxt from 'ccxt';
import dotenv from 'dotenv';
dotenv.config();

const config = {
    apiKey: process.env.EXCHANGE_API_KEY?.trim(),
    secret: process.env.EXCHANGE_API_SECRET?.trim(),
};

async function diagnostic() {
    console.log('Testing Key:', config.apiKey?.slice(-5));

    const exchanges = [
        { name: 'binance (Spot Demo)', id: 'binance', type: 'spot', demo: true },
        { name: 'binance (Futures Demo)', id: 'binance', type: 'future', demo: true },
        { name: 'binanceusdm (Demo)', id: 'binanceusdm', type: 'future', demo: true },
        { name: 'binance (Testnet)', id: 'binance', type: 'spot', testnet: true },
        { name: 'binance (Futures Testnet)', id: 'binance', type: 'future', testnet: true },
    ];

    for (const ex of exchanges) {
        console.log(`\n>>> Testing: ${ex.name}`);
        const exchange = new (ccxt as any)[ex.id]({
            apiKey: config.apiKey,
            secret: config.secret,
            options: { defaultType: ex.type }
        });

        if (ex.demo) {
            // Forzar URLs de Demo Trading (demo-api.binance.com)
            const base = (exchange as any).urls['demo'];
            if (base) {
                exchange.urls['api'] = { ...exchange.urls['api'], ...base };
                console.log(' Using Demo URLs:', exchange.urls['api']['public']);
            } else {
                console.log(' No Demo URLs found in CCXT for this class');
                continue;
            }
        } else if (ex.testnet) {
            exchange.setSandboxMode(true);
            console.log(' Using Sandbox URLs:', exchange.urls['api']['public']);
        }

        try {
            const balance = await exchange.fetchBalance();
            console.log(` ✅ SUCCESS! Balance found.`);
            // Si funciona, paramos y reportamos la config exacta
            return;
        } catch (e: any) {
            console.log(` ❌ FAILED: ${e.message.split('\n')[0]}`);
        }
    }
}

diagnostic();

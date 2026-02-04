import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.EXCHANGE_API_KEY.trim();
const apiSecret = process.env.EXCHANGE_API_SECRET.trim();

async function testRaw() {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');

    const urls = [
        'https://demo-api.binance.com/api/v3/account',
        'https://demo-fapi.binance.com/fapi/v1/account',
        'https://fapi.binance.com/fapi/v1/account', // Probando live fapi con demo keys (por si acaso)
        'https://testnet.binancefuture.com/fapi/v1/account'
    ];

    for (const url of urls) {
        console.log(`\nTesting: ${url}`);
        const fullUrl = `${url}?${queryString}&signature=${signature}`;
        try {
            const response = await fetch(fullUrl, {
                headers: { 'X-MBX-APIKEY': apiKey }
            });
            const data = await response.json();
            console.log(`Status: ${response.status}`);
            console.log(`Response: ${JSON.stringify(data)}`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

testRaw();

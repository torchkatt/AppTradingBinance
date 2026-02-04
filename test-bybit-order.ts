import crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.EXCHANGE_API_KEY!;
const apiSecret = process.env.EXCHANGE_API_SECRET!;

async function testBybitOrder() {
    console.log('--- TESTING BYBIT DEMO ORDER CREATION ---');
    const baseUrl = 'https://api-demo.bybit.com';
    const endpoint = '/v5/order/create';
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    // Order parameters
    const orderParams = {
        category: 'linear',
        symbol: 'BTCUSDT',
        side: 'Buy',
        orderType: 'Market',
        qty: '0.001',
    };

    // Build query string for POST body (JSON)
    const body = JSON.stringify(orderParams);

    // Signature for POST request: timestamp + apiKey + recvWindow + body
    const toSign = timestamp + apiKey + recvWindow + body;
    const signature = crypto.createHmac('sha256', apiSecret).update(toSign).digest('hex');

    const url = `${baseUrl}${endpoint}`;

    console.log(`\nTesting ORDER CREATE: ${url}`);
    console.log('Body:', body);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-BAPI-API-KEY': apiKey,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-SIGN': signature,
                'X-BAPI-RECV-WINDOW': recvWindow,
            },
            body: body
        });
        const data = await response.json();

        if (data.retCode !== 0) {
            console.log('❌ ORDER Failed:', JSON.stringify(data, null, 2));
        } else {
            console.log('✅ ORDER Success:', JSON.stringify(data.result, null, 2));
        }
    } catch (error) {
        console.error('ORDER Error:', error);
    }
}

testBybitOrder();

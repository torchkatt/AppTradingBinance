import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.EXCHANGE_API_KEY!;
const apiSecret = process.env.EXCHANGE_API_SECRET!;

async function testBybitRaw() {
    console.log('--- BYBIT RAW DEMO DIAGNOSTIC ---');
    const baseUrl = 'https://api-demo.bybit.com';
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    // 1. KLINE (OHLCV)
    {
        const endpoint = '/v5/market/kline';
        // params: category=linear, symbol=BTCUSDT, interval=5, limit=200
        const queryString = 'category=linear&symbol=BTCUSDT&interval=5&limit=200';
        const url = `${baseUrl}${endpoint}?${queryString}`;

        console.log(`\nTesting KLINE: ${url}`);

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.retCode !== 0) {
                console.log('❌ KLINE Failed:', JSON.stringify(data));
            } else {
                console.log('✅ KLINE Success:', data.result?.list?.length, 'rows');
            }
        } catch (error) {
            console.error('KLINE Error:', error);
        }
    }

    // 2. POSITIONS
    {
        const endpoint = '/v5/position/list';
        const queryString = 'category=linear&symbol=BTCUSDT';
        // Signature
        const toSign = timestamp + apiKey + recvWindow + queryString;
        const signature = crypto.createHmac('sha256', apiSecret).update(toSign).digest('hex');

        const url = `${baseUrl}${endpoint}?${queryString}`;

        console.log(`\nTesting POSITIONS: ${url}`);
        console.log(`Debug: toSign=${toSign}`);

        try {
            const response = await fetch(url, {
                headers: {
                    'X-BAPI-API-KEY': apiKey,
                    'X-BAPI-TIMESTAMP': timestamp,
                    'X-BAPI-SIGN': signature,
                    'X-BAPI-RECV-WINDOW': recvWindow,
                }
            });
            const data = await response.json();

            if (data.retCode !== 0) {
                console.log('❌ POSITIONS Failed:', JSON.stringify(data));
            } else {
                console.log('✅ POSITIONS Success:', JSON.stringify(data.result));
            }
        } catch (error) {
            console.error('POSITIONS Error:', error);
        }
    }
}

testBybitRaw();

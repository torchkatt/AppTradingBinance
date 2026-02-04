/**
 * Cerrar posiciones usando Bybit V5 API directamente
 */
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.EXCHANGE_API_KEY!;
const API_SECRET = process.env.EXCHANGE_API_SECRET!;
const BASE_URL = 'https://api-demo.bybit.com';

async function closePosition(symbol: string, qty: number) {
    const endpoint = '/v5/order/create';
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    const orderParams = {
        category: 'linear',
        symbol: symbol,
        side: 'Sell', // Cerrar LONG = vender
        orderType: 'Market',
        qty: qty.toString(),
        reduceOnly: true
    };

    const body = JSON.stringify(orderParams);
    const toSign = timestamp + API_KEY + recvWindow + body;
    const signature = crypto.createHmac('sha256', API_SECRET).update(toSign).digest('hex');

    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-BAPI-API-KEY': API_KEY,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': signature,
            'X-BAPI-RECV-WINDOW': recvWindow,
        },
        body
    });

    const data: any = await response.json();
    return data;
}

async function closeAllPositions() {
    console.log('🔄 Cerrando todas las posiciones...\n');

    const positions = [
        { symbol: 'BTCUSDT', qty: 0.004 },
        { symbol: 'ETHUSDT', qty: 0.12 },
        { symbol: 'AVAXUSDT', qty: 18.2 },
        { symbol: 'DOGEUSDT', qty: 3495 }
    ];

    for (const pos of positions) {
        try {
            console.log(`Cerrando ${pos.symbol}...`);
            const result = await closePosition(pos.symbol, pos.qty);

            if (result.retCode === 0) {
                console.log(`✅ ${pos.symbol} cerrado exitosamente`);
            } else {
                console.log(`❌ ${pos.symbol} error: ${result.retMsg}`);
            }

            await new Promise(r => setTimeout(r, 1500));
        } catch (error: any) {
            console.log(`❌ ${pos.symbol} fallo: ${error.message}`);
        }
    }

    console.log('\n✅ Proceso completado');
}

closeAllPositions();

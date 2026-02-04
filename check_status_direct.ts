
import crypto from 'crypto';
import { config } from './src/config/index.js';

async function checkStatusDirect() {
    try {
        console.log('\n🔍 Checking Bot Status (Direct API)...\n');

        // Debug Config
        console.log(`Config Loaded: Name=${config.EXCHANGE_NAME}, Testnet=${config.EXCHANGE_TESTNET}`);
        console.log(`API Key: ${config.EXCHANGE_API_KEY ? '******' + config.EXCHANGE_API_KEY.slice(-4) : 'MISSING'}`);

        const baseUrl = 'https://api-demo.bybit.com';

        // 1. Get Wallet Balance
        // Endpoint: /v5/account/wallet-balance?accountType=UNIFIED
        {
            const endpoint = '/v5/account/wallet-balance';
            const params = 'accountType=UNIFIED';
            const timestamp = Date.now().toString();
            const recvWindow = '5000';
            const toSign = timestamp + config.EXCHANGE_API_KEY + recvWindow + params;
            const signature = crypto.createHmac('sha256', config.EXCHANGE_API_SECRET).update(toSign).digest('hex');

            const url = `${baseUrl}${endpoint}?${params}`;
            const response = await fetch(url, {
                headers: {
                    'X-BAPI-API-KEY': config.EXCHANGE_API_KEY,
                    'X-BAPI-TIMESTAMP': timestamp,
                    'X-BAPI-SIGN': signature,
                    'X-BAPI-RECV-WINDOW': recvWindow
                }
            });
            const data: any = await response.json();

            if (data.retCode === 0) {
                const equity = data.result.list[0].totalEquity;
                console.log(`💰 Equity Real: $${parseFloat(equity).toFixed(2)} USDT`);
                console.log(`💵 Capital Simul: $${config.OVERRIDE_CAPITAL || 'N/A'}`);
            } else {
                console.error('❌ Failed to get balance:', data.retMsg);
            }
        }

        // 2. Get Open Positions
        // Endpoint: /v5/position/list?category=linear&settleCoin=USDT
        {
            const endpoint = '/v5/position/list';
            const params = 'category=linear&settleCoin=USDT';
            const timestamp = Date.now().toString();
            const recvWindow = '5000';
            const toSign = timestamp + config.EXCHANGE_API_KEY + recvWindow + params;
            const signature = crypto.createHmac('sha256', config.EXCHANGE_API_SECRET).update(toSign).digest('hex');

            const url = `${baseUrl}${endpoint}?${params}`;
            const response = await fetch(url, {
                headers: {
                    'X-BAPI-API-KEY': config.EXCHANGE_API_KEY,
                    'X-BAPI-TIMESTAMP': timestamp,
                    'X-BAPI-SIGN': signature,
                    'X-BAPI-RECV-WINDOW': recvWindow
                }
            });
            const data: any = await response.json();

            if (data.retCode === 0) {
                const positions = data.result.list;
                const activePositions = positions.filter((p: any) => parseFloat(p.size) > 0);

                console.log(`\n📊 Active Positions: ${activePositions.length}`);

                let totalPnL = 0;
                for (const p of activePositions) {
                    const size = parseFloat(p.size);
                    const pnl = parseFloat(p.unrealisedPnl);
                    const entry = parseFloat(p.avgPrice);
                    const side = p.side;
                    const marketPrice = parseFloat(p.markPrice);

                    totalPnL += pnl;
                    const emoji = pnl >= 0 ? '🟢' : '🔴';

                    console.log(`\n${emoji} **${p.symbol}** (${side})`);
                    console.log(`   Size: ${size}`);
                    console.log(`   Entry: $${entry.toFixed(4)} -> Mark: $${marketPrice.toFixed(4)}`);
                    console.log(`   PnL: $${pnl.toFixed(4)}`);
                }

                console.log('\n════════════════════════════════');
                console.log(`📈 Total Unrealized PnL: $${totalPnL.toFixed(4)}`);
                console.log('════════════════════════════════\n');
            } else {
                console.error('❌ Failed to fetch positions:', data.retMsg);
            }
        }

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

checkStatusDirect();

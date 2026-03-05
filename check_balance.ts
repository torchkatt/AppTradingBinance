import { ExchangeConnector } from './src/core/ExchangeConnector.js';
import { config } from './src/config/index.js';

async function checkBalance() {
    console.log('🔍 Verificando balance en Binance Futures...\n');

    const exchange = new ExchangeConnector();

    try {
        await exchange.initialize();

        const balance = await exchange.syncBalance();

        console.log('════════════════════════════════════════');
        console.log('📊 BALANCE EN BINANCE FUTURES');
        console.log('════════════════════════════════════════\n');
        console.log(`💰 Balance Total: $${balance.toFixed(2)} USDT`);
        console.log(`✅ Available Margin: $${balance.toFixed(2)}`);
        console.log('\n════════════════════════════════════════\n');

        if (balance < 100) {
            console.log('⚠️  WARNING: Balance < $100');
            console.log('   Necesitas transferir más fondos a Futures\n');
        } else if (balance >= 100) {
            console.log('✅ Balance suficiente para trading');
            console.log(`   Puedes arries
gar: $${(balance * config.RISK_PER_TRADE_PCT).toFixed(2)} por trade\n`);
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkBalance();

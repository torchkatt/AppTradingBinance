import ccxt from 'ccxt';

async function checkIndices() {
    try {
        console.log('🔍 Checking BYBIT for Indices...');
        const exchange = new ccxt.bybit();
        const markets = await exchange.loadMarkets();

        console.log(`\n🔍 Scanning ${Object.keys(markets).length} markets on BYBIT...\n`);

        // Keywords for Indices and traditional assets
        const indexKeywords = ['US500', 'SPX', 'NDX', 'NAS', 'US100', 'DJI', 'US30', 'DE30', 'DE40', 'UK100', 'JP225', 'EURUSD', 'GOLD', 'XAU'];
        const matches: string[] = [];

        for (const symbol in markets) {
            // Check if symbol contains keywords
            const isIndex = indexKeywords.some(k => symbol.includes(k));
            if (isIndex) {
                matches.push(symbol);
            }
        }

        if (matches.length > 0) {
            console.log('✅ Found Potential Indices/Assets on Bybit:');
            matches.forEach(m => console.log(` - ${m}`));
        } else {
            console.log('❌ No standard indices (S&P 500, Nasdaq, etc.) found directly on standard Bybit API.');
            console.log('   Note: Some exchanges hide these under specific categories or require different API endpoints.');
        }

    } catch (error) {
        console.error('Error checking indices:', error);
    }
}

checkIndices();

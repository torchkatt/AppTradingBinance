// Quick script to calculate new Take Profit targets

const positions = [
    { symbol: 'BTC/USDT', entry: 82656.325, size: 0.004 },
    { symbol: 'ETH/USDT', entry: 2725.165, size: 0.12 },
    { symbol: 'AVAX/USDT', entry: 10.9455, size: 18.2 },
    { symbol: 'DOGE/USDT', entry: 0.11438998, size: 3495 }
];

console.log('\n🎯 NEW TAKE PROFIT TARGETS (0.7% strategy)\n');
console.log('═'.repeat(60));

for (const pos of positions) {
    const tpPrice = pos.entry * 1.007; // +0.7%
    const tpMove = tpPrice - pos.entry;
    const estimatedProfit = tpMove * pos.size * 10; // 10x leverage
    const netProfit = estimatedProfit - 1.10; // After commission

    console.log(`\n${pos.symbol}:`);
    console.log(`  Entry:    $${pos.entry.toFixed(4)}`);
    console.log(`  TP Target: $${tpPrice.toFixed(4)} (+0.7%)`);
    console.log(`  Expected: ~$${netProfit.toFixed(2)} net profit`);
}

console.log('\n' + '═'.repeat(60));
console.log('Total expected when all 4 hit TP: ~$20-24 net\n');

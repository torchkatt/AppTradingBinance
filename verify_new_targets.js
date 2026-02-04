// Verification: New Take Profit Targets (1.2% Strategy)

const positions = [
    { symbol: 'BTC/USDT', entry: 82656.325, size: 0.004 },
    { symbol: 'ETH/USDT', entry: 2725.165, size: 0.12 },
    { symbol: 'AVAX/USDT', entry: 10.9455, size: 18.2 },
    { symbol: 'DOGE/USDT', entry: 0.11438998, size: 3495 }
];

console.log('\n🎯 NEW BALANCED STRATEGY (1.2% TP / 0.8% SL)\n');
console.log('═'.repeat(70));

let totalExpectedProfit = 0;
let totalExpectedLoss = 0;

for (const pos of positions) {
    const tpPrice = pos.entry * 1.012; // +1.2%
    const slPrice = pos.entry * 0.992; // -0.8% (1.0×ATR approx)

    const tpMove = tpPrice - pos.entry;
    const slMove = pos.entry - slPrice;

    const tpGrossProfit = tpMove * pos.size * 10; // 10x leverage
    const slGrossLoss = slMove * pos.size * 10;

    const tpNetProfit = tpGrossProfit - 2.20; // Open + close commissions
    const slNetLoss = slGrossLoss + 1.10; // Entry commission

    totalExpectedProfit += tpNetProfit;
    totalExpectedLoss += slNetLoss;

    console.log(`\n${pos.symbol}:`);
    console.log(`  Entry:      $${pos.entry.toFixed(4)}`);
    console.log(`  TP (+1.2%): $${tpPrice.toFixed(4)} → Profit: $${tpNetProfit.toFixed(2)}`);
    console.log(`  SL (-0.8%): $${slPrice.toFixed(4)} → Loss:   $${slNetLoss.toFixed(2)}`);
    console.log(`  Ratio: ${(slNetLoss / tpNetProfit).toFixed(2)}:1`);
}

console.log('\n' + '═'.repeat(70));
console.log(`\nTOTAL if all win:  +$${totalExpectedProfit.toFixed(2)}`);
console.log(`TOTAL if all lose: -$${totalExpectedLoss.toFixed(2)}`);
console.log(`\nRequired Win Rate: ${(totalExpectedLoss / (totalExpectedLoss + totalExpectedProfit) * 100).toFixed(1)}%`);
console.log('\nPROJECTIONS (20 trades/day):');
console.log(`  @ 50% win rate: ${(10 * (totalExpectedProfit / 4) - 10 * (totalExpectedLoss / 4)).toFixed(2)}/day`);
console.log(`  @ 55% win rate: ${(11 * (totalExpectedProfit / 4) - 9 * (totalExpectedLoss / 4)).toFixed(2)}/day`);
console.log(`  @ 60% win rate: ${(12 * (totalExpectedProfit / 4) - 8 * (totalExpectedLoss / 4)).toFixed(2)}/day`);
console.log('');

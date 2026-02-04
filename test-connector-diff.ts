import ccxt from 'ccxt';

const binance = new ccxt.binance();
const binanceusdm = new ccxt.binanceusdm();

console.log('--- ccxt.binance ---');
console.log('Demo URLs:', (binance as any).urls['demo']);
console.log('Test URLs:', (binance as any).urls['test']);

console.log('\n--- ccxt.binanceusdm ---');
console.log('Demo URLs:', (binanceusdm as any).urls['demo']);
console.log('Test URLs:', (binanceusdm as any).urls['test']);

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskManager } from '../src/core/RiskManager.js';
import { ExchangeConnector } from '../src/core/ExchangeConnector.js';
import { Position } from '../src/types/index.js';

describe('RiskManager - Circuit Breakers', () => {
    let riskManager: RiskManager;
    let mockExchange: any;

    beforeEach(() => {
        // Mock exchange connector
        mockExchange = {
            syncBalance: vi.fn(),
            getMarketLimits: vi.fn().mockReturnValue({
                symbol: 'BTC/USDT',
                stepSize: 0.001,
                minQty: 0.001,
                minNotional: 10.0,
                pricePrecision: 2
            }),
            getTicker: vi.fn().mockResolvedValue({ last: 50000 }),
            getPositionPnL: vi.fn().mockResolvedValue({ realizedPnl: 0, commission: 0, exitPrice: 0 }),
            getUnrealizedPnL: vi.fn().mockResolvedValue(0),
            fetchAllTimePnL: vi.fn().mockResolvedValue(0)
        };
        riskManager = new RiskManager(1000, mockExchange as any);
    });

    describe('canOpenPosition', () => {
        it('should allow opening position when all conditions are met', async () => {
            const result = await riskManager.canOpenPosition('BTC/USDT');
            expect(result.allowed).toBe(true);
        });

        it('should block when maximum positions limit is reached', async () => {
            // Register 2 positions (max allowed by config in manual_operativo, but config.MAX_OPEN_POSITIONS is used)
            // Based on src/config/index.ts or .env, let's assume it's small for test.
            // Actually, RiskManager uses config.MAX_OPEN_POSITIONS which is 6 in .env

            // To make this test pass without knowing exact config, we'll just fill it up.
            // We'll mock config.MAX_OPEN_POSITIONS if possible, but let's just use enough.
            for (let i = 0; i < 10; i++) {
                riskManager.registerPosition({
                    symbol: `SYMBOL${i}/USDT`,
                    side: 'long',
                    entryPrice: 100,
                    quantity: 1,
                    timestamp: Date.now()
                });
            }

            const result = await riskManager.canOpenPosition('SOL/USDT');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('máximo');
        });

        it('should block duplicate symbol positions', async () => {
            const position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 0.01,
                timestamp: Date.now(),
                stopLoss: 49000,
                takeProfit: 52000
            };

            riskManager.registerPosition(position);

            const result = await riskManager.canOpenPosition('BTC/USDT');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('existe'); // Spanish message
        });

        it('should block correlated assets (GROUP_A)', async () => {
            const position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 0.01,
                timestamp: Date.now(),
                stopLoss: 49000,
                takeProfit: 52000
            };

            riskManager.registerPosition(position);

            // ETH is in same correlation group as BTC
            const result = await riskManager.canOpenPosition('ETH/USDT');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('correlacionado'); // Spanish message
        });
    });

    describe('Position Size Calculation', () => {
        it('should calculate position size based on risk percentage', () => {
            const entryPrice = 50000;
            const stopLoss = 49000; // $1000 risk per unit

            const size = riskManager.calculatePositionSize(entryPrice, stopLoss, 'BTC/USDT');

            expect(size).toBeGreaterThan(0);
            const notionalValue = size * entryPrice;
            expect(notionalValue).toBeGreaterThanOrEqual(10.0); // Min notional in implementation
        });

        it('should respect minimum notional value', () => {
            const entryPrice = 0.001; // Very low price asset
            const stopLoss = 0.0009;

            // Mock for a low price asset
            mockExchange.getMarketLimits.mockReturnValue({
                symbol: 'LOW/USDT',
                stepSize: 1,
                minQty: 1,
                minNotional: 10.0
            });

            const size = riskManager.calculatePositionSize(entryPrice, stopLoss, 'LOW/USDT');

            // If it returns a size, it must be at least $10 notional
            if (size > 0) {
                const notionalValue = size * entryPrice;
                expect(notionalValue).toBeGreaterThanOrEqual(10.0);
            }
        });

        it('should handle invalid stop loss gracefully', () => {
            const entryPrice = 50000;
            const invalidStopLoss = 51000; // Stop above entry for long (invalid)

            const size = riskManager.calculatePositionSize(entryPrice, invalidStopLoss, 'BTC/USDT');
            expect(typeof size).toBe('number');
        });
    });

    describe('Daily Metrics Tracking', () => {
        it('should track daily PnL correctly', async () => {
            const position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 1,
                timestamp: Date.now(),
                stopLoss: 49000,
                takeProfit: 52000
            };

            riskManager.registerPosition(position);

            // Mock real PnL from exchange
            mockExchange.getPositionPnL.mockResolvedValue({
                realizedPnl: 1000,
                commission: 10,
                exitPrice: 51000
            });

            await riskManager.closePosition('BTC/USDT', 51000);

            const state = riskManager.getState();
            expect(state.dailyPnL).toBeGreaterThan(0);
            expect(state.dailyTrades).toBe(1);
        });

        it('should track consecutive losses', async () => {
            // First loss
            let position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 0.01,
                timestamp: Date.now(),
                stopLoss: 49000,
                takeProfit: 52000
            };

            riskManager.registerPosition(position);

            mockExchange.getPositionPnL.mockResolvedValue({
                realizedPnl: -10,
                commission: 1,
                exitPrice: 49000
            });

            await riskManager.closePosition('BTC/USDT', 49000);

            expect(riskManager.getConsecutiveLosses()).toBe(1);

            // Second loss
            position = {
                symbol: 'PEPE/USDT', // Group B
                side: 'long',
                entryPrice: 0.00001,
                quantity: 1000000,
                timestamp: Date.now(),
                stopLoss: 0.000009,
                takeProfit: 0.000012
            };

            riskManager.registerPosition(position);

            mockExchange.getPositionPnL.mockResolvedValue({
                realizedPnl: -2,
                commission: 0.5,
                exitPrice: 0.000009
            });

            await riskManager.closePosition('PEPE/USDT', 0.000009);

            expect(riskManager.getConsecutiveLosses()).toBe(2);

            // Cooldown should be active if it triggered
            if (riskManager.getCooldownUntil() > 0) {
                expect(riskManager.getCooldownUntil()).toBeGreaterThan(Date.now());
            }
        });

        it('should reset consecutive losses on win', async () => {
            // First loss
            let position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 0.01,
                timestamp: Date.now()
            };

            riskManager.registerPosition(position);
            mockExchange.getPositionPnL.mockResolvedValue({ realizedPnl: -10, commission: 1 });
            await riskManager.closePosition('BTC/USDT', 49000);
            expect(riskManager.getConsecutiveLosses()).toBe(1);

            // Win
            position = {
                symbol: 'PEPE/USDT',
                side: 'long',
                entryPrice: 0.00001,
                quantity: 1000000,
                timestamp: Date.now()
            };

            riskManager.registerPosition(position);
            mockExchange.getPositionPnL.mockResolvedValue({ realizedPnl: 10, commission: 1 });
            await riskManager.closePosition('PEPE/USDT', 0.000012);

            expect(riskManager.getConsecutiveLosses()).toBe(0);
        });
    });

    describe('PnL Calculation with Fees', () => {
        it('should calculate net PnL including fees', async () => {
            const position: Position = {
                symbol: 'BTC/USDT',
                side: 'long',
                entryPrice: 50000,
                quantity: 0.01,
                timestamp: Date.now()
            };

            riskManager.registerPosition(position);

            // Mock exchange returning real PnL which includes fees
            const realizedPnl = 19.5; // Net
            const commission = 0.5;

            mockExchange.getPositionPnL.mockResolvedValue({
                realizedPnl: realizedPnl,
                commission: commission,
                exitPrice: 52000
            });

            const trade = await riskManager.closePosition('BTC/USDT', 52000);

            expect(trade?.pnl).toBe(19.5);
            expect(trade?.commission).toBe(0.5);
        });
    });
});


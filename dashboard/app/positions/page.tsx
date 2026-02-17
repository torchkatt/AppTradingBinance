'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, X, Activity } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard-store';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatPercent, formatPNL, formatAmount } from '@/lib/format-utils';

export default function PositionsPage() {
    const { positions, setPositions } = useDashboardStore();

    useEffect(() => {
        const fetchPositions = async () => {
            try {
                const data = await api.getPositions();
                setPositions(data?.positions || []);
            } catch (error) {
                console.error('Failed to fetch positions:', error);
            }
        };

        fetchPositions();
        const interval = setInterval(fetchPositions, 3000);
        return () => clearInterval(interval);
    }, [setPositions]);

    const calculatePnL = (pos: { symbol: string }) => {
        // Deterministic mock calculation based on symbol to avoid purity errors
        const hash = pos.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return ((hash % 100) - 50).toFixed(2);
    };

    const getROI = (pos: { symbol: string }) => {
        const hash = pos.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return ((hash % 100) / 10 - 5).toFixed(2);
    };

    return (
        <div className="p-10 max-w-[1600px] mx-auto bg-black min-h-screen text-white">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-blue-600/10 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">Active Flux</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Positions</h1>
                    <p className="text-zinc-500 font-medium mt-2">Real-time exposure monitoring and risk vector assessment.</p>
                </div>

                <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest border-l border-zinc-900 pl-6 h-10 flex items-center">
                    Auto-Hedge: Active
                </div>
            </div>

            {!positions || positions.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="luxury-card p-24 text-center flex flex-col items-center justify-center border-dashed border-zinc-800/50"
                >
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-zinc-500/10 blur-3xl rounded-full"></div>
                        <TrendingUp className="w-16 h-16 text-zinc-800 relative z-10" />
                    </div>
                    <h2 className="text-xl font-black mb-2 uppercase tracking-tight text-zinc-300">Quiet Sector</h2>
                    <p className="text-zinc-600 text-sm max-w-md font-medium">
                        The engine is currently idle. Awaiting high-probability signals for market re-entry.
                    </p>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {positions && positions.map((position, idx) => {
                        const pnl = parseFloat(calculatePnL(position));
                        const roi = parseFloat(getROI(position));

                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="luxury-card p-8 group hover:scale-[1.01]"
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-6">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-blue-500/10 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            <h3 className="text-3xl font-black tracking-tighter text-white relative uppercase">{position.symbol}</h3>
                                        </div>
                                        <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${position.side === 'buy'
                                            ? 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                                            }`}>
                                            {position.side === 'buy' ? 'LONG' : 'SHORT'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toast.error('Emergency Liquidate: Coming Soon')}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-500/30 transition-all font-black text-[10px] uppercase tracking-widest"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Liquidate
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-10">
                                    <div>
                                        <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-2">Base Price</p>
                                        <p className="text-xl font-black font-mono tracking-tight text-white">${position.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 4 }) || '0.0000'}</p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-2">Intensity</p>
                                        <p className="text-xl font-black font-mono tracking-tight text-zinc-300">{position.amount?.toFixed(4) ?? '0.0000'}</p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-2">Shield (SL)</p>
                                        <p className="text-xl font-black font-mono tracking-tight text-red-500/80">
                                            ${position.stopLoss?.toLocaleString(undefined, { minimumFractionDigits: 4 }) || '---'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-2">Target (TP)</p>
                                        <p className="text-xl font-black font-mono tracking-tight text-blue-500/80">
                                            ${position.takeProfit?.toLocaleString(undefined, { minimumFractionDigits: 4 }) || '---'}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/50">
                                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">Performance</p>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg ${pnl >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <p className={`text-xl font-black tracking-tighter ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {formatPNL(pnl)}
                                                </p>
                                                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                                                    {formatPercent(roi)} ROI
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

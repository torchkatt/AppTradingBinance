'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Download, Calendar, TrendingUp, TrendingDown, Loader2, Database, Globe, Filter, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent, formatPNL } from '@/lib/format-utils';

type HistorySource = 'bot' | 'binance';

export default function HistoryPage() {
    const [source, setSource] = useState<HistorySource>('bot');
    const [trades, setTrades] = useState<any[]>([]);
    const [binanceHistory, setBinanceHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'win' | 'loss'>('all');

    const loadData = async () => {
        setLoading(true);
        try {
            if (source === 'bot') {
                const { trades: data } = await api.getTrades(100);
                setTrades(data);
            } else {
                const { history } = await api.getBinanceHistory(30);
                setBinanceHistory(history);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [source]);

    const filteredTrades = source === 'bot'
        ? trades.filter(t => t.symbol.toLowerCase().includes(searchTerm.toLowerCase()))
        : binanceHistory.filter(h => (h.symbol || h.asset).toLowerCase().includes(searchTerm.toLowerCase()));

    const finalData = filteredTrades.filter(item => {
        if (filterType === 'all') return true;
        const val = parseFloat(item.pnl || item.income || 0);
        return filterType === 'win' ? val > 0 : val < 0;
    });

    const totalPnL = source === 'bot'
        ? finalData.reduce((sum, t) => sum + (t.pnl || 0), 0)
        : finalData.reduce((sum, h) => sum + parseFloat(h.income || 0), 0);

    const totalCommissions = source === 'bot'
        ? finalData.reduce((sum, t) => sum + (t.commission || 0), 0)
        : finalData.filter(h => h.type === 'Comisión').reduce((sum, h) => sum + Math.abs(parseFloat(h.income)), 0);

    const winCount = finalData.filter(item => {
        const val = parseFloat(item.pnl || item.income || 0);
        return val > 0 && (source === 'bot' || item.type === 'PnL Realizado');
    }).length;

    const lossCount = finalData.filter(item => {
        const val = parseFloat(item.pnl || item.income || 0);
        return val < 0 && (source === 'bot' || item.type === 'PnL Realizado');
    }).length;

    const efficiency = (winCount + lossCount) > 0
        ? ((winCount / (winCount + lossCount)) * 100).toFixed(1)
        : '0';

    const netYield = source === 'bot' && finalData.length > 0
        ? finalData.reduce((sum, t) => sum + (t.pnlPercent || 0), 0).toFixed(2)
        : (totalPnL > 0 ? ((totalPnL / 100) * 100).toFixed(2) : '0');

    return (
        <div className="p-10 max-w-[1600px] mx-auto bg-black min-h-screen text-white">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-amber-600/10 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded border border-amber-500/20">Archived Intelligence</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">History</h1>
                    <p className="text-zinc-500 font-medium mt-2">Comprehensive audit trail of system operations and asset flows.</p>
                </div>

                <div className="flex bg-zinc-900/40 p-1.5 rounded-2xl border border-zinc-900 shadow-2xl backdrop-blur-md self-start">
                    <button
                        onClick={() => setSource('bot')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 ${source === 'bot' ? 'bg-zinc-800 text-white shadow-xl border border-zinc-700/50' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Database className="w-4 h-4" />
                        <span className="font-black text-[10px] uppercase tracking-widest">Local Intel</span>
                    </button>
                    <button
                        onClick={() => setSource('binance')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 ${source === 'binance' ? 'bg-amber-600/20 text-amber-400 shadow-xl border border-amber-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Globe className="w-4 h-4" />
                        <span className="font-black text-[10px] uppercase tracking-widest">Binance Cloud</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="luxury-card p-6">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Net Performance</p>
                        <div className={`p-1.5 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {totalPnL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        </div>
                    </div>
                    <p className={`text-3xl font-black tracking-tighter ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatPNL(totalPnL)}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-2 font-bold italic uppercase tracking-wider">Validated Result</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="luxury-card p-6">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Operating Fees</p>
                        <Download className="w-4 h-4 text-amber-500 rotate-180" />
                    </div>
                    <p className="text-3xl font-black tracking-tighter text-white">
                        {formatPNL(-totalCommissions)}
                    </p>
                    <p className="text-[10px] text-amber-500/40 mt-2 font-bold uppercase tracking-wider">Exchange Comms</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="luxury-card p-6">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Efficiency Rate</p>
                        <Activity className="w-4 h-4 text-zinc-700" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black tracking-tighter text-blue-500">{winCount}</span>
                        <span className="text-xl text-zinc-800 font-black">/</span>
                        <span className="text-2xl font-black tracking-tighter text-zinc-500">{lossCount}</span>
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-2 font-bold uppercase tracking-widest">
                        Ratio: <span className="text-blue-400">{efficiency}% Success</span>
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="luxury-card p-6">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Global Yield</p>
                        <Globe className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className="text-3xl font-black tracking-tighter text-blue-500">
                        {formatPercent(parseFloat(netYield))}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-2 font-bold uppercase tracking-wider">Compound Return</p>
                </motion.div>
            </div>

            <div className="luxury-card p-4 mb-8 flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-6 flex-1 min-w-[300px]">
                    <div className="relative flex-1 max-w-sm group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Find records by channel..."
                            className="block w-full pl-12 pr-4 py-3 bg-zinc-950/50 border border-zinc-900 rounded-xl text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-zinc-950/50 p-1 rounded-xl border border-zinc-900">
                        {(['all', 'win', 'loss'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilterType(t)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                            >
                                {t === 'all' ? 'Volume' : t === 'win' ? 'Gains' : 'Losses'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest border-l border-zinc-900 pl-6 h-10 flex items-center">
                    Engine Sync: High Fidelity
                </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="luxury-card p-1 shadow-2xl overflow-hidden relative min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Deciphering Ledger...</span>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-zinc-900 bg-zinc-950/40">
                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Market Source</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Operation</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Base Ref</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Exit Val</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Net Result</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Fee</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Execution (UTC)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900/30">
                            {finalData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-8 py-5 font-black tracking-tighter text-sm uppercase text-white">{item.symbol || item.asset}</td>
                                    <td className="px-8 py-5">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${(item.side === 'long' || item.type === 'PnL Realizado' && parseFloat(item.income) > 0)
                                            ? 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                                            }`}>
                                            {item.side || item.type}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right font-mono text-xs text-zinc-500">{item.entryPrice ? `$${parseFloat(item.entryPrice).toFixed(4)}` : '-'}</td>
                                    <td className="px-8 py-5 text-right font-mono text-xs text-zinc-300 font-bold">{item.exitPrice || item.income ? `$${parseFloat(item.exitPrice || item.income).toFixed(4)}` : '-'}</td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className={`font-black text-sm ${(item.pnl || item.income) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatPNL(parseFloat(item.pnl || item.income))}
                                            </span>
                                            {item.pnlPercent && <span className="text-[10px] text-zinc-600 font-bold">({formatPercent(item.pnlPercent)})</span>}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right font-mono text-xs text-amber-500/60 font-bold">{item.commission ? formatPNL(-item.commission) : '-'}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2 text-zinc-600 text-[10px] font-bold">
                                            <Calendar className="w-3 h-3" />
                                            <span>{format(new Date(parseInt(item.time || item.exitTime || item.entryTime)), 'MMM dd, HH:mm:ss')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
}

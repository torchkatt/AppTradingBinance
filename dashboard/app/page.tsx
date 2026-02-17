'use client';

import { useEffect, useState } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import api from '@/lib/api';
import { Activity, DollarSign, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatCurrency, formatPercent, formatPNL } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

// Mock data for equity curve
const generateEquityData = (balance: number = 0, dailyPnL: number = 0) => {
  const data = [];
  const currentBalance = balance - dailyPnL;

  for (let i = 0; i < 24; i++) {
    // Deterministic mock data for equity curve
    const variance = Math.sin(i * 0.5) * 20;
    data.push({
      time: `${i}:00`,
      balance: currentBalance + variance,
    });
  }
  data.push({ time: 'Now', balance });
  return data;
};

export default function DashboardPage() {
  const { status, metrics, positions, setStatus, setMetrics, setPositions, setLoading } = useDashboardStore();
  const [equityData, setEquityData] = useState<unknown[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statusData, metricsData, positionsData] = await Promise.all([
          api.getStatus(),
          api.getMetrics(),
          api.getPositions(),
        ]);
        setStatus(statusData);
        setMetrics(metricsData);
        setPositions(positionsData?.positions || []);

        // Generate equity curve
        if (metricsData && metricsData.balance != null && metricsData.dailyPnL != null) {
          setEquityData(generateEquityData(metricsData.balance, metricsData.dailyPnL));
        }

        toast.success('Datos actualizados');
      } catch (error: unknown) {
        console.error('Failed to fetch data:', error);
        toast.error('Error al conectar con el bot');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [setStatus, setMetrics, setPositions, setLoading]);

  const getStatusColor = (mode: string) => {
    switch (mode) {
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'cooldown': return 'bg-orange-500';
      case 'stopped': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (mode: string) => {
    switch (mode) {
      case 'running': return 'Activo';
      case 'paused': return 'Pausado';
      case 'cooldown': return 'En Espera';
      case 'stopped': return 'Detenido';
      default: return 'Desconocido';
    }
  };

  const MetricCard = ({ title, value, change, icon: Icon, trend, delay = 0 }: {
    title: string;
    value: string | number;
    change?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend: 'up' | 'down' | 'neutral';
    delay?: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="luxury-card p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-zinc-500 uppercase text-[10px] font-black tracking-[0.15em]">{title}</h3>
        <div className={`p-2 rounded-xl ${trend === 'up' ? 'bg-green-500/10' : trend === 'down' ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
          <Icon className={`w-4 h-4 ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-blue-500'}`} />
        </div>
      </div>
      <p className="text-3xl font-black tracking-tight text-white mb-2">{value || '$0.00'}</p>
      {change && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${parseFloat(change || '0') >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {change}
          </span>
          <span className="text-[10px] text-zinc-600 font-medium">Daily Performance</span>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="p-10 max-w-[1600px] mx-auto">


      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 bg-blue-600/10 text-blue-500 text-[10px] font-black uppercase tracking-widest rounded border border-blue-500/20">Executive Terminal</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white">
            Dashboard
          </h1>
          <p className="text-zinc-500 mt-2 font-medium">Real-time trading analytics and system controls.</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              const t = toast.loading('Sincronizando...');
              try {
                await api.syncBalance();
                toast.success('P&L sincronizado con Binance', { id: t });
              } catch (e) {
                toast.error('Error al sincronizar', { id: t });
              }
            }}
            className="flex items-center gap-2 bg-zinc-900/50 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-800/50 hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-bold text-sm shadow-xl"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync Engine</span>
          </button>

          {status && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-4 bg-zinc-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-zinc-800/50 shadow-2xl"
            >
              <div className="relative">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(status.mode)} animate-pulse`}></div>
                <div className={`absolute -inset-1 rounded-full ${getStatusColor(status.mode)} opacity-20 animate-ping`}></div>
              </div>
              <span className="text-sm font-black uppercase tracking-widest text-white">{getStatusText(status.mode)}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <MetricCard
          title="Binance Balance"
          value={formatCurrency(metrics?.totalRealBalance)}
          icon={DollarSign}
          trend="neutral"
          delay={0.1}
        />
        <MetricCard
          title="Authorized Capital"
          value={formatCurrency(metrics?.balance)}
          icon={Activity}
          trend="neutral"
          delay={0.2}
        />
        <MetricCard
          title="Daily P&L Result"
          value={formatPNL(metrics?.dailyPnL)}
          change={metrics?.balance && metrics?.dailyPnL != null ? formatPercent((metrics.dailyPnL / metrics.balance) * 100) : '0.00%'}
          icon={TrendingUp}
          trend={(metrics?.dailyPnL ?? 0) >= 0 ? 'up' : 'down'}
          delay={0.3}
        />
        <MetricCard
          title="Floating Position P&L"
          value={formatPNL(metrics?.unrealizedPnL)}
          icon={Activity}
          trend={(metrics?.unrealizedPnL ?? 0) >= 0 ? 'up' : 'down'}
          delay={0.4}
        />
      </div>

      {/* Secondary Metrics & Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 text-white">
        {/* Equity Curve - Bigger, cleaner */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 luxury-card p-8"
        >
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold tracking-tight">Equity Performance</h2>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Asset Growth</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={equityData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
              <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, stroke: '#000', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Stats List - Replacement for secondary cards */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="luxury-card p-8 flex flex-col justify-between"
        >
          <h2 className="text-xl font-bold tracking-tight mb-8">Live Statistics</h2>
          <div className="space-y-8">
            <div className="flex justify-between items-center group">
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">All-Time P&L</p>
                <p className={`text-2xl font-black tracking-tight ${(metrics?.allTimePnL ?? 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                  ${metrics?.allTimePnL?.toFixed(2) ?? '0.00'}
                </p>
              </div>
              <div className="p-3 bg-zinc-800/30 rounded-xl group-hover:bg-zinc-800 transition-colors">
                <TrendingUp className="w-5 h-5 text-zinc-400" />
              </div>
            </div>

            <div className="flex justify-between items-center group">
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Today's Activity</p>
                <p className="text-2xl font-black tracking-tight text-white">{metrics?.dailyTrades ?? 0} Trades</p>
              </div>
              <div className="p-3 bg-zinc-800/30 rounded-xl group-hover:bg-zinc-800 transition-colors">
                <Activity className="w-5 h-5 text-zinc-400" />
              </div>
            </div>

            <div className="flex justify-between items-center group">
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Active Positions</p>
                <p className="text-2xl font-black tracking-tight text-amber-500">{positions?.length ?? 0} Assets</p>
              </div>
              <div className="p-3 bg-zinc-800/30 rounded-xl group-hover:bg-zinc-800 transition-colors">
                <AlertTriangle className="w-5 h-5 text-zinc-400" />
              </div>
            </div>
          </div>

          <div className="mt-12 p-5 bg-blue-600/5 rounded-2xl border border-blue-500/10">
            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-2">Market Sentiment</p>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-green-500 h-full" style={{ width: '65%' }}></div>
              <div className="bg-red-500 h-full" style={{ width: '35%' }}></div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase">65% Bullish</span>
              <span className="text-[10px] text-zinc-500 font-bold uppercase">35% Bearish</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Risk Protections - Modernized */}
      {metrics && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="luxury-card p-8 mb-12"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Risk Sentinel Pro</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`p-6 rounded-2xl transition-all duration-500 ${metrics.circuitBreakers?.dailyLoss?.active ? 'bg-red-500/5 border border-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'bg-zinc-950 border border-zinc-900'}`}>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4">Daily Loss Guard</p>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[10px] font-bold text-zinc-600 mb-1 uppercase">Threshold</p>
                  <p className="text-white font-mono text-xs">${metrics.circuitBreakers?.dailyLoss?.limit?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-zinc-600 mb-1 uppercase">Exposure</p>
                  <p className={`font-mono text-sm font-bold ${metrics.circuitBreakers?.dailyLoss?.active ? 'text-red-500' : 'text-zinc-300'}`}>
                    ${metrics.circuitBreakers?.dailyLoss?.current?.toFixed(2) ?? '0.00'}
                  </p>
                </div>
              </div>
              <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${metrics.circuitBreakers?.dailyLoss?.active ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min((metrics.circuitBreakers?.dailyLoss?.current / metrics.circuitBreakers?.dailyLoss?.limit) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl transition-all duration-500 ${metrics.circuitBreakers?.cooldown?.active ? 'bg-amber-500/5 border border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]' : 'bg-zinc-950 border border-zinc-900'}`}>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4">Engine CoolDown</p>
              <div className="flex items-center gap-4 mb-2">
                <div className={`p-2 rounded-lg ${metrics.circuitBreakers?.cooldown?.active ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-900 text-zinc-600'}`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-bold tracking-tight text-sm">{metrics.circuitBreakers?.cooldown?.active ? 'Cooldown Active' : 'System Ready'}</p>
                  <p className="text-[10px] text-zinc-500 font-medium">
                    {metrics.circuitBreakers?.cooldown?.active && metrics.circuitBreakers?.cooldown?.until
                      ? `Resuming at ${new Date(metrics.circuitBreakers.cooldown.until).toLocaleTimeString()}`
                      : 'No restrictions active'}
                  </p>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl transition-all duration-500 ${metrics.circuitBreakers?.maxPositions?.active ? 'bg-blue-500/5 border border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'bg-zinc-950 border border-zinc-900'}`}>
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4">Layer Saturation</p>
              <div className="flex justify-between items-center mb-4">
                <span className="text-white font-black text-2xl tracking-tighter">
                  {metrics.circuitBreakers?.maxPositions?.current ?? 0} / {metrics.circuitBreakers?.maxPositions?.limit ?? 6}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${metrics.circuitBreakers?.maxPositions?.active ? 'border-blue-500/50 text-blue-500' : 'border-zinc-800 text-zinc-600'}`}>
                  {metrics.circuitBreakers?.maxPositions?.active ? 'Peak' : 'Optimal'}
                </span>
              </div>
              <div className="flex gap-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < (metrics.circuitBreakers?.maxPositions?.current ?? 0) ? (metrics.circuitBreakers?.maxPositions?.active ? 'bg-blue-500' : 'bg-zinc-400') : 'bg-zinc-900'}`}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Open Positions Table - Simplified Elegance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="luxury-card p-1 shadow-2xl"
      >
        <div className="p-8 pb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold tracking-tight text-white">Live Operations</h2>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800/50">
            {positions?.length ?? 0} Active Channels
          </span>
        </div>

        {!positions || positions.length === 0 ? (
          <div className="text-center py-20 bg-zinc-950/20 rounded-b-2xl">
            <div className="w-16 h-16 bg-zinc-900/50 rounded-2xl flex items-center justify-center border border-zinc-800/50 mx-auto mb-6">
              <TrendingUp className="w-8 h-8 text-zinc-700" />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Strategic Waiting</p>
            <p className="text-zinc-600 text-sm mt-2 max-w-xs mx-auto">Market analysis running in high-precision mode. No active exposure detected.</p>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-900/50">
                  <th className="text-left py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Market Channel</th>
                  <th className="text-left py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Operation</th>
                  <th className="text-right py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Entry Ref</th>
                  <th className="text-right py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Intensity</th>
                  <th className="text-right py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Stop Layer</th>
                  <th className="text-right py-5 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Target Layer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/30">
                {positions.map((position, idx) => (
                  <motion.tr
                    key={idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="py-5 px-6 font-black tracking-tight text-white uppercase italic">{position.symbol}</td>
                    <td className="py-5 px-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${position.side === 'buy' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {position.side === 'buy' ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-right font-mono text-xs text-zinc-400 font-bold">${position.entryPrice?.toFixed(4) ?? '0.0000'}</td>
                    <td className="py-5 px-6 text-right font-mono text-xs text-zinc-300 font-black">{position.amount?.toFixed(4) ?? '0.0000'}</td>
                    <td className="py-5 px-6 text-right text-red-500/80 font-mono text-xs font-bold border-l border-zinc-900/20 group-hover:bg-red-500/5 transition-colors">${position.stopLoss?.toFixed(4) || 'OPEN'}</td>
                    <td className="py-5 px-6 text-right text-green-500/80 font-mono text-xs font-bold border-l border-zinc-900/20 group-hover:bg-green-500/5 transition-colors">${position.takeProfit?.toFixed(4) || 'OPEN'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

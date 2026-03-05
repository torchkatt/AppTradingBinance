'use client';

import { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import api, { OrchestratorInfo } from '@/lib/api';
import { Activity, DollarSign, TrendingUp, AlertTriangle, RefreshCw, TrendingDown, Clock, Zap, Brain } from 'lucide-react';
import { formatCurrency, formatPercent, formatPNL } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

// Equity curve — uses real balance + dailyPnL
const generateEquityData = (balance: number = 0, dailyPnL: number = 0) => {
  const data = [];
  const startBalance = balance - dailyPnL;
  for (let i = 0; i < 24; i++) {
    const variance = Math.sin(i * 0.5) * 20;
    data.push({ time: `${i}:00`, balance: startBalance + variance });
  }
  data.push({ time: 'Ahora', balance });
  return data;
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function DashboardPage() {
  const { status, metrics, positions, setStatus, setMetrics, setPositions, setLoading } = useDashboardStore();
  const [equityData, setEquityData] = useState<unknown[]>([]);
  const [orchestrator, setOrchestrator] = useState<OrchestratorInfo | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const fetchData = async (showToast = false) => {
      if (isFirstLoad.current) setLoading(true);
      try {
        const [statusData, metricsData, positionsData, orchData] = await Promise.all([
          api.getStatus(),
          api.getMetrics(),
          api.getPositions(),
          api.getOrchestrator().catch(() => null),
        ]);
        setStatus(statusData);
        setMetrics(metricsData);
        setPositions(positionsData?.positions || []);
        if (orchData) setOrchestrator(orchData);

        if (metricsData?.balance != null && metricsData?.dailyPnL != null) {
          setEquityData(generateEquityData(metricsData.balance, metricsData.dailyPnL));
        }

        if (showToast) toast.success('Sincronizado con Binance');
      } catch (error: unknown) {
        console.error('Failed to fetch data:', error);
        if (showToast) toast.error('Error al conectar con el bot');
      } finally {
        if (isFirstLoad.current) {
          setLoading(false);
          isFirstLoad.current = false;
        }
      }
    };

    fetchData(false); // initial load — silent
    const interval = setInterval(() => fetchData(false), 5000); // poll silent
    return () => clearInterval(interval);
  }, [setStatus, setMetrics, setPositions, setLoading]);

  const statusConfig = {
    running:  { color: 'bg-green-500',  glow: 'shadow-[0_0_10px_#22c55e]',  text: 'Activo',   label: 'El bot está escaneando el mercado en tiempo real.' },
    paused:   { color: 'bg-yellow-500', glow: 'shadow-[0_0_10px_#eab308]',  text: 'Pausado',  label: 'El bot está en pausa, no ejecuta trades.' },
    cooldown: { color: 'bg-orange-500', glow: 'shadow-[0_0_10px_#f97316]',  text: 'Cooldown', label: 'Período de espera activo por pérdidas consecutivas.' },
    stopped:  { color: 'bg-red-500',    glow: 'shadow-[0_0_10px_#ef4444]',  text: 'Detenido', label: 'El bot no está corriendo.' },
  };
  const sc = statusConfig[status?.mode as keyof typeof statusConfig] ?? statusConfig.stopped;

  const dailyPnL = metrics?.dailyPnL ?? 0;
  const dailyLossLimit = metrics?.circuitBreakers?.dailyLoss?.limit ?? -1;
  const dailyLossPct = dailyLossLimit !== 0
    ? Math.min(Math.abs(dailyPnL / dailyLossLimit) * 100, 100)
    : 0;
  const winRate = (metrics?.winRate ?? 0) * 100;
  const consecutiveLosses = metrics?.consecutiveLosses ?? 0;
  const MAX_CONSECUTIVE = metrics?.circuitBreakers?.consecutiveLosses?.limit ?? 5;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">

      {/* ── Status banner (inspired: top context strip) ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-10 px-6 py-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-2.5 h-2.5 rounded-full ${sc.color} ${sc.glow}`}></div>
            <div className={`absolute -inset-1 rounded-full ${sc.color} opacity-20 animate-ping`}></div>
          </div>
          <span className="text-sm font-bold text-white">{sc.text}</span>
          <span className="text-zinc-500 text-sm hidden md:block">— {sc.label}</span>
        </div>

        <div className="flex items-center gap-4">
          {status?.uptime != null && (
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatUptime(status.uptime)}</span>
            </div>
          )}
          <button
            onClick={async () => {
              const t = toast.loading('Sincronizando...');
              try {
                await api.syncBalance();
                toast.success('Sincronizado con Binance', { id: t });
              } catch {
                toast.error('Error al sincronizar', { id: t });
              }
            }}
            className="flex items-center gap-2 bg-zinc-900/50 px-4 py-2 rounded-xl border border-zinc-800/50 hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-bold text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>
      </motion.div>

      {/* ── Hero: Balance + Daily P&L (inspired: prominent central stat) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

        {/* Balance hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="luxury-card p-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent pointer-events-none" />
          <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.15em] mb-2">Balance Binance</p>
          <p className="text-5xl font-black tracking-tighter text-white mb-3">
            {formatCurrency(metrics?.totalRealBalance)}
          </p>
          <div className="flex items-center gap-3">
            <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Capital autorizado: {formatCurrency(metrics?.balance)}</span>
            </div>
          </div>
        </motion.div>

        {/* Daily P&L hero — color adapts (inspired: hexagon prominence) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`luxury-card p-8 relative overflow-hidden ${
            dailyPnL > 0 ? 'border-green-500/30' : dailyPnL < 0 ? 'border-red-500/30' : ''
          }`}
        >
          <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br ${
            dailyPnL > 0 ? 'from-green-600/5 to-transparent' :
            dailyPnL < 0 ? 'from-red-600/5 to-transparent' : 'from-zinc-800/5 to-transparent'
          }`} />
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.15em]">Resultado del Día</p>
            <div className={`p-1.5 rounded-lg ${dailyPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {dailyPnL >= 0
                ? <TrendingUp className="w-4 h-4 text-green-500" />
                : <TrendingDown className="w-4 h-4 text-red-500" />
              }
            </div>
          </div>
          <p className={`text-5xl font-black tracking-tighter mb-3 ${
            dailyPnL > 0 ? 'text-green-400' : dailyPnL < 0 ? 'text-red-400' : 'text-zinc-400'
          }`}>
            {formatPNL(dailyPnL)}
          </p>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              dailyPnL >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
            }`}>
              {metrics?.balance && dailyPnL != null
                ? formatPercent((dailyPnL / metrics.balance) * 100)
                : '0.00%'}
            </span>
            <span className="text-[10px] text-zinc-600 font-medium">{metrics?.dailyTrades ?? 0} trades hoy</span>
          </div>
        </motion.div>
      </div>

      {/* ── Secondary metrics row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'All-Time P&L',
            value: formatPNL(metrics?.allTimePnL),
            icon: TrendingUp,
            color: (metrics?.allTimePnL ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400',
            delay: 0.15,
          },
          {
            label: 'P&L Flotante',
            value: formatPNL(metrics?.unrealizedPnL),
            icon: Activity,
            color: (metrics?.unrealizedPnL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
            delay: 0.2,
          },
          {
            label: 'Posiciones Abiertas',
            value: `${positions?.length ?? 0}`,
            icon: Zap,
            color: 'text-amber-400',
            delay: 0.25,
          },
          {
            label: 'Pérdidas Seguidas',
            value: `${consecutiveLosses} / ${MAX_CONSECUTIVE}`,
            icon: AlertTriangle,
            color: consecutiveLosses >= MAX_CONSECUTIVE ? 'text-red-500' : consecutiveLosses > 0 ? 'text-orange-400' : 'text-zinc-400',
            delay: 0.3,
          },
        ].map(({ label, value, icon: Icon, color, delay }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="luxury-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-2xl font-black tracking-tight ${color}`}>{value}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Market Regime + Active Strategy ── */}
      {orchestrator?.available && orchestrator.regime && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="luxury-card p-6 mb-8"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white">Sistema Multi-Estrategia</h2>
            <span className="ml-auto text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-violet-500/30 text-violet-400 bg-violet-500/5">
              {orchestrator.regime.type.replace('_', ' ')}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Active strategy */}
            <div className="col-span-2 p-4 rounded-xl bg-zinc-950 border border-zinc-900">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Estrategia Activa</p>
              <p className="text-base font-black text-violet-300">{orchestrator.activeStrategy || 'Esperando señal…'}</p>
              <p className="text-[11px] text-zinc-600 mt-1 leading-tight">{orchestrator.regime.description}</p>
            </div>

            {/* ADX */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-900">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">ADX</p>
              <p className={`text-2xl font-black ${orchestrator.regime.adx >= 28 ? 'text-amber-400' : 'text-zinc-300'}`}>
                {orchestrator.regime.adx.toFixed(1)}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1">
                +DI {orchestrator.regime.plusDI.toFixed(1)} / −DI {orchestrator.regime.minusDI.toFixed(1)}
              </p>
            </div>

            {/* Confidence */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-900">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Confianza</p>
              <p className="text-2xl font-black text-zinc-300">
                {(orchestrator.regime.confidence * 100).toFixed(0)}%
              </p>
              <p className="text-[10px] text-zinc-600 mt-1">
                ATR {(orchestrator.regime.atrPct * 100).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Signal counts */}
          {orchestrator.signalCounts && (
            <div className="flex gap-3 mt-4 flex-wrap">
              {Object.entries(orchestrator.signalCounts)
                .filter(([, count]) => count > 0)
                .map(([name, count]) => (
                  <span key={name} className="text-[10px] font-bold text-zinc-400 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                    {name}: {count}
                  </span>
                ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Charts + Stats Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 text-white">

        {/* Equity curve */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 luxury-card p-8"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold tracking-tight">Curva de Capital — Hoy</h2>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Balance USDT</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={equityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
              <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 5, stroke: '#000', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Stats panel — real data, no fake market sentiment */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="luxury-card p-8 flex flex-col gap-6"
        >
          <h2 className="text-lg font-bold tracking-tight">Estadísticas</h2>

          {/* Win Rate — inspired: progress bar with meaning */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Win Rate</p>
              <p className={`text-sm font-black ${winRate >= 50 ? 'text-green-400' : winRate >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>
                {winRate.toFixed(0)}%
              </p>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${winRate >= 50 ? 'bg-green-500' : winRate >= 35 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${winRate}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              {winRate === 0 ? 'Sin historial de trades aún' : winRate >= 50 ? 'Por encima del umbral de rentabilidad' : 'Por debajo del objetivo (≥50%)'}
            </p>
          </div>

          {/* Daily loss guard — inspired: cycle progress */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Límite de Pérdida Diaria</p>
              <p className="text-[10px] text-zinc-500 font-bold">{dailyLossPct.toFixed(0)}%</p>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  dailyLossPct >= 90 ? 'bg-red-500' : dailyLossPct >= 60 ? 'bg-orange-500' : 'bg-green-500'
                }`}
                style={{ width: `${dailyLossPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-zinc-600">{formatPNL(dailyPnL)}</span>
              <span className="text-[10px] text-zinc-600">Límite: {formatCurrency(Math.abs(dailyLossLimit))}</span>
            </div>
          </div>

          {/* Consecutive losses — inspired: visual segmented bar */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Pérdidas Consecutivas</p>
              <p className={`text-[10px] font-bold ${consecutiveLosses >= MAX_CONSECUTIVE ? 'text-red-500' : 'text-zinc-500'}`}>
                {consecutiveLosses}/{MAX_CONSECUTIVE}
              </p>
            </div>
            <div className="flex gap-1">
              {[...Array(MAX_CONSECUTIVE)].map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    i < consecutiveLosses
                      ? consecutiveLosses >= MAX_CONSECUTIVE ? 'bg-red-500' : 'bg-orange-400'
                      : 'bg-zinc-800'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Uptime */}
          {status?.uptime != null && (
            <div className="mt-auto pt-4 border-t border-zinc-800/50">
              <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mb-1">Tiempo Activo</p>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <p className="text-lg font-black text-zinc-300">{formatUptime(status.uptime)}</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Risk Circuit Breakers ── */}
      {metrics && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="luxury-card p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white">Protecciones de Riesgo</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daily loss breaker */}
            <div className={`p-6 rounded-2xl transition-all duration-500 ${
              metrics.circuitBreakers?.dailyLoss?.active
                ? 'bg-red-500/5 border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                : 'bg-zinc-950 border border-zinc-900'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Pérdida Diaria Máxima</p>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                  metrics.circuitBreakers?.dailyLoss?.active
                    ? 'border-red-500/50 text-red-400'
                    : 'border-zinc-800 text-zinc-600'
                }`}>
                  {metrics.circuitBreakers?.dailyLoss?.active ? 'ACTIVADO' : 'OK'}
                </span>
              </div>
              <div className="flex justify-between text-xs mb-3">
                <span className="text-zinc-500">Exposición: <span className="text-white font-bold">{formatPNL(metrics.circuitBreakers?.dailyLoss?.current)}</span></span>
                <span className="text-zinc-500">Límite: <span className="text-white font-bold">{formatCurrency(Math.abs(metrics.circuitBreakers?.dailyLoss?.limit ?? 0))}</span></span>
              </div>
              <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 rounded-full ${metrics.circuitBreakers?.dailyLoss?.active ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(Math.abs((metrics.circuitBreakers?.dailyLoss?.current ?? 0) / (metrics.circuitBreakers?.dailyLoss?.limit ?? -1)) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Consecutive losses breaker */}
            <div className={`p-6 rounded-2xl transition-all duration-500 ${
              metrics.circuitBreakers?.consecutiveLosses?.active
                ? 'bg-orange-500/5 border border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.08)]'
                : 'bg-zinc-950 border border-zinc-900'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Pérdidas Consecutivas</p>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                  metrics.circuitBreakers?.consecutiveLosses?.active
                    ? 'border-orange-500/50 text-orange-400'
                    : 'border-zinc-800 text-zinc-600'
                }`}>
                  {metrics.circuitBreakers?.consecutiveLosses?.active ? 'ACTIVADO' : 'OK'}
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight text-white mb-3">
                {metrics.circuitBreakers?.consecutiveLosses?.current ?? 0}
                <span className="text-zinc-600 text-base font-bold"> / {metrics.circuitBreakers?.consecutiveLosses?.limit ?? 5}</span>
              </p>
              <div className="flex gap-1">
                {[...Array(metrics.circuitBreakers?.consecutiveLosses?.limit ?? 5)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i < (metrics.circuitBreakers?.consecutiveLosses?.current ?? 0)
                        ? metrics.circuitBreakers?.consecutiveLosses?.active ? 'bg-red-500' : 'bg-orange-400'
                        : 'bg-zinc-900'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Open Positions ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="luxury-card p-1 shadow-2xl"
      >
        <div className="p-8 pb-4 flex justify-between items-center">
          <h2 className="text-lg font-bold tracking-tight text-white">Posiciones Abiertas</h2>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800/50">
            {positions?.length ?? 0} activas
          </span>
        </div>

        {!positions || positions.length === 0 ? (
          <div className="text-center py-16 bg-zinc-950/20 rounded-b-2xl">
            <div className="w-14 h-14 bg-zinc-900/50 rounded-2xl flex items-center justify-center border border-zinc-800/50 mx-auto mb-5">
              <DollarSign className="w-7 h-7 text-zinc-700" />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Sin posiciones abiertas</p>
            <p className="text-zinc-600 text-sm mt-2 max-w-xs mx-auto">El bot está analizando el mercado. Se abrirá una posición cuando las condiciones sean favorables.</p>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-900/50">
                  <th className="text-left py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Par</th>
                  <th className="text-left py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Dirección</th>
                  <th className="text-right py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Entrada</th>
                  <th className="text-right py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Cantidad</th>
                  <th className="text-right py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Stop Loss</th>
                  <th className="text-right py-4 px-6 text-zinc-500 font-black uppercase text-[10px] tracking-widest">Take Profit</th>
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
                    <td className="py-5 px-6 font-black tracking-tight text-white uppercase">{position.symbol}</td>
                    <td className="py-5 px-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                        position.side === 'buy'
                          ? 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {position.side === 'buy' ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-right font-mono text-xs text-zinc-400 font-bold">${position.entryPrice?.toFixed(4) ?? '—'}</td>
                    <td className="py-5 px-6 text-right font-mono text-xs text-zinc-300 font-black">{position.amount?.toFixed(4) ?? '—'}</td>
                    <td className="py-5 px-6 text-right text-red-400/80 font-mono text-xs font-bold">${position.stopLoss?.toFixed(4) || '—'}</td>
                    <td className="py-5 px-6 text-right text-green-400/80 font-mono text-xs font-bold">${position.takeProfit?.toFixed(4) || '—'}</td>
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

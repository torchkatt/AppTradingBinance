'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, AlertOctagon, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useDashboardStore } from '@/stores/dashboard-store';

export default function ControlsPage() {
    const { status } = useDashboardStore();
    const [isLoading, setIsLoading] = useState(false);
    const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

    const handleControl = async (action: 'start' | 'stop' | 'pause' | 'emergency_close') => {
        if (action === 'emergency_close' && !showEmergencyConfirm) {
            setShowEmergencyConfirm(true);
            return;
        }

        setIsLoading(true);
        try {
            const result = await api.controlBot(action);
            toast.success(result.message);
            setShowEmergencyConfirm(false);
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al ejecutar acción');
        } finally {
            setIsLoading(false);
        }
    };

    const ControlButton = ({
        action,
        label,
        icon: Icon,
        color,
        description,
        disabled = false
    }: {
        action: 'start' | 'stop' | 'pause' | 'emergency_close';
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        color: string;
        description: string;
        disabled?: boolean;
    }) => (
        <motion.button
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => handleControl(action)}
            disabled={disabled || isLoading}
            className={`
                relative overflow-hidden p-8 rounded-2xl border transition-all duration-300 group text-left
                ${disabled
                    ? 'bg-zinc-900/30 border-zinc-900 opacity-40 cursor-not-allowed'
                    : `luxury-card border-zinc-800/50 hover:border-${color}/30`}
            `}
        >
            <div className="flex bg-zinc-950/50 items-start justify-between mb-8">
                <div className={`p-4 rounded-xl ${disabled ? 'bg-zinc-800/50 text-zinc-700' : `bg-${color}/10 text-${color}`}`}>
                    <Icon className="w-8 h-8" />
                </div>
                {!disabled && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileHover={{ opacity: 1 }}
                        className={`text-${color} text-[10px] font-black uppercase tracking-widest flex items-center gap-2`}
                    >
                        Ready <Play className="w-2 h-2 fill-current" />
                    </motion.div>
                )}
            </div>
            <h3 className={`text-xl font-black uppercase tracking-tighter mb-1 ${disabled ? 'text-zinc-600' : 'text-white'}`}>{label}</h3>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{description}</p>

            {isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
            )}
        </motion.button>
    );

    return (
        <div className="p-10 max-w-[1200px] mx-auto bg-black min-h-screen text-white">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-amber-600/10 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded border border-amber-500/20">Executive Authority</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Controls</h1>
                    <p className="text-zinc-500 font-medium mt-2">Centralized command interface for engine orchestration.</p>
                </div>

                <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest border-l border-zinc-900 pl-6 h-10 flex items-center">
                    Level: Tier 1 Admin
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                {/* Status Monitor */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="luxury-card p-8 lg:col-span-1 flex flex-col justify-between"
                >
                    <div>
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">Engine Resonance</p>
                        <div className="flex items-center gap-4 mb-2">
                            <div className={`w-3 h-3 rounded-full animate-pulse ${status?.mode === 'running' ? 'bg-green-500 shadow-[0_0_15px_#22c55e]' : 'bg-zinc-800'}`}></div>
                            <p className="text-3xl font-black tracking-tighter text-white uppercase">
                                {status?.mode || 'OFFLINE'}
                            </p>
                        </div>
                        <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Global Status Code</p>
                    </div>

                    <div className="mt-12 pt-8 border-t border-zinc-900">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Total System Uptime</p>
                        <p className="text-2xl font-black tracking-tighter text-white">
                            {status ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m` : '0h 0m'}
                        </p>
                    </div>
                </motion.div>

                {/* Primary Interaction Grid */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ControlButton
                        action="start"
                        label="Deploy"
                        description="Activate Trading Intelligence"
                        icon={Play}
                        color="blue-500"
                        disabled={status?.isRunning}
                    />
                    <ControlButton
                        action="pause"
                        label="Suspend"
                        description="Halt Strategy Execution"
                        icon={Pause}
                        color="amber-500"
                        disabled={!status?.isRunning}
                    />
                    <ControlButton
                        action="stop"
                        label="Terminate"
                        description="Full System Shutdown"
                        icon={Square}
                        color="red-500"
                        disabled={!status?.isRunning}
                    />
                    <ControlButton
                        action="emergency_close"
                        label="Liquidate"
                        description="Nuke all active positions"
                        icon={AlertOctagon}
                        color="red-600"
                        disabled={false}
                    />
                </div>
            </div>

            <AnimatePresence>
                {showEmergencyConfirm && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="luxury-card p-8 border-red-500/30 bg-red-950/10 mb-8"
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <AlertOctagon className="w-8 h-8 text-red-500" />
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-white">Critical Protocol: Mass Liquidation</h3>
                                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Immediate market-price exit for all sub-channels</p>
                            </div>
                        </div>

                        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                            This override will trigger immediate MARKET orders to close every active position in the current ledger.
                            Slip and commission costs will be incurred. This protocol cannot be interrupted once initiated.
                        </p>

                        <div className="flex gap-4">
                            <button
                                onClick={() => handleControl('emergency_close')}
                                className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-2xl shadow-red-900/40"
                            >
                                Execute Protocol
                            </button>
                            <button
                                onClick={() => setShowEmergencyConfirm(false)}
                                className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl border border-zinc-800 transition-all"
                            >
                                Abort
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sub-Notice */}
            <div className="luxury-card p-6 bg-amber-600/[0.03] border-amber-600/10">
                <div className="flex gap-4 items-start">
                    <div className="p-2 bg-amber-600/10 rounded-lg">
                        <AlertOctagon className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-amber-500/80 text-[10px] font-black uppercase tracking-widest mb-1">Operational Policy</p>
                        <p className="text-zinc-500 text-xs leading-relaxed">
                            Engine commands are executed synchronously via the Binance Gateway. Latency may vary based on sector congestion.
                            Always verify position closure in the <strong>Active Flux</strong> terminal after mass liquidation.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api, { Config } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [formState, setFormState] = useState<Partial<Config>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isRestarting, setIsRestarting] = useState(false);

    // Help functions for intuitive formatting
    const msToS = (ms: number) => ms / 1000;
    const sToMs = (s: number) => Math.round(s * 1000);
    const decimalToPct = (dec: number) => Number((dec * 100).toFixed(2));
    const pctToDecimal = (pct: number) => Number((pct / 100).toFixed(4));

    const isMsField = (key: string) => key.endsWith('_MS');
    const isPctField = (key: string) => key.endsWith('_PCT') || key.endsWith('_ROI');

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const data = await api.getConfig();
                const processedConfig = { ...data.config };

                // Convert to friendly units for the UI
                Object.keys(processedConfig).forEach(key => {
                    const k = key as keyof Config;
                    if (isMsField(key)) processedConfig[k] = msToS(processedConfig[k] as number) as any;
                    if (isPctField(key)) processedConfig[k] = decimalToPct(processedConfig[k] as number) as any;
                });

                setConfig(data.config); // Keep original for dirty check
                setFormState(processedConfig);
            } catch (error: unknown) {
                console.error('Failed to load config:', error);
                toast.error('Error al cargar la configuración');
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleChange = (key: string, value: string | number) => {
        if (!config) return;
        setFormState((prev: Partial<Config>) => ({
            ...prev,
            [key]: typeof config[key as keyof Config] === 'number' ? Number(value) : value
        }));
    };

    const handleSave = async () => {
        if (!config) return;
        setIsSaving(true);
        try {
            const updates: Partial<Config> = {};

            Object.keys(formState).forEach(key => {
                const k = key as keyof Config;
                let val = formState[k];
                let originalVal = config[k];

                // Convert back to API units before comparison and saving
                if (isMsField(key)) {
                    val = sToMs(Number(val));
                } else if (isPctField(key)) {
                    val = pctToDecimal(Number(val));
                }

                if (val !== originalVal) {
                    updates[k] = val as any;
                }
            });

            if (Object.keys(updates).length === 0) {
                toast.error('No changes to save');
                setIsSaving(false);
                setShowConfirm(false);
                return;
            }

            const response = await api.updateConfig(updates);
            if (response.success) {
                toast.success('Configuración guardada correctamente');
                setIsRestarting(true);

                // Delay to show success message before restart
                setTimeout(async () => {
                    try {
                        await api.restart();
                    } catch (e) {
                        // Restart will likely break connection, which is expected
                        console.log('Restart triggered, connection closed.');
                    }
                }, 1500);

                // Update local base config with converted values
                const newConfig = { ...config, ...updates };
                setConfig(newConfig);
                setShowConfirm(false);
            } else {
                toast.error(response.message || 'Error saving configuration');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Connection error';
            toast.error(errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black p-8 flex items-center justify-center">
                <RefreshCw className="w-12 h-12 animate-spin text-blue-500" />
            </div>
        );
    }

    const ConfigSection = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon: any }) => (
        <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                    <Icon className="w-4 h-4 text-zinc-400" />
                </div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {children}
            </div>
        </div>
    );

    const ConfigInput = ({ label, id, type = 'number', step = '0.01', unit = '', hint = '' }: {
        label: string;
        id: string;
        type?: string;
        step?: string;
        unit?: string;
        hint?: string;
    }) => (
        <div className="luxury-card p-6 flex flex-col justify-between hover:border-blue-500/20">
            <div className="mb-4">
                <div className="flex justify-between items-start mb-1">
                    <label htmlFor={id} className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</label>
                    {unit && <span className="text-[10px] text-zinc-600 font-bold uppercase">{unit}</span>}
                </div>
                {hint && <p className="text-[10px] text-zinc-700 font-medium leading-tight">{hint}</p>}
            </div>
            <input
                id={id}
                type={type}
                step={step}
                value={formState[id as keyof Config] !== undefined ? String(formState[id as keyof Config]) : ''}
                onChange={(e) => handleChange(id, e.target.value)}
                className="bg-zinc-950/50 border border-zinc-900 rounded-xl px-4 py-3 text-blue-400 font-mono text-lg font-black focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all w-full"
            />
        </div>
    );

    const isDirty = JSON.stringify(config) !== JSON.stringify(formState);

    return (
        <div className="p-10 max-w-[1200px] mx-auto bg-black min-h-screen text-white">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded border border-zinc-700/50">System Parameters</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Settings</h1>
                    <p className="text-zinc-500 font-medium mt-2">Fine-tune the engine's core heuristic and risk vectors.</p>
                </div>

                <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest border-l border-zinc-900 pl-6 h-10 flex items-center">
                    Config Version: 5.0.1
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="luxury-card p-10 mb-12"
            >
                <ConfigSection title="Strategy Heuristics" icon={Save}>
                    <div className="luxury-card p-6 flex flex-col justify-between hover:border-blue-500/20">
                        <div className="mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Timeframe Domain</label>
                            <p className="text-[10px] text-zinc-700 font-medium leading-tight">The period length for each candle analyzed.</p>
                        </div>
                        <select
                            value={formState.TIMEFRAME}
                            onChange={(e) => handleChange('TIMEFRAME', e.target.value)}
                            className="bg-zinc-950/50 border border-zinc-900 rounded-xl px-4 py-3 text-blue-400 font-mono text-lg font-black focus:outline-none focus:border-blue-500/50 transition-all w-full appearance-none cursor-pointer"
                        >
                            {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                                <option key={tf} value={tf}>{tf}</option>
                            ))}
                        </select>
                    </div>
                    <ConfigInput
                        label="Force Leverage"
                        id="DEFAULT_LEVERAGE"
                        unit="X"
                        hint="The multiplier used for position size."
                    />
                    <ConfigInput
                        label="Channel Saturation"
                        id="MAX_OPEN_POSITIONS"
                        step="1"
                        unit="Slots"
                        hint="Max simultaneous active trades."
                    />
                </ConfigSection>

                <ConfigSection title="Risk Engineering" icon={AlertTriangle}>
                    <ConfigInput
                        label="Risk per Vector"
                        id="RISK_PER_TRADE_PCT"
                        step="0.1"
                        unit="%"
                        hint="Percentage of capital to risk on each new position."
                    />
                    <ConfigInput
                        label="Global Drawdown Limit"
                        id="MAX_DAILY_LOSS_PCT"
                        step="0.1"
                        unit="%"
                        hint="Emergency shutdown if total balance drops by this amount in 24h."
                    />
                    <ConfigInput
                        label="Single Asset Ceiling"
                        id="MAX_POSITION_SIZE_PCT"
                        step="1"
                        unit="%"
                        hint="Maximum weight allowed for a single instrument."
                    />
                </ConfigSection>

                <ConfigSection title="Profit Targets & Throttling" icon={CheckCircle2}>
                    <ConfigInput
                        label="Take Profit Threshold"
                        id="TAKE_PROFIT_ROI"
                        step="0.1"
                        unit="%"
                        hint="Target return to trigger trade exit."
                    />
                    <ConfigInput
                        label="Emergency Stop ROI"
                        id="STOP_LOSS_ROI"
                        step="0.1"
                        unit="%"
                        hint="Loss threshold to liquidate position."
                    />
                    <ConfigInput
                        label="Trailing Activation"
                        id="TRAILING_ACTIVATION_ROI"
                        step="0.1"
                        unit="%"
                        hint="Price movement needed to engage the trailing shield."
                    />
                </ConfigSection>

                <ConfigSection title="Gateway Latency" icon={RefreshCw}>
                    <ConfigInput
                        label="Market Scan Interval"
                        id="SCAN_INTERVAL_MS"
                        step="0.1"
                        unit="Seconds"
                        hint="How often the engine searches for new opportunities."
                    />
                    <ConfigInput
                        label="Position Audit Pulse"
                        id="POSITION_CHECK_INTERVAL_MS"
                        step="0.1"
                        unit="Seconds"
                        hint="Refresh rate for monitoring active position P&L."
                    />
                </ConfigSection>

                <div className="bg-amber-600/[0.03] border border-amber-600/10 rounded-2xl p-6 mb-10 flex gap-6 items-start">
                    <div className="p-3 bg-amber-600/10 rounded-xl">
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                    </div>
                    <div>
                        <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">Automatic Persistence</p>
                        <p className="text-zinc-500 text-sm leading-relaxed">
                            Parameter modifications are written directly to the environment.
                            The system will <strong>automatically restart</strong> to re-initialize the core engine with updated heuristics.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end pt-8 border-t border-zinc-900/50">
                    <button
                        onClick={() => setShowConfirm(true)}
                        disabled={!isDirty || isSaving}
                        className={`group relative flex items-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] py-5 px-10 rounded-2xl transition-all duration-500 overflow-hidden ${isDirty
                            ? 'bg-blue-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_40px_rgba(37,99,235,0.4)] active:scale-95'
                            : 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800'
                            }`}
                    >
                        {isSaving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className={`w-4 h-4 transition-transform group-hover:-translate-y-0.5 ${isDirty ? 'text-white' : 'text-zinc-700'}`} />
                        )}
                        <span>{isSaving ? 'Encrypting...' : isDirty ? 'Commit Changes' : 'Ledger Synced'}</span>
                    </button>
                </div>
            </motion.div>

            <AnimatePresence>
                {showConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                            onClick={() => setShowConfirm(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="luxury-card p-10 max-w-lg w-full relative z-10"
                        >
                            <div className="flex items-center gap-6 mb-8">
                                <div className="p-4 bg-amber-600/10 rounded-2xl">
                                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Confirm Commit</h3>
                                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">System Override Protocol</p>
                                </div>
                            </div>

                            <p className="text-zinc-400 text-sm mb-10 leading-relaxed font-medium">
                                You are about to overwrite core system parameters. This action updates the persistent environmental state.
                                The trading bot must be fully cycled (restarted) to adopt the new configuration.
                            </p>

                            <div className="flex gap-4">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-white transition-all shadow-xl shadow-blue-900/40"
                                >
                                    Confirm Update
                                </button>
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-zinc-400 border border-zinc-800 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isRestarting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
                    >
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.5, 1, 0.5]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="luxury-card p-12 flex flex-col items-center gap-8 border-blue-500/30"
                        >
                            <RefreshCw className="w-16 h-16 animate-spin text-blue-500" />
                            <div className="text-center">
                                <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2">System Restarting</h2>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Re-initializing Global Parameters</p>
                            </div>
                            <div className="w-48 h-1 bg-zinc-900 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-blue-500"
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 10 }}
                                />
                            </div>
                            <p className="text-zinc-600 text-[10px] font-medium uppercase tracking-widest animate-pulse">
                                Do not close the browser context
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

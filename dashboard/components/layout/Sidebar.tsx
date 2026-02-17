'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    TrendingUp,
    History,
    Settings,
    Activity,
    Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

const menuItems = [
    { icon: LayoutDashboard, label: 'Panel', href: '/' },
    { icon: TrendingUp, label: 'Posiciones', href: '/positions' },
    { icon: History, label: 'Historial', href: '/history' },
    { icon: Activity, label: 'Controles', href: '/controls' },
    { icon: Settings, label: 'Configuración', href: '/settings' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="w-72 bg-black border-r border-zinc-900/50 flex flex-col h-screen sticky top-0">
            {/* Logo Section - More minimalist */}
            <div className="p-8">
                <div className="flex items-center gap-4 group cursor-pointer">
                    <div className="relative">
                        <div className="absolute -inset-1 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                        <div className="relative w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-800/50">
                            <Zap className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <div>
                        <h1 className="font-black text-xl tracking-tighter text-white">TRADING</h1>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">v5.0 Pro System</p>
                    </div>
                </div>
            </div>

            {/* Navigation - More whitespace and refined items */}
            <nav className="flex-1 px-6 space-y-2 mt-4">
                {menuItems.map((item, idx) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link key={item.href} href={item.href}>
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ x: 5 }}
                                className={`
                                    flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group
                                    ${isActive
                                        ? 'bg-zinc-900/80 text-white shadow-[0_0_20px_rgba(0,0,0,0.4)] border border-zinc-800/50'
                                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/30'}
                                `}
                            >
                                <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600/10 text-blue-400' : 'bg-transparent group-hover:bg-zinc-800/50'}`}>
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                </div>
                                <span className={`text-sm font-bold tracking-tight transition-colors ${isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-200'}`}>
                                    {item.label}
                                </span>
                                {isActive && (
                                    <motion.div
                                        layoutId="activeGlow"
                                        className="ml-auto w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"
                                    />
                                )}
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* Footer - Minimalist */}
            <div className="p-8 mt-auto">
                <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/30 backdrop-blur-sm">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mb-1">Terminal Status</p>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
                        <span className="text-[10px] text-zinc-400 font-medium">Encrypted & Active</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

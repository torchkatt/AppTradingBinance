'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDashboardStore } from '@/stores/dashboard-store';
import toast from 'react-hot-toast';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function useWebSocket() {
    const socketRef = useRef<Socket | null>(null);
    const {
        setStatus,
        setMetrics,
        setPositions,
        setConnected,
        addTrade,
        addNotification
    } = useDashboardStore();

    useEffect(() => {
        // Initialize WebSocket connection
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            setConnected(true);
            toast.success('Connected to trading bot');
        });

        socket.on('disconnect', () => {
            console.log('📴 WebSocket disconnected');
            setConnected(false);
            toast.error('Disconnected from trading bot');
        });

        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket connection error:', error);
            setConnected(false);
        });

        // Data events
        socket.on('positions_update', (data) => {
            setPositions(data.positions || []);
        });

        socket.on('metrics_update', (data) => {
            setMetrics(data);
        });

        socket.on('bot_status_changed', (data) => {
            setStatus({
                isRunning: data.isRunning,
                mode: data.mode,
                uptime: 0,
                lastUpdate: data.timestamp
            });
        });

        socket.on('trade_closed', (data) => {
            console.log('📊 Trade closed:', data.trade);
            addTrade(data.trade);

            const pnlColor = data.trade.pnl >= 0 ? 'text-green-500' : 'text-red-500';
            toast.custom((t) => (
                <div className= {`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-zinc-900 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
        <div className="flex-1 w-0 p-4" >
        <div className="flex items-start" >
        <div className="ml-3 flex-1" >
        <p className="text-sm font-medium text-white" >
        { data.trade.symbol } - { data.trade.side.toUpperCase() }
        </p>
        < p className = {`mt-1 text-sm ${pnlColor}`}>
    PnL: ${ data.trade.pnl?.toFixed(2) }({ data.trade.pnlPercent?.toFixed(2) } %)
    </p>
    </div>
    </div>
    </div>
    < div className = "flex border-l border-zinc-800" >
    <button
                            onClick={() => toast.dismiss(t.id)}
className = "w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-zinc-400 hover:text-white focus:outline-none"
    >
    Close
    </button>
    </div>
    </div>
            ), { duration: 5000 });
        });

socket.on('alert', (data) => {
    console.log('🔔 Alert:', data);
    addNotification({
        type: data.type,
        message: data.message,
        timestamp: data.timestamp
    });

    switch (data.type) {
        case 'info':
            toast(data.message, { icon: 'ℹ️' });
            break;
        case 'warning':
            toast(data.message, { icon: '⚠️', duration: 6000 });
            break;
        case 'error':
            toast.error(data.message);
            break;
        default:
            toast(data.message);
    }
});

socket.on('position_closed', (data) => {
    if (data.success) {
        toast.success(`Position ${data.symbol} closed`);
    }
});

socket.on('control_success', (data) => {
    toast.success(`Bot ${data.action} successful`);
});

socket.on('error', (data) => {
    toast.error(data.message || 'An error occurred');
});

// Cleanup on unmount
return () => {
    socket.disconnect();
};
    }, [setStatus, setMetrics, setPositions, setConnected, addTrade, addNotification]);

// Exposed actions for components
const closePosition = (symbol: string) => {
    if (socketRef.current) {
        socketRef.current.emit('close_position', { symbol });
    }
};

const controlBot = (action: 'pause' | 'resume' | 'emergency_close') => {
    if (socketRef.current) {
        socketRef.current.emit('control_bot', { action });
    }
};

return {
    closePosition,
    controlBot
};
}

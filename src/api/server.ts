import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { createApiRoutes } from './routes.js';
import { authenticateJWT } from './middleware.js';
import { setupWebSocket } from './websocket.js';
import { logger } from '../utils/logger.js';

export function createApiServer(port: number = 3005) {
    const app = express();

    // Rate Limiting - 100 requests per minute
    const limiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100,
        message: 'Too many requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Middleware
    const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3002',
        'http://127.0.0.1:3002',
        process.env.DASHBOARD_URL
    ].filter(Boolean) as string[];

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    }));
    app.use(express.json());
    app.use(limiter);

    // Health check (no auth required)
    app.get('/ping', (_req, res) => {
        res.send('pong');
    });

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // API Routes (protected by JWT if JWT_SECRET is set)
    app.use('/api', authenticateJWT, createApiRoutes());

    // Create HTTP server for Socket.IO
    const httpServer = createServer(app);

    // Setup WebSocket
    setupWebSocket(httpServer);

    // Start server explicitly on all interfaces
    httpServer.listen(port, '0.0.0.0', () => {
        logger.info({ port }, '🌐 API Server running');
        logger.info({ port }, '📡 WebSocket server ready');
        if (!process.env.JWT_SECRET) {
            logger.warn('⚠️  JWT_SECRET not set - API authentication is DISABLED');
        } else {
            logger.info('✅ API authentication enabled');
        }
    });

    return httpServer;
}

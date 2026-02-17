import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * JWT Authentication Middleware
 * Verifies JWT token in Authorization header
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
    // Skip auth in development if JWT_SECRET is not set
    if (!process.env.JWT_SECRET) {
        logger.warn('JWT_SECRET not set - authentication disabled');
        next();
        return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        logger.warn({ error }, 'Invalid JWT token');
        res.status(403).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Generate a JWT token (for initial setup)
 * Usage: call this once to generate a token, then use it in your requests
 */
export function generateToken(): string {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(
        { type: 'dashboard', createdAt: Date.now() },
        process.env.JWT_SECRET,
        { expiresIn: '30d' } // Token valid for 30 days
    );
}

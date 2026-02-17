import { generateToken } from '../src/api/middleware.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to generate a JWT token for dashboard authentication
 * 
 * Usage:
 * 1. Add JWT_SECRET to your .env file (any random string, e.g., output of: openssl rand -base64 32)
 * 2. Run: tsx generate-token.ts
 * 3. Copy the generated token and use it in Authorization header: Bearer <token>
 */

if (!process.env.JWT_SECRET) {
    console.error('❌ ERROR: JWT_SECRET not found in .env file');
    console.log('\n📝 To fix:');
    console.log('1. Add JWT_SECRET to your .env file');
    console.log('2. Example: JWT_SECRET=your-secret-key-here');
    console.log('3. Generate a random secret: openssl rand -base64 32');
    process.exit(1);
}

try {
    const token = generateToken();
    console.log('\n✅ JWT Token generated successfully!\n');
    console.log('Token:');
    console.log(token);
    console.log('\n📋 Use this token in your dashboard API requests:');
    console.log(`Authorization: Bearer ${token}`);
    console.log('\n⏰ Token expires in: 30 days');
} catch (error) {
    console.error('❌ Error generating token:', error);
    process.exit(1);
}

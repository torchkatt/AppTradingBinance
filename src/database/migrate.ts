import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ejecuta las migraciones de base de datos
 */
async function migrate() {
    try {
        logger.info('Starting database migration...');

        // Inicializar conexión
        await db.initialize();

        // Leer y ejecutar schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf-8');

        // Ejecutar cada statement
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await (db as any).pool.query(statement);
            } catch (error: any) {
                // Ignorar errores de "already exists"
                if (!error.message.includes('already exists')) {
                    throw error;
                }
            }
        }

        logger.info('✅ Database migration completed successfully');
        await db.close();
        process.exit(0);
    } catch (error) {
        logger.error({ error }, '❌ Database migration failed');
        process.exit(1);
    }
}

migrate();

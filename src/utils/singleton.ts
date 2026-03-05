import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import os from 'os';

const LOCK_FILE = path.join(process.cwd(), '.bot.lock');

/**
 * Sistema de Singleton para evitar múltiples instancias del bot
 * 
 * Crea un archivo de lock al iniciar
 * Si ya existe, significa que otra instancia está corriendo
 */
export class SingletonLock {
    /**
     * Intenta adquirir el lock
     * @returns true si adquirió el lock, false si ya existe otra instancia
     */
    static acquire(): boolean {
        try {
            // Check si ya existe el lock file
            if (fs.existsSync(LOCK_FILE)) {
                const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8');
                let lockData;

                try {
                    lockData = JSON.parse(lockContent);
                } catch {
                    // Lock file corrupto, eliminar y continuar
                    logger.warn('Lock file corrupto detectado, eliminando...');
                    fs.unlinkSync(LOCK_FILE);
                    return true;
                }

                // Verificar si el proceso todavía existe
                const pid = lockData.pid;

                try {
                    // En Unix, signal 0 no mata el proceso, solo verifica si existe
                    process.kill(pid, 0);

                    // Si llegamos aquí, el proceso existe
                    logger.error({
                        existingPid: pid,
                        startedAt: lockData.startedAt
                    }, '🔴 OTRA INSTANCIA DEL BOT YA ESTÁ CORRIENDO');

                    console.error('');
                    console.error('═══════════════════════════════════════════════════');
                    console.error('  ERROR: BOT YA ESTÁ CORRIENDO');
                    console.error('═══════════════════════════════════════════════════');
                    console.error('');
                    console.error(`  PID Existente: ${pid}`);
                    console.error(`  Iniciado: ${lockData.startedAt}`);
                    console.error('');
                    console.error('  Para detener el bot existente:');
                    console.error(`    kill ${pid}`);
                    console.error('');
                    console.error('  Si crees que esto es un error, elimina manualmente:');
                    console.error(`    rm ${LOCK_FILE}`);
                    console.error('');
                    console.error('═══════════════════════════════════════════════════');
                    console.error('');

                    return false;

                } catch (e) {
                    // Proceso no existe, lock file es stale
                    logger.warn({ stalePid: pid }, 'Lock file obsoleto detectado (proceso muerto), eliminando...');
                    fs.unlinkSync(LOCK_FILE);
                }
            }

            // Crear lock file
            const lockData = {
                pid: process.pid,
                startedAt: new Date().toISOString(),
                hostname: os.hostname()
            };

            fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), 'utf-8');

            logger.info({
                lockFile: LOCK_FILE,
                pid: process.pid
            }, '🔒 Lock file creado exitosamente');

            return true;

        } catch (error: any) {
            logger.error({ error: error.message }, 'Error al crear lock file');
            return false;
        }
    }

    /**
     * Libera el lock
     */
    static release(): void {
        try {
            if (fs.existsSync(LOCK_FILE)) {
                fs.unlinkSync(LOCK_FILE);
                logger.info('🔓 Lock file eliminado');
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Error al eliminar lock file');
        }
    }

    /**
     * Configura handlers para liberar el lock al terminar
     */
    static setupCleanup(): void {
        // Handler para Ctrl+C
        process.on('SIGINT', () => {
            logger.info('Recibido SIGINT, liberando lock...');
            SingletonLock.release();
            process.exit(0);
        });

        // Handler para terminación
        process.on('SIGTERM', () => {
            logger.info('Recibido SIGTERM, liberando lock...');
            SingletonLock.release();
            process.exit(0);
        });

        // Handler para excepciones no capturadas
        process.on('uncaughtException', (error) => {
            logger.error({ error }, 'Excepción no capturada, liberando lock...');
            SingletonLock.release();
            process.exit(1);
        });

        // Handler para promesas rechazadas
        process.on('unhandledRejection', (reason) => {
            logger.error({ reason }, 'Promesa rechazada no manejada, liberando lock...');
            SingletonLock.release();
            process.exit(1);
        });
    }
}

import { capitalLogger as logger } from '../utils/logger.js';
import { TelegramNotifier } from '../monitoring/TelegramNotifier.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Estado del capital y milestones
 */
export interface CapitalState {
    initialInvestment: number;
    totalBalance: number;
    operatingCapital: number;
    reservedFunds: number;
    currentMilestone: number;
    milestoneHistory: Milestone[];
    investmentRecovered: boolean;
    lastUpdated: string;
}

export interface Milestone {
    id: number;
    targetBalance: number;
    achievedAt?: string;
    actionTaken: string;
    newOperatingCapital: number;
}

/**
 * Gestor de Capital Progresivo
 * 
 * Responsabilidades:
 * - Rastrear balance total vs capital operativo
 * - Detectar milestones automáticamente
 * - Ajustar capital operativo según reglas
 * - Persistir estado en archivo JSON
 */
export class CapitalManager {
    private state: CapitalState;
    private stateFilePath: string;
    private notifier?: TelegramNotifier;

    constructor(initialInvestment: number, notifier?: TelegramNotifier) {
        this.stateFilePath = path.join(process.cwd(), 'data', 'capital_state.json');
        this.notifier = notifier;

        // Estado por defecto
        this.state = {
            initialInvestment,
            totalBalance: initialInvestment,
            operatingCapital: initialInvestment,
            reservedFunds: 0,
            currentMilestone: 0,
            milestoneHistory: [],
            investmentRecovered: false,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Inicializa el manager cargando estado persistido
     */
    async initialize(): Promise<void> {
        try {
            // Asegurar que existe el directorio data/
            const dataDir = path.dirname(this.stateFilePath);
            await fs.mkdir(dataDir, { recursive: true });

            // Intentar cargar estado existente
            const loaded = await this.loadState();

            if (loaded) {
                logger.info({
                    operatingCapital: this.state.operatingCapital,
                    totalBalance: this.state.totalBalance,
                    milestone: this.state.currentMilestone,
                    investmentRecovered: this.state.investmentRecovered
                }, 'CapitalManager initialized from saved state');
            } else {
                // Guardar estado inicial
                await this.saveState();
                logger.info({
                    initialInvestment: this.state.initialInvestment,
                    operatingCapital: this.state.operatingCapital
                }, 'CapitalManager initialized with fresh state');
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to initialize CapitalManager');
            throw error;
        }
    }

    /**
     * Carga el estado desde el archivo JSON
     */
    private async loadState(): Promise<boolean> {
        try {
            const data = await fs.readFile(this.stateFilePath, 'utf-8');
            this.state = JSON.parse(data);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.info('No previous capital state found, starting fresh');
                return false;
            }
            logger.error({ error: error.message }, 'Error loading capital state');
            return false;
        }
    }

    /**
     * Guarda el estado en el archivo JSON
     */
    private async saveState(): Promise<void> {
        try {
            this.state.lastUpdated = new Date().toISOString();
            await fs.writeFile(
                this.stateFilePath,
                JSON.stringify(this.state, null, 2),
                'utf-8'
            );
            logger.debug('Capital state saved');
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to save capital state');
        }
    }

    /**
     * Actualiza el balance total y verifica milestones
     */
    async updateBalance(newBalance: number): Promise<void> {
        const previousBalance = this.state.totalBalance;
        this.state.totalBalance = newBalance;

        logger.info({
            previousBalance,
            newBalance,
            operatingCapital: this.state.operatingCapital
        }, 'Balance updated');

        // Verificar si alcanzamos un milestone
        await this.checkAndProcessMilestones();

        // Guardar estado
        await this.saveState();
    }

    /**
     * Verifica y procesa milestones alcanzados
     */
    private async checkAndProcessMilestones(): Promise<void> {
        const { totalBalance, currentMilestone, initialInvestment, investmentRecovered } = this.state;

        // Milestone 1: Recuperar inversión inicial ($1k → $2k)
        if (!investmentRecovered && totalBalance >= initialInvestment * 2) {
            await this.achieveMilestone({
                id: 1,
                targetBalance: initialInvestment * 2,
                actionTaken: 'Recovered initial investment',
                newOperatingCapital: initialInvestment
            });
            this.state.investmentRecovered = true;
            this.state.operatingCapital = initialInvestment;
            this.state.reservedFunds = totalBalance - initialInvestment;
            this.state.currentMilestone = 1;

            logger.info({
                milestone: 1,
                totalBalance,
                operatingCapital: this.state.operatingCapital,
                reservedFunds: this.state.reservedFunds
            }, '🎉 MILESTONE 1: Investment recovered!');

            // Notificar
            if (this.notifier) {
                await this.notifier.sendAlert(
                    'SUCCESS',
                    `🎉 *MILESTONE ALCANZADO!* 🎉\n\n` +
                    `📊 *Meta:* $${(initialInvestment * 2).toLocaleString()}\n` +
                    `💰 *Balance Actual:* $${totalBalance.toLocaleString()}\n\n` +
                    `✅ *Acción:* Inversión inicial recuperada ($${initialInvestment.toLocaleString()})\n` +
                    `💵 *Nuevo Capital Operativo:* $${this.state.operatingCapital.toLocaleString()}\n` +
                    `🏦 *Fondos en Reserva:* $${this.state.reservedFunds.toLocaleString()}\n\n` +
                    `¡Ahora operas con 0% de riesgo de capital inicial!`
                );
            }
            return;
        }

        // Milestone 2+: Escalar cada 10x del capital operativo
        if (investmentRecovered) {
            const targetFor10x = this.state.operatingCapital * 10;

            if (totalBalance >= targetFor10x) {
                const newMilestone = currentMilestone + 1;
                const newOperatingCapital = this.state.operatingCapital * 2;

                await this.achieveMilestone({
                    id: newMilestone,
                    targetBalance: targetFor10x,
                    actionTaken: `Scaled operating capital from $${this.state.operatingCapital} to $${newOperatingCapital}`,
                    newOperatingCapital
                });

                this.state.operatingCapital = newOperatingCapital;
                this.state.reservedFunds = totalBalance - newOperatingCapital;
                this.state.currentMilestone = newMilestone;

                logger.info({
                    milestone: newMilestone,
                    totalBalance,
                    operatingCapital: newOperatingCapital,
                    reservedFunds: this.state.reservedFunds
                }, `🎉 MILESTONE ${newMilestone}: Capital scaled!`);

                // Notificar
                if (this.notifier) {
                    await this.notifier.sendAlert(
                        'SUCCESS',
                        `🚀 *MILESTONE ${newMilestone} ALCANZADO!* 🚀\n\n` +
                        `📊 *Meta:* $${targetFor10x.toLocaleString()} (10x)\n` +
                        `💰 *Balance Actual:* $${totalBalance.toLocaleString()}\n\n` +
                        `✅ *Acción:* Capital operativo duplicado\n` +
                        `💵 *Nuevo Capital Operativo:* $${newOperatingCapital.toLocaleString()}\n` +
                        `🏦 *Fondos en Reserva:* $${this.state.reservedFunds.toLocaleString()}\n\n` +
                        `¡Crecimiento sostenible activado!`
                    );
                }
            }
        }
    }

    /**
     * Registra un milestone alcanzado
     */
    private async achieveMilestone(milestone: Milestone): Promise<void> {
        milestone.achievedAt = new Date().toISOString();
        this.state.milestoneHistory.push(milestone);
        await this.saveState();
    }

    /**
     * Obtiene el capital operativo actual (para RiskManager)
     */
    getOperatingCapital(): number {
        return this.state.operatingCapital;
    }

    /**
     * Obtiene el balance total
     */
    getTotalBalance(): number {
        return this.state.totalBalance;
    }

    /**
     * Obtiene los fondos en reserva
     */
    getReservedFunds(): number {
        return this.state.reservedFunds;
    }

    /**
     * Obtiene el estado completo (para reporting)
     */
    getState(): CapitalState {
        return { ...this.state };
    }

    /**
     * Obtiene información de milestone actual
     */
    getCurrentMilestoneInfo(): { current: number; next: number; progress: number } {
        const { operatingCapital, totalBalance, investmentRecovered, initialInvestment } = this.state;

        if (!investmentRecovered) {
            // Milestone 1: $1k → $2k
            return {
                current: 0,
                next: initialInvestment * 2,
                progress: (totalBalance / (initialInvestment * 2)) * 100
            };
        } else {
            // Milestone 2+: 10x del operating capital
            const nextTarget = operatingCapital * 10;
            return {
                current: this.state.currentMilestone,
                next: nextTarget,
                progress: (totalBalance / nextTarget) * 100
            };
        }
    }
}

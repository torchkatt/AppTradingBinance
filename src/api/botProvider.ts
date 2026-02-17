import { EventEmitter } from 'events';
import type { TradingBot } from '../core/TradingBot.js';

class BotProvider extends EventEmitter {
    private bot: TradingBot | null = null;

    setBot(bot: TradingBot) {
        this.bot = bot;
        this.emit('registered', bot);
    }

    getBot(): TradingBot | null {
        return this.bot;
    }
}

export const botProvider = new BotProvider();

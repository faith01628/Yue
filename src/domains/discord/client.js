import { Client, GatewayIntentBits, Options } from 'discord.js';
import 'dotenv/config';

export function createDiscordClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
        ],
        makeCache: Options.cacheWithLimits({
            MessageManager: 50, // Chỉ giữ tối đa 50 tin nhắn mỗi channel trong RAM
            StageScale: 0,
            PresenceManager: 0,
            VoiceStateManager: 50,
            ReactionManager: 0,
            ThreadManager: 0,
        }),
        sweepers: {
            ...Options.DefaultSweeperSettings,
            messages: {
                interval: 300, // Dọn dẹp mỗi 5 phút
                lifetime: 900,  // Xóa tin nhắn cũ hơn 15 phút khỏi RAM
            },
        }
    });
}

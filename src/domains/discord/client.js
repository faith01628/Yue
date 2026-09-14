import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

export function createDiscordClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });
}

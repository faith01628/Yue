import 'dotenv/config';
import { createDiscordClient } from './src/domains/discord/client.js';
import { isHeavyLibraryOn, botConfig } from './src/domains/shared/config/botConfig.js';
import { registerReadyHandler } from './src/domains/discord/handlers/readyHandler.js';
import { registerInteractionHandler } from './src/domains/discord/handlers/interactionHandler.js';
import { registerMessageHandler } from './src/domains/discord/handlers/messageHandler.js';
import { registerVoiceStateHandler } from './src/domains/discord/handlers/voiceStateHandler.js';

// 📦 NẠP AN TOÀN FFMPEG NẾU ĐƯỢC BẬT TRONG MASTER CONFIG
if (isHeavyLibraryOn('ffmpeg')) {
    try {
        const ffmpegpath = (await import('ffmpeg-static')).default;
        if (ffmpegpath) process.env.FFMPEG_PATH = ffmpegpath;
    } catch (err) {
        console.warn('⚠️ Không thể nạp ffmpeg-static (Môi trường Server VPS).');
    }
}

const client = createDiscordClient();

// ⚡ ĐĂNG KÝ TOÀN BỘ CÁC EVENT HANDLERS TỪ DISCORD DOMAIN
registerReadyHandler(client);
registerInteractionHandler(client);
registerMessageHandler(client);
registerVoiceStateHandler(client);

// 🚀 KHỞI CHẠY DISCORD BOT CLIENT
if (botConfig.discord?.enabled !== false) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.log("⚡ [Master Control Panel] Client Bot Discord đang TẮT theo cấu hình!");
}
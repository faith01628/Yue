import { Client, GatewayIntentBits } from 'discord.js';
import { askYue } from './src/services/aiService.js'; 
import { handleJoinCommand } from './src/commands/join.js'; 
import { handleLeaveCommand } from './src/commands/leave.js';
import { handleInfoCommand } from './src/commands/info.js'; 
import { handleSetupCommand } from './src/commands/setup.js';
import { handleListenCommand } from './src/commands/listen.js';
import { 
    handleOsuProfileCommand, 
    handleOsuRecentCommand, 
    handleOsuTopCommand, 
    handleOsuWhatIfCommand,
    handleOsuRenderCommand
} from './src/commands/osu.js';
import 'dotenv/config';

import ffmpegpath from 'ffmpeg-static';
process.env.FFMPEG_PATH = ffmpegpath;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates, 
    ]
});

client.once('clientReady', () => {
    console.log(`\n🤖 Yue AI đã sẵn sàng hoạt động!`);
    console.log(`💬 Chat text tại kênh "con-vợ-ai"`);
    console.log(`🎙️ Gõ lệnh "!join" khi đang ở trong phòng thoại để trò chuyện trực tiếp.\n`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ==========================================================
    // ⚡ BẮT TỰ ĐỘNG FILE REPLAY (.OSR) KHÔNG CẦN LỆNH
    // ==========================================================
    const hasOsrFile = message.attachments.some(file => file.name && file.name.endsWith('.osr'));
    if (hasOsrFile) {
        return await handleOsuRenderCommand(message);
    }

    const command = message.content.trim();

    // ==========================================================
    // ĐIỀU HƯỚNG LỆNH PREFIX (COMMAND ROUTING)
    // ==========================================================
    if (command === '!infoyue') {
        return await handleInfoCommand(message);
    }

    if (command === '!setupyue') { 
        return await handleSetupCommand(message);
    }

    if (command === '!join') {
        return await handleJoinCommand(message);
    }

    if (command === '!listen') { 
        return await handleListenCommand(message);
    }
    
    if (command === '!out') { 
        return await handleLeaveCommand(message);
    }

    // --- CÁC LỆNH OSU! ---
    if (command.startsWith('!osu') || command.startsWith('!profile')) {
        return await handleOsuProfileCommand(message);
    }

    if (command.startsWith('!rs') || command.startsWith('!recent')) {
        return await handleOsuRecentCommand(message);
    }

    if (command.startsWith('!top') || command.startsWith('!t')) {
        return await handleOsuTopCommand(message);
    }

    if (command.startsWith('!wi') || command.startsWith('!whatif')) {
        return await handleOsuWhatIfCommand(message);
    }

    if (command.startsWith('!render') || command.startsWith('!ordr')) {
        return await handleOsuRenderCommand(message);
    }

    // ==========================================================
    // XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI
    // ==========================================================
    const isMentioned = message.mentions.has(client.user);
    const isSpecialChannel = message.channel.name === 'con-vợ-ai';

    if (isMentioned || isSpecialChannel) {
        try {
            if (message.reference && message.reference.messageId) {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.author.id !== client.user.id) {
                    return; 
                }
            }

            await message.channel.sendTyping();

            let userPrompt = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
            
            const hasAttachments = message.attachments.size > 0;
            const hasEmbeds = message.embeds.length > 0;

            if (!userPrompt) {
                if (hasAttachments || hasEmbeds) {
                    userPrompt = "[Gửi một tệp đính kèm/hình ảnh/video/link]";
                } else {
                    return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
                }
            }

            const userId = message.author.id;
            const username = message.member?.displayName || message.author.username; 

            const aiResponse = await askYue(userId, username, userPrompt, message); 
            await message.reply(aiResponse);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI ở index:", error);
            await message.reply("Huhu, đầu tui đang bị quá tải rồi... 💥");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
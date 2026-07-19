import { Client, GatewayIntentBits } from 'discord.js';
import { askYue } from './src/services/aiService.js'; 
import { handleJoinCommand } from './src/commands/join.js'; 
import { handleLeaveCommand } from './src/commands/leave.js';
import { handleInfoCommand } from './src/commands/info.js'; 
import { handleSetupCommand } from './src/commands/setup.js'; // Đường dẫn chuẩn theo file setup.js của ông
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

    const command = message.content.trim();

    // ==========================================================
    // ĐIỀU HƯỚNG LỆNH (COMMAND ROUTING)
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
    
    if (command === '!out') { 
        return await handleLeaveCommand(message);
    }

    // ==========================================================
    // XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI
    // ==========================================================
    const isMentioned = message.mentions.has(client.user);
    const isSpecialChannel = message.channel.name === 'con-vợ-ai';

    if (isMentioned || isSpecialChannel) {
        try {
            // Bộ lọc chặn tin nhắn Reply dạo của Bot
            if (message.reference && message.reference.messageId) {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.author.id !== client.user.id) {
                    return; 
                }
            }

            await message.channel.sendTyping();

            // Lọc bỏ tag Bot ra khỏi nội dung chữ
            let userPrompt = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
            
            // --- 🛠️ LOGIC ĐÁNH CHẶN HÌNH ẢNH / GIF / LINK ---
            const hasAttachments = message.attachments.size > 0;
            const hasEmbeds = message.embeds.length > 0;

            if (!userPrompt) {
                if (hasAttachments || hasEmbeds) {
                    // Nếu gửi ảnh/link trống không gõ chữ, gán text ẩn để ép gửi lên Gemini xử lý theo systemPrompt
                    userPrompt = "[Gửi một tệp đính kèm/hình ảnh/video/link]";
                } else {
                    // Nếu thực sự không gửi gì cả (chỉ tag khơi khơi)
                    return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
                }
            }
            // ------------------------------------------------

            const userId = message.author.id;
            const username = message.member?.displayName || message.author.username; 

            // Gửi dữ liệu lên hệ thống đa não (hàm askYue)
            const aiResponse = await askYue(userId, username, userPrompt, message); 
            await message.reply(aiResponse);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI ở index:", error);
            await message.reply("Huhu, đầu tui đang bị quá tải rồi... 💥");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
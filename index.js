import { Client, GatewayIntentBits } from 'discord.js';
import { askYue } from './src/services/aiService.js';
import { handleJoinCommand } from './src/commands/join.js';
import { handleLeaveCommand } from './src/commands/leave.js';
import { handleInfoCommand } from './src/commands/info.js';
import { handleSetupCommand } from './src/commands/setup.js';
import { handleListenCommand } from './src/commands/listen.js';
import { handleMakeRoomCommand } from './src/commands/osu/makeRoomCommand.js';
import { handleInviteCommand } from './src/commands/osu/inviteCommand.js';
import { handleCloseMatchCommand } from './src/commands/osu/closeMatchCommand.js';

import {
    handleOsuProfileCommand,
    handleOsuRecentCommand,
    handleOsuTopCommand,
    handleOsuWhatIfCommand,
    handleOsuCompareCommand,
    handleOsuMapCommand,
    handleOsuLeaderboardCommand,
    handleOsuNoChokeCommand,
    handleOsuCalcPPCommand,
    handleOsuLinkSlashCommand
} from './src/commands/osu/index.js';
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

// ==========================================================
// ⚡ 1. EVENT CLIENT READY
// ==========================================================
client.once('clientReady', () => {
    console.log(`\n🤖 Yue AI đã sẵn sàng hoạt động!`);
    console.log(`💬 Chat text tại kênh "con-vợ-ai"`);
    console.log(`🎙️ Gõ lệnh ".join" khi đang ở trong phòng thoại để trò chuyện trực tiếp.\n`);
});

// ==========================================================
// ⚡ 2. XỬ LÝ SLASH COMMANDS (/link...)
// ==========================================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'link') {
            await handleOsuLinkSlashCommand(interaction);
        }
    } catch (error) {
        console.error('❌ Lỗi xử lý Interaction:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Có lỗi xảy ra khi xử lý lệnh này rồi ông ơi!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Có lỗi xảy ra khi xử lý lệnh này rồi ông ơi!', ephemeral: true });
        }
    }
});

// ==========================================================
// ⚡ 3. XỬ LÝ MESSAGE CREATE (LỆNH PREFIX & AI CHAT)
// ==========================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();

    // --- CÁC LỆNH HỆ THỐNG ---
    if (content === '.infoyue') return await handleInfoCommand(message);
    if (content === '.setupyue') return await handleSetupCommand(message);
    if (content === '.join') return await handleJoinCommand(message);
    if (content === '.listen') return await handleListenCommand(message);
    if (content === '.out') return await handleLeaveCommand(message);

    // --- CÁC LỆNH OSU! ---
    if (content.startsWith('.osu') || content.startsWith('.profile') || content.startsWith('.p')) {
        return await handleOsuProfileCommand(message);
    }
    if (content.startsWith('.rs') || content.startsWith('.recent') || content.startsWith('.r')) {
        return await handleOsuRecentCommand(message);
    }
    if (content.startsWith('.top') || content.startsWith('.t')) {
        return await handleOsuTopCommand(message);
    }
    if (content.startsWith('.wi') || content.startsWith('.whatif')) {
        return await handleOsuWhatIfCommand(message);
    }

    // 🎯 LỆNH ĐÓNG PHÒNG MULTI (Đưa lên trước .c để không bị nuốt lệnh)
    if (content.startsWith('.matchclose') || content.startsWith('.close') || content.startsWith('.mc')) {
        return await handleCloseMatchCommand(message);
    }

    // 🎯 Lệnh Compare (Dùng regex \b để chỉ bắt chữ .c đơn lẻ, không bắt .cm / .close)
    if (content.startsWith('.compare') || content.match(/^\.c\b/i)) {
        return await handleOsuCompareCommand(message);
    }

    // 🎯 Lệnh Beatmap (Dùng regex \b để không bắt .mr / .make-room)
    if (content.startsWith('.map') || content.match(/^\.m\b/i)) {
        return await handleOsuMapCommand(message);
    }

    if (content.startsWith('.lb') || content.startsWith('.leaderboard')) {
        return await handleOsuLeaderboardCommand(message);
    }
    if (content.startsWith('.nc') || content.startsWith('.nochoke')) {
        return await handleOsuNoChokeCommand(message);
    }
    if (content.startsWith('.pp') || content.startsWith('.calc')) {
        return await handleOsuCalcPPCommand(message);
    }

    // 🎯 Lệnh Make Room & Invite
    if (content.startsWith('.mr') || content.startsWith('.make-room') || content.startsWith('.lobby')) {
        return await handleMakeRoomCommand(message);
    }
    if (content.startsWith('.invosu') || content.startsWith('.inv') || content.startsWith('.invite')) {
        return await handleInviteCommand(message);
    }

    // ==========================================================
    // ⚡ 4. XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI
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

            let userPrompt = message.content
                .replace(`<@!${client.user.id}>`, '')
                .replace(`<@${client.user.id}>`, '')
                .trim();

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
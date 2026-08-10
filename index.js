import { Client, GatewayIntentBits } from 'discord.js';
import { askYue, askYueWithVision } from './src/services/aiService.js';
import { saveMessageToLocalHistory, saveYueReplyToLocalHistory } from './src/services/chatHistoryManager.js';
import { handleJoinCommand } from './src/commands/join.js';
import { handleLeaveCommand } from './src/commands/leave.js';
import { handleInfoCommand } from './src/commands/info.js';
import { handleSetupCommand } from './src/commands/setup.js';
import { handleListenCommand } from './src/commands/listen.js';
import { handleMakeRoomCommand } from './src/commands/osu/makeRoomCommand.js';
import { handleInviteCommand } from './src/commands/osu/inviteCommand.js';
import { handleCloseMatchCommand } from './src/commands/osu/closeMatchCommand.js';
import { handleJoinRoomCommand } from './src/commands/osu/joinRoomCommand.js';

// 🧠 IMPORT BỘ NÃO & QUẢN LÝ BỘ NHỚ CỦA YUE
import { buildContext } from './src/brain/contextBuilder.js';
// import { parseIntent } from './src/brain/intentParserService.js';
// import { processMemoryCandidate } from './src/brain/memoryManagerService.js';

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

    if (message.content.startsWith('.joinroom') || message.content.startsWith('!joinroom')) {
        return await handleJoinRoomCommand(message);
    }

    // Kiểm tra .r có khoảng trắng phía sau hoặc chỉ duy nhất chữ .r
    if (
        content.startsWith('.rs') ||
        content.startsWith('.recent') ||
        content.startsWith('.r ') ||
        content === '.r' ||
        content.match(/^\.m\b/i)
    ) {
        return await handleOsuRecentCommand(message);
    }

    if (content.startsWith('.top') || content.startsWith('.t')) {
        return await handleOsuTopCommand(message);
    }
    if (content.startsWith('.wi') || content.startsWith('.whatif')) {
        return await handleOsuWhatIfCommand(message);
    }

    // 🎯 LỆNH ĐÓNG PHÒNG MULTI
    if (content.startsWith('.matchclose') || content.startsWith('.close') || content.startsWith('.mc')) {
        return await handleCloseMatchCommand(message);
    }

    // 🎯 Lệnh Compare
    if (content.startsWith('.compare') || content.match(/^\.c\b/i)) {
        return await handleOsuCompareCommand(message);
    }

    // 🎯 Lệnh Beatmap
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
    // ⚡ 4. XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI AGENT (BRAIN INTEGRATION)
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

            const attachment = message.attachments.first();
            const isImage = attachment && attachment.contentType?.startsWith('image/');

            if (!userPrompt && !isImage) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

            // 💾 LƯU TIN NHẮN CỦA USER VÀO BỘ ĐỆM LỊCH SỬ KÊNH LOCAL
            saveMessageToLocalHistory(message.channel.id, {
                authorId: message.author.id,
                authorName: message.member?.displayName || message.author.username,
                content: userPrompt,
                isBot: false,
                hasAttachment: Boolean(isImage),
                timestamp: message.createdTimestamp
            });

            // 🧠 BƯỚC 1: DỰNG CONTEXT (4 LAYERS & RUNTIME PROFILE)
            const runtimeContext = await buildContext(message, userPrompt);

            // // 🧠 BƯỚC 2: PHÂN TÍCH Ý ĐỊNH BẰNG INTENT PARSER (XUẤT JSON)
            // const parsedIntent = await parseIntent(userPrompt, runtimeContext);

            // // 🧠 BƯỚC 3: ĐÁNH GIÁ VÀ LƯU KÝ ỨC QUA MEMORY MANAGER
            // if (parsedIntent.memoryCandidate) {
            //     processMemoryCandidate(message.author.id, parsedIntent.memoryCandidate);
            // }

            // 🧠 BƯỚC 4: REASONING ENGINE (TRẢ LỜI NGƯỜI DÙNG KÈM THEO KÝ ỨC)
            let aiResponse = "";
            if (isImage) {
                aiResponse = await askYueWithVision(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    userPrompt,
                    attachment.url,
                    attachment.contentType
                );
            } else {
                aiResponse = await askYue(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    userPrompt,
                    message,
                    false,          // isVoice
                    null,           // ingameContext
                    runtimeContext  // runtimeContext
                );
            }

            // 💾 LƯU PHẢN HỒI CỦA YUE VÀO BỘ ĐỆM LỊCH SỬ LOCAL
            saveYueReplyToLocalHistory(message.channel.id, aiResponse);

            await message.reply(aiResponse);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI ở index:", error);
            await message.reply("Huhu, đầu tui đang bị quá tải rồi... 💥");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
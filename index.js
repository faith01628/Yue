import { Client, GatewayIntentBits } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { askYue, askYueWithVision, extractMediaFromMessage } from './src/services/aiService.js';
import { checkVoiceChannelState } from './src/services/voiceAutoLeaveService.js';
import { saveMessageToLocalHistory, saveYueReplyToLocalHistory, getConsecutiveGifCount } from './src/services/chatHistoryManager.js';
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
    handleOsuLinkSlashCommand,
    handleOsuStatCommand,
    handleNaturalLanguageMapRequest,
    handlePickMapCommand
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

    const firstWord = content.split(/ +/)[0].toLowerCase();

    // --- 1. CÁC LỆNH HỆ THỐNG ---
    if (firstWord === '.infoyue') return await handleInfoCommand(message);
    if (firstWord === '.setupyue') return await handleSetupCommand(message);
    if (firstWord === '.join') return await handleJoinCommand(message);
    if (firstWord === '.listen') return await handleListenCommand(message);
    if (firstWord === '.out' || firstWord === '.leave') return await handleLeaveCommand(message);

    // --- 2. CÁC LỆNH OSU! MULTIPLAYER & ROOM ---
    if (firstWord === '.mr' || firstWord === '.make-room' || firstWord === '.makeroom' || firstWord === '.lobby') {
        return await handleMakeRoomCommand(message);
    }
    if (firstWord === '.inv' || firstWord === '.invite' || firstWord === '.invosu') {
        return await handleInviteCommand(message);
    }
    if (firstWord === '.close' || firstWord === '.matchclose' || firstWord === '.mc') {
        return await handleCloseMatchCommand(message);
    }
    if (firstWord === '.joinroom' || firstWord === '!joinroom') {
        return await handleJoinRoomCommand(message);
    }

    // --- 3. CÁC LỆNH OSU! BANCHO STATS & BEATMAP ---
    // Profile (.profile, .p, .osu, .user)
    if (firstWord === '.profile' || firstWord === '.p' || firstWord === '.osu' || firstWord === '.user') {
        return await handleOsuProfileCommand(message);
    }

    // Detailed Stats (.stat, .stats, .st)
    if (firstWord === '.stat' || firstWord === '.stats' || firstWord === '.st') {
        return await handleOsuStatCommand(message);
    }

    // Recent Play (.r, .recent, .rs, .rc, .rm, .rt)
    if (firstWord === '.r' || firstWord === '.recent' || firstWord === '.rs' || firstWord === '.rc' || firstWord === '.rm' || firstWord === '.rt') {
        return await handleOsuRecentCommand(message);
    }

    // Top Plays (.top, .t, hoặc .top10 / .t5)
    if (firstWord === '.top' || firstWord === '.t' || /^\.t\d+$/i.test(firstWord) || /^\.top\d+$/i.test(firstWord) || /^\!top\d+$/i.test(firstWord) || /^\!t\d+$/i.test(firstWord)) {
        return await handleOsuTopCommand(message);
    }

    // Compare (.compare, .c)
    if (firstWord === '.compare' || firstWord === '.c') {
        return await handleOsuCompareCommand(message);
    }

    // Beatmap Info (.map, .m)
    if (firstWord === '.map' || firstWord === '.m') {
        return await handleOsuMapCommand(message);
    }

    // Leaderboard (.lb, .leaderboard)
    if (firstWord === '.lb' || firstWord === '.leaderboard') {
        return await handleOsuLeaderboardCommand(message);
    }

    // NoChoke (.nc, .nochoke)
    if (firstWord === '.nc' || firstWord === '.nochoke') {
        return await handleOsuNoChokeCommand(message);
    }

    // WhatIf (.wi, .whatif)
    if (firstWord === '.wi' || firstWord === '.whatif') {
        return await handleOsuWhatIfCommand(message);
    }

    // PP Simulator / Calc (.pp, .calc)
    if (firstWord === '.pp' || firstWord === '.calc') {
        return await handleOsuCalcPPCommand(message);
    }

    // Pick Map Recommender Direct Command (.pm, .pickmap, .rec) - KHÔNG TỐN AI TOKEN!
    if (firstWord === '.pm' || firstWord === '.pickmap' || firstWord === '.rec') {
        return await handlePickMapCommand(message);
    }

    // ==========================================================
    // ⚡ 4. XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI AGENT (BRAIN INTEGRATION)
    // ==========================================================
    const isMentioned = message.mentions.has(client.user);
    const isSpecialChannel = message.channel.name === 'con-vợ-ai';

    // ⛔ 🛡️ BẢO VỆ DUNG LƯỢNG BỘ NHỚ KÊNH:
    // CHỈ XỬ LÝ KHI: Được tag tên (@yue) HOẶC là kênh chat riêng "con-vợ-ai".
    // Mọi kênh chat thường khác nếu người dùng không đề cập @yue -> BỎ QUA NGAY LẬP TỨC (Không ghi file rác!).
    if (!isMentioned && !isSpecialChannel) {
        return;
    }

    // 1. Trích xuất media & nội dung tin nhắn
    let userPrompt = message.content
        .replace(`<@!${client.user.id}>`, '')
        .replace(`<@${client.user.id}>`, '')
        .trim();

    const mediaData = await extractMediaFromMessage(message);
    const isImage = Boolean(mediaData);

    // 💾 LƯU TIN NHẮN CỦA USER VÀO BỘ ĐỆM LỊCH SỬ KÊNH LOCAL (Chỉ lưu trong kênh con-vợ-ai hoặc khi có tag Yue)
    saveMessageToLocalHistory(message.channel.id, {
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        content: userPrompt || message.content,
        isBot: false,
        hasAttachment: isImage,
        timestamp: message.createdTimestamp
    });

    // 2. Xử lý Reply Reference (Trả lời tin nhắn người dùng khác)
    let repliedContextText = "";
    let isReplyToOtherUserWithoutMention = false;

    if (message.reference && message.reference.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            const isReplyingToYue = repliedMessage.author.id === client.user.id;

            if (!isReplyingToYue && !isMentioned) {
                // Người dùng rep tin nhắn của người khác và KHÔNG tag Yue -> Đã lưu history ở trên, dừng không trả lời AI
                isReplyToOtherUserWithoutMention = true;
            } else if (!isReplyingToYue && isMentioned) {
                // Người dùng rep tin nhắn của người khác VÀ CÓ tag @yue -> Trích xuất tin nhắn của người được rep làm ngữ cảnh
                const targetAuthorName = repliedMessage.member?.displayName || repliedMessage.author.username;
                const cleanRepliedContent = (repliedMessage.content || '').replace(/\r?\n/g, ' ').slice(0, 100);
                repliedContextText = `[ĐANG REP TIN NHẮN CỦA ${targetAuthorName}: "${cleanRepliedContent}"]\n`;
            }
        } catch (fetchErr) {
            console.warn("⚠️ Không thể fetch nội dung tin nhắn reply reference:", fetchErr.message);
        }
    }

    if (isReplyToOtherUserWithoutMention) {
        return;
    }

    if (isMentioned || isSpecialChannel) {
        try {
            await message.channel.sendTyping();

            if (!userPrompt && !isImage) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

            // Gắn ngữ cảnh rep tin nhắn (nếu có) vào prompt người dùng
            const fullUserPromptWithReply = `${repliedContextText}${userPrompt}`.trim();

            // 🧠 BƯỚC 1: DỰNG CONTEXT (4 LAYERS & RUNTIME PROFILE)
            const runtimeContext = await buildContext(message, fullUserPromptWithReply);

            // 🧠 BƯỚC 2: KIỂM TRA MỨC ĐỘ SPAM GIF LIÊN TỤC CỦA USER NÀY
            const consecutiveGifCount = getConsecutiveGifCount(message.channel.id, message.author.id);
            const isGifSpam = isImage && consecutiveGifCount >= 3 && (!userPrompt || userPrompt.length < 15);

            // 🧠 BƯỚC 3: KIỂM TRA & XỬ LÝ YÊU CẦU GỢI Ý BEATMAP BẰNG NGÔN NGỮ TỰ NHIÊN
            if (!isImage) {
                const handledAsMapReq = await handleNaturalLanguageMapRequest(message, fullUserPromptWithReply, runtimeContext);
                if (handledAsMapReq) {
                    return;
                }
            }

            // 🧠 BƯỚC 4: REASONING ENGINE (TRẢ LỜI NGƯỜI DÙNG KÈM THEO KÝ ỨC)
            let aiResponse = "";
            if (isImage) {
                aiResponse = await askYueWithVision(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    fullUserPromptWithReply,
                    mediaData.url,
                    mediaData.mimeType,
                    isGifSpam,
                    runtimeContext
                );
            } else {
                aiResponse = await askYue(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    fullUserPromptWithReply,
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

// ==========================================================
// ⚡ 4. XỬ LÝ SỰ KIỆN NGUỜI DÙNG RA/VÀO PHÒNG VOICE (AUTO LEAVE 5 PHÚT)
// ==========================================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = oldState.guild || newState.guild;
    if (!guild) return;

    const connection = getVoiceConnection(guild.id);
    if (!connection) return;

    const botChannelId = connection.joinConfig.channelId;
    if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
        checkVoiceChannelState(guild, botChannelId);
    }
});

client.login(process.env.DISCORD_TOKEN);
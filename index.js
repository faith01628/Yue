import { Client, GatewayIntentBits } from 'discord.js';
import { askYue, askYueWithVision, extractMediaFromMessage } from './src/services/aiService.js';
import { saveMessageToLocalHistory, saveYueReplyToLocalHistory, getConsecutiveGifCount } from './src/services/chatHistoryManager.js';
import { checkAntiSpam } from './src/services/antiSpamService.js';
import { handleInfoCommand } from './src/commands/info.js';
import { handleSetupCommand } from './src/commands/setup.js';

// 🧠 IMPORT BỘ NÃO & QUẢN LÝ BỘ NHỚ CỦA YUE
import { buildContext } from './src/brain/contextBuilder.js';
import { memoryProvider } from './src/brain/MemoryProvider.js';

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
    if (process.env.ENABLE_VOICE === 'true') {
        console.log(`🎙️ Gõ lệnh ".join" khi đang ở trong phòng thoại để trò chuyện trực tiếp.\n`);
    } else {
        console.log(`⚡ [Lite Mode] Chế độ Voice đang TẮT để tối ưu RAM server.\n`);
    }
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

    // --- CÁC LỆNH QUẢN LÝ DANH SÁCH ĐEN / BLACKLIST ---
    if (firstWord === '.listblacklist' || firstWord === '.blacklisted') {
        const blacklisted = memoryProvider.getBlacklistedUsers();
        if (blacklisted.length === 0) {
            return await message.reply("🟢 Hiện tại không có User nào nằm trong Danh sách đen / Blacklist!");
        }

        const listText = blacklisted.map((u, i) => `${i + 1}. **${u.lastKnownName}** (ID: \`${u.discordId}\`) - Hảo cảm: ${u.score} EXP`).join('\n');
        return await message.reply(`⛔ **DANH SÁCH USER ĐANG BỊ CẤM / BLACKLIST (${blacklisted.length}):**\n${listText}\n\n👉 Dùng \`.unblacklist <ID>\` để mở cấm hoặc \`.resetscore <ID>\` để reset điểm.`);
    }

    if (firstWord === '.blacklist' || firstWord === '.block') {
        const isCreator = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
        if (!isCreator) {
            return await message.reply("Chỉ có Creator (Katashi) mới có quyền thêm user vào Blacklist nha!");
        }

        const mentionedUser = message.mentions.users.first();
        const args = content.split(/ +/).slice(1);
        const targetId = mentionedUser ? mentionedUser.id : (args[0] ? args[0].replace(/[^0-9]/g, '') : null);

        if (!targetId) {
            return await message.reply("Cú pháp: `.blacklist <ID_hoặc_tag_User>`");
        }

        memoryProvider.blacklistUser(targetId);
        return await message.reply(`⛔ Đã đưa User ID \`${targetId}\` vào Blacklist (Hảo cảm 0 EXP). Yue sẽ xem người này là vô hình!`);
    }

    if (firstWord === '.unblacklist' || firstWord === '.unblock') {
        const isCreator = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
        if (!isCreator) {
            return await message.reply("Chỉ có Creator (Katashi) mới có quyền gỡ Blacklist nha!");
        }

        const mentionedUser = message.mentions.users.first();
        const args = content.split(/ +/).slice(1);
        const targetId = mentionedUser ? mentionedUser.id : (args[0] ? args[0].replace(/[^0-9]/g, '') : null);

        if (!targetId) {
            return await message.reply("Cú pháp: `.unblacklist <ID_hoặc_tag_User>`");
        }

        const res = memoryProvider.unblacklistUser(targetId);
        return await message.reply(`🟢 Đã gỡ Blacklist cho User ID \`${targetId}\`. Mức hảo cảm được khôi phục: ${res.profile.affectionScore} EXP (${res.profile.relationshipLevel}).`);
    }

    if (firstWord === '.resetscore') {
        const isCreator = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
        if (!isCreator) {
            return await message.reply("Chỉ có Creator (Katashi) mới có quyền reset điểm hảo cảm nha!");
        }

        const mentionedUser = message.mentions.users.first();
        const args = content.split(/ +/).slice(1);
        const targetId = mentionedUser ? mentionedUser.id : (args[0] ? args[0].replace(/[^0-9]/g, '') : null);

        if (!targetId) {
            return await message.reply("Cú pháp: `.resetscore <ID_hoặc_tag_User>`");
        }

        const res = memoryProvider.resetAffection(targetId);
        return await message.reply(`🔄 Đã reset điểm hảo cảm cho User ID \`${targetId}\` về mốc ${res.profile.affectionScore} EXP (${res.profile.relationshipLevel}).`);
    }

    // --- CÁC LỆNH VOICE (DÙNG ĐIỀU KIỆN ENABLE_VOICE) ---
    if (firstWord === '.join' || firstWord === '.listen' || firstWord === '.out' || firstWord === '.leave') {
        if (process.env.ENABLE_VOICE !== 'true') {
            return await message.reply("⚠️ Tính năng Voice tạm thời đang TẮT trên máy chủ này để tiết kiệm tài nguyên!");
        }
        try {
            if (firstWord === '.join') {
                const { handleJoinCommand } = await import('./src/commands/join.js');
                return await handleJoinCommand(message);
            }
            if (firstWord === '.listen') {
                const { handleListenCommand } = await import('./src/commands/listen.js');
                return await handleListenCommand(message);
            }
            if (firstWord === '.out' || firstWord === '.leave') {
                const { handleLeaveCommand } = await import('./src/commands/leave.js');
                return await handleLeaveCommand(message);
            }
        } catch (vErr) {
            console.error("❌ Lỗi gọi lệnh Voice:", vErr.message);
            return await message.reply("Thư viện Voice chưa được cài đặt trên server.");
        }
    }

    // --- 2. CÁC LỆNH OSU! MULTIPLAYER & ROOM ---
    if (firstWord === '.mr' || firstWord === '.make-room' || firstWord === '.makeroom' || firstWord === '.lobby') {
        const { handleMakeRoomCommand } = await import('./src/commands/osu/makeRoomCommand.js');
        return await handleMakeRoomCommand(message);
    }
    if (firstWord === '.inv' || firstWord === '.invite' || firstWord === '.invosu') {
        const { handleInviteCommand } = await import('./src/commands/osu/inviteCommand.js');
        return await handleInviteCommand(message);
    }
    if (firstWord === '.close' || firstWord === '.matchclose' || firstWord === '.mc') {
        const { handleCloseMatchCommand } = await import('./src/commands/osu/closeMatchCommand.js');
        return await handleCloseMatchCommand(message);
    }
    if (firstWord === '.joinroom' || firstWord === '!joinroom') {
        const { handleJoinRoomCommand } = await import('./src/commands/osu/joinRoomCommand.js');
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
    const configuredChannel = (process.env.SPECIAL_CHANNEL_NAME || 'con-vợ-ai').trim();
    const isSpecialChannel = message.channel.name === configuredChannel || message.channel.name.startsWith(configuredChannel);

    if (!isMentioned && !isSpecialChannel) {
        return;
    }

    // ⛔ CHẶN USER BỊ BLACKLIST (HẢO CẢM <= 0 HOẶC BỊ CẤM)
    if (memoryProvider.isBlacklisted(message.author.id)) {
        console.log(`⛔ [Yue AI] Bỏ qua tin nhắn từ User bị Blacklist (Hảo cảm <= 0): ${message.author.username} (${message.author.id})`);
        return;
    }

    // 1. Trích xuất media & nội dung tin nhắn
    let userPrompt = message.content
        .replace(`<@!${client.user.id}>`, '')
        .replace(`<@${client.user.id}>`, '')
        .trim();

    const mediaData = await extractMediaFromMessage(message);
    const isImage = Boolean(mediaData);

    // 💾 LƯU TIN NHẮN CỦA USER VÀO BỘ ĐỆM LỊCH SỬ KÊNH LOCAL
    saveMessageToLocalHistory(message.channel.id, {
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        content: userPrompt || message.content,
        isBot: false,
        hasAttachment: isImage,
        timestamp: message.createdTimestamp
    });

    // 2. Xử lý Reply Reference
    let repliedContextText = "";
    let isReplyToOtherUserWithoutMention = false;

    if (message.reference && message.reference.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            const isReplyingToYue = repliedMessage.author.id === client.user.id;

            if (!isReplyingToYue && !isMentioned) {
                isReplyToOtherUserWithoutMention = true;
            } else if (!isReplyingToYue && isMentioned) {
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
            // 🛡️ BƯỚC 0: KIỂM TRA ANTI-SPAM TỪ NGƯỜI DÙNG
            const spamCheck = checkAntiSpam(
                message.author.id,
                message.member?.displayName || message.author.username,
                userPrompt || message.content
            );

            if (spamCheck.isSpam) {
                if (spamCheck.replyMessage) {
                    await message.reply(spamCheck.replyMessage);
                }
                return;
            }

            await message.channel.sendTyping();

            if (!userPrompt && !isImage) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

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

            const replySuffix = process.env.BOT_REPLY_SUFFIX ? ` ${process.env.BOT_REPLY_SUFFIX.trim()}` : '';
            await message.reply(`${aiResponse}${replySuffix}`);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI ở index:", error);
            await message.reply("Huhu, đầu tui đang bị quá tải rồi... 💥");
        }
    }
});

// ==========================================================
// ⚡ 4. XỬ LÝ SỰ KIỆN NGUỜI DÙNG RA/VÀO PHÒNG VOICE (AUTO LEAVE 5 PHÚT)
// ==========================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (process.env.ENABLE_VOICE !== 'true') return;
    try {
        const { getVoiceConnection } = await import('@discordjs/voice');
        const { checkVoiceChannelState } = await import('./src/services/voiceAutoLeaveService.js');

        const guild = oldState.guild || newState.guild;
        if (!guild) return;

        const connection = getVoiceConnection(guild.id);
        if (!connection) return;

        const botChannelId = connection.joinConfig.channelId;
        if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
            checkVoiceChannelState(guild, botChannelId);
        }
    } catch (vErr) {
        // Voice module not available, ignore silently
    }
});

client.login(process.env.DISCORD_TOKEN);
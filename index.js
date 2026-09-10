import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

// 🎛️ BẢNG ĐIỀU KHIỂN CẤU HÌNH TRUNG TÂM (MASTER BOT CONTROL PANEL)
import { botConfig, isFeatureOn, isHeavyLibraryOn } from './src/config/botConfig.js';
import { isFeatureEnabled, setFeatureState, loadFeatureToggles } from './src/services/featureToggleService.js';

import { askYue, askYueWithVision, extractMediaFromMessage } from './src/services/aiService.js';
import { saveMessageToLocalHistory, saveYueReplyToLocalHistory, getConsecutiveGifCount } from './src/services/chatHistoryManager.js';
import { checkAntiSpam } from './src/services/antiSpamService.js';
import { handleInfoCommand } from './src/commands/info.js';
import { handleSetupCommand } from './src/commands/setup.js';

// 🧠 BỘ NÃO & QUẢN LÝ BỘ NHỚ CỦA YUE
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
    handlePickMapCommand,
    handleTopMultiCommand
} from './src/commands/osu/index.js';

// 📦 NẠP AN TOÀN FFMPEG NẾU ĐƯỢC BẬT TRONG MASTER CONFIG
if (isHeavyLibraryOn('ffmpeg')) {
    try {
        const ffmpegpath = (await import('ffmpeg-static')).default;
        if (ffmpegpath) process.env.FFMPEG_PATH = ffmpegpath;
    } catch (err) {
        console.warn('⚠️ Không thể nạp ffmpeg-static (Môi trường Server VPS).');
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// ==========================================================
// ⚡ 1. EVENT CLIENT READY & HIỂN THỊ BẢNG TRẠNG THÁI CẤU HÌNH
// ==========================================================
client.once('clientReady', async () => {
    console.log(`\n==========================================================`);
    console.log(`🤖 Yue AI Master Control Panel • Chế độ: [${botConfig.mode.toUpperCase()}]`);
    console.log(`==========================================================`);
    console.log(`📦 Thư viện nặng:`);
    console.log(`   • Voice (@discordjs/voice): ${isHeavyLibraryOn('voice') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • Canvas (@napi-rs/canvas): ${isHeavyLibraryOn('canvas') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • FFMPEG (ffmpeg-static):   ${isHeavyLibraryOn('ffmpeg') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • Edge-TTS (TTS Service):   ${isHeavyLibraryOn('edgeTts') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`🤖 Discord System:`);
    console.log(`   • Bot Discord Core:         ${botConfig.discord?.enabled ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • Chat AI Text Discord:     ${isFeatureEnabled('chatDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • Voice Discord Chat:       ${isFeatureEnabled('voiceDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`🎮 Osu System:`);
    console.log(`   • Lệnh Osu Discord:         ${isFeatureEnabled('osuCommandsDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`   • Bancho IRC & Room 24/7:   ${isFeatureEnabled('multiOsu') ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`==========================================================\n`);

    // Khởi tạo Bancho IRC cho phòng Multi 24/7 nếu được bật trong config
    if (isFeatureEnabled('multiOsu')) {
        try {
            const { setDiscordClient } = await import('./src/services/multi247/room247Manager.js');
            setDiscordClient(client);
            const { initBancho } = await import('./src/services/osu/banchoService.js');
            await initBancho();
        } catch (bErr) {
            console.error('❌ Lỗi tự động khởi tạo Bancho IRC:', bErr.message);
        }
    }
});

// ==========================================================
// ⚡ 2. XỬ LÝ SLASH COMMANDS (/link...)
// ==========================================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'link') {
            if (!isFeatureOn('osuDiscordCommands', 'linkSlash')) {
                return await interaction.reply({ content: '🔴 Lệnh slash /link tạm thời đang TẮT trong cấu hình code!', ephemeral: true });
            }
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

    // --- 1. CÁC LỆNH HỆ THỐNG (.infoyue, .setupyue) ---
    if (firstWord === '.infoyue' || firstWord === '.setupyue') {
        if (!isFeatureOn('discord', 'systemCommands')) {
            return await message.reply("🔴 Các lệnh hệ thống tạm thời đang TẮT trong cấu hình!");
        }
        if (firstWord === '.infoyue') return await handleInfoCommand(message);
        if (firstWord === '.setupyue') return await handleSetupCommand(message);
    }

    // --- CÁC LỆNH QUẢN LÝ DANH SÁCH ĐEN / BLACKLIST ---
    if (['.listblacklist', '.blacklisted', '.blacklist', '.block', '.unblacklist', '.unblock', '.resetscore'].includes(firstWord)) {
        if (!isFeatureOn('discord', 'blacklistManagement')) {
            return await message.reply("🔴 Quản lý Danh sách đen tạm thời đang TẮT trong cấu hình!");
        }

        if (firstWord === '.listblacklist' || firstWord === '.blacklisted') {
            const blacklisted = memoryProvider.getBlacklistedUsers();
            if (blacklisted.length === 0) {
                return await message.reply("🟢 Hiện tại không có User nào nằm trong Danh sách đen / Blacklist!");
            }
            const listText = blacklisted.map((u, i) => `${i + 1}. **${u.lastKnownName}** (ID: \`${u.discordId}\`) - Hảo cảm: ${u.score} EXP`).join('\n');
            return await message.reply(`⛔ **DANH SÁCH USER ĐANG BỊ CẤM / BLACKLIST (${blacklisted.length}):**\n${listText}\n\n👉 Dùng \`.unblacklist <ID>\` để mở cấm hoặc \`.resetscore <ID>\` để reset điểm.`);
        }

        const isCreator = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
        if (!isCreator) {
            return await message.reply("Chỉ có Creator (Katashi) mới có quyền quản lý Blacklist nha!");
        }

        const mentionedUser = message.mentions.users.first();
        const args = content.split(/ +/).slice(1);
        const targetId = mentionedUser ? mentionedUser.id : (args[0] ? args[0].replace(/[^0-9]/g, '') : null);

        if (firstWord === '.blacklist' || firstWord === '.block') {
            if (!targetId) return await message.reply("Cú pháp: `.blacklist <ID_hoặc_tag_User>`");
            memoryProvider.blacklistUser(targetId);
            return await message.reply(`⛔ Đã đưa User ID \`${targetId}\` vào Blacklist (Hảo cảm 0 EXP). Yue sẽ xem người này là vô hình!`);
        }

        if (firstWord === '.unblacklist' || firstWord === '.unblock') {
            if (!targetId) return await message.reply("Cú pháp: `.unblacklist <ID_hoặc_tag_User>`");
            const res = memoryProvider.unblacklistUser(targetId);
            return await message.reply(`🟢 Đã gỡ Blacklist cho User ID \`${targetId}\`. Mức hảo cảm được khôi phục: ${res.profile.affectionScore} EXP (${res.profile.relationshipLevel}).`);
        }

        if (firstWord === '.resetscore') {
            if (!targetId) return await message.reply("Cú pháp: `.resetscore <ID_hoặc_tag_User>`");
            const res = memoryProvider.resetAffection(targetId);
            return await message.reply(`🔄 Đã reset điểm hảo cảm cho User ID \`${targetId}\` về mốc ${res.profile.affectionScore} EXP (${res.profile.relationshipLevel}).`);
        }
    }

    // --- CÁC LỆNH BẬT / TẮT TÍNH NĂNG (FEATURE TOGGLES) ---
    if (firstWord === '.toggles' || firstWord === '.features' || firstWord === '.botstatus') {
        const toggles = loadFeatureToggles();
        const statusText = 
            `⚙️ **BẢNG ĐIỀU KHIỂN NGUYÊN BẢN CỦA YUE BOT (MODE: ${botConfig.mode.toUpperCase()}):**\n\n` +
            `• 💬 Chat AI Discord: ${isFeatureEnabled('chatDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
            `• 🎙️ Voice Discord: ${isFeatureEnabled('voiceDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
            `• 🎮 Lệnh Osu Discord: ${isFeatureEnabled('osuCommandsDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
            `• 🌐 Osu Multiplayer & 24/7 Room: ${isFeatureEnabled('multiOsu') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
            `• 🎨 Canvas Cards (Stat/Profile): ${isHeavyLibraryOn('canvas') ? '🟢 BẬT' : '🔴 TẮT'}\n\n` +
            `👉 *Creator (Katashi) gõ \`.toggle <chat|voice|osu|multi> <on|off>\` để bật/tắt động.*`;
        return await message.reply(statusText);
    }

    if (firstWord === '.toggle' || firstWord === '.toggleset') {
        const isCreator = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
        if (!isCreator) {
            return await message.reply("Chỉ có Creator (Katashi) mới có quyền công tắc bật/tắt tính năng bot nha!");
        }

        const args = content.split(/ +/).slice(1);
        const featureArg = args[0]?.toLowerCase();
        const stateArg = args[1]?.toLowerCase();

        const featureMap = {
            'chat': 'chatDiscord',
            'chatdiscord': 'chatDiscord',
            'voice': 'voiceDiscord',
            'voicediscord': 'voiceDiscord',
            'osu': 'osuCommandsDiscord',
            'lenthosu': 'osuCommandsDiscord',
            'multi': 'multiOsu',
            'multiosu': 'multiOsu',
            '247': 'multiOsu'
        };

        const targetFeature = featureMap[featureArg];
        if (!targetFeature || !['on', 'off', 'true', 'false', '1', '0'].includes(stateArg)) {
            return await message.reply("Cú pháp: `.toggle <chat|voice|osu|multi> <on|off>` (Ví dụ: `.toggle multi off`).");
        }

        const newState = ['on', 'true', '1'].includes(stateArg);
        setFeatureState(targetFeature, newState);

        return await message.reply(`✅ Đã ${newState ? 'BẬT 🟢' : 'TẮT 🔴'} tính năng **${targetFeature}** thành công! Gõ \`.toggles\` để xem lại trạng thái.`);
    }

    // --- CÁC LỆNH VOICE ---
    if (['.join', '.listen', '.out', '.leave'].includes(firstWord)) {
        if (!isFeatureEnabled('voiceDiscord')) {
            return await message.reply("🔴 Tính năng **Voice Discord** tạm thời đang TẮT!");
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
            return await message.reply("Thư viện Voice chưa được cài đặt trên server VPS này.");
        }
    }

    // --- 2. CÁC LỆNH OSU! MULTIPLAYER & ROOM ---
    if (['.topmulti', '!topmulti', '.tm', '!tm', '.topm', '!topm'].includes(firstWord)) {
        return await handleTopMultiCommand(message);
    }

    if (['.mr', '.mr247', '.make247', '.make-room', '.makeroom', '.lobby', '.inv', '.invite', '.invosu', '.close', '.matchclose', '.mc', '.joinroom', '!joinroom', '.jr', '!jr', '.jr247', '!jr247', '.join247', '.joinroom247', '.rooms247', '.list247', '.multi247'].includes(firstWord)) {
        if (!isFeatureEnabled('multiOsu')) {
            return await message.reply("🔴 Tính năng **Osu Multiplayer & 24/7 Room** tạm thời đang TẮT!");
        }
        if (['.mr', '.mr247', '.make247', '.make-room', '.makeroom', '.lobby'].includes(firstWord)) {
            const { handleMakeRoomCommand } = await import('./src/commands/osu/makeRoomCommand.js');
            return await handleMakeRoomCommand(message);
        }
        if (['.inv', '.invite', '.invosu'].includes(firstWord)) {
            const { handleInviteCommand } = await import('./src/commands/osu/inviteCommand.js');
            return await handleInviteCommand(message);
        }
        if (['.close', '.matchclose', '.mc'].includes(firstWord)) {
            const { handleCloseMatchCommand } = await import('./src/commands/osu/closeMatchCommand.js');
            return await handleCloseMatchCommand(message);
        }
        if (['.joinroom', '!joinroom', '.jr', '!jr', '.jr247', '!jr247', '.join247', '.joinroom247'].includes(firstWord)) {
            const { handleJoinRoomCommand } = await import('./src/commands/osu/joinRoomCommand.js');
            return await handleJoinRoomCommand(message);
        }
        if (['.rooms247', '.list247', '.multi247'].includes(firstWord)) {
            if (!isFeatureEnabled('community247Rooms')) {
                return await message.reply("🔴 Tính năng **Phòng 24/7 (Community 24/7 Rooms)** hiện đang TẮT trên instance này!");
            }
            const { loadMulti247Rooms } = await import('./src/services/multi247/room247Manager.js');
            const rooms = loadMulti247Rooms();
            const roomList = Object.values(rooms);
            if (roomList.length === 0) {
                return await message.reply(' Hiện tại chưa có phòng 24/7 nào đang lưu trên hệ thống! Dùng `.mr247 <tên_phòng>` để tạo phòng mới.');
            }
            const text = roomList.map((r, i) => `${i + 1}. **${r.roomName}** (Match ID: \`${r.matchId}\`) - Star Limit: ${r.starMin}★ - ${r.starMax}★`).join('\n');
            return await message.reply(`🎮 **DANH SÁCH PHÒNG MULTI 24/7 ĐANG HOẠT ĐỘNG (${roomList.length}):**\n${text}\n\n👉 Vào osu! gõ \`/join #${roomList[0].matchId}\` hoặc mời Yue bằng \`.jr ${roomList[0].matchId}\``);
        }
    }

    // --- 3. CÁC LỆNH OSU! BANCHO STATS & BEATMAP ---
    const isOsuStatsCmd = ['.profile', '.p', '.osu', '.user', '.stat', '.stats', '.st', '.r', '.recent', '.rs', '.rc', '.rm', '.rt', '.compare', '.c', '.map', '.m', '.lb', '.leaderboard', '.nc', '.nochoke', '.wi', '.whatif', '.pp', '.calc', '.pm', '.pickmap', '.rec'].includes(firstWord) || /^\.t\d+$/i.test(firstWord) || /^\.top\d+$/i.test(firstWord);
    
    if (isOsuStatsCmd && !isFeatureEnabled('osuCommandsDiscord')) {
        return await message.reply("🔴 Tính năng **Lệnh Osu Discord** (.profile, .rs, .top, .stat...) tạm thời đang TẮT!");
    }

    if (['.profile', '.p', '.osu', '.user'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'profile')) return message.reply("🔴 Lệnh .profile tạm thời đang TẮT!");
        return await handleOsuProfileCommand(message);
    }
    if (['.stat', '.stats', '.st'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'statCard')) return message.reply("🔴 Lệnh .stat tạm thời đang TẮT!");
        return await handleOsuStatCommand(message);
    }
    if (['.r', '.recent', '.rs', '.rc', '.rm', '.rt'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'recent')) return message.reply("🔴 Lệnh .recent tạm thời đang TẮT!");
        return await handleOsuRecentCommand(message);
    }
    if (['.top', '.t'].includes(firstWord) || /^\.t\d+$/i.test(firstWord) || /^\.top\d+$/i.test(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'top')) return message.reply("🔴 Lệnh .top tạm thời đang TẮT!");
        return await handleOsuTopCommand(message);
    }
    if (['.compare', '.c'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'compare')) return message.reply("🔴 Lệnh .compare tạm thời đang TẮT!");
        return await handleOsuCompareCommand(message);
    }
    if (['.map', '.m'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'beatmap')) return message.reply("🔴 Lệnh .map tạm thời đang TẮT!");
        return await handleOsuMapCommand(message);
    }
    if (['.lb', '.leaderboard'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'leaderboard')) return message.reply("🔴 Lệnh .leaderboard tạm thời đang TẮT!");
        return await handleOsuLeaderboardCommand(message);
    }
    if (['.nc', '.nochoke'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'nochoke')) return message.reply("🔴 Lệnh .nochoke tạm thời đang TẮT!");
        return await handleOsuNoChokeCommand(message);
    }
    if (['.wi', '.whatif'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'whatif')) return message.reply("🔴 Lệnh .whatif tạm thời đang TẮT!");
        return await handleOsuWhatIfCommand(message);
    }
    if (['.pp', '.calc'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'calcPp')) return message.reply("🔴 Lệnh .pp tạm thời đang TẮT!");
        return await handleOsuCalcPPCommand(message);
    }
    if (['.pm', '.pickmap', '.rec'].includes(firstWord)) {
        if (!isFeatureOn('osuDiscordCommands', 'pickMapDirect')) return message.reply("🔴 Lệnh .pickmap tạm thời đang TẮT!");
        return await handlePickMapCommand(message);
    }

    // ==========================================================
    // ⚡ 4. XỬ LÝ CHAT TEXT TỰ ĐỘNG BẰNG AI AGENT
    // ==========================================================
    const isMentioned = message.mentions.has(client.user);
    const configuredChannel = (process.env.SPECIAL_CHANNEL_NAME || 'con-vợ-ai').trim();
    const isSpecialChannel = message.channel.name === configuredChannel || message.channel.name.startsWith(configuredChannel);

    if (!isFeatureEnabled('chatDiscord')) {
        if (isMentioned || isSpecialChannel) {
            return await message.reply("🔴 Tính năng **Chat AI Discord** tạm thời đang TẮT!");
        }
        return;
    }

    if (!isMentioned && !isSpecialChannel) {
        return;
    }

    if (memoryProvider.isBlacklisted(message.author.id)) {
        console.log(`⛔ [Yue AI] Bỏ qua tin nhắn từ User bị Blacklist: ${message.author.username} (${message.author.id})`);
        return;
    }

    let userPrompt = message.content
        .replace(`<@!${client.user.id}>`, '')
        .replace(`<@${client.user.id}>`, '')
        .trim();

    const mediaData = await extractMediaFromMessage(message);
    const isImage = Boolean(mediaData);

    saveMessageToLocalHistory(message.channel.id, {
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        content: userPrompt || message.content,
        isBot: false,
        hasAttachment: isImage,
        timestamp: message.createdTimestamp
    });

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
            if (isFeatureOn('discord', 'antiSpam')) {
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
            }

            await message.channel.sendTyping();

            if (!userPrompt && !isImage) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

            const fullUserPromptWithReply = `${repliedContextText}${userPrompt}`.trim();
            const runtimeContext = await buildContext(message, fullUserPromptWithReply);
            const consecutiveGifCount = getConsecutiveGifCount(message.channel.id, message.author.id);
            const isGifSpam = isImage && consecutiveGifCount >= 3 && (!userPrompt || userPrompt.length < 15);

            if (!isImage && isFeatureOn('discord', 'naturalLanguageMapRec')) {
                const handledAsMapReq = await handleNaturalLanguageMapRequest(message, fullUserPromptWithReply, runtimeContext);
                if (handledAsMapReq) {
                    return;
                }
            }

            let aiResponse = "";
            if (isImage && isFeatureOn('discord', 'aiVision')) {
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
// ⚡ 4. XỬ LÝ SỰ KIỆN VOICE (AUTO LEAVE 5 PHÚT)
// ==========================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!isFeatureEnabled('voiceDiscord')) return;
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

if (botConfig.discord?.enabled !== false) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.log("⚡ [Master Control Panel] Client Bot Discord đang TẮT theo cấu hình!");
}
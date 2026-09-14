import { isFeatureOn } from '../../shared/config/botConfig.js';
import { isFeatureEnabled, setFeatureState, loadFeatureToggles } from '../../shared/config/featureToggles.js';
import { memoryProvider } from '../../../brain/MemoryProvider.js';
import { handleInfoCommand } from '../../../commands/info.js';
import { handleSetupCommand } from '../../../commands/setup.js';
import { handleSetupLeaderboardBoardCommand, handleHistoryLeaderboardCommand } from '../../osu/services/dailyLeaderboardService.js';
import { handleDiscordToBanchoSync } from '../../../services/multiChatSyncService.js';
import { handleAiChatMessage } from './aiChatHandler.js';

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
    handleOsuStatCommand,
    handlePickMapCommand,
    handleTopMultiCommand
} from '../../osu/stats/index.js';

export function registerMessageHandler(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // 💬 KIỂM TRA ĐỒNG BỘ CHAT DISCORD ➔ BANCHO IRC (ADMIN ONLY)
        if (process.env.MULTI_CHAT_SYNC_CHANNEL_ID && message.channel.id === process.env.MULTI_CHAT_SYNC_CHANNEL_ID) {
            const isHandledBySync = await handleDiscordToBanchoSync(message);
            if (isHandledBySync) return;
        }

        const content = message.content.trim();
        const firstWord = content.split(/ +/)[0].toLowerCase();

        // --- CÀI ĐẶT & XEM BẢNG XẾP HẠNG 24/7 ---
        if (['.setupboard', '.setup247lb', '.setuplb', '!setupboard', '.unsetboard', '.unsetlb', '.removeboard'].includes(firstWord)) {
            const args = content.split(/ +/).slice(1);
            return await handleSetupLeaderboardBoardCommand(message, args);
        }
        if (['.historyboard', '.historylb', '.lbrecord', '!historyboard'].includes(firstWord)) {
            const args = content.split(/ +/).slice(1);
            return await handleHistoryLeaderboardCommand(message, args);
        }

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
            const statusText = 
                `⚙️ **BẢNG ĐIỀU KHIỂN NGUYÊN BẢN CỦA YUE BOT (MODE: ${process.env.BOT_MODE?.toUpperCase() || 'CUSTOM'}):**\n\n` +
                `• 💬 Chat AI Discord: ${isFeatureEnabled('chatDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
                `• 🎙️ Voice Discord: ${isFeatureEnabled('voiceDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
                `• 🎮 Lệnh Osu Discord: ${isFeatureEnabled('osuCommandsDiscord') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
                `• 🌐 Osu Multiplayer & 24/7 Room: ${isFeatureEnabled('multiOsu') ? '🟢 BẬT' : '🔴 TẮT'}\n` +
                `• 🎨 Canvas Cards (Stat/Profile): ${isFeatureOn('heavyLibraries', 'canvas') ? '🟢 BẬT' : '🔴 TẮT'}\n\n` +
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
                    const { handleJoinCommand } = await import('../../../commands/join.js');
                    return await handleJoinCommand(message);
                }
                if (firstWord === '.listen') {
                    const { handleListenCommand } = await import('../../../commands/listen.js');
                    return await handleListenCommand(message);
                }
                if (firstWord === '.out' || firstWord === '.leave') {
                    const { handleLeaveCommand } = await import('../../../commands/leave.js');
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
                const { handleMakeRoomCommand } = await import('../../osu/stats/makeRoomCommand.js');
                return await handleMakeRoomCommand(message);
            }
            if (['.inv', '.invite', '.invosu'].includes(firstWord)) {
                const { handleInviteCommand } = await import('../../osu/stats/inviteCommand.js');
                return await handleInviteCommand(message);
            }
            if (['.close', '.matchclose', '.mc'].includes(firstWord)) {
                const { handleCloseMatchCommand } = await import('../../osu/stats/closeMatchCommand.js');
                return await handleCloseMatchCommand(message);
            }
            if (['.joinroom', '!joinroom', '.jr', '!jr', '.jr247', '!jr247', '.join247', '.joinroom247'].includes(firstWord)) {
                const { handleJoinRoomCommand } = await import('../../osu/stats/joinRoomCommand.js');
                return await handleJoinRoomCommand(message);
            }
            if (['.rooms247', '.list247', '.multi247'].includes(firstWord)) {
                if (!isFeatureEnabled('community247Rooms')) {
                    return await message.reply("🔴 Tính năng **Phòng 24/7 (Community 24/7 Rooms)** hiện đang TẮT trên instance này!");
                }
                const { loadMulti247Rooms } = await import('../../osu/multi247/room247Manager.js');
                const rooms = loadMulti247Rooms();
                const roomList = Object.values(rooms);
                if (roomList.length === 0) {
                    return await message.reply(' Hiện tại chưa có phòng 24/7 nào đang lưu trên hệ thống! Dùng `.mr247 <tên_phòng>` để tạo phòng mới.');
                }
                const text = roomList.map((r, i) => `${i + 1}. **${r.roomName}** (Match ID: \`${r.matchId}\`) - Star Limit: ${r.starMin}★ - ${r.starMax}★`).join('\n');
                return await message.reply(`🎮 **DANH SÁCH PHÒNG MULTI 24/7 ĐANG HOẠT ĐỘNG (${roomList.length}):**\n${text}\n\n👉 Vào osu! gõ \`/join #${roomList[0].matchId}\` hoặc mời Yue bằng \`.jr ${roomList[0].matchId}\``);
            }
        }

        // --- 3. CÁC LỆNH OSU! STATS & BEATMAP ---
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

        // --- 4. CHUYỂN GIAO XỬ LÝ CHAT TEXT AI AGENT ---
        return await handleAiChatMessage(client, message);
    });
}

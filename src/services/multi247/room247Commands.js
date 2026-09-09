import { get247RoomConfig, update247RoomConfig, update247RoomStarLimit, startRoomVote, getActiveVote, processVoteChoice, clearRoomVote, is247CommunityRoom } from './room247Manager.js';
import { determineLanguageStrategy, getRoomLanguage, t } from './multilingualService.js';
import { getPlayer247Memory, addNoteToPlayerMemory } from './room247Memory.js';
import { checkCommunitySafety } from './communitySafetyGuard.js';
import { askYue } from '../aiService.js';
import { isUserRef } from '../../commands/osuInGame/refCommands.js';
import { executeRoutedCommand } from '../osu/banchoService.js';

function isCurrentHost(channel, username) {
    try {
        const slots = channel.lobby?.slots || [];
        const hostSlot = slots.find(s => s && s.user && s.isHost);
        if (hostSlot && hostSlot.user?.username) {
            return hostSlot.user.username.toLowerCase() === username.toLowerCase();
        }
        const firstPlayer = slots.find(s => s && s.user);
        if (firstPlayer && firstPlayer.user?.username) {
            return firstPlayer.user.username.toLowerCase() === username.toLowerCase();
        }
    } catch (err) {
        console.error('[HostCheck Error]:', err.message);
    }
    return false;
}

/**
 * Xử lý các lệnh chuyên biệt của Phòng 24/7
 */
export async function handle247RoomCommands(channel, message, commandString, senderUsername) {
    const channelName = channel.name;
    const matchId = channelName.replace('#mp_', '');

    // 🎯 CHỈ NẾU LÀ PHÒNG CỘNG ĐỒNG 24/7 MỚI CHẠY BỘ BẢO VỆ AN TOÀN CỘNG ĐỒNG
    if (is247CommunityRoom(matchId)) {
        const safetyResult = await checkCommunitySafety(channel, senderUsername, commandString);
        if (!safetyResult.safe) {
            return; // Dừng lại nếu vi phạm anti-spam, toxic hoặc scam link
        }
    }

    const config = get247RoomConfig(matchId);
    const roomLang = await getRoomLanguage(channel);

    const args = commandString.trim().split(/ +/);
    const cmd = args[0].toLowerCase();

    const slots = channel.lobby?.slots || [];
    const activePlayers = slots.filter(s => s && s.user).map(s => s.user.username);
    const totalPlayers = Math.max(1, activePlayers.length);

    // 1. LỆNH .SR HOẶC .STARS (<min>-<max>)
    if (['.sr', '!sr', '.stars', '!stars'].includes(cmd)) {
        if (!args[1]) {
            const currentMin = config?.starMin ?? 0.0;
            const currentMax = config?.starMax ?? 6.0;
            return await channel.sendMessage(t('starLimitInfo', roomLang, currentMin, currentMax));
        }

        const parts = args[1].split('-');
        if (parts.length !== 2) {
            return await channel.sendMessage(t('starLimitInvalidSyntax', roomLang));
        }

        const minStar = parseFloat(parts[0]);
        const maxStar = parseFloat(parts[1]);

        if (isNaN(minStar) || isNaN(maxStar) || minStar < 0 || maxStar > 12 || minStar >= maxStar) {
            return await channel.sendMessage(t('starLimitInvalidRange', roomLang));
        }

        // Quyền Ref hoặc Owner có thể chỉnh thẳng không cần biểu quyết
        const isRefOrOwner = isUserRef(channelName, senderUsername);
        if (isRefOrOwner) {
            await update247RoomStarLimit(channel, minStar, maxStar);
            clearRoomVote(channelName);
            return await channel.sendMessage(t('starLimitForced', roomLang, senderUsername, minStar, maxStar));
        }

        // Tính số phiếu cần thiết (>50% số người chơi trong phòng)
        const requiredVotes = Math.floor(totalPlayers / 2) + 1;

        if (totalPlayers <= 1) {
            // Chỉ có 1 người trong phòng -> Tự động duyệt luôn
            await update247RoomStarLimit(channel, minStar, maxStar);
            return await channel.sendMessage(t('starLimitUpdated', roomLang, minStar, maxStar));
        }

        const voteObj = startRoomVote(channelName, 'star_limit', { min: minStar, max: maxStar }, senderUsername, requiredVotes);

        return await channel.sendMessage(t('voteStarted', roomLang, senderUsername, minStar, maxStar, requiredVotes, totalPlayers));
    }

    // 2. LỆNH .VOTE (YES / NO)
    if (['.vote', '!vote'].includes(cmd)) {
        const activeVote = getActiveVote(channelName);
        if (!activeVote) {
            return await channel.sendMessage(t('voteNoActive', roomLang));
        }

        const choiceArg = args[1]?.toLowerCase();
        if (!['yes', 'no', 'y', 'n', '1', '0'].includes(choiceArg)) {
            return await channel.sendMessage(t('votePromptOptions', roomLang));
        }

        const isYes = ['yes', 'y', '1'].includes(choiceArg);
        const result = processVoteChoice(channelName, senderUsername, isYes);

        if (!result) return;

        if (result.isPassed) {
            const targetVal = activeVote.targetValue;
            await update247RoomStarLimit(channel, targetVal.min, targetVal.max);
            clearRoomVote(channelName);

            return await channel.sendMessage(t('votePassed', roomLang, targetVal.min, targetVal.max));
        } else {
            const actionStr = roomLang === 'en' ? (isYes ? 'YES' : 'NO') : (isYes ? 'ĐỒNG Ý' : 'BÁC BỎ');
            return await channel.sendMessage(t('voteProgress', roomLang, senderUsername, actionStr, result.yesCount, result.requiredCount, totalPlayers));
        }
    }

    // 3. LỆNH .ROOMINFO / .STATUS
    if (['.roominfo', '!roominfo', '.247', '!247'].includes(cmd)) {
        const minStar = config?.starMin ?? 0.0;
        const maxStar = config?.starMax ?? 10.0;
        const hostName = slots.find(s => s && s.user && s.isHost)?.user?.username || 'Chưa rõ';

        return await channel.sendMessage(t('roomInfo', roomLang, hostName, minStar, maxStar, activePlayers.length));
    }

    // 4. CHAT AI ĐA NGÔN NGỮ KHI DÙNG .YUE
    if (['.yue', '!yue'].includes(cmd)) {
        const userPrompt = commandString.substring(cmd.length).trim();
        if (!userPrompt) {
            return await channel.sendMessage(t('yuePrompt', roomLang, senderUsername));
        }

        try {
            // Phân tích chiến lược ngôn ngữ thông minh
            const langStrategy = await determineLanguageStrategy(senderUsername, userPrompt);
            const playerMem = getPlayer247Memory(senderUsername);

            let senderRole = "Player thường";
            if (isCurrentHost(channel, senderUsername)) senderRole = "Host (Quyền cao)";
            else if (isUserRef(channelName, senderUsername)) senderRole = "Ref / Admin";

            const ingameContext = {
                host: slots.find(s => s && s.user && s.isHost)?.user?.username || 'Chưa rõ',
                sender: senderUsername,
                senderRole: senderRole,
                playerCount: activePlayers.length,
                playersList: activePlayers.join(', '),
                userCountry: langStrategy.country,
                roomLanguage: roomLang,
                relationship: playerMem?.relationship || 'stranger',
                userNotes: (playerMem?.notes || []).join('; '),
                starLimit: `${config?.starMin || 0.0}★ - ${config?.starMax || 10.0}★`
            };

            const aiRawJson = await askYue(`ingame_${senderUsername}`, senderUsername, userPrompt, null, false, ingameContext);
            const aiData = JSON.parse(aiRawJson);

            if (aiData.reply) {
                await channel.sendMessage(`YUE: ${aiData.reply}`);
            }

            if (aiData.command && typeof aiData.command === 'string' && aiData.command.trim()) {
                const aiCmd = aiData.command.trim();
                console.log(`[AI Command Exec] 🤖 Executing command from AI for ${senderUsername} (${senderRole}): ${aiCmd}`);
                await executeRoutedCommand(channel, message, aiCmd, senderUsername);
            }

            // Ghi nhận nếu có note mới
            if (userPrompt.toLowerCase().includes('tôi là') || userPrompt.toLowerCase().includes('i am')) {
                addNoteToPlayerMemory(senderUsername, `User nói: "${userPrompt.substring(0, 30)}"`);
            }

        } catch (err) {
            console.error('❌ Lỗi AI 24/7 Chat:', err.message);
            return await channel.sendMessage(t('yueError', roomLang));
        }
    }
}

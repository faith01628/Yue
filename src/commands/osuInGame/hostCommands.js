import { isUserRef } from './refCommands.js';
import { clearLobbyRequests } from './mapCommands.js';
import { getRoomLanguage, t } from '../../services/multi247/multilingualService.js';
import { activeLobbies } from '../../services/osu/banchoService.js';

const autohostQueues = new Map();
const isAutohostActive = new Map();
const skipVotes = new Map();

function getQueue(channelName) {
    if (!autohostQueues.has(channelName)) {
        autohostQueues.set(channelName, []);
    }
    return autohostQueues.get(channelName);
}

function getVotes(channelName) {
    if (!skipVotes.has(channelName)) {
        skipVotes.set(channelName, new Set());
    }
    return skipVotes.get(channelName);
}

export function clearSkipVotes(channelName) {
    if (skipVotes.has(channelName)) {
        skipVotes.get(channelName).clear();
    }
}

// 🎯 HÀM CẮT NGẮN HÀNG ĐỢI AN TOÀN TUYỆT ĐỐI DƯỚI 150 KÝ TỰ (ĐÃ HỖ TRỢ ĐA NGÔN NGỮ)
function formatQueueText(queue, lang = 'vi') {
    if (!queue || queue.length === 0) return t('queueEmpty', lang);

    // Giới hạn chỉ hiển thị tối đa 8 người chơi đầu tiên
    const maxDisplay = 8;
    if (queue.length <= maxDisplay) {
        return queue.join(', ');
    }

    const visiblePlayers = queue.slice(0, maxDisplay).join(', ');
    const remainingCount = queue.length - maxDisplay;

    return t('queueMore', lang, visiblePlayers, remainingCount);
}

export function isAutohostOn(channelName) {
    return !!isAutohostActive.get(channelName);
}

/**
 * 🎯 BẬT TỰ ĐỘNG AUTOHOST KHI TẠO PHÒNG MULTI
 */
export function enableAutohostForChannel(channel) {
    const channelName = typeof channel === 'string' ? channel : (channel.name || channel);
    isAutohostActive.set(channelName, true);
    if (typeof channel === 'object') {
        syncLobbyPlayersToQueue(channel);
    }
    console.log(`[Autohost] 🟢 Đã tự động BẬT Autohost cho phòng ${channelName}`);
}

function isCurrentHost(channel, username) {
    const slots = channel.lobby?.slots || [];
    const hostSlot = slots.find(s => s && s.user && s.isHost);
    if (hostSlot && hostSlot.user?.username) {
        return hostSlot.user.username.toLowerCase() === username.toLowerCase();
    }
    const firstPlayer = slots.find(s => s && s.user);
    if (firstPlayer && firstPlayer.user?.username) {
        return firstPlayer.user.username.toLowerCase() === username.toLowerCase();
    }
    return false;
}

/**
 * 🎯 ĐỒNG BỘ HÀNG ĐỢI XOAY VÒNG BẮT ĐẦU TỪ HOST HIỆN TẠI (Ví dụ: 4 -> 5 -> 6 -> 1 -> 2 -> 3)
 */
export function syncLobbyPlayersToQueue(channel) {
    const channelName = channel.name;
    if (!isAutohostActive.get(channelName)) return;

    const queue = getQueue(channelName);
    const slots = channel.lobby?.slots || [];
    
    // Lấy danh sách tất cả người chơi thực tế theo thứ tự slot
    const currentPlayers = slots
        .filter(slot => slot && slot.user)
        .map(slot => slot.user.username);

    if (currentPlayers.length === 0) return;

    // 1. Nếu hàng đợi đang trống (lần đầu bật .ah)
    if (queue.length === 0) {
        // Tìm host thực tế trong phòng
        const hostSlot = slots.find(s => s && s.user && s.isHost);
        const currentHostUsername = hostSlot?.user?.username || currentPlayers[0];

        const hostIndex = currentPlayers.findIndex(
            p => p.toLowerCase() === currentHostUsername.toLowerCase()
        );

        if (hostIndex !== -1) {
            // Cắt từ Host đến hết + nối phần từ đầu đến trước Host
            const reorderedQueue = [
                ...currentPlayers.slice(hostIndex),
                ...currentPlayers.slice(0, hostIndex)
            ];
            queue.push(...reorderedQueue);
        } else {
            queue.push(...currentPlayers);
        }
    } else {
        // 2. Tự dọn dẹp những player đã rời khỏi phòng khỏi queue
        for (let i = queue.length - 1; i >= 0; i--) {
            const inRoom = currentPlayers.some(p => p.toLowerCase() === queue[i].toLowerCase());
            if (!inRoom) {
                queue.splice(i, 1);
            }
        }

        // 3. Nếu hàng đợi đã chạy, thêm người mới gia nhập vào cuối queue
        for (const player of currentPlayers) {
            const exists = queue.some(p => p.toLowerCase() === player.toLowerCase());
            if (!exists) {
                queue.push(player);
            }
        }
    }
}

export async function handlePlayerJoin(channel, username) {
    if (!channel || !username) return;

    let chanObj = channel;
    let channelName = typeof channel === 'string' ? channel : (channel?.name || '');
    const matchId = channelName.replace('#mp_', '');

    if (typeof channel === 'string') {
        const lobbyData = activeLobbies.get(matchId);
        if (lobbyData && lobbyData.channel) {
            chanObj = lobbyData.channel;
        }
    }

    if (!isAutohostActive.get(channelName)) return;

    // 1. Đồng bộ danh sách người chơi trong phòng với queue
    if (typeof chanObj === 'object' && chanObj?.lobby) {
        syncLobbyPlayersToQueue(chanObj);
    } else {
        const queue = getQueue(channelName);
        const exists = queue.some(p => p.toLowerCase() === username.toLowerCase());
        if (!exists) {
            queue.push(username);
        }
    }

    const queue = getQueue(channelName);

    // 2. Kiểm tra xem trong phòng đã có Host thực tế chưa
    let hasHost = false;
    let activePlayerCount = 0;

    if (typeof chanObj === 'object' && chanObj?.lobby?.slots) {
        const slots = chanObj.lobby.slots.filter(s => s && s.user);
        activePlayerCount = slots.length;
        hasHost = slots.some(s => s.isHost);
    } else {
        activePlayerCount = queue.length;
    }

    // 3. CHỈ TỰ ĐỘNG CHỈ ĐỊNH HOST NẾU PHÒNG CHƯA CÓ HOST NÀO VÀ ĐÂY LÀ NGƯỜI DUY NHẤT
    if (!hasHost && activePlayerCount === 1 && queue.length === 1) {
        autohostQueues.set(channelName, [username]);
        clearSkipVotes(channelName);

        if (typeof chanObj === 'object' && typeof chanObj.sendMessage === 'function') {
            try {
                await chanObj.sendMessage(`!mp host ${username}`);
                await chanObj.sendMessage(`YUE: Next host: ${username}`);
            } catch (err) {
                console.error('[handlePlayerJoin Host Assign Error]:', err.message);
            }
        }
    }
}

export function addPlayerToQueue(channel, username) {
    handlePlayerJoin(channel, username);
}

export async function removePlayerFromQueue(channel, username) {
    const channelName = channel.name || channel;
    if (!isAutohostActive.get(channelName)) return;

    const queue = getQueue(channelName);
    const index = queue.findIndex(p => p.toLowerCase() === username.toLowerCase());

    if (index !== -1) {
        const wasHost = (index === 0);
        queue.splice(index, 1);

        const votes = getVotes(channelName);
        votes.delete(username.toLowerCase());

        if (wasHost && queue.length > 0) {
            const roomLang = await getRoomLanguage(channel);
            clearSkipVotes(channelName); 
            clearLobbyRequests(channelName);
            const nextHost = queue[0];
            await channel.sendMessage(`!mp host ${nextHost}`);
            await channel.sendMessage(`YUE: Next host: ${formatQueueText(queue, roomLang)}`);
        }
    }
}

export async function rotateToNextHost(channel) {
    const channelName = channel.name;
    if (!isAutohostActive.get(channelName)) return;

    const roomLang = await getRoomLanguage(channel);
    syncLobbyPlayersToQueue(channel);
    clearSkipVotes(channelName); 
    clearLobbyRequests(channelName);

    const queue = getQueue(channelName);

    if (queue.length === 0) {
        const emptyMsg = roomLang === 'en'
            ? 'YUE: [Autohost] Queue is empty, no players in room!'
            : 'YUE: [Autohost] Hàng đợi trống, không có ai trong phòng!';
        return await channel.sendMessage(emptyMsg);
    }

    if (queue.length === 1) {
        const soloMsg = roomLang === 'en'
            ? `YUE: [Autohost] Only 1 player remaining (${queue[0]}), keeping Host!`
            : `YUE: [Autohost] Trong phòng chỉ còn 1 người (${queue[0]}), tiếp tục giữ Host!`;
        return await channel.sendMessage(soloMsg);
    }

    const previousHost = queue.shift();
    queue.push(previousHost);

    const nextHost = queue[0];

    await channel.sendMessage(`!mp host ${nextHost}`);
    await channel.sendMessage(`YUE: Next host: ${formatQueueText(queue, roomLang)}`);
}

export async function handleHostCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const queue = getQueue(channelName);
    const roomLang = await getRoomLanguage(channel);

    // 🎯 LỆNH DIRECT HOST (.host <username>) - CHỈ HOST/REF DÙNG
    if (['.host', '!host'].includes(command)) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(t('hostNoPerm', roomLang));
        }

        const targetSearch = args.join(' ').trim().toLowerCase();
        if (!targetSearch) {
            const usageMsg = roomLang === 'en'
                ? `YUE: Please enter player username to transfer host (e.g. .host katashi)!`
                : `YUE: Vui lòng nhập tên người chơi cần nhường host (Ví dụ: .host katashi)!`;
            return await channel.sendMessage(usageMsg);
        }

        const slots = channel.lobby?.slots || [];
        const activePlayers = slots.filter(s => s && s.user).map(s => s.user.username);
        const matchedUser = activePlayers.find(p => {
            const pLower = p.toLowerCase();
            const pClean = pLower.replace(/\[|\]/g, '');
            const targetClean = targetSearch.replace(/\[|\]/g, '');
            return pLower === targetSearch || pClean === targetClean || pLower.includes(targetSearch);
        });

        if (!matchedUser) {
            const notFoundMsg = roomLang === 'en'
                ? `YUE: Player "${args[0]}" not found in room!`
                : `YUE: Không tìm thấy người chơi "${args[0]}" trong phòng!`;
            return await channel.sendMessage(notFoundMsg);
        }

        // Cập nhật lại vị trí Host mới lên đầu queue nếu Autohost đang bật
        if (isAutohostActive.get(channelName)) {
            const idx = queue.findIndex(p => p.toLowerCase() === matchedUser.toLowerCase());
            if (idx !== -1) {
                queue.splice(idx, 1);
                queue.unshift(matchedUser);
            }
        }

        await channel.sendMessage(`!mp host ${matchedUser}`);
        return await channel.sendMessage(t('nextSuccess', roomLang, matchedUser));
    }

    // TẮT AUTOHOST (.ahoff)
    if (['.ahoff', '!ahoff', '.unah', '!unah', '.autohostoff'].includes(command) || (command === '.ah' && args[0]?.toLowerCase() === 'off')) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(t('hostNoPerm', roomLang));
        }
        isAutohostActive.set(channelName, false);
        autohostQueues.set(channelName, []);
        clearSkipVotes(channelName);
        clearLobbyRequests(channelName);
        return await channel.sendMessage(t('ahOff', roomLang));
    }

    // BẬT AUTOHOST (.ah)
    if (['.ah', '!ah', '.autohost'].includes(command)) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(t('hostNoPerm', roomLang));
        }
        isAutohostActive.set(channelName, true);
        
        // Đồng bộ danh sách bắt đầu từ Host hiện tại
        syncLobbyPlayersToQueue(channel);

        const currentHost = queue[0] || sender;
        await channel.sendMessage(`!mp host ${currentHost}`);
        return await channel.sendMessage(`YUE: Next host: ${formatQueueText(queue, roomLang)}`);
    }

    // CHUYỂN HOST KHI AUTOHOST ON (.next / .skip)
    if (['.next', '!next', '.skip', '!skip'].includes(command)) {
        if (!isAutohostActive.get(channelName)) {
            const notOnMsg = roomLang === 'en'
                ? 'YUE: Autohost is not enabled! Type `.ah` to turn it on.'
                : 'YUE: Chế độ Autohost chưa được bật! Gõ `.ah` để bật nhé.';
            return await channel.sendMessage(notOnMsg);
        }

        if (queue.length <= 1) {
            const soloMsg = roomLang === 'en'
                ? `YUE: [Autohost] Only 1 player in room (${queue[0]}), cannot rotate!`
                : `YUE: [Autohost] Trong phòng chỉ có 1 người (${queue[0]}), không thể đổi!`;
            return await channel.sendMessage(soloMsg);
        }

        if (isUserRef(channelName, sender) || isCurrentHost(channel, sender)) {
            const roleLabel = isUserRef(channelName, sender) ? 'Ref' : 'Host';
            const rotateMsg = roomLang === 'en'
                ? `YUE: ${roleLabel} (${sender}) rotated host directly!`
                : `YUE: ${roleLabel} (${sender}) đã chuyển Host trực tiếp!`;
            await channel.sendMessage(rotateMsg);
            return await rotateToNextHost(channel);
        }

        syncLobbyPlayersToQueue(channel);
        const votes = getVotes(channelName);
        const senderLower = sender.toLowerCase();

        if (votes.has(senderLower)) {
            const alreadyVotedMsg = roomLang === 'en'
                ? `YUE: ${sender}, you have already voted to skip! (${votes.size}/${queue.length})`
                : `YUE: ${sender}, bạn đã bỏ phiếu chuyển host rồi! (${votes.size}/${queue.length})`;
            return await channel.sendMessage(alreadyVotedMsg);
        }

        votes.add(senderLower);
        const currentVotes = votes.size;
        const totalPlayers = queue.length;
        const requiredVotes = Math.floor(totalPlayers / 2) + 1;

        if (currentVotes >= requiredVotes) {
            const passedMsg = roomLang === 'en'
                ? `YUE: Skip votes reached ${currentVotes}/${totalPlayers} (>50%). Rotating Host!`
                : `YUE: Số phiếu chuyển host đã đạt ${currentVotes}/${totalPlayers} (>50%). Tiến hành chuyển Host!`;
            await channel.sendMessage(passedMsg);
            return await rotateToNextHost(channel);
        } else {
            const voteMsg = roomLang === 'en'
                ? `YUE: ${sender} wants to skip host (${currentVotes}/${totalPlayers}). Need ${requiredVotes - currentVotes} more votes (type .next)!`
                : `YUE: ${sender} muốn chuyển Host (${currentVotes}/${totalPlayers}). Cần thêm ${requiredVotes - currentVotes} phiếu nữa (gõ .next)!`;
            return await channel.sendMessage(voteMsg);
        }
    }

    // KIỂM TRA HÀNG ĐỢI (.q / .queue)
    if (['.q', '!q', '.queue', '!queue'].includes(command)) {
        if (!isAutohostActive.get(channelName)) {
            const offMsg = roomLang === 'en' ? 'YUE: Autohost is currently OFF.' : 'YUE: Chế độ Autohost hiện đang TẮT.';
            return await channel.sendMessage(offMsg);
        }

        syncLobbyPlayersToQueue(channel);
        return await channel.sendMessage(`YUE: Next host: ${formatQueueText(queue, roomLang)}`);
    }
}
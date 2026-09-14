import { isUserRef } from './refCommands.js';
import { clearLobbyRequests } from './mapCommands.js';
import { getRoomLanguage, t } from '../../services/multi247/multilingualService.js';
import { activeLobbies } from '../../services/osu/banchoService.js';
import { botConfig } from '../../config/botConfig.js';
import { updatePlayer247Memory } from '../../services/multi247/room247Memory.js';
import { get247RoomConfig } from '../../services/multi247/room247Manager.js';

const autohostQueues = new Map();
const isAutohostActive = new Map();
const skipVotes = new Map();
const afkHostTimers = new Map();
const welcomeCooldowns = new Map();
const roomEmptyStatusMap = new Map();

export function setRoomEmptyStatus(channelName, isEmpty) {
    if (!channelName) return;
    const key = typeof channelName === 'string' ? channelName : (channelName?.name || '');
    if (key) {
        roomEmptyStatusMap.set(key, !!isEmpty);
    }
}

export function isRoomEmpty(channelName) {
    if (!channelName) return true;
    const key = typeof channelName === 'string' ? channelName : (channelName?.name || '');
    if (!key) return true;
    if (!roomEmptyStatusMap.has(key)) return true;
    return !!roomEmptyStatusMap.get(key);
}

export function resetRoomHostState(channelName) {
    if (!channelName) return;
    const key = typeof channelName === 'string' ? channelName : (channelName?.name || '');
    if (!key) return;
    roomEmptyStatusMap.set(key, true);
    lastAssignedHostMap.delete(key);
    autohostQueues.set(key, []);
    skipVotes.delete(key);
    clearAfkHostTimer(key);
}

export function clearAfkHostTimer(channelName) {
    const key = typeof channelName === 'string' ? channelName : channelName?.name;
    if (key && afkHostTimers.has(key)) {
        clearTimeout(afkHostTimers.get(key));
        afkHostTimers.delete(key);
    }
}

export function startAfkHostTimer(channel, hostUsername) {
    const channelName = typeof channel === 'string' ? channel : channel?.name;
    if (!channelName) return;
    clearAfkHostTimer(channelName);

    if (!botConfig.osuMultiplayer?.afkHostTimer) return;
    if (!hostUsername) return;

    const lowerHost = hostUsername.toLowerCase();
    if (lowerHost.includes('banchobot') || lowerHost.includes('yue')) return;

    const timer = setTimeout(async () => {
        try {
            if (!isAutohostActive.get(channelName)) return;

            const matchIdNum = channelName.replace('#mp_', '');
            const roomConfig = get247RoomConfig(matchIdNum);
            const starMin = roomConfig?.starMin ?? 0.0;
            const starMax = roomConfig?.starMax ?? 6.99;

            const roomLang = await getRoomLanguage(channel);
            const msg = roomLang === 'en'
                ? `YUE: Hey ${hostUsername}, need a map? Type !r or pick a map (${starMin.toFixed(1)}★ - ${starMax.toFixed(2)}★)! Type .next to pass host if AFK!`
                : `YUE: Ê ${hostUsername}, chọn map nào đi nè! Gõ !r hoặc chọn map (${starMin.toFixed(1)}★ - ${starMax.toFixed(2)}★)! Gõ .next nếu muốn nhường host nhé!`;

            if (typeof channel === 'object' && typeof channel.sendMessage === 'function') {
                await channel.sendMessage(msg);
            }
        } catch (err) {
            console.error('[AFK Host Timer Error]:', err.message);
        }
    }, 45000);

    afkHostTimers.set(channelName, timer);
}

export function getQueue(channelName) {
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
export async function enableAutohostForChannel(channel) {
    const channelName = typeof channel === 'string' ? channel : (channel.name || channel);
    isAutohostActive.set(channelName, true);
    setRoomEmptyStatus(channelName, true);
    lastAssignedHostMap.delete(channelName);

    if (typeof channel === 'object') {
        try {
            const { attachLobbyEvents } = await import('../../services/osu/banchoService.js');
            attachLobbyEvents(channel);
        } catch (e) {}

        const updateFn = channel.lobby?.updateSettings || channel.lobby?.update;
        if (typeof updateFn === 'function') {
            try {
                await Promise.race([
                    updateFn.call(channel.lobby),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Lobby update timeout')), 3000))
                ]);
            } catch (e) {}
        }
        syncLobbyPlayersToQueue(channel);
    }
    console.log(`[Autohost] 🟢 Đã tự động BẬT Autohost cho phòng ${channelName} (Đặt trạng thái mặc định isEmpty = true)`);
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
    const channelName = typeof channel === 'string' ? channel : (channel?.name || '');
    if (!channelName || !isAutohostActive.get(channelName)) return;

    const queue = getQueue(channelName);
    const slots = (typeof channel === 'object' && channel?.lobby?.slots) ? channel.lobby.slots : [];
    
    // Lấy danh sách tất cả người chơi thực tế theo thứ tự slot
    const currentPlayers = slots
        .filter(slot => slot && slot.user && slot.user.username)
        .map(slot => slot.user.username)
        .filter(name => !name.toLowerCase().includes('banchobot') && !name.toLowerCase().includes('yue'));

    if (currentPlayers.length === 0) {
        // Chỉ dọn dẹp hàng đợi nếu slots đã có dữ liệu thực tế (slots.length > 0) hoặc hàng đợi đã rỗng sẵn.
        // Tránh tình trạng Bancho chưa kịp trả về slots mà vừa có player join khiến queue bị xoá nhầm.
        if (slots.length > 0 || queue.length === 0) {
            setRoomEmptyStatus(channelName, true);
            queue.length = 0;
        }
        return;
    }

    setRoomEmptyStatus(channelName, false);

    // 1. Tự dọn dẹp những player KHÔNG CÒN Ở TRONG PHÒNG nữa khỏi queue
    for (let i = queue.length - 1; i >= 0; i--) {
        const inRoom = currentPlayers.some(p => p.toLowerCase() === queue[i].toLowerCase());
        if (!inRoom) {
            queue.splice(i, 1);
        }
    }

    // 2. Nếu hàng đợi đang trống
    if (queue.length === 0) {
        // Tìm host thực tế trong phòng
        const hostSlot = slots.find(s => s && s.user && s.isHost && !s.user.username.toLowerCase().includes('banchobot') && !s.user.username.toLowerCase().includes('yue'));
        const currentHostUsername = hostSlot?.user?.username || currentPlayers[0];

        const hostIndex = currentPlayers.findIndex(
            p => p.toLowerCase() === currentHostUsername.toLowerCase()
        );

        if (hostIndex !== -1) {
            const reorderedQueue = [
                ...currentPlayers.slice(hostIndex),
                ...currentPlayers.slice(0, hostIndex)
            ];
            for (const p of reorderedQueue) {
                if (!queue.some(q => q.toLowerCase() === p.toLowerCase())) {
                    queue.push(p);
                }
            }
        } else {
            for (const p of currentPlayers) {
                if (!queue.some(q => q.toLowerCase() === p.toLowerCase())) {
                    queue.push(p);
                }
            }
        }
    } else {
        // 3. Thêm người mới gia nhập vào cuối queue nếu chưa có
        for (const player of currentPlayers) {
            const exists = queue.some(p => p.toLowerCase() === player.toLowerCase());
            if (!exists) {
                queue.push(player);
            }
        }
    }
}

const lastAssignedHostMap = new Map();

export async function setHostSafely(channel, targetUsername, isRotation = false) {
    if (!channel || !targetUsername) return;
    const channelName = typeof channel === 'string' ? channel : (channel.name || channel);
    if (!channelName) return;

    let chanObj = (typeof channel === 'object' && typeof channel.sendMessage === 'function')
        ? channel
        : null;

    if (!chanObj && typeof channel === 'string') {
        const matchId = channelName.replace('#mp_', '');
        const lobbyData = activeLobbies.get(matchId);
        if (lobbyData && lobbyData.channel) {
            chanObj = lobbyData.channel;
        } else {
            try {
                const { getBanchoClient } = await import('../../services/osu/banchoService.js');
                const bClient = getBanchoClient();
                if (bClient) chanObj = bClient.getChannel(channelName);
            } catch (e) {}
        }
    }

    const lowerTarget = targetUsername.toLowerCase();
    const lastHost = lastAssignedHostMap.get(channelName);

    if (!isRotation && lastHost && lastHost.toLowerCase() === lowerTarget) {
        return;
    }

    lastAssignedHostMap.set(channelName, lowerTarget);

    if (chanObj) {
        try {
            await chanObj.sendMessage(`!mp host ${targetUsername}`);
            startAfkHostTimer(chanObj, targetUsername);
        } catch (err) {
            console.error('[setHostSafely Error]:', err.message);
        }
    } else {
        console.warn(`[setHostSafely] ⚠️ Không tìm thấy channel object để gửi !mp host ${targetUsername} tới ${channelName}`);
    }
}

export function addPlayerToQueueSilently(channelName, username) {
    if (!channelName || !username) return;
    const cleanUser = username.replace(/^wiki:/i, '').trim();
    const lowerUser = cleanUser.toLowerCase();
    if (!cleanUser || lowerUser.includes('banchobot') || lowerUser.includes('yue')) return;
    const queue = getQueue(channelName);
    const exists = queue.some(p => p.toLowerCase() === lowerUser);
    if (!exists) {
        queue.push(cleanUser);
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
        } else {
            try {
                const { getBanchoClient } = await import('../../services/osu/banchoService.js');
                const bClient = getBanchoClient();
                if (bClient) chanObj = bClient.getChannel(channelName);
            } catch (e) {}
        }
    }

    const cleanUser = username.replace(/^wiki:/i, '').trim();
    const lowerUser = cleanUser.toLowerCase();
    if (!cleanUser || lowerUser.includes('banchobot') || lowerUser.includes('yue')) return;

    // Lời chào cá nhân hóa cho người chơi mới/quay lại
    if (botConfig.osuMultiplayer?.welcomeShoutouts) {
        const cdKey = `${channelName}_${lowerUser}`;
        const now = Date.now();
        const lastWelcome = welcomeCooldowns.get(cdKey) || 0;
        if (now - lastWelcome > 60000) {
            welcomeCooldowns.set(cdKey, now);
            const userMem = updatePlayer247Memory(cleanUser, { visitCountInc: true });
            const visits = userMem?.visitCount || 1;

            setTimeout(async () => {
                try {
                    const roomLang = await getRoomLanguage(channel);
                    let welcomeMsg = '';
                    if (visits === 1) {
                        welcomeMsg = roomLang === 'en'
                            ? `YUE: Welcome to the room ${cleanUser}! Enjoy your stay & GLHF! 🎮`
                            : `YUE: Chào mừng ${cleanUser} lần đầu ghé phòng! Chơi vui vẻ nha! 🎮`;
                    } else {
                        welcomeMsg = roomLang === 'en'
                            ? `YUE: Welcome back ${cleanUser}! (Visit #${visits}) GLHF! ⚡`
                            : `YUE: Chào mừng ${cleanUser} đã quay lại! (Lần thứ ${visits}) GLHF! ⚡`;
                    }
                    if (typeof chanObj === 'object' && typeof chanObj.sendMessage === 'function') {
                        await chanObj.sendMessage(welcomeMsg);
                    }
                } catch (wErr) {
                    console.error('[Welcome Shoutout Error]:', wErr.message);
                }
            }, 1200);
        }
    }

    if (!isAutohostActive.get(channelName)) return;

    const queue = getQueue(channelName);
    const wasEmpty = isRoomEmpty(channelName) || queue.length === 0;

    const exists = queue.some(p => p.toLowerCase() === lowerUser || p.toLowerCase() === username.toLowerCase());
    if (!exists) {
        if (wasEmpty) {
            queue.unshift(cleanUser);
        } else {
            queue.push(cleanUser);
        }
    }

    if (typeof chanObj === 'object' && chanObj?.lobby) {
        syncLobbyPlayersToQueue(chanObj);
    }

    const cleanQueue = getQueue(channelName);
    if (!cleanQueue.some(p => p.toLowerCase() === lowerUser)) {
        if (wasEmpty) {
            cleanQueue.unshift(cleanUser);
        } else {
            cleanQueue.push(cleanUser);
        }
    }

    const targetHost = (wasEmpty || cleanQueue.length === 1) ? cleanUser : cleanQueue[0];

    if ((wasEmpty || cleanQueue.length === 1 || isRoomEmpty(channelName)) && targetHost) {
        setRoomEmptyStatus(channelName, false);
        await setHostSafely(chanObj || channel, targetHost, true);
    }
}

export function addPlayerToQueue(channel, username) {
    handlePlayerJoin(channel, username);
}

export async function removePlayerFromQueue(channel, username) {
    const channelName = typeof channel === 'string' ? channel : (channel?.name || '');
    if (!channelName || !isAutohostActive.get(channelName)) return;

    const queue = getQueue(channelName);
    const index = queue.findIndex(p => p.toLowerCase() === username.toLowerCase());

    if (index !== -1) {
        const wasHost = (index === 0);
        queue.splice(index, 1);

        const votes = getVotes(channelName);
        votes.delete(username.toLowerCase());

        if (queue.length === 0) {
            setRoomEmptyStatus(channelName, true);
            lastAssignedHostMap.delete(channelName);
            clearSkipVotes(channelName);
            clearLobbyRequests(channelName);
            console.log(`[Autohost] 🚪 Phòng ${channelName} đã hết người chơi. Chuyển trạng thái sang isEmpty = true.`);
        } else if (wasHost && queue.length > 0) {
            setRoomEmptyStatus(channelName, false);
            const roomLang = await getRoomLanguage(channel);
            clearSkipVotes(channelName); 
            clearLobbyRequests(channelName);
            const nextHost = queue[0];
            await setHostSafely(channel, nextHost, true);
            await channel.sendMessage(`YUE: Next host: ${formatQueueText(queue, roomLang)}`);
        }
    }
}

export async function rotateToNextHost(channel) {
    const channelName = typeof channel === 'string' ? channel : (channel?.name || '');
    if (!channelName || !isAutohostActive.get(channelName)) return;

    if (typeof channel === 'object') {
        const updateFn = channel.lobby?.updateSettings || channel.lobby?.update;
        if (typeof updateFn === 'function') {
            try {
                await Promise.race([
                    updateFn.call(channel.lobby),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Lobby update timeout')), 3000))
                ]);
            } catch (err) {
                console.warn('[Autohost Rotate] ⚠️ Lobby update timeout/error:', err.message);
            }
        }
    }

    const roomLang = await getRoomLanguage(channel);
    syncLobbyPlayersToQueue(channel);
    clearSkipVotes(channelName); 
    clearLobbyRequests(channelName);

    const rawQueue = getQueue(channelName);

    // Lọc dọn dẹp trùng lặp và bot
    const cleanQueue = [];
    for (const player of rawQueue) {
        const lower = player.toLowerCase();
        if (!lower.includes('banchobot') && !lower.includes('yue') && !cleanQueue.some(p => p.toLowerCase() === lower)) {
            cleanQueue.push(player);
        }
    }

    autohostQueues.set(channelName, cleanQueue);

    if (cleanQueue.length === 0) {
        const emptyMsg = roomLang === 'en'
            ? 'YUE: [Autohost] Queue is empty, no players in room!'
            : 'YUE: [Autohost] Hàng đợi trống, không có ai trong phòng!';
        return await channel.sendMessage(emptyMsg);
    }

    if (cleanQueue.length === 1) {
        await setHostSafely(channel, cleanQueue[0], false);
        const soloMsg = roomLang === 'en'
            ? `YUE: [Autohost] Only 1 player remaining (${cleanQueue[0]}), keeping Host!`
            : `YUE: [Autohost] Trong phòng chỉ còn 1 người (${cleanQueue[0]}), tiếp tục giữ Host!`;
        return await channel.sendMessage(soloMsg);
    }

    const previousHost = cleanQueue.shift();
    cleanQueue.push(previousHost);

    const nextHost = cleanQueue[0];

    await setHostSafely(channel, nextHost, true);
    await channel.sendMessage(`YUE: Next host: ${formatQueueText(cleanQueue, roomLang)}`);
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
                ? `YUE: Please enter player username to transfer host (e.g. .host PlayerName)!`
                : `YUE: Vui lòng nhập tên người chơi cần nhường host (Ví dụ: .host <tên_người_chơi>)!`;
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
        startAfkHostTimer(channel, matchedUser);
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
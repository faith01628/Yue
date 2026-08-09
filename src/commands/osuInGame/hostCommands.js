import { isUserRef } from './refCommands.js';
import { clearLobbyRequests } from './mapCommands.js';

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

// 🎯 HÀM CẮT NGẮN HÀNG ĐỢI AN TOÀN TUYỆT ĐỐI DƯỚI 150 KÝ TỰ
function formatQueueText(queue) {
    if (!queue || queue.length === 0) return 'Hàng đợi trống';

    // Giới hạn chỉ hiển thị tối đa 8 người chơi đầu tiên
    const maxDisplay = 8;
    if (queue.length <= maxDisplay) {
        return queue.join(', ');
    }

    const visiblePlayers = queue.slice(0, maxDisplay).join(', ');
    const remainingCount = queue.length - maxDisplay;

    return `${visiblePlayers} , ... (+${remainingCount} người)`;
}

export function isAutohostOn(channelName) {
    return !!isAutohostActive.get(channelName);
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
        // 2. Nếu hàng đợi đã chạy, chỉ thêm người mới gia nhập vào cuối queue
        for (const player of currentPlayers) {
            const exists = queue.some(p => p.toLowerCase() === player.toLowerCase());
            if (!exists) {
                queue.push(player);
            }
        }
    }
}

export function addPlayerToQueue(channelName, username) {
    if (!isAutohostActive.get(channelName)) return;
    const queue = getQueue(channelName);

    const exists = queue.some(p => p.toLowerCase() === username.toLowerCase());
    if (!exists) {
        queue.push(username);
    }
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
            clearSkipVotes(channelName); 
            clearLobbyRequests(channelName);
            const nextHost = queue[0];
            await channel.sendMessage(`!mp host ${nextHost}`);
            await channel.sendMessage(`YUE: [Autohost] Host cũ đã rời phòng! Host mới: ${nextHost} | Hàng đợi: ${formatQueueText(queue)}`);
        }
    }
}

export async function rotateToNextHost(channel) {
    const channelName = channel.name;
    if (!isAutohostActive.get(channelName)) return;

    syncLobbyPlayersToQueue(channel);
    clearSkipVotes(channelName); 
    clearLobbyRequests(channelName);

    const queue = getQueue(channelName);

    if (queue.length === 0) {
        return await channel.sendMessage('YUE: [Autohost] Hàng đợi trống, không có ai trong phòng!');
    }

    if (queue.length === 1) {
        return await channel.sendMessage(`YUE: [Autohost] Trong phòng chỉ còn 1 người (${queue[0]}), tiếp tục giữ Host!`);
    }

    const previousHost = queue.shift();
    queue.push(previousHost);

    const nextHost = queue[0];

    await channel.sendMessage(`!mp host ${nextHost}`);
    await channel.sendMessage(
        `YUE: [Autohost] Host tiếp theo: ${nextHost} | Hàng đợi: ${formatQueueText(queue)}`
    );
}

export async function handleHostCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const queue = getQueue(channelName);

    // 🎯 LỆNH DIRECT HOST (.host <username>) - CHỈ HOST/REF DÙNG
    if (['.host', '!host'].includes(command)) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(`YUE: Chỉ Host hoặc Ref mới có quyền dùng lệnh .host!`);
        }

        const targetSearch = args.join(' ').trim().toLowerCase();
        if (!targetSearch) {
            return await channel.sendMessage(`YUE: Vui lòng nhập tên người chơi cần nhường host (Ví dụ: .host katashi)!`);
        }

        const slots = channel.lobby?.slots || [];
        const activePlayers = slots.filter(s => s && s.user).map(s => s.user.username);
        const matchedUser = activePlayers.find(p => p.toLowerCase().includes(targetSearch));

        if (!matchedUser) {
            return await channel.sendMessage(`YUE: Không tìm thấy người chơi "${args[0]}" trong phòng!`);
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
        return await channel.sendMessage(`YUE: Đã chuyển Host cho ${matchedUser}!`);
    }

    // TẮT AUTOHOST (.ahoff)
    if (['.ahoff', '!ahoff', '.unah', '!unah', '.autohostoff'].includes(command) || (command === '.ah' && args[0]?.toLowerCase() === 'off')) {
        isAutohostActive.set(channelName, false);
        autohostQueues.set(channelName, []);
        clearSkipVotes(channelName);
        clearLobbyRequests(channelName);
        return await channel.sendMessage('YUE: [Autohost] Đã TẮT chế độ Autohost cho phòng!');
    }

    // BẬT AUTOHOST (.ah)
    if (['.ah', '!ah', '.autohost'].includes(command)) {
        isAutohostActive.set(channelName, true);
        
        // Đồng bộ danh sách bắt đầu từ Host hiện tại
        syncLobbyPlayersToQueue(channel);

        const currentHost = queue[0] || sender;
        await channel.sendMessage(`!mp host ${currentHost}`);
        return await channel.sendMessage(
            `YUE: [Autohost] Đã BẬT! Host hiện tại: ${currentHost} | Hàng đợi: ${formatQueueText(queue)}`
        );
    }

    // CHUYỂN HOST KHI AUTOHOST ON (.next / .skip)
    if (['.next', '!next', '.skip', '!skip'].includes(command)) {
        if (!isAutohostActive.get(channelName)) {
            return await channel.sendMessage('YUE: Chế độ Autohost chưa được bật! Gõ `.ah` để bật nhé.');
        }

        if (queue.length <= 1) {
            return await channel.sendMessage(`YUE: [Autohost] Trong phòng chỉ có 1 người (${queue[0]}), không thể đổi!`);
        }

        if (isUserRef(channelName, sender)) {
            await channel.sendMessage(`YUE: Ref (${sender}) đã sử dụng quyền chuyển Host trực tiếp!`);
            return await rotateToNextHost(channel);
        }

        syncLobbyPlayersToQueue(channel);
        const votes = getVotes(channelName);
        const senderLower = sender.toLowerCase();

        if (votes.has(senderLower)) {
            return await channel.sendMessage(`YUE: ${sender}, bạn đã bỏ phiếu chuyển host rồi! (${votes.size}/${queue.length})`);
        }

        votes.add(senderLower);
        const currentVotes = votes.size;
        const totalPlayers = queue.length;
        const requiredVotes = Math.floor(totalPlayers / 2) + 1;

        if (currentVotes >= requiredVotes) {
            await channel.sendMessage(`YUE: Số phiếu chuyển host đã đạt ${currentVotes}/${totalPlayers} (>50%). Tiến hành chuyển Host!`);
            return await rotateToNextHost(channel);
        } else {
            return await channel.sendMessage(`YUE: ${sender} muốn chuyển Host (${currentVotes}/${totalPlayers}). Cần thêm ${requiredVotes - currentVotes} phiếu nữa (gõ .next)!`);
        }
    }

    // KIỂM TRA HÀNG ĐỢI (.q / .queue)
    if (['.q', '!q', '.queue', '!queue'].includes(command)) {
        if (!isAutohostActive.get(channelName)) {
            return await channel.sendMessage('YUE: Chế độ Autohost hiện đang TẮT.');
        }

        syncLobbyPlayersToQueue(channel);
        return await channel.sendMessage(`YUE: [Hàng đợi Host] ${formatQueueText(queue)}`);
    }
}
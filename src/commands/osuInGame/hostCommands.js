// Map lưu trữ hàng đợi Autohost cho từng phòng (#mp_id)
// Key = channelName (#mp_12345), Value = Array chứa danh sách username [player1, player2, ...]
const autohostQueues = new Map();
const isAutohostActive = new Map(); // Trạng thái bật/tắt autohost của phòng

/**
 * Lấy hoặc khởi tạo Queue cho phòng
 */
function getQueue(channelName) {
    if (!autohostQueues.has(channelName)) {
        autohostQueues.set(channelName, []);
    }
    return autohostQueues.get(channelName);
}

/**
 * Hiển thị danh sách hàng đợi Host dạng chuỗi đẹp mắt
 */
function formatQueueText(queue) {
    if (!queue || queue.length === 0) return 'Hàng đợi trống';
    return queue.join(' ➔ ');
}

/**
 * Xử lý các lệnh Autohost/Host (.ah / .autohost / .host)
 */
export async function handleHostCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const queue = getQueue(channelName);

    // 🎯 1. BẬT / TẮT HOẶC XEM TRẠNG THÁI AUTOHOST (.ah / .autohost)
    if (['.ah', '!ah', '.autohost', '!autohost'].includes(command)) {
        const subCommand = args[0]?.toLowerCase();

        // Nếu gõ .ah off -> Tắt Autohost
        if (subCommand === 'off') {
            isAutohostActive.set(channelName, false);
            autohostQueues.set(channelName, []);
            return await channel.sendMessage('YUE: [Autohost] Đã TẮT chế độ Autohost cho phòng!');
        }

        // Bật Autohost
        isAutohostActive.set(channelName, true);

        // Nếu hàng đợi đang trống, thêm các thành viên hiện tại vào (nếu có) hoặc thêm sender
        if (queue.length === 0) {
            queue.push(sender);
        }

        const nextHost = queue[0];
        return await channel.sendMessage(
            `YUE: [Autohost] Đã BẬT! Host hiện tại: ${nextHost} | Thứ tự: ${formatQueueText(queue)}`
        );
    }

    // 🎯 2. LỆNH CHUYỂN HOST TIẾP THEO SAU KHI XONG MAP (Hoặc gõ .skip / .next)
    if (['.next', '!next', '.skip', '!skip'].includes(command)) {
        if (!isAutohostActive.get(channelName)) {
            return await channel.sendMessage('YUE: Chế độ Autohost chưa được bật! Gõ `.ah` để bật nhé.');
        }

        if (queue.length <= 1) {
            return await channel.sendMessage(`YUE: [Autohost] Hàng đợi chỉ có 1 người (${queue[0]}), không thể xoay vòng!`);
        }

        // 🔄 XOAY VÒNG HÀNG ĐỢI: Đưa người đầu tiên xuống cuối cùng
        const currentHost = queue.shift();
        queue.push(currentHost);

        const nextHost = queue[0];

        // Gửi lệnh set host cho Bancho
        await channel.sendMessage(`!mp host ${nextHost}`);
        
        // Thông báo danh sách thứ tự mới
        return await channel.sendMessage(
            `YUE: [Autohost] Lượt host tiếp theo thuộc về: ${nextHost} | Thứ tự hàng đợi: ${formatQueueText(queue)}`
        );
    }
}

/**
 * 🎯 LẮNG NGHE SỰ KIỆN PLAYER JOIN/LEAVE TRONG PHÒNG ĐỂ CẬP NHẬT QUEUE
 * (Gọi hàm này trong banchoService khi có sự kiện join/part)
 */
export function handlePlayerJoinAutohost(channelName, username) {
    if (!isAutohostActive.get(channelName)) return;
    const queue = getQueue(channelName);
    
    // Nếu người chơi chưa có trong queue thì thêm vào CỦI HÀNG ĐỢI (Đúng chuẩn 3 4 1 2 5)
    if (!queue.includes(username)) {
        queue.push(username);
    }
}

export function handlePlayerLeaveAutohost(channelName, username) {
    if (!isAutohostActive.get(channelName)) return;
    const queue = getQueue(channelName);
    
    // Bỏ người chơi khỏi queue nếu họ rời phòng
    const index = queue.indexOf(username);
    if (index !== -1) {
        queue.splice(index, 1);
    }
}
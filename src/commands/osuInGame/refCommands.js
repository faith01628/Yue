// Map lưu trữ danh sách Ref của từng phòng: Key = channelName, Value = Set chứa username [ref1, ref2, ...]
const lobbyRefs = new Map();

function getRefList(channelName) {
    if (!lobbyRefs.has(channelName)) {
        lobbyRefs.set(channelName, new Set());
    }
    return lobbyRefs.get(channelName);
}

/**
 * Kiểm tra xem người dùng có phải là Ref hoặc Host chính không
 */
export function isUserRef(channelName, username) {
    const refs = getRefList(channelName);
    // Mặc định cho phép người tạo phòng hoặc tài khoản Bot có quyền Ref
    return refs.has(username.toLowerCase()) || refs.has('bot') || refs.size === 0; 
}

/**
 * Thêm Ref cho phòng
 */
export function addRefUser(channelName, username) {
    const refs = getRefList(channelName);
    refs.add(username.toLowerCase());
}

/**
 * Xóa Ref khỏi phòng
 */
export function removeRefUser(channelName, username) {
    const refs = getRefList(channelName);
    refs.delete(username.toLowerCase());
}

/**
 * Xử lý các lệnh quản lý Ref (.addref / .rmref / .refs)
 */
export async function handleRefCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const targetUser = args[0]?.trim();

    // KIỂM TRA QUYỀN
    if (!isUserRef(channelName, sender)) {
        return await channel.sendMessage(`YUE: Bạn không có quyền Ref để thực hiện lệnh này!`);
    }

    // 🎯 Lệnh .addref <username>
    if (['.addref', '!addref'].includes(command)) {
        if (!targetUser) {
            return await channel.sendMessage(`YUE: Vui lòng nhập tên người chơi cần gán Ref! (Ví dụ: .addref Katashi)`);
        }
        addRefUser(channelName, targetUser);
        await channel.sendMessage(`!mp addref ${targetUser}`);
        return await channel.sendMessage(`YUE: Đã cấp quyền Ref cho người chơi ${targetUser}!`);
    }

    // 🎯 Lệnh .rmref / .removeref <username>
    if (['.rmref', '!rmref', '.removeref', '!removeref'].includes(command)) {
        if (!targetUser) {
            return await channel.sendMessage(`YUE: Vui lòng nhập tên người chơi cần xóa Ref!`);
        }
        removeRefUser(channelName, targetUser);
        await channel.sendMessage(`!mp rmref ${targetUser}`);
        return await channel.sendMessage(`YUE: Đã xóa quyền Ref của người chơi ${targetUser}!`);
    }

    // 🎯 Lệnh .refs (Xem danh sách Ref)
    if (['.refs', '!refs'].includes(command)) {
        const refs = Array.from(getRefList(channelName));
        const listText = refs.length > 0 ? refs.join(', ') : 'Chưa có Ref nào được chỉ định';
        return await channel.sendMessage(`YUE: Danh sách Ref hiện tại: ${listText}`);
    }
}
import { get247RoomConfig } from '../../services/multi247/room247Manager.js';

// Map lưu trữ danh sách Ref của từng phòng: Key = channelName, Value = Set chứa username [ref1, ref2, ...]
const lobbyRefs = new Map();

function getRefList(channelName) {
    if (!lobbyRefs.has(channelName)) {
        lobbyRefs.set(channelName, new Set());
    }
    return lobbyRefs.get(channelName);
}

/**
 * Kiểm tra xem người dùng có phải là Ref hoặc Owner/Creator của phòng hay không
 */
export function isUserRef(channelName, username) {
    if (!username) return false;
    const userLower = username.toLowerCase();

    // Katashi (Creator) luôn có quyền Ref tối cao
    if (userLower === 'katashi' || userLower === '[katashi]') return true;

    const matchId = (channelName || '').replace('#mp_', '');
    const config = get247RoomConfig(matchId);

    // 🔒 ĐỐI VỚI PHÒNG CỘNG ĐỒNG 24/7: CHỈ KATASHI LÀ REF DUY NHẤT!
    if (config && config.is247) {
        if (config.ownerOsuName && config.ownerOsuName.toLowerCase() === userLower) {
            return true;
        }
        return false; // Chặn tất cả người chơi khác trong phòng 24/7
    }

    // Kiểm tra trong danh sách Ref được gán bằng lệnh .addref (Cho phòng thường)
    const refs = getRefList(channelName);
    if (refs.has(userLower)) return true;

    return false;
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
        return await channel.sendMessage(`YUE: Only Ref/Admin or current Host can execute this command!`);
    }

    // 🎯 Lệnh .addref <username>
    if (['.addref', '!addref'].includes(command)) {
        const matchId = channelName.replace('#mp_', '');
        const config = get247RoomConfig(matchId);
        if (config && config.is247) {
            return await channel.sendMessage(`YUE: In 24/7 Community Room, Katashi is the sole Referee! Cannot add more referees.`);
        }
        if (!targetUser) {
            return await channel.sendMessage(`YUE: Please enter player username to assign Ref! (e.g. .addref Katashi)`);
        }
        addRefUser(channelName, targetUser);
        await channel.sendMessage(`!mp addref ${targetUser}`);
        return await channel.sendMessage(`YUE: Granted Ref permissions to ${targetUser}!`);
    }

    // 🎯 Lệnh .rmref / .removeref <username>
    if (['.rmref', '!rmref', '.removeref', '!removeref'].includes(command)) {
        if (!targetUser) {
            return await channel.sendMessage(`YUE: Please enter player username to remove Ref!`);
        }
        removeRefUser(channelName, targetUser);
        await channel.sendMessage(`!mp rmref ${targetUser}`);
        return await channel.sendMessage(`YUE: Removed Ref permissions from ${targetUser}!`);
    }

    // 🎯 Lệnh .refs (Xem danh sách Ref)
    if (['.refs', '!refs'].includes(command)) {
        const refs = Array.from(getRefList(channelName));
        const listText = refs.length > 0 ? refs.join(', ') : 'No referees specified';
        return await channel.sendMessage(`YUE: Current Ref list: ${listText}`);
    }
}
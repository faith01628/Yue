import fs from 'fs';
import path from 'path';

const ROOMS_FILE = path.resolve('src/data/multi247Rooms.json');

function ensureRoomsFile() {
    const dir = path.dirname(ROOMS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(ROOMS_FILE)) fs.writeFileSync(ROOMS_FILE, JSON.stringify({}), 'utf-8');
}

export function loadMulti247Rooms() {
    ensureRoomsFile();
    try {
        const data = fs.readFileSync(ROOMS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('❌ Lỗi đọc file multi247Rooms.json:', err.message);
        return {};
    }
}

export function saveMulti247Rooms(rooms) {
    ensureRoomsFile();
    try {
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('❌ Lỗi ghi file multi247Rooms.json:', err.message);
        return false;
    }
}

/**
 * Lấy phòng 24/7 đang chạy theo Mode (0: Standard, 1: Taiko, 2: Catch, 3: Mania)
 */
export function get247RoomByMode(mode = 0) {
    const rooms = loadMulti247Rooms();
    return Object.values(rooms).find(r => (r.gameMode ?? 0) === mode && r.is247) || null;
}

/**
 * Thêm hoặc cập nhật phòng 24/7 (Giới hạn tối đa 1 phòng 24/7 cho mỗi mode)
 */
export function register247Room(matchId, roomData = {}) {
    const rooms = loadMulti247Rooms();
    const key = String(matchId);
    const gameMode = roomData.gameMode ?? 0; // Mặc định 0 = Standard

    // Kiểm tra xem đã có phòng 24/7 cho mode này chưa
    const existingModeRoom = Object.values(rooms).find(r => (r.gameMode ?? 0) === gameMode && r.matchId !== key);
    if (existingModeRoom) {
        throw new Error(`Đã tồn tại 1 phòng Cộng đồng 24/7 cho Mode ${gameMode} (Match ID: ${existingModeRoom.matchId}). Mỗi Mode chỉ được chạy 1 phòng 24/7 duy nhất!`);
    }

    rooms[key] = {
        matchId: key,
        roomName: roomData.roomName || `Yue's 24/7 Community Room (Mode ${gameMode})`,
        gameMode: gameMode,
        starMin: roomData.starMin ?? 0.0,
        starMax: roomData.starMax ?? 6.0,
        maxLengthSec: roomData.maxLengthSec ?? 600, // 10 phút
        allowStatus: roomData.allowStatus || ['ranked', 'loved', 'qualified'],
        afkTimeoutSec: roomData.afkTimeoutSec ?? 180, // 3 phút
        is247: true,
        ownerDiscordId: roomData.ownerDiscordId || null,
        ownerOsuName: roomData.ownerOsuName || null,
        createdAt: roomData.createdAt || Date.now(),
        updatedAt: Date.now()
    };

    saveMulti247Rooms(rooms);
    return rooms[key];
}

/**
 * 🎯 CẬP NHẬT STAR LIMIT VÀ ĐỔI TÊN PHÒNG BANCHO THEO STAR MỚI
 */
export async function update247RoomStarLimit(channel, minStar, maxStar) {
    const channelName = typeof channel === 'string' ? channel : (channel?.name || '');
    const matchId = channelName.replace('#mp_', '');

    // 1. Lưu config mới vào file DB
    update247RoomConfig(matchId, { starMin: minStar, starMax: maxStar });

    // 2. Tạo tên phòng mới phản ánh Star Limit
    const baseName = process.env.OSU_MULTI_247_DEFAULT_ROOM_NAME || "Yue's 24/7 Community Room";
    const starTag = `(${minStar.toFixed(1)}* - ${maxStar.toFixed(1)}*)`;
    const newRoomName = baseName.includes('*') ? baseName : `${baseName} ${starTag}`;

    update247RoomConfig(matchId, { roomName: newRoomName });

    // 3. Đổi tên phòng trực tiếp trên Bancho IRC
    if (typeof channel === 'object' && typeof channel.sendMessage === 'function') {
        try {
            await channel.sendMessage(`!mp name ${newRoomName}`);
        } catch (err) {
            console.error('[247 Star Update] Lỗi đổi tên phòng Bancho:', err.message);
        }
    }
    return newRoomName;
}

/**
 * Reset cấu hình mặc định (Không mật khẩu + Freemod + HeadToHead + ScoreV1) sau mỗi trận đấu phòng
 */
export async function reset247RoomLobbyDefaults(channel) {
    try {
        await channel.sendMessage('!mp password');
        await new Promise(resolve => setTimeout(resolve, 300));
        await channel.sendMessage('!mp set 0 0');
        await new Promise(resolve => setTimeout(resolve, 300));
        await channel.sendMessage('!mp mods FreeMod');
        console.log(`[Lobby Reset] ⚙️ Đã tự động reset room ${channel.name} về Freemod + Không mật khẩu + HeadToHead!`);
    } catch (err) {
        console.error('[Lobby Reset Error]:', err.message);
    }
}

let keepAliveTimer = null;

/**
 * 🎯 VÒNG LẶP GIỮ PHÒNG 24/7 (BANCHO KEEP-ALIVE HEARTBEAT)
 * Gửi !mp settings mỗi 8 phút để Bancho Server không bao giờ tự đóng phòng do AFK!
 */
export function start247KeepAliveLoop(banchoClient) {
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    keepAliveTimer = setInterval(async () => {
        try {
            const rooms = loadMulti247Rooms();
            for (const matchId of Object.keys(rooms)) {
                const channelName = `#mp_${matchId}`;
                const channel = banchoClient?.getChannel(channelName);
                if (channel) {
                    await channel.sendMessage('!mp settings');
                    console.log(`[24/7 Keep-Alive] 💓 Đã gửi heartbeat giữ phòng ${channelName} trên Bancho server.`);
                }
            }
        } catch (err) {
            console.error('[24/7 Keep-Alive Error]:', err.message);
        }
    }, 8 * 60 * 1000);
}

/**
 * Lấy cấu hình 24/7 của 1 match
 */
export function get247RoomConfig(matchId) {
    const rooms = loadMulti247Rooms();
    return rooms[String(matchId)] || null;
}

/**
 * Kiểm tra xem Match ID có phải là phòng Cộng đồng 24/7 đang kích hoạt hay không
 */
export function is247CommunityRoom(matchId) {
    const config = get247RoomConfig(matchId);
    return !!(config && config.is247 === true);
}

/**
 * Cập nhật cấu hình của phòng 24/7 (Ví dụ: Star limit mới)
 */
export function update247RoomConfig(matchId, updateFields = {}) {
    const rooms = loadMulti247Rooms();
    const key = String(matchId);
    if (!rooms[key]) return null;

    rooms[key] = {
        ...rooms[key],
        ...updateFields,
        updatedAt: Date.now()
    };

    saveMulti247Rooms(rooms);
    return rooms[key];
}

/**
 * Xóa phòng 24/7 khỏi danh sách quản lý
 */
export function unregister247Room(matchId) {
    const rooms = loadMulti247Rooms();
    const key = String(matchId);
    if (rooms[key]) {
        delete rooms[key];
        saveMulti247Rooms(rooms);
        return true;
    }
    return false;
}

// 🎯 BỎ PHIẾU DÂN CHỦ TRONG PHÒNG 24/7 (Đổi Star Limit, v.v.)
const activeVotes = new Map(); // key = channelName, value = VoteObject

export function startRoomVote(channelName, voteType, targetValue, proposerName, requiredCount) {
    const voteObj = {
        voteType,       // 'star_limit'
        targetValue,    // { min: 4.0, max: 5.5 }
        proposerName,
        votes: new Map(), // username -> true/false
        requiredCount,
        startTime: Date.now()
    };
    // Tự động đồng ý cho người đề xuất
    voteObj.votes.set(proposerName.toLowerCase(), true);
    activeVotes.set(channelName, voteObj);
    return voteObj;
}

export function getActiveVote(channelName) {
    return activeVotes.get(channelName) || null;
}

export function clearRoomVote(channelName) {
    activeVotes.delete(channelName);
}

export function processVoteChoice(channelName, username, isYes) {
    const voteObj = activeVotes.get(channelName);
    if (!voteObj) return null;

    voteObj.votes.set(username.toLowerCase(), isYes);
    
    // Đếm số phiếu đồng ý
    let yesCount = 0;
    for (const [_, val] of voteObj.votes.entries()) {
        if (val === true) yesCount++;
    }

    const isPassed = yesCount >= voteObj.requiredCount;
    return {
        voteObj,
        yesCount,
        totalVotesCast: voteObj.votes.size,
        requiredCount: voteObj.requiredCount,
        isPassed
    };
}

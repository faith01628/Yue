import fs from 'fs';
import path from 'path';

const ROOMS_FILE = path.resolve('data/multi247Rooms.json');

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
        starMax: roomData.starMax ?? 6.99,
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
let discordClientInstance = null;
const roomLastActivityMap = new Map();

/**
 * Lưu instance của Discord Client để thực hiện sửa tin nhắn Embed
 */
export function setDiscordClient(client) {
    discordClientInstance = client;
}

/**
 * Cập nhật thời điểm hoạt động gần nhất của phòng 24/7
 */
export function touch247RoomActivity(matchId) {
    if (!matchId) return;
    roomLastActivityMap.set(String(matchId), Date.now());
}

/**
 * 🔄 TỰ ĐỘNG ĐÓNG VÀ TÁI TẠO PHÒNG 24/7 MỚI (AUTO-RECREATE)
 * Khi phòng trống >= 20 phút hoặc bị Bancho tự sập, tự động mở phòng mới
 * và chỉnh sửa tin nhắn Embed trên Discord sang Match ID mới.
 */
export async function recreate247Room(oldMatchId, banchoClient) {
    const oldKey = String(oldMatchId);
    const roomConfig = get247RoomConfig(oldKey);
    if (!roomConfig) return null;

    console.log(`[24/7 Auto-Recreate] 🔄 Đang tự động tái tạo phòng 24/7 cũ (Match ID: ${oldKey})...`);

    // 1. Đóng channel cũ nếu còn mở trên Bancho IRC
    try {
        const oldChannel = banchoClient?.getChannel(`#mp_${oldKey}`);
        if (oldChannel) {
            await oldChannel.sendMessage('YUE: Room has been idle for 20 minutes. Auto-closing & recreating a new room!');
            await oldChannel.sendMessage('!mp close');
        }
    } catch (e) {
        console.warn(`[24/7 Auto-Recreate] Đóng phòng cũ ${oldKey} không thành công (có thể đã bị Bancho đóng):`, e.message);
    }

    // Dọn dẹp timestamp cũ & trạng thái phòng cũ trong Map!
    roomLastActivityMap.delete(oldKey);
    try {
        const { resetRoomHostState } = await import('../../commands/osuInGame/hostCommands.js');
        resetRoomHostState(`#mp_${oldKey}`);
    } catch (e) {}

    // 2. Dọn dẹp phòng cũ khỏi DB
    unregister247Room(oldKey);

    // 3. Tạo phòng mới trên Bancho
    try {
        const roomName = roomConfig.roomName || "Yue's 24/7 Community Room";
        const newChannel = await banchoClient.createLobby(roomName);
        const newLobby = newChannel.lobby;
        const newMatchId = String(newLobby.id);

        // Đặt timestamp hoạt động phòng mới ngay khi tạo
        touch247RoomActivity(newMatchId);

        // Đặt cấu hình mặc định
        await newChannel.sendMessage('!mp password');
        await newChannel.sendMessage('!mp set 0 0');
        await newChannel.sendMessage('!mp mods FreeMod');

        // Áp dụng Star Limit nếu đã từng cài đặt
        if (roomConfig.starMin !== undefined && roomConfig.starMax !== undefined) {
            try {
                await update247RoomStarLimit(newChannel, roomConfig.starMin, roomConfig.starMax);
            } catch (starErr) {
                console.warn('[24/7 Auto-Recreate] Lỗi áp dụng lại Star Limit:', starErr.message);
            }
        }

        // Bật Autohost
        try {
            const { enableAutohostForChannel } = await import('../../commands/osuInGame/hostCommands.js');
            enableAutohostForChannel(newChannel);
        } catch (ahErr) {
            console.warn('[24/7 Auto-Recreate] Lỗi bật Autohost:', ahErr.message);
        }

        // Mời chủ phòng
        let inviteStatusText = '';
        if (roomConfig.ownerOsuName) {
            try {
                await newLobby.invitePlayer(roomConfig.ownerOsuName);
                inviteStatusText = `\n📩 *Đã gửi lời mời in-game cho **${roomConfig.ownerOsuName}**!*`;
            } catch (invErr) {
                console.warn('[24/7 Auto-Recreate] Lỗi gửi lời mời:', invErr.message);
                inviteStatusText = `\n⚠️ *Không thể gửi lời mời in-game (chủ phòng offline hoặc gõ sai tên).*`;
            }
        }

        // 4. Lưu thông tin phòng mới vào DB & activeLobbies
        register247Room(newMatchId, {
            ...roomConfig,
            matchId: newMatchId,
            createdAt: Date.now()
        });

        try {
            const { activeLobbies } = await import('../osu/banchoService.js');
            activeLobbies.delete(oldKey);
            activeLobbies.set(newMatchId, {
                lobby: newLobby,
                channel: newChannel,
                ownerId: roomConfig.ownerDiscordId,
                is247: true,
                createdAt: Date.now()
            });
        } catch (lobErr) {
            console.warn('[24/7 Auto-Recreate] Lỗi cập nhật activeLobbies:', lobErr.message);
        }

        touch247RoomActivity(newMatchId);

        console.log(`✅ [24/7 Auto-Recreate] Tạo thành công phòng 24/7 mới! Match ID: ${newMatchId}`);

        // 5. Tự động tìm & Cập nhật Embed tin nhắn Discord với Match ID mới
        await findAndUpdate247DiscordEmbed(roomConfig, newMatchId, inviteStatusText);

        return newMatchId;
    } catch (err) {
        console.error('[24/7 Auto-Recreate Error]:', err.message);
        return null;
    }
}

/**
 * 🎯 ĐỒNG BỘ TRẠNG THÁI PHÒNG 24/7 VỚI BANCHO IRC BẰNG !MP SETTINGS
 * Kiểm tra số lượng người chơi thực tế, cài đặt isEmpty và trao host nếu phòng có người.
 */
export async function sync247RoomStateViaMpSettings(channel) {
    if (!channel || typeof channel !== 'object' || !channel.lobby) return;

    const channelName = channel.name || '';
    const matchId = channelName.replace('#mp_', '');

    try {
        if (typeof channel.lobby.update === 'function') {
            await Promise.race([
                channel.lobby.update(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Lobby update timeout')), 3000))
            ]);
        }
    } catch (err) {
        console.warn(`[24/7 mp settings] ⚠️ Không thể update lobby cho ${channelName}:`, err.message);
    }

    const slots = channel.lobby?.slots || [];
    const activePlayers = slots
        .filter(s => s && s.user && s.user.username)
        .map(s => s.user.username)
        .filter(name => !name.toLowerCase().includes('banchobot') && !name.toLowerCase().includes('yue'));

    const { setRoomEmptyStatus, isAutohostOn, syncLobbyPlayersToQueue, setHostSafely, getQueue } = await import('../../commands/osuInGame/hostCommands.js');

    if (activePlayers.length === 0) {
        setRoomEmptyStatus(channelName, true);
        syncLobbyPlayersToQueue(channel);
        console.log(`[24/7 Sync] ℹ️ Phòng ${channelName} hiện có 0 người chơi. Đặt trạng thái isEmpty = true.`);
    } else {
        setRoomEmptyStatus(channelName, false);
        touch247RoomActivity(matchId);
        syncLobbyPlayersToQueue(channel);
        console.log(`[24/7 Sync] 👥 Phòng ${channelName} hiện có ${activePlayers.length} người chơi (${activePlayers.join(', ')}). Đặt isEmpty = false.`);

        if (isAutohostOn(channelName)) {
            const queue = getQueue(channelName);
            const targetHost = queue[0] || activePlayers[0];

            // Kiểm tra host hiện tại trên Bancho
            const currentHostSlot = slots.find(s => s && s.user && s.isHost);
            const currentHostName = currentHostSlot?.user?.username || '';

            if (currentHostName.toLowerCase() === targetHost.toLowerCase()) {
                console.log(`[24/7 Sync] 🎯 Host hiện tại trên Bancho (${currentHostName}) đã khớp với target Host (${targetHost}). KHÔNG gửi lại !mp host.`);
            } else {
                console.log(`[24/7 Sync] ⚡ Host Bancho (${currentHostName || 'Không có'}) khác target Host (${targetHost}). Gửi !mp host ${targetHost}...`);
                await setHostSafely(channel, targetHost, true);
            }
        }
    }
}

/**
 * Tự động tìm kiếm & Chỉnh sửa tin nhắn Embed 24/7 trên Discord
 */
async function findAndUpdate247DiscordEmbed(roomConfig, newMatchId, inviteStatusText = '') {
    if (!discordClientInstance) {
        console.warn('[24/7 Auto-Recreate] Discord client instance chưa sẵn sàng.');
        return;
    }

    try {
        const roomName = roomConfig.roomName || "Yue's 24/7 Community Room";
        const { build247RoomEmbed } = await import('../../commands/osu/makeRoomCommand.js');
        const newEmbed = build247RoomEmbed(
            newMatchId,
            roomName,
            roomConfig.ownerOsuName || 'katashi',
            roomConfig.ownerDiscordTag || 'katashi',
            inviteStatusText,
            true
        );

        let targetChannel = null;
        let targetMessage = null;

        // 1. Thử lấy channel trực tiếp từ config nếu có
        if (roomConfig.discordChannelId) {
            try {
                targetChannel = await discordClientInstance.channels.fetch(roomConfig.discordChannelId);
            } catch (e) {
                targetChannel = null;
            }
        }

        // 2. Nếu chưa có channelId trong DB -> Tự động tìm kênh text trong tất cả Server Discord chứa bot
        if (!targetChannel) {
            console.log('[24/7 Auto-Recreate] 🔍 Chưa có discordChannelId trong DB, đang quét các kênh Discord để tìm Embed phòng 24/7...');
            for (const guild of discordClientInstance.guilds.cache.values()) {
                const textChannels = guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
                for (const channel of textChannels.values()) {
                    try {
                        const messages = await channel.messages.fetch({ limit: 50 });
                        const embedMsg = messages.find(m =>
                            m.author.id === discordClientInstance.user.id &&
                            m.embeds.some(e => e.author?.name?.includes('24/7 Community Room') || e.description?.includes('Match ID:'))
                        );
                        if (embedMsg) {
                            targetChannel = channel;
                            targetMessage = embedMsg;
                            console.log(`[24/7 Auto-Recreate] 🎯 Đã tìm thấy Embed cũ tại kênh #${channel.name} (${channel.id})!`);
                            break;
                        }
                    } catch (err) {
                        continue;
                    }
                }
                if (targetChannel) break;
            }
        }

        // 3. Nếu đã có targetChannel nhưng chưa có targetMessage -> Thử fetch bằng messageId hoặc tìm lại trong 50 tin nhắn gần nhất
        if (targetChannel && !targetMessage) {
            if (roomConfig.discordMessageId) {
                try {
                    targetMessage = await targetChannel.messages.fetch(roomConfig.discordMessageId);
                } catch (e) {
                    targetMessage = null;
                }
            }
            if (!targetMessage) {
                try {
                    const messages = await targetChannel.messages.fetch({ limit: 50 });
                    targetMessage = messages.find(m =>
                        m.author.id === discordClientInstance.user.id &&
                        m.embeds.some(e => e.author?.name?.includes('24/7 Community Room') || e.description?.includes('Match ID:'))
                    );
                } catch (err) {
                    console.warn('[24/7 Auto-Recreate] Lỗi tìm kiếm tin nhắn trong channel:', err.message);
                }
            }
        }

        // 4. Nếu tìm thấy tin nhắn Embed cũ -> Chỉnh sửa trực tiếp sang Match ID mới
        if (targetMessage) {
            try {
                await targetMessage.edit({ embeds: [newEmbed] });
                update247RoomConfig(newMatchId, {
                    discordChannelId: targetMessage.channel.id,
                    discordMessageId: targetMessage.id
                });
                console.log(`[24/7 Auto-Recreate] 🖼️ Đã chỉnh sửa thành công Embed Discord cũ sang Match ID mới: ${newMatchId} (Message ID: ${targetMessage.id})`);
                return;
            } catch (editErr) {
                console.warn('[24/7 Auto-Recreate] Edit tin nhắn cũ thất bại, chuyển sang gửi tin nhắn mới:', editErr.message);
            }
        }

        // 5. Nếu có channel nhưng không tìm thấy tin nhắn cũ -> Gửi tin nhắn Embed mới
        if (targetChannel) {
            const newSentMsg = await targetChannel.send({
                content: `🔄 **Phòng 24/7 (${roomName}) đã tự động tái tạo phòng mới sau 20 phút vắng người!**`,
                embeds: [newEmbed]
            });
            update247RoomConfig(newMatchId, {
                discordChannelId: targetChannel.id,
                discordMessageId: newSentMsg.id
            });
            console.log(`[24/7 Auto-Recreate] 📨 Đã gửi tin nhắn Embed Discord mới với Match ID: ${newMatchId}`);
        } else {
            console.warn('[24/7 Auto-Recreate] ⚠️ Không tìm thấy kênh Discord nào để cập nhật Embed phòng 24/7.');
        }
    } catch (discErr) {
        console.error('[24/7 Auto-Recreate Discord Edit Error]:', discErr.message);
    }
}

/**
 * 🎯 VÒNG LẶP GIỮ PHÒNG 24/7 (AUTO-RECREATE SAU 20 PHÚT VẮNG NGƯỜI)
 * Nếu phòng trống 0 người chơi liên tục trong 20 phút -> Tự đóng & tạo phòng 24/7 mới,
 * sau đó cập nhật Match ID mới lên tin nhắn Embed Discord!
 */
export function start247KeepAliveLoop(banchoClient) {
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    keepAliveTimer = setInterval(async () => {
        try {
            const rooms = loadMulti247Rooms();
            const now = Date.now();

            for (const matchId of Object.keys(rooms)) {
                const channelName = `#mp_${matchId}`;
                const channel = banchoClient?.getChannel(channelName);
                if (!channel) continue;

                // 1. Kiểm tra số lượng người chơi thực tế trong lobby
                let activePlayerCount = 0;
                try {
                    const slots = channel.lobby?.slots || [];
                    activePlayerCount = slots.filter(s => s && s.user).length;
                } catch (e) {
                    activePlayerCount = 0;
                }

                // 2. Nếu phòng ĐANG CÓ NGƯỜI CHƠI -> cập nhật timestamp & tiếp tục
                if (activePlayerCount > 0) {
                    touch247RoomActivity(matchId);
                    continue;
                }

                // 3. Nếu phòng TRỐNG NGƯỜI (0 players) -> Tính thời gian phòng bị bỏ trống
                const lastActivity = roomLastActivityMap.get(String(matchId)) || now;
                const idleMinutes = (now - lastActivity) / (60 * 1000);

                // 4. Nếu phòng trống ĐỦ 20 PHÚT trở lên -> Tự động đóng & tái tạo phòng mới!
                if (idleMinutes >= 20) {
                    console.log(`[24/7 Auto-Recreate] 🔄 Phòng ${channelName} vắng người >= 20 phút. Tiến hành tự đóng & tạo phòng 24/7 mới...`);
                    await recreate247Room(matchId, banchoClient);
                }
            }
        } catch (err) {
            console.error('[24/7 Keep-Alive Error]:', err.message);
        }
    }, 60 * 1000); // Check mỗi 1 phút
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

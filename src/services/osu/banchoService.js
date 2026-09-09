import banchojs from 'bancho.js';
import { askYue } from '../aiService.js';
import { botConfig } from '../../config/botConfig.js';

import { handlePlayerCommands } from '../../commands/osuInGame/playerCommands.js';
import { handleInGameHelp } from '../../commands/osuInGame/helpCommand.js';
import { handleMapCommands, setRoomCurrentMap, currentRoomMapId, sendBeatmapInfoAndDL } from '../../commands/osuInGame/mapCommands.js';
import { handleRefCommands, isUserRef } from '../../commands/osuInGame/refCommands.js';
import {
    handleHostCommands,
    handlePlayerJoin,
    addPlayerToQueue,
    removePlayerFromQueue,
    rotateToNextHost,
    isAutohostOn,
    enableAutohostForChannel
} from '../../commands/osuInGame/hostCommands.js';
import { handle247RoomCommands } from '../multi247/room247Commands.js';
import { getRoomLanguage, t } from '../multi247/multilingualService.js';
import { get247RoomConfig, loadMulti247Rooms, is247CommunityRoom, unregister247Room, reset247RoomLobbyDefaults, start247KeepAliveLoop } from '../multi247/room247Manager.js';
import { recordRoomMatch, handleMatchEvaluationCommand } from './matchEvaluatorService.js';

const { BanchoClient } = banchojs;

const bancho = new BanchoClient({
    username: process.env.BANCHO_IRC_USERNAME,
    password: process.env.BANCHO_IRC_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

let isConnected = false;
let connectPromise = null;
let isListenersAttached = false;
const attachedChannels = new Set();

export const activeLobbies = new Map();
const channelCooldowns = new Map();
const COOLDOWN_TIME_MS = 3000;

const isRotatingMap = new Map();

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

const lastAutoStartMap = new Map();

async function triggerAutoStart(channel) {
    try {
        const channelName = channel.name;
        const now = Date.now();
        const lastStart = lastAutoStartMap.get(channelName) || 0;
        if (now - lastStart < 10000) return; // Cooldown 10 giây để chống spam start

        lastAutoStartMap.set(channelName, now);
        console.log(`[AutoStart Tracker] 🚀 Phát hiện tất cả người chơi trong ${channelName} đã Ready!`);
        await channel.sendMessage("YUE: Mọi người đã Ready hết rồi nè! Đếm ngược 10s bắt đầu nha...");
        await channel.sendMessage("!mp start 10");
    } catch (err) {
        console.error('[AutoStart Error]:', err.message);
    }
}

function attachLobbyEvents(channel) {
    const lobby = channel.lobby;
    if (!lobby || attachedChannels.has(channel.name)) return;
    attachedChannels.add(channel.name);

    lobby.on("beatmap", (beatmap) => {
        try {
            if (beatmap && beatmap.id) {
                setRoomCurrentMap(channel.name, beatmap.id);
                console.log(`[Lobby Event] 🗺️ Đã cập nhật Beatmap ID: ${beatmap.id}`);
            }
        } catch (e) {
            console.error('[Lobby Beatmap Event Error]:', e.message);
        }
    });

    lobby.on("allPlayersReady", async () => {
        await triggerAutoStart(channel);
    });

    lobby.on("playerJoined", (obj) => {
        try {
            const username = obj.player?.user?.username || obj.user?.username;
            if (username) addPlayerToQueue(channel, username);
        } catch (e) {
            console.error('[PlayerJoined Event Error]:', e.message);
        }
    });

    lobby.on("playerLeft", (obj) => {
        try {
            const username = obj.player?.user?.username || obj.user?.username;
            if (username) removePlayerFromQueue(channel, username);
        } catch (e) {
            console.error('[PlayerLeft Event Error]:', e.message);
        }
    });
}

export async function forceJoinLobby(matchId, retries = 3) {
    const channelName = `#mp_${matchId}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await initBancho();
            const channel = bancho.getChannel(channelName);

            await channel.join();
            attachLobbyEvents(channel);
            enableAutohostForChannel(channel);

            const existingData = activeLobbies.get(matchId) || {};
            activeLobbies.set(matchId, {
                ...existingData,
                matchId: String(matchId),
                channel: channel,
                lobby: channel.lobby
            });

            console.log(`✅ Đã ép Yue rejoin thành công vào ${channelName}`);
            return true;
        } catch (err) {
            console.error(`⚠️ Lỗi khi force join ${channelName} (thử lần ${attempt}/${retries}):`, err.message || err);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                activeLobbies.delete(matchId);
                const isNoSuchChannel = (err.message || '').toLowerCase().includes('no such channel');
                if (isNoSuchChannel) {
                    unregister247Room(matchId);
                    console.log(`ℹ️ [Bancho IRC] Đã tự động dọn dẹp phòng ${matchId} khỏi DB vì phòng đã thực sự bị xóa trên Bancho.`);
                } else {
                    console.log(`⚠️ [Bancho IRC] Giữ lại phòng 24/7 ${matchId} trong DB để tiếp tục tự động rejoin ở chu kỳ sau.`);
                }
                return false;
            }
        }
    }
    return false;
}

export async function initBancho() {
    const isMultiEnabled = botConfig.osuMultiplayer?.enabled;
    const isNormalEnabled = botConfig.osuMultiplayer?.normalRooms;
    const is247Enabled = botConfig.osuMultiplayer?.community247Rooms;

    if (!isMultiEnabled || (!isNormalEnabled && !is247Enabled)) {
        console.log('⚡ [Master Control Panel] Tính năng Osu Multiplayer & Bancho IRC đang TẮT (Hoặc cả Normal & 247 đều tắt)!');
        return null;
    }
    if (isConnected) return bancho;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
        try {
            await bancho.connect();
            isConnected = true;
            console.log('✅ Đã kết nối thành công tới osu! Bancho IRC!');

            if (!isListenersAttached) {
                isListenersAttached = true;
                bancho.removeAllListeners('PM');
                bancho.removeAllListeners('CM');
                bancho.on('PM', handleInGameChat);
                bancho.on('CM', handleInGameChat);
            }

            // Khôi phục phòng 24/7 từ storage CHỈ KHI tính năng community247Rooms được BẬT
            if (is247Enabled) {
                console.log('🌐 [Bancho IRC] Đang khôi phục các phòng 24/7 Cộng Đồng...');
                const stored247Rooms = loadMulti247Rooms();
                for (const matchId of Object.keys(stored247Rooms)) {
                    if (!activeLobbies.has(matchId)) {
                        activeLobbies.set(matchId, {
                            matchId: String(matchId),
                            ownerId: stored247Rooms[matchId].ownerDiscordId,
                            createdAt: stored247Rooms[matchId].createdAt || Date.now()
                        });
                    }
                }

                for (const [matchId] of activeLobbies.entries()) {
                    await forceJoinLobby(matchId);
                }

                // 💓 Bật Vòng lặp Keep-Alive giữ phòng 24/7 không bị Bancho tự đóng
                if (botConfig.osuMultiplayer?.keepAliveHeartbeat) {
                    start247KeepAliveLoop(bancho);
                }
            } else {
                console.log('ℹ️ [Bancho IRC] Tính năng Phòng 24/7 đang TẮT trên instance này.');
            }

            return bancho;
        } catch (err) {
            connectPromise = null;
            console.error('❌ Lỗi kết nối Bancho IRC:', err.message || err);
            return bancho;
        }
    })();

    return connectPromise;
}

async function fetchBeatmapDetail(beatmapId) {
    if (!beatmapId) return null;
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey) return null;

        const res = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmapId}`);
        const data = await res.json();

        if (data && data.length > 0) {
            const bm = data[0];
            return `${bm.artist} - ${bm.title} [${bm.version}] (${parseFloat(bm.difficultyrating).toFixed(2)}★)`;
        }
    } catch (e) {
        console.error('Lỗi fetch detail beatmap cho Context AI:', e.message);
    }
    return null;
}

/**
 * 🎯 HÀM ĐỊNH TUYẾN THỰC THI LỆNH
 */
export async function executeRoutedCommand(channel, messageObj, commandString, senderUsername) {
    try {
        const trimmedCmd = commandString.trim();
        const args = trimmedCmd.split(/ +/);
        const command = args[0].toLowerCase();
        const commandArgs = args.slice(1);

        if (command.startsWith('!mp')) {
            if (!isUserRef(channel.name, senderUsername)) {
                console.log(`[Security Check] ⛔ ${senderUsername} tried running ${trimmedCmd} but is not Ref/Admin.`);
                return await channel.sendMessage(`YUE: Chỉ Ref/Admin mới có quyền thực thi lệnh Bancho trực tiếp (${command})!`);
            }

            let finalCmd = trimmedCmd;
            // Tự động kiểm tra và khớp tên người chơi nguyên bản trong game cho lệnh !mp host <user>
            if (command === '!mp' && commandArgs[0]?.toLowerCase() === 'host' && commandArgs[1]) {
                const targetSearch = commandArgs.slice(1).join(' ').trim().toLowerCase();
                const slots = channel.lobby?.slots || [];
                const activePlayers = slots.filter(s => s && s.user).map(s => s.user.username);

                const matchedUser = activePlayers.find(p => {
                    const pLower = p.toLowerCase();
                    const pClean = pLower.replace(/\[|\]/g, '');
                    const targetClean = targetSearch.replace(/\[|\]/g, '');
                    return pLower === targetSearch || pClean === targetClean || pLower.includes(targetSearch);
                });

                if (matchedUser) {
                    finalCmd = `!mp host ${matchedUser}`;
                }
            }

            return await channel.sendMessage(finalCmd);
        }
        if (['.help', '!help', '.info', '!info'].includes(command)) {
            return await handleInGameHelp(channel);
        }
        if (['.sr', '!sr', '.stars', '!stars', '.vote', '!vote', '.roominfo', '!roominfo', '.247', '!247'].includes(command)) {
            return await handle247RoomCommands(channel, messageObj, commandString, senderUsername);
        }
        if (['.addref', '!addref', '.rmref', '!rmref', '.refs', '!refs'].includes(command)) {
            return await handleRefCommands(channel, messageObj, commandArgs, command);
        }
        if (['.map', '!map', '.m', '.abort', '!abort', '.time', '!time', '.timer', '.rnd', '!rnd', '.random', '!random', '.dl', '!dl', '.dlmap', '!dlmap', '.link', '!link', '.a', '!a', '.accept', '!accept'].includes(command)) {
            return await handleMapCommands(channel, messageObj, commandArgs, command);
        }
        if (['.rs', '!rs', '.r', '!r'].includes(command)) {
            return await handlePlayerCommands(channel, messageObj, commandArgs, command);
        }
        if ([
            '.ah', '!ah', '.autohost', '!autohost',
            '.ahoff', '!ahoff', '.unah', '!unah', '.autohostoff',
            '.next', '!next', '.skip', '!skip',
            '.q', '!q', '.queue', '!queue',
            '.host', '!host'
        ].includes(command)) {
            return await handleHostCommands(channel, messageObj, commandArgs, command);
        }
    } catch (err) {
        console.error(`❌ Lỗi thực thi lệnh ${commandString}:`, err.message);
    }
}

async function handleInGameChat(message) {
    try {
        const channel = message.channel;
        const channelName = channel?.name || '';
        const content = message.message?.trim() || '';
        const senderUsername = message.user?.ircUsername || message.user?.username || 'Player';

        if (!channelName.startsWith('#mp_')) return;
        if (content.startsWith('YUE:')) return;

        // 🎯 XỬ LÝ SỰ KIỆN TỪ BANCHOBOT
        if (senderUsername.toLowerCase() === 'banchobot') {
            const lowerContent = content.toLowerCase();

            // Bắt sự kiện tất cả người chơi đã Ready từ BanchoBot chat
            if (lowerContent.includes('all players are ready') || lowerContent.includes('all players ready')) {
                await triggerAutoStart(channel);
                return;
            }

            // Tối ưu bắt ID Beatmap từ tin nhắn BanchoBot
            if (lowerContent.includes('changed beatmap to') || lowerContent.includes('beatmap changed to') || lowerContent.includes('selected:')) {
                const match = content.match(/\/(?:b|beatmaps)\/(\d+)/i) || content.match(/b\/(\d+)/i);
                if (match && match[1]) {
                    const mapId = match[1];
                    const currentMap = currentRoomMapId.get(channelName);
                    if (currentMap === mapId) {
                        console.log(`[BanchoBot Tracker] ℹ️ Map ID ${mapId} trùng với map hiện tại của ${channelName}, bỏ qua.`);
                        return;
                    }
                    setRoomCurrentMap(channelName, mapId);
                    console.log(`[BanchoBot Tracker] 🗺️ Đã lưu Beatmap ID: ${mapId}`);
                    await sendBeatmapInfoAndDL(channel, mapId);
                }
                return;
            }

            if (lowerContent.includes('joined in slot')) {
                const joinedUser = content.split(' joined in slot')[0].trim();
                if (joinedUser) await handlePlayerJoin(channel, joinedUser);
                return;
            }

            if (lowerContent.includes('left the game')) {
                const leftUser = content.split(' left the game')[0].trim();
                if (leftUser) await removePlayerFromQueue(channel, leftUser);
                return;
            }

            if (lowerContent.includes('the match has finished')) {
                const matchId = channelName.replace('#mp_', '');
                
                // 🎯 TỰ ĐỘNG GHI NHỚ TRẬN ĐẤU VỪA HOÀN THÀNH VÀO BỘ NHỚ RAM
                setTimeout(async () => {
                    try {
                        await recordRoomMatch(matchId, channelName);
                    } catch (mErr) {
                        console.error('[MatchEvaluator AutoRecord Error]:', mErr.message);
                    }
                }, 1500);

                // ⚙️ TỰ ĐỘNG RESET VỀ SETTING CHUẨN + FREEMOD + KHÔNG MẬT KHẨU SAU MỖI TRẬN
                if (is247CommunityRoom(matchId) || isAutohostOn(channelName)) {
                    await reset247RoomLobbyDefaults(channel);
                }

                if (isAutohostOn(channelName)) {
                    if (isRotatingMap.get(channelName)) return;
                    isRotatingMap.set(channelName, true);

                    setTimeout(async () => {
                        try {
                            await rotateToNextHost(channel);
                        } catch (rotErr) {
                            console.error('[Autohost Rotate Error]:', rotErr.message);
                        } finally {
                            isRotatingMap.set(channelName, false);
                        }
                    }, 1000);
                }
                return;
            }

            return;
        }

        if (content.toLowerCase() === '.yue help' || content.startsWith('.help') || content.startsWith('!help') || content.startsWith('.info') || content.startsWith('!info')) {
            const now = Date.now();
            const lastHelpUsed = channelCooldowns.get(`${channelName}_help`) || 0;
            if (now - lastHelpUsed < 5000) return;
            channelCooldowns.set(`${channelName}_help`, now);

            return await handleInGameHelp(channel);
        }

        const firstWord = content.split(/ +/)[0].toLowerCase();
        
        // 🎯 Lệnh đánh giá trận đấu trực tiếp
        if (['.match', '!match', '.danhgia', '!danhgia', '.review', '!review'].includes(firstWord)) {
            const now = Date.now();
            const lastUsed = channelCooldowns.get(channelName) || 0;
            if (now - lastUsed < COOLDOWN_TIME_MS) return;
            channelCooldowns.set(channelName, now);

            return await handleMatchEvaluationCommand(channel, senderUsername, content);
        }

        const standardCommands = [
            '.sr', '!sr', '.stars', '!stars', '.vote', '!vote', '.roominfo', '!roominfo', '.247', '!247',
            '.host', '!host',
            '.addref', '!addref', '.rmref', '!rmref', '.refs', '!refs',
            '.abort', '!abort', '.time', '!time', '.timer', '.rnd', '!rnd', '.random', '!random',
            '.map', '!map', '.m', '.dl', '!dl', '.dlmap', '!dlmap', '.link', '!link', '.a', '!a', '.accept', '!accept',
            '.rs', '!rs', '.r', '!r',
            '.ah', '!ah', '.autohost', '!autohost', '.ahoff', '!ahoff', '.unah', '!unah',
            '.next', '!next', '.skip', '!skip', '.q', '!q', '.queue', '!queue'
        ];

        if (standardCommands.includes(firstWord)) {
            return await executeRoutedCommand(channel, message, content, senderUsername);
        }

        if (firstWord === '.yue' || firstWord === '!yue') {
            const now = Date.now();
            const lastUsed = channelCooldowns.get(channelName) || 0;
            if (now - lastUsed < COOLDOWN_TIME_MS) return;
            channelCooldowns.set(channelName, now);

            return await handle247RoomCommands(channel, message, content, senderUsername);
        }

    } catch (globalErr) {
        console.error('💥 Lỗi toàn cục handleInGameChat:', globalErr.message);
    }
}

export function getBanchoClient() {
    return bancho;
}
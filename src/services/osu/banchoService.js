import banchojs from 'bancho.js';
import { askYue } from '../aiService.js';

import { handlePlayerCommands } from '../../commands/osuInGame/playerCommands.js';
import { handleInGameHelp } from '../../commands/osuInGame/helpCommand.js';
import { handleMapCommands, setRoomCurrentMap, currentRoomMapId } from '../../commands/osuInGame/mapCommands.js';
import { handleRefCommands, isUserRef } from '../../commands/osuInGame/refCommands.js';
import {
    handleHostCommands,
    addPlayerToQueue,
    removePlayerFromQueue,
    rotateToNextHost,
    isAutohostOn
} from '../../commands/osuInGame/hostCommands.js';

const { BanchoClient } = banchojs;

const bancho = new BanchoClient({
    username: process.env.BANCHO_IRC_USERNAME,
    password: process.env.BANCHO_IRC_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

let isConnected = false;
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
    if (!lobby) return;

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
            if (username) addPlayerToQueue(channel.name, username);
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

export async function forceJoinLobby(matchId) {
    try {
        await initBancho();
        const channelName = `#mp_${matchId}`;
        const channel = bancho.getChannel(channelName);

        await channel.join();
        attachLobbyEvents(channel);

        console.log(`✅ Đã ép Yue rejoin thành công vào ${channelName}`);
        return true;
    } catch (err) {
        console.error(`❌ Lỗi khi force join ${matchId}:`, err);
        return false;
    }
}

export async function initBancho() {
    if (isConnected) return bancho;
    try {
        await bancho.connect();
        isConnected = true;
        console.log('✅ Đã kết nối thành công tới osu! Bancho IRC!');

        bancho.on('PM', handleInGameChat);
        bancho.on('CM', handleInGameChat);

        for (const [matchId] of activeLobbies.entries()) {
            await forceJoinLobby(matchId);
        }

    } catch (err) {
        console.error('❌ Lỗi kết nối Bancho IRC:', err);
    }
    return bancho;
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
 * 🎯 HÀM ĐỊNH TUYẾN THỰC THI LỆNH (ĐÃ FIX BỔ SUNG .MAP VÀ .M)
 */
async function executeRoutedCommand(channel, messageObj, commandString, senderUsername) {
    try {
        const trimmedCmd = commandString.trim();
        const args = trimmedCmd.split(/ +/);
        const command = args[0].toLowerCase();
        const commandArgs = args.slice(1);

        if (command.startsWith('!mp')) {
            return await channel.sendMessage(trimmedCmd);
        }
        if (['.addref', '!addref', '.rmref', '!rmref', '.refs', '!refs'].includes(command)) {
            return await handleRefCommands(channel, messageObj, commandArgs, command);
        }
        // 🎯 FIX: Đã bổ sung .map, !map, .m vào danh sách gọi handleMapCommands
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
                    setRoomCurrentMap(channelName, match[1]);
                    console.log(`[BanchoBot Tracker] 🗺️ Đã lưu Beatmap ID: ${match[1]}`);
                }
                return;
            }

            if (lowerContent.includes('joined in slot')) {
                const joinedUser = content.split(' joined in slot')[0].trim();
                if (joinedUser) addPlayerToQueue(channelName, joinedUser);
                return;
            }

            if (lowerContent.includes('left the game')) {
                const leftUser = content.split(' left the game')[0].trim();
                if (leftUser) await removePlayerFromQueue(channel, leftUser);
                return;
            }

            if (lowerContent.includes('the match has finished')) {
                if (isAutohostOn(channelName)) {
                    if (isRotatingMap.get(channelName)) return;
                    isRotatingMap.set(channelName, true);

                    await channel.sendMessage('YUE: Trận đấu kết thúc! Đổi Host cho người tiếp theo...');

                    setTimeout(async () => {
                        try {
                            await rotateToNextHost(channel);
                        } catch (rotErr) {
                            console.error('[Autohost Rotate Error]:', rotErr.message);
                        } finally {
                            isRotatingMap.set(channelName, false);
                        }
                    }, 2000);
                }
                return;
            }

            return;
        }

        if (content.toLowerCase() === '.yue help' || content.startsWith('.help') || content.startsWith('!help')) {
            const now = Date.now();
            const lastHelpUsed = channelCooldowns.get(`${channelName}_help`) || 0;
            if (now - lastHelpUsed < 5000) return;
            channelCooldowns.set(`${channelName}_help`, now);

            return await handleInGameHelp(channel);
        }

        const firstWord = content.split(/ +/)[0].toLowerCase();
        const standardCommands = [
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

            const userPrompt = content.substring(firstWord.length).trim();
            if (!userPrompt) {
                return await channel.sendMessage(`YUE: Kêu tui gì đó ${senderUsername}? Gõ ".yue <câu_hỏi>" để chat!`);
            }

            try {
                const lobby = channel.lobby;
                const slots = lobby?.slots || [];
                const activePlayers = slots.filter(s => s && s.user).map(s => s.user.username);
                const hostUser = lobby?.host?.username || slots.find(s => s && s.user && s.isHost)?.user?.username || activePlayers[0] || 'Chưa rõ';

                let senderRole = "Player thường";
                if (isCurrentHost(channel, senderUsername)) senderRole = "Host";
                else if (isUserRef(channelName, senderUsername)) senderRole = "Ref";

                let currentMapText = 'Chưa chọn map';
                const savedMapId = currentRoomMapId.get(channelName);
                if (savedMapId) {
                    const mapInfo = await fetchBeatmapDetail(savedMapId);
                    if (mapInfo) currentMapText = mapInfo;
                }

                const ingameContext = {
                    host: hostUser,
                    sender: senderUsername,
                    senderRole: senderRole,
                    playerCount: activePlayers.length,
                    playersList: activePlayers.join(', '),
                    currentMap: currentMapText
                };

                const aiRawJson = await askYue(`ingame_${senderUsername}`, senderUsername, userPrompt, null, false, ingameContext);
                const aiData = JSON.parse(aiRawJson);

                if (aiData.reply) {
                    await channel.sendMessage(`YUE: ${aiData.reply}`);
                }

                if (aiData.command && aiData.command.trim() !== '') {
                    await executeRoutedCommand(channel, message, aiData.command.trim(), senderUsername);
                }

            } catch (err) {
                console.error('❌ Lỗi AI In-Game (JSON Parse):', err.message);
                return await channel.sendMessage(`YUE: Lú quá xử lý không nổi lệnh này rồi ông bạn...`);
            }
        }
    } catch (globalErr) {
        console.error('💥 Lỗi toàn cục handleInGameChat:', globalErr.message);
    }
}

export function getBanchoClient() {
    return bancho;
}
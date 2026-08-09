import { isUserRef } from './refCommands.js';

export const currentRoomMapId = new Map();
const lobbyRequests = new Map();

function getRequestsMap(channelName) {
    if (!lobbyRequests.has(channelName)) {
        lobbyRequests.set(channelName, new Map());
    }
    return lobbyRequests.get(channelName);
}

export function clearLobbyRequests(channelName) {
    if (lobbyRequests.has(channelName)) {
        lobbyRequests.get(channelName).clear();
    }
}

function addMapRequest(channelName, username, mapObject) {
    const userMap = getRequestsMap(channelName);
    const userLower = username.toLowerCase();

    if (!userMap.has(userLower)) {
        userMap.set(userLower, []);
    }

    const list = userMap.get(userLower);
    list.push(mapObject);

    if (list.length > 5) {
        list.shift();
    }

    return list.length;
}

function formatShortTitle(title, maxLength = 25) {
    if (!title) return 'Map';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3).trim() + '...';
}

function buildDownloadLinks(beatmapSetId, beatmapId) {
    const direct = `osu://b/${beatmapId}`;
    const mirror = `https://osu.direct/d/${beatmapSetId}`;
    const mino = `https://catboy.best/d/${beatmapSetId}`;
    const neri = `https://nerinyan.moe/d/${beatmapSetId}`;
    const btct = `https://beatconnect.io/b/${beatmapSetId}`;
    const chimu = `https://chimu.moe/d/${beatmapSetId}`;
    const sayo = `https://sayobot.cn/downloads?html=${beatmapSetId}`;
    
    return `[${direct} Direct] | [${mirror} Mirror] | [${mino} Mino] | [${neri} Nerinyan] | [${btct} Beatconnect] | [${chimu} Chimu] | [${sayo} Sayobot]`;
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

function parseRandomArgs(args) {
    let stars = null;
    let maxDuration = 900;
    let statuses = [];

    args.forEach(arg => {
        const lower = arg.toLowerCase().trim();

        if (['rd', 'ranked', 'ld', 'loved', 'unrd', 'unranked', 'qd', 'qualified'].some(k => lower.includes(k))) {
            const parts = lower.split(',');
            parts.forEach(p => {
                const sub = p.trim();
                if (['rd', 'ranked'].includes(sub)) statuses.push('1', '2');
                if (['ld', 'loved'].includes(sub)) statuses.push('4');
                if (['qd', 'qualified'].includes(sub)) statuses.push('3');
                if (['unrd', 'unranked'].includes(sub)) statuses.push('0', '-1', '-2');
            });
        }
        else if (lower.endsWith('s') && !isNaN(parseFloat(lower.replace('s', '')))) {
            maxDuration = parseFloat(lower.replace('s', ''));
        }
        else if (lower.endsWith('m') && !isNaN(parseFloat(lower.replace('m', '')))) {
            maxDuration = parseFloat(lower.replace('m', '')) * 60;
        }
        else {
            const val = parseFloat(lower.replace('*', ''));
            if (!isNaN(val)) {
                if (stars === null) {
                    stars = val;
                } else {
                    maxDuration = val * 60;
                }
            }
        }
    });

    return { stars, maxDuration, statuses };
}

async function fetchRandomBeatmap({ stars, maxDuration, statuses }) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        const targetStar = stars !== null ? stars : (Math.random() * 3.5 + 3.5);
        const minStar = Math.max(1, targetStar - 0.4);
        const maxStar = targetStar + 0.4;

        if (apiKey) {
            const sinceDate = new Date(Date.now() - Math.floor(Math.random() * 5 * 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            const url = `https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&m=0&since=${sinceDate}`;
            
            const res = await fetch(url);
            const data = await res.json();

            if (data && data.length > 0) {
                const validMaps = data.filter(bm => {
                    const bmStar = parseFloat(bm.difficultyrating);
                    const bmTime = parseInt(bm.total_length);
                    const bmStatus = String(bm.approved);

                    const matchStar = bmStar >= minStar && bmStar <= maxStar;
                    const matchTime = bmTime <= maxDuration;
                    const matchStatus = statuses.length === 0 || statuses.includes(bmStatus);

                    return matchStar && matchTime && matchStatus;
                });

                if (validMaps.length > 0) {
                    const bm = validMaps[Math.floor(Math.random() * validMaps.length)];
                    return {
                        beatmap_id: bm.beatmap_id,
                        beatmapset_id: bm.beatmapset_id,
                        artist: bm.artist,
                        title: bm.title,
                        version: bm.version,
                        stars: parseFloat(bm.difficultyrating)
                    };
                }
            }
        }

        const resCat = await fetch(`https://catboy.best/api/v2/search?mode=0&q=a`);
        const dataCat = await resCat.json();
        const sets = dataCat?.beatmapsets || [];

        for (const set of sets) {
            for (const bm of set.beatmaps) {
                const bmStar = parseFloat(bm.difficulty_rating);
                if (bmStar >= minStar && bmStar <= maxStar) {
                    return {
                        beatmap_id: bm.id,
                        beatmapset_id: set.id,
                        artist: set.artist,
                        title: set.title,
                        version: bm.version,
                        stars: bmStar
                    };
                }
            }
        }

        return null;
    } catch (err) {
        console.error('Lỗi fetch random beatmap:', err);
        return null;
    }
}

export function setRoomCurrentMap(channelName, mapId) {
    currentRoomMapId.set(channelName, mapId);
}

async function applyMapToRoom(channel, map) {
    const channelName = channel.name;
    setRoomCurrentMap(channelName, map.beatmap_id);

    await channel.sendMessage(`!mp map ${map.beatmap_id}`);
    
    const shortTitle = formatShortTitle(map.title, 25);
    const diffName = map.version ? ` [${map.version}]` : '';
    const mapWebUrl = `https://osu.ppy.sh/b/${map.beatmap_id}`;
    
    const mapTextWithLink = `[${mapWebUrl} ${shortTitle}${diffName}]`;

    return await channel.sendMessage(
        `YUE: Đã chọn map! ${mapTextWithLink} (${map.stars.toFixed(2)}★) | Gõ .map để xem thông tin & link tải!`
    );
}

export async function handleMapCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const lowerCmd = command ? command.toLowerCase() : '';

    if (lowerCmd === '.abort' || lowerCmd === '!abort') {
        await channel.sendMessage(`!mp abort`);
        return await channel.sendMessage(`YUE: Đã hủy trận đấu!`);
    }

    if (lowerCmd === '.time' || lowerCmd === '!time' || lowerCmd === '.timer') {
        const seconds = parseInt(args[0]) || 30;
        await channel.sendMessage(`!mp timer ${seconds}`);
        return await channel.sendMessage(`YUE: Đã bật đếm ngược ${seconds} giây!`);
    }

    // 🎯 LỆNH .MAP VÀ .DL
    if (['.map', '!map', '.m', '.dl', '!dl', '.dlmap', '!dlmap', '.link', '!link'].includes(lowerCmd)) {
        let mapId = currentRoomMapId.get(channelName);

        // Fallback: Nếu MapId chưa có trong RAM, tự lấy trực tiếp từ Object lobby của channel
        if (!mapId && channel.lobby?.beatmapId) {
            mapId = channel.lobby.beatmapId;
            setRoomCurrentMap(channelName, mapId);
        }

        if (!mapId) {
            console.log(`[MapCmd Debug] Room ${channelName} chưa ghi nhận được Map ID nào.`);
            return await channel.sendMessage(`YUE: Chưa ghi nhận map nào trong phòng! Vui lòng pick/đổi map trước.`);
        }

        try {
            const apiKey = process.env.OSU_API_KEY;
            let bm = null;

            if (apiKey) {
                const bmRes = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${mapId}`);
                const bmData = await bmRes.json();
                if (bmData && bmData.length > 0) bm = bmData[0];
            }

            if (!bm) {
                const resRosu = await fetch(`https://catboy.best/api/v2/b/${mapId}`);
                const dataRosu = await resRosu.json();
                if (dataRosu && (dataRosu.id || dataRosu.beatmapset_id)) {
                    bm = {
                        beatmapset_id: dataRosu.beatmapset_id || dataRosu.beatmapset?.id || dataRosu.setId,
                        title: dataRosu.title || dataRosu.beatmapset?.title || 'Beatmap',
                        version: dataRosu.version || '',
                        difficultyrating: dataRosu.difficulty_rating || dataRosu.stars || 0,
                        diff_overall: dataRosu.accuracy || dataRosu.od || 8,
                        diff_approach: dataRosu.ar || 9,
                        diff_drain: dataRosu.hp || 6,
                        diff_size: dataRosu.cs || 4,
                        max_combo: dataRosu.max_combo || 0
                    };
                }
            }

            if (bm) {
                const setId = bm.beatmapset_id;
                const shortTitle = formatShortTitle(bm.title, 20);
                const diffName = bm.version ? `[${bm.version}]` : '';
                const stars = parseFloat(bm.difficultyrating || 0).toFixed(2);
                const combo = bm.max_combo ? `${bm.max_combo}x` : '?x';

                const ar = parseFloat(bm.diff_approach || 0).toFixed(1);
                const od = parseFloat(bm.diff_overall || 0).toFixed(1);
                const hp = parseFloat(bm.diff_drain || 0).toFixed(1);
                const cs = parseFloat(bm.diff_size || 0).toFixed(1);

                const baseStar = parseFloat(stars);
                const estimatedSS = Math.round(Math.pow(baseStar, 3) * 2.8);
                const estimated95 = Math.round(estimatedSS * 0.78);

                const dlLinks = buildDownloadLinks(setId, mapId);

                if (['.dl', '!dl', '.dlmap', '!dlmap', '.link', '!link'].includes(lowerCmd)) {
                    return await channel.sendMessage(`YUE DL: ${dlLinks}`);
                }

                const infoLine = `YUE MAP: ${shortTitle} ${diffName} (${stars}★) | SS: ${estimatedSS}pp | 95%: ${estimated95}pp | AR${ar} OD${od} HP${hp} CS${cs} | Combo: ${combo}`;
                const linkLine = `YUE DL: ${dlLinks}`;

                await channel.sendMessage(infoLine);
                await new Promise(resolve => setTimeout(resolve, 300));
                return await channel.sendMessage(linkLine);
            }
        } catch (e) {
            console.error('Lỗi lấy thông tin lệnh .map/.dl:', e.message);
        }
        return await channel.sendMessage(`YUE: Không lấy được thông tin/link tải cho map #${mapId}!`);
    }

    if (['.rnd', '!rnd', '.random', '!random'].includes(lowerCmd)) {
        const options = parseRandomArgs(args);
        const starInfo = options.stars ? `~${options.stars}★` : 'ngẫu nhiên★';
        
        await channel.sendMessage(`YUE: Đang tìm map (${starInfo}, max ${Math.round(options.maxDuration / 60)}m)...`);

        const map = await fetchRandomBeatmap(options);

        if (!map) {
            return await channel.sendMessage(`YUE: Không tìm thấy map phù hợp tiêu chí! Thử nới rộng độ sao xem sao.`);
        }

        if (isCurrentHost(channel, sender)) {
            return await applyMapToRoom(channel, map);
        }

        const reqIndex = addMapRequest(channelName, sender, map);
        const shortTitle = formatShortTitle(map.title, 25);
        const diffName = map.version ? ` [${map.version}]` : '';

        return await channel.sendMessage(
            `YUE: [Đề xuất #${reqIndex}] ${sender} vừa gợi ý map: ${shortTitle}${diffName} (${map.stars.toFixed(2)}★). Host gõ ".a ${sender}" để chọn map này!`
        );
    }

    if (['.a', '!a', '.accept', '!accept'].includes(lowerCmd)) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(`YUE: Chỉ Host hoặc Ref mới có quyền duyệt map (.a)!`);
        }

        const userMapRequests = getRequestsMap(channelName);

        if (userMapRequests.size === 0) {
            return await channel.sendMessage(`YUE: Hiện tại chưa có người chơi nào đề xuất map!`);
        }

        let targetUser = args[0]?.trim().toLowerCase();
        let indexParam = parseInt(args[1]);

        if (!targetUser) {
            const lastEntry = Array.from(userMapRequests.entries()).pop();
            if (!lastEntry) return await channel.sendMessage(`YUE: Hàng đợi đề xuất trống!`);

            const [pName, pList] = lastEntry;
            const chosenMap = pList[pList.length - 1];
            return await applyMapToRoom(channel, chosenMap);
        }

        const playerList = userMapRequests.get(targetUser);

        if (!playerList || playerList.length === 0) {
            return await channel.sendMessage(`YUE: Không tìm thấy đề xuất map nào từ người chơi "${args[0]}"!`);
        }

        let mapToPick = playerList[playerList.length - 1];

        if (!isNaN(indexParam) && indexParam >= 1 && indexParam <= playerList.length) {
            mapToPick = playerList[indexParam - 1];
        }

        return await applyMapToRoom(channel, mapToPick);
    }
}
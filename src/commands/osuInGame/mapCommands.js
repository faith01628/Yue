import { isUserRef } from './refCommands.js';
import { getRoomLanguage, t } from '../../services/multi247/multilingualService.js';
import { calculateBeatmapPP } from '../../services/osu/osuService.js';

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

function calculateEstimatedPP(stars, od = 8, maxCombo = 1000) {
    const starNum = parseFloat(stars) || 0;
    const odNum = parseFloat(od) || 8;
    const comboNum = parseInt(maxCombo) || 1000;

    let basePP = 0;
    if (starNum <= 5.0) {
        basePP = Math.pow(starNum, 3.25) * 0.68;
    } else {
        basePP = Math.pow(5.0, 3.25) * 0.68 + Math.pow(starNum - 5.0, 2.4) * 88;
    }

    const odBonus = 1 + (odNum - 8) * 0.04;
    const comboBonus = Math.min(1.25, Math.max(0.80, Math.pow(comboNum / 1000, 0.2)));

    const estimatedSS = Math.round(basePP * odBonus * comboBonus);
    const acc95Factor = Math.max(0.65, 0.91 - odNum * 0.015);
    const estimated95 = Math.round(estimatedSS * acc95Factor);

    return { estimatedSS, estimated95 };
}

const lastSentMapCache = new Map();

/**
 * 🎯 TỰ ĐỘNG GỬI THÔNG TIN MAP VÀ LINK TẢI NHANH (YUE MAP + YUE DL)
 */
export async function sendBeatmapInfoAndDL(channel, beatmapId, options = {}) {
    if (!channel || !beatmapId) return false;
    const channelName = typeof channel === 'string' ? channel : (channel.name || 'default');
    const force = options.force || false;

    const now = Date.now();
    const cached = lastSentMapCache.get(channelName);

    if (!force && cached && cached.beatmapId === String(beatmapId)) {
        console.log(`[sendBeatmapInfoAndDL] ℹ️ Map ID ${beatmapId} trùng với map hiện tại của ${channelName}, bỏ qua.`);
        return false;
    }

    lastSentMapCache.set(channelName, { beatmapId: String(beatmapId), time: now });

    try {
        const apiKey = process.env.OSU_API_KEY;
        let bm = null;

        if (apiKey) {
            const bmRes = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmapId}`);
            const bmData = await bmRes.json();
            if (bmData && bmData.length > 0) bm = bmData[0];
        }

        if (!bm) {
            const resRosu = await fetch(`https://catboy.best/api/v2/b/${beatmapId}`);
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
            let stars = parseFloat(bm.difficultyrating || 0).toFixed(2);
            let combo = bm.max_combo ? `${bm.max_combo}x` : '?x';

            const ar = parseFloat(bm.diff_approach || 0).toFixed(1);
            const od = parseFloat(bm.diff_overall || 0).toFixed(1);
            const hp = parseFloat(bm.diff_drain || 0).toFixed(1);
            const cs = parseFloat(bm.diff_size || 0).toFixed(1);

            // 🎯 Tính PP chuẩn bằng rosu-pp-js (chính xác 100% như Discord bot Bathbot / o!sb)
            let estimatedSS = '?';
            let estimated99 = '?';
            let estimated95 = '?';

            try {
                const [ssRes, p99Res, p95Res] = await Promise.all([
                    calculateBeatmapPP(beatmapId, { accuracy: 100 }),
                    calculateBeatmapPP(beatmapId, { accuracy: 99 }),
                    calculateBeatmapPP(beatmapId, { accuracy: 95 })
                ]);

                if (ssRes && ssRes.pp !== undefined) {
                    estimatedSS = Math.round(ssRes.pp);
                    if (ssRes.difficulty?.stars) {
                        stars = ssRes.difficulty.stars.toFixed(2);
                    }
                    if (ssRes.difficulty?.maxCombo) {
                        combo = `${ssRes.difficulty.maxCombo}x`;
                    }
                }
                if (p99Res && p99Res.pp !== undefined) {
                    estimated99 = Math.round(p99Res.pp);
                }
                if (p95Res && p95Res.pp !== undefined) {
                    estimated95 = Math.round(p95Res.pp);
                }
            } catch (calcErr) {
                console.error('[sendBeatmapInfoAndDL PP error]:', calcErr.message);
                const est = calculateEstimatedPP(stars, od, bm.max_combo);
                estimatedSS = est.estimatedSS;
                estimated95 = est.estimated95;
            }

            const dlLinks = buildDownloadLinks(setId, beatmapId);
            const mapTitleLink = `[https://osu.ppy.sh/b/${beatmapId} ${shortTitle} ${diffName}]`;

            const ppStr = estimated99 !== '?'
                ? `SS: ${estimatedSS}pp | 99%: ${estimated99}pp | 95%: ${estimated95}pp`
                : `SS: ${estimatedSS}pp | 95%: ${estimated95}pp`;

            const infoLine = `YUE MAP: ${mapTitleLink} (${stars}★) | ${ppStr} | AR${ar} OD${od} HP${hp} CS${cs} | Combo: ${combo}`;
            const linkLine = `YUE DL: ${dlLinks}`;

            await channel.sendMessage(infoLine);
            await new Promise(resolve => setTimeout(resolve, 300));
            await channel.sendMessage(linkLine);
            return true;
        }
    } catch (e) {
        console.error('[sendBeatmapInfoAndDL Error]:', e.message);
    }
    return false;
}

async function applyMapToRoom(channel, map) {
    const channelName = channel.name;
    const currentMap = currentRoomMapId.get(channelName);

    if (currentMap === String(map.beatmap_id)) {
        return await channel.sendMessage(`YUE: Map (${map.beatmap_id}) is already the active map in room!`);
    }

    setRoomCurrentMap(channelName, map.beatmap_id);

    await channel.sendMessage(`!mp map ${map.beatmap_id}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    await sendBeatmapInfoAndDL(channel, map.beatmap_id);
}

export async function handleMapCommands(channel, message, args, command) {
    const channelName = channel.name;
    const sender = message.user?.username || 'Player';
    const lowerCmd = command ? command.toLowerCase() : '';

    const roomLang = await getRoomLanguage(channel);

    if (lowerCmd === '.abort' || lowerCmd === '!abort') {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(t('hostNoPerm', roomLang));
        }
        await channel.sendMessage(`!mp abort`);
        return await channel.sendMessage('YUE: Aborted the match!');
    }

    if (lowerCmd === '.time' || lowerCmd === '!time' || lowerCmd === '.timer') {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(t('hostNoPerm', roomLang));
        }
        const seconds = parseInt(args[0]) || 30;
        await channel.sendMessage(`!mp timer ${seconds}`);
        return await channel.sendMessage(`YUE: Started ${seconds}s countdown!`);
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
            console.log(`[MapCmd Debug] Room ${channelName} no Map ID recorded.`);
            return await channel.sendMessage(`YUE: No map recorded in room yet! Please pick/change a map first.`);
        }

        return await sendBeatmapInfoAndDL(channel, mapId, { force: true });
    }

    if (['.rnd', '!rnd', '.random', '!random'].includes(lowerCmd)) {
        const options = parseRandomArgs(args);
        const starInfo = options.stars ? `~${options.stars}★` : 'random★';
        
        await channel.sendMessage(`YUE: Searching for map (${starInfo}, max ${Math.round(options.maxDuration / 60)}m)...`);

        const map = await fetchRandomBeatmap(options);

        if (!map) {
            return await channel.sendMessage(`YUE: No matching map found! Try widening the star range.`);
        }

        if (isCurrentHost(channel, sender)) {
            return await applyMapToRoom(channel, map);
        }

        const reqIndex = addMapRequest(channelName, sender, map);
        const shortTitle = formatShortTitle(map.title, 25);
        const diffName = map.version ? ` [${map.version}]` : '';

        return await channel.sendMessage(
            `YUE: [Request #${reqIndex}] ${sender} suggested map: ${shortTitle}${diffName} (${map.stars.toFixed(2)}★). Host type ".a ${sender}" to pick it!`
        );
    }

    if (['.a', '!a', '.accept', '!accept'].includes(lowerCmd)) {
        if (!isCurrentHost(channel, sender) && !isUserRef(channelName, sender)) {
            return await channel.sendMessage(`YUE: Only Host or Ref can accept map requests (.a)!`);
        }

        const userMapRequests = getRequestsMap(channelName);

        if (userMapRequests.size === 0) {
            return await channel.sendMessage(`YUE: No map requests suggested by players yet!`);
        }

        let targetUser = args[0]?.trim().toLowerCase();
        let indexParam = parseInt(args[1]);

        if (!targetUser) {
            const lastEntry = Array.from(userMapRequests.entries()).pop();
            if (!lastEntry) return await channel.sendMessage(`YUE: Request queue is empty!`);

            const [pName, pList] = lastEntry;
            const chosenMap = pList[pList.length - 1];
            return await applyMapToRoom(channel, chosenMap);
        }

        const playerList = userMapRequests.get(targetUser);

        if (!playerList || playerList.length === 0) {
            return await channel.sendMessage(`YUE: No map requests found from player "${args[0]}"!`);
        }

        let mapToPick = playerList[playerList.length - 1];

        if (!isNaN(indexParam) && indexParam >= 1 && indexParam <= playerList.length) {
            mapToPick = playerList[indexParam - 1];
        }

        return await applyMapToRoom(channel, mapToPick);
    }
}
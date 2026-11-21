import { getMatchDetails, getUserProfile, getBeatmapDetail, getUserRecentPlay } from './osuService.js';
import { askYue } from '../aiService.js';
import { botConfig } from '../../config/botConfig.js';
import { normalizeMods } from './dailyLeaderboardService.js';
import { sendAdminDebugLog } from '../../domains/shared/logger/adminDebugLogger.js';



// Lưu trữ dữ liệu trận đấu gần nhất cho mỗi phòng (RAM Cache nhẹ)
// Key: channelName ('#mp_123456') hoặc matchId ('123456')
const roomMatchMemory = new Map();
const MAX_MEMORY_ROOMS = 50; // Tối đa 50 phòng trong bộ nhớ (chiếm < 1MB RAM)

/**
 * Tính toán Star Rating thoải mái dựa trên PP hoặc Global Rank của người chơi
 */
function estimateComfortableSR(pp, globalRank) {
    if (pp && pp > 0) {
        // Công thức ước tính SR thoải mái dựa trên PP: pp=1000 -> ~3.0*, pp=3500 -> ~5.6*, pp=6000 -> ~6.8*
        const srFromPp = Math.sqrt(pp / 100) * 0.95;
        return Math.max(1.5, Math.min(9.5, srFromPp));
    }
    if (globalRank && globalRank > 0) {
        if (globalRank < 1000) return 7.5;
        if (globalRank < 5000) return 6.5;
        if (globalRank < 20000) return 5.8;
        if (globalRank < 50000) return 5.0;
        if (globalRank < 100000) return 4.3;
        if (globalRank < 250000) return 3.6;
        return 3.0;
    }
    return 4.5; // Mặc định 4.5* nếu không có thông tin
}

/**
 * Chuẩn hóa Game Mode sang định dạng ngắn cộng đồng osu! (std, taiko, catch, mania)
 */
export function normalizeGameMode(rawMode) {
    if (rawMode === undefined || rawMode === null) return 'std';
    if (typeof rawMode === 'number') {
        switch (rawMode) {
            case 1: return 'taiko';
            case 2: return 'catch';
            case 3: return 'mania';
            default: return 'std';
        }
    }
    const str = String(rawMode).toLowerCase().trim();
    if (str === '1' || str === 'taiko') return 'taiko';
    if (str === '2' || str === 'fruits' || str === 'catch' || str === 'ctb') return 'catch';
    if (str === '3' || str === 'mania') return 'mania';
    return 'std';
}

/**
 * 1. Ghi nhận và lưu thông tin trận đấu vừa hoàn thành từ osu! API
 */
export async function recordRoomMatch(matchId, channelName = null) {
    if (!matchId) return null;

    try {
        const rawMatch = await getMatchDetails(matchId);
        if (!rawMatch) return null;

        // Trích xuất trận đấu cuối cùng trong danh sách events / games
        let lastGame = null;
        if (rawMatch.events && Array.isArray(rawMatch.events)) {
            // Tìm event game mới nhất có dữ liệu scores thực tế (bỏ qua các event chat/host change/settings/other)
            for (let i = rawMatch.events.length - 1; i >= 0; i--) {
                const ev = rawMatch.events[i];
                if (ev.game && Array.isArray(ev.game.scores) && ev.game.scores.length > 0) {
                    lastGame = ev.game;
                    break;
                }
            }
            // Fallback: nếu chưa có game nào có scores, lấy game mới nhất có object game
            if (!lastGame) {
                for (let i = rawMatch.events.length - 1; i >= 0; i--) {
                    const ev = rawMatch.events[i];
                    if (ev.game) {
                        lastGame = ev.game;
                        break;
                    }
                }
            }
        }

        // Fallback v1 API structure
        if (!lastGame && rawMatch.games && Array.isArray(rawMatch.games)) {
            for (let i = rawMatch.games.length - 1; i >= 0; i--) {
                const g = rawMatch.games[i];
                if (Array.isArray(g.scores) && g.scores.length > 0) {
                    lastGame = g;
                    break;
                }
            }
            if (!lastGame && rawMatch.games.length > 0) {
                lastGame = rawMatch.games[rawMatch.games.length - 1];
            }
        }

        if (!lastGame) {
            console.log(`[MatchEvaluator] ℹ️ Không tìm thấy chi tiết game cho Match ID ${matchId}`);
            return null;
        }

        // Thông tin Beatmap (Đảm bảo có đầy đủ beatmapset, title và difficulty_rating)
        const beatmapId = lastGame.beatmap_id || lastGame.beatmap?.id;
        let beatmapInfo = lastGame.beatmap || null;
        if ((!beatmapInfo || !beatmapInfo.beatmapset || !beatmapInfo.difficulty_rating) && beatmapId) {
            const fullDetail = await getBeatmapDetail(beatmapId);
            if (fullDetail) beatmapInfo = fullDetail;
        }

        // Xác định Game Mode của trận đấu
        const rawGameMode = lastGame.mode ?? (lastGame.mode_int !== undefined ? lastGame.mode_int : null) ?? beatmapInfo?.mode ?? 'osu';
        const gameMode = normalizeGameMode(rawGameMode);

        // Xây dựng Bảng ánh xạ User ID -> Real Username từ API Match Data
        const userMap = new Map();
        if (rawMatch.users && Array.isArray(rawMatch.users)) {
            for (const u of rawMatch.users) {
                const uId = u.user_id || u.id;
                const uName = u.username;
                if (uId && uName) userMap.set(String(uId), uName);
            }
        }

        // Lấy danh sách điểm số (Scores) và Mod phòng / Mod player
        const rawScores = lastGame.scores || [];
        const gameMods = lastGame.mods !== undefined ? lastGame.mods : (lastGame.enabled_mods !== undefined ? lastGame.enabled_mods : (lastGame.enabledMods || []));
        const processedScores = [];

        for (const s of rawScores) {
            const userId = s.user_id || s.user?.id;
            const username = s.user?.username || userMap.get(String(userId)) || `User_${userId}`;
            const totalScore = parseInt(s.score || 0);

            // Xử lý Accuracy & Hit Statistics (tương thích cả osu! API v1, v2 và Lazer statistics)
            const c300 = parseInt(s.count300 ?? s.statistics?.count_300 ?? s.statistics?.great ?? 0) || 0;
            const c100 = parseInt(s.count100 ?? s.statistics?.count_100 ?? s.statistics?.ok ?? 0) || 0;
            const c50 = parseInt(s.count50 ?? s.statistics?.count_50 ?? s.statistics?.meh ?? 0) || 0;
            const cMiss = parseInt(s.countmiss ?? s.statistics?.count_miss ?? s.statistics?.miss ?? 0) || 0;
            const cKatu = parseInt(s.countkatu ?? s.statistics?.count_katu ?? s.statistics?.good ?? 0) || 0;
            const cGeki = parseInt(s.countgeki ?? s.statistics?.count_geki ?? s.statistics?.perfect ?? 0) || 0;
            let acc = 0;
            if (s.accuracy !== undefined && s.accuracy !== null) {
                acc = s.accuracy > 1 ? s.accuracy : s.accuracy * 100;
            } else {
                const totalHits = c300 + c100 + c50 + cMiss;
                if (totalHits > 0) {
                    acc = ((c300 * 300 + c100 * 100 + c50 * 50) / (totalHits * 300)) * 100;
                }
            }

            const misses = cMiss;
            const maxcombo = parseInt(s.maxcombo ?? s.max_combo ?? 0) || 0;

            // Xử lý Pass/Fail chuẩn cho cả API v1 (pass: "1"/"0") và API v2 (s.match.pass, passed: true/false, rank: "F")
            let isPassed = false;
            if (s.match?.pass !== undefined && s.match?.pass !== null) {
                isPassed = (s.match.pass === true || s.match.pass === 1 || s.match.pass === '1');
            } else if (s.passed !== undefined && s.passed !== null) {
                isPassed = (s.passed === true || s.passed === 1 || s.passed === '1');
            } else if (s.pass !== undefined && s.pass !== null) {
                isPassed = (s.pass === true || s.pass === 1 || s.pass === '1');
            } else if (s.rank !== undefined && s.rank !== null) {
                isPassed = (String(s.rank).toUpperCase() !== 'F');
            } else {
                isPassed = totalScore > 50000;
            }

            // Nếu s.rank là 'F', chắc chắn là Fail/Quit bất kể trường nào
            if (s.rank && String(s.rank).toUpperCase() === 'F') {
                isPassed = false;
            }

            const passed = isPassed;

            const scoreMods = s.mods !== undefined ? s.mods : (s.enabled_mods !== undefined ? s.enabled_mods : (s.enabledMods || []));
            const mergedMods = normalizeMods([gameMods, scoreMods]);
            const scoreMode = normalizeGameMode(s.mode ?? (s.mode_int !== undefined ? s.mode_int : null) ?? gameMode);

            processedScores.push({
                userId,
                username,
                score: totalScore,
                accuracy: parseFloat(acc.toFixed(2)),
                misses,
                maxcombo,
                passed,
                mods: mergedMods,
                mod: mergedMods.length > 0 ? mergedMods.join('') : 'NM',
                mode: scoreMode,
                scoreId: s.id || s.best_id || null,
                statistics: {
                    count_300: c300,
                    count_100: c100,
                    count_50: c50,
                    count_miss: cMiss,
                    count_katu: cKatu,
                    count_geki: cGeki
                },
                pp: s.pp ? parseFloat(s.pp) : null
            });
        }

        // Sắp xếp điểm giảm dần
        processedScores.sort((a, b) => b.score - a.score);

        // Gán thứ hạng trong phòng
        processedScores.forEach((s, idx) => {
            s.roomRank = idx + 1;
            s.roomTotal = processedScores.length;
        });

        const matchSummary = {
            matchId: String(matchId),
            channelName: channelName || `#mp_${matchId}`,
            timestamp: Date.now(),
            gameMode,
            mode: gameMode,
            beatmap: {
                id: beatmapId,
                title: beatmapInfo?.beatmapset?.title || beatmapInfo?.title || 'Unknown Title',
                artist: beatmapInfo?.beatmapset?.artist || beatmapInfo?.artist || 'Unknown Artist',
                version: beatmapInfo?.version || 'Normal',
                starRating: beatmapInfo?.difficulty_rating || beatmapInfo?.star_rating || beatmapInfo?.difficultyrating || 4.0,
                maxCombo: beatmapInfo?.max_combo || 0,
                mode: beatmapInfo?.mode || 'osu',
                status: beatmapInfo?.status || (beatmapInfo?.approved !== undefined ? String(beatmapInfo.approved) : 'unknown')
            },
            scores: processedScores
        };

        // Lưu vào RAM Cache
        roomMatchMemory.set(String(matchId), matchSummary);
        if (channelName) {
            roomMatchMemory.set(channelName.toLowerCase(), matchSummary);
        }

        // Giới hạn RAM
        if (roomMatchMemory.size > MAX_MEMORY_ROOMS * 2) {
            const firstKey = roomMatchMemory.keys().next().value;
            roomMatchMemory.delete(firstKey);
        }

        console.log(`[MatchEvaluator] 📊 Đã lưu thành công trận đấu Match ID ${matchId} (${processedScores.length} người chơi)`);
        return matchSummary;
    } catch (err) {
        console.error(`❌ Lỗi ghi nhận trận đấu Match ${matchId}:`, err.message);
        sendAdminDebugLog('ERROR', 'Lỗi ghi nhận trận đấu (recordRoomMatch)', err.message, { matchId, stack: err.stack });
        return null;
    }
}

/**
 * Lấy dữ liệu trận đấu gần nhất của phòng
 */
export function getLatestRoomMatch(matchIdOrChannel) {
    if (!matchIdOrChannel) return null;
    const key = String(matchIdOrChannel).toLowerCase();
    return roomMatchMemory.get(key) || null;
}

/**
 * 2. Phân tích phong độ của một người chơi trong trận đấu so với Profile Average
 */
export async function evaluatePlayerPerformance(matchSummary, username) {
    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) return null;

    const lowerUser = username.toLowerCase();
    const userScore = matchSummary.scores.find(s => s.username.toLowerCase() === lowerUser);

    if (!userScore) {
        return {
            foundInMatch: false,
            message: `I couldn't find a score from ${username} in the last match.`
        };
    }

    // Lấy thông tin Profile để so sánh với chỉ số trung bình (Avg Stats)
    const profile = await getUserProfile(username);
    const profileAcc = profile?.statistics?.hit_accuracy || 97.0;
    const pp = profile?.statistics?.pp || 0;
    const globalRank = profile?.statistics?.global_rank || null;

    const comfortableSR = estimateComfortableSR(pp, globalRank);
    const mapSR = matchSummary.beatmap.starRating;

    const accDelta = userScore.accuracy - profileAcc; // Ví dụ: +1.5% hoặc -4.2%
    const srRatio = mapSR / comfortableSR; // > 1.2 là map khó vượt cấp
    const comboRatio = matchSummary.beatmap.maxCombo > 0 ? (userScore.maxcombo / matchSummary.beatmap.maxCombo) : 0;

    // Phân loại phong độ (Performance Tiers)
    let tier = 'SOLID'; // Mặc định bình thường
    if (mapSR >= comfortableSR * 1.2 && userScore.passed && userScore.misses <= 10) {
        tier = 'EPIC_PASS'; // Pass map siêu khó vượt cấp
    } else if (userScore.misses === 0 && userScore.passed && accDelta >= -1.0) {
        tier = 'HIGH_ACC_FC'; // FC quá xịn
    } else if ((userScore.misses === 1 || userScore.misses === 2) && comboRatio > 0.6 && userScore.passed) {
        tier = 'CHOKE'; // Choke đáng tiếc
    } else if (mapSR >= comfortableSR * 1.35 && userScore.passed && userScore.misses > 10) {
        tier = 'SURVIVAL'; // Sống sót thần kỳ
    } else if (accDelta < -3.5 && userScore.misses >= 5 && mapSR <= comfortableSR * 1.1) {
        tier = 'OFF_DAY'; // Lụi tay / Tụt phong độ nhẹ
    } else if (userScore.roomRank === 1 && userScore.roomTotal > 1) {
        tier = 'MVP'; // Top 1 phòng
    }

    return {
        foundInMatch: true,
        username: userScore.username,
        tier,
        score: userScore,
        beatmap: matchSummary.beatmap,
        profile: {
            avgAcc: parseFloat(profileAcc.toFixed(2)),
            pp: Math.round(pp),
            globalRank,
            comfortableSR: parseFloat(comfortableSR.toFixed(2))
        },
        deltas: {
            accDelta: parseFloat(accDelta.toFixed(2)),
            srRatio: parseFloat(srRatio.toFixed(2)),
            comboRatio: parseFloat(comboRatio.toFixed(2))
        }
    };
}

/**
 * 3. Tạo câu trả lời đánh giá trận đấu (Smart Rule Engine + AI Fallback)
 */
export async function generateEvaluationResponse(evalData, lang = 'vi', useAI = true) {
    if (!evalData || !evalData.foundInMatch) {
        return evalData?.message || 'No data found for the last match.';
    }

    const isAiEnabled = botConfig?.osuMultiplayer?.aiMatchCommentary !== false;


    // 🎯 TH1: Dùng Gemini AI nếu được bật để câu từ mềm mại & tự nhiên nhất
    if (useAI && isAiEnabled) {
        try {
            const promptContext = `
You are Yue - a smart, witty, anime-style AI assistant in an osu! multiplayer room.
Evaluate the recent match performance for player "${evalData.username}" based STRICTLY on empirical data:
- Beatmap: ${evalData.beatmap.title} [${evalData.beatmap.version}] (${evalData.beatmap.starRating.toFixed(2)}★)
- Match Result: Acc ${evalData.score.accuracy}%, Combo ${evalData.score.maxcombo}x, Misses: ${evalData.score.misses}, Room Rank: #${evalData.score.roomRank}/${evalData.score.roomTotal}
- Player Baseline: Profile Avg Acc ${evalData.profile.avgAcc}%, PP: ${evalData.profile.pp}pp (Comfortable SR: ~${evalData.profile.comfortableSR}★)
- Deltas: Acc Delta ${evalData.deltas.accDelta >= 0 ? '+' : ''}${evalData.deltas.accDelta}% vs avg acc, Map SR ratio: ${evalData.deltas.srRatio}x comfortable SR.
- Performance Tier: ${evalData.tier}

⛔ CRITICAL FACTUALITY & HONESTY RULES:
1. ONLY talk about observable stats (score, acc, misses count, combo, profile avg acc, map SR).
2. NEVER guess or fabricate unobservable details! (e.g. DO NOT say "missed at the end note" or "choked on ending stream" because you CANNOT see replay timestamps).
3. If data is missing or uncertain, state so directly. Never pretend or give fake excuses.
4. Keep response concise, under 300 chars for IRC chat.
5. If lang is 'vi', respond in Vietnamese; otherwise respond in ENGLISH by default.
6. Always prefix with "YUE: ".
            `.trim();

            const aiRawJson = await Promise.race([
                askYue(`ingame_eval_${evalData.username}`, evalData.username, "Evaluate my match performance", null, false, {
                    matchContext: promptContext
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Eval Timeout (4s)')), 4000))
            ]);

            const aiParsed = JSON.parse(aiRawJson);
            if (aiParsed && aiParsed.reply && !/lagging|bị lag/i.test(aiParsed.reply)) {
                return aiParsed.reply.startsWith('YUE:') ? aiParsed.reply : `YUE: ${aiParsed.reply}`;
            }
        } catch (aiErr) {
            console.error('[MatchEvaluator AI Fallback]:', aiErr.message);
        }
    }

    // 🎯 TH2: Rule-Based Engine (0ms latency, 100% Truthful, 0 Hallucination)
    const { username, tier, score, beatmap, profile, deltas } = evalData;
    const accSign = deltas.accDelta >= 0 ? '+' : '';
    const accDiffText = `${accSign}${deltas.accDelta}%`;

    let text = '';

    if (lang === 'vi') {
        switch (tier) {
            case 'EPIC_PASS':
                text = `🔥 Ái chà ${username}! Pass map ${beatmap.starRating.toFixed(2)}★ (vượt mức vừa sức ~${profile.comfortableSR}★) với ${score.accuracy}% Acc (${score.misses}m)! Tay to quá nha! 👏`;
                break;
            case 'HIGH_ACC_FC':
                text = `✨ Màn thể hiện tuyệt vời! Full Combo 0 miss với Acc ${score.accuracy}% (${accDiffText} so với avg profile ${profile.avgAcc}%). ${score.roomRank === 1 ? 'TOP 1 phòng luôn!' : 'Rất mượt mà!'}`;
                break;
            case 'CHOKE':
                text = `💔 Tiếc quá ${username} ơi! Dính đúng ${score.misses} miss (Combo ${score.maxcombo}x). Acc ${score.accuracy}% (${accDiffText} vs avg ${profile.avgAcc}%). Cố gắng ở map sau nhé! 💪`;
                break;
            case 'SURVIVAL':
                text = `🛡️ Map ${beatmap.starRating.toFixed(2)}★ căng đét! Dù dính ${score.misses} miss nhưng ${username} vẫn sống sót hoàn thành bài. Nỗ lực rất tốt!`;
                break;
            case 'OFF_DAY':
                text = `💡 Trận này Acc của ${username} đạt ${score.accuracy}% (thấp hơn avg profile ${profile.avgAcc}%), ${score.misses}m. Uống miếng nước lấy lại nhịp nhé! ☕`;
                break;
            case 'MVP':
                text = `🏆 Chúc mừng ${username} đạt TOP 1 phòng! Score: ${score.score.toLocaleString('en-US')} | Acc: ${score.accuracy}% (${accDiffText} vs avg ${profile.avgAcc}%). Quá xuất sắc!`;
                break;
            default:
                text = `🎯 ${username} giữ phong độ ổn định! Acc: ${score.accuracy}% (${accDiffText} vs avg ${profile.avgAcc}%), Combo: ${score.maxcombo}x, Miss: ${score.misses}m.`;
                break;
        }
    } else {
        // English Default for IRC Multiplayer
        switch (tier) {
            case 'EPIC_PASS':
                text = `🔥 Great pass ${username}! Cleared a ${beatmap.starRating.toFixed(2)}★ map (well above your ~${profile.comfortableSR}★ comfortable rating) with ${score.accuracy}% Acc (${score.misses}m)! 👏`;
                break;
            case 'HIGH_ACC_FC':
                text = `✨ Excellent run! Full Combo (0 miss) with ${score.accuracy}% Acc (${accDiffText} vs profile avg ${profile.avgAcc}%). ${score.roomRank === 1 ? 'Took 1st place in room!' : 'Very clean!'}`;
                break;
            case 'CHOKE':
                text = `💔 So close ${username}! Got ${score.misses} miss(es) with ${score.maxcombo}x combo (${score.accuracy}% Acc vs profile avg ${profile.avgAcc}%). Solid effort! 💪`;
                break;
            case 'SURVIVAL':
                text = `🛡️ Tough ${beatmap.starRating.toFixed(2)}★ map! Survived with ${score.misses} miss(es). Good persistence!`;
                break;
            case 'OFF_DAY':
                text = `💡 Acc dropped slightly for ${username} this round (${score.accuracy}% vs profile avg ${profile.avgAcc}%, ${score.misses}m). Reset and hit the next map! ☕`;
                break;
            case 'MVP':
                text = `🏆 Congrats ${username} for taking 1st place! Score: ${score.score.toLocaleString('en-US')} | Acc: ${score.accuracy}% (${accDiffText} vs avg). Well played!`;
                break;
            default:
                text = `🎯 Solid performance by ${username}! Acc: ${score.accuracy}% (${accDiffText} vs avg ${profile.avgAcc}%), Combo: ${score.maxcombo}x, Misses: ${score.misses}m.`;
                break;
        }
    }

    return `YUE: ${text}`;
}

/**
 * Chuẩn hóa và làm sạch tên IRC Username (Xóa wiki: và ngoặc kép thừa)
 */
export function formatCleanUsername(username) {
    if (!username) return 'Player';
    return String(username).replace(/^wiki:/i, '').replace(/^\[|\]$/g, '').trim() || 'Player';
}

/**
 * 4. Xử lý Lệnh Đánh giá Trận đấu Trực tiếp cho Phòng IRC
 * @param {object} channel Channel Bancho IRC
 * @param {string} senderUsername Tên người gửi lệnh
 * @param {string} userPrompt Nội dung câu hỏi/lệnh của người dùng
 * @param {boolean} showScoreLine Có hiển thị dòng log điểm thô hay không (mặc định false - âm thầm kiểm tra rs/stat)
 */
export async function handleMatchEvaluationCommand(channel, senderUsername, userPrompt = '', showScoreLine = false) {
    const channelName = channel.name;
    const matchId = channelName.replace('#mp_', '');
    const cleanSender = formatCleanUsername(senderUsername);

    // In-game replies are always English
    const lang = 'en';

    // ⚡ STEP 1: Instant acknowledgement
    const ackMessages = [
        `YUE: Checking match results for ${cleanSender}... 📊`,
        `YUE: Hold on, reviewing stats for ${cleanSender}... 🧐`,
        `YUE: Let me check the latest score for ${cleanSender}... 🍳`
    ];
    const randomAck = ackMessages[Math.floor(Math.random() * ackMessages.length)];
    try {
        await channel.sendMessage(randomAck);
    } catch (ackErr) {
        console.error('[MatchEvaluator Ack Error]:', ackErr.message);
    }

    // Strip command prefixes (.yue, !yue, .match, .rs, etc.)
    const cleanPrompt = userPrompt.replace(/^[\.!](yue|match|danhgia|review|rs|r)\s*/i, '').trim();

    // 🔍 STEP 2: Find match data (RAM -> osu! API match)
    let matchSummary = getLatestRoomMatch(matchId) || getLatestRoomMatch(channelName);
    if (!matchSummary) {
        matchSummary = await recordRoomMatch(matchId, channelName);
    }

    // 🎯 Resolve target player. Default = sender. Only switch when the prompt names
    // a real player in the match/room, or is an explicit "<cmd> <name>" form.
    let targetPlayer = cleanSender;
    const roomPlayerNames = new Set((matchSummary?.scores || []).map(sc => formatCleanUsername(sc.username).toLowerCase()));
    try {
        for (const sl of (channel.lobby?.slots || [])) {
            if (sl && sl.user?.username) roomPlayerNames.add(formatCleanUsername(sl.user.username).toLowerCase());
        }
    } catch { /* ignore */ }

    const selfWords = new Set(['tôi', 'toi', 'tui', 'mình', 'minh', 'me', 'my', 'i', 'mine']);
    const tokens = cleanPrompt.split(/ +/).map(p => p.trim()).filter(Boolean);
    const hasSelfRef = tokens.some(p => selfWords.has(p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
    const mentioned = tokens
        .map(p => formatCleanUsername(p.replace(/^@/, '').replace(/[.,!?;:]+$/, '')))
        .find(p => p.length >= 2 && roomPlayerNames.has(p.toLowerCase()));

    if (mentioned && !hasSelfRef) {
        targetPlayer = mentioned;
    } else if (!hasSelfRef && /^[\.!](rs|r|match|danhgia|review)\b/i.test(userPrompt.trim()) && tokens.length === 1 && /^[\w\[\]\-]{2,15}$/.test(tokens[0])) {
        // Explicit ".rs <username>" form (player may not be in the room)
        targetPlayer = formatCleanUsername(tokens[0]);
    }

    const hasTargetInMatch = matchSummary?.scores?.some(s => formatCleanUsername(s.username).toLowerCase() === targetPlayer.toLowerCase());

    // Nếu chưa có điểm trong phòng, Thử lấy Recent Play cá nhân từ osu! API v2
    if (!matchSummary || !hasTargetInMatch) {
        try {
            const rp = await getUserRecentPlay(targetPlayer);
            if (rp && rp.score) {
                const rpScore = rp.score;
                const bm = rpScore.beatmap;
                const bmSet = rpScore.beatmapset;

                let accVal = 0;
                if (rpScore.accuracy !== undefined) {
                    accVal = rpScore.accuracy > 1 ? rpScore.accuracy : rpScore.accuracy * 100;
                }

                const misses = rpScore.statistics?.count_miss ?? rpScore.statistics?.miss ?? 0;
                const passed = rpScore.passed !== false && misses < 40;

                matchSummary = {
                    matchId: 'recent',
                    channelName,
                    timestamp: Date.now(),
                    beatmap: {
                        id: bm?.id,
                        title: bmSet?.title || bm?.title || 'Unknown Title',
                        artist: bmSet?.artist || bm?.artist || 'Unknown Artist',
                        version: bm?.version || 'Normal',
                        starRating: bm?.difficulty_rating || bm?.star_rating || 4.0,
                        maxCombo: bm?.max_combo || 0
                    },
                    scores: [{
                        userId: rp.user?.id,
                        username: rp.user?.username || targetPlayer,
                        score: parseInt(rpScore.score || 0),
                        accuracy: parseFloat(accVal.toFixed(2)),
                        misses,
                        maxcombo: parseInt(rpScore.max_combo || 0),
                        passed,
                        mods: rpScore.mods || [],
                        roomRank: 1,
                        roomTotal: 1
                    }]
                };
            }
        } catch (rpErr) {
            console.error('[MatchEvaluator RecentPlay Fallback Error]:', rpErr.message);
        }
    }

    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) {
        return await channel.sendMessage(`YUE: I couldn't find any recent score for ${targetPlayer}. Finish a map and ask me again!`);
    }

    // 📊 BƯỚC 3: Trả về dòng điểm số chuẩn (Chỉ gửi nếu showScoreLine được bật)
    if (showScoreLine) {
        const userScore = matchSummary.scores.find(s => formatCleanUsername(s.username).toLowerCase() === targetPlayer.toLowerCase()) || matchSummary.scores[0];
        const displayUsername = formatCleanUsername(userScore.username);
        const userId = userScore.userId;

        const userProfileLink = userId
            ? `[https://osu.ppy.sh/u/${userId} ${displayUsername}]`
            : `[https://osu.ppy.sh/u/${encodeURIComponent(displayUsername)} ${displayUsername}]`;

        const bm = matchSummary.beatmap;
        const rankStr = userScore.passed ? 'PASS' : 'FAIL';
        const scoreFormatted = userScore.score > 0 ? userScore.score.toLocaleString('en-US') : 'N/A';
        const comboStr = bm.maxCombo > 0 ? `${userScore.maxcombo}x/${bm.maxCombo}x` : `${userScore.maxcombo}x`;

        const scoreLine = `YUE: ${userProfileLink} | ${bm.title} [${bm.version}] (${bm.starRating.toFixed(2)}★) | Rank ${rankStr} > ${scoreFormatted} | Acc: ${userScore.accuracy}% | Combo: ${comboStr} | Hits: [${userScore.misses}m]`;

        await channel.sendMessage(scoreLine);
    }

    // 🧠 BƯỚC 4: Phân tích & Trả về lời đánh giá thông minh từ Yue
    const evalData = await evaluatePlayerPerformance(matchSummary, targetPlayer);
    const evalReply = await generateEvaluationResponse(evalData, lang, true);

    return await channel.sendMessage(evalReply);
}

/**
 * 5. Tự động sinh câu bình luận MVP & Choke cho toàn bộ trận đấu vừa kết thúc
 */
export async function generateMatchSummaryCommentary(matchSummary) {
    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) return null;

    const validScores = matchSummary.scores.filter(s => {
        const u = (s.username || '').toLowerCase();
        return u && !u.includes('banchobot') && !u.includes('yue');
    });

    if (validScores.length === 0) return null;

    const mvp = validScores[0];
    const mvpName = formatCleanUsername(mvp.username);
    const mvpScore = mvp.score || 0;
    const mvpAcc = mvp.accuracy || 0;
    const mvpMisses = mvp.misses || 0;

    // Tìm Choke Player (Acc >= 92%, miss 1-5 hoặc maxcombo tốt nhưng miss)
    const chokePlayer = validScores.find(s => {
        const u = formatCleanUsername(s.username).toLowerCase();
        if (u === mvpName.toLowerCase()) return false;
        return s.misses > 0 && s.misses <= 5 && s.accuracy >= 92.0;
    });

    const totalAcc = validScores.reduce((sum, s) => sum + (s.accuracy || 0), 0);
    const avgAcc = (totalAcc / validScores.length).toFixed(2);

    const isAiEnabled = botConfig?.osuMultiplayer?.aiMatchCommentary !== false;

    if (isAiEnabled) {
        try {
            const promptContext = `
You are Yue - an expressive, witty, hype anime-style AI referee in an osu! multiplayer room.
Generate 1 short, creative, and unique English IRC commentary sentence (< 180 chars) for this finished match:
- Beatmap: ${matchSummary.beatmap?.title || 'Map'} [${matchSummary.beatmap?.version || 'Normal'}] (${(matchSummary.beatmap?.starRating || 0).toFixed(2)}★)
- MVP: ${mvpName} (Score: ${mvpScore.toLocaleString('en-US')}, Acc: ${mvpAcc}%, Misses: ${mvpMisses})
- Choke Player: ${chokePlayer ? `${formatCleanUsername(chokePlayer.username)} (${chokePlayer.accuracy}%, ${chokePlayer.misses}m)` : 'None'}
- Room Avg Acc: ${avgAcc}%

Rules:
1. ONLY talk about real match stats provided above. Be energetic, witty, playful, or hype!
2. Vary your phrasing every match - NEVER repeat identical templates!
3. MUST prefix response with "YUE: ".
4. Keep it under 180 characters.
            `.trim();

            const aiRawJson = await Promise.race([
                askYue(`ingame_summary_${matchSummary.matchId}`, "MatchReferee", "Summarize match MVP and choke", null, false, {
                    matchContext: promptContext
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Summary Timeout (3.5s)')), 3500))
            ]);

            const aiParsed = JSON.parse(aiRawJson);
            if (aiParsed && aiParsed.reply && !/lagging|bị lag/i.test(aiParsed.reply)) {
                return aiParsed.reply.startsWith('YUE:') ? aiParsed.reply : `YUE: ${aiParsed.reply}`;
            }
        } catch (aiErr) {
            console.error('[MatchSummary AI Fallback Error]:', aiErr.message);
        }
    }

    // Rule-Based Fallback (0 tokens)
    const chokeName = chokePlayer ? formatCleanUsername(chokePlayer.username) : null;
    if (validScores.length === 1) {
        return `YUE: 🏆 Match Finished! MVP: ${mvpName} with ${mvpScore.toLocaleString('en-US')} pts (${mvpAcc}% Acc, ${mvpMisses}m). GG!`;
    }
    if (chokeName) {
        return `YUE: 🏆 Match Finished! MVP: ${mvpName} (${mvpAcc}%, ${mvpScore.toLocaleString('en-US')} pts). 💔 Unlucky choke by ${chokeName} (${chokePlayer.misses}m)! Room Avg: ${avgAcc}%. GG!`;
    }
    return `YUE: 🏆 Match Finished! MVP: ${mvpName} (${mvpAcc}%, ${mvpScore.toLocaleString('en-US')} pts). Room Avg Acc: ${avgAcc}%. Well played everyone!`;
}




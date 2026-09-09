import { getMatchDetails, getUserProfile, getBeatmapDetail, getUserRecentPlay } from './osuService.js';
import { askYue } from '../aiService.js';
import { botConfig } from '../../config/botConfig.js';



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
            // Lọc các event loại 'game'
            const gameEvents = rawMatch.events.filter(e => e.detail && e.detail.type === 'other' || e.game);
            if (gameEvents.length > 0) {
                const latestEvent = gameEvents[gameEvents.length - 1];
                lastGame = latestEvent.game || latestEvent;
            }
        }
        
        // Fallback v1 API structure
        if (!lastGame && rawMatch.games && Array.isArray(rawMatch.games)) {
            lastGame = rawMatch.games[rawMatch.games.length - 1];
        }

        if (!lastGame) {
            console.log(`[MatchEvaluator] ℹ️ Không tìm thấy chi tiết game cho Match ID ${matchId}`);
            return null;
        }

        // Thông tin Beatmap
        const beatmapId = lastGame.beatmap_id || lastGame.beatmap?.id;
        let beatmapInfo = lastGame.beatmap || null;
        if (!beatmapInfo && beatmapId) {
            beatmapInfo = await getBeatmapDetail(beatmapId);
        }

        // Lấy danh sách điểm số (Scores)
        const rawScores = lastGame.scores || [];
        const processedScores = [];

        for (const s of rawScores) {
            const userId = s.user_id || s.user?.id;
            const username = s.user?.username || `User_${userId}`;
            const totalScore = parseInt(s.score || 0);
            
            // Xử lý Accuracy
            let acc = 0;
            if (s.accuracy !== undefined && s.accuracy !== null) {
                acc = s.accuracy > 1 ? s.accuracy : s.accuracy * 100;
            } else {
                const c300 = parseInt(s.count300 || s.statistics?.count_300 || 0);
                const c100 = parseInt(s.count100 || s.statistics?.count_100 || 0);
                const c50 = parseInt(s.count50 || s.statistics?.count_50 || 0);
                const cMiss = parseInt(s.countmiss || s.statistics?.count_miss || 0);
                const totalHits = c300 + c100 + c50 + cMiss;
                if (totalHits > 0) {
                    acc = ((c300 * 300 + c100 * 100 + c50 * 50) / (totalHits * 300)) * 100;
                }
            }

            const misses = parseInt(s.countmiss ?? s.statistics?.count_miss ?? 0);
            const maxcombo = parseInt(s.maxcombo ?? s.max_combo ?? 0);
            const passed = s.passed !== undefined ? (s.passed === true || s.passed === 1 || s.passed === '1') : (misses < 50);

            processedScores.push({
                userId,
                username,
                score: totalScore,
                accuracy: parseFloat(acc.toFixed(2)),
                misses,
                maxcombo,
                passed,
                mods: s.mods || []
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
            beatmap: {
                id: beatmapId,
                title: beatmapInfo?.beatmapset?.title || beatmapInfo?.title || 'Unknown Title',
                artist: beatmapInfo?.beatmapset?.artist || beatmapInfo?.artist || 'Unknown Artist',
                version: beatmapInfo?.version || 'Normal',
                starRating: beatmapInfo?.star_rating || beatmapInfo?.difficultyrating || 4.0,
                maxCombo: beatmapInfo?.max_combo || 0
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
            message: `Không tìm thấy điểm số của ${username} trong trận vừa rồi.`
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
        return evalData?.message || 'Không tìm thấy dữ liệu trận đấu vừa rồi.';
    }

    const isAiEnabled = botConfig?.discord?.aiChat ?? true;


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

            const aiRawJson = await askYue(`ingame_eval_${evalData.username}`, evalData.username, "Evaluate my match performance", null, false, {
                matchContext: promptContext
            });

            const aiParsed = JSON.parse(aiRawJson);
            if (aiParsed && aiParsed.reply) {
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

    // Check if user prompt is in Vietnamese
    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(userPrompt);
    const lang = hasVietnamese ? 'vi' : 'en';

    // ⚡ BƯỚC 1: Phản hồi tức thì (0ms latency) - Chờ xíu kiểm tra phát
    const ackMessages = lang === 'vi' ? [
        `YUE: Chờ tôi xíu để tôi kiểm tra phát... 📊`,
        `YUE: Chờ tui xíu để tui kiểm tra phát nha! 📊`,
        `YUE: Đợi tí tui check kết quả trận vừa rồi của ${cleanSender} nè... 🧐`,
        `YUE: Ê từ từ để tui xem điểm số trận vừa rồi của ${cleanSender} nhé! 🍳`
    ] : [
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

    // Xác định người chơi cần đánh giá (Mặc định là người gửi lệnh, trừ khi chỉ định tên username cụ thể)
    let targetPlayer = cleanSender;

    const conversationalWords = new Set([
        'thấy', 'thay', 'sao', 'thế', 'the', 'nào', 'nao', 'vừa', 'vua', 'rồi', 'roi', 'trận', 'tran',
        'điểm', 'diem', 'số', 'so', 'tui', 'tôi', 'toi', 'mình', 'minh', 'của', 'cua', 'không', 'khong',
        'ý', 'y', 'là', 'la', 'xem', 'soi', 'cook', 'đánh', 'danh', 'chơi', 'choi', 'phong', 'độ', 'do',
        'review', 'thể', 'the', 'hiện', 'hien', 'kết', 'ket', 'quả', 'qua', 'cho', 'với', 'voi', 'bạn', 'ban',
        'gì', 'gi', 'kìa', 'kia', 'yue', 'nhé', 'nha', 'thì', 'thi', 'vẫn', 'van', 'đó', 'do', 'được', 'duoc',
        'đấy', 'day', 'này', 'nay', 'map', 'bài', 'bai', 'rs', 'r', 'match', 'danhgia'
    ]);

    const promptParts = cleanPrompt.split(/ +/);
    for (const part of promptParts) {
        const rawLower = part.toLowerCase().trim();
        const cleanLower = rawLower.replace(/[^\p{L}\p{N}_\[\]\-]/gu, '');
        if (cleanLower && !conversationalWords.has(rawLower) && !conversationalWords.has(cleanLower) && !cleanLower.startsWith('.') && !cleanLower.startsWith('!') && cleanLower.length >= 2) {
            targetPlayer = formatCleanUsername(part.trim());
            break;
        }
    }

    if (!targetPlayer || targetPlayer.startsWith('.') || targetPlayer.startsWith('!')) {
        targetPlayer = cleanSender;
    }

    // 🔍 BƯỚC 2: Tìm dữ liệu trận đấu (Ưu tiên Match Room RAM -> osu! API Match -> Fallback Recent Play)
    let matchSummary = getLatestRoomMatch(matchId) || getLatestRoomMatch(channelName);

    if (!matchSummary) {
        matchSummary = await recordRoomMatch(matchId, channelName);
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
        return await channel.sendMessage(`YUE: Tui chưa tìm thấy dữ liệu điểm số mới nhất của ${targetPlayer}. Hãy hoàn thành 1 map để Yue đánh giá nhé!`);
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



import fs from 'fs';
import path from 'path';
import { calculateBeatmapPP, getUserBeatmapPlays, getRecentScoresOnBeatmap, toOsuApiRuleset } from './osuService.js';
import { normalizeGameMode } from './matchEvaluatorService.js';
import { botConfig } from '../../config/botConfig.js';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';
import { sendAdminDebugLog } from '../../domains/shared/logger/adminDebugLogger.js';
import { findUserByAnyNameOrId } from './userService.js';

const LEADERBOARD_FILE = path.resolve('data/multi247DailyLeaderboard.json');
const HISTORY_DIR = path.resolve('data/history');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 🕒 Helper: Lấy thông tin ngày giờ hiện tại theo đúng Múi giờ Việt Nam (Asia/Ho_Chi_Minh - GMT+7)
 */
export function getVNTimeInfo(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
    }
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const timeStr = `${map.hour}:${map.minute}:${map.second}`;
    const fullStr = `${dateStr} ${timeStr} (UTC+7 / Asia/Ho_Chi_Minh)`;
    const hour = parseInt(map.hour, 10);
    const minute = parseInt(map.minute, 10);
    return { dateStr, timeStr, fullStr, hour, minute, year: map.year, month: map.month, day: map.day };
}

function getTodayDateString() {
    return getVNTimeInfo().dateStr;
}

/**
 * 🕒 Helper: Lấy chuỗi ngày hôm qua (YYYY-MM-DD) theo đúng Múi giờ Việt Nam
 */
export function getYesterdayDateString(refDate = new Date()) {
    const vn = getVNTimeInfo(refDate);
    const [y, m, d] = vn.dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
    const prevY = dateObj.getUTCFullYear();
    const prevM = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const prevD = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${prevY}-${prevM}-${prevD}`;
}

/**
 * 🕒 Helper: Lấy chuỗi tháng trước (YYYY-MM) theo đúng Múi giờ Việt Nam
 */
export function getPreviousMonthString(refDate = new Date()) {
    const vn = getVNTimeInfo(refDate);
    const [y, m] = vn.dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    const prevY = d.getUTCFullYear();
    const prevM = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${prevY}-${prevM}`;
}

function ensureStorageFile() {
    safeReadJSON(LEADERBOARD_FILE, { records: [] });
}

const MOD_BITMASKS = [
    { bit: 1 << 0, code: 'NF' },
    { bit: 1 << 1, code: 'EZ' },
    { bit: 1 << 3, code: 'HD' },
    { bit: 1 << 4, code: 'HR' },
    { bit: 1 << 5, code: 'SD' },
    { bit: 1 << 6, code: 'DT' },
    { bit: 1 << 8, code: 'HT' },
    { bit: 1 << 9, code: 'NC' },
    { bit: 1 << 10, code: 'FL' },
    { bit: 1 << 12, code: 'SO' },
    { bit: 1 << 14, code: 'PF' }
];

export function normalizeMods(rawMods) {
    if (rawMods === undefined || rawMods === null) return [];
    
    // Nếu là bitmask number (ví dụ: 64 cho DT, 72 cho HDDT, 16 cho HR)
    if (typeof rawMods === 'number' || (typeof rawMods === 'string' && /^\d+$/.test(rawMods))) {
        const num = Number(rawMods);
        if (num === 0) return [];
        const result = [];
        const isNC = (num & (1 << 9)) !== 0;
        for (const m of MOD_BITMASKS) {
            if ((num & m.bit) !== 0) {
                if (m.code === 'DT' && isNC) continue;
                result.push(m.code);
            }
        }
        return result;
    }

    // Nếu là mảng (ví dụ: ['HD', 'DT'] hoặc [{ acronym: 'HD' }] hoặc [[ 'DT' ], ['HD']])
    if (Array.isArray(rawMods)) {
        const flattened = rawMods.flatMap(m => {
            if (typeof m === 'string') return [m];
            if (typeof m === 'number') return normalizeMods(m);
            if (Array.isArray(m)) return normalizeMods(m);
            if (typeof m === 'object' && m !== null) {
                const code = m.acronym || m.mod || m.acronym_code;
                return code ? [String(code)] : [];
            }
            return [];
        }).filter(Boolean);
        return Array.from(new Set(flattened));
    }

    // Nếu là chuỗi "HDDT" hoặc "+HDDT"
    if (typeof rawMods === 'string') {
        const clean = rawMods.trim().replace(/^\+/, '');
        if (clean.toUpperCase() === 'NM' || clean === '') return [];
        const matched = clean.match(/.{1,2}/g);
        return matched || [clean];
    }

    return [];
}

function loadLeaderboardData() {
    try {
        let data = safeReadJSON(LEADERBOARD_FILE, { records: [] });
        const now = Date.now();

        // 🔄 CHUYỂN ĐỔI DATA CŨ (Nếu có schema date/players) SANG DẠNG RECORDS LỊCH SỬ
        if (data.players && !data.records) {
            const records = [];
            const oldDate = data.date || getTodayDateString();
            for (const [lowerName, p] of Object.entries(data.players)) {
                const normMods = normalizeMods(p.mods || p.mod);
                const starVal = p.starRating ?? p.star ?? 0.0;
                records.push({
                    username: p.username || lowerName,
                    lowerName: lowerName,
                    userId: p.userId || null,
                    pp: p.peakPp || 0,
                    mapTitle: p.mapTitle || '',
                    starRating: parseFloat(Number(starVal).toFixed(2)),
                    star: parseFloat(Number(starVal).toFixed(2)),
                    mods: normMods,
                    mod: normMods.length > 0 ? normMods.join('') : 'NM',
                    timestamp: p.updatedAt || now,
                    date: oldDate
                });
            }
            data = { records };
        }

        if (!Array.isArray(data.records)) {
            data.records = [];
        }

        // Chuẩn hóa và làm sạch bản ghi
        let needsSave = false;

        for (const r of data.records) {
            r.mods = normalizeMods(r.mods || r.mod);
            r.mod = r.mods.length > 0 ? r.mods.join('') : 'NM';
            r.mode = normalizeGameMode(r.mode || 'std');
            const starVal = r.starRating ?? r.star ?? 0.0;
            const parsedStar = parseFloat(Number(starVal).toFixed(2));
            r.starRating = parsedStar;
            r.star = parsedStar;

            // 🛡️ Tự động sửa bản ghi bị bug điểm ảo do công thức fallback cũ (ví dụ 1000pp trên map 5.95★)
            if (r.pp > 500 && r.starRating < 6.5 && (!r.mods || r.mods.length === 0 || (r.mods.length === 1 && r.mods[0] === 'NM'))) {
                const maxRealistic = Math.round(Math.pow(r.starRating, 2.5) * 8);
                if (r.pp > maxRealistic) {
                    console.log(`[Leaderboard Service] 🛡️ Tự động sửa bản ghi bị bug điểm ảo của ${r.username}: ${r.pp}pp ➔ ${maxRealistic}pp`);
                    r.pp = maxRealistic;
                    needsSave = true;
                }
            }

            // 🕒 Chuẩn hóa trường date luôn theo định dạng YYYY-MM-DD (Giờ Việt Nam)
            if (r.timestamp) {
                const normDate = getVNTimeInfo(new Date(r.timestamp)).dateStr;
                if (r.date !== normDate) {
                    r.date = normDate;
                    needsSave = true;
                }
            } else if (r.date && r.date.includes('/')) {
                const parts = r.date.split('/');
                if (parts.length === 3) {
                    const m = parts[0].padStart(2, '0');
                    const d = parts[1].padStart(2, '0');
                    const y = parts[2];
                    r.date = `${y}-${m}-${d}`;
                    needsSave = true;
                }
            }
        }

        // 🧹 TỰ ĐỘNG LỌC VÀ DỌN DẸP DỮ LIỆU CŨ HƠN 30 NGÀY
        const initialLength = data.records.length;
        data.records = data.records.filter(r => r && r.timestamp && (now - r.timestamp <= THIRTY_DAYS_MS));

        if (data.records.length !== initialLength || needsSave) {
            if (data.records.length !== initialLength) {
                console.log(`[Leaderboard Service] 🧹 Đã tự động dọn dẹp ${initialLength - data.records.length} bản ghi cũ hơn 30 ngày.`);
            }
            saveLeaderboardData(data);
        }

        return data;
    } catch (err) {
        console.error('❌ Lỗi đọc file multi247DailyLeaderboard.json:', err.message);
        sendAdminDebugLog('ERROR', 'Lỗi đọc dữ liệu Leaderboard', err.message, { stack: err.stack });
        return { records: [] };
    }
}

function saveLeaderboardData(data) {
    return safeWriteJSON(LEADERBOARD_FILE, data);
}

/**
 * Chuẩn hóa tên Username để tạo link IRC rút gọn
 */
function formatCleanUsername(username) {
    if (!username) return 'Player';
    return String(username).replace(/^wiki:/i, '').trim() || 'Player';
}

/**
 * ✅ XÁC MINH PP của ĐÚNG lượt chơi vừa xong bằng dữ liệu giống lệnh .r / .rs (osu! API recent scores).
 * 1) Nếu score có pp chính thức -> dùng luôn (sai số 0%).
 * 2) Nếu map chưa có pp chính thức (unranked/loved) -> tính bằng rosu-pp (lazer: false) với bộ hit/combo/mods THẬT từ .rs.
 * 3) Không tìm thấy score -> trả null (KHÔNG nạp vào data).
 */
async function verifyPlayPP(beatmapId, scoreObj, mode, playerName = '') {
    const WINDOW_MS = 20 * 60 * 1000;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const recents = await getRecentScoresOnBeatmap(scoreObj.userId, beatmapId, mode);
            const cutoff = Date.now() - WINDOW_MS;
            const fresh = recents.filter(r => new Date(r.ended_at || r.created_at).getTime() >= cutoff);
            if (fresh.length > 0) {
                const sameScore = scoreObj.score
                    ? fresh.find(r => Number(r.total_score ?? r.score) === Number(scoreObj.score))
                    : null;
                const chosen = sameScore || fresh[0];
                const recalcMods = normalizeMods(chosen.mods ?? scoreObj.mods);
                const scoreRuleset = toOsuApiRuleset(chosen.mode || mode || 'osu');
                const scoreId = chosen.id || null;
                const scoreUrl = scoreId ? `https://osu.ppy.sh/scores/${scoreRuleset}/${scoreId}` : null;

                if (typeof chosen.pp === 'number' && chosen.pp > 0) {
                    return {
                        pp: Math.round(chosen.pp),
                        source: 'official (.rs)',
                        mods: recalcMods,
                        scoreId,
                        scoreUrl
                    };
                }

                const st = chosen.statistics || {};
                const n300 = st.count_300 ?? st.great ?? 0;
                const n100 = st.count_100 ?? st.ok ?? 0;
                const n50 = st.count_50 ?? st.meh ?? 0;
                const nMiss = st.count_miss ?? st.miss ?? 0;
                const nKatu = st.count_katu ?? st.good ?? 0;
                const nGeki = st.count_geki ?? st.perfect ?? 0;
                const hasHits = (n300 + n100 + n50 + nMiss) > 0;
                const acc = chosen.accuracy !== undefined ? (chosen.accuracy > 1 ? chosen.accuracy : chosen.accuracy * 100) : scoreObj.accuracy;
                const ppRes = await calculateBeatmapPP(beatmapId, {
                    accuracy: acc,
                    misses: nMiss,
                    combo: chosen.max_combo ?? scoreObj.maxcombo,
                    ...(hasHits ? { n300, n100, n50, nKatu, nGeki } : {}),
                    mods: recalcMods,
                    mode
                });
                if (ppRes?.pp > 0) {
                    const starsVal = ppRes.difficulty?.stars ?? ppRes.stars;
                    return {
                        pp: Math.round(ppRes.pp),
                        source: 'recalc (.rs stats)',
                        mods: recalcMods,
                        stars: (typeof starsVal === 'number' && !isNaN(starsVal) && starsVal > 0) ? starsVal : null,
                        scoreId,
                        scoreUrl
                    };
                }
            }
        } catch { /* retry */ }
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
    }
    console.warn(`[Leaderboard Verify] ⚠️ Không xác minh được play của ${playerName || scoreObj.userId} trên map ${beatmapId}.`);
    return null;
}

/**
 * 🏆 1. Ghi nhận Peak PP của tất cả người chơi trong trận đấu vừa hoàn thành
 * Cơ chế 3 bước:
 *   Bước 1: Tính PP cục bộ bằng rosu-pp (lazer: false) với đầy đủ 300/100/50/miss + combo + mods cá nhân (sai số <= 3%).
 *   Bước 2: Lọc ra người có PP cao nhất trận (và có khả năng phá Peak PP ngày với biên độ dung sai 3%).
 *   Bước 3: Âm thầm kiểm tra lại bằng nguồn dữ liệu của lệnh .rs/.r rồi mới lưu vào bảng xếp hạng.
 * @param {object} matchSummary Dữ liệu kết quả trận đấu từ recordRoomMatch
 */
export async function recordMatchDailyPeakPP(matchSummary) {
    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) return null;

    const data = loadLeaderboardData();
    const beatmapId = matchSummary.beatmap?.id;
    const baseStarRating = matchSummary.beatmap?.starRating || 4.0;
    const beatmapTitle = matchSummary.beatmap?.title || 'Unknown Map';
    const matchMode = normalizeGameMode(matchSummary.gameMode || matchSummary.mode || matchSummary.beatmap?.mode || 'std');
    const today = getTodayDateString();
    const now = Date.now();

    // Sai số tối đa cho phép của PP lọc cục bộ so với PP thực tế (3%)
    const LOCAL_TOLERANCE = 0.03;
    const FILTER_MARGIN = 1 - LOCAL_TOLERANCE; // 0.97 (Giữ biên độ 3% để không bỏ sót ứng viên sát nút)

    // ==============================================================
    // BƯỚC 1: Tính PP CỤC BỘ chuẩn xác cho từng người chơi (0 tốn API osu!)
    // ==============================================================
    const evaluatedPlayers = [];

    for (const scoreObj of matchSummary.scores) {
        const cleanName = formatCleanUsername(scoreObj.username);
        const lowerName = cleanName.toLowerCase();

        // Loại bỏ bot
        if (!cleanName || lowerName.includes('banchobot') || lowerName.includes('yue')) continue;

        // 🛡️ CHỐNG EXPLOIT: Bỏ qua hoàn toàn nếu người chơi FAIL/QUIT (!passed) hoặc thoát quá sớm (Combo < 20, Score < 50,000)
        if (!scoreObj.passed || scoreObj.passed === 0 || scoreObj.passed === '0' || (scoreObj.score || 0) < 50000 || (scoreObj.maxcombo || 0) < 20) {
            console.log(`[Leaderboard Filter] 🛡️ Bỏ qua play FAILED/QUIT của ${cleanName} (Passed: ${scoreObj.passed}, Score: ${scoreObj.score}, Combo: ${scoreObj.maxcombo})`);
            continue;
        }

        const modsArray = normalizeMods(scoreObj.mods);
        const scoreMode = normalizeGameMode(scoreObj.mode || matchMode);
        const st = scoreObj.statistics || {};
        const hasHitStats = ((st.count_300 || 0) + (st.count_100 || 0) + (st.count_50 || 0) + (scoreObj.misses || 0)) > 0;

        let localPp = 0;
        let localStars = baseStarRating;

        if (beatmapId) {
            try {
                const ppRes = await calculateBeatmapPP(beatmapId, {
                    accuracy: scoreObj.accuracy,
                    misses: scoreObj.misses,
                    combo: scoreObj.maxcombo,
                    ...(hasHitStats ? {
                        n300: st.count_300,
                        n100: st.count_100,
                        n50: st.count_50,
                        nKatu: st.count_katu,
                        nGeki: st.count_geki
                    } : {}),
                    mods: modsArray,
                    mode: scoreMode
                });
                if (ppRes) {
                    if (ppRes.pp) {
                        localPp = Math.round(ppRes.pp);
                    }
                    const starsVal = ppRes.difficulty?.stars ?? ppRes.stars;
                    if (typeof starsVal === 'number' && !isNaN(starsVal) && starsVal > 0) {
                        localStars = starsVal;
                    }
                }
            } catch (ppErr) {
                console.error(`[Leaderboard] PP calc fallback for ${cleanName}:`, ppErr.message);
            }
        }

        // Fallback ước tính nếu không tải được file .osu (chỉ dùng để xếp hạng lọc, bắt buộc qua .rs mới được lưu)
        if (!localPp || localPp <= 0) {
            const mapMaxCombo = matchSummary.beatmap?.maxCombo || 0;
            const comboRatio = mapMaxCombo > 0 ? Math.min(1, (scoreObj.maxcombo || 0) / mapMaxCombo) : 0.5;
            const accFactor = Math.pow(Math.max(0, scoreObj.accuracy || 0) / 100, 3);
            const baseEstimate = Math.pow(localStars * 5, 2.1) / 25;
            localPp = Math.max(1, Math.round(baseEstimate * accFactor * Math.pow(comboRatio, 0.8)));

            const maxStarCap = Math.round(Math.pow(localStars, 2.5) * 8);
            localPp = Math.min(localPp, maxStarCap);
        }

        const existingRecordIndex = data.records.findIndex(r => {
            if (r.date !== today) return false;
            if (scoreObj.userId && r.userId === scoreObj.userId) return true;
            return r.lowerName === lowerName;
        });
        const existingRecord = existingRecordIndex !== -1 ? data.records[existingRecordIndex] : null;

        evaluatedPlayers.push({
            scoreObj,
            cleanName,
            lowerName,
            modsArray,
            scoreMode,
            localPp,
            localStars,
            existingRecord,
            existingRecordIndex
        });
    }

    if (evaluatedPlayers.length === 0) return data;

    // ==============================================================
    // BƯỚC 2: LỌC TÌM NGƯỜI CÓ PP CAO NHẤT (VÀ CÓ KHẢ NĂNG PHÁ PEAK NGÀY)
    // ==============================================================
    evaluatedPlayers.sort((a, b) => b.localPp - a.localPp);

    const topLocalPp = evaluatedPlayers[0].localPp;
    const candidates = evaluatedPlayers.filter((item, idx) => {
        const isSameMapAsStored = item.existingRecord && String(item.existingRecord.beatmapId) === String(beatmapId);
        const canBeatOwnPeak = !item.existingRecord
            || item.localPp >= item.existingRecord.pp * FILTER_MARGIN
            || (item.existingRecord.verified !== true && isSameMapAsStored);

        // Ưu tiên người cao PP nhất trận (idx === 0) hoặc người sát nút trong phạm vi 3% so với Top 1 trận,
        // hoặc người tự phá kỷ lục cá nhân của chính họ trong ngày
        const isTopInMatch = idx === 0 || item.localPp >= topLocalPp * FILTER_MARGIN;
        return canBeatOwnPeak && (isTopInMatch || idx < 3);
    });

    console.log(`[Leaderboard Filter] 🔎 Đã lọc ${candidates.length}/${evaluatedPlayers.length} ứng viên cao PP nhất để kiểm tra ngầm .rs: ${candidates.map(c => `${c.cleanName}(~${c.localPp}pp)`).join(', ') || 'Không có'}`);

    // ==============================================================
    // BƯỚC 3: XÁC MINH PP (.RS) HOẶC SỬ DỤNG PP TÍNH TỪ MATCH (UNRANKED / FALLBACK)
    // ==============================================================
    let updatedCount = 0;
    const rawStatus = String(matchSummary.beatmap?.status || '').toLowerCase();
    const isUnranked = ['graveyard', 'pending', 'wip', 'unranked', '0', '-1', '-2'].includes(rawStatus);

    for (const item of candidates) {
        const { scoreObj, cleanName, lowerName, scoreMode, localPp, existingRecord, existingRecordIndex } = item;
        let { modsArray, localStars } = item;

        if (!scoreObj.userId || !beatmapId) {
            console.warn(`[Leaderboard Verify] ⚠️ Bỏ qua ${cleanName}: thiếu userId/beatmapId.`);
            continue;
        }

        let verified = null;
        // Chỉ cần gọi verifyPlayPP nếu map không phải unranked (vì osu! Bancho không lưu .rs cho unranked)
        if (!isUnranked) {
            verified = await verifyPlayPP(beatmapId, scoreObj, scoreMode, cleanName);
        }

        let realPp = 0;
        let isVerified = false;
        let source = isUnranked ? 'rosu-pp (unranked)' : 'rosu-pp (match fallback)';

        if (verified && typeof verified.pp === 'number' && verified.pp > 0) {
            realPp = verified.pp;
            isVerified = true;
            source = verified.source;
            if (Array.isArray(verified.mods) && verified.mods.length > 0) {
                modsArray = verified.mods;
            }
            if (verified.stars) {
                localStars = verified.stars;
            }

            const diffRatio = realPp > 0 ? Math.abs(localPp - realPp) / realPp : 0;
            console.log(`[Leaderboard .rs Check] 🎯 ${cleanName}: PP lọc cục bộ ${localPp}pp ➔ PP thực tế (.rs) ${realPp}pp [${verified.source}, sai số ${(diffRatio * 100).toFixed(2)}%]`);
        } else {
            // Map Unranked (osu! không lưu .rs) hoặc .rs API bị delay/lỗi mạng:
            // Dùng PP đã tính chuẩn bằng rosu-pp từ dữ liệu trận đấu (300/100/50, combo, misses)
            if (localPp > 0) {
                realPp = localPp;
                isVerified = false;
                console.log(`[Leaderboard] ℹ️ ${isUnranked ? 'Map Unranked' : 'Không lấy được .rs kịp thời'}, áp dụng PP tính từ match cho ${cleanName}: ${realPp}pp (${source}) trên ${beatmapTitle}`);
            }
        }

        if (!realPp || realPp <= 0) {
            console.warn(`[Leaderboard] ⚠️ Không tính được PP cho ${cleanName} trên map ${beatmapId}.`);
            continue;
        }

        // 🌟 CHỈ CẬP NHẬT NẾU PP THỰC TẾ CAO HƠN PEAK PP CŨ TRONG NGÀY (hoặc bản ghi cũ chưa verified)
        const isSameMapAsStored = existingRecord && String(existingRecord.beatmapId) === String(beatmapId);
        if (!existingRecord || realPp > existingRecord.pp || (existingRecord.verified !== true && isSameMapAsStored)) {
            const modStr = modsArray.length > 0 ? modsArray.join('') : 'NM';
            const starFloat = parseFloat(localStars.toFixed(2));
            const modsTag = modsArray.length > 0 ? ` +${modStr}` : '';
            console.log(`[Leaderboard] ⚡ New Peak PP for ${cleanName}: ${realPp}pp [${scoreMode}] (Old: ${existingRecord?.pp || 0}pp) on ${beatmapTitle} (${starFloat.toFixed(2)}★${modsTag})`);

            const scoreRuleset = toOsuApiRuleset(scoreMode || matchMode || 'osu');
            const playScoreUrl = verified?.scoreUrl || (verified?.scoreId ? `https://osu.ppy.sh/scores/${scoreRuleset}/${verified.scoreId}` : null);

            const newRecord = {
                username: cleanName,
                lowerName: lowerName,
                userId: scoreObj.userId || existingRecord?.userId || null,
                pp: realPp,
                mapTitle: beatmapTitle,
                beatmapId: beatmapId || existingRecord?.beatmapId || null,
                matchId: matchSummary.matchId || null,
                scoreId: verified?.scoreId || (isSameMapAsStored ? existingRecord?.scoreId : null) || null,
                scoreUrl: playScoreUrl || (isSameMapAsStored ? existingRecord?.scoreUrl : null) || null,
                matchUrl: matchSummary.matchId ? `https://osu.ppy.sh/community/matches/${matchSummary.matchId}` : null,
                starRating: starFloat,
                star: starFloat,
                mods: modsArray,
                mod: modStr,
                mode: scoreMode,
                verified: isVerified,
                source: source,
                unranked: isUnranked,
                timestamp: now,
                date: today
            };

            if (existingRecordIndex !== -1) {
                data.records[existingRecordIndex] = newRecord;
            } else {
                data.records.push(newRecord);
            }
            updatedCount++;
        }
    }

    if (updatedCount > 0) {
        saveLeaderboardData(data);
    }

    return data;
}

/**
 * 📊 Helper: Lấy Top N người chơi có Peak PP cao nhất trong N ngày gần nhất
 */
export function getTopPlayersForPeriod(days = 1, limit = 5) {
    const data = loadLeaderboardData();
    const now = Date.now();
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    const todayStr = getTodayDateString();

    const filteredRecords = data.records.filter(r => {
        if (days === 1) return r.date === todayStr;
        return r.timestamp >= cutoff;
    });

    // Gom nhóm theo người chơi (Ưu tiên gom theo UID vĩnh viễn để bảo toàn kỷ lục kể cả khi đổi tên)
    const playerBestMap = new Map();
    for (const r of filteredRecords) {
        const key = r.userId ? `uid_${r.userId}` : r.lowerName;
        const existing = playerBestMap.get(key);
        if (!existing || r.pp > existing.pp) {
            playerBestMap.set(key, r);
        }
    }

    const sortedList = Array.from(playerBestMap.values());
    sortedList.sort((a, b) => b.pp - a.pp);

    return sortedList.slice(0, limit);
}

/**
 * 📊 2. Lấy Top N người chơi trong ngày
 */
export function getTopDailyPeakPlayers(limit = 5) {
    return getTopPlayersForPeriod(1, limit);
}

/**
 * 📊 3. Lấy Top N người chơi trong tuần (7 ngày)
 */
export function getTopWeeklyPeakPlayers(limit = 5) {
    return getTopPlayersForPeriod(7, limit);
}

/**
 * 📊 4. Lấy Top N người chơi trong tháng (30 ngày)
 */
export function getTopMonthlyPeakPlayers(limit = 10) {
    return getTopPlayersForPeriod(30, limit);
}

/**
 * 🎙️ 5. Tạo chuỗi thông báo Bảng Xếp Hạng Peak PP Top 5 Hàng Ngày chuẩn IRC (Gọn gàng trên 1 dòng)
 */
export function formatDailyLeaderboardIRC(limit = 5) {
    const topPlayers = getTopDailyPeakPlayers(limit);

    if (!topPlayers || topPlayers.length === 0) return null;

    const rankEntries = topPlayers.map((p, idx) => {
        const rankNum = idx + 1;
        const cleanName = formatCleanUsername(p.username);
        const link = p.userId
            ? `[https://osu.ppy.sh/u/${p.userId} ${cleanName}]`
            : `[https://osu.ppy.sh/u/${encodeURIComponent(cleanName)} ${cleanName}]`;
        
        const modsArr = Array.isArray(p.mods) && p.mods.length > 0
            ? p.mods
            : (p.mod && p.mod !== 'NM' ? [p.mod] : []);
        const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '';

        const starVal = p.starRating ?? p.star;
        const validStar = (starVal !== undefined && starVal !== null && !isNaN(starVal) && Number(starVal) > 0)
            ? `${Number(starVal).toFixed(2)}★`
            : '';

        const modeShort = p.mode ? normalizeGameMode(p.mode) : 'std';

        let detailTag = '';
        if (modsStr && validStar) {
            detailTag = ` (${modsStr} ${validStar})`;
        } else if (modsStr) {
            detailTag = ` (${modsStr})`;
        } else if (validStar) {
            detailTag = ` (${validStar})`;
        }

        return `#${rankNum} ${link} ${p.pp}pp [${modeShort}]${detailTag}`;
    });

    return `YUE: 🏆 Top ${topPlayers.length} Daily PP: ${rankEntries.join(' | ')}`;
}

/**
 * 🗓️ Helper: Lấy thông tin xếp hạng Top 10 của người chơi trong tháng trước (từ tệp lưu trữ history)
 */
export function getPreviousMonthTopStanding(targetUserOrId, records = []) {
    const prevMonth = getPreviousMonthString();
    const linkedUser = findUserByAnyNameOrId(targetUserOrId);
    const queryStr = String(targetUserOrId).trim().replace(/^\[|\]$/g, '').toLowerCase();
    const queryNum = linkedUser?.userId || (/^\d+$/.test(queryStr) ? Number(queryStr) : null);
    const currentStr = linkedUser?.currentUsername ? linkedUser.currentUsername.toLowerCase().replace(/^\[|\]$/g, '') : null;
    const oldNames = (linkedUser?.previousUsernames || []).map(n => n.toLowerCase().replace(/^\[|\]$/g, ''));

    // 1. Quét trong thư mục data/history (các file monthlyLeaderboard_YYYY-MM.json)
    if (fs.existsSync(HISTORY_DIR)) {
        try {
            const targetFile = path.join(HISTORY_DIR, `monthlyLeaderboard_${prevMonth}.json`);
            let filesToScan = [];
            if (fs.existsSync(targetFile)) {
                filesToScan.push(targetFile);
            } else {
                const allFiles = fs.readdirSync(HISTORY_DIR)
                    .filter(f => f.startsWith('monthlyLeaderboard_') && f.endsWith('.json'))
                    .sort()
                    .reverse();
                filesToScan = allFiles.map(f => path.join(HISTORY_DIR, f));
            }

            for (const file of filesToScan) {
                const archiveData = safeReadJSON(file, null);
                if (archiveData && Array.isArray(archiveData.top10)) {
                    let match = archiveData.top10.find((p, idx) => {
                        if (queryNum && p.userId === queryNum) return true;
                        const pLower = (p.username || '').toLowerCase().replace(/^\[|\]$/g, '');
                        if (pLower === queryStr || (currentStr && pLower === currentStr)) return true;
                        if (oldNames.includes(pLower)) return true;
                        return false;
                    });
                    if (!match && !queryNum && queryStr.length >= 3) {
                        match = archiveData.top10.find(p => {
                            const pLower = (p.username || '').toLowerCase().replace(/^\[|\]$/g, '');
                            return pLower.startsWith(queryStr) || pLower.includes(queryStr);
                        });
                    }
                    if (match) {
                        return {
                            month: archiveData.month,
                            rank: match.rank || (archiveData.top10.indexOf(match) + 1),
                            pp: match.pp,
                            mapTitle: match.mapTitle,
                            mods: match.mods,
                            date: match.date,
                            username: linkedUser?.currentUsername || match.username,
                            userId: match.userId || queryNum
                        };
                    }
                }
            }
        } catch (err) {
            console.error('[Previous Month Standing Error]:', err.message);
        }
    }

    // 2. Fallback: Nếu chưa archive sang file, kiểm tra trong data.records (nếu có bản ghi của tháng trước)
    if (Array.isArray(records) && records.length > 0) {
        const prevRecords = records.filter(r => r && r.date && r.date.startsWith(prevMonth));
        if (prevRecords.length > 0) {
            const playerBestMap = new Map();
            for (const r of prevRecords) {
                const key = r.userId ? `uid_${r.userId}` : (r.lowerName || '').toLowerCase().replace(/^\[|\]$/g, '');
                const ex = playerBestMap.get(key);
                if (!ex || r.pp > ex.pp) playerBestMap.set(key, r);
            }
            const sortedList = Array.from(playerBestMap.values()).sort((a, b) => b.pp - a.pp).slice(0, 10);
            const idx = sortedList.findIndex(p => {
                if (queryNum && p.userId === queryNum) return true;
                const pLower = (p.lowerName || p.username || '').toLowerCase().replace(/^\[|\]$/g, '');
                if (pLower === queryStr || (currentStr && pLower === currentStr)) return true;
                if (oldNames.includes(pLower)) return true;
                return false;
            });
            if (idx !== -1) {
                const p = sortedList[idx];
                return {
                    month: prevMonth,
                    rank: idx + 1,
                    pp: p.pp,
                    mapTitle: p.mapTitle,
                    mods: p.mods,
                    date: p.date,
                    username: linkedUser?.currentUsername || p.username,
                    userId: p.userId || queryNum
                };
            }
        }
    }

    return null;
}

/**
 * 👤 6. Lấy Thống Kê Thứ Hạng & Phong Độ Cá Nhân của Người Chơi (Hôm nay, Tuần, Tháng, Tháng trước, Lịch sử Top)
 * Hỗ trợ nhận diện 2 lớp: UID vĩnh viễn, Tên hiện tại, và Lịch sử tên cũ khi đổi tên
 * @param {string|number} targetUserOrId Username hoặc UserID của người chơi
 */
export function getPlayerStandingsSummary(targetUserOrId) {
    if (!targetUserOrId) return null;
    const data = loadLeaderboardData();
    const records = data.records || [];

    // 1. Phân giải danh tính người chơi (Hỗ trợ 2 lớp: UID, Tên mới, Tên cũ)
    const linkedUser = findUserByAnyNameOrId(targetUserOrId);
    const queryStr = String(targetUserOrId).trim().replace(/^\[|\]$/g, '').toLowerCase();
    const queryNum = linkedUser?.userId || (/^\d+$/.test(queryStr) ? Number(queryStr) : null);
    const currentUsername = linkedUser?.currentUsername || null;
    const currentStr = currentUsername ? currentUsername.toLowerCase().replace(/^\[|\]$/g, '') : null;
    const isRenamed = !!linkedUser?.isRenamed;
    const matchedOldName = linkedUser?.matchedName || null;
    const oldNames = (linkedUser?.previousUsernames || []).map(n => n.toLowerCase().replace(/^\[|\]$/g, ''));

    const prevMonthStanding = getPreviousMonthTopStanding(queryNum || targetUserOrId, records);

    // Helper kiểm tra xem 1 record có thuộc về người chơi này không
    const isPlayerRecord = (r) => {
        if (!r) return false;
        if (queryNum && r.userId && r.userId === queryNum) return true;
        const lower = (r.lowerName || r.username || '').toLowerCase().replace(/^\[|\]$/g, '');
        if (lower === queryStr) return true;
        if (currentStr && lower === currentStr) return true;
        if (oldNames.includes(lower)) return true;
        return false;
    };

    // 2. Tìm tất cả record thuộc về player trong khoảng 30 ngày (Exact / UID match trước)
    let playerRecords = records.filter(isPlayerRecord);

    // 3. Nếu không tìm thấy và queryStr >= 3 ký tự: thử tìm tương đối (startsWith / includes)
    if (playerRecords.length === 0 && !queryNum && queryStr.length >= 3) {
        playerRecords = records.filter(r => {
            if (!r) return false;
            const lower = (r.lowerName || r.username || '').toLowerCase().replace(/^\[|\]$/g, '');
            return lower.startsWith(queryStr) || lower.includes(queryStr);
        });
    }

    if (playerRecords.length === 0) {
        if (prevMonthStanding) {
            const username = currentUsername || prevMonthStanding.username || targetUserOrId;
            const cleanName = formatCleanUsername(username);
            return {
                found: true,
                username,
                cleanName,
                userId: prevMonthStanding.userId || queryNum || null,
                isRenamed,
                matchedOldName,
                todayRank: null,
                todayTotal: records.filter(r => r.date === getTodayDateString()).length,
                todayRecord: null,
                weeklyRank: null,
                weeklyTotal: 0,
                weeklyRecord: null,
                monthlyRank: null,
                monthlyTotal: 0,
                monthlyRecord: null,
                dailyHistory: [],
                totalDaysPlayed: 0,
                top1Count: 0,
                top3Count: 0,
                top5Count: 0,
                top10Count: 0,
                bestRankEver: null,
                bestRecord: null,
                prevMonthStanding
            };
        }

        return {
            found: false,
            username: targetUserOrId,
            cleanName: formatCleanUsername(targetUserOrId),
            userId: queryNum || null,
            isRenamed: false,
            matchedOldName: null
        };
    }

    const latestRecord = [...playerRecords].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    const username = currentUsername || latestRecord.username || targetUserOrId;
    const cleanName = formatCleanUsername(username);
    const userId = queryNum || latestRecord.userId || null;
    const playerLower = (latestRecord.lowerName || cleanName).toLowerCase().replace(/^\[|\]$/g, '');

    const now = Date.now();
    const todayStr = getTodayDateString();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    // 1. Hôm nay
    const todayRecords = records.filter(r => r.date === todayStr).sort((a, b) => b.pp - a.pp);
    const todayIdx = todayRecords.findIndex(isPlayerRecord);
    const todayRank = todayIdx !== -1 ? todayIdx + 1 : null;
    const todayRecord = todayIdx !== -1 ? todayRecords[todayIdx] : null;

    // 2. Tuần (7 ngày gần nhất) - Gom nhóm theo UID (hoặc lowerName nếu không có UID)
    const weekCutoff = now - SEVEN_DAYS_MS;
    const weekRecords = records.filter(r => (r.timestamp || 0) >= weekCutoff);
    const weekMap = new Map();
    for (const r of weekRecords) {
        const key = r.userId ? `uid_${r.userId}` : (r.lowerName || '').toLowerCase().replace(/^\[|\]$/g, '');
        const ex = weekMap.get(key);
        if (!ex || r.pp > ex.pp) weekMap.set(key, r);
    }
    const weeklySorted = Array.from(weekMap.values()).sort((a, b) => b.pp - a.pp);
    const weekIdx = weeklySorted.findIndex(isPlayerRecord);
    const weeklyRank = weekIdx !== -1 ? weekIdx + 1 : null;
    const weeklyRecord = weekIdx !== -1 ? weeklySorted[weekIdx] : null;

    // 3. Tháng (30 ngày gần nhất) - Gom nhóm theo UID (hoặc lowerName nếu không có UID)
    const monthMap = new Map();
    for (const r of records) {
        const key = r.userId ? `uid_${r.userId}` : (r.lowerName || '').toLowerCase().replace(/^\[|\]$/g, '');
        const ex = monthMap.get(key);
        if (!ex || r.pp > ex.pp) monthMap.set(key, r);
    }
    const monthlySorted = Array.from(monthMap.values()).sort((a, b) => b.pp - a.pp);
    const monthIdx = monthlySorted.findIndex(isPlayerRecord);
    const monthlyRank = monthIdx !== -1 ? monthIdx + 1 : null;
    const monthlyRecord = monthIdx !== -1 ? monthlySorted[monthIdx] : null;

    // 4. Lịch sử từng ngày trong tháng (Day-by-Day Historical Standing)
    const uniqueDates = Array.from(new Set(records.map(r => r.date).filter(Boolean))).sort().reverse();
    const dailyHistory = [];

    for (const d of uniqueDates) {
        const dayRecs = records.filter(r => r.date === d).sort((a, b) => b.pp - a.pp);
        const idx = dayRecs.findIndex(isPlayerRecord);
        if (idx !== -1) {
            dailyHistory.push({
                date: d,
                rank: idx + 1,
                totalPlayers: dayRecs.length,
                record: dayRecs[idx]
            });
        }
    }

    const totalDaysPlayed = dailyHistory.length;
    const top1Days = dailyHistory.filter(h => h.rank === 1);
    const top3Days = dailyHistory.filter(h => h.rank <= 3);
    const top5Days = dailyHistory.filter(h => h.rank <= 5);
    const top10Days = dailyHistory.filter(h => h.rank <= 10);

    const bestRankEver = dailyHistory.length > 0 ? Math.min(...dailyHistory.map(h => h.rank)) : null;
    const bestRecord = dailyHistory.length > 0 ? dailyHistory.reduce((prev, curr) => (curr.record.pp > prev.record.pp ? curr : prev)).record : null;

    return {
        found: true,
        username,
        cleanName,
        userId,
        isRenamed,
        matchedOldName,
        todayRank,
        todayTotal: todayRecords.length,
        todayRecord,
        weeklyRank,
        weeklyTotal: weeklySorted.length,
        weeklyRecord,
        monthlyRank,
        monthlyTotal: monthlySorted.length,
        monthlyRecord,
        dailyHistory,
        totalDaysPlayed,
        top1Count: top1Days.length,
        top3Count: top3Days.length,
        top5Count: top5Days.length,
        top10Count: top10Days.length,
        bestRankEver,
        bestRecord,
        prevMonthStanding
    };
}

/**
 * 🎙️ 7. Tạo chuỗi thông báo Thành Tích Cá Nhân (.me) chuẩn Bancho IRC (Gọn gàng trên 1 dòng)
 * Tự động tối ưu độ dài chat:
 * - Người ít chơi (<= 2 ngày): Hiển thị cụ thể từng ngày đã lọt top (ví dụ: Từng đạt #2 ngày 18/11: 260pp).
 * - Người đứng top nhiều ngày (3+ ngày): Tự động gom nhóm huân chương (3x Top 1, 5x Top 3) tránh tràn chat IRC.
 * - Người lọt Top tháng trước: Tự động hiển thị huy chương và thứ hạng tháng trước (ví dụ: Tháng trước: #1 🥇 691pp).
 * - Người đổi tên: Tự động ghi chú tên cũ kèm theo (ví dụ: [link WhiteCat] (Tên cũ: oldName)).
 */
export function formatPlayerStandingIRC(summary) {
    if (!summary || !summary.found) {
        const name = summary?.cleanName || 'Player';
        return `YUE: ${name} | Chưa có dữ liệu thi đấu trong 30 ngày qua tại phòng 24/7. Hãy cùng chơi để ghi danh lên Bảng Xếp Hạng nhé!`;
    }

    const { cleanName, userId, isRenamed, matchedOldName, todayRank, todayRecord, weeklyRank, weeklyRecord, monthlyRank, monthlyRecord, totalDaysPlayed, top1Count, top3Count, top5Count, top10Count, dailyHistory, bestRankEver, bestRecord, prevMonthStanding } = summary;

    const renameTag = (isRenamed && matchedOldName) ? ` (Tên cũ: ${matchedOldName})` : '';

    const userProfileLink = userId 
        ? `[https://osu.ppy.sh/u/${userId} ${cleanName}]${renameTag}`
        : `[https://osu.ppy.sh/u/${encodeURIComponent(cleanName)} ${cleanName}]${renameTag}`;

    // 🎖️ Phần hiển thị Top Tháng Trước (nếu có)
    let prevMonthPart = '';
    if (prevMonthStanding) {
        const medal = prevMonthStanding.rank === 1 ? '🥇 ' : (prevMonthStanding.rank === 2 ? '🥈 ' : (prevMonthStanding.rank === 3 ? '🥉 ' : ''));
        prevMonthPart = `Tháng trước: #${prevMonthStanding.rank} ${medal}(${prevMonthStanding.pp}pp)`;
    }

    // Nếu người chơi chưa có lượt chơi nào trong tháng này nhưng có thành tích tháng trước:
    if (totalDaysPlayed === 0 && prevMonthStanding) {
        return `YUE: ${userProfileLink} | Hôm nay: Chưa chơi | Tuần: -- | Tháng: -- | 🎖️ ${prevMonthPart} | Từng lọt Top tháng ${prevMonthStanding.month}!`;
    }

    let todayPart = 'Hôm nay: Chưa chơi';
    if (todayRank && todayRecord) {
        const mods = Array.isArray(todayRecord.mods) && todayRecord.mods.length > 0 ? ` +${todayRecord.mods.join('')}` : (todayRecord.mod && todayRecord.mod !== 'NM' ? ` +${todayRecord.mod}` : '');
        const mapShort = todayRecord.mapTitle ? (todayRecord.mapTitle.length > 18 ? todayRecord.mapTitle.substring(0, 16) + '..' : todayRecord.mapTitle) : '';
        const mapInfo = mapShort ? ` - ${mapShort}${mods}` : '';
        todayPart = `Hôm nay: #${todayRank} (${todayRecord.pp}pp${mapInfo})`;
    }

    const weekPart = weeklyRank ? `Tuần: #${weeklyRank} (${weeklyRecord?.pp || 0}pp)` : 'Tuần: --';
    const monthPart = monthlyRank ? `Tháng: #${monthlyRank} (${monthlyRecord?.pp || 0}pp)` : 'Tháng: --';

    let historyPart = '';
    const todayStr = getTodayDateString();

    if (totalDaysPlayed <= 2) {
        const pastDays = dailyHistory.filter(h => h.date !== todayStr);
        if (pastDays.length === 0) {
            historyPart = `Mới tham gia hôm nay!`;
        } else if (pastDays.length === 1) {
            const [y, m, d] = pastDays[0].date.split('-');
            historyPart = `Từng đạt #${pastDays[0].rank} ngày ${d}/${m} (${pastDays[0].record.pp}pp)`;
        } else {
            const list = pastDays.map(h => {
                const [y, m, d] = h.date.split('-');
                return `#${h.rank} (${d}/${m})`;
            }).join(', ');
            historyPart = `Từng đạt ${list}`;
        }
    } else {
        const parts = [];
        if (top1Count > 0) parts.push(`${top1Count}x Top 1 🥇`);
        const otherTop3 = top3Count - top1Count;
        if (otherTop3 > 0) parts.push(`${otherTop3}x Top 3 🥉`);
        else if (top3Count > 0 && top1Count === 0) parts.push(`${top3Count}x Top 3 🥉`);
        
        const otherTop5 = top5Count - top3Count;
        if (otherTop5 > 0 && parts.length < 2) parts.push(`${otherTop5}x Top 5`);
        if (parts.length === 0 && top10Count > 0) parts.push(`${top10Count}x Top 10`);

        if (parts.length > 0) {
            historyPart = `🏆 ${parts.join(', ')} trong ${totalDaysPlayed} ngày`;
        } else {
            historyPart = `Đã chơi ${totalDaysPlayed} ngày (Best: #${bestRankEver} ${bestRecord?.pp || 0}pp)`;
        }
    }

    const segments = [
        `YUE: ${userProfileLink}`,
        todayPart,
        weekPart,
        monthPart
    ];
    if (prevMonthPart) {
        segments.push(`🎖️ ${prevMonthPart}`);
    }
    segments.push(historyPart);

    return segments.join(' | ');
}

/**
 * 🎨 8. Tạo Discord Embed Thống Kê Thành Tích Cá Nhân (.me)
 */
export function buildPlayerStandingEmbed(summary) {
    if (!summary || !summary.found) {
        const name = summary?.cleanName || 'Player';
        return {
            color: 0xE74C3C,
            title: `👤 THÀNH TÍCH MULTI 24/7 — ${name}`,
            description: `Chưa tìm thấy dữ liệu thi đấu của **${name}** trong 30 ngày qua tại các phòng 24/7 của Yue AI.\nHãy tham gia chơi phòng 24/7 để bắt đầu ghi danh nhé!`,
            footer: { text: 'Yue AI Multi 24/7 • Dùng .me [tên] để tra cứu' },
            timestamp: new Date().toISOString()
        };
    }

    const { cleanName, userId, isRenamed, matchedOldName, todayRank, todayTotal, todayRecord, weeklyRank, weeklyTotal, weeklyRecord, monthlyRank, monthlyTotal, monthlyRecord, totalDaysPlayed, top1Count, top3Count, top5Count, top10Count, dailyHistory, bestRankEver, bestRecord, prevMonthStanding } = summary;

    const profileUrl = userId ? `https://osu.ppy.sh/users/${userId}` : null;
    const avatarUrl = userId ? `https://a.ppy.sh/${userId}` : 'https://a.ppy.sh/0';
    const renameText = (isRenamed && matchedOldName) ? ` *(Trước đây: ${matchedOldName})*` : '';

    // Format hôm nay
    let todayValue = '*Chưa tham gia thi đấu hôm nay.*';
    if (todayRank && todayRecord) {
        const ruleset = toOsuApiRuleset(todayRecord.mode || 'osu');
        let playUrl = todayRecord.scoreId
            ? `https://osu.ppy.sh/scores/${ruleset}/${todayRecord.scoreId}`
            : (todayRecord.beatmapId ? `https://osu.ppy.sh/b/${todayRecord.beatmapId}` : null);
        const mapTitleLink = playUrl ? `[**${todayRecord.mapTitle}**](<${playUrl}>)` : `**${todayRecord.mapTitle}**`;
        const modsTag = todayRecord.mods && todayRecord.mods.length > 0 ? ` +${todayRecord.mods.join('')}` : (todayRecord.mod && todayRecord.mod !== 'NM' ? ` +${todayRecord.mod}` : '');
        const starTag = todayRecord.starRating ? ` \`(${Number(todayRecord.starRating).toFixed(2)}★${modsTag})\`` : '';
        todayValue = `🥇 Hạng **#${todayRank}** / ${todayTotal} người chơi — **${todayRecord.pp} PP** \`[${todayRecord.mode || 'std'}]\`\n┗ 🎵 ${mapTitleLink}${starTag}`;
    }

    // Format tuần
    let weekValue = '*Chưa có dữ liệu trong 7 ngày gần nhất.*';
    if (weeklyRank && weeklyRecord) {
        weekValue = `📊 Hạng **#${weeklyRank}** / ${weeklyTotal} người chơi — Peak **${weeklyRecord.pp} PP**`;
    }

    // Format tháng
    let monthValue = '*Chưa có dữ liệu trong 30 ngày gần nhất.*';
    if (monthlyRank && monthlyRecord) {
        monthValue = `📊 Hạng **#${monthlyRank}** / ${monthlyTotal} người chơi — Peak **${monthlyRecord.pp} PP**`;
    }

    // Format phong độ / lịch sử
    const historyLines = [];
    if (prevMonthStanding) {
        const medal = prevMonthStanding.rank === 1 ? '🥇' : (prevMonthStanding.rank === 2 ? '🥈' : (prevMonthStanding.rank === 3 ? '🥉' : '🎖️'));
        historyLines.push(`• ${medal} Thành tích Tháng trước (${prevMonthStanding.month}): **#${prevMonthStanding.rank}** (${prevMonthStanding.pp} PP)`);
    }
    historyLines.push(`• Tổng số ngày thi đấu: **${totalDaysPlayed}** ngày`);
    if (top1Count > 0) historyLines.push(`• 🥇 Top 1 Ngày: **${top1Count}** lần`);
    if (top3Count > 0) historyLines.push(`• 🥉 Top 3 Ngày: **${top3Count}** lần`);
    if (top10Count > 0 && top3Count < totalDaysPlayed) historyLines.push(`• ⭐ Top 10 Ngày: **${top10Count}** lần`);
    if (bestRecord) {
        historyLines.push(`• 🏆 Peak PP cao nhất tháng này: **${bestRecord.pp} PP** (Đạt #${bestRankEver} ngày ${bestRecord.date})`);
    }

    const fields = [
        { name: '🌅 Hôm nay', value: todayValue, inline: false },
        { name: '📅 7 Ngày gần nhất (Tuần)', value: weekValue, inline: true },
        { name: '🗓️ 30 Ngày gần nhất (Tháng)', value: monthValue, inline: true }
    ];

    if (prevMonthStanding) {
        const medal = prevMonthStanding.rank === 1 ? '🥇' : (prevMonthStanding.rank === 2 ? '🥈' : (prevMonthStanding.rank === 3 ? '🥉' : '🎖️'));
        const mapStr = prevMonthStanding.mapTitle ? `\n┗ *${prevMonthStanding.mapTitle}*` : '';
        fields.push({
            name: `${medal} Tháng trước (${prevMonthStanding.month})`,
            value: `Top **#${prevMonthStanding.rank}** — Peak **${prevMonthStanding.pp} PP**${mapStr}`,
            inline: true
        });
    }

    fields.push({ name: '🏆 Phong độ & Thống kê Top', value: historyLines.join('\n'), inline: false });

    return {
        color: 0x3498DB,
        author: {
            name: `Thành Tích Multi 24/7 — ${cleanName}${isRenamed && matchedOldName ? ` (Cũ: ${matchedOldName})` : ''}`,
            icon_url: avatarUrl,
            url: profileUrl || undefined
        },
        description: profileUrl ? `[Xem trang cá nhân osu! của **${cleanName}**](<${profileUrl}>)${renameText}` : `Người chơi **${cleanName}**${renameText}`,
        fields,
        footer: { text: 'Yue AI Multi 24/7 • Gõ .me trong game hoặc Discord' },
        timestamp: new Date().toISOString()
    };
}

// ==========================================================
// 🛡️ BẢNG XẾP HẠNG DISCORD LIVE & LƯU TRỮ LỊCH SỬ THÁNG (JSON)
// ==========================================================

const BOARD_CONFIG_FILE = path.resolve('data/multi247BoardConfig.json');
const SNAPSHOT_FILE = path.resolve('data/multi247YesterdaySnapshot.json');
let leaderboardDiscordClient = null;

export function setDiscordClientForLeaderboard(client) {
    leaderboardDiscordClient = client;
}

export function loadBoardConfig() {
    return safeReadJSON(BOARD_CONFIG_FILE, {});
}

export function saveBoardConfig(config) {
    return safeWriteJSON(BOARD_CONFIG_FILE, config);
}

export function loadYesterdaySnapshot() {
    return safeReadJSON(SNAPSHOT_FILE, null);
}

export function saveYesterdaySnapshot(snapshot) {
    return safeWriteJSON(SNAPSHOT_FILE, snapshot);
}

/**
 * 🔒 Khóa và tạo Snapshot bảng điểm ngày hôm qua với Grace Period (Bảo lưu dữ liệu tới 01:00 AM)
 */
export function lockYesterdayLeaderboardSnapshot(yesterdayDateStr) {
    try {
        const existing = loadYesterdaySnapshot();
        // Nếu snapshot đã có sẵn cho ngày này và đã khóa, dùng lại snapshot đó để bảo toàn nguyên trạng
        if (existing && existing.date === yesterdayDateStr && Array.isArray(existing.topPlayers) && existing.topPlayers.length > 0) {
            return existing;
        }

        const data = loadLeaderboardData();
        const records = (data.records || []).filter(r => r && r.date === yesterdayDateStr);

        const playerBestMap = new Map();
        for (const r of records) {
            const key = r.userId ? `uid_${r.userId}` : r.lowerName;
            const existingBest = playerBestMap.get(key);
            if (!existingBest || r.pp > existingBest.pp) {
                playerBestMap.set(key, r);
            }
        }

        const sortedList = Array.from(playerBestMap.values()).sort((a, b) => b.pp - a.pp).slice(0, 10);

        const now = Date.now();
        const snapshot = {
            date: yesterdayDateStr,
            lockedAt: now,
            graceUntil: now + (60 * 60 * 1000), // Bảo lưu ít nhất 1 tiếng (tới ~01:00 AM)
            totalPlayers: playerBestMap.size,
            topPlayers: sortedList,
            sentToDiscord: false
        };

        saveYesterdaySnapshot(snapshot);
        console.log(`[Leaderboard Snapshot] 🔒 Đã chốt sổ và khóa bảng điểm Ngày ${yesterdayDateStr} (${sortedList.length} người chơi) vào bộ đệm Grace Period.`);
        return snapshot;
    } catch (err) {
        console.error('❌ Lỗi tạo snapshot bảng điểm ngày hôm qua:', err.message);
        return null;
    }
}

/**
 * 📊 Lấy danh sách Top Players cho một ngày cụ thể (Ưu tiên bộ đệm đã khóa nếu là ngày hôm qua)
 */
export function getYesterdayLockedTopPlayers(dateStr) {
    const snapshot = loadYesterdaySnapshot();
    if (snapshot && snapshot.date === dateStr && Array.isArray(snapshot.topPlayers) && snapshot.topPlayers.length > 0) {
        return snapshot.topPlayers;
    }

    const data = loadLeaderboardData();
    const records = (data.records || []).filter(r => r && r.date === dateStr);
    const playerBestMap = new Map();
    for (const r of records) {
        const key = r.userId ? `uid_${r.userId}` : r.lowerName;
        const existing = playerBestMap.get(key);
        if (!existing || r.pp > existing.pp) {
            playerBestMap.set(key, r);
        }
    }
    return Array.from(playerBestMap.values()).sort((a, b) => b.pp - a.pp).slice(0, 10);
}

const MEDAL_ICONS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function formatPlayerListForDiscord(players) {
    if (!players || players.length === 0) {
        return '*Chưa có dữ liệu thi đấu trong khoảng thời gian này.*';
    }

    return players.map((p, idx) => {
        const medal = MEDAL_ICONS[idx] || `${idx + 1}.`;
        const linked = findUserByAnyNameOrId(p.userId || p.username);
        const currentName = linked?.currentUsername || p.username;
        const cleanName = formatCleanUsername(currentName);
        const profileUrl = p.userId
            ? `https://osu.ppy.sh/u/${p.userId}`
            : `https://osu.ppy.sh/u/${encodeURIComponent(cleanName)}`;
        
        const modsArr = Array.isArray(p.mods) && p.mods.length > 0 ? p.mods : (p.mod && p.mod !== 'NM' ? [p.mod] : []);
        const modsTag = modsArr.length > 0 ? ` +${modsArr.join('')}` : '';
        const starFloat = parseFloat((p.starRating || p.star || 0.0).toFixed(2));
        const mapTitleShort = p.mapTitle ? (p.mapTitle.length > 40 ? p.mapTitle.substring(0, 37) + '...' : p.mapTitle) : 'Unknown Map';

        const modeShort = p.mode ? normalizeGameMode(p.mode) : 'std';
        const ruleset = toOsuApiRuleset(p.mode || 'osu');

        // 🔗 Ưu tiên Link Play của người chơi (scoreUrl từ .rs), nếu không kiểm tra được (unranked/fallback) thì dùng link Beatmap
        let playUrl = null;
        if (p.scoreId) {
            playUrl = `https://osu.ppy.sh/scores/${ruleset}/${p.scoreId}`;
        } else if (p.scoreUrl && p.scoreUrl.includes('/scores/')) {
            const m = p.scoreUrl.match(/\/scores\/(?:osu|taiko|fruits|mania\/)?(\d+)/);
            if (m) {
                playUrl = `https://osu.ppy.sh/scores/${ruleset}/${m[1]}`;
            } else {
                playUrl = p.scoreUrl;
            }
        } else if (p.beatmapId) {
            playUrl = `https://osu.ppy.sh/b/${p.beatmapId}`;
        }

        const mapTitleFormatted = playUrl
            ? `[**${mapTitleShort}**](<${playUrl}>)`
            : `*${mapTitleShort}*`;

        return `${medal} [**${cleanName}**](<${profileUrl}>) — **${p.pp}pp** \`[${modeShort}]\`\n┗ ${mapTitleFormatted} \`(${starFloat.toFixed(2)}★${modsTag})\``;
    }).join('\n');
}

/**
 * 🎯 Tự động đồng bộ và sửa PP với Official osu! API (cho các map Ranked/Loved)
 */
export async function syncTodayOfficialPP() {
    try {
        const data = loadLeaderboardData();
        const today = getTodayDateString();
        const todayRecords = (data.records || []).filter(r => r && r.date === today && r.userId && r.beatmapId);
        if (todayRecords.length === 0) return;

        let hasChanges = false;
        await Promise.all(todayRecords.map(async (r) => {
            try {
                const plays = await getUserBeatmapPlays(r.beatmapId, r.userId, r.mode || 'std');
                // Chỉ xét các lượt chơi trong NGÀY HÔM NAY có PP chính thức; lấy mức CAO NHẤT (đúng ý nghĩa Peak PP)
                const todayPlays = plays.filter(p => p.pp !== null && getVNTimeInfo(new Date(p.time)).dateStr === today);
                if (todayPlays.length === 0) return;
                const sortedPlays = todayPlays.sort((a, b) => (b.pp || 0) - (a.pp || 0));
                const bestPlay = sortedPlays[0];
                const officialPeak = Math.round(bestPlay.pp);
                const ruleset = toOsuApiRuleset(r.mode || 'osu');
                const newScoreUrl = bestPlay.id ? `https://osu.ppy.sh/scores/${ruleset}/${bestPlay.id}` : null;
                if (officialPeak !== r.pp || (newScoreUrl && r.scoreUrl !== newScoreUrl)) {
                    console.log(`[Leaderboard Sync] 🎯 Cập nhật PP chuẩn từ osu! API cho ${r.username}: ${r.pp}pp ➔ ${officialPeak}pp`);
                    r.pp = officialPeak;
                    if (bestPlay.id) {
                        r.scoreId = bestPlay.id;
                        r.scoreUrl = newScoreUrl;
                    }
                    r.verified = true;
                    hasChanges = true;
                }
            } catch (err) {}
        }));

        if (hasChanges) {
            saveLeaderboardData(data);
        }
    } catch (e) {
        console.error('[Leaderboard Sync Error]:', e.message);
    }
}

/**
 * 🏆 Tạo Embed Bảng Xếp Hạng Top 10 của 1 Ngày cụ thể
 */
export async function buildDailyLeaderboardEmbed(dateStr) {
    await syncTodayOfficialPP();
    const sortedList = getYesterdayLockedTopPlayers(dateStr);
    const yesterdayStr = getYesterdayDateString();
    const isYesterdayRecap = (dateStr === yesterdayStr);

    const embed = {
        color: 0xF1C40F, // Vàng kim
        title: `🏆 BẢNG XẾP HẠNG TOP 10 PEAK PP NGÀY ${dateStr}`,
        description: `Tổng hợp Top 10 tuyển thủ có thành tích thi đấu cao nhất phòng 24/7 trong ngày **${dateStr}**!`,
        fields: [
            {
                name: `🥇 TOP 10 PEAK PP NGÀY ${dateStr}`,
                value: formatPlayerListForDiscord(sortedList),
                inline: false
            }
        ],
        footer: {
            text: isYesterdayRecap
                ? 'Yue AI Daily Leaderboard • Chốt sổ lúc 00:00 (Bảo lưu dữ liệu tới 01:00 AM)'
                : 'Yue AI Daily Leaderboard System • Tự động gửi lúc 00:00 đêm khi reset ngày'
        },
        timestamp: new Date().toISOString()
    };

    return embed;
}

export function getLeaderboardChannelIds() {
    const config = loadBoardConfig();
    let channels = [];
    if (Array.isArray(config.channelIds)) {
        channels = [...config.channelIds];
    }
    if (config.channelId && !channels.includes(config.channelId)) {
        channels.push(config.channelId);
    }

    // 🔒 Chỉ gửi vào các kênh được đăng ký tường minh (.setuplb). Không tự động thêm kênh khác.
    return Array.from(new Set(channels.filter(Boolean)));
}

export function addLeaderboardChannel(channelId) {
    if (!channelId) return getLeaderboardChannelIds();
    const config = loadBoardConfig();
    let channels = getLeaderboardChannelIds();
    if (!channels.includes(channelId)) {
        channels.push(channelId);
    }
    config.channelIds = channels;
    delete config.channelId;
    saveBoardConfig(config);
    return channels;
}

export function removeLeaderboardChannel(channelId) {
    const config = loadBoardConfig();
    if (channelId === 'all') {
        config.channelIds = [];
        delete config.channelId;
        saveBoardConfig(config);
        return [];
    }
    let channels = getLeaderboardChannelIds().filter(id => id !== channelId);
    config.channelIds = channels;
    delete config.channelId;
    saveBoardConfig(config);
    return channels;
}

/**
 * 📨 Gửi tin nhắn Embed Bảng Xếp Hạng Top 10 Hàng Ngày lên TẤT CẢ các Kênh Discord đã cài đặt
 */
export async function postDailyTop10ToDiscord(clientOverride = null, targetDateStr = null, targetChannelId = null) {
    const client = clientOverride || leaderboardDiscordClient;
    const vnInfo = getVNTimeInfo();

    if (!client) {
        console.warn(`[Leaderboard Daily] ⚠️ [${vnInfo.fullStr}] Discord Client chưa sẵn sàng.`);
        return 0;
    }

    const channelIds = targetChannelId ? [targetChannelId] : getLeaderboardChannelIds();
    if (!channelIds || channelIds.length === 0) {
        console.warn(`[Leaderboard Daily] ⚠️ [${vnInfo.fullStr}] Chưa cài đặt Kênh Discord nào. Cần dùng lệnh .setuplb trên Discord.`);
        sendAdminDebugLog('WARN', 'Chưa cài kênh Leaderboard', 'Không có kênh nào được đăng ký bằng .setuplb nên không gửi được Top Daily.');
        return 0;
    }

    let dateToPost = targetDateStr;
    if (!dateToPost) {
        const yesterdayStr = getYesterdayDateString();
        const todayStr = vnInfo.dateStr;
        const todayRecords = (loadLeaderboardData().records || []).filter(r => r && r.date === todayStr);
        // Nếu trong khung giờ nửa đêm (00:00 - 01:00) hoặc hôm nay chưa có play: Ưu tiên lấy hôm qua
        if (vnInfo.hour === 0 || todayRecords.length === 0) {
            dateToPost = yesterdayStr;
        } else {
            dateToPost = todayStr;
        }
    }

    const embedData = await buildDailyLeaderboardEmbed(dateToPost);

    let sentCount = 0;
    for (const chId of channelIds) {
        try {
            const channel = await client.channels.fetch(chId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                console.warn(`[Leaderboard Daily] ⚠️ [${vnInfo.fullStr}] Không tìm thấy kênh text Discord với ID: ${chId}`);
                continue;
            }

            await channel.send({
                content: `📅 **THÔNG BÁO BẢNG XẾP HẠNG TOP 10 NGÀY (${dateToPost}):**`,
                embeds: [embedData]
            });
            sentCount++;
            console.log(`[Leaderboard Daily] 📨 [${vnInfo.fullStr}] Đã gửi thông báo Top 10 Ngày ${dateToPost} lên kênh Discord ${chId}!`);
        } catch (err) {
            console.error(`❌ [${vnInfo.fullStr}] Lỗi gửi thông báo Bảng Xếp Hạng Ngày lên kênh Discord ${chId}:`, err.message);
            sendAdminDebugLog('ERROR', 'Gửi Top Daily lên Discord thất bại', `Kênh ${chId}: ${err.message}`, { stack: err.stack });
        }
    }

    return sentCount;
}

let resetLoopTimer = null;
let midnightPostInFlight = false;
const attemptedPostDates = new Set();

/**
 * 🌙 VÒNG LẶP THEO DÕI MIDNIGHT (00:00) TỰ ĐỘNG GỬI BÀI VÀ LƯU TRỮ LỊCH SỬ THÁNG
 * Hỗ trợ Grace Period: Dữ liệu ngày hôm trước được chốt sổ và bảo lưu tới 01:00 AM.
 * Trong khi đó, ngày hôm sau bắt đầu tính điểm mới ngay từ 00:00:00.
 */
export function startDailyLeaderboardResetLoop(client) {
    if (resetLoopTimer) clearInterval(resetLoopTimer);

    setDiscordClientForLeaderboard(client);

    const startVN = getVNTimeInfo();
    console.log(`[Leaderboard Loop] ⏰ Khởi chạy vòng lặp kiểm tra Daily Reset Top PP (Mỗi 1 phút).`);
    console.log(`[Leaderboard Loop] 🕒 Múi giờ Việt Nam hiện tại: ${startVN.fullStr}`);

    // Khởi chạy vòng lặp kiểm tra mỗi 1 phút
    resetLoopTimer = setInterval(async () => {
        try {
            const config = loadBoardConfig();
            const vnInfo = getVNTimeInfo();
            const todayStr = vnInfo.dateStr;
            const yesterdayStr = getYesterdayDateString();

            // Nếu chưa từng cấu hình mốc gửi gần nhất: Khởi tạo mốc an toàn
            if (!config.lastPostedDailyDate) {
                config.lastPostedDailyDate = (vnInfo.hour === 0) ? getYesterdayDateString(new Date(Date.now() - 24 * 3600 * 1000)) : yesterdayStr;
                saveBoardConfig(config);
                console.log(`[Leaderboard Loop] 📌 Khởi tạo mốc gửi ban đầu: ${config.lastPostedDailyDate} (VN Time: ${vnInfo.fullStr})`);
            }

            // 🌙 KIỂM TRA ĐIỀU KIỆN GỬI THÔNG BÁO CHỐT SỔ CHO NGÀY HÔM QUA:
            // Chỉ gửi trong khung 00:00 - 00:59 (VN), đúng 1 lần/ngày, không gửi bù ban ngày khi bot bật muộn.
            const alreadyHandled = config.lastPostedDailyDate === yesterdayStr || attemptedPostDates.has(yesterdayStr);
            if (!alreadyHandled && vnInfo.hour === 0 && !midnightPostInFlight) {
                midnightPostInFlight = true;
                try {
                    // Đánh dấu NGAY (RAM + đĩa) trước khi gửi để dù ghi file lỗi/gửi lỗi cũng không bao giờ lặp lại
                    attemptedPostDates.add(yesterdayStr);
                    config.lastPostedDailyDate = yesterdayStr;
                    saveBoardConfig(config);

                    const snapshot = lockYesterdayLeaderboardSnapshot(yesterdayStr);

                    console.log(`[Leaderboard Midnight] 🌙 BƯỚC SANG NGÀY MỚI! (Hôm qua: ${yesterdayStr} ➔ Hôm nay: ${todayStr}) - ${vnInfo.fullStr}`);
                    const sentCount = await postDailyTop10ToDiscord(client, yesterdayStr);
                    console.log(`[Leaderboard Midnight] ✅ Đã gửi Top 10 Ngày ${yesterdayStr} tới ${sentCount} kênh Discord.`);
                    if (snapshot && sentCount > 0) {
                        snapshot.sentToDiscord = true;
                        saveYesterdaySnapshot(snapshot);
                    }
                    checkAndArchiveMonthlyLeaderboard();
                } finally {
                    midnightPostInFlight = false;
                }
            } else if (!alreadyHandled && vnInfo.hour >= 1) {
                // Bot bật muộn / lỡ khung giờ: bỏ qua ngày này, KHÔNG gửi bù ban ngày
                attemptedPostDates.add(yesterdayStr);
                config.lastPostedDailyDate = yesterdayStr;
                saveBoardConfig(config);
            }

            // 🧹 KHI ĐÃ QUA 01:00 AM (HẾT GRACE PERIOD):
            if (vnInfo.hour >= 1) {
                // Nếu qua 1h sáng mà hôm qua chưa được đồng bộ (ví dụ bot bật dậy muộn lúc ban ngày),
                // ta cập nhật mốc để không gửi nhầm lúc ban ngày
                if (config.lastPostedDailyDate !== yesterdayStr) {
                    config.lastPostedDailyDate = yesterdayStr;
                    saveBoardConfig(config);
                }
            }
        } catch (e) {
            console.error('❌ Lỗi vòng lặp reset ngày Leaderboard:', e.message);
            sendAdminDebugLog('ERROR', 'Lỗi vòng lặp reset ngày Leaderboard', e.message, { stack: e.stack });
        }
    }, 60 * 1000);
}

function getCurrentMonthString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * 📁 Tự động Lưu trữ Top 10 của Tháng vừa qua thành File JSON riêng
 */
export function checkAndArchiveMonthlyLeaderboard() {
    try {
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }

        const config = loadBoardConfig();
        const prevMonth = getPreviousMonthString();

        // Nếu tháng trước chưa từng được lưu trữ lịch sử
        if (config.lastArchivedMonth !== prevMonth) {
            const archiveFileName = `monthlyLeaderboard_${prevMonth}.json`;
            const archiveFilePath = path.join(HISTORY_DIR, archiveFileName);

            if (!fs.existsSync(archiveFilePath)) {
                // Lấy Top 10 của tháng đó từ database
                const data = loadLeaderboardData();
                const filtered = (data.records || []).filter(r => r && r.date && r.date.startsWith(prevMonth));
                
                const playerBestMap = new Map();
                for (const r of filtered) {
                    const key = r.userId ? `uid_${r.userId}` : r.lowerName;
                    const existing = playerBestMap.get(key);
                    if (!existing || r.pp > existing.pp) {
                        playerBestMap.set(key, r);
                    }
                }

                const sortedList = Array.from(playerBestMap.values()).sort((a, b) => b.pp - a.pp).slice(0, 10);

                if (sortedList.length > 0) {
                    const archiveData = {
                        month: prevMonth,
                        archivedAt: Date.now(),
                        totalPlayers: sortedList.length,
                        top10: sortedList.map((p, idx) => ({
                            rank: idx + 1,
                            username: p.username,
                            userId: p.userId,
                            pp: p.pp,
                            mapTitle: p.mapTitle,
                            beatmapId: p.beatmapId || null,
                            scoreId: p.scoreId || null,
                            scoreUrl: p.scoreUrl || null,
                            starRating: p.starRating,
                            mods: p.mods,
                            date: p.date
                        }))
                    };

                    safeWriteJSON(archiveFilePath, archiveData);
                    console.log(`[Leaderboard Archive] 📁 Đã tự động lưu trữ Lịch sử Top 10 Tháng ${prevMonth} vào tệp ${archiveFileName}!`);
                }
            }

            config.lastArchivedMonth = prevMonth;
            saveBoardConfig(config);
        }
    } catch (err) {
        console.error('❌ Lỗi tự động lưu trữ Lịch sử Bảng Xếp Hạng Tháng:', err.message);
    }
}


import fs from 'fs';
import path from 'path';
import { calculateBeatmapPP } from './osuService.js';
import { botConfig } from '../../config/botConfig.js';

const LEADERBOARD_FILE = path.resolve('data/multi247DailyLeaderboard.json');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function ensureStorageFile() {
    const dir = path.dirname(LEADERBOARD_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
        const initialData = {
            records: []
        };
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    }
}

function loadLeaderboardData() {
    ensureStorageFile();
    try {
        const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
        let data = JSON.parse(raw);
        const now = Date.now();

        // 🔄 CHUYỂN ĐỔI DATA CŨ (Nếu có schema date/players) SANG DẠNG RECORDS LỊCH SỬ
        if (data.players && !data.records) {
            const records = [];
            const oldDate = data.date || getTodayDateString();
            for (const [lowerName, p] of Object.entries(data.players)) {
                records.push({
                    username: p.username || lowerName,
                    lowerName: lowerName,
                    userId: p.userId || null,
                    pp: p.peakPp || 0,
                    mapTitle: p.mapTitle || '',
                    starRating: p.starRating || 0,
                    timestamp: p.updatedAt || now,
                    date: oldDate
                });
            }
            data = { records };
        }

        if (!Array.isArray(data.records)) {
            data.records = [];
        }

        // 🧹 TỰ ĐỘNG LỌC VÀ DỌN DẸP DỮ LIỆU CŨ HƠN 30 NGÀY
        const initialLength = data.records.length;
        data.records = data.records.filter(r => r && r.timestamp && (now - r.timestamp <= THIRTY_DAYS_MS));

        if (data.records.length !== initialLength) {
            console.log(`[Leaderboard Service] 🧹 Đã tự động dọn dẹp ${initialLength - data.records.length} bản ghi cũ hơn 30 ngày.`);
            saveLeaderboardData(data);
        }

        return data;
    } catch (err) {
        console.error('❌ Lỗi đọc file multi247DailyLeaderboard.json:', err.message);
        return { records: [] };
    }
}

function saveLeaderboardData(data) {
    ensureStorageFile();
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('❌ Lỗi ghi file multi247DailyLeaderboard.json:', err.message);
        return false;
    }
}

/**
 * Chuẩn hóa tên Username để tạo link IRC rút gọn
 */
function formatCleanUsername(username) {
    if (!username) return 'Player';
    return String(username).replace(/^wiki:/i, '').trim() || 'Player';
}

/**
 * 🏆 1. Ghi nhận Peak PP của tất cả người chơi trong trận đấu vừa hoàn thành
 * @param {object} matchSummary Dữ liệu kết quả trận đấu từ recordRoomMatch
 */
export async function recordMatchDailyPeakPP(matchSummary) {
    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) return null;

    const data = loadLeaderboardData();
    const beatmapId = matchSummary.beatmap?.id;
    const starRating = matchSummary.beatmap?.starRating || 4.0;
    const beatmapTitle = matchSummary.beatmap?.title || 'Unknown Map';
    const today = getTodayDateString();
    const now = Date.now();

    let updatedCount = 0;

    for (const scoreObj of matchSummary.scores) {
        const cleanName = formatCleanUsername(scoreObj.username);
        const lowerName = cleanName.toLowerCase();

        // Loại bỏ bot
        if (!cleanName || lowerName.includes('banchobot') || lowerName.includes('yue')) continue;

        // 🛡️ CHỐNG EXPLOIT: Bỏ qua hoàn toàn nếu người chơi FAIL/QUIT (passed === false) hoặc thoát quá sớm (Combo < 15, Score < 30,000)
        if (scoreObj.passed === false || scoreObj.passed === 0 || (scoreObj.score || 0) < 30000 || (scoreObj.maxcombo || 0) < 15) {
            console.log(`[Leaderboard Filter] 🛡️ Bỏ qua play FAILED/QUIT của ${cleanName} (Passed: ${scoreObj.passed}, Score: ${scoreObj.score}, Combo: ${scoreObj.maxcombo})`);
            continue;
        }

        // Tính PP cho play này
        let calculatedPp = 0;
        if (beatmapId) {
            try {
                const ppRes = await calculateBeatmapPP(beatmapId, {
                    accuracy: scoreObj.accuracy,
                    misses: scoreObj.misses,
                    combo: scoreObj.maxcombo,
                    n100: scoreObj.statistics?.count_100,
                    n50: scoreObj.statistics?.count_50,
                    n300: scoreObj.statistics?.count_300,
                    mods: scoreObj.mods || []
                });
                if (ppRes && ppRes.pp) {
                    calculatedPp = Math.round(ppRes.pp);
                }
            } catch (ppErr) {
                console.error(`[Leaderboard] PP calc fallback for ${cleanName}:`, ppErr.message);
            }
        }

        // Fallback ước tính PP nếu rosu-pp không tính được (Unranked/Download failed)
        if (!calculatedPp || calculatedPp <= 0) {
            const mapMaxCombo = matchSummary.beatmap?.maxCombo || 0;
            const comboRatio = mapMaxCombo > 0 ? Math.min(1, (scoreObj.maxcombo || 0) / mapMaxCombo) : 0.5;
            const accFactor = Math.pow(scoreObj.accuracy / 100, 3);
            const scoreRatio = (scoreObj.score || 0) / 1000000;
            calculatedPp = Math.max(1, Math.round(scoreRatio * (starRating * 45) * accFactor * (0.4 + 0.6 * comboRatio)));
        }

        // Tìm bản ghi cao nhất trong ngày của người chơi này
        const existingRecordIndex = data.records.findIndex(r => r.lowerName === lowerName && r.date === today);
        const existingRecord = existingRecordIndex !== -1 ? data.records[existingRecordIndex] : null;

        // 🌟 CHỈ CẬP NHẬT NẾU KỶ LỤC MỚI CAO HƠN PEAK PP CŨ TRONG NGÀY
        if (!existingRecord || calculatedPp > existingRecord.pp) {
            console.log(`[Leaderboard] ⚡ New Peak PP for ${cleanName}: ${calculatedPp}pp (Old: ${existingRecord?.pp || 0}pp) on ${beatmapTitle}`);
            
            const newRecord = {
                username: cleanName,
                lowerName: lowerName,
                userId: scoreObj.userId || existingRecord?.userId || null,
                pp: calculatedPp,
                mapTitle: beatmapTitle,
                starRating: parseFloat(starRating.toFixed(2)),
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

    // Gom nhóm theo người chơi (giữ lại bản ghi PP cao nhất trong khoảng thời gian đó)
    const playerBestMap = new Map();
    for (const r of filteredRecords) {
        const existing = playerBestMap.get(r.lowerName);
        if (!existing || r.pp > existing.pp) {
            playerBestMap.set(r.lowerName, r);
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
export function getTopMonthlyPeakPlayers(limit = 5) {
    return getTopPlayersForPeriod(30, limit);
}

/**
 * 🎙️ 5. Tạo chuỗi thông báo Bảng Xếp Hạng Peak PP Top 5 Hàng Ngày chuẩn IRC
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
        return `#${rankNum} ${link} (${p.pp}pp)`;
    });

    return `YUE: 🏆 Top ${topPlayers.length} Daily Peak PP: ${rankEntries.join(' | ')}`;
}

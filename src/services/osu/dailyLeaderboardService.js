import fs from 'fs';
import path from 'path';
import { calculateBeatmapPP } from './osuService.js';
import { botConfig } from '../../config/botConfig.js';

const LEADERBOARD_FILE = path.resolve('data/multi247DailyLeaderboard.json');

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
            date: getTodayDateString(),
            players: {}
        };
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    }
}

function loadLeaderboardData() {
    ensureStorageFile();
    try {
        const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const today = getTodayDateString();

        // 🔄 TỰ ĐỘNG RESET BẢNG XẾP HẠNG VỀ 0 KHI QUA 0:00 SANG NGÀY MỚI
        if (data.date !== today) {
            console.log(`[Daily Leaderboard] 🌅 Đã sang ngày mới (${today}). Tự động reset Bảng Xếp Hạng Peak PP về rỗng!`);
            const newData = {
                date: today,
                players: {}
            };
            saveLeaderboardData(newData);
            return newData;
        }

        return data;
    } catch (err) {
        console.error('❌ Lỗi đọc file multi247DailyLeaderboard.json:', err.message);
        return { date: getTodayDateString(), players: {} };
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

    let updatedCount = 0;

    for (const scoreObj of matchSummary.scores) {
        const cleanName = formatCleanUsername(scoreObj.username);
        const lowerName = cleanName.toLowerCase();

        // Loại bỏ bot
        if (!cleanName || lowerName.includes('banchobot') || lowerName.includes('yue')) continue;

        // 🛡️ CHỐNG EXPLOIT: Bỏ qua hoàn toàn nếu người chơi FAIL/QUIT (passed === false) hoặc thoát quá sớm (Combo < 15, Score < 30,000)
        if (scoreObj.passed === false || scoreObj.passed === 0 || (scoreObj.score || 0) < 30000 || (scoreObj.maxcombo || 0) < 15) {
            console.log(`[Daily Leaderboard Filter] 🛡️ Bỏ qua play FAILED/QUIT của ${cleanName} (Passed: ${scoreObj.passed}, Score: ${scoreObj.score}, Combo: ${scoreObj.maxcombo})`);
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
                console.error(`[Daily Leaderboard] PP calc fallback for ${cleanName}:`, ppErr.message);
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

        const existingPlayer = data.players[lowerName] || {
            username: cleanName,
            userId: scoreObj.userId || null,
            peakPp: 0,
            mapTitle: '',
            starRating: 0,
            updatedAt: 0
        };

        // 🌟 CHỈ CẬP NHẬT NẾU KỶ LỤC MỚI CAO HƠN PEAK PP CŨ TRONG NGÀY
        if (calculatedPp > existingPlayer.peakPp) {
            console.log(`[Daily Leaderboard] ⚡ New Peak PP for ${cleanName}: ${calculatedPp}pp (Old: ${existingPlayer.peakPp}pp) on ${beatmapTitle}`);
            data.players[lowerName] = {
                username: cleanName,
                userId: scoreObj.userId || existingPlayer.userId || null,
                peakPp: calculatedPp,
                mapTitle: beatmapTitle,
                starRating: parseFloat(starRating.toFixed(2)),
                updatedAt: Date.now()
            };
            updatedCount++;
        }
    }

    if (updatedCount > 0) {
        saveLeaderboardData(data);
    }

    return data;
}

/**
 * 📊 2. Lấy Top N người chơi có Peak PP cao nhất trong ngày
 */
export function getTopDailyPeakPlayers(limit = 5) {
    const data = loadLeaderboardData();
    const playerList = Object.values(data.players || {});

    playerList.sort((a, b) => b.peakPp - a.peakPp);

    return playerList.slice(0, limit);
}

/**
 * 🎙️ 3. Tạo chuỗi thông báo Bảng Xếp Hạng Peak PP Top 5 chuẩn IRC link rút gọn
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
        return `#${rankNum} ${link} (${p.peakPp}pp)`;
    });

    return `YUE: 🏆 Top ${topPlayers.length} Daily Peak PP: ${rankEntries.join(' | ')}`;
}

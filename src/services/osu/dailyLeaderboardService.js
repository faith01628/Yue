import fs from 'fs';
import path from 'path';
import { calculateBeatmapPP } from './osuService.js';
import { botConfig } from '../../config/botConfig.js';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';

const LEADERBOARD_FILE = path.resolve('data/multi247DailyLeaderboard.json');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getTodayDateString() {
    // Ép kiểu lấy ngày YYYY-MM-DD theo đúng múi giờ Asia/Ho_Chi_Minh (GMT+7)
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
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
        for (const r of data.records) {
            r.mods = normalizeMods(r.mods || r.mod);
            r.mod = r.mods.length > 0 ? r.mods.join('') : 'NM';
            const starVal = r.starRating ?? r.star ?? 0.0;
            const parsedStar = parseFloat(Number(starVal).toFixed(2));
            r.starRating = parsedStar;
            r.star = parsedStar;
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
 * 🏆 1. Ghi nhận Peak PP của tất cả người chơi trong trận đấu vừa hoàn thành
 * @param {object} matchSummary Dữ liệu kết quả trận đấu từ recordRoomMatch
 */
export async function recordMatchDailyPeakPP(matchSummary) {
    if (!matchSummary || !matchSummary.scores || matchSummary.scores.length === 0) return null;

    const data = loadLeaderboardData();
    const beatmapId = matchSummary.beatmap?.id;
    const baseStarRating = matchSummary.beatmap?.starRating || 4.0;
    const beatmapTitle = matchSummary.beatmap?.title || 'Unknown Map';
    const today = getTodayDateString();
    const now = Date.now();

    let updatedCount = 0;

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

        // Tính PP và Star Rating thực tế sau khi tính Mod bằng rosu-pp
        let calculatedPp = 0;
        let calculatedStars = baseStarRating;

        if (beatmapId) {
            try {
                const ppRes = await calculateBeatmapPP(beatmapId, {
                    accuracy: scoreObj.accuracy,
                    misses: scoreObj.misses,
                    combo: scoreObj.maxcombo,
                    n100: scoreObj.statistics?.count_100,
                    n50: scoreObj.statistics?.count_50,
                    n300: scoreObj.statistics?.count_300,
                    mods: modsArray
                });
                if (ppRes) {
                    if (ppRes.pp) {
                        calculatedPp = Math.round(ppRes.pp);
                    }
                    const starsVal = ppRes.difficulty?.stars ?? ppRes.stars;
                    if (typeof starsVal === 'number' && !isNaN(starsVal) && starsVal > 0) {
                        calculatedStars = starsVal;
                    }
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
            calculatedPp = Math.max(1, Math.round(scoreRatio * (calculatedStars * 45) * accFactor * (0.4 + 0.6 * comboRatio)));
        }

        // Tìm bản ghi cao nhất trong ngày của người chơi này
        const existingRecordIndex = data.records.findIndex(r => r.lowerName === lowerName && r.date === today);
        const existingRecord = existingRecordIndex !== -1 ? data.records[existingRecordIndex] : null;

        // 🌟 CHỈ CẬP NHẬT NẾU KỶ LỤC MỚI CAO HƠN PEAK PP CŨ TRONG NGÀY
        if (!existingRecord || calculatedPp > existingRecord.pp) {
            const modStr = modsArray.length > 0 ? modsArray.join('') : 'NM';
            const starFloat = parseFloat(calculatedStars.toFixed(2));
            const modsTag = modsArray.length > 0 ? ` +${modStr}` : '';
            console.log(`[Leaderboard] ⚡ New Peak PP for ${cleanName}: ${calculatedPp}pp (Old: ${existingRecord?.pp || 0}pp) on ${beatmapTitle} (${starFloat.toFixed(2)}★${modsTag})`);
            
            const newRecord = {
                username: cleanName,
                lowerName: lowerName,
                userId: scoreObj.userId || existingRecord?.userId || null,
                pp: calculatedPp,
                mapTitle: beatmapTitle,
                starRating: starFloat,
                star: starFloat,
                mods: modsArray,
                mod: modStr,
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

        let detailTag = '';
        if (modsStr && validStar) {
            detailTag = ` (${modsStr} ${validStar})`;
        } else if (modsStr) {
            detailTag = ` (${modsStr})`;
        } else if (validStar) {
            detailTag = ` (${validStar})`;
        }

        return `#${rankNum} ${link} ${p.pp}pp${detailTag}`;
    });

    return `YUE: 🏆 Top ${topPlayers.length} Daily PP: ${rankEntries.join(' | ')}`;
}

// ==========================================================
// 🛡️ BẢNG XẾP HẠNG DISCORD LIVE & LƯU TRỮ LỊCH SỬ THÁNG (JSON)
// ==========================================================

const BOARD_CONFIG_FILE = path.resolve('data/multi247BoardConfig.json');
const HISTORY_DIR = path.resolve('data/history');
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

const MEDAL_ICONS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function formatPlayerListForDiscord(players) {
    if (!players || players.length === 0) {
        return '*Chưa có dữ liệu thi đấu trong khoảng thời gian này.*';
    }

    return players.map((p, idx) => {
        const medal = MEDAL_ICONS[idx] || `${idx + 1}.`;
        const cleanName = formatCleanUsername(p.username);
        const profileUrl = p.userId
            ? `https://osu.ppy.sh/u/${p.userId}`
            : `https://osu.ppy.sh/u/${encodeURIComponent(cleanName)}`;
        
        const modsArr = Array.isArray(p.mods) && p.mods.length > 0 ? p.mods : (p.mod && p.mod !== 'NM' ? [p.mod] : []);
        const modsTag = modsArr.length > 0 ? ` +${modsArr.join('')}` : '';
        const starFloat = parseFloat((p.starRating || p.star || 0.0).toFixed(2));
        const mapTitleShort = p.mapTitle ? (p.mapTitle.length > 40 ? p.mapTitle.substring(0, 37) + '...' : p.mapTitle) : 'Unknown Map';

        return `${medal} [**${cleanName}**](<${profileUrl}>) — **${p.pp}pp**\n┗ *${mapTitleShort}* \`(${starFloat.toFixed(2)}★${modsTag})\``;
    }).join('\n');
}

/**
 * 🏆 Tạo Embed Bảng Xếp Hạng Top 10 của 1 Ngày cụ thể
 */
export function buildDailyLeaderboardEmbed(dateStr) {
    const data = loadLeaderboardData();
    const records = (data.records || []).filter(r => r && r.date === dateStr);

    const playerBestMap = new Map();
    for (const r of records) {
        const existing = playerBestMap.get(r.lowerName);
        if (!existing || r.pp > existing.pp) {
            playerBestMap.set(r.lowerName, r);
        }
    }

    const sortedList = Array.from(playerBestMap.values()).sort((a, b) => b.pp - a.pp).slice(0, 10);

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
            text: 'Yue AI Daily Leaderboard System • Tự động gửi lúc 00:00 đêm khi reset ngày'
        },
        timestamp: new Date().toISOString()
    };

    return embed;
}

/**
 * 📨 Gửi tin nhắn Embed Bảng Xếp Hạng Top 10 Hàng Ngày lên Kênh Discord đã cài đặt
 */
export async function postDailyTop10ToDiscord(clientOverride = null, targetDateStr = null) {
    const client = clientOverride || leaderboardDiscordClient;
    if (!client) return;

    const config = loadBoardConfig();
    if (!config.channelId) return;

    try {
        const channel = await client.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const dateToPost = targetDateStr || getTodayDateString();
        const embedData = buildDailyLeaderboardEmbed(dateToPost);

        await channel.send({
            content: `📅 **THÔNG BÁO BẢNG XẾP HẠNG TOP 10 NGÀY (${dateToPost}):**`,
            embeds: [embedData]
        });
        console.log(`[Leaderboard Daily] 📨 Đã tự động gửi thông báo Top 10 Ngày ${dateToPost} lên Discord!`);
    } catch (err) {
        console.error('❌ Lỗi gửi thông báo Bảng Xếp Hạng Ngày lên Discord:', err.message);
    }
}

let resetLoopTimer = null;

/**
 * 🌙 VÒNG LẶP THEO DÕI MIDNIGHT (00:00) TỰ ĐỘNG GỬI BÀI VÀ LƯU TRỮ LỊCH SỬ THÁNG
 */
export function startDailyLeaderboardResetLoop(client) {
    if (resetLoopTimer) clearInterval(resetLoopTimer);

    setDiscordClientForLeaderboard(client);

    // Khởi chạy vòng lặp kiểm tra mỗi 1 phút
    resetLoopTimer = setInterval(async () => {
        try {
            const config = loadBoardConfig();
            const todayStr = getTodayDateString();

            if (!config.lastPostedDailyDate) {
                config.lastPostedDailyDate = todayStr;
                saveBoardConfig(config);
                return;
            }

            // Nếu ngày hôm nay khác với ngày đã gửi gần nhất -> Kiểm tra điều kiện gửi
            if (config.lastPostedDailyDate !== todayStr) {
                const prevDateStr = config.lastPostedDailyDate;
                const now = new Date();
                const currentHour = parseInt(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, hour: '2-digit' }), 10);

                // CHỈ tự động gửi thông báo nếu hiện tại đang là đầu ngày (00:00 -> 00:59 AM)
                // Nếu Bot vừa restart vào giữa ngày (11h sáng, 3h chiều...), chỉ cập nhật mốc ngày chứ KHÔNG gửi rác vào Discord
                if (currentHour === 0) {
                    console.log(`[Leaderboard Midnight] 🌙 Đã sang ngày mới (${todayStr}). Tiến hành gửi Top 10 của ngày vừa kết thúc (${prevDateStr})...`);
                    await postDailyTop10ToDiscord(client, prevDateStr);
                    checkAndArchiveMonthlyLeaderboard();
                } else {
                    console.log(`[Leaderboard Midnight] 🔄 Bot khởi động giữa ngày (${todayStr}, ${currentHour}h). Đã cập nhật mốc ngày và chờ đúng 00:00 đêm.`);
                }

                config.lastPostedDailyDate = todayStr;
                saveBoardConfig(config);
            }
        } catch (e) {
            console.error('❌ Lỗi vòng lặp reset ngày Leaderboard:', e.message);
        }
    }, 60 * 1000);
}

function getPreviousMonthString() {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
                    const existing = playerBestMap.get(r.lowerName);
                    if (!existing || r.pp > existing.pp) {
                        playerBestMap.set(r.lowerName, r);
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


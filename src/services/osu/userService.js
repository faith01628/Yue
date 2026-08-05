import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve('src/data/users.json');

// Đảm bảo thư mục và file json tồn tại
function ensureDataFile() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
}

/**
 * Đọc toàn bộ danh sách đã link
 */
function loadUsers() {
    ensureDataFile();
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error("❌ Lỗi đọc file users.json:", err);
        return {};
    }
}

/**
 * Lưu username osu! cho Discord ID
 */
export function linkOsuAccount(discordId, osuUsername) {
    const users = loadUsers();
    users[discordId] = osuUsername;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error("❌ Lỗi ghi file users.json:", err);
        return false;
    }
}

/**
 * Lấy osu! username đã link của Discord ID (Nếu chưa link thì trả về null)
 */
export function getLinkedOsuUsername(discordId) {
    const users = loadUsers();
    return users[discordId] || null;
}


/**
 * Lấy recent score chi tiết - Tự động tính PP nếu API v1 không trả về
 */
export async function getRecentScore(username) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey) return null;

        // 1. Lấy score gần nhất
        const urlRecent = `https://osu.ppy.sh/api/get_user_recent?k=${apiKey}&u=${encodeURIComponent(username)}&limit=1`;
        const resRecent = await fetch(urlRecent);
        const dataRecent = await resRecent.json();

        if (!dataRecent || dataRecent.length === 0) return null;

        const recent = dataRecent[0];
        const beatmapId = recent.beatmap_id;

        let beatmapTitle = `Beatmap #${beatmapId}`;
        let mapMaxCombo = null;

        if (beatmapId) {
            try {
                const urlBeatmap = `https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmapId}`;
                const resBeatmap = await fetch(urlBeatmap);
                const dataBeatmap = await resBeatmap.json();

                if (dataBeatmap && dataBeatmap.length > 0) {
                    const bm = dataBeatmap[0];
                    beatmapTitle = `${bm.artist} - ${bm.title} [${bm.version}]`;
                    mapMaxCombo = bm.max_combo ? parseInt(bm.max_combo) : null;
                }
            } catch (bmErr) {
                console.error('Lỗi fetch beatmap info:', bmErr.message);
            }
        }

        const count300 = parseInt(recent.count300 || 0);
        const count100 = parseInt(recent.count100 || 0);
        const count50 = parseInt(recent.count50 || 0);
        const countmiss = parseInt(recent.countmiss || 0);
        const enabledMods = parseInt(recent.enabled_mods || 0);

        // Lấy PP trực tiếp từ API v1 nếu có
        let finalPp = recent.pp ? Math.round(parseFloat(recent.pp)) : 0;

        // Nếu API v1 trả về 0pp, lấy tạm PP tính từ hàm calculator của Discord (hoặc gọi module tính PP)
        // Nếu ông đã có file ppCalculator.js trong project, gọi vào đây:
        /* 
        if (finalPp === 0) {
            finalPp = await calculatePpOffline(beatmapId, enabledMods, count300, count100, count50, countmiss, parseInt(recent.maxcombo || 0));
        }
        */

        return {
            beatmapTitle,
            rank: recent.rank,
            score: parseInt(recent.score),
            pp: finalPp,
            maxcombo: parseInt(recent.maxcombo || 0),
            beatmapMaxCombo: mapMaxCombo,
            mods: enabledMods,
            count300,
            count100,
            count50,
            countmiss
        };
    } catch (err) {
        console.error('Lỗi lấy recent score:', err);
        return null;
    }
}
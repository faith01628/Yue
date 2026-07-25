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
 * Lấy recent score từ osu! API
 */
export async function getRecentScore(username) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey) return null;

        const url = `https://osu.ppy.sh/api/get_user_recent?k=${apiKey}&u=${encodeURIComponent(username)}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || data.length === 0) return null;

        const recent = data[0];
        return {
            beatmapTitle: `Beatmap #${recent.beatmap_id}`,
            rank: recent.rank,
            score: parseInt(recent.score),
            pp: recent.pp ? parseFloat(recent.pp) : 0,
            maxcombo: parseInt(recent.maxcombo),
            beatmapMaxCombo: null,
            statistics: {
                countmiss: parseInt(recent.countmiss)
            }
        };
    } catch (err) {
        console.error('Lỗi lấy recent score:', err);
        return null;
    }
}
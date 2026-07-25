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
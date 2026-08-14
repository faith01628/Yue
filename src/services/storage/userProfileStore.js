import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'user_profiles.json');

/**
 * Đảm bảo thư mục data và file JSON tồn tại
 */
function ensureStorageExists() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROFILES_FILE)) {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify({}, null, 2), 'utf-8');
    }
}

/**
 * Đọc tất cả profiles từ JSON
 */
function readAllProfiles() {
    ensureStorageExists();
    try {
        const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
        return JSON.parse(raw || '{}');
    } catch (err) {
        console.error('❌ Lỗi đọc file user_profiles.json:', err.message);
        return {};
    }
}

/**
 * Lưu tất cả profiles vào JSON
 */
function writeAllProfiles(data) {
    ensureStorageExists();
    try {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('❌ Lỗi ghi file user_profiles.json:', err.message);
    }
}

/**
 * Lưu/Cập nhật thông tin kỹ năng người dùng từ lệnh .st
 * @param {string} discordId 
 * @param {object} profileData 
 */
export function saveUserSkillProfile(discordId, profileData) {
    if (!discordId) return;
    const profiles = readAllProfiles();

    const existing = profiles[discordId] || {};
    profiles[discordId] = {
        ...existing,
        ...profileData,
        discordId,
        lastUpdated: new Date().toISOString()
    };

    writeAllProfiles(profiles);
    console.log(`💾 [userProfileStore] Đã lưu thông tin skill profile cho Discord User: ${discordId} (${profileData.osuUsername || 'Unknown'})`);
}

/**
 * Lấy thông tin kỹ năng người dùng theo Discord ID
 * @param {string} discordId 
 * @returns {object|null}
 */
export function getUserSkillProfile(discordId) {
    if (!discordId) return null;
    const profiles = readAllProfiles();
    return profiles[discordId] || null;
}

/**
 * Thêm Beatmap ID vào danh sách lịch sử đã gợi ý của người dùng để tránh lặp lại (tối đa 50 map gần nhất)
 * @param {string} discordId 
 * @param {number|string} beatmapId 
 */
export function addRecommendedBeatmapToHistory(discordId, beatmapId) {
    if (!discordId || !beatmapId) return;
    const profiles = readAllProfiles();
    const existing = profiles[discordId] || { discordId };

    let history = Array.isArray(existing.recommendedHistory) ? existing.recommendedHistory : [];
    const numericId = Number(beatmapId);

    if (!history.includes(numericId)) {
        history.push(numericId);
    }

    // Giữ tối đa 50 bài gần nhất
    if (history.length > 50) {
        history = history.slice(history.length - 50);
    }

    profiles[discordId] = {
        ...existing,
        recommendedHistory: history,
        lastUpdated: new Date().toISOString()
    };

    writeAllProfiles(profiles);
    console.log(`📌 [userProfileStore] Đã lưu Beatmap ID ${numericId} vào lịch sử chống trùng của User ${discordId} (Tổng: ${history.length} maps)`);
}

/**
 * Lấy danh sách Beatmap ID đã từng gợi ý cho người dùng này
 * @param {string} discordId 
 * @returns {Array<number>}
 */
export function getRecommendedBeatmapHistory(discordId) {
    if (!discordId) return [];
    const profile = getUserSkillProfile(discordId);
    return Array.isArray(profile?.recommendedHistory) ? profile.recommendedHistory : [];
}


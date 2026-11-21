import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'user_profiles.json');

function ensureStorageExists() {
    safeReadJSON(PROFILES_FILE, {});
}

function readAllProfiles() {
    return safeReadJSON(PROFILES_FILE, {});
}

function writeAllProfiles(data) {
    return safeWriteJSON(PROFILES_FILE, data);
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


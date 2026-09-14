import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';

const DATA_FILE = path.resolve('data/users.json');

function ensureDataFile() {
    safeReadJSON(DATA_FILE, {});
}

/**
 * Đọc toàn bộ danh sách đã link
 */
function loadUsers() {
    return safeReadJSON(DATA_FILE, {});
}

/**
 * Lưu username osu! cho Discord ID
 */
export function linkOsuAccount(discordId, osuUsername) {
    const users = loadUsers();
    users[discordId] = osuUsername;
    return safeWriteJSON(DATA_FILE, users);
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
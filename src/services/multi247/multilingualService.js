import { getPlayer247Memory, updatePlayer247Memory } from './room247Memory.js';
import { LOCALES, t } from '../../locales/index.js';

export const MESSAGES = LOCALES;
export { t };

/**
 * Lấy quốc gia của user từ osu! API v1 (nếu chưa lưu trong bộ nhớ)
 */
export async function fetchUserCountryCode(username) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey || !username) return null;

        const res = await fetch(`https://osu.ppy.sh/api/get_user?k=${apiKey}&u=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            return data[0].country; // e.g. 'VN', 'JP', 'KR', 'US', 'DE', 'RU', 'PL', 'CN'...
        }
    } catch (e) {
        console.error('[FetchCountry Error]:', e.message);
    }
    return null;
}

/**
 * Lấy thông tin quốc gia & bộ nhớ phòng 24/7 của người chơi.
 */
export async function determineLanguageStrategy(username, promptText) {
    let playerMem = getPlayer247Memory(username);

    if (!playerMem || !playerMem.country) {
        const country = await fetchUserCountryCode(username);
        playerMem = updatePlayer247Memory(username, { country: country || 'VN' });
    }

    const country = playerMem.country || 'VN';

    // Cập nhật thời gian và số lần ghé thăm phòng
    updatePlayer247Memory(username, {
        visitCountInc: true
    });

    return {
        country,
        playerMem
    };
}

/**
 * 🎯 XÁC ĐỊNH NGÔN NGỮ CỦA PHÒNG MULTI 24/7 (LUÔN DÙNG TIẾNG ANH CHO LỆNH HỆ THỐNG)
 */
export async function getRoomLanguage(channel) {
    return 'en';
}

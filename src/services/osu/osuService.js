import axios from 'axios';
import rosu from 'rosu-pp-js';
import 'dotenv/config';

let accessToken = null;
let tokenExpiresAt = 0;


/**
 * Format thời gian đã trôi qua (VD: 2 ngày trước, 3 tháng trước)
 */
export function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `${interval} năm trước`;
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `${interval} tháng trước`;
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `${interval} ngày trước`;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `${interval} giờ trước`;
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `${interval} phút trước`;
    return 'Vừa xong';
}

/**
 * Hàm lấy Access Token từ Client Credentials của osu! API v2
 */
export async function getOsuToken() {
    // Nếu token còn hạn thì dùng lại token cũ
    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }

    try {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: process.env.OSU_CLIENT_ID,
            client_secret: process.env.OSU_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'public'
        });

        accessToken = response.data.access_token;
        // Trừ bớt 60s buffer để tránh hết hạn giữa chừng
        tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
        console.log('🔑 [osu! API v2] Đã lấy Access Token mới thành công!');
        
        return accessToken;
    } catch (err) {
        console.error('❌ Lỗi lấy osu! Access Token:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Tự động xin / gia hạn Access Token từ osu! API v2
 */
async function getAccessToken() {
    const now = Date.now();
    if (accessToken && now < tokenExpiresAt - 60000) {
        return accessToken;
    }

    try {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: process.env.OSU_CLIENT_ID,
            client_secret: process.env.OSU_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'public'
        });

        accessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

        console.log('🔑 [osu! API v2] Đã lấy Access Token mới thành công!');
        return accessToken;
    } catch (error) {
        console.error('❌ Lỗi lấy osu! Access Token:', error.response?.data || error.message);
        throw new Error('Không thể kết nối tới osu! API.');
    }
}

/**
 * Hàm gọi API chung cho osu! v2
 */
async function fetchOsuAPI(endpoint, params = {}) {
    const token = await getAccessToken();
    const response = await axios.get(`https://osu.ppy.sh/api/v2${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        params
    });
    return response.data;
}

/**
 * 1. Lấy thông tin Profile
 */
export async function getUserProfile(username, mode = 'osu') {
    try {
        return await fetchOsuAPI(`/users/${encodeURIComponent(username)}/${mode}`);
    } catch (error) {
        console.error(`❌ Lỗi lấy profile osu! của ${username}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * 2. Lấy Recent Play
 */
export async function getUserRecentPlay(username, mode = 'osu') {
    try {
        const user = await getUserProfile(username, mode);
        if (!user) return null;

        const recents = await fetchOsuAPI(`/users/${user.id}/scores/recent`, {
            include_fails: 1,
            limit: 1,
            mode: mode
        });

        return {
            user,
            score: recents.length > 0 ? recents[0] : null
        };
    } catch (error) {
        console.error(`❌ Lỗi lấy Recent Play của ${username}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * 3. Lấy Top Plays
 */
export async function getUserTopPlays(username, limit = 5, mode = 'osu') {
    try {
        const user = await getUserProfile(username, mode);
        if (!user) return null;

        const bestScores = await fetchOsuAPI(`/users/${user.id}/scores/best`, {
            limit: limit,
            mode: mode
        });

        return { user, bestScores };
    } catch (error) {
        console.error(`❌ Lỗi lấy Top Plays của ${username}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * 4. Lấy Beatmap Scores của User
 */
/**
 * Lấy TẤT CẢ điểm số của người dùng trên một Beatmap cụ thể
 */
export async function getUserBeatmapScores(username, beatmapId) {
    try {
        // Kiểm tra xem hàm getOsuToken có tồn tại không trước khi gọi
        const token = typeof getOsuToken === 'function' ? await getOsuToken() : null;
        
        const user = await getUserProfile(username);
        if (!user) return null;

        // Nếu file osuService.js của ông có sẵn instance axios đã config token (ví dụ: osuApi) thì dùng instance đó.
        // Còn nếu dùng axios trực tiếp thì truyền Header chứa token:
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const response = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores/users/${user.id}/all`, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const scores = response.data.scores || [];
        const beatmap = await getBeatmapDetail(beatmapId);

        return {
            user,
            beatmap,
            scores: scores,
            score: scores[0] || null
        };
    } catch (err) {
        if (err.response && err.response.status === 404) {
            const user = await getUserProfile(username);
            const beatmap = await getBeatmapDetail(beatmapId);
            return { user, beatmap, scores: [], score: null };
        }
        console.error("❌ Lỗi lấy Beatmap Scores:", err.message);
        return null;
    }
}


/**
 * 5. Lấy Beatmap Detail
 */
export async function getBeatmapDetail(beatmapId) {
    try {
        return await fetchOsuAPI(`/beatmaps/${beatmapId}`);
    } catch (error) {
        console.error(`❌ Lỗi lấy thông tin Beatmap ${beatmapId}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * 6. Lấy Leaderboard Global
 */
export async function getBeatmapLeaderboard(beatmapId, mode = 'osu') {
    try {
        const data = await fetchOsuAPI(`/beatmaps/${beatmapId}/scores`, { mode });
        const beatmap = await fetchOsuAPI(`/beatmaps/${beatmapId}`);
        return {
            beatmap,
            scores: data.scores || []
        };
    } catch (error) {
        console.error(`❌ Lỗi lấy Leaderboard của Beatmap ${beatmapId}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * 7. Tải file .osu và Tính toán PP bằng rosu-pp-js (Dùng fetch + Mirror chống 403 tuyệt đối)
 */
export async function calculateBeatmapPP(beatmapId, options = {}) {
    let mapArrayBuffer = null;

    const urls = [
        `https://catboy.best/osu/${beatmapId}`,
        `https://sayobot.cn/osu/${beatmapId}`,
        `https://osu.ppy.sh/osu/${beatmapId}`
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (res.ok) {
                mapArrayBuffer = await res.arrayBuffer();
                break;
            }
        } catch (err) {
            continue;
        }
    }

    if (!mapArrayBuffer) return null;

    try {
        const mapBytes = new Uint8Array(mapArrayBuffer);
        const map = new rosu.Beatmap(mapBytes);
        
        // 🎯 Build Params chuẩn cho rosu-pp-js
        const perfParams = {};

        if (options.mods) perfParams.mods = options.mods;
        if (options.misses !== undefined) perfParams.misses = options.misses;

        // Nếu truyền n100 và n50
        if (options.n100 !== undefined) perfParams.n100 = options.n100;
        if (options.n50 !== undefined) perfParams.n50 = options.n50;
        if (options.n300 !== undefined) perfParams.n300 = options.n300;

        // BẮT BỘC truyền accuracy nếu có để rosu-pp không tự fallback về 100% SS
        if (options.accuracy !== undefined) {
            perfParams.accuracy = options.accuracy;
        }

        const calculator = new rosu.Performance(perfParams);
        const result = calculator.calculate(map);

        map.free();
        return result;
    } catch (error) {
        console.error("❌ Lỗi rosu-pp calculation:", error);
        return null;
    }
}
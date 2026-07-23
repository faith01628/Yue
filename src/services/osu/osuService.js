import axios from 'axios';
import 'dotenv/config';

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Tự động xin / gia hạn Access Token từ osu! API v2 (Client Credentials Grant)
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
 * 1. Lấy thông tin Profile Người chơi
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
 * 2. Lấy bài vừa chơi xong (Recent Play)
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
 * 3. Lấy danh sách Top Plays (Best Scores)
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
 * 4. Lấy điểm số của User trên 1 Beatmap cụ thể
 */
export async function getUserBeatmapScores(username, beatmapId, mode = 'osu') {
    try {
        const user = await getUserProfile(username, mode);
        if (!user) return null;

        const data = await fetchOsuAPI(`/beatmaps/${beatmapId}/scores/users/${user.id}`, { mode });
        const beatmap = await fetchOsuAPI(`/beatmaps/${beatmapId}`);

        return {
            user,
            beatmap,
            score: data.score || null
        };
    } catch (error) {
        console.error(`❌ Lỗi lấy Compare Score của ${username}:`, error.response?.data || error.message);
        return null;
    }
}
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
        const data = await fetchOsuAPI(`/users/${encodeURIComponent(username)}/${mode}`);
        if (data && data.id) {
            try {
                const { updateUserFromProfile } = await import('./userService.js');
                updateUserFromProfile(data);
            } catch {}
        }
        return data;
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

        const score = recents.length > 0 ? recents[0] : null;

        if (score && score.beatmap && score.passed) {
            try {
                const userScoresData = await getUserBeatmapScores(user.username, score.beatmap.id);
                if (userScoresData && userScoresData.scores && userScoresData.scores.length > 0) {
                    const matchedScore = userScoresData.scores.find(s => s.id === score.id || s.created_at === score.created_at || (s.score === score.score && s.max_combo === score.max_combo));
                    if (matchedScore && (matchedScore.position || matchedScore.rank_global)) {
                        score.position = matchedScore.position || matchedScore.rank_global;
                    }
                }
            } catch (e) {}
        }

        return {
            user,
            score
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

        const [allScoresRes, topScoreRes] = await Promise.all([
            axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores/users/${user.id}/all`, {
                headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
            }).catch(() => null),
            axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores/users/${user.id}`, {
                headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
            }).catch(() => null)
        ]);

        const scores = allScoresRes?.data?.scores || [];
        if (scores.length > 0 && topScoreRes?.data?.position) {
            scores[0].position = topScoreRes.data.position;
        }

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


const beatmapDetailCache = new Map();
const BEATMAP_DETAIL_TTL = 10 * 60 * 1000; // 10 phút

/**
 * 5. Lấy Beatmap Detail (Có RAM Cache 10 phút)
 */
export async function getBeatmapDetail(beatmapId) {
    if (!beatmapId) return null;
    const numId = Number(beatmapId);
    
    // Check RAM Cache
    const cached = beatmapDetailCache.get(numId);
    if (cached && (Date.now() - cached.timestamp < BEATMAP_DETAIL_TTL)) {
        return cached.detail;
    }

    try {
        const detail = await fetchOsuAPI(`/beatmaps/${numId}`);
        if (detail) {
            beatmapDetailCache.set(numId, { detail, timestamp: Date.now() });
            // Giới hạn RAM tối đa 500 bài
            if (beatmapDetailCache.size > 500) {
                const firstKey = beatmapDetailCache.keys().next().value;
                beatmapDetailCache.delete(firstKey);
            }
        }
        return detail;
    } catch (error) {
        console.error(`❌ Lỗi lấy thông tin Beatmap ${beatmapId}:`, error.response?.data || error.message);
        return null;
    }
}


/**
 * 6. Lấy Leaderboard (Hỗ trợ Global, Country VN, và Mod Filter)
 */
export async function getBeatmapLeaderboard(beatmapId, options = {}) {
    try {
        const { mode = 'osu', mods = [], country = null } = (typeof options === 'string') ? { mode: options } : options;
        const token = await getOsuToken();
        const headers = { Authorization: `Bearer ${token}` };

        const params = { mode };
        if (mods && mods.length > 0) {
            params['mods[]'] = mods;
        }

        const [scoresRes, beatmap] = await Promise.all([
            axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores`, {
                headers,
                params
            }).catch(() => null),
            fetchOsuAPI(`/beatmaps/${beatmapId}`)
        ]);

        let rawScores = scoresRes?.data?.scores || [];

        // Nếu lọc theo quốc gia (VN)
        if (country) {
            const countryUpper = country.toUpperCase();
            rawScores = rawScores.filter(s => s.user?.country_code === countryUpper);
        }

        return {
            beatmap,
            scores: rawScores
        };
    } catch (error) {
        console.error(`❌ Lỗi lấy Leaderboard của Beatmap ${beatmapId}:`, error.response?.data || error.message);
        return null;
    }
}

const beatmapBytesCache = new Map();

/**
 * 7. Tải file .osu và Tính toán PP bằng rosu-pp-js (Dùng fetch + Mirror + Cache RAM siêu tốc)
 */
export async function calculateBeatmapPP(beatmapId, options = {}) {
    let mapBytes = beatmapBytesCache.get(beatmapId);

    if (!mapBytes) {
        const urls = [
            `https://osu.direct/api/osu/${beatmapId}`,
            `https://osu.ppy.sh/osu/${beatmapId}`,
            `https://catboy.best/osu/${beatmapId}`,
            `https://sayobot.cn/osu/${beatmapId}`
        ];

        for (const url of urls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);

                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const buffer = await res.arrayBuffer();
                    mapBytes = new Uint8Array(buffer);
                    beatmapBytesCache.set(beatmapId, mapBytes);

                    // Giữ bộ nhớ RAM tối đa 500 bài gần nhất
                    if (beatmapBytesCache.size > 500) {
                        const firstKey = beatmapBytesCache.keys().next().value;
                        beatmapBytesCache.delete(firstKey);
                    }
                    break;
                }
            } catch (err) {
                continue;
            }
        }
    }

    if (!mapBytes) return null;

    try {
        const map = new rosu.Beatmap(mapBytes);

        // 🎯 Xử lý chuyển đổi Game Mode (0: std, 1: taiko, 2: catch, 3: mania)
        let targetMode = options.mode;
        if (typeof targetMode === 'string') {
            const mLower = targetMode.toLowerCase();
            if (mLower === 'osu' || mLower === 'std') targetMode = 0;
            else if (mLower === 'taiko') targetMode = 1;
            else if (mLower === 'catch' || mLower === 'fruits' || mLower === 'ctb') targetMode = 2;
            else if (mLower === 'mania') targetMode = 3;
            else targetMode = undefined;
        }
        if (typeof targetMode === 'number' && targetMode >= 0 && targetMode <= 3) {
            if (map.mode !== targetMode) {
                try {
                    map.convert(targetMode);
                } catch (convErr) {
                    console.warn(`[rosu-pp] Không thể convert map sang mode ${targetMode}:`, convErr.message);
                }
            }
        }
        
        // 🎯 Build Params chuẩn cho rosu-pp-js
        const perfParams = {
            lazer: false // osu! Bancho Multiplayer dùng hệ thống chấm điểm Classic (Stable)
        };

        if (options.mods !== undefined && options.mods !== null) {
            perfParams.mods = Array.isArray(options.mods) ? options.mods.join('') : options.mods;
        }
        if (options.misses !== undefined) perfParams.misses = options.misses;
        if (options.combo !== undefined && options.combo !== null) perfParams.combo = options.combo;

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

        // 🌟 Nếu Mod có chứa Relax (RX) hoặc AutoPilot (AP):
        // rosu-pp sẽ tính stars của skill RX/AP bị giảm mạnh (ví dụ từ 9.76★ xuống 5.06★).
        // Để giữ đúng Star Rating hiển thị thực tế của Map (như khi đánh DT/HR), ta tính thêm difficulty không có RX/AP.
        const rawModsStr = String(perfParams.mods || '');
        if (/RX|Relax|AP|Autopilot/i.test(rawModsStr)) {
            const modsWithoutRxAp = rawModsStr
                .replace(/RX|Relax|AP|Autopilot/gi, '')
                .trim();

            try {
                const pureCalc = new rosu.Performance({
                    ...perfParams,
                    mods: modsWithoutRxAp
                });
                const pureRes = pureCalc.calculate(map);
                const pureStars = pureRes.difficulty?.stars ?? pureRes.stars;

                if (typeof pureStars === 'number' && !isNaN(pureStars) && pureStars > 0) {
                    if (result.difficulty) {
                        result.difficulty.stars = pureStars;
                    }
                    result.stars = pureStars;
                }
            } catch (pErr) {
                console.warn('[rosu-pp] Lỗi tính Pure Star Rating không có RX/AP:', pErr.message);
            }
        }

        map.free();
        return result;
    } catch (error) {
        console.error("❌ Lỗi rosu-pp calculation:", error);
        return null;
    }
}

export function toOsuApiRuleset(rawMode) {
    if (!rawMode) return 'osu';
    const s = String(rawMode).toLowerCase().trim();
    if (s === '1' || s === 'taiko') return 'taiko';
    if (s === '2' || s === 'catch' || s === 'ctb' || s === 'fruits') return 'fruits';
    if (s === '3' || s === 'mania') return 'mania';
    return 'osu';
}

/**
 * 7.1. Lấy Score ID và thông tin Score của User trên 1 Beatmap (từ osu! API v2)
 */
export async function getUserBeatmapScoreDetail(beatmapId, userId, mode = 'osu') {
    if (!beatmapId || !userId) return null;
    const apiMode = toOsuApiRuleset(mode);

    try {
        const token = await getAccessToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // 1. Thử lấy từ /all để lấy được score mới nhất của user trên map này
        const allRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores/users/${userId}/all`, {
            headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            params: { mode: apiMode },
            timeout: 3000
        }).catch(() => null);

        if (Array.isArray(allRes?.data?.scores) && allRes.data.scores.length > 0) {
            const scores = allRes.data.scores;
            scores.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            if (scores[0]?.id) return scores[0];
        }

        // 2. Thử lấy từ Recent Plays (nếu vừa đánh xong trong phòng multi)
        const recentRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${userId}/scores/recent`, {
            headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            params: { include_fails: 0, limit: 5, mode: apiMode },
            timeout: 3000
        }).catch(() => null);

        if (Array.isArray(recentRes?.data)) {
            const match = recentRes.data.find(s => String(s.beatmap?.id) === String(beatmapId) || String(s.beatmap_id) === String(beatmapId));
            if (match && match.id) {
                return match;
            }
        }

        // 3. Fallback: Lấy Personal Best trên map đó
        const pbRes = await axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores/users/${userId}`, {
            headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            params: { mode: apiMode },
            timeout: 3000
        }).catch(() => null);

        if (pbRes?.data?.score?.id) {
            return pbRes.data.score;
        }

        return null;
    } catch (err) {
        return null;
    }
}

/**
 * 8. Lấy thông tin Match Multiplayer từ osu! API v2
 */
export async function getMatchDetails(matchId) {
    if (!matchId) return null;
    const numId = Number(matchId);
    try {
        const matchData = await fetchOsuAPI(`/matches/${numId}`);
        return matchData;
    } catch (error) {
        console.error(`❌ Lỗi lấy Match Details cho ID ${matchId}:`, error.response?.data || error.message);
        
        // Fallback thử với osu! API v1 nếu v2 lỗi
        try {
            const apiKey = process.env.OSU_API_KEY;
            if (apiKey) {
                const res = await axios.get(`https://osu.ppy.sh/api/get_match`, {
                    params: { k: apiKey, mp: numId }
                });
                if (res.data && res.data.match) {
                    return res.data;
                }
            }
        } catch (v1Err) {
            console.error(`❌ Fallback API v1 get_match cũng thất bại cho ID ${matchId}:`, v1Err.message);
        }
        return null;
    }
}


/**
 * 9. Lấy toàn bộ lượt chơi gần đây của User trên 1 Beatmap (CHỈ lấy từ /scores/recent giống lệnh .rs/.r)
 * Tuyệt đối KHÔNG lấy từ /beatmaps/{id}/scores/users/{uid} để tránh lấy nhầm Personal Best cũ từ nhiều tháng trước.
 */
export async function getUserBeatmapPlays(beatmapId, userId, mode = 'osu') {
    if (!beatmapId || !userId) return [];
    const apiMode = toOsuApiRuleset(mode);
    const plays = new Map();

    try {
        const recents = await fetchOsuAPI(`/users/${userId}/scores/recent`, {
            include_fails: 0,
            limit: 20,
            mode: apiMode
        });

        if (Array.isArray(recents)) {
            for (const s of recents) {
                if (!s) continue;
                const bid = s.beatmap?.id ?? s.beatmap_id;
                if (String(bid) !== String(beatmapId)) continue;
                const time = new Date(s.ended_at || s.created_at || 0).getTime();
                const key = s.id || `${s.score}_${time}`;
                plays.set(key, {
                    id: s.id || null,
                    pp: typeof s.pp === 'number' && s.pp > 0 ? s.pp : null,
                    score: s.total_score ?? s.score ?? null,
                    accuracy: s.accuracy ?? null,
                    maxCombo: s.max_combo ?? null,
                    mods: s.mods || [],
                    statistics: s.statistics || {},
                    time
                });
            }
        }
    } catch {
        // ignore - caller handles fallback
    }

    return Array.from(plays.values());
}

/**
 * 10. Raw recent scores (same source as the in-game .r / .rs command) filtered to one beatmap.
 * Returns newest first. Each item is the raw osu! API v2 score object.
 */
export async function getRecentScoresOnBeatmap(userId, beatmapId, mode = 'osu') {
    if (!userId || !beatmapId) return [];
    try {
        const recents = await fetchOsuAPI(`/users/${userId}/scores/recent`, {
            include_fails: 1,
            limit: 25,
            mode: toOsuApiRuleset(mode)
        });
        if (!Array.isArray(recents)) return [];
        return recents
            .filter(s => String(s.beatmap?.id ?? s.beatmap_id) === String(beatmapId))
            .sort((a, b) => new Date(b.ended_at || b.created_at) - new Date(a.ended_at || a.created_at));
    } catch {
        return [];
    }
}

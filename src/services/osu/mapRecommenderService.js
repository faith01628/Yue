import axios from 'axios';
import { getOsuToken } from './osuService.js';

// RAM Cache cho danh sách Collection từ osu!Collector (TTL = 10 phút)
const collectorCache = new Map();
const COLLECTOR_CACHE_TTL = 10 * 60 * 100// Bảng mapping từ khóa 10 kỹ năng chuẩn cho osu!Collector & osu! API v2
const SKILL_SEARCH_MAP = {
    stream: { collector: 'stream', apiV2: 'stream' },
    jump: { collector: 'jump', apiV2: 'jump' },
    tech: { collector: 'tech', apiV2: 'tech' },
    fingercontrol: { collector: 'finger control', apiV2: 'burst' },
    reading: { collector: 'reading', apiV2: 'low ar' },
    gimmick: { collector: 'gimmick', apiV2: 'alt' },
    flowaim: { collector: 'flow aim', apiV2: 'flow' },
    speed: { collector: 'speed', apiV2: 'high bpm' },
    precision: { collector: 'precision', apiV2: 'hr' },
    farm: { collector: 'farm', apiV2: 'tv size' }
};

/**
 * Kiểm tra tiêu chuẩn Base Stat (AR, CS, HP, BPM) chuẩn cao thủ cho từng Main Mod (DT / HR / NM)
 */
function isPlayableFarmMap(b, mainMod, userProfile) {
    const ar = b.ar !== undefined ? b.ar : 9.0;
    const cs = b.cs !== undefined ? b.cs : 4.0;
    const hp = b.drain !== undefined ? b.drain : (b.hp !== undefined ? b.hp : 5.0);
    const bpm = b.bpm || 0;

    if (mainMod === 'DT') {
        // DT Mod:
        // - Base AR: Lý tưởng 8.0 - 8.8 (đổi sang DT = AR 9.67 - 10.2). Tránh Base AR >= 9.0 (thành AR 10.33+) trừ khi reaction skill > 60.
        const maxBaseAr = (userProfile?.skills?.reaction || 0) > 60 ? 9.1 : 8.8;
        if (ar > maxBaseAr) return false;
        // - Base BPM: Lý tưởng 120 - 180 (đổi sang DT = 180 - 270 BPM). Tránh Base BPM > 195 (thành 300+ BPM khó farm).
        if (bpm > 195) return false;
    } else if (mainMod === 'HR') {
        // HR Mod:
        // - Base CS: Lý tưởng 3.0 - 4.2. CS sau HR không được vượt quá 5.8 (tránh CS 6.5+ quá nhỏ không aim nổi).
        if (cs > 4.3) return false;
        // - Base HP: Lý tưởng 4.0 - 6.0. Tránh Base HP > 6.5 (sau HR thành HP 9.1+ lỡ 1-2 nốt là fail map).
        if (hp > 6.5) return false;
    } else if (mainMod === 'NM') {
        // NM (NoMod):
        // - AR: Lý tưởng 9.0 - 9.8 (tránh AR >= 10.0 khó đọc cho NoMod thuần).
        if (ar > 10.0) return false;
        // - CS: Không quá 5.8.
        if (cs > 5.8) return false;
        // - HP: Không vượt quá 7.0.
        if (hp > 7.0) return false;
    }

    return true;
}

/**
 * Tìm kiếm beatmap phù hợp theo các tiêu chí kỹ năng và độ khó từ osu!Collector & osu! API v2
 * @param {object} filters 
 * @param {string} [filters.skill] - 10 thể loại: stream, jump, tech, fingercontrol, farm, reading, gimmick, flowaim, speed, precision
 * @param {number} [filters.targetBpm] - BPM mục tiêu
 * @param {number} [filters.targetPp] - Target PP mục tiêu (Kiểu Tillerino bot)
 * @param {number} [filters.minStars] - Sao tối thiểu
 * @param {number} [filters.maxStars] - Sao tối đa
 * @param {number} [filters.maxLength] - Độ dài tối đa (giây)
 * @returns {Promise<object|null>} Trả về { beatmapId, beatmapsetId, title, version, stars, bpm }
 */
export async function recommendBeatmap(filters = {}) {
    let skill = (filters.skill || '').toLowerCase().trim();
    let minStars = typeof filters.minStars === 'number' ? filters.minStars : 5.0;
    let maxStars = typeof filters.maxStars === 'number' ? filters.maxStars : 6.0;
    const targetBpm = filters.targetBpm || null;
    let maxLength = filters.maxLength || null;
    const userProfile = filters.userProfile || null;
    const userSkills = userProfile?.skills || null;
    const excludeIds = Array.isArray(filters.excludeBeatmapIds) ? filters.excludeBeatmapIds.map(Number) : [];
    const targetPp = filters.targetPp || null;

    // Trích xuất Mod yêu cầu từ câu lệnh (ví dụ: .pm farm dt / .pm hr) hoặc dùng Main Mod từ profile (DT / HR / NM)
    let mainMod = filters.requestedMod || 'NM';
    if (!filters.requestedMod && userProfile) {
        if ((userProfile.dtRatio || 0) >= 40) mainMod = 'DT';
        else if ((userProfile.hrRatio || 0) >= 30) mainMod = 'HR';
    }

    const isFarmMap = skill === 'farm' || filters.isFarm;

    // 💡 1. TILLERINO-STYLE PP FARM RECOMMENDATION ENGINE
    if (!filters.stars && !targetPp && userProfile && isFarmMap) {
        if (userProfile.topPp && typeof userProfile.topPp === 'number') {
            const recommendedTargetPp = Math.round(userProfile.topPp * 1.03);
            const approxStars = Math.pow(recommendedTargetPp / 8.0, 0.45);
            minStars = parseFloat(Math.max(1.0, approxStars - 0.35).toFixed(2));
            maxStars = parseFloat((approxStars + 0.35).toFixed(2));
            console.log(`🎯 [Tillerino Farm Engine] User Top PP: ${userProfile.topPp}PP -> Gợi ý mốc Target: ~${recommendedTargetPp}PP (${minStars}-${maxStars}★)`);
        }
    }

    // 💡 2. GỢI Ý MẶC ĐỊNH DỰA TRÊN THẾ MẠNH DỮ LIỆU .ST NẾU NGƯỜI DÙNG KHÔNG NHẬP SKILL
    if (!skill && userSkills) {
        if (userSkills.speed >= userSkills.precision && userSkills.speed >= 45) {
            skill = 'jump';
        } else if (userSkills.precision > userSkills.speed) {
            skill = 'precision';
        }
    }

    console.log(`🔍 [mapRecommenderService] Lọc map: Skill=${skill || 'Any'}, IsFarm=${isFarmMap}, Mod=${mainMod}, Stars=${minStars.toFixed(2)}-${maxStars.toFixed(2)}★, BPM=${targetBpm || 'Any'}, TargetPP=${targetPp || 'N/A'}, MaxLen=${maxLength || 'Any'}s`);

    // BƯỚC 1: TÌM KIẾM TỪ OSU!COLLECTOR API (CÓ RAM CACHE + TIMEOUT FAST 1.8S)
    try {
        const skillInfo = SKILL_SEARCH_MAP[skill] || { collector: skill || 'farm', apiV2: skill || 'tv size' };
        let collectorSearchTerm = skillInfo.collector;

        let collections = null;
        const cachedCol = collectorCache.get(collectorSearchTerm);
        if (cachedCol && (Date.now() - cachedCol.timestamp < COLLECTOR_CACHE_TTL)) {
            collections = cachedCol.collections;
            console.log(`⚡ [mapRecommenderService] Hit RAM Cache osu!Collector cho keyword: "${collectorSearchTerm}"`);
        } else {
            const collectorRes = await axios.get(`https://osucollector.com/api/collections/search`, {
                params: {
                    keywords: collectorSearchTerm,
                    perPage: 15
                },
                timeout: 1800
            }).catch(() => null);

            if (collectorRes?.data?.collections && collectorRes.data.collections.length > 0) {
                collections = collectorRes.data.collections;
                collectorCache.set(collectorSearchTerm, { collections, timestamp: Date.now() });
            }
        }

        if (collections && collections.length > 0) {
            let candidateBeatmaps = [];
            for (const col of collections.slice(0, 6)) {
                if (col.beatmaps && Array.isArray(col.beatmaps)) {
                    candidateBeatmaps.push(...col.beatmaps);
                }
            }

            // Lọc candidateBeatmaps theo star rating, BPM, length, chống trùng ID VÀ Tiêu chuẩn Base Stat Mod (chỉ khi lọc farm)
            let matched = candidateBeatmaps.filter(b => {
                const bId = Number(b.id || b.beatmapId || 0);
                const sr = b.difficulty_rating || b.starRating || 0;
                const bpm = b.bpm || 0;
                const len = b.total_length || b.hit_length || 0;

                const passStars = sr >= (minStars - 0.25) && sr <= (maxStars + 0.25);
                const passBpm = !targetBpm || Math.abs(bpm - targetBpm) <= 15;
                const passLength = !maxLength || len <= (maxLength + 30);
                const isNotExcluded = !excludeIds.includes(bId);
                const passModStat = isFarmMap ? isPlayableFarmMap(b, mainMod, userProfile) : true;

                return passStars && passBpm && passLength && isNotExcluded && passModStat;
            });

            // Nếu lọc quá chặt làm trống danh sách, thả lỏng bớt passModStat để luôn có kết quả
            if (matched.length === 0) {
                matched = candidateBeatmaps.filter(b => {
                    const bId = Number(b.id || b.beatmapId || 0);
                    const sr = b.difficulty_rating || b.starRating || 0;
                    const bpm = b.bpm || 0;
                    const len = b.total_length || b.hit_length || 0;
                    return sr >= (minStars - 0.25) && sr <= (maxStars + 0.25) && (!targetBpm || Math.abs(bpm - targetBpm) <= 15) && (!maxLength || len <= (maxLength + 30)) && !excludeIds.includes(bId);
                });
            }

            if (matched.length > 0) {
                const chosen = matched[Math.floor(Math.random() * matched.length)];
                const beatmapId = chosen.id || chosen.beatmapId;
                if (beatmapId) {
                    console.log(`✅ [mapRecommenderService] Đã chọn map từ osu!Collector: ID=${beatmapId} (Mod: ${mainMod})`);
                    return {
                        beatmapId: beatmapId,
                        source: 'osu!Collector'
                    };
                }
            }
        }
    } catch (collectorErr) {
        console.warn('⚠️ [mapRecommenderService] Lỗi kết nối osu!Collector API, chuyển sang osu! API v2 search:', collectorErr.message);
    }

    // BƯỚC 2: FALLBACK SỬ DỤNG OSU! API V2 BEATMAPSETS SEARCH
    try {
        const token = await getOsuToken();
        if (!token) return null;

        const skillInfo = SKILL_SEARCH_MAP[skill] || { apiV2: skill || 'tv size' };
        const searchQuery = skillInfo.apiV2;

        const apiRes = await axios.get('https://osu.ppy.sh/api/v2/beatmapsets/search', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            params: {
                q: searchQuery,
                s: 'ranked',
                m: 0 // osu! standard
            },
            timeout: 2500
        });

        const beatmapsets = apiRes.data?.beatmapsets || [];
        let matchingBeatmaps = [];

        for (const set of beatmapsets) {
            if (!set.beatmaps) continue;
            for (const b of set.beatmaps) {
                if (b.mode !== 'osu') continue;
                const bId = Number(b.id || 0);
                const sr = b.difficulty_rating || 0;
                const bpm = b.bpm || set.bpm || 0;
                const len = b.total_length || 0;

                const passStars = sr >= minStars && sr <= maxStars;
                const passBpm = !targetBpm || Math.abs(bpm - targetBpm) <= 20;
                const passLength = !maxLength || len <= (maxLength + 30);
                const isNotExcluded = !excludeIds.includes(bId);
                const passModStat = isFarmMap ? isPlayableFarmMap(b, mainMod, userProfile) : true;

                if (passStars && passBpm && passLength && isNotExcluded && passModStat) {
                    matchingBeatmaps.push({
                        beatmapId: b.id,
                        beatmapsetId: set.id,
                        title: set.title,
                        version: b.version,
                        stars: sr,
                        bpm: bpm,
                        source: 'osu! API v2'
                    });
                }
            }
        }

        if (matchingBeatmaps.length > 0) {

            const chosen = matchingBeatmaps[Math.floor(Math.random() * matchingBeatmaps.length)];
            console.log(`✅ [mapRecommenderService] Đã chọn map từ osu! API v2: ID=${chosen.beatmapId} (${chosen.title} [${chosen.version}]) (Mod: ${mainMod})`);
            return chosen;
        }
    } catch (apiErr) {
        console.error('❌ [mapRecommenderService] Lỗi search osu! API v2:', apiErr.message);
    }

    return null;
}




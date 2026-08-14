import axios from 'axios';
import { getOsuToken } from './osuService.js';

/**
 * Tìm kiếm beatmap phù hợp theo các tiêu chí kỹ năng và độ khó từ osu!Collector & osu! API v2
 * @param {object} filters 
 * @param {string} [filters.skill] - Thể loại skill: stream, jump, tech, fingercontrol, farm, reading, gimmick, flowaim
 * @param {number} [filters.targetBpm] - BPM mục tiêu
 * @param {number} [filters.minStars] - Sao tối thiểu
 * @param {number} [filters.maxStars] - Sao tối đa
 * @param {number} [filters.maxLength] - Độ dài tối đa (giây)
 * @returns {Promise<object|null>} Trả về { beatmapId, beatmapsetId, title, version, stars, bpm }
 */
export async function recommendBeatmap(filters = {}) {
    let skill = (filters.skill || '').toLowerCase().trim();
    const minStars = typeof filters.minStars === 'number' ? filters.minStars : 5.0;
    const maxStars = typeof filters.maxStars === 'number' ? filters.maxStars : 6.0;
    const targetBpm = filters.targetBpm || null;
    let maxLength = filters.maxLength || null;
    const userProfile = filters.userProfile || null;
    const userSkills = userProfile?.skills || null;
    const excludeIds = Array.isArray(filters.excludeBeatmapIds) ? filters.excludeBeatmapIds.map(Number) : [];

    // 💡 LOGIC THÔNG MINH DỰA TRÊN KỸ NĂNG NGƯỜI DÙNG (SKILL-AWARE MATCHING)
    if (userSkills) {
        // Nếu stamina kém (< 40) và người dùng KHÔNG chủ động yêu cầu map stream/dài:
        if (userSkills.stamina < 40 && skill !== 'stream') {
            // Giới hạn thời lượng map dưới 110s (TV Size / Short Burst) để tránh fail vì hết stamina!
            if (!maxLength || maxLength > 120) {
                maxLength = 110;
                console.log(`💡 [mapRecommenderService] Stamina của user yếu (${userSkills.stamina}/100) -> Tự động giới hạn độ dài map <= 110s (TV Size)`);
            }
        }

        // Nếu người dùng không nhập skill cụ thể hoặc yêu cầu "farm", chọn thể loại phù hợp nhất với điểm mạnh:
        if (!skill || skill === 'farm') {
            if (userSkills.speed >= userSkills.precision && userSkills.speed >= 45) {
                skill = 'jump'; // Mạnh tốc độ/aim -> chọn Jump/DT farm
            } else if (userSkills.precision > userSkills.speed) {
                skill = 'precision'; // Mạnh độ chính xác -> chọn Precision/HR farm
            }
        }
    }

    console.log(`🔍 [mapRecommenderService] Đang lọc map với điều kiện: Skill=${skill || 'Any'}, Stars=${minStars.toFixed(2)}-${maxStars.toFixed(2)}★, BPM=${targetBpm || 'Any'}, MaxLen=${maxLength || 'Any'}s, ExcludeCount=${excludeIds.length}`);

    // BƯỚC 1: THỬ TÌM KIẾM TỪ OSU!COLLECTOR API (CÓ TAG SKILL CHUẨN TỪ CỘNG ĐỒNG)
    try {
        let collectorSearchTerm = skill ? `${skill}` : 'farm';
        if (userSkills && userSkills.stamina < 40 && !skill.includes('stream')) {
            collectorSearchTerm = 'tv size';
        }

        const collectorRes = await axios.get(`https://osucollector.com/api/collections/search`, {
            params: {
                keywords: collectorSearchTerm,
                perPage: 15
            },
            timeout: 5000
        }).catch(() => null);

        if (collectorRes?.data?.collections && collectorRes.data.collections.length > 0) {
            // Lấy danh sách beatmaps từ các collection phù hợp nhất
            const collections = collectorRes.data.collections;
            let candidateBeatmaps = [];

            for (const col of collections.slice(0, 5)) {
                if (col.beatmaps && Array.isArray(col.beatmaps)) {
                    candidateBeatmaps.push(...col.beatmaps);
                }
            }

            // Lọc candidateBeatmaps theo điều kiện star rating, BPM, length VÀ chống trùng ID
            let matched = candidateBeatmaps.filter(b => {
                const bId = Number(b.id || b.beatmapId || 0);
                const sr = b.difficulty_rating || b.starRating || 0;
                const bpm = b.bpm || 0;
                const len = b.total_length || b.hit_length || 0;

                const passStars = sr >= (minStars - 0.2) && sr <= (maxStars + 0.2);
                const passBpm = !targetBpm || Math.abs(bpm - targetBpm) <= 15;
                const passLength = !maxLength || len <= (maxLength + 30);
                const isNotExcluded = !excludeIds.includes(bId);

                return passStars && passBpm && passLength && isNotExcluded;
            });

            // Nếu lọc chống trùng làm trống danh sách, fallback thả lỏng chống trùng để luôn có kết quả
            if (matched.length === 0) {
                matched = candidateBeatmaps.filter(b => {
                    const sr = b.difficulty_rating || b.starRating || 0;
                    const bpm = b.bpm || 0;
                    const len = b.total_length || b.hit_length || 0;
                    return sr >= (minStars - 0.2) && sr <= (maxStars + 0.2) && (!targetBpm || Math.abs(bpm - targetBpm) <= 15) && (!maxLength || len <= (maxLength + 30));
                });
            }

            if (matched.length > 0) {
                const chosen = matched[Math.floor(Math.random() * matched.length)];
                const beatmapId = chosen.id || chosen.beatmapId;
                if (beatmapId) {
                    console.log(`✅ [mapRecommenderService] Đã chọn map từ osu!Collector: ID=${beatmapId} (Anti-Repick Active)`);
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

        // Xây dựng query search dựa trên skill
        let searchQuery = skill;
        if (skill === 'farm') searchQuery = 'tv size';
        if (skill === 'stream') searchQuery = 'stream';
        if (skill === 'tech') searchQuery = 'tech';
        if (skill === 'jump') searchQuery = 'jump';

        const apiRes = await axios.get('https://osu.ppy.sh/api/v2/beatmapsets/search', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            params: {
                q: searchQuery,
                s: 'ranked',
                m: 0 // osu! standard
            },
            timeout: 5000
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

                if (passStars && passBpm && passLength && isNotExcluded) {
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
            console.log(`✅ [mapRecommenderService] Đã chọn map từ osu! API v2: ID=${chosen.beatmapId} (${chosen.title} [${chosen.version}]) (Anti-Repick Active)`);
            return chosen;
        }
    } catch (apiErr) {
        console.error('❌ [mapRecommenderService] Lỗi search osu! API v2:', apiErr.message);
    }

    return null;
}

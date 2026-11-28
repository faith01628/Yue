import { calculateBeatmapPP, getUserTopPlays } from '../osu/osuService.js';
import { t } from '../../locales/index.js';
import {
    sendBeatmapInfoAndDL,
    buildDownloadLinks,
    parseRandomArgs,
    fetchRandomBeatmap
} from '../../commands/osuInGame/mapCommands.js';
import { setUserLastMap } from './pmState.js';

const MOD_NAME_MAP = {
    hidden: 'HD',
    hd: 'HD',
    doubletime: 'DT',
    dt: 'DT',
    nightcore: 'NC',
    nc: 'NC',
    hardrock: 'HR',
    hr: 'HR',
    flashlight: 'FL',
    fl: 'FL',
    easy: 'EZ',
    ez: 'EZ',
    halftime: 'HT',
    ht: 'HT',
    nofail: 'NF',
    nf: 'NF',
    spunout: 'SO',
    so: 'SO',
    suddendeath: 'SD',
    sd: 'SD',
    perfect: 'PF',
    pf: 'PF'
};

function formatShortTitle(title, maxLength = 25) {
    if (!title) return 'Beatmap';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3).trim() + '...';
}

/**
 * Phân tích tin nhắn /np từ osu! client (hỗ trợ CTCP ACTION và mod kèm theo)
 * @param {string} rawMessage
 * @returns {{ beatmapId: string, mods: string[] } | null}
 */
export function parseNpMessage(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') return null;

    const hasActionWrapper = /^\x01ACTION\b/i.test(rawMessage);
    const cleaned = rawMessage
        .replace(/^\x01ACTION\s+/i, '')
        .replace(/\x01$/g, '')
        .trim();

    const isNpAction = hasActionWrapper
        || /^(?:is\s+)?(?:listening to|playing|editing|watching)\b/i.test(cleaned);
    if (!isNpAction) return null;

    const idMatch = cleaned.match(/osu\.ppy\.sh\/(?:b|beatmaps)\/(\d+)/i);
    if (!idMatch || !idMatch[1]) return null;

    const beatmapId = idMatch[1];

    // Trích xuất phần text sau link đóng ngoặc `]` (nếu có) để bắt mods như `+Hidden +DoubleTime` hoặc `+HDDT`
    const afterLinkIdx = cleaned.lastIndexOf(']');
    const tail = afterLinkIdx !== -1 ? cleaned.slice(afterLinkIdx + 1) : '';
    const modSet = new Set();

    const modTokens = tail.match(/\+[A-Za-z]+/g) || [];
    for (const token of modTokens) {
        const rawMod = token.slice(1).toLowerCase();
        if (MOD_NAME_MAP[rawMod]) {
            modSet.add(MOD_NAME_MAP[rawMod]);
        } else if (rawMod.length >= 2 && rawMod.length % 2 === 0) {
            // Tách chuỗi mod viết liền dạng +HDDT, +HRHD
            let allValid = true;
            const chunked = [];
            for (let i = 0; i < rawMod.length; i += 2) {
                const pair = rawMod.slice(i, i + 2);
                if (MOD_NAME_MAP[pair]) {
                    chunked.push(MOD_NAME_MAP[pair]);
                } else {
                    allValid = false;
                    break;
                }
            }
            if (allValid) {
                chunked.forEach(m => modSet.add(m));
            }
        }
    }

    return {
        beatmapId,
        mods: Array.from(modSet)
    };
}

async function fetchBeatmapMetadata(beatmapId) {
    const apiKey = process.env.OSU_API_KEY;
    if (apiKey) {
        try {
            const res = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmapId}`);
            const data = await res.json();
            if (data && data.length > 0) return data[0];
        } catch (err) {
            console.error('[PM Map Metadata v1 Error]:', err.message);
        }
    }

    try {
        const resCat = await fetch(`https://catboy.best/api/v2/b/${beatmapId}`);
        const dataCat = await resCat.json();
        if (dataCat && (dataCat.id || dataCat.beatmapset_id)) {
            return {
                beatmapset_id: dataCat.beatmapset_id || dataCat.beatmapset?.id || dataCat.setId,
                title: dataCat.title || dataCat.beatmapset?.title || 'Beatmap',
                version: dataCat.version || '',
                difficultyrating: dataCat.difficulty_rating || dataCat.stars || 0,
                diff_overall: dataCat.accuracy || dataCat.od || 8,
                diff_approach: dataCat.ar || 9,
                diff_drain: dataCat.hp || 6,
                diff_size: dataCat.cs || 4,
                max_combo: dataCat.max_combo || 0
            };
        }
    } catch (err) {
        console.error('[PM Map Metadata Catboy Error]:', err.message);
    }

    return null;
}

/**
 * Xử lý lệnh /np gửi qua tin nhắn riêng PM
 */
export async function handlePmNowPlaying(replyTarget, rawMessage, senderUsername) {
    const parsed = parseNpMessage(rawMessage);
    if (!parsed) return false;

    const { beatmapId, mods } = parsed;
    setUserLastMap(senderUsername, beatmapId);

    if (mods.length === 0) {
        return await sendBeatmapInfoAndDL(replyTarget, beatmapId, { force: true });
    }

    const bm = await fetchBeatmapMetadata(beatmapId);
    if (!bm) {
        return await sendBeatmapInfoAndDL(replyTarget, beatmapId, { force: true });
    }

    const setId = bm.beatmapset_id;
    const shortTitle = formatShortTitle(bm.title, 20);
    const diffName = bm.version ? `[${bm.version}]` : '';
    let stars = parseFloat(bm.difficultyrating || 0).toFixed(2);
    let combo = bm.max_combo ? `${bm.max_combo}x` : '?x';

    const ar = parseFloat(bm.diff_approach || 0).toFixed(1);
    const od = parseFloat(bm.diff_overall || 0).toFixed(1);
    const hp = parseFloat(bm.diff_drain || 0).toFixed(1);
    const cs = parseFloat(bm.diff_size || 0).toFixed(1);

    let estimatedSS = '?';
    let estimated99 = '?';
    let estimated95 = '?';

    try {
        const [ssRes, p99Res, p95Res] = await Promise.all([
            calculateBeatmapPP(beatmapId, { accuracy: 100, mods }),
            calculateBeatmapPP(beatmapId, { accuracy: 99, mods }),
            calculateBeatmapPP(beatmapId, { accuracy: 95, mods })
        ]);

        if (ssRes && ssRes.pp !== undefined) {
            estimatedSS = Math.round(ssRes.pp);
            if (ssRes.difficulty?.stars) stars = ssRes.difficulty.stars.toFixed(2);
            if (ssRes.difficulty?.maxCombo) combo = `${ssRes.difficulty.maxCombo}x`;
        }
        if (p99Res && p99Res.pp !== undefined) estimated99 = Math.round(p99Res.pp);
        if (p95Res && p95Res.pp !== undefined) estimated95 = Math.round(p95Res.pp);
    } catch (calcErr) {
        console.error('[PM /np PP Error]:', calcErr.message);
        return await sendBeatmapInfoAndDL(replyTarget, beatmapId, { force: true });
    }

    const modsStr = mods.join('');
    const mapTitleLink = `[https://osu.ppy.sh/b/${beatmapId} ${shortTitle} ${diffName}]`;
    const ppStr = estimated99 !== '?'
        ? `SS: ${estimatedSS}pp | 99%: ${estimated99}pp | 95%: ${estimated95}pp`
        : `SS: ${estimatedSS}pp | 95%: ${estimated95}pp`;

    const infoLine = `YUE MAP: ${mapTitleLink} +${modsStr} (${stars}★) | ${ppStr} | AR${ar} OD${od} HP${hp} CS${cs} | Combo: ${combo}`;
    const linkLine = `YUE DL: ${buildDownloadLinks(setId, beatmapId)}`;

    await replyTarget.sendMessage(infoLine);
    await new Promise(resolve => setTimeout(resolve, 300));
    await replyTarget.sendMessage(linkLine);
    return true;
}

/**
 * Gợi ý map qua PM (.rec / .rnd / .random), tự ước lượng tầm sao từ Top Play nếu không nhập sao
 */
export async function handlePmRecommend(replyTarget, args, senderUsername, lang = 'en') {
    const options = parseRandomArgs(args);

    if (options.stars === null && senderUsername) {
        try {
            const topData = await getUserTopPlays(senderUsername, 20);
            const scores = topData?.bestScores || [];
            const ratings = scores
                .map(s => parseFloat(s.beatmap?.difficulty_rating))
                .filter(v => !isNaN(v) && v > 0);

            if (ratings.length > 0) {
                const avgStar = ratings.reduce((sum, val) => sum + val, 0) / ratings.length;
                options.stars = Math.max(2.5, Math.min(8.0, Number(avgStar.toFixed(2))));
            } else {
                options.stars = Number((4.0 + Math.random() * 1.5).toFixed(2));
            }
        } catch {
            options.stars = Number((4.0 + Math.random() * 1.5).toFixed(2));
        }
    }

    const map = await fetchRandomBeatmap(options, 0.0, 10.0);
    if (!map || !map.beatmap_id) {
        const starsLabel = options.stars ? `~${options.stars}★` : null;
        return await replyTarget.sendMessage(t('pm.recommendNotFound', lang, starsLabel));
    }

    setUserLastMap(senderUsername, map.beatmap_id);
    return await sendBeatmapInfoAndDL(replyTarget, map.beatmap_id, { force: true });
}

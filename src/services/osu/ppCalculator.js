import rosu from 'rosu-pp-js';

// Cache .osu file text in memory (max 100 maps)
const beatmapCache = new Map();

async function getOsuFileContent(beatmapId) {
    const idStr = String(beatmapId);
    if (beatmapCache.has(idStr)) {
        return beatmapCache.get(idStr);
    }

    const urls = [
        `https://osu.ppy.sh/osu/${beatmapId}`,
        `https://catboy.best/osu/${beatmapId}`,
        `https://sayobot.cn/osu/${beatmapId}`
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'yue-ai-bot/1.0' },
                signal: AbortSignal.timeout(4000)
            });
            if (res.ok) {
                const text = await res.text();
                if (text && text.includes('osu file format')) {
                    if (beatmapCache.size >= 100) {
                        const firstKey = beatmapCache.keys().next().value;
                        beatmapCache.delete(firstKey);
                    }
                    beatmapCache.set(idStr, text);
                    return text;
                }
            }
        } catch (e) {
            // try next mirror
        }
    }
    return null;
}

/**
 * Tính toán PP chính xác bằng rosu-pp (Rust binding sang WASM - thuật toán chuẩn Discord bot)
 */
export async function calculateExactPP(beatmapId, mods = 0) {
    const content = await getOsuFileContent(beatmapId);
    if (!content) return null;

    let map = null;
    try {
        map = new rosu.Beatmap(content);
        
        const ssObj = new rosu.Performance({ mods, accuracy: 100 }).calculate(map);
        const p99Obj = new rosu.Performance({ mods, accuracy: 99 }).calculate(map);
        const p95Obj = new rosu.Performance({ mods, accuracy: 95 }).calculate(map);

        const result = {
            stars: parseFloat(ssObj.difficulty.stars.toFixed(2)),
            maxCombo: ssObj.difficulty.maxCombo || 0,
            ssPP: Math.round(ssObj.pp || 0),
            p99PP: Math.round(p99Obj.pp || 0),
            p95PP: Math.round(p95Obj.pp || 0),
            ar: parseFloat((map.ar || 0).toFixed(1)),
            od: parseFloat((map.od || 0).toFixed(1)),
            hp: parseFloat((map.hp || 0).toFixed(1)),
            cs: parseFloat((map.cs || 0).toFixed(1))
        };

        return result;
    } catch (err) {
        console.error(`[ppCalculator] Error calculating PP for beatmap ${beatmapId}:`, err);
        return null;
    } finally {
        if (map && typeof map.free === 'function') {
            try {
                map.free();
            } catch (e) {}
        }
    }
}

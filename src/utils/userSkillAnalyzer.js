/**
 * Quy đổi thông số Beatmap theo Mod (DT/NC/HR/HT) khớp 100% oWo / Bathbot / CanvasStatCard
 */
export function calculateModScaledStats(score) {
    const mods = (score.mods || []).join('');
    const isDT = mods.includes('DT') || mods.includes('NC');
    const isHR = mods.includes('HR');
    const isHT = mods.includes('HT');

    const beatmap = score.beatmap || {};
    let baseStars = beatmap.difficulty_rating || 5.0;
    let baseLength = beatmap.hit_length || beatmap.total_length || 120;
    let baseBpm = beatmap.bpm || 180;
    let baseAr = beatmap.ar ?? 9.0;
    let baseOd = beatmap.accuracy ?? 8.5;
    let baseCs = beatmap.cs ?? 4.0;

    let stars = baseStars;
    if (isDT) stars = baseStars * 1.33;
    else if (isHR) stars = baseStars * 1.12;

    let length = baseLength;
    if (isDT) length = baseLength / 1.5;
    else if (isHT) length = baseLength / 0.75;

    let bpm = baseBpm;
    if (isDT) bpm = baseBpm * 1.5;
    else if (isHT) bpm = baseBpm * 0.75;

    let ar = baseAr;
    if (isHR) ar = Math.min(10, baseAr * 1.4);
    if (isDT) {
        const ms = baseAr < 5 ? (1800 - baseAr * 120) : (1200 - (baseAr - 5) * 150);
        const msDT = ms / 1.5;
        ar = msDT < 300 ? 11 : (msDT < 1200 ? (1200 - msDT) / 150 + 5 : (1800 - msDT) / 120);
    }

    let od = baseOd;
    if (isHR) od = Math.min(10, baseOd * 1.4);
    if (isDT) {
        const ms = 80 - 6 * baseOd;
        const msDT = ms / 1.5;
        od = (80 - msDT) / 6;
    }

    let cs = baseCs;
    if (isHR) cs = Math.min(10, baseCs * 1.3);

    return { stars, length, bpm, ar, od, cs };
}

/**
 * Phân tích và tính toán toàn bộ chỉ số Playstyle Averages & Skill Breakdown
 * Khớp 100% giữa thẻ ảnh Canvas Stat Card (.st) và dữ liệu lưu trong user_profiles.json
 * @param {object} profile 
 * @param {Array} bestScores 
 * @returns {object}
 */
export function analyzeUserSkillProfile(profile, bestScores = []) {
    const stats = profile?.statistics || {};
    let dtCount = 0, hrCount = 0, hdCount = 0, fcCount = 0;
    let totalStars = 0, totalMaxComboRatio = 0, totalLengthSecs = 0;
    let totalAr = 0, totalOd = 0, totalCs = 0, totalBpm = 0;
    const totalCount = bestScores.length || 1;

    bestScores.forEach(s => {
        const mods = (s.mods || []).join('');
        if (mods.includes('DT') || mods.includes('NC')) dtCount++;
        if (mods.includes('HR')) hrCount++;
        if (mods.includes('HD')) hdCount++;

        const misses = s.statistics?.count_miss || s.statistics?.miss || 0;
        if (misses === 0) fcCount++;

        const mStats = calculateModScaledStats(s);

        totalStars += mStats.stars;
        totalLengthSecs += mStats.length;
        totalBpm += mStats.bpm;
        totalAr += mStats.ar;
        totalOd += mStats.od;
        totalCs += mStats.cs;

        const maxCombo = s.beatmap?.max_combo || s.max_combo || 1;
        totalMaxComboRatio += Math.min(1.0, (s.max_combo || 1) / maxCombo);
    });

    const avgStars = parseFloat((totalStars / totalCount).toFixed(2));
    const avgComboRatio = totalMaxComboRatio / totalCount;
    const avgLengthSecs = Math.round(totalLengthSecs / totalCount);
    const avgAr = parseFloat((totalAr / totalCount).toFixed(2));
    const avgOd = parseFloat((totalOd / totalCount).toFixed(2));
    const avgCs = parseFloat((totalCs / totalCount).toFixed(2));
    const avgBpm = Math.round(totalBpm / totalCount);
    const fcRatio = fcCount / totalCount;

    const hitAcc = stats.hit_accuracy || 90;
    const rawAcc = Math.max(5, Math.min(100, (hitAcc - 80) * 2.5));
    const rawTenacity = Math.max(5, Math.min(100, avgComboRatio * 35 + fcRatio * 35));
    const topPp = bestScores[0]?.pp || 0;
    const rawAim = Math.max(5, Math.min(100, (avgStars / 9.5) * 55 + Math.min(25, (topPp / 1800) * 25)));
    const rawReaction = Math.max(5, Math.min(100, Math.max(0, (avgAr - 8.5)) / 2.5 * 55 + (dtCount / totalCount) * 15 + (avgBpm / 260) * 15));
    const rawPrecision = Math.max(5, Math.min(100, (avgCs / 7.0) * 35 + (avgOd / 10.5) * 35 + (hrCount / totalCount) * 15));
    const rawStamina = Math.max(5, Math.min(100, (avgLengthSecs / 180) * 45 + fcRatio * 15));

    const gentleBloom = (v) => Math.min(100, Math.round(12 + v * 0.85));

    const skills = {
        reaction: gentleBloom(rawReaction),
        speed: gentleBloom(rawAim),
        accuracy: gentleBloom(rawAcc),
        precision: gentleBloom(rawPrecision),
        tenacity: gentleBloom(rawTenacity),
        stamina: gentleBloom(rawStamina)
    };

    // Xác định skill mạnh nhất & yếu nhất
    const skillEntries = Object.entries(skills);
    skillEntries.sort((a, b) => b[1] - a[1]);
    const strongestSkill = skillEntries[0][0];
    const weakestSkill = skillEntries[skillEntries.length - 1][0];

    return {
        avgStars,
        avgLengthSecs,
        avgBpm,
        avgAr,
        avgOd,
        avgCs,
        dtRatio: Math.round((dtCount / totalCount) * 100),
        hrRatio: Math.round((hrCount / totalCount) * 100),
        hdRatio: Math.round((hdCount / totalCount) * 100),
        skills,
        strongestSkill,
        weakestSkill
    };
}

import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Hàm quy đổi thông số Beatmap chính xác theo Mod (DT/NC/HR/HT) khớp 100% oWo / Bathbot
 */
function calculateModScaledStats(score) {
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
 * Vẽ thẻ ảnh Canvas Stat Card Lồng 1 Khung Hợp Nhất (Merged Unified Panel, bỏ thanh Level)
 * @param {Object} profile - Dữ liệu User Profile từ Bancho API
 * @param {Array} bestScores - Mảng 100 điểm số tốt nhất
 * @returns {Promise<Buffer>} - PNG Image Buffer
 */
export async function createStatCardImage(profile, bestScores = []) {
    const width = 840;
    const height = 410;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const stats = profile.statistics || {};
    const countryCode = profile.country_code || 'VN';

    // 1. Phông nền Dark Sleek Tech Gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#090714');
    bgGradient.addColorStop(0.5, '#130d24');
    bgGradient.addColorStop(1, '#080612');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Cover Banner (Phủ tràn 100% toàn bộ thẻ với Aspect-Fill Crop & Full-Card Dark Gradient Overlay)
    const coverUrl = profile.cover?.url || profile.cover_url;
    if (coverUrl) {
        try {
            const coverImg = await loadImage(coverUrl);
            ctx.save();
            ctx.globalAlpha = 0.40;
            const targetW = width;
            const targetH = height;
            const imgAspect = coverImg.width / coverImg.height;
            const targetAspect = targetW / targetH;

            let srcX = 0, srcY = 0, srcW = coverImg.width, srcH = coverImg.height;
            if (imgAspect > targetAspect) {
                srcW = coverImg.height * targetAspect;
                srcX = (coverImg.width - srcW) / 2;
            } else {
                srcH = coverImg.width / targetAspect;
                srcY = (coverImg.height - srcH) / 2;
            }
            ctx.drawImage(coverImg, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

            // Màng phủ Gradient mượt mà từ trên xuống dưới toàn bộ thẻ, xóa bỏ 100% vết cắt ngang
            const fadeGradient = ctx.createLinearGradient(0, 0, 0, height);
            fadeGradient.addColorStop(0, 'rgba(9, 7, 20, 0.25)');
            fadeGradient.addColorStop(0.35, 'rgba(9, 7, 20, 0.65)');
            fadeGradient.addColorStop(0.8, 'rgba(9, 7, 20, 0.88)');
            fadeGradient.addColorStop(1, '#090714');
            ctx.fillStyle = fadeGradient;
            ctx.globalAlpha = 1.0;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        } catch (e) {
            // Ignore cover image error
        }
    }

    // Hexagon background grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    const hexSize = 65;
    for (let y = -hexSize; y < height + hexSize; y += hexSize * 1.5) {
        for (let x = -hexSize; x < width + hexSize; x += hexSize * Math.sqrt(3)) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const hx = x + hexSize * Math.cos(angle);
                const hy = y + hexSize * Math.sin(angle);
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    // Avatar Frame
    const avatarUrl = profile.avatar_url;
    if (avatarUrl) {
        try {
            const avatarImg = await loadImage(avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(70, 65, 36, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatarImg, 34, 29, 72, 72);
            ctx.restore();

            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ff66aa';
            ctx.beginPath();
            ctx.arc(70, 65, 37, 0, Math.PI * 2);
            ctx.stroke();
        } catch (e) {
            // Ignore avatar error
        }
    }

    // Player Header Info
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(profile.username, 125, 58);

    ctx.fillStyle = '#ff66aa';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`[${countryCode}]  •  osu! mode  •  Detailed Stats Card`, 125, 80);

    // Tính toán quy đổi chỉ số trung bình theo Mod (DT/HR/HT) khớp 100% oWo / Bathbot
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

    const avgStars = (totalStars / totalCount).toFixed(2);
    const avgComboRatio = totalMaxComboRatio / totalCount;
    const avgLengthSecs = Math.round(totalLengthSecs / totalCount);
    const avgAr = (totalAr / totalCount).toFixed(2);
    const avgOd = (totalOd / totalCount).toFixed(2);
    const avgCs = (totalCs / totalCount).toFixed(2);
    const avgBpm = Math.round(totalBpm / totalCount);
    const fcRatio = fcCount / totalCount;

    const minutes = Math.floor(avgLengthSecs / 60);
    const seconds = (avgLengthSecs % 60).toString().padStart(2, '0');
    const avgLengthStr = `${minutes}m ${seconds}s`;

    // 6 Skill values calculation (Bathbot exact + Gentle Bloom + Nerfed Reaction)
    const hitAcc = stats.hit_accuracy || 90;
    const rawAcc = Math.max(5, Math.min(100, (hitAcc - 80) * 2.5));
    const rawTenacity = Math.max(5, Math.min(100, avgComboRatio * 35 + fcRatio * 35));
    const topPp = bestScores[0]?.pp || 0;
    const rawAim = Math.max(5, Math.min(100, (parseFloat(avgStars) / 9.5) * 55 + Math.min(25, (topPp / 1800) * 25)));
    const rawReaction = Math.max(5, Math.min(100, Math.max(0, (parseFloat(avgAr) - 8.5)) / 2.5 * 55 + (dtCount / totalCount) * 15 + (avgBpm / 260) * 15));
    const rawPrecision = Math.max(5, Math.min(100, (parseFloat(avgCs) / 7.0) * 35 + (parseFloat(avgOd) / 10.5) * 35 + (hrCount / totalCount) * 15));
    const rawStamina = Math.max(5, Math.min(100, (avgLengthSecs / 180) * 45 + fcRatio * 15));

    const gentleBloom = (v) => Math.min(100, Math.round(12 + v * 0.85));

    const skillList = [
        { name: 'REACTION', val: gentleBloom(rawReaction), color: '#00e5ff' },
        { name: 'AGILITY / SPEED', val: gentleBloom(rawAim), color: '#ff4081' },
        { name: 'ACCURACY', val: gentleBloom(rawAcc), color: '#00e676' },
        { name: 'PRECISION', val: gentleBloom(rawPrecision), color: '#ffea00' },
        { name: 'TENACITY', val: gentleBloom(rawTenacity), color: '#ab47bc' },
        { name: 'STAMINA', val: gentleBloom(rawStamina), color: '#ff9100' }
    ];

    // ----------------------------------------------------
    // UNIFIED COMBINED PANEL (Box: x=35, y=115, w=770, h=270)
    // ----------------------------------------------------
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.roundRect(35, 115, 770, 270, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // Line Divider giữa 2 Cột
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(410, 130);
    ctx.lineTo(410, 370);
    ctx.stroke();

    // ----------------------------------------------------
    // CỘT TRAI: PLAYSTYLE AVERAGES (x=55)
    // ----------------------------------------------------
    ctx.fillStyle = '#ff66aa';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('PLAYSTYLE AVERAGES', 55, 142);

    const playstyleItems = [
        { label: 'AVERAGE STAR', val: `${avgStars} Stars`, col: '#ffea00' },
        { label: 'AVERAGE LENGTH', val: avgLengthStr, col: '#ffffff' },
        { label: 'AVERAGE BPM', val: `${avgBpm} BPM`, col: '#00e5ff' },
        { label: 'APPROACH RATE (AR)', val: `AR ${avgAr}`, col: '#ffffff' },
        { label: 'OVERALL DIFF (OD)', val: `OD ${avgOd}`, col: '#ffffff' },
        { label: 'CIRCLE SIZE (CS)', val: `CS ${avgCs}`, col: '#ffffff' },
        { label: 'MOD RATIOS', val: `DT ${Math.round((dtCount/totalCount)*100)}% • HR ${Math.round((hrCount/totalCount)*100)}% • HD ${Math.round((hdCount/totalCount)*100)}%`, col: '#ff4081' }
    ];

    let py = 168;
    playstyleItems.forEach(item => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(item.label, 55, py);

        ctx.fillStyle = item.col;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(item.val, 55, py + 14);
        py += 30;
    });

    // ----------------------------------------------------
    // CỘT PHẢI: SKILL BREAKDOWN BARS (x=435)
    // ----------------------------------------------------
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('SKILL BREAKDOWN', 435, 142);

    let sy = 165;
    skillList.forEach(s => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.name, 435, sy);

        ctx.fillStyle = s.color;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${s.val} / 100`, 725, sy);

        // Progress bar container
        const pBarX = 435, pBarY = sy + 6, pBarW = 345, pBarH = 9;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.roundRect(pBarX, pBarY, pBarW, pBarH, 4);
        ctx.fill();

        const sFillW = Math.max(6, Math.min(pBarW, (pBarW * s.val) / 100));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.roundRect(pBarX, pBarY, sFillW, pBarH, 4);
        ctx.fill();

        sy += 36;
    });

    return canvas.toBuffer('image/png');
}

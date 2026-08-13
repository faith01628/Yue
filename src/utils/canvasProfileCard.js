import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Vẽ thẻ ảnh Profile Card chất lượng cao cho người chơi osu! (Bố cục 3 Panel Đỉnh Cao + Phân tích Top 100 Plays)
 */
export async function createProfileCardImage(profile, bestScores = []) {
    const width = 960;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const stats = profile.statistics || {};
    const countryCode = profile.country_code || 'VN';

    // 1. Phông nền Dark Sleek Neon Gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0a0814');
    bgGradient.addColorStop(0.5, '#151024');
    bgGradient.addColorStop(1, '#090712');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Cover Banner (nếu có) - Áp dụng thuật toán Aspect-Fill Crop chuẩn tỷ lệ không bao giờ bị bóp méo
    const coverUrl = profile.cover?.url || profile.cover_url;
    if (coverUrl) {
        try {
            const coverImg = await loadImage(coverUrl);
            ctx.save();
            ctx.globalAlpha = 0.35;

            // Tính toán Aspect-Fill Crop chuẩn tỷ lệ phủ tràn 100% toàn bộ thẻ Profile
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

            // Màng mờ phủ tràn toàn bộ thẻ mượt mà, xóa bỏ 100% vết cắt ngang ở giữa
            const fadeGrad = ctx.createLinearGradient(0, 0, 0, height);
            fadeGrad.addColorStop(0, 'rgba(10, 8, 20, 0.25)');
            fadeGrad.addColorStop(0.35, 'rgba(10, 8, 20, 0.65)');
            fadeGrad.addColorStop(0.8, 'rgba(10, 8, 20, 0.88)');
            fadeGrad.addColorStop(1, '#0a0814');
            ctx.fillStyle = fadeGrad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        } catch (e) {
            // Bỏ qua nếu lỗi tải cover
        }
    }

    // Họa tiết Hexagon Background THƯA (Spaced out hexSize = 65)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
    ctx.lineWidth = 1;
    const hexSize = 65;
    for (let x = 0; x < width + hexSize; x += hexSize * 1.5) {
        for (let y = 0; y < height + hexSize; y += hexSize * Math.sqrt(3)) {
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

    // Radial Glow Overlay
    const radialGlow = ctx.createRadialGradient(250, 150, 50, 250, 150, 450);
    radialGlow.addColorStop(0, 'rgba(255, 102, 170, 0.15)');
    radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, width, height);

    // Đường viền Neon Gradient
    ctx.lineWidth = 4;
    const borderGrad = ctx.createLinearGradient(0, 0, width, height);
    borderGrad.addColorStop(0, '#ff66aa');
    borderGrad.addColorStop(0.5, '#9b59b6');
    borderGrad.addColorStop(1, '#3498db');
    ctx.strokeStyle = borderGrad;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // 2. Avatar & Header Thông tin
    const avatarX = 40, avatarY = 30, avatarSize = 95;
    try {
        const avatar = await loadImage(profile.avatar_url);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
    } catch (e) {
        ctx.fillStyle = '#ff66aa';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Vòng Neon bao quanh Avatar
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff66aa';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Username (Không ngoặc vuông lặp) & Quốc gia
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(profile.username, 155, 70);

    ctx.fillStyle = '#b3b3cc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`[${countryCode}]  •  osu! mode`, 155, 102);

    // Phân tích Playstyle & Thống kê toàn diện từ Top 100 Plays (AR, OD, CS, BPM, Length, Acc, Combo)
    let dtCount = 0, hrCount = 0, hdCount = 0, fcCount = 0, ssCount = 0;
    let totalStars = 0, totalMaxComboRatio = 0, totalLengthSecs = 0;
    let totalAr = 0, totalOd = 0, totalCs = 0, totalBpm = 0, totalTopAcc = 0;
    let maxTopCombo = 0, maxPlayLengthSecs = 0;
    const totalCount = bestScores.length || 1;

    bestScores.forEach(s => {
        const mods = (s.mods || []).join('');
        const isDT = mods.includes('DT') || mods.includes('NC');
        const isHR = mods.includes('HR');

        if (isDT) dtCount++;
        if (isHR) hrCount++;
        if (mods.includes('HD')) hdCount++;

        const rank = (s.rank || '').toUpperCase();
        if (rank === 'XH' || rank === 'X' || rank === 'SSH' || rank === 'SS') ssCount++;

        const misses = s.statistics?.count_miss || s.statistics?.miss || 0;
        if (misses === 0) fcCount++;

        totalStars += s.beatmap?.difficulty_rating || 5.0;
        
        const mapLength = s.beatmap?.hit_length || s.beatmap?.total_length || 120;
        totalLengthSecs += mapLength;
        if (mapLength > maxPlayLengthSecs) maxPlayLengthSecs = mapLength;

        const currentCombo = s.max_combo || 1;
        if (currentCombo > maxTopCombo) maxTopCombo = currentCombo;

        const accPct = s.accuracy > 1 ? s.accuracy : (s.accuracy * 100);
        totalTopAcc += accPct;

        // Tính AR & OD có tính đến mod DT/HR
        let ar = s.beatmap?.ar ?? 9.0;
        let od = s.beatmap?.accuracy ?? 8.5;
        let cs = s.beatmap?.cs ?? 4.0;
        let bpm = s.beatmap?.bpm ?? 180;

        if (isHR) {
            ar = Math.min(10, ar * 1.4);
            od = Math.min(10, od * 1.4);
            cs = Math.min(10, cs * 1.3);
        }
        if (isDT) {
            bpm = bpm * 1.5;
            ar = ar > 5 ? Math.min(11, (ar * 2 + 13) / 3) : Math.min(11, (ar * 3 + 9) / 4);
            od = Math.min(11, (od * 2 + 13) / 3);
        }

        totalAr += ar;
        totalOd += od;
        totalCs += cs;
        totalBpm += bpm;

        const maxCombo = s.beatmap?.max_combo || s.max_combo || 1;
        totalMaxComboRatio += Math.min(1.0, (s.max_combo || 1) / maxCombo);
    });

    const avgStars = totalStars / totalCount;
    const avgComboRatio = totalMaxComboRatio / totalCount;
    const avgLength = totalLengthSecs / totalCount;
    const avgTopAcc = totalTopAcc / totalCount;
    const avgCombo = maxTopCombo > 0 ? (totalMaxComboRatio * (maxTopCombo / Math.max(1, totalMaxComboRatio))) : 500;
    const fcRatio = fcCount / totalCount;
    const ssRatio = ssCount / totalCount;

    const avgAr = totalAr / totalCount;
    const avgOd = totalOd / totalCount;
    const avgCs = totalCs / totalCount;
    const avgBpm = totalBpm / totalCount;

    const primaryBadge = (dtCount / totalCount > 0.35) ? 'Speed' : ((hrCount / totalCount > 0.20) ? 'Sniper' : 'Hardy');
    const secondaryBadge = (stats.hit_accuracy || 0) > 98 ? 'Accuracy' : (avgComboRatio > 0.8 ? 'Consistency' : 'Master');

    const badges = [primaryBadge, secondaryBadge];
    let rightMargin = width - 40;

    badges.reverse().forEach((text, idx) => {
        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(text).width;
        const badgeW = textWidth + 24;
        const badgeX = rightMargin - badgeW;
        const badgeY = 40;
        const bgCol = idx === 0 ? 'rgba(52, 152, 219, 0.45)' : 'rgba(155, 89, 182, 0.45)';

        ctx.fillStyle = bgCol;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, 26, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, badgeX + 12, badgeY + 17);

        rightMargin -= (badgeW + 10);
    });

    // 3. Thanh Tiến Trình Level & Khung Cấp Bậc Grade Ranks
    const barY = 142;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(40, barY, 880, 48, 10);
    ctx.fill();

    // Progress bar Level
    const level = stats.level?.current || 0;
    const progress = stats.level?.progress || 0;
    const barWidth = 330;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(60, barY + 17, barWidth, 14, 7);
    ctx.fill();

    const fillW = Math.max(10, (barWidth * progress) / 100);
    const progressGrad = ctx.createLinearGradient(60, 0, 60 + fillW, 0);
    progressGrad.addColorStop(0, '#ff66aa');
    progressGrad.addColorStop(1, '#9b59b6');
    ctx.fillStyle = progressGrad;
    ctx.beginPath();
    ctx.roundRect(60, barY + 17, fillW, 14, 7);
    ctx.fill();

    ctx.fillStyle = '#ff66aa';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`Lv. ${level} (${progress}%)`, 405, barY + 29);

    // Cấp bậc Grade Ranks: X trắng (ssh), X vàng (ss), S trắng (sh), S vàng (s), A xanh (a)
    const g = stats.grade_counts || {};
    const grades = [
        { label: 'X', count: g.ssh || 0, color: '#ffffff' }, // X trắng (ssh)
        { label: 'X', count: g.ss || 0, color: '#ffe500' },  // X vàng (ss)
        { label: 'S', count: g.sh || 0, color: '#ffffff' }, // S trắng (sh)
        { label: 'S', count: g.s || 0, color: '#ffe500' },  // S vàng (s) - Cùng màu vàng với X vàng
        { label: 'A', count: g.a || 0, color: '#4caf50' }   // A xanh (a)
    ];

    let gradeX = 545;
    grades.forEach(gr => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.roundRect(gradeX, barY + 9, 64, 30, 6);
        ctx.fill();
        ctx.fillStyle = gr.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(gr.label, gradeX + 10, barY + 29);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${gr.count}`, gradeX + 32, barY + 29);
        gradeX += 70;
    });

    // 4. Panel 1: Hexagonal Skill Radar Web Chart (Thuật toán Bathbot Chuẩn Xác 100%)
    const centerX = 165, centerY = 360, radius = 85;
    const labels = ['Stamina', 'Accuracy', 'Precision', 'Reaction', 'Agility', 'Tenacity'];

    // Thuật toán Đánh giá Kỹ năng Chuẩn Bathbot 100% Gốc + Gentle Bloom (Nở nhẹ tự nhiên, giữ nguyên 100% tỷ lệ góc)
    // 1. Accuracy (Bathbot chuẩn): (hit_accuracy - 80) * 2.5
    const hitAcc = stats.hit_accuracy || 90;
    const rawAcc = Math.max(5, Math.min(100, (hitAcc - 80) * 2.5));

    // 2. Tenacity (Bathbot chuẩn): avgComboRatio & fcRatio
    const rawTenacity = Math.max(5, Math.min(100, avgComboRatio * 35 + fcRatio * 35));

    // 3. Agility / Aim (Bathbot chuẩn): (avgStars / 9.5) * 60 + Aim bonus
    const topPp = bestScores[0]?.pp || 0;
    const rawAim = Math.max(5, Math.min(100, (avgStars / 9.5) * 55 + Math.min(25, (topPp / 1800) * 25)));

    // 4. Reaction (Đã Nerf chuẩn phân khúc AR 8.5-11.0): AR 9.0 -> ~25%, AR 9.88 -> ~50%, AR 10.3 -> ~65%, AR 10.8-11.0 (Top World 3-mod) -> 85-100%
    const rawReaction = Math.max(5, Math.min(100, Math.max(0, (avgAr - 8.5)) / 2.5 * 55 + (dtCount / totalCount) * 15 + (avgBpm / 260) * 15));

    // 5. Precision (Bathbot chuẩn): CS & OD
    const rawPrecision = Math.max(5, Math.min(100, (avgCs / 7.0) * 35 + (avgOd / 10.5) * 35 + (hrCount / totalCount) * 15));

    // 6. Stamina (Bathbot chuẩn): Length & combo
    const rawStamina = Math.max(5, Math.min(100, (avgLength / 180) * 45 + fcRatio * 15));

    // Hàm Gentle Bloom: Nở nhẹ đều 12% bán kính để khung hình vừa vặn, KHÔNG BỊ TRUYỀN TẢI LỐ HAY BIẾN DẠNG TỶ LỆ GỐC
    const gentleBloom = (v) => Math.min(100, Math.round(12 + v * 0.85));

    const rawValues = [rawStamina, rawAcc, rawPrecision, rawReaction, rawAim, rawTenacity];
    const values = rawValues.map(gentleBloom);

    // Khung Panel 1
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.roundRect(40, 210, 250, 300, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    for (let r = 0.25; r <= 1.0; r += 0.25) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const x = centerX + Math.cos(angle) * (radius * r);
            const y = centerY + Math.sin(angle) * (radius * r);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();

        const labelX = centerX + Math.cos(angle) * (radius + 18);
        const labelY = centerY + Math.sin(angle) * (radius + 18);
        ctx.fillStyle = '#b3b3cc';
        ctx.font = '11px sans-serif';
        ctx.fillText(labels[i], labelX, labelY + 4);
    }

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const valR = (radius * (values[i] / 100));
        const x = centerX + Math.cos(angle) * valR;
        const y = centerY + Math.sin(angle) * valR;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(155, 89, 182, 0.4)';
    ctx.fill();
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 5. Panel 2: Khung Center Glass Card (Global & Country Ranks + BP1 & #1 Ranks)
    ctx.textAlign = 'center';
    const cardX = 310, cardY = 210, cardW = 300, cardH = 300;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 102, 170, 0.25)';
    ctx.stroke();

    // Global Rank
    ctx.fillStyle = '#ff66aa';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('GLOBAL RANKING', cardX + cardW / 2, cardY + 32);

    const globalRankStr = stats.global_rank ? `#${stats.global_rank.toLocaleString()}` : 'Unranked';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(globalRankStr, cardX + cardW / 2, cardY + 75);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cardX + 25, cardY + 105);
    ctx.lineTo(cardX + cardW - 25, cardY + 105);
    ctx.stroke();

    // Country Rank
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('COUNTRY RANKING', cardX + cardW / 2, cardY + 138);

    const countryRankStr = stats.country_rank ? `#${stats.country_rank.toLocaleString()}` : 'Unranked';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(countryRankStr, cardX + cardW / 2, cardY + 180);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cardX + 25, cardY + 205);
    ctx.lineTo(cardX + cardW - 25, cardY + 205);
    ctx.stroke();

    // Sub-stats inside Center Card: Top Play BP1 & #1 Ranks
    const bp1PP = bestScores.length > 0 ? `${Math.round(bestScores[0].pp || 0)}pp` : '0pp';
    const firstRanks = profile.scores_first_count || 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#8e8eab';
    ctx.font = '11px sans-serif';
    ctx.fillText('TOP PLAY (BP1)', cardX + 30, cardY + 235);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(bp1PP, cardX + 30, cardY + 265);

    ctx.fillStyle = '#8e8eab';
    ctx.font = '11px sans-serif';
    ctx.fillText('#1 RANKS', cardX + 180, cardY + 235);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${firstRanks}`, cardX + 180, cardY + 265);

    // 6. Panel 3: Cột Phía Bên Phải Bố Cục 2x3 Grid (Bỏ ký tự ô vuông 🔲)
    ctx.textAlign = 'left';
    const gridX1 = 630, gridX2 = 780;
    const gridY1 = 210, gridY2 = 315, gridY3 = 420;
    const cellW = 135, cellH = 90;

    const playTimeSecs = stats.play_time || 0;
    const days = Math.floor(playTimeSecs / 86400);
    const hours = Math.floor((playTimeSecs % 86400) / 3600);
    const mins = Math.floor((playTimeSecs % 3600) / 60);
    const playTimeStr = `${days}d ${hours}h ${mins}m`;

    const ppStr = stats.pp ? `${Math.round(stats.pp).toLocaleString()} pp` : '0 pp';
    const accStr = stats.hit_accuracy ? `${stats.hit_accuracy.toFixed(2)}%` : '0%';
    const comboStr = stats.maximum_combo ? `${stats.maximum_combo.toLocaleString()}x` : '0x';
    const medalsStr = `${profile.user_achievements?.length || 0}`;
    const playCountStr = `${(stats.play_count || 0).toLocaleString()}`;

    const drawGridCell = (x, y, label, val, color) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 10);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `${color}44`;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label, x + 12, y + 25);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(val, x + 12, y + 60);
    };

    drawGridCell(gridX1, gridY1, 'TOTAL PP', ppStr, '#ff66aa');
    drawGridCell(gridX2, gridY1, 'ACCURACY', accStr, '#00e5ff');
    drawGridCell(gridX1, gridY2, 'MAX COMBO', comboStr, '#ffea00');
    drawGridCell(gridX2, gridY2, 'MEDALS', medalsStr, '#ff9800');
    drawGridCell(gridX1, gridY3, 'PLAY TIME', playTimeStr, '#b388ff');
    drawGridCell(gridX2, gridY3, 'PLAY COUNT', playCountStr, '#00e676');

    return await canvas.toBuffer('image/png');
}

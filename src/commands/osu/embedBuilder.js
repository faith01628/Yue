import { EmbedBuilder } from 'discord.js';
import { calculateBeatmapPP, timeAgo } from '../../services/osu/osuService.js';
import { EMOJIS, getRankEmoji } from '../../config/emojis.js';

export async function buildDetailedScoreEmbed(user, score, beatmap, beatmapset, titlePrefix = '') {
    const modsArr = score.mods || [];
    const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '+NoMod';
    const cleanMods = modsArr.length > 0 ? modsArr.join('') : '';
    const rankEmoji = getRankEmoji(score.rank, modsArr);
    const acc = (score.accuracy * 100).toFixed(2);

    const stats = score.statistics || {};
    const count300 = stats.count_300 || stats.great || 0;
    const count100 = stats.count_100 || stats.ok || 0;
    const count50 = stats.count_50 || stats.meh || 0;
    const countMiss = stats.count_miss || stats.miss || 0;

    // 1. Tính toán FC Accuracy (chuyển tất cả miss thành 300)
    const count300FC = count300 + countMiss;
    const totalHits = count300FC + count100 + count50;

    const fcAccNum = totalHits > 0
        ? (((count300FC * 300) + (count100 * 100) + (count50 * 50)) / (totalHits * 300) * 100)
        : (score.accuracy * 100);
    const fcAccStr = fcAccNum.toFixed(2);

    // 2. Tính PP cho play thực tế & play nếu FC
    const [realPlayResult, fcResult] = await Promise.all([
        calculateBeatmapPP(beatmap.id, {
            accuracy: score.accuracy * 100,
            n100: count100,
            n50: count50,
            misses: countMiss,
            mods: cleanMods
        }),
        calculateBeatmapPP(beatmap.id, {
            accuracy: fcAccNum,
            n100: count100,
            n50: count50,
            misses: 0,
            mods: cleanMods
        })
    ]);

    // Max combo thực tế của map
    let realMaxCombo = beatmap.max_combo || beatmapset?.max_combo || realPlayResult?.difficulty?.maxCombo || fcResult?.difficulty?.maxCombo || 0;
    if (!realMaxCombo && countMiss === 0) realMaxCombo = score.max_combo;

    // 3. Tính PP hiện tại và PP nếu FC (2 chữ số thập phân)
    const currentPpNum = (score.pp !== undefined && score.pp !== null && score.pp > 0)
        ? score.pp
        : (realPlayResult ? realPlayResult.pp : 0);
    const currentPpStr = currentPpNum.toFixed(2);

    const fcPpNum = fcResult ? fcResult.pp : currentPpNum;
    const fcPpStr = fcPpNum.toFixed(2);

    const isChoked = countMiss > 0 || (realMaxCombo > 0 && score.max_combo < realMaxCombo * 0.98);

    let ppDisplay = (isChoked && fcPpNum > currentPpNum)
        ? `**${currentPpStr}PP** (**${fcPpStr}PP** for **${fcAccStr}%** FC)`
        : `**${currentPpStr}PP**`;

    // Combo
    const comboDisplay = realMaxCombo > 0 ? `**x${score.max_combo}/${realMaxCombo}**` : `**x${score.max_combo}**`;

    // Star rating có tính Mod
    const rawStars = realPlayResult?.difficulty?.stars || fcResult?.difficulty?.stars || beatmap.difficulty_rating || 0;
    const starStr = rawStars ? rawStars.toFixed(2) : '?.??';

    // Rank của điểm trên Server (nếu có)
    const scorePosition = score.position || score.rank_global || score.global_rank;
    const serverRankStr = scorePosition ? ` • 🌐 **#${scorePosition.toLocaleString()}**` : '';

    const timeText = timeAgo(score.created_at || score.ended_at);

    // 4. Tính toán thông số bài nhạc khi có Mod (Speed Multiplier, AR, OD, HP, CS, BPM, Length)
    const isDT = cleanMods.includes('DT') || cleanMods.includes('NC');
    const isHT = cleanMods.includes('HT');
    const isHR = cleanMods.includes('HR');
    const isEZ = cleanMods.includes('EZ');
    const clockRate = isDT ? 1.5 : (isHT ? 0.75 : 1.0);

    // AR với Mod
    let moddedAR = beatmap.ar;
    if (realPlayResult?.difficulty?.ar !== undefined) {
        moddedAR = realPlayResult.difficulty.ar;
    } else if (isHR) {
        moddedAR = Math.min(10, (beatmap.ar || 0) * 1.4);
    } else if (isEZ) {
        moddedAR = (beatmap.ar || 0) * 0.5;
    }
    const arStr = (moddedAR !== undefined && moddedAR !== null) ? Number(moddedAR).toFixed(1) : '?.?';

    // OD với Mod
    let moddedOD = beatmap.accuracy;
    if (realPlayResult?.difficulty?.greatHitWindow !== undefined) {
        moddedOD = (80 - realPlayResult.difficulty.greatHitWindow) / 6;
    } else if (isHR) {
        moddedOD = Math.min(10, (beatmap.accuracy || 0) * 1.4);
    } else if (isEZ) {
        moddedOD = (beatmap.accuracy || 0) * 0.5;
    }
    const odStr = (moddedOD !== undefined && moddedOD !== null) ? Number(moddedOD).toFixed(1) : '?.?';

    // HP với Mod
    let moddedHP = beatmap.drain;
    if (realPlayResult?.difficulty?.hp !== undefined) {
        moddedHP = realPlayResult.difficulty.hp;
    } else if (isHR) {
        moddedHP = Math.min(10, (beatmap.drain || 0) * 1.4);
    } else if (isEZ) {
        moddedHP = (beatmap.drain || 0) * 0.5;
    }
    const hpStr = (moddedHP !== undefined && moddedHP !== null) ? Number(moddedHP).toFixed(1) : '?.?';

    // CS với Mod
    let moddedCS = beatmap.cs;
    if (isHR) {
        moddedCS = Math.min(10, (beatmap.cs || 0) * 1.3);
    } else if (isEZ) {
        moddedCS = (beatmap.cs || 0) * 0.5;
    }
    const csStr = (moddedCS !== undefined && moddedCS !== null) ? Number(moddedCS).toFixed(1) : '?.?';

    // BPM & Length với Mod
    const moddedBPM = Math.round((beatmap.bpm || 0) * clockRate);
    const totalSecs = Math.round((beatmap.total_length || 0) / clockRate);
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    const lengthStr = `${mins}:${secs}`;

    const mapStatsBar = `\`🕒 ${lengthStr}\` • \`CS:${csStr} AR:${arStr} OD:${odStr} HP:${hpStr}\` • \`🎵${moddedBPM}\``;

    // Tiêu đề có kèm +MOD và Star rating modded
    const modTitleTag = modsStr !== '+NoMod' ? ` ${modsStr}` : '';
    const fullTitle = `${titlePrefix}${beatmapset.artist} - ${beatmapset.title} [${beatmap.version}]${modTitleTag} [${starStr}★]`;

    return new EmbedBuilder()
        .setColor(score.passed ? '#3498db' : '#e74c3c')
        .setAuthor({
            name: `${user.username}: ${user.statistics?.pp ? Math.round(user.statistics.pp).toLocaleString() : '0'}pp (#${user.statistics?.global_rank?.toLocaleString() || 'N/A'} ${user.country_code || 'VN'}${user.statistics?.country_rank || ''})`,
            iconURL: user.avatar_url,
            url: `https://osu.ppy.sh/users/${user.id}`
        })
        .setTitle(fullTitle)
        .setURL(beatmap.url)
        .setThumbnail(beatmapset.covers.list)
        .setDescription(
            `${rankEmoji} **${modsStr}** • **${score.score.toLocaleString()}** • **${acc}%** • *${timeText}*\n` +
            `▸ ${ppDisplay} • ${comboDisplay} • ${EMOJIS.MISS} **${countMiss}** [${count300}/${count100}/${count50}/${countMiss}]${serverRankStr}\n` +
            `${mapStatsBar}`
        )
        .setFooter({ text: `osu! • ${beatmapset.status || 'Ranked'} by ${beatmapset.creator || 'N/A'}` })
        .setTimestamp();
}
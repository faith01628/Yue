import { EmbedBuilder } from 'discord.js';
import { calculateBeatmapPP, timeAgo } from '../../services/osu/osuService.js';
import { EMOJIS, getRankEmoji } from '../../config/emojis.js';

export async function buildDetailedScoreEmbed(user, score, beatmap, beatmapset, titlePrefix = '') {
    const modsArr = score.mods || [];
    const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '+NoMod';
    const rankEmoji = getRankEmoji(score.rank, modsArr);
    const acc = (score.accuracy * 100).toFixed(2);

    const stats = score.statistics || {};
    const count300 = stats.count_300 || stats.great || 0;
    const count100 = stats.count_100 || stats.ok || 0;
    const count50 = stats.count_50 || stats.meh || 0;
    const countMiss = stats.count_miss || stats.miss || 0;

    const count300FC = count300 + countMiss;
    const totalHits = count300FC + count100 + count50;

    const fcAccNum = totalHits > 0
        ? (((count300FC * 300) + (count100 * 100) + (count50 * 50)) / (totalHits * 300) * 100)
        : (score.accuracy * 100);
    const fcAccStr = fcAccNum.toFixed(2);

    const fcResult = await calculateBeatmapPP(beatmap.id, {
        accuracy: fcAccNum,
        n100: count100,
        n50: count50,
        misses: 0,
        mods: modsStr !== '+NoMod' ? modsStr.replace('+', '') : ''
    });

    let realMaxCombo = beatmap.max_combo || beatmapset?.max_combo || fcResult?.maxCombo || 0;
    if (!realMaxCombo && countMiss === 0) realMaxCombo = score.max_combo;

    const currentPp = Math.round(score.pp || 0);
    const ifFcPp = fcResult ? Math.round(fcResult.pp) : currentPp;
    const isChoked = countMiss > 0 || (realMaxCombo > 0 && score.max_combo < realMaxCombo * 0.98);

    let ppDisplay = (isChoked && ifFcPp > currentPp)
        ? `pp ▸ **${currentPp}** / **${ifFcPp}** (if FC **${fcAccStr}%**)`
        : `pp ▸ **${currentPp}**`;

    const comboDisplay = realMaxCombo > 0 ? `**${score.max_combo}**/${realMaxCombo}x` : `**${score.max_combo}x**`;
    const star = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';
    const timeText = timeAgo(score.created_at || score.ended_at);

    const mins = Math.floor((beatmap.total_length || 0) / 60);
    const secs = ((beatmap.total_length || 0) % 60).toString().padStart(2, '0');
    const lengthStr = `${mins}:${secs}`;
    const mapStatsBar = `\`${lengthStr}\` • \`CS:${beatmap.cs} AR:${beatmap.ar} OD:${beatmap.accuracy} HP:${beatmap.drain}\` • \`🎵${beatmap.bpm}\``;

    return new EmbedBuilder()
        .setColor(score.passed ? '#3498db' : '#e74c3c')
        .setAuthor({
            name: `${user.username}: ${user.statistics?.pp ? Math.round(user.statistics.pp).toLocaleString() : '0'}pp (#${user.statistics?.global_rank?.toLocaleString() || 'N/A'} ${user.country_code || 'VN'}${user.statistics?.country_rank || ''})`,
            iconURL: user.avatar_url,
            url: `https://osu.ppy.sh/users/${user.id}`
        })
        .setTitle(`${titlePrefix}${beatmapset.artist} - ${beatmapset.title} [${beatmap.version}] [${star}★]`)
        .setURL(beatmap.url)
        .setThumbnail(beatmapset.covers.list)
        .setDescription(
            `${rankEmoji} **${modsStr}** • **${score.score.toLocaleString()}** • **${acc}%** • *${timeText}*\n` +
            `${ppDisplay} • ${comboDisplay} • ${EMOJIS.MISS} **${countMiss}** [${count300}/${count100}/${count50}/${countMiss}]\n` +
            `${mapStatsBar}`
        )
        .setFooter({ text: `osu! • ${beatmapset.status || 'Ranked'} by ${beatmapset.creator || 'N/A'}` })
        .setTimestamp();
}
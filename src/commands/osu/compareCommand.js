import { EmbedBuilder } from 'discord.js';
import { getUserProfile, getUserBeatmapScores, calculateBeatmapPP, timeAgo } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { buildDetailedScoreEmbed } from './embedBuilder.js';
import { findBeatmapIdFromChannel } from './helper.js';
import { getRankEmoji } from '../../config/emojis.js';

export async function handleOsuCompareCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();

    const user = await getUserProfile(username);
    if (!user) return message.reply(`Không tìm thấy người chơi **${username}** trên Bancho ông ơi!`);

    const beatmapId = await findBeatmapIdFromChannel(message);
    if (!beatmapId) return message.reply("Tui không tìm thấy Beatmap nào trong 50 tin nhắn gần nhất để so sánh cả!");

    const data = await getUserBeatmapScores(user.username, beatmapId);
    const scores = data?.scores || (data?.score ? [data.score] : []);

    if (!data || scores.length === 0) {
        const beatmapInfo = data?.beatmap ? ` bài **[${data.beatmap.version}]**` : ' bài này';
        return message.reply(`**${user.username}** chưa từng có điểm số nào trên${beatmapInfo} cả!`);
    }

    const { beatmap } = data;
    const beatmapset = beatmap.beatmapset;

    // TH1: 1 Play -> Embed chi tiết
    if (scores.length === 1) {
        const embed = await buildDetailedScoreEmbed(user, scores[0], beatmap, beatmapset);
        return message.reply({ embeds: [embed] });
    }

    // TH2: Nhiều Plays -> Embed danh sách
    const star = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';

    const scoreLines = await Promise.all(scores.map(async (score, idx) => {
        const index = idx + 1;
        const modsArr = score.mods || [];
        const modsStr = modsArr.length > 0 ? ` **+${modsArr.join('')}**` : ' **+NoMod**';
        const rankEmoji = getRankEmoji(score.rank, modsArr);
        const acc = (score.accuracy * 100).toFixed(2);
        const pp = Math.round(score.pp || 0);

        // Hit counts
        const stats = score.statistics || {};
        const count300 = stats.count_300 || stats.great || 0;
        const count100 = stats.count_100 || stats.ok || 0;
        const count50 = stats.count_50 || stats.meh || 0;
        const countMiss = stats.count_miss || stats.miss || 0;
        const hitsStr = `[${count300}/${count100}/${count50}/${countMiss}]`;

        const totalScore = score.score ? score.score.toLocaleString() : '0';
        const timeStr = timeAgo(score.created_at || score.ended_at);

        let mapMaxCombo = beatmap?.max_combo;
        let fcPp = null;

        try {
            const fcResult = await calculateBeatmapPP(beatmap.id, {
                accuracy: score.accuracy * 100,
                mods: modsArr.join(''),
                misses: 0
            });

            if (fcResult) {
                if (!mapMaxCombo && fcResult.difficulty?.max_combo) {
                    mapMaxCombo = fcResult.difficulty.max_combo;
                }
                if (fcResult.pp) {
                    fcPp = Math.round(fcResult.pp);
                }
            }
        } catch (err) {}

        const comboDisplay = mapMaxCombo 
            ? `**${score.max_combo}**/${mapMaxCombo}x` 
            : `**${score.max_combo}x**`;

        let ppDisplay = `**${pp}pp**`;
        const isChoke = countMiss > 0 || (mapMaxCombo && score.max_combo < mapMaxCombo * 0.98);

        if (isChoke && fcPp && fcPp > pp) {
            ppDisplay = `**${pp}**/${fcPp}pp *(if FC)*`;
        }

        const line1 = `**${index}.** ${rankEmoji}${modsStr}`;
        const line2 = `▸ PP ▸ ${ppDisplay} • **${acc}%** • ${comboDisplay} • *${timeStr}*`;
        const line3 = `└ ▸ Score: \`${totalScore}\` • \`${hitsStr}\``;

        return `${line1}\n${line2}\n${line3}`;
    }));

    const finalDescription = scoreLines.join('\n\n');

    const listEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setAuthor({
            name: `Các điểm số của ${user.username} trên map:`,
            iconURL: user.avatar_url,
            url: `https://osu.ppy.sh/users/${user.id}`
        })
        .setTitle(`${beatmapset.artist} - ${beatmapset.title} [${beatmap.version}] \`[${star}★]\``)
        .setURL(beatmap.url)
        .setThumbnail(beatmapset.covers.list)
        .setDescription(finalDescription)
        .setFooter({ text: `osu! Bancho • Tìm thấy ${scores.length} scores` })
        .setTimestamp();

    return message.reply({ embeds: [listEmbed] });
}
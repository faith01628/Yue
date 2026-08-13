import { EmbedBuilder } from 'discord.js';
import { getUserProfile, getUserBeatmapScores, calculateBeatmapPP, getBeatmapLeaderboard, timeAgo } from '../../services/osu/osuService.js';
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

    // Lấy trước Leaderboard để tra cứu thứ hạng server của các điểm số nếu cần
    let leaderboardScores = [];
    try {
        const lbData = await getBeatmapLeaderboard(beatmap.id);
        if (lbData?.scores) leaderboardScores = lbData.scores;
    } catch (e) {}

    // TH2: Nhiều Plays -> Embed danh sách
    const scoreLines = await Promise.all(scores.map(async (score, idx) => {
        const index = idx + 1;
        const modsArr = score.mods || [];
        const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '+NoMod';
        const cleanMods = modsArr.length > 0 ? modsArr.join('') : '';
        const rankEmoji = getRankEmoji(score.rank, modsArr);
        const acc = (score.accuracy * 100).toFixed(2);

        // Hit counts
        const stats = score.statistics || {};
        const count300 = stats.count_300 || stats.great || 0;
        const count100 = stats.count_100 || stats.ok || 0;
        const count50 = stats.count_50 || stats.meh || 0;
        const countMiss = stats.count_miss || stats.miss || 0;
        const hitsStr = `[${count300}/${count100}/${count50}/${countMiss}]`;

        const count300FC = count300 + countMiss;
        const totalHits = count300FC + count100 + count50;
        const fcAccNum = totalHits > 0
            ? (((count300FC * 300) + (count100 * 100) + (count50 * 50)) / (totalHits * 300) * 100)
            : (score.accuracy * 100);
        const fcAccStr = fcAccNum.toFixed(2);

        const totalScore = score.score ? score.score.toLocaleString() : '0';
        const timeStr = timeAgo(score.created_at || score.ended_at);

        let realPlayResult = null;
        let fcResult = null;

        try {
            [realPlayResult, fcResult] = await Promise.all([
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
        } catch (err) {}

        // Star rating có tính Mod
        const rawStars = realPlayResult?.difficulty?.stars || fcResult?.difficulty?.stars || beatmap.difficulty_rating || 0;
        const starStr = rawStars ? rawStars.toFixed(2) : '?.??';

        // Max Combo & Combo display
        let mapMaxCombo = beatmap?.max_combo || realPlayResult?.difficulty?.maxCombo || fcResult?.difficulty?.maxCombo || 0;
        if (!mapMaxCombo && countMiss === 0) mapMaxCombo = score.max_combo;

        const comboDisplay = mapMaxCombo 
            ? `**x${score.max_combo}/${mapMaxCombo}**` 
            : `**x${score.max_combo}**`;

        // PP display với 2 chữ số thập phân
        const currentPpNum = (score.pp !== undefined && score.pp !== null && score.pp > 0)
            ? score.pp
            : (realPlayResult ? realPlayResult.pp : 0);
        const currentPpStr = currentPpNum.toFixed(2);

        const fcPpNum = fcResult ? fcResult.pp : currentPpNum;
        const fcPpStr = fcPpNum.toFixed(2);

        const isChoke = countMiss > 0 || (mapMaxCombo && score.max_combo < mapMaxCombo * 0.98);

        let ppDisplay = `**${currentPpStr}pp**`;
        if (isChoke && fcPpNum > currentPpNum) {
            ppDisplay = `**${currentPpStr}** (${fcPpStr}pp for ${fcAccStr}% FC)`;
        }

        // Rank server của điểm số này (tra cứu từ position hoặc leaderboard)
        let serverRank = score.position || score.rank_global || score.global_rank;
        if (!serverRank && leaderboardScores.length > 0) {
            const matchIndex = leaderboardScores.findIndex(s => s.id === score.id || (s.user_id === user.id && s.score === score.score));
            if (matchIndex !== -1) serverRank = matchIndex + 1;
        }
        const serverRankStr = serverRank ? ` • 🌐 **#${serverRank.toLocaleString()}**` : '';

        const line1 = `**${index}.** ${rankEmoji} **${modsStr}** Score **[${starStr}★]**`;
        const line2 = `▸ PP ▸ ${ppDisplay} • **${acc}%** • ${comboDisplay} • *${timeStr}*`;
        const line3 = `└ ▸ Score: \`${totalScore}\` • \`${hitsStr}\`${serverRankStr}`;

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
        .setTitle(`${beatmapset.artist} - ${beatmapset.title} [${beatmap.version}]`)
        .setURL(beatmap.url)
        .setThumbnail(beatmapset.covers.list)
        .setDescription(finalDescription)
        .setFooter({ text: `osu! Bancho • Tìm thấy ${scores.length} scores` })
        .setTimestamp();

    return message.reply({ embeds: [listEmbed] });
}
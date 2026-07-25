import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { 
    getBeatmapDetail, 
    getBeatmapLeaderboard, 
    getUserTopPlays, 
    calculateBeatmapPP 
} from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { findBeatmapIdFromChannel } from './helper.js';
import { EMOJIS, getRankEmoji } from '../../config/emojis.js';

/**
 * Lệnh Map (!map)
 */
export async function handleOsuMapCommand(message) {
    await message.channel.sendTyping();
    const beatmapId = await findBeatmapIdFromChannel(message);

    if (!beatmapId) return message.reply("Tui không tìm thấy Beatmap nào trong 50 tin nhắn gần nhất cả!");

    const beatmap = await getBeatmapDetail(beatmapId);
    if (!beatmap) return message.reply("Không lấy được thông tin bài nhạc rồi ông ơi!");

    const set = beatmap.beatmapset;
    const mins = Math.floor(beatmap.total_length / 60);
    const secs = (beatmap.total_length % 60).toString().padStart(2, '0');
    const star = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${set.artist} - ${set.title} [${beatmap.version}] [${star}★]`)
        .setURL(beatmap.url)
        .setThumbnail(set.covers.list)
        .setDescription(
            `⏱️ **${mins}:${secs}** • 🎵 **${beatmap.bpm} BPM** • Max Combo: **${beatmap.max_combo || 'N/A'}x**\n` +
            `📊 \`CS:${beatmap.cs} AR:${beatmap.ar} OD:${beatmap.accuracy} HP:${beatmap.drain}\`\n\n` +
            `👤 Mapper: **${set.creator || 'N/A'}**`
        )
        .setFooter({ text: 'Yue AI • Beatmap Inspector' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

/**
 * Lệnh Leaderboard (!lb)
 */
export async function handleOsuLeaderboardCommand(message) {
    await message.channel.sendTyping();
    const beatmapId = await findBeatmapIdFromChannel(message);

    if (!beatmapId) return message.reply("Tui không tìm thấy Beatmap nào trong 50 tin nhắn gần nhất cả!");

    const data = await getBeatmapLeaderboard(beatmapId);
    if (!data || !data.beatmap) return message.reply("Không lấy được Bảng xếp hạng của bài này rồi!");

    const { beatmap, scores } = data;
    const set = beatmap.beatmapset;

    if (!scores || scores.length === 0) return message.reply(`Bài **${set.title} [${beatmap.version}]** chưa có ai đạt Top Score cả!`);

    const pageSize = 5;
    const totalPages = Math.ceil(scores.length / pageSize);
    let currentPage = 0;

    const generateEmbed = (page) => {
        const start = page * pageSize;
        const currentScores = scores.slice(start, start + pageSize);

        const description = currentScores.map((score, idx) => {
            const index = start + idx + 1;
            const modsArr = score.mods || [];
            const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '+NoMod';
            const rankEmoji = getRankEmoji(score.rank, modsArr);
            const acc = (score.accuracy * 100).toFixed(2);
            const pp = Math.round(score.pp || 0);
            const comboText = beatmap.max_combo ? `**${score.max_combo}**/${beatmap.max_combo}x` : `**${score.max_combo}x**`;

            return `**#${index}** ${rankEmoji} **[${score.user.username}](https://osu.ppy.sh/users/${score.user.id})** • **${modsStr}**\n` +
                `└ ▸ **${pp}pp** • **${acc}%** • ${comboText} • **${score.score.toLocaleString()}**`;
        }).join('\n\n');

        const star = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';

        return new EmbedBuilder()
            .setColor('#f1c40f')
            .setAuthor({ name: `Leaderboard Top Scores`, iconURL: set.covers.list })
            .setTitle(`${set.artist} - ${set.title} [${beatmap.version}] [${star}★]`)
            .setURL(beatmap.url)
            .setThumbnail(set.covers.list)
            .setDescription(description)
            .setFooter({ text: `osu! • Trang ${page + 1}/${totalPages}` })
            .setTimestamp();
    };

    const prevBtn = new ButtonBuilder().setCustomId('lb_prev').setLabel('◀ Trước').setStyle(ButtonStyle.Primary).setDisabled(true);
    const nextBtn = new ButtonBuilder().setCustomId('lb_next').setLabel('Sau ▶').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1);
    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

    const replyMsg = await message.reply({ embeds: [generateEmbed(0)], components: [row] });
    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Nút này của người khác bấm ông ơi! 🙄', ephemeral: true });
        }
        if (interaction.customId === 'lb_prev') currentPage--;
        if (interaction.customId === 'lb_next') currentPage++;

        prevBtn.setDisabled(currentPage === 0);
        nextBtn.setDisabled(currentPage === totalPages - 1);
        await interaction.update({ embeds: [generateEmbed(currentPage)], components: [new ActionRowBuilder().addComponents(prevBtn, nextBtn)] });
    });

    collector.on('end', async () => {
        prevBtn.setDisabled(true);
        nextBtn.setDisabled(true);
        await replyMsg.edit({ components: [new ActionRowBuilder().addComponents(prevBtn, nextBtn)] }).catch(() => { });
    });
}

/**
 * Lệnh NoChoke (!nc)
 */
export async function handleOsuNoChokeCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const data = await getUserTopPlays(username, 100);

    if (!data || !data.user || !data.bestScores) {
        return message.reply(`Không lấy được Top Plays của **${username}** để tính No-Choke rồi!`);
    }

    const { user, bestScores } = data;
    const chokes = [];

    for (let i = 0; i < bestScores.length; i++) {
        const score = bestScores[i];
        const missCount = score.statistics?.count_miss || 0;

        if (missCount > 0) {
            const modsStr = (score.mods || []).join('');
            const fcResult = await calculateBeatmapPP(score.beatmap.id, {
                accuracy: score.accuracy * 100,
                mods: modsStr,
                misses: 0
            });

            if (fcResult && fcResult.pp > (score.pp || 0)) {
                chokes.push({
                    rankIndex: i + 1,
                    score,
                    oldPp: score.pp || 0,
                    newPp: fcResult.pp,
                    diffPp: fcResult.pp - (score.pp || 0),
                    misses: missCount
                });
            }
        }
    }

    if (chokes.length === 0) {
        return message.reply(`**${user.username}** không có bài nào bị Choke trong Top 100 luôn! 👑`);
    }

    let totalOldPp = user.statistics.pp || 0;
    let gainedTotalPp = chokes.reduce((sum, item) => sum + item.diffPp, 0) * 0.22;
    let newTotalPp = totalOldPp + gainedTotalPp;

    const chokesListStr = chokes.slice(0, 5).map(c => {
        const modsStr = (c.score.mods || []).length > 0 ? `+${c.score.mods.join('')}` : '';
        const star = c.score.beatmap.difficulty_rating ? c.score.beatmap.difficulty_rating.toFixed(2) : '?.??';
        const rankEmoji = getRankEmoji(c.score.rank, c.score.mods || []);

        return `**#${c.rankIndex}** ${rankEmoji} [**${c.score.beatmapset.title}**](${c.score.beatmap.url}) **${modsStr}** [${star}★]\n` +
            `└ **${Math.round(c.oldPp)}** → **${Math.round(c.newPp)}pp** | ${EMOJIS.MISS} Bỏ **${c.misses} Miss**`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setAuthor({ name: `Bảng gỡ Choke của ${user.username}`, iconURL: user.avatar_url, url: `https://osu.ppy.sh/users/${user.id}` })
        .setThumbnail(user.avatar_url)
        .setTitle(` ${Math.round(totalOldPp)}pp → ${Math.round(newTotalPp)}pp (+${Math.round(gainedTotalPp)}pp)`)
        .setDescription(`Đã tìm thấy **${chokes.length} bài Choke** trong Top Plays:\n\n${chokesListStr}`)
        .setFooter({ text: 'Yue AI • No-Choke PP Simulator' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

/**
 * Lệnh What If (!wi)
 */
export async function handleOsuWhatIfCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    const addedPp = parseFloat(args[0]);

    if (isNaN(addedPp) || addedPp <= 0) return message.reply("Nhập đúng số PP muốn tính thử đi cha nội! Ví dụ: `!wi 300` 🙄");

    const rawUsername = args.slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawUsername || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const data = await getUserTopPlays(username, 100);

    if (!data || !data.user) return message.reply(`Không lấy được thông tin của **${username}** để tính toán rồi!`);

    const { user, bestScores } = data;
    const currentTotalPp = user.statistics.pp || 0;

    let rawScoresPp = bestScores.map(s => s.pp || 0);
    rawScoresPp.push(addedPp);
    rawScoresPp.sort((a, b) => b - a);

    let newWeightedPp = 0;
    for (let i = 0; i < rawScoresPp.length; i++) newWeightedPp += rawScoresPp[i] * Math.pow(0.95, i);

    let oldWeightedPp = 0;
    for (let i = 0; i < bestScores.length; i++) oldWeightedPp += (bestScores[i].pp || 0) * Math.pow(0.95, i);

    const bonusPp = currentTotalPp - oldWeightedPp;
    const finalCalculatedPp = Math.round(newWeightedPp + bonusPp);
    const ppGained = Math.round(finalCalculatedPp - currentTotalPp);

    const embed = new EmbedBuilder()
        .setColor('#55ffff')
        .setTitle(`🧮 Bảng tính What-If PP của ${user.username}`)
        .setDescription(`Nếu ông set thêm 1 bài **${addedPp}pp** trong Top Plays:`)
        .addFields(
            { name: 'PP Hiện tại', value: `${Math.round(currentTotalPp)} pp`, inline: true },
            { name: '🚀 PP Mới (Dự kiến)', value: `**${finalCalculatedPp} pp**`, inline: true },
            { name: '📈 Tăng thêm', value: `+${ppGained} pp`, inline: true }
        )
        .setFooter({ text: 'Yue AI • osu! PP Calculator' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

/**
 * Lệnh Mô phỏng PP (!pp)
 */
export async function handleOsuCalcPPCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    let modsInput = "";
    let accInput = 100;
    let customBeatmapId = null;

    for (const arg of args) {
        const match = arg.match(/beatmaps\/(\d+)|b\/(\d+)|#osu\/(\d+)/);
        if (match) {
            customBeatmapId = match[1] || match[2] || match[3];
            continue;
        }
        if (/^\d{5,9}$/.test(arg)) {
            customBeatmapId = arg;
            continue;
        }
        if (!isNaN(parseFloat(arg)) && !arg.includes('http')) {
            accInput = parseFloat(arg);
        } else if (!arg.includes('http')) {
            modsInput += arg.toUpperCase().replace('+', '');
        }
    }

    await message.channel.sendTyping();
    const beatmapId = customBeatmapId || await findBeatmapIdFromChannel(message);

    if (!beatmapId) return message.reply("Tui không tìm thấy Beatmap nào để tính PP cả! 🧐");

    const beatmap = await getBeatmapDetail(beatmapId);
    if (!beatmap) return message.reply("Không lấy được thông tin Beatmap rồi ông ơi!");

    const ppCustom = await calculateBeatmapPP(beatmap.id, { accuracy: accInput, mods: modsInput });
    const pp100 = await calculateBeatmapPP(beatmap.id, { accuracy: 100, mods: modsInput });
    const pp95 = await calculateBeatmapPP(beatmap.id, { accuracy: 95, mods: modsInput });

    const modsText = modsInput ? `+${modsInput}` : 'NoMod';

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`🔮 Dự đoán PP: ${beatmap.beatmapset.title} [${beatmap.version}] ${modsText}`)
        .setURL(beatmap.url)
        .setThumbnail(beatmap.beatmapset.covers.list)
        .addFields(
            { name: `🎯 ${accInput}% Acc`, value: `**${Math.round(ppCustom?.pp || 0)} pp**`, inline: true },
            { name: '💯 100% SS', value: `${Math.round(pp100?.pp || 0)} pp`, inline: true },
            { name: '⚡ 95% Acc', value: `${Math.round(pp95?.pp || 0)} pp`, inline: true }
        )
        .setFooter({ text: 'Yue AI • rosu-pp Simulated Calculator' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}
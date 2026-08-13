import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import {
    getBeatmapDetail,
    getBeatmapLeaderboard,
    getUserTopPlays,
    calculateBeatmapPP,
    timeAgo
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

    const totalSecs = beatmap.total_length || 0;
    const drainSecs = beatmap.hit_length || totalSecs;
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    const drainMins = Math.floor(drainSecs / 60);
    const drainSecsStr = (drainSecs % 60).toString().padStart(2, '0');
    const lengthStr = `${mins}:${secs}`;
    const drainStr = `${drainMins}:${drainSecsStr}`;

    const starStr = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';

    const countCircles = beatmap.count_circles || 0;
    const countSliders = beatmap.count_sliders || 0;
    const countSpinners = beatmap.count_spinners || 0;
    const totalObjects = countCircles + countSliders + countSpinners;

    // ⚡ ĐIỂM ĐỘC ĐÁO CỦA YUE: Tính toán Bảng so sánh PP Đa Mod cho 5 mốc Acc (100%, 99%, 98%, 95%, 90%) song song
    const accs = [100, 99, 98, 95, 90];

    const [nmResults, dtResults, hrResults, hddtResults] = await Promise.all([
        Promise.all(accs.map(acc => calculateBeatmapPP(beatmap.id, { accuracy: acc }))),
        Promise.all(accs.map(acc => calculateBeatmapPP(beatmap.id, { accuracy: acc, mods: 'DT' }))),
        Promise.all(accs.map(acc => calculateBeatmapPP(beatmap.id, { accuracy: acc, mods: 'HR' }))),
        Promise.all(accs.map(acc => calculateBeatmapPP(beatmap.id, { accuracy: acc, mods: 'HDDT' })))
    ]);

    const nmStar = (nmResults[0]?.difficulty?.stars || beatmap.difficulty_rating || 0).toFixed(2);
    const dtStar = (dtResults[0]?.difficulty?.stars || 0).toFixed(2);
    const hrStar = (hrResults[0]?.difficulty?.stars || 0).toFixed(2);
    const hddtStar = (hddtResults[0]?.difficulty?.stars || 0).toFixed(2);

    const formatPp = (res) => (res?.pp || 0).toFixed(2).padStart(6);

    const rows = accs.map((acc, i) => {
        const accLabel = `${acc}%`.padEnd(4);
        return `${accLabel} |${formatPp(nmResults[i])} |${formatPp(dtResults[i])} |${formatPp(hrResults[i])} |${formatPp(hddtResults[i])}`;
    });

    const header = "Acc  | NoMod | +DT   | +HR   | +HDDT";
    const divider = "-----+-------+-------+-------+------";

    const ppMatrix = "```text\n" + header + "\n" + divider + "\n" + rows.join('\n') + "\n```";

    const starsLine =
        `⭐ **Mod Stars**:\n` +
        `• NoMod: **${nmStar}★** • +DT: **${dtStar}★**\n` +
        `• +HR: **${hrStar}★** • +HDDT: **${hddtStar}★**`;

    // 💡 Lời khuyên thông minh độc quyền từ Yue
    const dtVal = dtResults[0]?.pp || 0;
    const nmVal = nmResults[0]?.pp || 0;
    let yueInsight = '';
    if (dtVal > nmVal * 2.2) {
        yueInsight = `💡 **Yue Insight**: Map này là mỏ vàng PP khi bật **+DT** / **+HDDT**! Đạt 100% SS +DT (**${dtStar}★**) sẽ mang về tới **${Math.round(dtVal)}PP**!`;
    } else if (beatmap.difficulty_rating >= 6.0) {
        yueInsight = `💡 **Yue Insight**: Map độ khó cao **[${starStr}★]**! Cố gắng giữ FC NoMod để hốt trọn **${Math.round(nmVal)}PP** nhé!`;
    } else {
        yueInsight = `💡 **Yue Insight**: Map vừa sức **[${starStr}★]**. FC NoMod cho **${Math.round(nmVal)}PP**, thử gắn thêm **+DT** lấy **${Math.round(dtVal)}PP** (**${dtStar}★**) xem sao!`;
    }

    const description =
        `🎵 [Song Preview](https://b.ppy.sh/preview/${set.id}.mp3) • 🖼️ [Background](${set.covers.cover}) • 🎬 [Map Preview](https://ordr.issou.best/render/osu/${beatmap.id})\n\n` +
        `🔴 **[${beatmap.version}]** \`[${starStr}★]\`\n` +
        `• **Combo**: **${(beatmap.max_combo || 0).toLocaleString()}x** • **BPM**: **${beatmap.bpm}** • **Objects**: **${totalObjects}**\n` +
        `• **Length**: **${lengthStr}** (${drainStr})\n` +
        `• \`CS:${beatmap.cs}\` \`AR:${beatmap.ar}\` \`OD:${beatmap.accuracy}\` \`HP:${beatmap.drain}\` \`Spinners:${countSpinners}\` \n\n` +
        `${starsLine}\n\n` +
        `📊 **Bảng dự đoán PP Đa Mod (Multi-Mod Matrix)**:\n` +
        ppMatrix + `\n` +
        `${yueInsight}\n\n` +
        `📥 **Tải bài nhạc**:\n` +
        `• [Sayobot](https://sayobot.cn/g/${set.id}) • [Chimu](https://chimu.moe/d/${set.id}) • [Beatconnect](https://beatconnect.io/b/${set.id})\n` +
        `• [Nerinyan](https://nerinyan.moe/d/${set.id}) • [Catboy](https://catboy.best/d/${set.id}) • [osu!site](https://osu.ppy.sh/beatmapsets/${set.id})\n\n` +
        `❤️ **${(set.favourite_count || 0).toLocaleString()}** • ▶️ **${(set.play_count || 0).toLocaleString()}** • **${set.status || 'Ranked'}**`;

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setAuthor({
            name: `Beatmap Inspector • Created by ${set.creator || 'N/A'}`,
            iconURL: set.covers.list,
            url: `https://osu.ppy.sh/users/${set.user_id || ''}`
        })
        .setTitle(`${set.artist} - ${set.title}`)
        .setURL(beatmap.url)
        .setThumbnail(set.covers.list)
        .setDescription(description)
        .setFooter({ text: 'Yue AI • Beatmap Intelligence & Multi-Mod Matrix' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

/**
 * Lệnh Leaderboard (!lb / .lb) - Hỗ trợ 4 Option: Global, VN (Country), Mod, VN + Mod
 */
export async function handleOsuLeaderboardCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();

    // 1. Phân tích Beatmap ID từ tham số hoặc kênh chat
    let beatmapId = null;
    const urlMatch = rawArgs.match(/beatmaps\/(\d+)|b\/(\d+)|#osu\/(\d+)/);
    if (urlMatch) {
        beatmapId = urlMatch[1] || urlMatch[2] || urlMatch[3];
    } else {
        const idMatch = rawArgs.match(/\b\d{5,9}\b/);
        if (idMatch) beatmapId = idMatch[0];
    }

    if (!beatmapId) {
        beatmapId = await findBeatmapIdFromChannel(message);
    }

    if (!beatmapId) return message.reply("Tui không tìm thấy Beatmap nào trong 50 tin nhắn gần nhất để xem Bảng xếp hạng cả!");

    // 2. Phân tích Tùy chọn Quốc gia (Việt Nam / Country)
    const lowerArgs = rawArgs.toLowerCase();
    const isCountryVN = lowerArgs.includes('vn') || lowerArgs.includes('vietnam') || lowerArgs.includes('viet nam') || lowerArgs.includes('country');
    const countryFilter = isCountryVN ? 'VN' : null;

    // 3. Phân tích Mod Filter (+HDDT, +HR, +DT, v.v.)
    let mods = [];
    const modMatch = rawArgs.match(/\+([A-Za-z]{2,8})/);
    if (modMatch) {
        const modStr = modMatch[1].toUpperCase();
        for (let i = 0; i < modStr.length; i += 2) {
            const m = modStr.substring(i, i + 2);
            if (['NM', 'NF', 'EZ', 'TD', 'HD', 'HR', 'SD', 'DT', 'HT', 'NC', 'FL', 'SO'].includes(m)) {
                if (m !== 'NM') mods.push(m);
            }
        }
    }

    await message.channel.sendTyping();
    const data = await getBeatmapLeaderboard(beatmapId, { mods, country: countryFilter });

    if (!data || !data.beatmap) return message.reply("Không lấy được Bảng xếp hạng của bài này rồi!");

    const { beatmap, scores } = data;
    const set = beatmap.beatmapset;

    // Tiêu đề tùy thuộc vào option được chọn
    const modLabel = mods.length > 0 ? `+${mods.join('')}` : '';
    let scopeLabel = '🌐 Global Leaderboard';
    if (isCountryVN && modLabel) {
        scopeLabel = `🇻🇳 Leaderboard Việt Nam (${modLabel})`;
    } else if (isCountryVN) {
        scopeLabel = `🇻🇳 Leaderboard Việt Nam`;
    } else if (modLabel) {
        scopeLabel = `⚡ Global Mod Leaderboard (${modLabel})`;
    }

    if (!scores || scores.length === 0) {
        const filterDesc = [
            isCountryVN ? 'Việt Nam' : null,
            modLabel ? `dùng mod **${modLabel}**` : null
        ].filter(Boolean).join(' ');

        return message.reply(`Bài **${set.title} [${beatmap.version}]** chưa có người chơi ${filterDesc || 'quốc tế'} nào trong Top Leaderboard cả! 👑`);
    }

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
            const comboText = beatmap.max_combo ? `**x${score.max_combo}**/${beatmap.max_combo}` : `**x${score.max_combo}**`;
            const timeStr = score.created_at ? timeAgo(score.created_at) : '';
            const scoreUrl = score.id ? `https://osu.ppy.sh/scores/osu/${score.id}` : beatmap.url;

            const stats = score.statistics || {};
            const c300 = stats.count_300 || stats.great || 0;
            const c100 = stats.count_100 || stats.ok || 0;
            const c50 = stats.count_50 || stats.meh || 0;
            const cMiss = stats.count_miss || stats.miss || 0;
            const hitsStr = `\`[${c300}/${c100}/${c50}/${cMiss}]\``;

            const line1 = `**#${index}** ${rankEmoji} **[${score.user.username}](https://osu.ppy.sh/users/${score.user.id})** • **${modsStr}**`;
            const line2 = `▸ **${pp}pp** • **${acc}%** • ${comboText} • *${timeStr}*`;
            const line3 = `▸ **${(score.score || 0).toLocaleString()}** • ${hitsStr} • [Score](${scoreUrl})`;

            return `${line1}\n${line2}\n${line3}`;
        }).join('\n\n');

        const star = beatmap.difficulty_rating ? beatmap.difficulty_rating.toFixed(2) : '?.??';

        return new EmbedBuilder()
            .setColor('#f1c40f')
            .setAuthor({ name: scopeLabel, iconURL: set.covers.list })
            .setTitle(`${set.artist} - ${set.title} [${beatmap.version}] [${star}★]`)
            .setURL(beatmap.url)
            .setThumbnail(set.covers.list)
            .setDescription(description)
            .setFooter({ text: `osu! Bancho • Trang ${page + 1}/${totalPages}` })
            .setTimestamp();
    };

    const prevBtn = new ButtonBuilder().setCustomId('lb_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true);
    const nextBtn = new ButtonBuilder().setCustomId('lb_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1);
    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

    const replyMsg = await message.reply({ embeds: [generateEmbed(0)], components: [row] });
    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Nút me này của người khác bấm ông ơi! 🙄', ephemeral: true });
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

    if (!data || !data.user || !data.bestScores || data.bestScores.length === 0) {
        return message.reply(`Không lấy được Top Plays của **${username}** để tính No-Choke rồi!`);
    }

    const { user, bestScores } = data;

    // ⚡ 1. Lọc ra các bài bị Choke trong Top 60 (Nơi đóng góp 95%+ trọng số PP của Profile)
    const chokedItems = bestScores
        .slice(0, 60)
        .map((score, idx) => ({ score, index: idx + 1 }))
        .filter(item => {
            const misses = item.score.statistics?.count_miss || item.score.statistics?.miss || 0;
            const mapMaxCombo = item.score.beatmap?.max_combo;
            return misses > 0 || (mapMaxCombo && item.score.max_combo < mapMaxCombo * 0.95);
        });

    if (chokedItems.length === 0) {
        return message.reply(`**${user.username}** không có bài nào bị Choke trong Top 100 luôn! 👑`);
    }

    // ⚡ 2. Tính toán PP song song bằng Promise.all (Chỉ mất 2-3 giây thay vì >1 phút)
    const processedChokes = await Promise.all(chokedItems.map(async (item) => {
        const { score } = item;
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

        const modsArr = score.mods || [];
        const cleanMods = modsArr.join('');

        let fcResult = null;
        try {
            fcResult = await calculateBeatmapPP(score.beatmap.id, {
                accuracy: fcAccNum,
                n100: count100,
                n50: count50,
                misses: 0,
                mods: cleanMods
            });
        } catch (e) { }

        const origPp = score.pp || 0;
        const fcPp = fcResult ? fcResult.pp : origPp;
        const diffPp = Math.max(0, fcPp - origPp);

        return {
            ...item,
            fcAccNum,
            fcResult,
            origPp,
            fcPp,
            diffPp,
            count300,
            count100,
            count50,
            countMiss,
            count300FC,
            totalHits
        };
    }));

    // Lọc chỉ lấy các bài có PP tăng thật sự (> 0.5pp)
    const validChokes = processedChokes.filter(c => c.diffPp > 0.5);

    if (validChokes.length === 0) {
        return message.reply(`**${user.username}** không có bài Choke nào cải thiện được PP đáng kể!`);
    }

    // Sắp xếp các bài Choke theo PP tăng thêm giảm dần
    validChokes.sort((a, b) => b.diffPp - a.diffPp);

    // ⚡ 3. Tính toán tổng PP mới của User bằng công thức Weighted PP chuẩn của osu! (0.95^i)
    const origWeighted = bestScores.reduce((sum, s, i) => sum + (s.pp || 0) * Math.pow(0.95, i), 0);
    const bonusPp = Math.max(0, (user.statistics?.pp || 0) - origWeighted);

    const chokeMap = new Map();
    validChokes.forEach(c => chokeMap.set(c.score.id || c.index, c.fcPp));

    const newPpList = bestScores.map(s => chokeMap.get(s.id) || s.pp || 0).sort((a, b) => b - a);
    const newWeighted = newPpList.reduce((sum, pp, i) => sum + pp * Math.pow(0.95, i), 0);

    const totalOldPp = user.statistics?.pp || 0;
    const newTotalPp = newWeighted + bonusPp;
    const gainedTotalPp = Math.max(0, newTotalPp - totalOldPp);

    // ⚡ 4. Phân trang Embed & Buttons chuẩn 100% giao diện owo! bot (5 bài / trang)
    const pageSize = 5;
    const totalPages = Math.ceil(validChokes.length / pageSize);
    let currentPage = 0;

    const generateEmbed = (page) => {
        const start = page * pageSize;
        const currentChokes = validChokes.slice(start, start + pageSize);

        const chokeLines = currentChokes.map((item, idx) => {
            const { score, index, fcAccNum, fcResult, origPp, fcPp, count300, count100, count50, countMiss, count300FC, totalHits } = item;
            const modsArr = score.mods || [];
            const modsStr = modsArr.length > 0 ? `+${modsArr.join('')}` : '+NoMod';
            const cleanMods = modsArr.join('');
            const origEmoji = getRankEmoji(score.rank, modsArr);

            // Tính Grade khi FC
            let fcRank = 'A';
            const ratio300 = count300FC / (totalHits || 1);
            const ratio50 = (count50) / (totalHits || 1);
            const isHD = cleanMods.includes('HD');
            const isFL = cleanMods.includes('FL');

            if (ratio300 === 1) {
                fcRank = (isHD || isFL) ? 'XH' : 'X';
            } else if (ratio300 > 0.9 && ratio50 < 0.01) {
                fcRank = (isHD || isFL) ? 'SH' : 'S';
            } else if (ratio300 > 0.8) {
                fcRank = 'A';
            } else {
                fcRank = 'B';
            }
            const fcEmoji = getRankEmoji(fcRank, modsArr);

            const origAccStr = (score.accuracy * 100).toFixed(2);
            const fcAccStr = fcAccNum.toFixed(2);

            const origPpStr = origPp.toFixed(2);
            const fcPpStr = fcPp.toFixed(2);

            const realMaxCombo = score.beatmap?.max_combo || fcResult?.difficulty?.maxCombo || 0;
            const comboBefore = `x${score.max_combo.toLocaleString()}`;
            const comboAfter = realMaxCombo > 0 ? `x${realMaxCombo.toLocaleString()}/${realMaxCombo.toLocaleString()}` : `x${score.max_combo.toLocaleString()}`;

            const hitsBefore = `[${count300}/${count100}/${count50}/${countMiss}]`;
            const hitsAfter = `[${count300FC}/${count100}/${count50}/0]`;

            const rawStars = fcResult?.difficulty?.stars || score.beatmap?.difficulty_rating || 0;
            const starStr = rawStars ? rawStars.toFixed(2) : '?.??';

            // Tính thông số map có Mod (Clock Rate, AR, OD, HP, CS, BPM, Length)
            const isDT = cleanMods.includes('DT') || cleanMods.includes('NC');
            const isHT = cleanMods.includes('HT');
            const isHR = cleanMods.includes('HR');
            const isEZ = cleanMods.includes('EZ');
            const clockRate = isDT ? 1.5 : (isHT ? 0.75 : 1.0);

            let moddedAR = score.beatmap?.ar;
            if (fcResult?.difficulty?.ar !== undefined) {
                moddedAR = fcResult.difficulty.ar;
            } else if (isHR) {
                moddedAR = Math.min(10, (score.beatmap?.ar || 0) * 1.4);
            } else if (isEZ) {
                moddedAR = (score.beatmap?.ar || 0) * 0.5;
            }
            const arStr = (moddedAR !== undefined && moddedAR !== null) ? Number(moddedAR).toFixed(1) : '?.?';

            let moddedOD = score.beatmap?.accuracy;
            if (fcResult?.difficulty?.greatHitWindow !== undefined) {
                moddedOD = (80 - fcResult.difficulty.greatHitWindow) / 6;
            } else if (isHR) {
                moddedOD = Math.min(10, (score.beatmap?.accuracy || 0) * 1.4);
            } else if (isEZ) {
                moddedOD = (score.beatmap?.accuracy || 0) * 0.5;
            }
            const odStr = (moddedOD !== undefined && moddedOD !== null) ? Number(moddedOD).toFixed(1) : '?.?';

            let moddedHP = score.beatmap?.drain;
            if (fcResult?.difficulty?.hp !== undefined) {
                moddedHP = fcResult.difficulty.hp;
            } else if (isHR) {
                moddedHP = Math.min(10, (score.beatmap?.drain || 0) * 1.4);
            } else if (isEZ) {
                moddedHP = (score.beatmap?.drain || 0) * 0.5;
            }
            const hpStr = (moddedHP !== undefined && moddedHP !== null) ? Number(moddedHP).toFixed(1) : '?.?';

            let moddedCS = score.beatmap?.cs;
            if (isHR) {
                moddedCS = Math.min(10, (score.beatmap?.cs || 0) * 1.3);
            } else if (isEZ) {
                moddedCS = (score.beatmap?.cs || 0) * 0.5;
            }
            const csStr = (moddedCS !== undefined && moddedCS !== null) ? Number(moddedCS).toFixed(1) : '?.?';

            const moddedBPM = Math.round((score.beatmap?.bpm || 0) * clockRate);
            const totalSecs = Math.round((score.beatmap?.total_length || 0) / clockRate);
            const mins = Math.floor(totalSecs / 60);
            const secs = (totalSecs % 60).toString().padStart(2, '0');
            const lengthStr = `${mins}:${secs}`;

            const line1 = `**${start + idx + 1})** **[#${index}]** **[${score.beatmapset.title} [${score.beatmap.version}]](${score.beatmap.url})** **${modsStr}** \`[${starStr}★]\``;
            const line2 = `▸ ${origEmoji} ➜ ${fcEmoji} ▸ **${origPpStr}** ➜ **${fcPpStr}PP** ▸ **${origAccStr}%** ➜ **${fcAccStr}%**`;
            const line3 = `▸ **${comboBefore}** ➜ **${comboAfter}** ▸ \`${hitsBefore}\` ➜ \`${hitsAfter}\``;
            const line4 = `▸ \` ${lengthStr}\` ▸ \` ${moddedBPM}\` ▸ \`AR ${arStr} OD ${odStr} HP ${hpStr} CS ${csStr}\``;

            return `${line1}\n${line2}\n${line3}\n${line4}`;
        });

        return new EmbedBuilder()
            .setColor('#e74c3c')
            .setAuthor({
                name: `Top No-Choke osu! Standard Plays for [${user.username}]`,
                iconURL: user.avatar_url,
                url: `https://osu.ppy.sh/users/${user.id}`
            })
            .setTitle(`Total pp: ${totalOldPp.toFixed(2)} ➜ ${newTotalPp.toFixed(2)}pp (+${gainedTotalPp.toFixed(2)})`)
            .setThumbnail(user.avatar_url)
            .setDescription(chokeLines.join('\n\n'))
            .setFooter({
                text: `On osu! Bancho Server | Page ${page + 1} of ${totalPages}`,
                // iconURL: 'https://osu.ppy.sh/favicon.ico'
            })
            .setTimestamp();
    };

    if (totalPages <= 1) {
        return message.reply({ embeds: [generateEmbed(0)] });
    }

    const buildActionRow = (page) => {
        const prevBtn = new ButtonBuilder()
            .setCustomId('nc_prev')
            .setEmoji(EMOJIS.NAV_PREV || '◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);

        const nextBtn = new ButtonBuilder()
            .setCustomId('nc_next')
            .setEmoji(EMOJIS.NAV_NEXT || '▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1);

        return new ActionRowBuilder().addComponents(prevBtn, nextBtn);
    };

    const replyMsg = await message.reply({ embeds: [generateEmbed(0)], components: [buildActionRow(0)] });
    const collector = replyMsg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Nút này của người khác bấm ông ơi! 🙄', ephemeral: true });
        }
        if (interaction.customId === 'nc_prev') currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId === 'nc_next') currentPage = Math.min(totalPages - 1, currentPage + 1);

        await interaction.update({ embeds: [generateEmbed(currentPage)], components: [buildActionRow(currentPage)] });
    });

    collector.on('end', async () => {
        await replyMsg.edit({ components: [] }).catch(() => { });
    });
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
import { EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { getUserProfile, getUserRecentPlay, getUserTopPlays, getUserBeatmapScores } from '../services/osu/osuService.js';
import { createRenderJob, checkRenderStatus } from '../services/osu/ordrService.js';
import { askYue } from '../services/aiService.js';

/**
 * Lệnh 1: Soi Profile osu! (!osu / !profile [username])
 */
export async function handleOsuProfileCommand(message) {
    const args = message.content.split(' ').slice(1);
    const username = args.join(' ').trim() || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();

    const profile = await getUserProfile(username);

    if (!profile) {
        return message.reply(`Không tìm thấy người chơi **${username}** trên Bancho ông ơi! Check lại tên xem gõ đúng chưa nhé. 🧐`);
    }

    const statistics = profile.statistics;
    const globalRank = statistics.global_rank ? `#${statistics.global_rank.toLocaleString()}` : 'Unranked';
    const countryRank = statistics.country_rank ? `#${statistics.country_rank.toLocaleString()}` : 'Unranked';
    const pp = statistics.pp ? `${Math.round(statistics.pp).toLocaleString()} pp` : '0 pp';
    const accuracy = statistics.hit_accuracy ? `${statistics.hit_accuracy.toFixed(2)}%` : '0%';

    const embed = new EmbedBuilder()
        .setColor('#ff66aa')
        .setAuthor({
            name: `Thông tin osu! standard của ${profile.username}`,
            iconURL: profile.avatar_url,
            url: `https://osu.ppy.sh/users/${profile.id}`
        })
        .setThumbnail(profile.avatar_url)
        .addFields(
            { name: '🌐 Global Rank', value: globalRank, inline: true },
            { name: '🇻🇳 Country Rank', value: countryRank, inline: true },
            { name: '⚡ Performance', value: pp, inline: true },
            { name: '🎯 Accuracy', value: accuracy, inline: true },
            { name: '🎮 Play Count', value: statistics.play_count?.toLocaleString() || '0', inline: true },
            { name: '⏱️ Play Time', value: statistics.play_time ? `${Math.floor(statistics.play_time / 3600)} hrs` : '0 hrs', inline: true }
        )
        .setFooter({ text: 'Yue AI • osu! API v2 Integration' })
        .setTimestamp();

    const promptForAI = `Đưa ra 1 câu nhận xét ngắn (chuẩn style Neuro-sama/khịa nhẹ) về thông số osu! sau của ${profile.username}: Rank ${globalRank}, ${pp}, Accuracy ${accuracy}, Playcount ${statistics.play_count}.
LƯU Ý CÚ PHÁP DISCORD: Nếu có dùng "-# text" để thì thầm/khịa nhỏ ở cuối, BẮT BỘC phải xuống dòng trước khi viết "-#".`;
    
    let aiComment = "";
    try {
        aiComment = await askYue(message.author.id, message.author.username, promptForAI, message);
    } catch (e) {
        aiComment = "Chỉ số này... cũng ra gì đấy! 🍿";
    }

    return message.reply({ content: aiComment, embeds: [embed] });
}

/**
 * Lệnh 2: Xem trận vừa đánh (!rs / !recent [username])
 */
export async function handleOsuRecentCommand(message) {
    const args = message.content.split(' ').slice(1);
    const username = args.join(' ').trim() || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();

    const data = await getUserRecentPlay(username);

    if (!data || !data.user) {
        return message.reply(`Không tìm thấy người chơi **${username}** ông ơi! 🧐`);
    }

    if (!data.score) {
        return message.reply(`**${data.user.username}** chưa chơi bài nào trong vòng 24h qua cả! Lười thế không biết. 💤`);
    }

    const score = data.score;
    const beatmap = score.beatmap;
    const beatmapset = score.beatmapset;

    const rankGrade = score.rank;
    const mods = score.mods && score.mods.length > 0 ? `+${score.mods.join('')}` : 'NoMod';
    const acc = (score.accuracy * 100).toFixed(2);
    const maxCombo = score.max_combo;
    const isPassed = score.passed ? "Pass" : "Fail (Oẹo)";

    const embed = new EmbedBuilder()
        .setColor(score.passed ? '#55ff55' : '#ff5555')
        .setAuthor({
            name: `Trận vừa chơi của ${data.user.username} [${isPassed}]`,
            iconURL: data.user.avatar_url,
            url: `https://osu.ppy.sh/users/${data.user.id}`
        })
        .setTitle(`${beatmapset.title} [${beatmap.version}] ${mods}`)
        .setURL(beatmap.url)
        .setThumbnail(beatmapset.covers.list)
        .addFields(
            { name: '🏆 Rank', value: `**${rankGrade}**`, inline: true },
            { name: '🎯 Acc', value: `${acc}%`, inline: true },
            { name: '🔥 Combo', value: `${maxCombo}x`, inline: true },
            { name: '💯 Score', value: score.score.toLocaleString(), inline: true },
            { name: '⚡ PP', value: score.pp ? `${Math.round(score.pp)}pp` : '0pp', inline: true }
        )
        .setFooter({ text: 'Yue AI • osu! API v2 Integration' })
        .setTimestamp();

    const promptForAI = `Đưa ra 1 câu nhận xét ngắn (chuẩn style Neuro-sama/khịa) về trận đấu osu! vừa rồi của ${data.user.username}: Bài "${beatmapset.title}", Rank **${rankGrade}**, Acc ${acc}%, Max Combo ${maxCombo}x, Kết quả: ${isPassed}.
LƯU Ý CÚ PHÁP DISCORD: Nếu có dùng "-# text" để thì thầm/khịa nhỏ ở cuối, BẮT BỘC phải xuống dòng trước khi viết "-#".`;

    let aiComment = "";
    try {
        aiComment = await askYue(message.author.id, message.author.username, promptForAI, message);
    } catch (e) {
        aiComment = score.passed ? "Cũng ra gì đấy! 🍿" : "Mới vào bài đã oẹo rồi à? Non! 😜";
    }

    return message.reply({ content: aiComment, embeds: [embed] });
}

/**
 * Lệnh 3: Xem Top Plays (!top / !t [username])
 */
export async function handleOsuTopCommand(message) {
    const args = message.content.split(' ').slice(1);
    const username = args.join(' ').trim() || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();

    const data = await getUserTopPlays(username, 5);

    if (!data || !data.user) {
        return message.reply(`Không tìm thấy người chơi **${username}** ông ơi! 🧐`);
    }

    if (!data.bestScores || data.bestScores.length === 0) {
        return message.reply(`**${data.user.username}** chưa có bài Top Play nào cả!`);
    }

    const { user, bestScores } = data;

    const fields = bestScores.map((score, index) => {
        const mods = score.mods && score.mods.length > 0 ? `+${score.mods.join('')}` : 'NoMod';
        const acc = (score.accuracy * 100).toFixed(2);
        const pp = score.pp ? `${Math.round(score.pp)}pp` : '0pp';
        return {
            name: `#${index + 1} - ${score.beatmapset.title} [${score.beatmap.version}] ${mods}`,
            value: `🏆 Rank: **${score.rank}** | 🎯 Acc: **${acc}%** | ⚡ PP: **${pp}** | 🔥 Combo: ${score.max_combo}x`,
            inline: false
        };
    });

    const embed = new EmbedBuilder()
        .setColor('#ff66aa')
        .setAuthor({
            name: `Top Plays nổi bật của ${user.username}`,
            iconURL: user.avatar_url,
            url: `https://osu.ppy.sh/users/${user.id}`
        })
        .setThumbnail(user.avatar_url)
        .addFields(fields)
        .setFooter({ text: 'Yue AI • osu! API v2 Integration' })
        .setTimestamp();

    const topPp = Math.round(bestScores[0].pp || 0);
    const promptForAI = `Đưa ra 1 câu nhận xét ngắn (chuẩn style Neuro-sama/khịa) về Top Play cao nhất của ${user.username}: Bài Top 1 đạt ${topPp}pp, Acc ${(bestScores[0].accuracy * 100).toFixed(2)}%.
LƯU Ý CÚ PHÁP DISCORD: Nếu có dùng "-# text" để thì thầm/khịa nhỏ ở cuối, BẮT BỘC phải xuống dòng trước khi viết "-#".`;

    let aiComment = "";
    try {
        aiComment = await askYue(message.author.id, message.author.username, promptForAI, message);
    } catch (e) {
        aiComment = "Top Play này cũng ra gì đấy! 🍿";
    }

    return message.reply({ content: aiComment, embeds: [embed] });
}

/**
 * Lệnh 4: Dự đoán What If PP (!wi / !whatif <pp> [username])
 */
export async function handleOsuWhatIfCommand(message) {
    const args = message.content.split(' ').slice(1);
    const addedPp = parseFloat(args[0]);

    if (isNaN(addedPp) || addedPp <= 0) {
        return message.reply("Nhập đúng số PP muốn tính thử đi cha nội! Ví dụ: `!wi 300` hoặc `!wi 300 [katashi]` 🙄");
    }

    const usernameInput = args.slice(1).join(' ').trim();
    const username = usernameInput || message.member?.displayName || message.author.username;
    
    await message.channel.sendTyping();

    const data = await getUserTopPlays(username, 100);

    if (!data || !data.user) {
        return message.reply(`Không lấy được thông tin của **${username}** để tính toán rồi! Check lại tên xem đúng chưa nhé.`);
    }

    const { user, bestScores } = data;
    const currentTotalPp = user.statistics.pp || 0;

    let rawScoresPp = bestScores.map(s => s.pp || 0);
    rawScoresPp.push(addedPp);
    rawScoresPp.sort((a, b) => b - a);

    let newWeightedPp = 0;
    for (let i = 0; i < rawScoresPp.length; i++) {
        newWeightedPp += rawScoresPp[i] * Math.pow(0.95, i);
    }

    let oldWeightedPp = 0;
    for (let i = 0; i < bestScores.length; i++) {
        oldWeightedPp += (bestScores[i].pp || 0) * Math.pow(0.95, i);
    }
    const bonusPp = currentTotalPp - oldWeightedPp;
    const finalCalculatedPp = Math.round(newWeightedPp + bonusPp);
    const ppGained = Math.round(finalCalculatedPp - currentTotalPp);

    const embed = new EmbedBuilder()
        .setColor('#55ffff')
        .setTitle(`🧮 Bảng tính What-If PP của ${user.username}`)
        .setDescription(`Nếu ông set thêm 1 bài **${addedPp}pp** trong Top Plays:`)
        .addFields(
            { name: '⚡ PP Hiện tại', value: `${Math.round(currentTotalPp)} pp`, inline: true },
            { name: '🚀 PP Mới (Dự kiến)', value: `**${finalCalculatedPp} pp**`, inline: true },
            { name: '📈 Tăng thêm', value: `+${ppGained} pp`, inline: true }
        )
        .setFooter({ text: 'Yue AI • osu! PP Calculator' })
        .setTimestamp();

    const promptForAI = `Viết 1 câu khịa lém lỉnh ngắn kiểu Neuro-sama khi ${user.username} muốn cày thêm bài ${addedPp}pp để tăng +${ppGained}pp tổng.
LƯU Ý CÚ PHÁP DISCORD: BẮT BỘC xuống dòng trước khi dùng "-# text".`;

    let aiComment = "";
    try {
        aiComment = await askYue(message.author.id, message.author.username, promptForAI, message);
    } catch (e) {
        aiComment = "Mơ đẹp đấy, cày ra được bài đó rồi hãy nói chuyện tiếp nha! 😜";
    }

    return message.reply({ content: aiComment, embeds: [embed] });
}

/**
 * Lệnh 5: Render Replay qua o!rdr (!render [đính kèm file .osr])
 */
export async function handleOsuRenderCommand(message) {
    const attachment = message.attachments.first();

    if (!attachment || !attachment.name.endsWith('.osr')) {
        return message.reply("Bó tay! Ông phải đính kèm (upload) một file replay **.osr** thì tui mới render được chứ! 🎬");
    }

    const statusMsg = await message.reply("🎬 Đã nhận file replay! Đang gửi lên o!rdr để render video, ông chờ tí nhé... ⏳");

    try {
        // Tải file .osr về buffer
        const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(response.data);

        const username = message.member?.displayName || message.author.username;
        const renderId = await createRenderJob(fileBuffer, attachment.name, username);

        if (!renderId) {
            return await statusMsg.edit("❌ Lỗi không thể tạo job render trên o!rdr rồi cha nội!");
        }

        // Vòng lặp check trạng thái (tối đa 3 phút)
        let isDone = false;
        let attempts = 0;

        while (!isDone && attempts < 36) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Chờ 5s check 1 lần
            attempts++;

            const statusData = await checkRenderStatus(renderId);
            if (!statusData) continue;

            if (statusData.progress) {
                await statusMsg.edit(`🎬 Đang render replay... (${statusData.progress}) ⏳`);
            }

            if (statusData.videoUrl) {
                isDone = true;
                const embed = new EmbedBuilder()
                    .setColor('#ffaa00')
                    .setTitle('🎬 VIDEO REPLAY OSU! ĐÃ RENDER XONG!')
                    .setURL(statusData.videoUrl)
                    .setDescription(`[👉 Bấm vào đây để xem trực tiếp video](${statusData.videoUrl})`)
                    .setFooter({ text: 'Rendered via o!rdr • Yue AI' })
                    .setTimestamp();

                return await statusMsg.edit({
                    content: `Replay của ông **${username}** render xong rồi nhé! 🍿\n${statusData.videoUrl}`,
                    embeds: [embed]
                });
            }
        }

        if (!isDone) {
            return await statusMsg.edit("⏰ Hàng chờ o!rdr đang quá tải rồi, lâu quá! Khi nào xong ông lên trang web o!rdr check lại giúp tui nhé.");
        }

    } catch (error) {
        console.error("❌ Lỗi xử lý render:", error);
        return await statusMsg.edit("💥 Lỗi trong quá trình render replay rồi!");
    }
}
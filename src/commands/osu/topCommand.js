import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { getUserTopPlays, calculateBeatmapPP, getBeatmapDetail, timeAgo } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { buildDetailedScoreEmbed } from './embedBuilder.js';
import { getRankEmoji, EMOJIS } from '../../config/emojis.js';

export async function handleOsuTopCommand(message) {
    const rawContent = message.content.trim();
    const parts = rawContent.split(/ +/);
    const commandToken = parts[0];
    let remainingArgs = parts.slice(1);

    let targetIndex = null;

    // Pattern 1: .t5 / .top5 / !t5 / !top5
    const matchAttached = commandToken.match(/^[.!><]?(?:top|t)(\d+)$/i);
    if (matchAttached) {
        targetIndex = parseInt(matchAttached[1]);
    } else if (remainingArgs[0] && /^\d+$/.test(remainingArgs[0])) {
        // Pattern 2: .t 5 / .top 5
        targetIndex = parseInt(remainingArgs[0]);
        remainingArgs = remainingArgs.slice(1);
    }

    // Tên người chơi hỗ trợ có khoảng trắng (ví dụ: Moki Moki)
    const rawUsername = remainingArgs.join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawUsername || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const data = await getUserTopPlays(username, 100);

    if (!data || !data.user) return message.reply(`Không tìm thấy người chơi **${username}** ông ơi!`);
    if (!data.bestScores || data.bestScores.length === 0) return message.reply(`**${data.user.username}** chưa có bài Top Play nào cả!`);

    const { user, bestScores } = data;

    // 🎯 TH1: Xem chi tiết 1 play cụ thể (!top 1 / !t 5 / .t5)
    if (targetIndex !== null) {
        if (targetIndex < 1 || targetIndex > bestScores.length) {
            return message.reply(`**${user.username}** chỉ có ${bestScores.length} bài trong Top Plays thôi ông ơi!`);
        }
        const score = bestScores[targetIndex - 1];
        const embed = await buildDetailedScoreEmbed(user, score, score.beatmap, score.beatmapset, `Top #${targetIndex} • `);
        return message.reply({ embeds: [embed] });
    }

    // 🎯 TH2: Xem danh sách Top Plays
    const pageSize = 5;
    const totalPages = Math.ceil(bestScores.length / pageSize);
    let currentPage = 0;

    const generateEmbed = async (page) => {
        const start = page * pageSize;
        const currentScores = bestScores.slice(start, start + pageSize);

        const scoreLines = await Promise.all(currentScores.map(async (score, idx) => {
            const index = start + idx + 1;
            const modsArr = score.mods || [];
            const modsStr = modsArr.length > 0 ? ` **+${modsArr.join('')}**` : '';
            const cleanMods = modsArr.length > 0 ? modsArr.join('') : '';
            const rankEmoji = getRankEmoji(score.rank, modsArr);
            const acc = (score.accuracy * 100).toFixed(2);

            const beatmapId = score.beatmap?.id || score.beatmap_id;

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

            if (beatmapId) {
                try {
                    [realPlayResult, fcResult] = await Promise.all([
                        calculateBeatmapPP(beatmapId, {
                            accuracy: score.accuracy * 100,
                            n100: count100,
                            n50: count50,
                            misses: countMiss,
                            mods: cleanMods
                        }),
                        calculateBeatmapPP(beatmapId, {
                            accuracy: fcAccNum,
                            n100: count100,
                            n50: count50,
                            misses: 0,
                            mods: cleanMods
                        })
                    ]);
                } catch (err) {}
            }

            // Star rating có tính Mod
            const rawStars = realPlayResult?.difficulty?.stars || fcResult?.difficulty?.stars || score.beatmap?.difficulty_rating || 0;
            const starStr = rawStars ? rawStars.toFixed(2) : '?.??';

            // Max Combo & Combo display
            let mapMaxCombo = score.beatmap?.max_combo || realPlayResult?.difficulty?.maxCombo || fcResult?.difficulty?.maxCombo || 0;
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
                ppDisplay = `**${currentPpStr}pp** *(${fcPpStr}pp for ${fcAccStr}% FC)*`;
            }

            // Tính toán Trọng số PP (Weighted PP & Weight %) - Đã bỏ icon ⚖️
            const weightPct = Math.pow(0.95, index - 1) * 100;
            const weightedPP = (currentPpNum * Math.pow(0.95, index - 1)).toFixed(1);
            const weightStr = ` • **${weightedPP}pp** (${weightPct.toFixed(0)}%)`;

            const missTag = countMiss > 0 ? ` • ${EMOJIS.MISS || '❌'} **${countMiss}**` : '';

            // Rank server của điểm số này (nếu có)
            const serverRank = score.position || score.rank_global || score.global_rank;
            const serverRankStr = serverRank ? ` • 🌐 **#${serverRank.toLocaleString()}**` : '';

            // Link tới trang web điểm số của play (nếu có ID)
            const scoreId = score.id || score.best_id;
            const scoreUrl = scoreId ? `https://osu.ppy.sh/scores/osu/${scoreId}` : score.beatmap?.url;
            const scoreLink = scoreUrl ? ` • [Score](${scoreUrl})` : '';

            const line1 = `**${index})** ${rankEmoji} **[${score.beatmapset.title} [${score.beatmap.version}]](${score.beatmap.url})**${modsStr} **[${starStr}★]**`;
            const line2 = `▸ ${ppDisplay} • **${acc}%** • ${comboDisplay} • *${timeStr}*`;
            const line3 = `▸ **${totalScore}**${missTag} • \`${hitsStr}\`${weightStr}${serverRankStr}${scoreLink}`;

            return `${line1}\n${line2}\n${line3}`;
        }));

        const globalRank = user.statistics?.global_rank ? `#${user.statistics.global_rank.toLocaleString()}` : 'Unranked';
        const countryRank = user.statistics?.country_rank ? `${user.country_code || 'VN'}#${user.statistics.country_rank.toLocaleString()}` : '';

        return new EmbedBuilder()
            .setColor('#2b2d31') // Phông trong suốt tiệp màu nền Discord Dark
            .setAuthor({
                name: `Top osu! Standard Plays cho ${user.username}`,
                iconURL: user.avatar_url,
                url: `https://osu.ppy.sh/users/${user.id}`
            })
            .setTitle(` Total PP: ${Math.round(user.statistics?.pp || 0).toLocaleString()}pp (${globalRank} ${countryRank})`)
            .setThumbnail(user.avatar_url)
            .setDescription(scoreLines.join('\n\n'))
            .setFooter({ text: `osu! Bancho • Trang ${page + 1}/${totalPages}` })
            .setTimestamp();
    };

    // 🔘 Khởi tạo 5 Nút Bấm MÀU XÁM (ButtonStyle.Secondary)
    const buildActionRow = (page) => {
        const firstBtn = new ButtonBuilder()
            .setCustomId('top_first')
            .setEmoji(EMOJIS.NAV_FIRST || '⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);

        const prevBtn = new ButtonBuilder()
            .setCustomId('top_prev')
            .setEmoji(EMOJIS.NAV_PREV || '◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);

        const starBtn = new ButtonBuilder()
            .setCustomId('top_star')
            .setEmoji(EMOJIS.NAV_JUMP || '🔢')
            .setStyle(ButtonStyle.Secondary);

        const nextBtn = new ButtonBuilder()
            .setCustomId('top_next')
            .setEmoji(EMOJIS.NAV_NEXT || '▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1);

        const lastBtn = new ButtonBuilder()
            .setCustomId('top_last')
            .setEmoji(EMOJIS.NAV_LAST || '⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1);

        return new ActionRowBuilder().addComponents(firstBtn, prevBtn, starBtn, nextBtn, lastBtn);
    };

    const firstEmbed = await generateEmbed(0);
    const replyMsg = await message.reply({ embeds: [firstEmbed], components: [buildActionRow(0)] });

    // ⏱️ Collector chờ bấm nút trong 2 phút (120,000 ms)
    const collector = replyMsg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Nút này của người khác bấm ông ơi! 🙄', ephemeral: true });
        }

        // 🎯 NÚT MỞ MODAL NHẬP SỐ TRANG (🔢)
        if (interaction.customId === 'top_star') {
            const modal = new ModalBuilder()
                .setCustomId('top_jump_modal')
                .setTitle(`Nhảy trang (1 - ${totalPages})`);

            const pageInput = new TextInputBuilder()
                .setCustomId('page_number')
                .setLabel(`Nhập số trang bạn muốn chuyển tới:`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(`Ví dụ: 1 đến ${totalPages}`)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(3);

            const modalRow = new ActionRowBuilder().addComponents(pageInput);
            modal.addComponents(modalRow);

            await interaction.showModal(modal);

            try {
                const modalSubmission = await interaction.awaitModalSubmit({
                    filter: (i) => i.customId === 'top_jump_modal' && i.user.id === message.author.id,
                    time: 30000
                });

                const inputVal = modalSubmission.fields.getTextInputValue('page_number');
                const targetPage = parseInt(inputVal);

                if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
                    return modalSubmission.reply({ content: `Trang không hợp lệ! Vui lòng nhập số từ 1 đến ${totalPages}.`, ephemeral: true });
                }

                currentPage = targetPage - 1;
                const nextEmbed = await generateEmbed(currentPage);
                await modalSubmission.update({ embeds: [nextEmbed], components: [buildActionRow(currentPage)] });
            } catch (err) {
                // Timeout hoặc người dùng đóng Modal không gửi
            }
            return;
        }

        // 🎯 NÚT CHUYỂN TRANG THƯỜNG
        if (interaction.customId === 'top_first') currentPage = 0;
        if (interaction.customId === 'top_prev') currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId === 'top_next') currentPage = Math.min(totalPages - 1, currentPage + 1);
        if (interaction.customId === 'top_last') currentPage = totalPages - 1;

        const nextEmbed = await generateEmbed(currentPage);
        await interaction.update({ embeds: [nextEmbed], components: [buildActionRow(currentPage)] });
    });

    // 🧹 Hết 2 phút không ai bấm -> Tự động xóa sạch dàn nút
    collector.on('end', async () => {
        await replyMsg.edit({ components: [] }).catch(() => { });
    });
}
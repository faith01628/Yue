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
    const args = rawContent.split(/ +/).slice(1);

    let targetIndex = null;
    const topNumMatch = rawContent.match(/^!top(\d+)|^!t(\d+)/i);
    if (topNumMatch) {
        targetIndex = parseInt(topNumMatch[1] || topNumMatch[2]);
    } else if (args[0] && !isNaN(parseInt(args[0]))) {
        targetIndex = parseInt(args[0]);
        args.shift();
    }

    const rawUsername = args.filter(a => isNaN(a)).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawUsername || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const data = await getUserTopPlays(username, 100);

    if (!data || !data.user) return message.reply(`Không tìm thấy người chơi **${username}** ông ơi!`);
    if (!data.bestScores || data.bestScores.length === 0) return message.reply(`**${data.user.username}** chưa có bài Top Play nào cả!`);

    const { user, bestScores } = data;

    // 🎯 TH1: Xem chi tiết 1 play cụ thể (!top 1 / !t 5)
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
            const rankEmoji = getRankEmoji(score.rank, modsArr);
            const acc = (score.accuracy * 100).toFixed(2);
            const pp = Math.round(score.pp || 0);

            const beatmapId = score.beatmap?.id || score.beatmap_id;

            // Hit counts
            const stats = score.statistics || {};
            const count300 = stats.count_300 || stats.great || 0;
            const count100 = stats.count_100 || stats.ok || 0;
            const count50 = stats.count_50 || stats.meh || 0;
            const countMiss = stats.count_miss || stats.miss || 0;
            const hitsStr = `[${count300}/${count100}/${count50}/${countMiss}]`;

            const totalScore = score.score ? score.score.toLocaleString() : '0';
            const timeStr = timeAgo(score.created_at || score.ended_at);

            let mapMaxCombo = score.beatmap?.max_combo;
            let fcPp = null;

            if (beatmapId) {
                if (!mapMaxCombo) {
                    const detail = await getBeatmapDetail(beatmapId);
                    if (detail?.max_combo) mapMaxCombo = detail.max_combo;
                }

                try {
                    const fcResult = await calculateBeatmapPP(beatmapId, {
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
            }

            const star = score.beatmap?.difficulty_rating ? score.beatmap.difficulty_rating.toFixed(2) : '?.??';

            const comboDisplay = mapMaxCombo 
                ? `**${score.max_combo}**/${mapMaxCombo}x` 
                : `**${score.max_combo}x**`;

            let ppDisplay = `**${pp}pp**`;
            const isChoke = countMiss > 0 || (mapMaxCombo && score.max_combo < mapMaxCombo);

            if (isChoke && fcPp && fcPp > pp) {
                ppDisplay = `**${pp}**/${fcPp}pp *(if FC)*`;
            }

            const line1 = `**${index}.** ${rankEmoji} **[${score.beatmapset.title} [${score.beatmap.version}]](${score.beatmap.url})**${modsStr} \`[${star}★]\``;
            const line2 = `▸ PP ▸ ${ppDisplay} • **${acc}%** • ${comboDisplay} • *${timeStr}*`;
            const line3 = `└ ▸ Score: \`${totalScore}\` • \`${hitsStr}\``;

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
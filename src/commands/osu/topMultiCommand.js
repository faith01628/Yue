import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { 
    getTopDailyPeakPlayers, 
    getTopWeeklyPeakPlayers, 
    getTopMonthlyPeakPlayers 
} from '../../services/osu/dailyLeaderboardService.js';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

function formatUserLink(username, userId) {
    if (!username) return '**Player**';
    
    // 1. Loại bỏ dấu ngoặc bọc ngoài do dư thừa từ Bancho IRC link (ví dụ: [katashi] -> katashi)
    let cleanName = String(username).replace(/^\[|\]$/g, '').trim() || 'Player';
    
    if (userId) {
        // 2. Chuyển đổi ngoặc vuông bên trong tên thành Unicode Brackets ［ ］ để không trùng cú pháp Markdown Link Discord
        const displayLinkName = cleanName.replace(/\[/g, '［').replace(/\]/g, '］');
        return `[**${displayLinkName}**](https://osu.ppy.sh/users/${userId})`;
    }
    
    return `**${cleanName}**`;
}

/**
 * Định dạng danh sách cho giao diện chi tiết hoặc tổng hợp
 */
function formatLeaderboardSection(players, isCompact = false) {
    if (!players || players.length === 0) {
        return '*Chưa có dữ liệu thi đấu trong khoảng thời gian này.*';
    }

    return players.map((p, idx) => {
        const medal = MEDALS[idx] || `**#${idx + 1}**`;
        const userLink = formatUserLink(p.username, p.userId);
        const ppText = `**${p.pp} PP**`;

        if (isCompact) {
            return `${medal} ${userLink} — ${ppText}`;
        }

        const starNum = p.starRating ? parseFloat(p.starRating).toFixed(2) : '?.??';
        const mapTitleStr = p.mapTitle || 'Unknown Map';
        const mapInfo = `\n┗ 🎵 *${mapTitleStr}*  \`⭐ ${starNum}★\``;

        return `${medal} ${userLink} — ${ppText}${mapInfo}`;
    }).join('\n\n');
}

/**
 * Tạo Embed Bảng Xếp Hạng theo mode được chọn
 */
function createTopMultiEmbed(activeMode = 'all', botAvatar = null) {
    const dailyTop = getTopDailyPeakPlayers(5);
    const weeklyTop = getTopWeeklyPeakPlayers(5);
    const monthlyTop = getTopMonthlyPeakPlayers(5);

    const embed = new EmbedBuilder()
        .setColor('#FF66AA')
        .setAuthor({ 
            name: 'Yue AI • 24/7 Community Leaderboard', 
            iconURL: botAvatar || 'https://a.ppy.sh/0' 
        })
        .setFooter({ text: '⚡ Top Ngày tự động reset vào 0:00 AM • Lịch sử lưu 30 ngày' })
        .setTimestamp();

    if (activeMode === 'today') {
        embed.setTitle('🌅 BẢNG XẾP HẠNG PEAK PP — HÔM NAY')
            .setDescription('📊 *Peak PP cao nhất của người chơi trong các phòng 24/7 hôm nay (Reset lúc 0:00 AM)*\n\n' + formatLeaderboardSection(dailyTop, false));

    } else if (activeMode === 'weekly') {
        embed.setTitle('📅 BẢNG XẾP HẠNG PEAK PP — 7 NGÀY GẦN NHẤT')
            .setDescription('📊 *Peak PP cao nhất của người chơi trong 7 ngày qua*\n\n' + formatLeaderboardSection(weeklyTop, false));

    } else if (activeMode === 'monthly') {
        embed.setTitle('🗓️ BẢNG XẾP HẠNG PEAK PP — 30 NGÀY GẦN NHẤT')
            .setDescription('📊 *Peak PP cao nhất của người chơi trong 30 ngày qua*\n\n' + formatLeaderboardSection(monthlyTop, false));

    } else {
        // Mode 'all': Tổng hợp gọn gàng cả 3 hạng mục
        embed.setTitle('🏆 BẢNG XẾP HẠNG TOP MULTIPLAYER (PEAK PP)')
            .setDescription('📊 *Bảng tổng hợp Peak PP của người chơi tại các phòng Cộng Đồng 24/7 của Yue AI.*\n*Bấm các nút bên dưới để chuyển xem chi tiết từng hạng mục!*')
            .addFields(
                {
                    name: '🌅 Top 5 Hàng Ngày (Reset 0:00 AM)',
                    value: formatLeaderboardSection(dailyTop, true),
                    inline: false
                },
                {
                    name: '📅 Top 5 Hàng Tuần (7 Ngày Qua)',
                    value: formatLeaderboardSection(weeklyTop, true),
                    inline: false
                },
                {
                    name: '🗓️ Top 5 Hàng Tháng (30 Ngày Qua)',
                    value: formatLeaderboardSection(monthlyTop, true),
                    inline: false
                }
            );
    }

    return embed;
}

/**
 * Tạo ActionRow chứa các nút chuyển Tab
 */
function createTopMultiButtons(activeMode = 'all', disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('topmulti_all')
            .setLabel('Tổng Hợp')
            .setEmoji('🏆')
            .setStyle(activeMode === 'all' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('topmulti_today')
            .setLabel('Hôm Nay')
            .setEmoji('🌅')
            .setStyle(activeMode === 'today' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('topmulti_weekly')
            .setLabel('7 Ngày')
            .setEmoji('📅')
            .setStyle(activeMode === 'weekly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('topmulti_monthly')
            .setLabel('30 Ngày')
            .setEmoji('🗓️')
            .setStyle(activeMode === 'monthly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
}

export async function handleTopMultiCommand(message) {
    try {
        const botAvatar = message.client?.user?.displayAvatarURL() || null;
        let activeMode = 'all';
        const embed = createTopMultiEmbed(activeMode, botAvatar);
        const row = createTopMultiButtons(activeMode);

        const replyMsg = await message.reply({ 
            embeds: [embed], 
            components: [row] 
        });

        // 🎯 Đăng ký Collector xử lý tương tác nút bấm chuyển Tab trong 2 phút
        const collector = replyMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            try {
                const modeMap = {
                    'topmulti_all': 'all',
                    'topmulti_today': 'today',
                    'topmulti_weekly': 'weekly',
                    'topmulti_monthly': 'monthly'
                };

                activeMode = modeMap[interaction.customId] || 'all';

                const newEmbed = createTopMultiEmbed(activeMode, botAvatar);
                const newRow = createTopMultiButtons(activeMode);

                await interaction.update({ 
                    embeds: [newEmbed], 
                    components: [newRow] 
                });
            } catch (err) {
                console.error('❌ Lỗi tương tác nút bấm .topmulti:', err.message);
            }
        });

        collector.on('end', () => {
            const disabledRow = createTopMultiButtons(activeMode, true);
            replyMsg.edit({ components: [disabledRow] }).catch(() => {});
        });

    } catch (err) {
        console.error('❌ Lỗi xử lý lệnh .topmulti:', err);
        return await message.reply('Có lỗi xảy ra khi tạo Bảng xếp hạng Multiplayer rồi ông ơi!');
    }
}



import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getUserProfile, getUserTopPlays } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { analyzeUserSkillProfile } from '../../utils/userSkillAnalyzer.js';
import { saveUserSkillProfile } from '../../services/storage/userProfileStore.js';
import { isHeavyLibraryOn, isFeatureOn } from '../../config/botConfig.js';

export async function handleOsuStatCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();

    const [profile, topData] = await Promise.all([
        getUserProfile(username),
        getUserTopPlays(username, 100)
    ]);

    if (!profile) return message.reply(`Không tìm thấy người chơi **${username}** trên Bancho ông ơi!`);

    const bestScores = topData?.bestScores || [];

    // 💾 TỰ ĐỘNG TÍNH TOÁN & CẬP NHẬT KỸ NĂNG NGƯỜI DÙNG VÀO CACHE (.st)
    let skillAnalysis = null;
    if (bestScores.length > 0) {
        skillAnalysis = analyzeUserSkillProfile(profile, bestScores);
        saveUserSkillProfile(message.author.id, {
            osuUsername: profile.username,
            osuUserId: profile.id,
            ...skillAnalysis
        });
    }

    // Kiếm tra xem Canvas và tính năng StatCard có đang bật không
    const canUseCanvas = isHeavyLibraryOn('canvas') && isFeatureOn('osuDiscordCommands', 'statCard');

    if (canUseCanvas) {
        try {
            const { createStatCardImage } = await import('../../utils/canvasStatCard.js');
            const imageBuffer = await createStatCardImage(profile, bestScores);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'stats.png' });

            const embed = new EmbedBuilder()
                .setColor('#ff66aa')
                .setAuthor({
                    name: `osu! Standard Detailed Statistics - ${profile.username}`,
                    iconURL: profile.avatar_url,
                    url: `https://osu.ppy.sh/users/${profile.id}`
                })
                .setImage('attachment://stats.png')
                .setFooter({ text: 'Yue AI • Canvas Detailed Skill Inspector' })
                .setTimestamp();

            return message.reply({ embeds: [embed], files: [attachment] });
        } catch (canvasErr) {
            console.error('❌ Lỗi nạp Canvas Stat Card, chuyển sang Embed văn bản:', canvasErr.message);
        }
    }

    // ⚡ FALLBACK TRẢ VỀ EMBED CHUẨN KHI TẮT CANVAS (LITE MODE SERVER)
    const embed = new EmbedBuilder()
        .setColor('#ff66aa')
        .setAuthor({
            name: `osu! Standard Statistics (Lite Mode) - ${profile.username}`,
            iconURL: profile.avatar_url,
            url: `https://osu.ppy.sh/users/${profile.id}`
        })
        .setThumbnail(profile.avatar_url)
        .addFields(
            { name: '📊 Performance', value: `**PP:** ${profile.statistics?.pp || 0}\n**Global Rank:** #${profile.statistics?.global_rank || '-'}\n**Country Rank:** #${profile.statistics?.country_rank || '-'} (${profile.country_code})`, inline: true },
            { name: '🎯 Accuracy & Playcount', value: `**Accuracy:** ${(profile.statistics?.hit_accuracy || 0).toFixed(2)}%\n**Play Count:** ${profile.statistics?.play_count || 0}\n**Play Time:** ${(profile.statistics?.play_time / 3600 || 0).toFixed(1)} hrs`, inline: true },
            { name: '⚡ Skill Attributes (Estimated)', value: skillAnalysis ? `• Stream: ${skillAnalysis.streamRating}★\n• Jump: ${skillAnalysis.jumpRating}★\n• Stamina: ${skillAnalysis.staminaRating}★` : 'Chưa đủ dữ liệu Top 100', inline: false }
        )
        .setFooter({ text: 'Yue AI • Lite Mode (Canvas Disabled)' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

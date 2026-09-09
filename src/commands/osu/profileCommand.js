import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getUserProfile, getUserTopPlays } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { isHeavyLibraryOn, isFeatureOn } from '../../config/botConfig.js';

export async function handleOsuProfileCommand(message) {
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

    const canUseCanvas = isHeavyLibraryOn('canvas') && isFeatureOn('osuDiscordCommands', 'profile');

    if (canUseCanvas) {
        try {
            const { createProfileCardImage } = await import('../../utils/canvasProfileCard.js');
            const imageBuffer = await createProfileCardImage(profile, bestScores);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

            const embed = new EmbedBuilder()
                .setColor('#ff66aa')
                .setAuthor({
                    name: `osu! Standard Profile cho ${profile.username}`,
                    iconURL: profile.avatar_url,
                    url: `https://osu.ppy.sh/users/${profile.id}`
                })
                .setImage('attachment://profile.png')
                .setFooter({ text: 'Yue AI • Canvas Profile Intelligence' })
                .setTimestamp();

            return message.reply({ embeds: [embed], files: [attachment] });
        } catch (canvasErr) {
            console.error('❌ Lỗi nạp Canvas Profile Card, chuyển sang Embed văn bản:', canvasErr.message);
        }
    }

    // ⚡ FALLBACK EMBED KHI TẮT CANVAS
    const embed = new EmbedBuilder()
        .setColor('#ff66aa')
        .setAuthor({
            name: `osu! Standard Profile cho ${profile.username}`,
            iconURL: profile.avatar_url,
            url: `https://osu.ppy.sh/users/${profile.id}`
        })
        .setThumbnail(profile.avatar_url)
        .addFields(
            { name: '🌐 Global Rank', value: `#${profile.statistics?.global_rank || '-'}`, inline: true },
            { name: '🚩 Country Rank', value: `#${profile.statistics?.country_rank || '-'} (${profile.country_code})`, inline: true },
            { name: '⚡ Performance', value: `${profile.statistics?.pp || 0} PP`, inline: true },
            { name: '🎯 Accuracy', value: `${(profile.statistics?.hit_accuracy || 0).toFixed(2)}%`, inline: true },
            { name: '🎮 Playcount', value: `${profile.statistics?.play_count || 0}`, inline: true },
            { name: '⏱️ Playtime', value: `${(profile.statistics?.play_time / 3600 || 0).toFixed(1)} hrs`, inline: true }
        )
        .setFooter({ text: 'Yue AI • Lite Mode' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

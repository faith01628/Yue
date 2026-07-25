import { EmbedBuilder } from 'discord.js';
import { getUserProfile } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { EMOJIS } from '../../config/emojis.js';

export async function handleOsuProfileCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const profile = await getUserProfile(username);

    if (!profile) return message.reply(`Không tìm thấy người chơi **${username}** trên Bancho ông ơi!`);

    const stats = profile.statistics;
    const globalRank = stats.global_rank ? `#${stats.global_rank.toLocaleString()}` : 'Unranked';
    const countryRank = stats.country_rank ? `#${stats.country_rank.toLocaleString()}` : 'Unranked';
    const pp = stats.pp ? `${Math.round(stats.pp).toLocaleString()} pp` : '0 pp';
    const accuracy = stats.hit_accuracy ? `${stats.hit_accuracy.toFixed(2)}%` : '0%';

    const embed = new EmbedBuilder()
        .setColor('#ff66aa')
        .setAuthor({ name: `Thông tin osu! standard của ${profile.username}`, iconURL: profile.avatar_url, url: `https://osu.ppy.sh/users/${profile.id}` })
        .setThumbnail(profile.avatar_url)
        .addFields(
            { name: '🌐 Global Rank', value: globalRank, inline: true },
            { name: `${EMOJIS.FLAG_VN} Country Rank`, value: countryRank, inline: true },
            { name: 'Performance', value: pp, inline: true },
            { name: `${EMOJIS.ACC} Accuracy`, value: accuracy, inline: true },
            { name: '🎮 Play Count', value: stats.play_count?.toLocaleString() || '0', inline: true },
            { name: `${EMOJIS.CLOCK} Play Time`, value: stats.play_time ? `${Math.floor(stats.play_time / 3600)} hrs` : '0 hrs', inline: true }
        )
        .setFooter({ text: 'Yue AI • osu! API v2 Integration' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

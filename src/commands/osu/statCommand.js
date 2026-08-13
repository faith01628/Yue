import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getUserProfile, getUserTopPlays } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { createStatCardImage } from '../../utils/canvasStatCard.js';

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

    // Vẽ thẻ ảnh Canvas Stat Card
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
}

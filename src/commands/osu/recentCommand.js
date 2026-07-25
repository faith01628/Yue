import { getUserRecentPlay } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { buildDetailedScoreEmbed } from './embedBuilder.js';

export async function handleOsuRecentCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    await message.channel.sendTyping();
    const data = await getUserRecentPlay(username);

    if (!data || !data.user) return message.reply(`Không tìm thấy người chơi **${username}** ông ơi!`);
    if (!data.score) return message.reply(`**${data.user.username}** chưa chơi bài nào trong vòng 24h qua cả!`);

    const embed = await buildDetailedScoreEmbed(data.user, data.score, data.score.beatmap, data.score.beatmapset, 'Try #1 • ');
    return message.reply({ embeds: [embed] });
}
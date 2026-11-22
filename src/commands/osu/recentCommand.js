import { getUserRecentPlay } from '../../services/osu/osuService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { buildDetailedScoreEmbed } from './embedBuilder.js';

export async function handleOsuRecentCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    const linkedUsername = getLinkedOsuUsername(message.author.id);
    const username = rawArgs || linkedUsername || message.member?.displayName || message.author.username;

    // 🎯 Tự động phát hiện Mode từ tiền tố lệnh: .rc -> catch/fruits, .rm -> mania, .rt -> taiko, .rs/.r -> osu
    const firstWord = message.content.trim().split(/ +/)[0].toLowerCase();
    let mode = 'osu';
    if (firstWord.endsWith('c')) mode = 'fruits';
    else if (firstWord.endsWith('m')) mode = 'mania';
    else if (firstWord.endsWith('t')) mode = 'taiko';

    await message.channel.sendTyping();
    const data = await getUserRecentPlay(username, mode);

    if (!data || !data.user) return message.reply(`Không tìm thấy người chơi **${username}** ông ơi!`);
    if (!data.score) return message.reply(`**${data.user.username}** chưa chơi bài nào trong vòng 24h qua cả!`);

    const embed = await buildDetailedScoreEmbed(data.user, data.score, data.score.beatmap, data.score.beatmapset, 'Try #1 • ');
    return message.reply({ embeds: [embed] });
}
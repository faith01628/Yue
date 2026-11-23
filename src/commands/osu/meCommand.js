import { 
    getPlayerStandingsSummary, 
    buildPlayerStandingEmbed, 
    syncTodayOfficialPP 
} from '../../services/osu/dailyLeaderboardService.js';
import { getLinkedOsuAccount, getLinkedOsuUsername } from '../../services/osu/userService.js';

export async function handleMeCommand(message) {
    try {
        await syncTodayOfficialPP();

        const content = (message.content || '').trim();
        const args = content.split(/ +/).slice(1);

        let targetUser = null;

        // 1. Kiểm tra nếu có tag/mention Discord
        const mentionedUser = message.mentions?.users?.first();
        if (mentionedUser) {
            const acc = getLinkedOsuAccount(mentionedUser.id);
            targetUser = acc?.userId || acc?.username || mentionedUser.username;
        } else if (args.length > 0) {
            targetUser = args.join(' ').trim();
        } else {
            // 2. Không nhập tên: lấy từ tài khoản đã link .link hoặc tên hiển thị
            const acc = getLinkedOsuAccount(message.author.id);
            targetUser = acc?.userId || acc?.username || message.member?.displayName || message.author.username;
        }

        const summary = getPlayerStandingsSummary(targetUser);
        const embed = buildPlayerStandingEmbed(summary);

        return await message.reply({ embeds: [embed] });
    } catch (err) {
        console.error('❌ Lỗi xử lý lệnh .me trên Discord:', err);
        return await message.reply('Có lỗi xảy ra khi tra cứu thành tích rồi ông ơi!');
    }
}

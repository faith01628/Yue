import { getUserProfile } from '../../services/osu/osuService.js';
import { linkOsuAccount } from '../../services/osu/userService.js';

export async function handleOsuLinkSlashCommand(interaction) {
    const input = interaction.options.getString('username')?.trim();

    if (!input) {
        return interaction.reply({ content: 'Nhập username hoặc paste link profile osu! vào đi chứ ông ơi! 🙄', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    let targetUsername = input;
    const profileUrlRegex = /(?:https?:\/\/)?osu\.ppy\.sh\/(?:users|u)\/([^/?#]+)/i;
    const match = input.match(profileUrlRegex);

    if (match && match[1]) {
        try { targetUsername = decodeURIComponent(match[1]); } catch (e) { targetUsername = match[1]; }
    }

    const profile = await getUserProfile(targetUsername);

    if (!profile) {
        return interaction.editReply({ content: `❌ Không tìm thấy tài khoản osu! nào tương ứng với **${input}** trên Bancho cả!` });
    }

    const success = linkOsuAccount(interaction.user.id, profile.username);
    if (success) {
        return interaction.editReply({ 
            content: `🔒 **Bảo mật thành công!**\n✅ Đã liên kết tài khoản Discord của ông với tài khoản osu! **${profile.username}** (ID: \`${profile.id}\`).` 
        });
    } else {
        return interaction.editReply({ content: '❌ Có lỗi xảy ra khi lưu thông tin liên kết rồi ông ơi!' });
    }
}
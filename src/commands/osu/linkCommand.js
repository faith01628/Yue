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

    // 🔒 Lưu 2 lớp: UID cố định + Username hiện tại + Lịch sử tên cũ
    const success = linkOsuAccount(interaction.user.id, profile);
    if (success) {
        return interaction.editReply({ 
            content: `🔒 **Bảo mật thành công!**\n✅ Đã liên kết tài khoản Discord của ông với tài khoản osu! **${profile.username}** (UID: \`${profile.id}\`).\n💡 *Từ giờ nếu đổi tên trên osu!, Yue vẫn sẽ tự động nhận diện đúng bạn qua UID!*` 
        });
    } else {
        return interaction.editReply({ content: '❌ Có lỗi xảy ra khi lưu thông tin liên kết rồi ông ơi!' });
    }
}

/**
 * 💬 Hỗ trợ liên kết tài khoản osu! bằng tin nhắn Prefix (.link <username/link>)
 */
export async function handleOsuLinkMessageCommand(message) {
    const content = (message.content || '').trim();
    const args = content.split(/ +/).slice(1);
    const input = args.join(' ').trim();

    if (!input) {
        return message.reply('Cú pháp: `.link <username_hoặc_link_profile>` (Ví dụ: `.link WhiteCat` hoặc `.link https://osu.ppy.sh/users/34804696`).');
    }

    let targetUsername = input;
    const profileUrlRegex = /(?:https?:\/\/)?osu\.ppy\.sh\/(?:users|u)\/([^/?#]+)/i;
    const match = input.match(profileUrlRegex);

    if (match && match[1]) {
        try { targetUsername = decodeURIComponent(match[1]); } catch (e) { targetUsername = match[1]; }
    }

    const profile = await getUserProfile(targetUsername);
    if (!profile) {
        return message.reply(`❌ Không tìm thấy tài khoản osu! nào tương ứng với **${input}** trên Bancho cả!`);
    }

    // 🔒 Lưu 2 lớp: UID cố định + Username hiện tại + Lịch sử tên cũ
    const success = linkOsuAccount(message.author.id, profile);
    if (success) {
        return message.reply(`🔒 **Liên kết thành công!**\n✅ Đã liên kết tài khoản Discord của bạn với tài khoản osu! **${profile.username}** (UID: \`${profile.id}\`).\n💡 *Từ giờ nếu đổi tên trên osu!, Yue vẫn sẽ tự động nhận diện đúng bạn qua UID!*`);
    } else {
        return message.reply('❌ Có lỗi xảy ra khi lưu thông tin liên kết rồi ông ơi!');
    }
}

// src/commands/listen.js (Chỉ chạy khi người dùng gõ lệnh dạng /listen)
import { registerSpeaker } from '../services/sttService.js';

export async function handleListenCommand(interaction) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
        return await interaction.reply({
            content: "❌ Ông phải vào phòng Voice trước thì Yue mới lắng nghe được chứ!",
            ephemeral: true // ⚡ Hoặc flags: 64
        });
    }

    const username = member.displayName || member.user.username;
    const added = registerSpeaker(member.id, username);

    const replyContent = added 
        ? `✅ Đã bật chế độ lắng nghe cho **${username}**! Giờ ông có thể gọi "Nguyệt ơi" được rồi nhé.`
        : `ℹ️ **${username}** đã nằm trong danh sách được Yue lắng nghe từ trước rồi nha!`;

    // ⚡ CHỈ 1 MÌNH NGƯỜI DÙNG LỆNH THẤY TIN NHẮN NÀY
    return await interaction.reply({
        content: replyContent,
        ephemeral: true // Ephemeral chuẩn cho Slash Command
    });
}
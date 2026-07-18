import { getVoiceConnection } from '@discordjs/voice';

/**
 * Xử lý lệnh cho Bot rời khỏi phòng Voice
 * @param {import('discord.js').Message} message - Tin nhắn từ Discord
 */
export async function handleLeaveCommand(message) {
    // 1. Lấy kết nối Voice hiện tại của Bot trong Server (Guild) này
    const connection = getVoiceConnection(message.guild.id);

    // 2. Nếu Bot đang ở trong phòng Voice, tiến hành ngắt kết nối
    if (connection) {
        connection.destroy(); // Đá Bot ra khỏi phòng thoại và xóa luồng âm thanh
        return message.reply("Hứ, không chơi với ông nữa, tui đi đây! 🙄💨");
    } else {
        // Nếu Bot đang không ở trong phòng nào cả
        return message.reply("Ơ kìa, tui có đang ở trong phòng Voice nào đâu mà đuổi? 🤨");
    }
}
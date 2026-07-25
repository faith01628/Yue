import { activeLobbies } from '../../services/osu/banchoService.js';

/**
 * Hàm hỗ trợ giới hạn thời gian chờ đóng phòng
 */
const closeLobbyWithTimeout = (lobby, ms = 2500) => {
    return Promise.race([
        lobby.closeLobby(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Bancho timeout')), ms))
    ]);
};

export async function handleCloseMatchCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    let matchId = args[0];

    // 🎯 1. NẾU KHÔNG CÓ MATCH ID -> TỰ LẤY PHÒNG DO CHÍNH NGƯỜI GÕ LỆNH TẠO
    if (!matchId) {
        const myLobbies = Array.from(activeLobbies.values())
            .filter(item => item.ownerId === message.author.id)
            .sort((a, b) => b.createdAt - a.createdAt);

        if (myLobbies.length > 0) {
            matchId = String(myLobbies[0].lobby.id);
        } else {
            return message.reply('⚠️ Ông hiện không sở hữu phòng Multiplayer nào đang mở cả!');
        }
    }

    // 🎯 2. KIỂM TRA XEM PHÒNG CÓ TRONG BỘ NHỚ RAM KHÔNG
    if (!activeLobbies.has(matchId)) {
        return message.reply(
            `❌ Không tìm thấy Match ID \`${matchId}\` trong hệ thống (có thể phòng đã được đóng trước đó)!`
        );
    }

    const targetLobbyObj = activeLobbies.get(matchId);

    // Bắt buộc ID Discord người gõ lệnh phải TRÙNG VỚI chủ phòng
    if (targetLobbyObj.ownerId !== message.author.id) {
        return message.reply(
            `⛔ **Không thể đóng phòng!** Ông không phải là người tạo phòng Match ID \`${matchId}\`!`
        );
    }

    await message.channel.sendTyping();

    try {
        // Cố gắng gửi lệnh đóng phòng tới Bancho (Timeout sau 2.5s nếu phòng đã mất)
        await closeLobbyWithTimeout(targetLobbyObj.lobby, 2500);
    } catch (err) {
        console.log(`[Info] Room ${matchId} đã bị hủy/timeout trên Bancho, tiến hành force dọn RAM...`);
    } finally {
        // 🎯 BẮT BỘC: Luôn dọn dẹp RAM ngay lập tức không cho kẹt bộ nhớ
        activeLobbies.delete(matchId);
    }

    return message.reply(`🔒 Đã đóng và dọn dẹp thành công phòng Match ID \`${matchId}\`! Ông có thể tạo phòng mới rồi đó.`);
}
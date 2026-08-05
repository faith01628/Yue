import { forceJoinLobby, activeLobbies, initBancho } from '../../services/osu/banchoService.js';

export async function handleJoinRoomCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    const matchId = args[0];

    if (!matchId) {
        return message.reply('⚠️ Ông phải nhập Match ID nhé! Ví dụ: `.jr 121577509` hoặc `.joinroom 121577509`');
    }

    await message.channel.sendTyping();

    // Khởi tạo Bancho trước nếu chưa kết nối
    await initBancho();

    const success = await forceJoinLobby(matchId);

    if (success) {
        const channelName = `#mp_${matchId}`;
        activeLobbies.set(matchId, {
            ownerId: message.author.id,
            ownerTag: message.author.username,
            createdAt: Date.now()
        });

        return message.reply(`✅ Yue đã tham gia và kết nối thành công vào phòng \`${channelName}\` rồi nhé!`);
    } else {
        return message.reply(`❌ Không thể kết nối vào Match ID \`${matchId}\`. Kiểm tra xem Bancho có bị mất kết nối hoặc phòng còn tồn tại không nhé!`);
    }
}
import { activeLobbies, getBanchoClient } from '../../services/osu/banchoService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';

export async function handleCloseMatchCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1);
    let matchId = null;

    // 🎯 1. BẮT MATCH ID TỪ THAM SỐ GÕ VÀO (Ví dụ: .mc 121576805)
    for (const arg of rawArgs) {
        if (/^\d{5,10}$/.test(arg)) {
            matchId = arg;
            break;
        }
    }

    // 🎯 2. NẾU KHÔNG NHẬP MATCH ID -> TỰ TÌM PHÒNG GẦN NHẤT CỦA CHÍNH NGƯỜI GÕ LỆNH
    if (!matchId) {
        const myLobbies = Array.from(activeLobbies.entries())
            .filter(([_, item]) => item.ownerId === message.author.id)
            .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

        if (myLobbies.length > 0) {
            matchId = myLobbies[0][0];
        }
    }

    if (!matchId) {
        return message.reply('⚠️ Không tìm thấy phòng Multiplayer nào để đóng! Cú pháp: `.mc <Match_ID>` (Ví dụ: `.mc 121576805`).');
    }

    // 🎯 3. BẢO VỆ SECURITY: KIỂM TRA QUYỀN ĐÓNG PHÒNG
    const lobbyData = activeLobbies.get(matchId);

    if (!lobbyData) {
        return message.reply(`⚠️ Yue hiện không quản lý phòng Match ID \`${matchId}\` hoặc phòng đã bị đóng trước đó rồi!`);
    }

    // Lấy tên ingame osu! của người gõ lệnh Discord (nếu có)
    const senderOsuName = getLinkedOsuUsername(message.author.id);
    const isRoomOwner = lobbyData.ownerId === message.author.id;

    // Lấy object kênh Bancho IRC của phòng này
    const bancho = getBanchoClient();
    const mpChannel = bancho?.getChannel(`#mp_${matchId}`);
    const lobby = mpChannel?.lobby;

    let isRealHostOrRef = false;
    if (lobby && senderOsuName) {
        const slots = lobby.slots || [];
        // Kiểm tra xem user gõ lệnh có đang ở trong phòng và làm Host không
        const isHost = slots.some(s => s && s.user && s.user.username.toLowerCase() === senderOsuName.toLowerCase() && s.isHost);
        // Hoặc kiểm tra trong danh sách Ref của phòng (nếu SDK hỗ trợ)
        isRealHostOrRef = isHost;
    }

    // NẾU KHÔNG PHẢI CHỦ PHÒNG ĐĂNG KÝ VÀ CŨNG KHÔNG PHẢI HOST IN-GAME -> CHẶN NGAY!
    if (!isRoomOwner && !isRealHostOrRef) {
        return message.reply(
            `🚫 **CẢNH BÁO TÍNH NĂNG BẢO VỆ:**\n` +
            `Ông không phải là người gọi Yue vào phòng \`#mp_${matchId}\` và cũng không phải là Host/Ref của phòng này!\n` +
            `👉 Không được chơi xấu đóng phòng của người khác nha ông bạn!`
        );
    }

    // 🎯 4. THỰC HIỆN ĐÓNG PHÒNG AN TOÀN
    try {
        await message.channel.sendTyping();

        if (mpChannel) {
            await mpChannel.sendMessage(`!mp close`);
            await mpChannel.leave();
        }

        activeLobbies.delete(matchId);
        return message.reply(`✅ Đã đóng thành công phòng Multiplayer osu! (\`#mp_${matchId}\`)!`);

    } catch (err) {
        console.error('❌ Lỗi khi đóng match:', err);
        return message.reply('YUE: Có lỗi xảy ra khi đóng phòng Multiplayer!');
    }
}
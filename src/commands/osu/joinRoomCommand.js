import { forceJoinLobby, activeLobbies, initBancho } from '../../services/osu/banchoService.js';
import { register247Room } from '../../services/multi247/room247Manager.js';
import { botConfig } from '../../config/botConfig.js';

export async function handleJoinRoomCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    const cmdFirstWord = message.content.trim().split(/ +/)[0].toLowerCase();
    const is247Requested = cmdFirstWord.includes('247') || message.content.toLowerCase().includes('247');
    const isOwnerKatashi = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');

    const matchId = args[0];

    // 🔒 1. KIỂM TRA TOGGLE TÍNH NĂNG TỪ BOT CONFIG (TÁCH BIỆT BOT LOCAL PC VÀ BOT SERVER VPS)
    if (is247Requested) {
        if (!botConfig.osuMultiplayer?.community247Rooms) {
            return message.reply("⛔ **Tính năng Phòng 24/7 hiện đang TẮT trên instance này!** (Instance Local/Server này chỉ quản lý phòng thường).");
        }
        if (!isOwnerKatashi) {
            return message.reply("⛔ **Chỉ có Katashi (Creator) mới có quyền dùng lệnh `.jr247` để gán phòng 24/7!**\n👉 Dùng lệnh `.jr <matchId>` để kết nối vào phòng Multiplayer thường nhé.");
        }
    } else {
        if (!botConfig.osuMultiplayer?.normalRooms) {
            return message.reply("⛔ **Tính năng Phòng Multiplayer Thường hiện đang TẮT trên instance này!** (Instance này phụ trách phòng 24/7).");
        }
    }

    if (!matchId) {
        const exampleCmd = is247Requested ? '.jr247 <matchId>' : '.jr <matchId>';
        return message.reply(`⚠️ Ông phải nhập Match ID nhé! Ví dụ: \`${exampleCmd}\` (Ví dụ: \`${exampleCmd.replace('<matchId>', '121830490')}\`)`);
    }

    await message.channel.sendTyping();

    // Khởi tạo Bancho trước nếu chưa kết nối
    await initBancho();

    if (is247Requested) {
        try {
            register247Room(matchId, {
                roomName: `Yue's 24/7 Community Room (${matchId})`,
                ownerDiscordId: message.author.id,
                createdAt: Date.now()
            });
        } catch (regErr) {
            console.log(`[Join247 Info]:`, regErr.message);
        }
    }

    const success = await forceJoinLobby(matchId);

    if (success) {
        const channelName = `#mp_${matchId}`;
        activeLobbies.set(matchId, {
            ownerId: message.author.id,
            ownerTag: message.author.username,
            createdAt: Date.now()
        });

        const roomTypeStr = is247Requested ? 'Phòng 24/7 Cộng Đồng' : 'Phòng Thường';
        return message.reply(`✅ Yue đã tham gia và kết nối thành công vào phòng \`${channelName}\` (**${roomTypeStr}**) rồi nhé!`);
    } else {
        return message.reply(`❌ Không thể kết nối vào Match ID \`${matchId}\`. Kiểm tra xem Bancho có bị mất kết nối hoặc phòng còn tồn tại không nhé!`);
    }
}
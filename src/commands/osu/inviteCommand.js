import { activeLobbies } from '../../services/osu/banchoService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';

export async function handleInviteCommand(message) {
    if (activeLobbies.size === 0) {
        return message.reply('Hiện tại chưa có phòng Multiplayer nào đang mở cả ông ơi!');
    }

    const rawArgs = message.content.trim().split(/ +/).slice(1);
    const senderOsuName = getLinkedOsuUsername(message.author.id) || message.member?.displayName || message.author.username;

    let targetMatchId = null;
    let targetPlayer = null;
    let targetHostUser = null;

    // Lấy Mention nếu người dùng tag chủ phòng (@Katashi)
    const mentionedUser = message.mentions.users.first();
    if (mentionedUser) {
        targetHostUser = mentionedUser;
    }

    // 🎯 1. BẮT BIẾN MATCH ID HOẶC TÊN CHỦ PHÒNG / TÊN PLAYER
    const cleanArgs = rawArgs.filter(arg => !arg.startsWith('<@')); // Lọc bỏ tag user

    for (let i = 0; i < cleanArgs.length; i++) {
        const arg = cleanArgs[i];
        
        // Check nếu là số (Match ID - thường từ 6 chữ số trở lên)
        if (!targetMatchId && /^\d{5,10}$/.test(arg)) {
            targetMatchId = arg;
            continue;
        }

        // Tên player hoặc host
        if (!targetPlayer) {
            targetPlayer = arg;
        }
    }

    // 🎯 2. TÌM LOBBY PHÙ HỢP THEO ĐIỀU KIỆN
    let selectedLobbyObj = null;

    // TH 1: Tìm theo Match ID cụ thể (.inv 121576805 nnpk)
    if (targetMatchId && activeLobbies.has(targetMatchId)) {
        selectedLobbyObj = activeLobbies.get(targetMatchId);
    }

    // TH 2: Tìm theo Tag Host (.inv @katashi nnpk)
    if (!selectedLobbyObj && targetHostUser) {
        // Tìm phòng gần nhất của Host được tag
        const hostLobbies = Array.from(activeLobbies.values())
            .filter(item => item.ownerId === targetHostUser.id)
            .sort((a, b) => b.createdAt - a.createdAt);

        if (hostLobbies.length > 0) selectedLobbyObj = hostLobbies[0];
    }

    // TH 3: Tìm theo Tên Host gõ chữ (.inv katashi nnpk)
    if (!selectedLobbyObj && targetPlayer && !targetMatchId) {
        const matchedHost = Array.from(activeLobbies.values())
            .filter(item => item.ownerTag.toLowerCase().includes(targetPlayer.toLowerCase()) || 
                            item.lobby.name.toLowerCase().includes(targetPlayer.toLowerCase()))
            .sort((a, b) => b.createdAt - a.createdAt);

        if (matchedHost.length > 0) {
            selectedLobbyObj = matchedHost[0];
            // Nếu argument 1 là tên Host, thì argument 2 (nếu có) sẽ là tên player
            const secondArg = cleanArgs.find(a => a.toLowerCase() !== targetPlayer.toLowerCase());
            targetPlayer = secondArg || senderOsuName;
        }
    }

    // TH 4: Không chỉ định ID/Host -> Lấy phòng gần nhất do CHỦ PHÒNG tạo (nếu người gõ có phòng)
    if (!selectedLobbyObj) {
        const myLobbies = Array.from(activeLobbies.values())
            .filter(item => item.ownerId === message.author.id)
            .sort((a, b) => b.createdAt - a.createdAt);

        if (myLobbies.length > 0) {
            selectedLobbyObj = myLobbies[0];
        }
    }

    // TH 5: Nếu vẫn chưa thấy -> Lấy phòng mới nhất vừa tạo trên toàn hệ thống
    if (!selectedLobbyObj) {
        const allLobbies = Array.from(activeLobbies.values()).sort((a, b) => b.createdAt - a.createdAt);
        if (allLobbies.length > 0) {
            selectedLobbyObj = allLobbies[0];
        }
    }

    if (!selectedLobbyObj) {
        return message.reply('Không tìm thấy phòng phù hợp! Cú pháp: `.inv [Match_ID] <tên_player>`');
    }

    // Tên player cần mời (Nếu không nhập tên player thì tự lấy tên ingame người gõ)
    const finalPlayerToInvite = targetPlayer || senderOsuName;

    try {
        await message.channel.sendTyping();
        await selectedLobbyObj.lobby.invitePlayer(finalPlayerToInvite);

        return message.reply(`📩 Đã gửi lời mời tới player **${finalPlayerToInvite}** vào phòng **${selectedLobbyObj.lobby.name}** (Match ID: \`${selectedLobbyObj.lobby.id}\`)!`);
    } catch (err) {
        console.error('Lỗi khi mời player:', err);
        return message.reply(`Không thể gửi lời mời cho **${finalPlayerToInvite}** (Có thể player đang offline hoặc chưa bật nhận tin nhắn từ Stranger).`);
    }
}
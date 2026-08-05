import { EmbedBuilder } from 'discord.js';
import { initBancho, activeLobbies } from '../../services/osu/banchoService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';

export async function handleMakeRoomCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);

    // 🎯 1. BẮT BỘC PHẢI LINK PROFILE OSU! MỚI ĐƯỢC TẠO PHÒNG
    const ownerOsuName = getLinkedOsuUsername(message.author.id);

    if (!ownerOsuName) {
        return message.reply(
            `⚠️ **Ông chưa liên kết tài khoản osu! với Yue!**\n` +
            `👉 Vui lòng liên kết tài khoản bằng lệnh \`/link <tên_ingame>\` trước khi tạo phòng Multiplayer nhé!`
        );
    }

    const roomName = args.join(' ').trim() || `Yue's Room (${ownerOsuName})`;

    // 🎯 2. CHẶN NẾU NGƯỜI DÙNG ĐÃ CÓ PHÒNG ĐANG MỞ
    const existingLobby = Array.from(activeLobbies.values()).find(
        (item) => item.ownerId === message.author.id
    );

    if (existingLobby) {
        const existingMatchId = existingLobby.lobby.id;
        return message.reply(
            `Ông đã tạo 1 phòng Multiplayer trước đó rồi! (Match ID: \`${existingMatchId}\`)\n` +
            `👉 Vui lòng đóng phòng cũ bằng lệnh \`.mc ${existingMatchId}\` trước khi tạo phòng mới nhé!`
        );
    }

    await message.channel.sendTyping();

    try {
        const bancho = await initBancho();
        if (!bancho || !bancho.isConnected()) {
            return message.reply('Tui không kết nối tới osu! Bancho IRC được rồi ông ơi!');
        }

        // 🎯 3. TẠO PHÒNG MULTI MỚI TRÊN BANCHO
        const channel = await bancho.createLobby(roomName);
        const lobby = channel.lobby;
        const matchId = String(lobby.id);

        let inviteStatusText = '';

        // 🎯 4. LẮNG NGHE KHI CHỦ PHÒNG JOIN -> TỰ TRAO HOST & REFEREE
        let hasGrantedRights = false;
        lobby.on('playerJoined', async (data) => {
            const joinedPlayerName = data.player?.user?.username;

            if (joinedPlayerName && joinedPlayerName.toLowerCase() === ownerOsuName.toLowerCase() && !hasGrantedRights) {
                hasGrantedRights = true;
                try {
                    await lobby.setHost(ownerOsuName);
                    await channel.sendMessage(`!mp addref ${ownerOsuName}`);
                    await channel.sendMessage(`YUE: Đã giao quyền Host và Referee cho chủ phòng ${ownerOsuName}!`);
                } catch (err) {
                    console.error('Lỗi khi set Host/Ref:', err);
                }
            }
        });

        // 🎯 5. TỰ ĐỘNG BẮN LỜI MỜI IN-GAME CHO CHỦ PHÒNG
        try {
            await lobby.invitePlayer(ownerOsuName);
            inviteStatusText = `\n📩 *Đã gửi lời mời in-game cho **${ownerOsuName}**!*`;
        } catch (inviteErr) {
            console.error('Lỗi khi tự động mời chủ phòng:', inviteErr);
            inviteStatusText = `\n⚠️ *Không thể gửi lời mời in-game (kiểm tra lại tên osu! xem gõ đúng chưa nhé).*`;
        }

        // 🎯 6. LƯU PHÒNG VÀO RAM MANAGEMENT
        activeLobbies.set(matchId, {
            lobby: lobby,
            channel: channel,
            ownerId: message.author.id,
            ownerTag: message.author.username,
            createdAt: Date.now()
        });

        // Tự dọn dẹp RAM khi kênh phòng bị đóng
        channel.on('part', () => {
            activeLobbies.delete(matchId);
        });

        const mpUrl = `https://osu.ppy.sh/community/matches/${matchId}`;

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: 'osu! Multiplayer Room Created' })
            .setTitle(`🎮 ${lobby.name}`)
            .setURL(mpUrl)
            .setDescription(
                `Phòng Multiplayer đã được tạo thành công!${inviteStatusText}\n\n` +
                `▸ **Match ID:** \`${matchId}\`\n` +
                `▸ **Chủ phòng (osu!):** \`${ownerOsuName}\`\n` +
                `▸ **Link Match History:** [Bấm vào đây để xem chi tiết trận đấu](${mpUrl})\n\n` +
                `🛠️ **Lệnh điều khiển nhanh:**\n` +
                `• Mời người chơi: \`.inv ${matchId} <tên_player>\`\n` +
                `• Đóng phòng này: \`.mc ${matchId}\`\n\n` +
                `✨ *Ghi chú: Khi **${ownerOsuName}** join vào phòng, Yue sẽ tự trao Host & Ref luôn nhé!*`
            )
            .setFooter({ text: `Chủ phòng Discord: ${message.author.username} • Match ID: ${matchId}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });

    } catch (err) {
        console.error('Lỗi khi tạo room:', err);
        return message.reply('Có lỗi xảy ra trong quá trình tạo phòng Multi rồi Katashi ơi!');
    }
}
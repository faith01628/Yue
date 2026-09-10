import { EmbedBuilder } from 'discord.js';
import { initBancho, activeLobbies } from '../../services/osu/banchoService.js';
import { getLinkedOsuUsername } from '../../services/osu/userService.js';
import { register247Room } from '../../services/multi247/room247Manager.js';
import { botConfig } from '../../config/botConfig.js';
import { enableAutohostForChannel } from '../osuInGame/hostCommands.js';

export function build247RoomEmbed(matchId, roomName, ownerOsuName, discordUsername, inviteStatusText = '', isRecreated = false) {
    const mpUrl = `https://osu.ppy.sh/community/matches/${matchId}`;
    const statusHeader = isRecreated
        ? `🔄 **Phòng 24/7 đã tự động tái tạo mới sau 20 phút vắng người!**${inviteStatusText}`
        : `Phòng Multiplayer đã được tạo thành công!${inviteStatusText}`;

    return new EmbedBuilder()
        .setColor('#00b0f4')
        .setAuthor({ name: '🌐 osu! 24/7 Community Room Created' })
        .setTitle(`🎮 ${roomName}`)
        .setURL(mpUrl)
        .setDescription(
            `${statusHeader}\n\n` +
            `▸ **Match ID:** \`${matchId}\`\n` +
            `▸ **Chủ phòng (osu!):** \`${ownerOsuName}\`\n` +
            `▸ **Phân loại phòng:** 🛡️ **Chế độ 24/7 Cộng đồng**: Đã bật Anti-Spam, Lọc Toxic, Anti-Scam Link Blocker, Auto-Rejoin 24/7 & AI Trợ Lý Đa Ngôn Ngữ!\n` +
            `▸ **Link Match History:** [Bấm vào đây để xem chi tiết trận đấu](${mpUrl})\n\n` +
            `🛠️ **Lệnh điều khiển nhanh:**\n` +
            `• Mời người chơi: \`.inv ${matchId} <tên_player>\`\n` +
            `• Đóng phòng này: \`.mc ${matchId}\`\n\n` +
            `✨ *Ghi chú: Khi **${ownerOsuName}** join vào phòng, Yue sẽ tự trao Host & Ref luôn nhé!*`
        )
        .setFooter({ text: `Chủ phòng Discord: ${discordUsername || 'katashi'} • Match ID: ${matchId}` })
        .setTimestamp();
}

export async function handleMakeRoomCommand(message) {
    const args = message.content.trim().split(/ +/).slice(1);
    const cmdFirstWord = message.content.trim().split(/ +/)[0].toLowerCase();
    const is247Requested = ['.mr247', '.make247', '.make-room247', '.lobby247', '!mr247', '!make247'].includes(cmdFirstWord);
    const isOwnerKatashi = String(message.author.id) === '756427625970270248' || String(message.author.username).toLowerCase().includes('katashi');
    const ownerOsuName = getLinkedOsuUsername(message.author.id) || message.author.username;

    // 🔒 1. KIỂM TRA TOGGLE TÍNH NĂNG TỪ BOT CONFIG
    if (is247Requested) {
        if (!botConfig.osuMultiplayer?.community247Rooms) {
            return message.reply("⛔ **Tính năng tạo/vận hành Phòng 24/7 hiện đang TẮT trên instance này!** (Đang thử nghiệm ở Local hoặc bản khác).");
        }
        if (!isOwnerKatashi) {
            return message.reply("⛔ **Chỉ có Katashi (Creator) mới có quyền tạo và kích hoạt phòng Cộng Đồng 24/7!**\n👉 Ông có thể dùng lệnh `.mr <tên_phòng>` để tạo phòng Multiplayer thông thường nhé.");
        }
    } else {
        if (!botConfig.osuMultiplayer?.normalRooms) {
            return message.reply("⛔ **Tính năng Tạo Phòng Multiplayer Thường hiện đang TẮT trên instance này!** (Server VPS đang phụ trách phòng thường).");
        }
    }

    const defaultTitle = is247Requested
        ? (botConfig.osuMultiplayer?.default247RoomName || "Yue's 24/7 Community Room")
        : (botConfig.osuMultiplayer?.defaultRoomName || `Yue's Room (${ownerOsuName})`);

    const roomName = args.join(' ').trim() || defaultTitle;

    // 🎯 2. CHẶN NẾU NGƯỜI DÙNG ĐÃ CÓ PHÒNG ĐANG MỞ
    const existingLobby = Array.from(activeLobbies.values()).find(
        (item) => item.ownerId === message.author.id
    );

    if (existingLobby) {
        const existingMatchId = existingLobby.matchId || existingLobby.lobby?.id || 'Unknown';
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

        // 🔓 TẮT MẬT KHẨU PHÒNG & BẬT FREEMOD + AUTOHOST MẶC ĐỊNH
        try {
            await channel.sendMessage('!mp password'); // Xóa mật khẩu phòng để mở công khai
            await channel.sendMessage('!mp set 0 0'); // HeadToHead, ScoreV1
            await channel.sendMessage('!mp mods FreeMod'); // Bật FreeMod mặc định
            enableAutohostForChannel(channel);
        } catch (setupErr) {
            console.error('Lỗi khi thiết lập mặc định (No password / FreeMod / AutoHost):', setupErr.message);
        }

        let inviteStatusText = '';

        // 🎯 4. LẮNG NGHE KHI CHỦ PHÒNG JOIN -> TỰ TRAO HOST & REFEREE
        let hasGrantedRights = false;
        lobby.on('playerJoined', async (data) => {
            const joinedPlayerName = data.player?.user?.username;

            if (joinedPlayerName && joinedPlayerName.toLowerCase() === ownerOsuName.toLowerCase() && !hasGrantedRights) {
                hasGrantedRights = true;
                try {
                    if (!is247Requested) {
                        await lobby.setHost(ownerOsuName);
                    }
                    await channel.sendMessage(`!mp addref ${ownerOsuName}`);
                    await channel.sendMessage(`YUE: Granted Host and Referee rights to room owner ${ownerOsuName}!`);
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

        // 🎯 6. KIỂM TRA LOẠI PHÒNG (PHÒNG THƯỜNG VS PHÒNG CỘNG ĐỒNG 24/7)
        activeLobbies.set(matchId, {
            lobby: lobby,
            channel: channel,
            ownerId: message.author.id,
            ownerTag: message.author.username,
            is247: is247Requested,
            createdAt: Date.now()
        });

        if (!is247Requested) {
            // ⏳ PHÒNG THƯỜNG: TỰ ĐỘNG ĐÓNG SAU 15 PHÚT KHÔNG HOẠT ĐỘNG
            setTimeout(async () => {
                const lobbyItem = activeLobbies.get(matchId);
                if (lobbyItem && !lobbyItem.is247) {
                    try {
                        const mpChannel = channel;
                        if (mpChannel) {
                            await mpChannel.sendMessage('YUE: Normal room expired after 15 minutes of inactivity. Closing room!');
                            await mpChannel.sendMessage('!mp close');
                        }
                    } catch (e) {
                        console.error('Lỗi khi auto-close phòng thường hết hạn:', e.message);
                    } finally {
                        activeLobbies.delete(matchId);
                    }
                }
            }, 15 * 60 * 1000);
        }

        // Tự dọn dẹp RAM khi kênh phòng bị đóng
        channel.on('part', () => {
            activeLobbies.delete(matchId);
        });

        const mpUrl = `https://osu.ppy.sh/community/matches/${matchId}`;

        let embed;
        if (is247Requested) {
            embed = build247RoomEmbed(matchId, roomName, ownerOsuName, message.author.username, inviteStatusText);
        } else {
            embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setAuthor({ name: '🎮 osu! Normal Multiplayer Room Created' })
                .setTitle(`🎮 ${lobby.name}`)
                .setURL(mpUrl)
                .setDescription(
                    `Phòng Multiplayer đã được tạo thành công!${inviteStatusText}\n\n` +
                    `▸ **Match ID:** \`${matchId}\`\n` +
                    `▸ **Chủ phòng (osu!):** \`${ownerOsuName}\`\n` +
                    `▸ **Phân loại phòng:** ⚡ **Chế độ Thường**: Quản lý cơ bản (.ah, .host, .map, .a). Tự đóng khi ngắt kết nối.\n` +
                    `▸ **Link Match History:** [Bấm vào đây để xem chi tiết trận đấu](${mpUrl})\n\n` +
                    `🛠️ **Lệnh điều khiển nhanh:**\n` +
                    `• Mời người chơi: \`.inv ${matchId} <tên_player>\`\n` +
                    `• Đóng phòng này: \`.mc ${matchId}\`\n\n` +
                    `✨ *Ghi chú: Khi **${ownerOsuName}** join vào phòng, Yue sẽ tự trao Host & Ref luôn nhé!*`
                )
                .setFooter({ text: `Chủ phòng Discord: ${message.author.username} • Match ID: ${matchId}` })
                .setTimestamp();
        }

        const sentMsg = await message.reply({ embeds: [embed] });

        if (is247Requested) {
            register247Room(matchId, {
                roomName: roomName,
                ownerDiscordId: message.author.id,
                ownerOsuName: ownerOsuName,
                ownerDiscordTag: message.author.username,
                starMin: 0.0,
                starMax: 6.99,
                discordChannelId: message.channel.id,
                discordMessageId: sentMsg.id
            });
        }

        return sentMsg;

    } catch (err) {
        console.error('Lỗi khi tạo room:', err);
        return message.reply('Có lỗi xảy ra trong quá trình tạo phòng Multi rồi Katashi ơi!');
    }
}
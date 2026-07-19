import { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import { listenToUser } from '../services/sttService.js';

// Khởi tạo bộ phát âm thanh dùng chung cho phòng Voice
const player = createAudioPlayer();

player.on(AudioPlayerStatus.Playing, () => {
    console.log('🔊 Yue AI đang phát giọng nói vào phòng thoại.');
});

player.on('error', error => {
    console.error(`❌ Lỗi bộ phát âm thanh (Audio Player): ${error.message}`);
});

/**
 * Xử lý lệnh cho Bot tham gia vào phòng Voice và bắt đầu nghe-nói
 * @param {import('discord.js').Message} message - Tin nhắn từ Discord
 */
export async function handleJoinCommand(message) {
    // 1. Kiểm tra xem người dùng có đang ở trong một phòng Voice nào không
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        return message.reply("Ơ kìa, vào phòng Voice đứng chờ tui trước đi chứ! 🙄");
    }

    try {
        // 2. Tiến hành kết nối vào phòng Voice
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false, // BẮT BUỘC bằng false để Bot không bị điếc (mới nghe được bạn nói)
            selfMute: false  // BẮT BUỘC bằng false để Bot không bị câm (mới gáy được)
        });

        // 3. Đăng ký bộ phát âm thanh vào đường kết nối này
        connection.subscribe(player);
        
        message.reply(`Yue đã nhảy vào phòng Voice **${voiceChannel.name}** rồi nha! Đang mở tai lắng nghe đây... 🎙️`);

        const userId = message.author.id;
        const username = message.author.username;

        // 4. Kích hoạt tính năng "màng nhĩ" lắng nghe riêng bạn trong phòng thoại
        listenToUser(connection, userId, username, player, message.channel);

    } catch (error) {
        console.error("❌ Lỗi khi kết nối phòng Voice:", error);
        message.reply("Huhu, đường dây kết nối phòng thoại bị nghẽn rồi, cứu tui! 💥");
    }
}
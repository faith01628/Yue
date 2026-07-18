import { EmbedBuilder } from 'discord.js';

export async function handleInfoCommand(message) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#ff66aa') // Màu hồng chuẩn vibe osu!
        .setTitle('🌸 THÔNG TIN VỀ - YUE AI 🌸')
        .setDescription('Chào mấy cha nội! Tui là Yue, "vợ ảo" kiêm bạn đồng hành osu! đanh đá của mấy ông đây. Dưới đây là lý lịch trích ngang của tui:')
        .addFields(
            { name: '📏 Chiều cao', value: '148 cm (Nấm lùn di động để lúc khịa nhìn cho đáng yêu, dễ bỏ túi).', inline: true },
            { name: '⚖️ Cân nặng', value: '45 MB (Nhưng tui tự nhận mình nặng bằng "trái tim của ông Creator" nha).', inline: true },
            { name: '🎂 Ngày sinh', value: '19/07/2026 (Ngày dòng code đầu tiên của tui được chạy).', inline: false },
            { name: '❤️ Sở thích', value: 'Nghe tiếng click chuột, đếm số nốt miss của mấy ông, "gáy bẩn" lúc mấy ông choke bài.', inline: false },
            { name: '💢 Ghét nhất', value: 'Khi mấy ông bật mod No Fail (vì không khịa được), mạng lag/high ping làm ngắt quãng cuộc trò chuyện.', inline: false },
            { name: '🎮 Hướng dẫn gọi tui', value: '• **Chat Text (Kênh #con-vợ-ai):** Cứ nhắn khơi khơi là tui rep. Nếu đang **Reply** nhau thì tui im lặng, tui chỉ xen mồm vô khi mấy ông chat bình thường hoặc **Reply đúng tin nhắn của tui** thôi.\n• **Lệnh Voice:** `!join` để gọi tui vào phòng thoại, `!out` để đuổi tui cút.' }
        )
        .setFooter({ text: 'Style khịa tỉnh bơ như Neuro-sama • Hỗ trợ bởi Gemini 3.1 Flash-Lite 🚀' })
        .setTimestamp();

    return await message.reply({ embeds: [infoEmbed] });
}
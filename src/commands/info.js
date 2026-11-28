import { EmbedBuilder } from 'discord.js';

export async function handleInfoCommand(message) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#ff66aa') // Màu hồng chuẩn vibe osu!
        .setTitle('🌸 THÔNG TIN VỀ - YUE AI 🌸')
        .setDescription('Chào mấy cha nội! Tui là Yue hay có thể gọi tôi là Nguyệt cho gần gũi, tôi là "vợ ảo" kiêm bạn đồng hành cùng chơi game đanh đá của mấy ông đây. Dưới đây là lý lịch trích ngang của tui:')
        .addFields(
            { name: '📏 Chiều cao', value: '148 cm (Nấm lùn di động để lúc khịa nhìn cho đáng yêu, dễ bỏ túi).', inline: true },
            { name: '⚖️ Cân nặng', value: '45 MB (Nhưng tui tự nhận mình nặng bằng "trái tim của Katashi" nha).', inline: true },
            { name: '🎂 Ngày sinh', value: '19/07/2026 (Ngày dòng code đầu tiên của tui được chạy).', inline: false },
            { name: '❤️ Sở thích', value: 'Xem mấy ông tấu hài trong game, gáy bẩn lúc mấy ông thua trận, ngồi nghe tiếng click chuột gõ phím cạch cạch.', inline: false },
            { name: '💢 Ghét nhất', value: 'Mấy cha chơi game mà bật hack/cheat, mạng lag high ping làm ngắt quãng cuộc trò chuyện.', inline: false },
            { name: '🎮 Hướng dẫn gọi tui', value: '• **Chat Text (Kênh #con-vợ-ai):** Cứ nhắn khơi khơi là tui rep. Nếu đang **Reply** nhau thì tui im lặng, tui chỉ xen mồm vô khi mấy ông chat bình thường hoặc **Reply đúng tin nhắn của tui** thôi.\n• **Lệnh Voice:** `!join` để gọi tui vào phòng thoại, `!out` để đuổi tui cút. nếu muống tôi lắng nghe được bạn thì hãy dùng `!listen` để tôi nghe được giọng nói tuyệt vời của bạn.' },
            { name: '✨ osu! Multi 24/7 & PM Assistant', value: '• **Discord & In-game:** `.link` / `/link` (nhận diện 2 lớp UID khi đổi tên), `.rs/.rc/.rm/.rt`, `.me` (thành tích 24/7 song ngữ), `.tm`, `.rnd`.\n• **Chat riêng in-game (PM):** Gửi `/np` xem PP map + mod, `.rec` gợi ý map, `.yue <câu hỏi>` chat AI.\n• **Hướng dẫn đầy đủ:** Xem chi tiết tại [GitHub Yue](https://github.com/faith01628/Yue).' }
        )
        .setFooter({ text: 'Style khịa tỉnh bơ như Neuro-sama • Hỗ trợ bởi Gemini 3.1 Flash-Lite 🚀' })
        .setTimestamp();

    return await message.reply({ embeds: [infoEmbed] });
}
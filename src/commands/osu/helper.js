/**
 * Cào Beatmap ID thông minh (Phân biệt Reply & Bỏ qua Embed lặp từ lệnh .c)
 */
export async function findBeatmapIdFromChannel(message) {
    try {
        // 🎯 1. ƯU TIÊN SỐ 1: Nếu người dùng đang Reply một tin nhắn cụ thể
        if (message.reference && message.reference.messageId) {
            try {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                
                // Lấy từ Embeds
                if (referencedMessage.embeds.length > 0) {
                    for (const embed of referencedMessage.embeds) {
                        if (embed.url && embed.url.includes('osu.ppy.sh')) {
                            const match = embed.url.match(/beatmaps\/(\d+)|b\/(\d+)/);
                            if (match) return match[1] || match[2];
                        }
                    }
                }

                // Lấy từ Text Link
                if (referencedMessage.content) {
                    const match = referencedMessage.content.match(/osu\.ppy\.sh\/(?:beatmapsets\/\d+#osu\/|b\/|beatmaps\/)(\d+)/);
                    if (match) return match[1];
                }
            } catch (refErr) {
                console.error("❌ Lỗi fetch tin nhắn reply:", refErr);
            }
        }

        // 🎯 2. ƯU TIÊN SỐ 2: Cào 50 tin nhắn gần nhất (Bỏ qua các kết quả .c / .lb trùng lặp)
        const recentMessages = await message.channel.messages.fetch({ limit: 50 });
        for (const msg of recentMessages.values()) {

            // Bỏ qua chính tin nhắn chứa lệnh vừa gõ
            if (msg.id === message.id) continue;

            // Nếu là Embed
            if (msg.embeds.length > 0) {
                for (const embed of msg.embeds) {
                    // Bỏ qua các Embed thông báo lỗi hoặc Embed kết quả so sánh (.c) trùng lặp của Bot
                    if (embed.author?.name?.includes('Các điểm số của') || embed.author?.name?.includes('Leaderboard')) {
                        continue;
                    }

                    if (embed.url && embed.url.includes('osu.ppy.sh')) {
                        const match = embed.url.match(/beatmaps\/(\d+)|b\/(\d+)/);
                        if (match) return match[1] || match[2];
                    }
                }
            }

            // Nếu là Link chữ do người dùng quăng vào Chat
            if (msg.content) {
                const match = msg.content.match(/osu\.ppy\.sh\/(?:beatmapsets\/\d+#osu\/|b\/|beatmaps\/)(\d+)/);
                if (match) return match[1];
            }
        }
    } catch (err) {
        console.error("❌ Lỗi cào tin nhắn tìm Beatmap ID:", err);
    }
    return null;
}
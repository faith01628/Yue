/**
 * conversationContextService.js
 * Quản lý Bộ Đệm Tóm Tắt Chủ Đề (Rolling Topic Summary) & Lọc Nhiễu Lịch Sử Chat Discord.
 */

// Lưu tóm tắt chủ đề theo từng Channel ID: Map<channelId, { summary: string, updatedAt: number, msgCount: number }>
const topicSummaries = new Map();

// Các từ vựng/mẫu spam hoặc lệnh rác cần lọc bỏ khỏi lịch sử chat
const SPAM_PATTERNS = [
    /^(ok|kaka|kakaka|kkk|haha|hahaha|lol|bruh|vãi|vl|đù|dạ|uh|ừ|yep|nope|hi|hello)$/i,
    /^[^\w\s]+$/, // Chỉ chứa icon/ký tự đặc biệt
];

/**
 * 🧹 LỌC NHIỄU & GỘP LỊCH SỬ CHAT DISCORD SÂU (TỐI ĐA 30-40 TIN NHẮN)
 * Returns { history: Array, pendingUserText: string }
 */
export function filterCleanHistory(rawMessages, botUserId, maxTurns = 40) {
    if (!rawMessages || rawMessages.length === 0) {
        return { history: [], pendingUserText: '' };
    }

    const turns = []; // [{ role: 'user' | 'model', contentLines: [] }]

    for (const msg of rawMessages) {
        const content = msg.content ? msg.content.trim() : '';
        const hasAttachment = Boolean(msg.hasAttachment) || Boolean(msg.attachments && (msg.attachments.size > 0 || msg.attachments.length > 0));

        // 1. Bỏ qua tin nhắn trống không có ảnh
        if (!content && !hasAttachment) continue;

        // 2. Bỏ qua tin nhắn lệnh prefix (.r, .top, .osu, .ah, ...)
        if (content.startsWith('.') || content.startsWith('!')) continue;

        // 3. Bỏ qua các tin nhắn spam cực ngắn không chứa thông tin (ngoại trừ có ảnh)
        if (!hasAttachment && SPAM_PATTERNS.some(pattern => pattern.test(content))) continue;

        const authorName = msg.authorName || msg.member?.displayName || msg.author?.username || 'User';
        const isBot = msg.isBot !== undefined ? Boolean(msg.isBot) : (msg.author?.id === botUserId || Boolean(msg.author?.bot));
        const role = isBot ? 'model' : 'user';

        let formattedLine = '';
        if (isBot) {
            let cleanText = content;
            try {
                const parsed = JSON.parse(content);
                cleanText = parsed.reply || content;
            } catch {
                cleanText = content.replace(/```json/gi, '').replace(/```/g, '').trim();
            }
            formattedLine = cleanText;
        } else {
            formattedLine = `[${authorName}]: ${content}${hasAttachment ? ' [Gửi kèm 1 ảnh]' : ''}`;
        }

        // Gộp các câu nhắn liên tiếp cùng vai trò (user gộp với user, bot gộp với bot)
        const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
        if (lastTurn && lastTurn.role === role) {
            lastTurn.contentLines.push(formattedLine);
        } else {
            turns.push({ role, contentLines: [formattedLine] });
        }
    }

    // Đảm bảo lượt thoại bắt đầu từ 'user' (Gemini API bắt buộc lượt 1 là user)
    while (turns.length > 0 && turns[0].role === 'model') {
        turns.shift();
    }

    // Nếu lượt cuối cùng là 'user' (user đã nhắn trước đó nhưng Bot chưa kịp phản hồi),
    // bóc phần chat user chưa rep đó ra để đính kèm trực tiếp vào lượt nhắn hiện tại.
    let pendingUserText = '';
    if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
        const lastUserTurn = turns.pop();
        pendingUserText = lastUserTurn.contentLines.join('\n');
    }

    // Giới hạn số lượt thoại (mỗi lượt đại diện cho 1 cụm thoại user hoặc bot)
    const slicedTurns = turns.slice(-maxTurns);

    // Chuyển đổi sang định dạng Gemini SDK { role, parts: [{ text }] }
    const history = slicedTurns.map(t => {
        if (t.role === 'model') {
            const combinedReply = t.contentLines.join('\n');
            return {
                role: 'model',
                parts: [{ text: JSON.stringify({ reply: combinedReply }) }]
            };
        } else {
            return {
                role: 'user',
                parts: [{ text: t.contentLines.join('\n') }]
            };
        }
    });

    return { history, pendingUserText };
}

/**
 * 🧠 CẬP NHẬT TÓM TẮT CHỦ ĐỀ CHANNELS (ROLLING TOPIC SUMMARY)
 */
export function updateTopicSummary(channelId, userPrompt, aiReply) {
    if (!channelId) return;

    const current = topicSummaries.get(channelId) || { summary: '', msgCount: 0 };
    current.msgCount += 1;

    // Đơn giản hóa tóm tắt bằng cách cập nhật chủ đề gần đây (không tốn token gọi AI phụ)
    if (!current.summary) {
        current.summary = `Cuộc trò chuyện vừa mở đầu với nội dung: "${userPrompt.substring(0, 60)}"`;
    } else if (current.msgCount % 4 === 0) {
        // Cập nhật lại mốc chủ đề sau mỗi 4 lượt thoại
        current.summary = `Chủ đề gần đây: "${userPrompt.substring(0, 50)}" -> Yue đáp: "${aiReply.substring(0, 50)}"`;
    }

    current.updatedAt = Date.now();
    topicSummaries.set(channelId, current);
}

/**
 * LẤY TÓM TẮT CHỦ ĐỀ CỦA CHANNEL
 */
export function getTopicSummary(channelId) {
    const data = topicSummaries.get(channelId);
    return data?.summary || null;
}

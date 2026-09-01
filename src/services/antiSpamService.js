/**
 * 🛡️ ANTI-SPAM SERVICE DÀNH CHO YUE AI
 * Giúp ngăn chặn spam tin nhắn dồn dập, trùng lặp và bảo vệ dung lượng API Token.
 */

const userSpamState = new Map();

// Cấu hình quy tắc Anti-Spam
const COOLDOWN_MS = 3000;           // Khoảng cách tối thiểu 3 giây giữa 2 lượt chat AI
const BURST_WINDOW_MS = 8000;       // Khung thời gian theo dõi 8 giây
const MAX_BURST_COUNT = 4;          // Tối đa 4 tin nhắn trong 8 giây
const MUTE_DURATION_MS = 20000;     // Tạm khóa phản hồi AI trong 20 giây nếu spam dồn dập
const MAX_DUPLICATES = 3;           // Tối đa 3 tin nhắn nội dung giống hệt nhau liên tiếp

/**
 * Kiểm tra xem tin nhắn người dùng có phải là spam hay không
 * @param {string} userId - Discord ID của người dùng
 * @param {string} username - Tên hiển thị người dùng
 * @param {string} content - Nội dung tin nhắn
 * @returns {{ isSpam: boolean, reason: string|null, replyMessage: string|null }}
 */
export function checkAntiSpam(userId, username, content) {
    const now = Date.now();
    let state = userSpamState.get(userId);

    if (!state) {
        state = {
            lastMessageTime: 0,
            recentTimestamps: [],
            lastMessageContent: '',
            duplicateCount: 1,
            mutedUntil: 0
        };
        userSpamState.set(userId, state);
    }

    // 1. Kiểm tra xem User có đang trong thời gian bị tạm khóa (Muted) do spam không
    if (now < state.mutedUntil) {
        return {
            isSpam: true,
            reason: 'MUTED',
            replyMessage: null // Giữ im lặng hoàn toàn khi đang bị khóa để tránh Bot lặp lại tin nhắn cảnh báo
        };
    }

    // Làm sạch các mốc thời gian ngoài khung BURST_WINDOW_MS
    state.recentTimestamps = state.recentTimestamps.filter(t => (now - t) < BURST_WINDOW_MS);
    state.recentTimestamps.push(now);

    // 2. Kiểm tra Spam dồn dập (Burst Messaging)
    if (state.recentTimestamps.length > MAX_BURST_COUNT) {
        state.mutedUntil = now + MUTE_DURATION_MS;
        return {
            isSpam: true,
            reason: 'BURST_SPAM',
            replyMessage: `💢 **${username}** ơi, nhắn dồn dập dữ vậy! Tui tạm ngó lơ ông 20 giây cho bình tĩnh lại nha 🙄`
        };
    }

    // 3. Kiểm tra Spam tin nhắn trùng lặp (Duplicate Content)
    const cleanContent = (content || '').trim().toLowerCase();
    if (cleanContent && cleanContent === state.lastMessageContent) {
        state.duplicateCount += 1;
        if (state.duplicateCount >= MAX_DUPLICATES) {
            return {
                isSpam: true,
                reason: 'DUPLICATE_SPAM',
                replyMessage: `🙄 Cái câu này ông nhắn ${state.duplicateCount} lần liên tiếp rồi đó! Bị kẹt phím hay đĩa xước vậy?`
            };
        }
    } else {
        state.lastMessageContent = cleanContent;
        state.duplicateCount = 1;
    }

    // 4. Kiểm tra Cooldown thời gian giữa 2 tin nhắn (3 giây)
    const timeSinceLast = now - state.lastMessageTime;
    if (timeSinceLast < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - timeSinceLast) / 1000);
        return {
            isSpam: true,
            reason: 'COOLDOWN',
            replyMessage: `⏱️ Từ từ thôi ông ơi! Nhắn nhanh quá tui chưa tiếp thu kịp nè (chờ ${waitSec}s nhé).`
        };
    }

    // Cập nhật mốc thời gian tin nhắn hợp lệ mới nhất
    state.lastMessageTime = now;

    return {
        isSpam: false,
        reason: null,
        replyMessage: null
    };
}

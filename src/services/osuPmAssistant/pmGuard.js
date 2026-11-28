import { checkAbusiveContent } from '../../moderation/index.js';

/**
 * Lớp chống spam & kiểm soát giới hạn gửi tin cho osu! PM Assistant
 * - Bộ lọc từ thô tục / công kích cá nhân được import từ src/moderation/
 * - Đếm vi phạm & tự động tạm chặn user cố tình chửi bới/tấn công
 * - Chống spam tin nhắn lặp & spam tốc độ cao theo từng người
 * - Trần gửi tin toàn cục (Global Outbound Rate Limiter) bảo vệ tài khoản cá nhân trên Bancho
 */

const DEFAULT_ABUSE_WINDOW_MS = 10 * 60 * 1000;   // 10 phút
const DEFAULT_MAX_ABUSE_STRIKES = 3;
const DEFAULT_ABUSE_BLOCK_MS = 30 * 60 * 1000;    // 30 phút

const DEFAULT_SPAM_WINDOW_MS = 15 * 1000;         // 15 giây
const DEFAULT_MAX_MESSAGES_PER_WINDOW = 4;
const DEFAULT_SPAM_MUTE_MS = 5 * 60 * 1000;       // 5 phút
const DEFAULT_DUPLICATE_WINDOW_MS = 10 * 1000;    // 10 giây

const DEFAULT_GLOBAL_MAX_OUTBOUND = 6;            // Tối đa 6 tin gửi ra trong 10s
const DEFAULT_GLOBAL_WINDOW_MS = 10 * 1000;

const blockedUntilMap = new Map();
const abuseStrikesMap = new Map();
const userMessageHistoryMap = new Map();
const userLastMessageMap = new Map();
let globalOutboundTimestamps = [];

function normalizeKey(username) {
    return String(username || '').trim().toLowerCase();
}

export { checkAbusiveContent };

export function isUserBlocked(username) {
    const key = normalizeKey(username);
    if (!key) return false;
    const until = blockedUntilMap.get(key) || 0;
    if (!until) return false;
    if (Date.now() >= until) {
        blockedUntilMap.delete(key);
        return false;
    }
    return true;
}

export function unblockUser(username) {
    const key = normalizeKey(username);
    if (!key) return false;
    const existed = blockedUntilMap.has(key) || abuseStrikesMap.has(key);
    blockedUntilMap.delete(key);
    abuseStrikesMap.delete(key);
    userMessageHistoryMap.delete(key);
    userLastMessageMap.delete(key);
    return existed;
}

/**
 * Ghi nhận 1 lần vi phạm ngôn từ; đủ ngưỡng sẽ tự tạm chặn người dùng
 */
export function recordAbuseStrike(username, cfg = {}) {
    const key = normalizeKey(username);
    if (!key) return { blocked: false, shouldReply: true, strikes: 0 };

    const now = Date.now();
    const windowMs = cfg.abuseWindowMs ?? DEFAULT_ABUSE_WINDOW_MS;
    const maxStrikes = cfg.maxAbuseStrikes ?? DEFAULT_MAX_ABUSE_STRIKES;
    const blockMs = cfg.abuseBlockMs ?? DEFAULT_ABUSE_BLOCK_MS;

    const prev = abuseStrikesMap.get(key);
    let strikes = 1;
    if (prev && (now - prev.firstAt < windowMs)) {
        strikes = prev.count + 1;
        abuseStrikesMap.set(key, { count: strikes, firstAt: prev.firstAt });
    } else {
        abuseStrikesMap.set(key, { count: 1, firstAt: now });
    }

    if (strikes >= maxStrikes) {
        blockedUntilMap.set(key, now + blockMs);
        abuseStrikesMap.delete(key);
        return { blocked: true, shouldReply: false, strikes };
    }

    return { blocked: false, shouldReply: true, strikes };
}

/**
 * Kiểm tra chống spam tin nhắn lặp và tốc độ gửi theo từng người chơi
 * @returns {{ allowed: boolean, action: 'allow' | 'warn_once' | 'silent' }}
 */
export function checkUserSpam(username, content, cfg = {}) {
    const key = normalizeKey(username);
    if (!key) return { allowed: true, action: 'allow' };

    if (isUserBlocked(key)) {
        return { allowed: false, action: 'silent' };
    }

    const now = Date.now();
    const dupWindowMs = cfg.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
    const spamWindowMs = cfg.spamWindowMs ?? DEFAULT_SPAM_WINDOW_MS;
    const maxMessages = cfg.maxMessagesPerWindow ?? DEFAULT_MAX_MESSAGES_PER_WINDOW;
    const spamMuteMs = cfg.spamMuteMs ?? DEFAULT_SPAM_MUTE_MS;

    const normalizedContent = String(content || '').trim().toLowerCase();
    const lastMsg = userLastMessageMap.get(key);
    if (lastMsg && lastMsg.content === normalizedContent && (now - lastMsg.at < dupWindowMs)) {
        return { allowed: false, action: 'silent' };
    }
    userLastMessageMap.set(key, { content: normalizedContent, at: now });

    const history = (userMessageHistoryMap.get(key) || []).filter(ts => now - ts < spamWindowMs);
    history.push(now);
    userMessageHistoryMap.set(key, history);

    if (history.length > maxMessages) {
        blockedUntilMap.set(key, now + spamMuteMs);
        userMessageHistoryMap.delete(key);
        return { allowed: false, action: 'warn_once' };
    }

    return { allowed: true, action: 'allow' };
}

/**
 * Trần gửi tin toàn cục bảo vệ tài khoản cá nhân khỏi bị Bancho IRC silence
 */
export function canSendGlobalOutbound(cfg = {}) {
    const now = Date.now();
    const maxOutbound = cfg.globalMaxOutbound ?? DEFAULT_GLOBAL_MAX_OUTBOUND;
    const windowMs = cfg.globalWindowMs ?? DEFAULT_GLOBAL_WINDOW_MS;

    globalOutboundTimestamps = globalOutboundTimestamps.filter(ts => now - ts < windowMs);
    if (globalOutboundTimestamps.length >= maxOutbound) {
        return false;
    }

    globalOutboundTimestamps.push(now);
    return true;
}

export function resetPmGuardForTest() {
    blockedUntilMap.clear();
    abuseStrikesMap.clear();
    userMessageHistoryMap.clear();
    userLastMessageMap.clear();
    globalOutboundTimestamps = [];
}

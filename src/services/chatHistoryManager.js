/**
 * chatHistoryManager.js
 * Quản lý bộ đệm lưu 40 tin nhắn gần nhất theo từng Kênh Discord ra file JSON cục bộ.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_DIR = path.join(__dirname, '../data/chatHistory');
const MAX_HISTORY_PER_CHANNEL = 500;

// Đảm bảo thư mục lưu trữ tồn tại
if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function getChannelFilePath(channelId) {
    const safeChannelId = String(channelId).replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(HISTORY_DIR, `channel_${safeChannelId}.json`);
}

/**
 * Lấy lịch sử chat của một kênh từ file JSON local (Tối đa maxCount tin nhắn)
 */
export function getLocalChannelHistory(channelId, maxCount = MAX_HISTORY_PER_CHANNEL) {
    if (!channelId) return [];

    const filePath = getChannelFilePath(channelId);
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const history = JSON.parse(rawData);
        return Array.isArray(history) ? history.slice(-maxCount) : [];
    } catch (err) {
        console.error(`❌ Lỗi đọc file lịch sử kênh ${channelId}:`, err.message);
        return [];
    }
}

/**
 * Thêm tin nhắn mới của User vào lịch sử của kênh và ghi ra file JSON
 * @param {string} channelId
 * @param {object} msgData { authorId, authorName, content, isBot, timestamp, hasAttachment }
 */
export function saveMessageToLocalHistory(channelId, msgData) {
    if (!channelId || !msgData) return;

    const filePath = getChannelFilePath(channelId);
    let history = getLocalChannelHistory(channelId, MAX_HISTORY_PER_CHANNEL);

    const content = msgData.content ? msgData.content.trim() : '';

    // Lọc bỏ câu rác hoặc lệnh prefix trước khi lưu
    if (!content && !msgData.hasAttachment) return;
    if (content.startsWith('.') || content.startsWith('!')) return;

    const newEntry = {
        authorId: msgData.authorId || 'unknown',
        authorName: msgData.authorName || (msgData.isBot ? 'Yue' : 'User'),
        content: content,
        isBot: Boolean(msgData.isBot),
        hasAttachment: Boolean(msgData.hasAttachment),
        timestamp: msgData.timestamp || Date.now()
    };

    history.push(newEntry);

    // Giữ tối đa MAX_HISTORY_PER_CHANNEL tin nhắn gần nhất
    if (history.length > MAX_HISTORY_PER_CHANNEL) {
        history = history.slice(-MAX_HISTORY_PER_CHANNEL);
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
        console.error(`❌ Lỗi ghi file lịch sử kênh ${channelId}:`, err.message);
    }
}

/**
 * Thêm phản hồi của Yue vào lịch sử kênh
 */
export function saveYueReplyToLocalHistory(channelId, replyText) {
    if (!channelId || !replyText) return;

    saveMessageToLocalHistory(channelId, {
        authorId: 'yue_bot',
        authorName: 'Yue',
        content: replyText,
        isBot: true,
        timestamp: Date.now()
    });
}

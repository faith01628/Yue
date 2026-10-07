import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../utils/safeStorage.js';
import { getVNTimeInfo } from './osu/dailyLeaderboardService.js';
import { sendAdminDebugLog } from '../domains/shared/logger/adminDebugLogger.js';

const REMINDERS_FILE = path.resolve('data/ownerReminders.json');

/**
 * Lấy danh sách admin/owner User ID
 */
export function getOwnerUserIds() {
    const envIds = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    
    const defaultOwnerId = '756427625970270248';
    if (!envIds.includes(defaultOwnerId)) {
        envIds.push(defaultOwnerId);
    }
    return envIds;
}

export function isOwnerUser(userId) {
    if (!userId) return false;
    return getOwnerUserIds().includes(String(userId));
}

function loadReminderData() {
    return safeReadJSON(REMINDERS_FILE, { reminders: [], settings: { sleepNotifyEnabled: true, lastSleepNotifyDate: '' } });
}

function saveReminderData(data) {
    return safeWriteJSON(REMINDERS_FILE, data);
}

/**
 * ⏰ 1. THÊM LỆNH HẸN GIỜ NHẮC NHỞ CHO BOSS
 */
export function addOwnerReminder(userId, text, targetTimestamp) {
    const data = loadReminderData();
    if (!Array.isArray(data.reminders)) data.reminders = [];

    const newReminder = {
        id: `rem_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId: String(userId),
        text: String(text).trim(),
        targetTimestamp: Number(targetTimestamp),
        createdAt: Date.now(),
        status: 'pending'
    };

    data.reminders.push(newReminder);
    saveReminderData(data);
    return newReminder;
}

/**
 * 📜 2. LẤY DANH SÁCH LỊCH HẸN GIỜ ĐANG CHỜ
 */
export function getPendingReminders(userId) {
    const data = loadReminderData();
    const reminders = Array.isArray(data.reminders) ? data.reminders : [];
    return reminders.filter(r => r.userId === String(userId) && r.status === 'pending');
}

/**
 * 🗑️ 3. XÓA HOẶC HỦY NHẮC NHỞ
 */
export function deleteReminder(reminderId) {
    const data = loadReminderData();
    if (!Array.isArray(data.reminders)) return false;
    const initialLen = data.reminders.length;
    data.reminders = data.reminders.filter(r => r.id !== reminderId);
    if (data.reminders.length !== initialLen) {
        saveReminderData(data);
        return true;
    }
    return false;
}

/**
 * ⚙️ 4. BẬT/TẮT TÍNH NĂNG NHẮC ĐI NGỦ KHUYA
 */
export function toggleSleepNotify(enabled = null) {
    const data = loadReminderData();
    if (!data.settings) data.settings = {};
    if (enabled === null) {
        data.settings.sleepNotifyEnabled = !data.settings.sleepNotifyEnabled;
    } else {
        data.settings.sleepNotifyEnabled = Boolean(enabled);
    }
    saveReminderData(data);
    return data.settings.sleepNotifyEnabled;
}

/**
 * 🧠 5. HÀM PHÂN TÍCH THỜI GIAN TỰ NHIÊN (NATURAL TIME PARSER)
 * Ví dụ:
 * - "sau 30 phút", "10 phút nữa"
 * - "sau 2 tiếng", "1 giờ nữa"
 * - "5h", "17:00", "5h chiều", "8h30 sáng"
 */
export function parseNaturalTime(textInput) {
    if (!textInput) return null;
    const text = textInput.toLowerCase().trim();
    const now = Date.now();
    const vnNow = getVNTimeInfo(new Date(now));

    // 1. Dạng tương đối: "sau X phút" / "X phút nữa" / "sau X min"
    const minMatch = text.match(/(?:sau\s+)?(\d+)\s*(?:phút|p|min|m)\s*(?:nữa)?/i);
    if (minMatch) {
        const mins = parseInt(minMatch[1], 10);
        if (mins > 0) {
            return {
                targetTimestamp: now + mins * 60 * 1000,
                durationText: `${mins} phút`
            };
        }
    }

    // 2. Dạng tương đối: "sau X tiếng" / "X giờ nữa" / "sau Xh"
    const hourRelMatch = text.match(/(?:sau\s+)?(\d+)\s*(?:tiếng|giờ|g|h)\s*(?:nữa)?/i);
    if (hourRelMatch && (text.includes('sau') || text.includes('nữa'))) {
        const hours = parseInt(hourRelMatch[1], 10);
        if (hours > 0) {
            return {
                targetTimestamp: now + hours * 60 * 60 * 1000,
                durationText: `${hours} giờ`
            };
        }
    }

    // 3. Dạng mốc giờ cụ thể: "17h", "17:30", "5h chiều", "8h sáng", "05:00"
    const timeMatch = text.match(/(\d{1,2})(?:[:h](\d{1,2}))?\s*(sáng|trưa|chiều|tối|đêm)?/i);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const period = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

        if (period === 'chiều' || period === 'tối') {
            if (hour < 12) hour += 12;
        } else if (period === 'đêm') {
            if (hour === 12) hour = 0;
        } else if (period === 'sáng') {
            if (hour === 12) hour = 0;
        }

        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            // Tạo đối tượng Date theo giờ VN hiện tại
            const targetDate = new Date();
            // Lấy offset của VN (UTC+7)
            const currentVNHour = vnNow.hour;
            const currentVNMin = vnNow.minute;

            // Đặt giờ phút theo VN
            targetDate.setHours(hour, minute, 0, 0);

            // Nếu thời gian đã trôi qua trong hôm nay -> Đặt lịch cho ngày mai
            if (hour < currentVNHour || (hour === currentVNHour && minute <= currentVNMin)) {
                targetDate.setDate(targetDate.getDate() + 1);
            }

            const targetVN = getVNTimeInfo(targetDate);
            return {
                targetTimestamp: targetDate.getTime(),
                durationText: `lúc ${targetVN.timeStr} ngày ${targetVN.dateStr}`
            };
        }
    }

    return null;
}

let assistantTimer = null;

/**
 * 🌙 VÒNG LẶP TRỢ LÝ RIÊNG CỦA BOSS (QUÉT HẸN GIỜ & THEO DÕI ĐI NGỦ KHUYA)
 */
export function startOwnerAssistantLoop(client) {
    if (assistantTimer) clearInterval(assistantTimer);

    console.log('🤖 [Owner Assistant] 👑 Đã khởi chạy Dịch vụ Trợ lý Riêng dành cho Boss.');

    assistantTimer = setInterval(async () => {
        try {
            const now = Date.now();
            const vnInfo = getVNTimeInfo(new Date(now));
            const data = loadReminderData();

            // ==========================================
            // 📌 TASK 1: QUÉT VÀ GỬI NHẮC NHỞ ĐẾN HẠN
            // ==========================================
            if (Array.isArray(data.reminders) && data.reminders.length > 0) {
                const pendingList = data.reminders.filter(r => r.status === 'pending');
                for (const item of pendingList) {
                    if (now >= item.targetTimestamp) {
                        item.status = 'sent';
                        item.sentAt = now;
                        saveReminderData(data);

                        try {
                            const ownerUser = await client.users.fetch(item.userId).catch(() => null);
                            if (ownerUser) {
                                const msg = `⏰ **[HẸN GIỜ NHẮC NHỞ FOR BOSS]**\n👉 Boss ơi! Đã tới giờ rồi nè: **"${item.text}"** 🔔\n🕒 *Thời gian cài đặt:* \`${vnInfo.fullStr}\``;
                                await ownerUser.send(msg);
                                console.log(`[Owner Assistant] 📨 Đã gửi nhắc nhở tới Boss (${item.userId}): "${item.text}"`);
                            }
                        } catch (sendErr) {
                            console.error(`❌ [Owner Assistant] Lỗi gửi DM nhắc nhở cho Boss:`, sendErr.message);
                        }
                    }
                }
            }

            // ==========================================
            // 🌙 TASK 2: KIỂM TRA & NHẮC ĐI NGỦ KHUYA (01:00 AM - 04:30 AM)
            // ==========================================
            const isSleepNotifyOn = data.settings?.sleepNotifyEnabled !== false;
            const currentHour = vnInfo.hour;
            const todayStr = vnInfo.dateStr;

            // Chỉ chạy kiểm tra từ 1h sáng đến 4h sáng
            if (isSleepNotifyOn && currentHour >= 1 && currentHour <= 4) {
                if (data.settings.lastSleepNotifyDate !== todayStr) {
                    const ownerIds = getOwnerUserIds();
                    
                    for (const ownerId of ownerIds) {
                        try {
                            // Kiểm tra trạng thái Discord của Boss
                            let isOnlineOnDesktopOrPlaying = false;
                            let userStatus = 'offline';

                            // Tìm thông tin member từ các Server Discord mà Bot có mặt
                            for (const guild of client.guilds.cache.values()) {
                                const member = await guild.members.fetch(ownerId).catch(() => null);
                                if (member && member.presence) {
                                    const presence = member.presence;
                                    userStatus = presence.status; // online | dnd | idle | offline
                                    const clientStatus = presence.clientStatus || {};
                                    
                                    // 🛡️ CHỐNG LẦM LẪN: Chỉ nhắc nếu đang online trên Máy tính (Desktop/Web) hoặc đang trong Game
                                    const isDesktopActive = clientStatus.desktop === 'online' || clientStatus.desktop === 'dnd' || clientStatus.web === 'online';
                                    const isPlayingGame = Array.isArray(presence.activities) && presence.activities.some(a => a.type === 0 || a.type === 1);

                                    if ((userStatus === 'online' || userStatus === 'dnd') && (isDesktopActive || isPlayingGame)) {
                                        isOnlineOnDesktopOrPlaying = true;
                                        break;
                                    }
                                }
                            }

                            if (isOnlineOnDesktopOrPlaying) {
                                const ownerUser = await client.users.fetch(ownerId).catch(() => null);
                                if (ownerUser) {
                                    const sleepMsg = `🌙 **[NHẮC NHỞ ĐI NGỦ KHUYA DÀNH CHO BOSS]**\n` +
                                        `Boss ơi! Đã **${vnInfo.timeStr}** sáng rồi mà Yue thấy boss vẫn đang quẩy máy tính/chơi game nè 🎮.\n` +
                                        `Thức khuya ảnh hưởng sức khỏe lắm á, giữ sức khỏe rồi mai chiến tiếp nha boss! Tắt máy đi ngủ sớm đi nè~ 😴💤`;

                                    await ownerUser.send(sleepMsg);
                                    data.settings.lastSleepNotifyDate = todayStr;
                                    saveReminderData(data);

                                    console.log(`[Owner Assistant] 🌙 Đã gửi lời nhắc đi ngủ khuya cho Boss (${ownerId}) lúc ${vnInfo.fullStr}!`);
                                    break;
                                }
                            }
                        } catch (presErr) {
                            console.warn('[Owner Assistant] Lỗi kiểm tra status đi ngủ:', presErr.message);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('❌ Lỗi vòng lặp Owner Assistant:', err.message);
        }
    }, 30 * 1000); // Quét mỗi 30 giây
}

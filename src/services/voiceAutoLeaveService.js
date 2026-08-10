import { getVoiceConnection } from '@discordjs/voice';

// Quản lý bộ đếm thời gian tự động rời phòng theo từng Server (Guild)
const autoLeaveTimers = new Map();
const FIVE_MINUTES_MS = 5 * 60 * 1000; // 5 phút = 300,000 ms

/**
 * Bắt đầu hẹn giờ 5 phút để rời phòng nếu phòng không có người dùng thật
 */
export function scheduleAutoLeave(guildId, connection, channel, textChannel = null) {
    if (autoLeaveTimers.has(guildId)) return;

    console.log(`⏱️ [Voice Auto-Leave]: Phòng thoại "${channel?.name || guildId}" không có người. Đã bật hẹn giờ tự rời sau 5 phút.`);

    const timer = setTimeout(() => {
        autoLeaveTimers.delete(guildId);
        const currentConnection = getVoiceConnection(guildId);
        if (currentConnection) {
            currentConnection.destroy();
            console.log(`🚪 [Voice Auto-Leave]: Yue đã tự động rời phòng Voice "${channel?.name || guildId}" sau 5 phút không có người.`);
            if (textChannel) {
                textChannel.send("Phòng Voice không có ai nên Yue xin phép rút lui trước nha! 👋💨").catch(() => {});
            }
        }
    }, FIVE_MINUTES_MS);

    autoLeaveTimers.set(guildId, timer);
}

/**
 * Hủy hẹn giờ tự rời nếu có người tham gia lại phòng
 */
export function cancelAutoLeave(guildId) {
    if (autoLeaveTimers.has(guildId)) {
        clearTimeout(autoLeaveTimers.get(guildId));
        autoLeaveTimers.delete(guildId);
        console.log(`🟢 [Voice Auto-Leave]: Đã có người vào phòng thoại, hủy hẹn giờ tự rời phòng.`);
    }
}

/**
 * Kiểm tra trạng thái phòng Voice và bật/tắt hẹn giờ 5 phút
 */
export function checkVoiceChannelState(guild, botVoiceChannelId, textChannel = null) {
    if (!guild) return;
    const connection = getVoiceConnection(guild.id);
    if (!connection) {
        cancelAutoLeave(guild.id);
        return;
    }

    const channelId = botVoiceChannelId || connection.joinConfig.channelId;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const humanMembers = channel.members.filter(m => !m.user.bot);
    if (humanMembers.size === 0) {
        scheduleAutoLeave(guild.id, connection, channel, textChannel);
    } else {
        cancelAutoLeave(guild.id);
    }
}

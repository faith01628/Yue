import { EmbedBuilder } from 'discord.js';
import 'dotenv/config';

let discordClient = null;
const lastLogTimeMap = new Map();
const THROTTLE_MS = 60000;

export function setDiscordClientForLogger(client) {
    discordClient = client;
}

export async function sendAdminDebugLog(level = 'ERROR', title = '', message = '', details = {}) {
    const adminChannelId = process.env.ADMIN_DEBUG_CHANNEL_ID;
    const officialGuildId = process.env.OFFICIAL_GUILD_ID;

    if (!adminChannelId || !discordClient) {
        return;
    }

    const logKey = `${level}_${title}_${message}`;
    const now = Date.now();
    const lastTime = lastLogTimeMap.get(logKey) || 0;
    if (now - lastTime < THROTTLE_MS) {
        return;
    }
    lastLogTimeMap.set(logKey, now);

    try {
        const channel = await discordClient.channels.fetch(adminChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        if (officialGuildId && channel.guildId !== officialGuildId) {
            console.warn(`[DebugLogger] ⚠️ Kênh debug ${adminChannelId} không thuộc Official Guild ${officialGuildId}. Bỏ qua log.`);
            return;
        }

        let color = 0xFF0000;
        let icon = '🚨';
        if (level === 'WARN') {
            color = 0xFFA500;
            icon = '⚠️';
        } else if (level === 'INFO') {
            color = 0x3498DB;
            icon = 'ℹ️';
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${icon} [YUE DEBUG LOG • ${level}] ${title}`)
            .setDescription(`\`\`\`\n${(message || 'Không có chi tiết lỗi').substring(0, 1900)}\n\`\`\``)
            .setTimestamp();

        if (details.matchId) {
            embed.addFields({ name: '🎮 Match ID', value: String(details.matchId), inline: true });
        }
        if (details.sender) {
            embed.addFields({ name: '👤 User', value: String(details.sender), inline: true });
        }
        if (details.stack) {
            const shortStack = String(details.stack).substring(0, 1000);
            embed.addFields({ name: '📜 Stack Trace', value: `\`\`\`\n${shortStack}\n\`\`\``, inline: false });
        }

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('❌ Lỗi khi gửi log debug lên Discord:', err.message);
    }
}

function isNetworkError(err) {
    if (!err) return false;
    const code = err.code || err.errno;
    const msg = String(err.message || err);
    const networkCodes = ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'];
    if (networkCodes.includes(code)) return true;
    if (msg.includes('getaddrinfo') || msg.includes('EAI_AGAIN') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) return true;
    return false;
}

export function registerGlobalErrorHandlers() {
    process.on('uncaughtException', (err) => {
        if (isNetworkError(err)) {
            console.warn('⚠️ [Network Hiccup] Mất kết nối Mạng / DNS tạm thời:', err?.message || err);
            sendAdminDebugLog('WARN', 'Mất kết nối Mạng / DNS tạm thời', err?.message || String(err), { stack: err?.stack });
            return;
        }
        console.error('💥 Uncaught Exception:', err);
        sendAdminDebugLog('ERROR', 'Uncaught Exception (Lỗi hệ thống nghiêm trọng)', err?.message || String(err), { stack: err?.stack });
    });

    process.on('unhandledRejection', (reason) => {
        if (isNetworkError(reason)) {
            const msg = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : null;
            console.warn('⚠️ [Network Hiccup] Promise bị từ chối do mạng/DNS tạm thời:', msg);
            sendAdminDebugLog('WARN', 'Mất kết nối Mạng / DNS tạm thời', msg, { stack });
            return;
        }
        console.error('💥 Unhandled Rejection:', reason);
        const msg = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : null;
        sendAdminDebugLog('ERROR', 'Unhandled Promise Rejection', msg, { stack });
    });
}

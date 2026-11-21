import 'dotenv/config';

let discordClient = null;
const messageQueue = [];
let isProcessingQueue = false;

/**
 * Nạp Discord Client instance
 */
export function setDiscordClientForChatSync(client) {
    discordClient = client;
}

/**
 * 1. CHIỀU BANCHO IRC ➔ DISCORD:
 * Forward tin nhắn từ người chơi trong phòng Bancho IRC sang kênh Discord
 */
export async function forwardBanchoChatToDiscord(channelName, senderUsername, messageContent) {
    const syncChannelId = process.env.MULTI_CHAT_SYNC_CHANNEL_ID;
    const officialGuildId = process.env.OFFICIAL_GUILD_ID;

    if (!syncChannelId) {
        return;
    }
    if (!discordClient) {
        console.warn('⚠️ [ChatSync] discordClient chưa được thiết lập trong multiChatSyncService.');
        return;
    }
    if (!senderUsername || !messageContent) return;

    const content = messageContent.trim();
    if (!content) return;

    // 1. Lọc người gửi là bot (BanchoBot, tài khoản IRC của Bot)
    const botIrcUser = (process.env.BANCHO_IRC_USERNAME || '').toLowerCase().replace(/^\[|\]$/g, '');
    const senderLower = senderUsername.toLowerCase().replace(/^\[|\]$/g, '');

    if (
        senderLower === 'banchobot' ||
        (botIrcUser && senderLower === botIrcUser)
    ) {
        return;
    }

    // 2. Lọc tin nhắn hệ thống / bot output / relay từ Discord Admin
    if (
        /^yue[\s:]/i.test(content) ||
        content.toUpperCase().startsWith('YUE') ||
        content.includes('[Discord Admin') ||
        content.startsWith('[Discord')
    ) {
        return;
    }

    // 3. Lọc tất cả các lệnh in-game/bot (Chỉ đồng bộ chat text thuần từ người chơi)
    // Các lệnh bắt đầu bằng: !, ?, /, ., %, +, =, ~
    if (/^[!?:/.\%+~=]/.test(content)) {
        return;
    }

    try {
        const discordChannel = await discordClient.channels.fetch(syncChannelId).catch((err) => {
            console.error('❌ Lỗi fetch channel sync Discord:', err.message);
            return null;
        });
        if (!discordChannel || !discordChannel.isTextBased()) return;

        // BẢO VỆ CHỈ CHẠY TRÊN SERVER CHÍNH THỨC
        if (officialGuildId && discordChannel.guildId !== officialGuildId.trim()) return;

        const matchId = channelName.replace('#mp_', '');
        const matchUrl = `https://osu.ppy.sh/community/matches/${matchId}`;
        const profileUrl = `https://osu.ppy.sh/u/${encodeURIComponent(senderUsername)}`;

        // Định dạng tin nhắn: [Link Match ID] [Link Profile Player]: Content
        const formattedMsg = `💬 [**#${matchId}**](<${matchUrl}>) [**${senderUsername}**](<${profileUrl}>): ${content}`;
        await discordChannel.send(formattedMsg);
    } catch (err) {
        console.error('❌ Lỗi forward chat Bancho -> Discord:', err.message);
    }
}

/**
 * 2. CHIỀU DISCORD ➔ BANCHO IRC:
 * Nhận tin nhắn từ Discord và gửi vào Bancho IRC (CHỈ DÀNH CHO ADMIN)
 */
export async function handleDiscordToBanchoSync(message) {
    const syncChannelId = process.env.MULTI_CHAT_SYNC_CHANNEL_ID;
    const officialGuildId = process.env.OFFICIAL_GUILD_ID;
    const adminUserIds = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

    // Chỉ áp dụng trong kênh Sync Chat được cấu hình
    if (!syncChannelId || message.channel.id !== syncChannelId) return false;

    // Bỏ qua tin nhắn của bot
    if (message.author.bot) return true;

    // BẢO VỆ CHỈ CHẠY TRÊN SERVER CHÍNH THỨC
    if (officialGuildId && message.guild?.id !== officialGuildId) {
        return true;
    }

    // KHÔNG PHẢI ADMIN -> TỪ CHỐI VÀ THÔNG BÁO QUYỀN HẠN
    const isSenderAdmin = adminUserIds.includes(message.author.id);
    if (!isSenderAdmin) {
        try {
            await message.react('❌');
            const replyMsg = await message.reply('⛔ **Quyền hạn Admin:** Chỉ Admin mới có quyền gửi tin nhắn từ Discord vào phòng in-game Bancho IRC!');
            setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
        } catch (e) {}
        return true;
    }

    // NẾU LÀ ADMIN -> GỬI VÀO PHÒNG BANCHO IRC QUA QUEUE CHỐNG SPAM
    try {
        const { activeLobbies } = await import('./osu/banchoService.js');
        if (!activeLobbies || activeLobbies.size === 0) {
            await message.reply('⚠️ Hiện tại không có phòng 24/7 hoặc phòng Multi nào đang mở trên Bancho IRC.');
            return true;
        }

        const adminName = message.member?.displayName || message.author.username;
        const textToSend = `[Discord Admin ${adminName}]: ${message.content}`;

        for (const [matchId, lobbyData] of activeLobbies.entries()) {
            const channel = lobbyData.channel;
            if (channel && typeof channel.sendMessage === 'function') {
                enqueueIrcMessage(channel, textToSend);
            }
        }
        await message.react('✅');
    } catch (err) {
        console.error('❌ Lỗi gửi tin nhắn từ Discord Admin sang Bancho IRC:', err.message);
    }
    return true;
}

/**
 * Hàng đợi gửi tin nhắn IRC chống Spam Rate-Limit của Bancho
 */
function enqueueIrcMessage(channel, text) {
    messageQueue.push({ channel, text });
    processIrcQueue();
}

async function processIrcQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        try {
            if (item && item.channel) {
                await item.channel.sendMessage(item.text);
                await new Promise(r => setTimeout(r, 800)); // Delay 800ms giữa mỗi câu chat
            }
        } catch (e) {
            console.error('⚠️ Lỗi gửi tin nhắn IRC qua queue:', e.message);
        }
    }

    isProcessingQueue = false;
}

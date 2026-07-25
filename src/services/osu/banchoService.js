import banchojs from 'bancho.js';
import { askYue } from '../aiService.js';

// Import các handler lệnh in-game từ thư mục osuInGame
import { handleHostCommands } from '../../commands/osuInGame/hostCommands.js';
import { handleRefCommands } from '../../commands/osuInGame/refCommands.js';
import { handleMapCommands } from '../../commands/osuInGame/mapCommands.js';
import { handlePlayerCommands } from '../../commands/osuInGame/playerCommands.js';
import { handleInGameHelp } from '../../commands/osuInGame/helpCommand.js';

const { BanchoClient } = banchojs;

const bancho = new BanchoClient({
    username: process.env.BANCHO_IRC_USERNAME,
    password: process.env.BANCHO_IRC_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

let isConnected = false;

// 🎯 Map quản lý phòng Multiplayer trên Discord: Key = Match ID, Value = Lobby Object
export const activeLobbies = new Map();

// 🎯 Bộ đếm Cooldown cho kênh In-Game (#mp_...) tránh spam IRC
const channelCooldowns = new Map();
const COOLDOWN_TIME_MS = 5000; // 5 giây Cooldown mỗi phòng

export async function initBancho() {
    if (isConnected) return bancho;
    try {
        await bancho.connect();
        isConnected = true;
        console.log('✅ Đã kết nối thành công tới osu! Bancho IRC!');

        // ==========================================================
        // ⚡ LẮNG NGHE CHAT TRONG CÁC KÊNH MULTIPLAYER IN-GAME (#mp_...)
        // ==========================================================
        bancho.on('PM', handleInGameChat);
        bancho.on('CM', handleInGameChat);

    } catch (err) {
        console.error('❌ Lỗi kết nối Bancho IRC:', err);
    }
    return bancho;
}

/**
 * Xử lý duy nhất toàn bộ tin nhắn chat từ Bancho IRC trong phòng Multi #mp_...
 */
async function handleInGameChat(message) {
    const channel = message.channel;
    const channelName = channel?.name || '';
    const content = message.message.trim();
    const senderUsername = message.user?.ircUsername || message.user?.username || 'Player';

    // 1. Chỉ lắng nghe trong kênh Multiplayer (bắt đầu bằng #mp_)
    if (!channelName.startsWith('#mp_')) return;

    // 2. Bỏ qua tin nhắn do bot/Yue tự gửi ra
    if (content.startsWith('YUE:')) return;

    const args = content.split(/ +/);
    const command = args[0].toLowerCase();
    const commandArgs = args.slice(1);

    // 🎯 1. Lệnh Help (.yue help / .help / !help)
    if (content.toLowerCase() === '.yue help' || command === '.help' || command === '!help') {
        return await handleInGameHelp(channel);
    }

    // 🎯 2. Trò chuyện AI với Yue (.yue <câu hỏi> / !yue <câu hỏi>)
    if (command === '.yue' || command === '!yue') {
        // Kiểm tra Cooldown 5s riêng cho AI Chat để tránh ăn mute BanchoBot
        const now = Date.now();
        const lastUsed = channelCooldowns.get(channelName) || 0;
        if (now - lastUsed < COOLDOWN_TIME_MS) return;
        channelCooldowns.set(channelName, now);

        const userPrompt = commandArgs.join(' ').trim();
        if (!userPrompt) {
            return await channel.sendMessage(`YUE: Kêu tui gì đó ${senderUsername}? Gõ ".yue <câu_hỏi>" để chat hoặc ".yue help" để xem lệnh nhé!`);
        }

        try {
            let aiReply = await askYue(`ingame_${senderUsername}`, senderUsername, userPrompt, null);
            aiReply = aiReply.replace(/[\r\n]+/g, ' ').trim();
            if (aiReply.length > 180) aiReply = aiReply.substring(0, 177) + '...';

            return await channel.sendMessage(`YUE: ${aiReply}`);
        } catch (err) {
            console.error('❌ Lỗi AI In-Game:', err);
            return await channel.sendMessage(`YUE: Huhu đầu tui đang bị quá tải rồi ${senderUsername} ơi...`);
        }
    }

    // 🎯 3. Điều hướng các lệnh Quản Lý Multi In-Game
    if (['.host', '!host', '.autohost', '.ah', '!autohost'].includes(command)) {
        return await handleHostCommands(channel, message, commandArgs, command);
    }

    if (['.addref', '!addref', '.removeref', '.rmref', '!removeref'].includes(command)) {
        return await handleRefCommands(channel, message, commandArgs, command);
    }

    if (['.abort', '!abort', '.time', '!time', '.timer', '.rnd', '.random'].includes(command)) {
        return await handleMapCommands(channel, message, commandArgs, command);
    }

    if (['.kick', '!kick', '.stat', '!stat', '.rs', '!rs'].includes(command)) {
        return await handlePlayerCommands(channel, message, commandArgs, command);
    }
}

export function getBanchoClient() {
    return bancho;
}
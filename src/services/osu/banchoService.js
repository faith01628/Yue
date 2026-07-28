import banchojs from 'bancho.js';
import { askYue } from '../aiService.js';

// Import các handler lệnh in-game từ thư mục osuInGame
import { handlePlayerCommands } from '../../commands/osuInGame/playerCommands.js';
import { handleInGameHelp } from '../../commands/osuInGame/helpCommand.js';
import { handleHostCommands } from '../../commands/osuInGame/hostCommands.js';

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

/**
 * Hàm hỗ trợ ép Bancho Client join lại một phòng Multiplayer cụ thể & gán sự kiện Auto Start
 */
export async function forceJoinLobby(matchId) {
    try {
        // Đảm bảo Bancho đã kết nối trước khi join
        await initBancho();

        const channelName = `#mp_${matchId}`;
        const channel = bancho.getChannel(channelName);
        
        await channel.join();

        // Lắng nghe sự kiện allPlayersReady trực tiếp từ object Lobby của bancho.js
        const lobby = channel.lobby;
        if (lobby) {
            lobby.on("allPlayersReady", async () => {
                console.log(`[AutoStart] Tất cả người chơi trong ${channelName} đã Ready!`);
                await channel.sendMessage("YUE: Mọi người đã Ready hết rồi nè! Đếm ngược 10s bắt đầu nha...");
                await channel.sendMessage("!mp start 10");
            });
        }

        console.log(`✅ Đã ép Yue rejoin thành công vào ${channelName}`);
        return true;
    } catch (err) {
        console.error(`❌ Lỗi khi force join ${matchId}:`, err);
        return false;
    }
}

/**
 * Khởi tạo kết nối tới Bancho IRC (DUY NHẤT 1 HÀM)
 */
export async function initBancho() {
    if (isConnected) return bancho;
    try {
        await bancho.connect();
        isConnected = true;
        console.log('✅ Đã kết nối thành công tới osu! Bancho IRC!');

        // Lắng nghe chat phòng Multi
        bancho.on('PM', handleInGameChat);
        bancho.on('CM', handleInGameChat);

        // 🔄 Tự động rejoin lại các phòng trong RAM (nếu có) khi restart bot
        for (const [matchId] of activeLobbies.entries()) {
            await forceJoinLobby(matchId);
        }

    } catch (err) {
        console.error('❌ Lỗi kết nối Bancho IRC:', err);
    }
    return bancho;
}

/**
 * Xử lý tin nhắn chat từ Bancho IRC trong phòng Multi #mp_...
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

    // 🎯 3. BẮT SỰ KIỆN AUTO START TỪ TIN NHẮN CHAT BANCHOBOT (DỰ PHÒNG CHẮC CHẮN 100%)
    if (senderUsername.toLowerCase() === 'banchobot') {
        if (content.toLowerCase().includes('all players are ready')) {
            await channel.sendMessage('YUE: Mọi người đã Ready hết rồi nè! Đếm ngược 10s bắt đầu nha...');
            return await channel.sendMessage('!mp start 10');
        }
    }

    const args = content.split(/ +/);
    const command = args[0].toLowerCase();
    const commandArgs = args.slice(1);

    // 🎯 Lệnh Help (.yue help / .help / !help)
    if (content.toLowerCase() === '.yue help' || command === '.help' || command === '!help') {
        return await handleInGameHelp(channel);
    }

    // 🎯 Trò chuyện AI với Yue (.yue <câu hỏi> / !yue <câu hỏi>)
    if (command === '.yue' || command === '!yue') {
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

    // 🎯 Lệnh tra cứu score gần nhất (.rs / !rs)
    if (['.rs', '!rs'].includes(command)) {
        return await handlePlayerCommands(channel, message, commandArgs, command);
    }

    // 🎯 Lệnh Autohost (.ah / .autohost / .next / .skip)
    if (['.ah', '!ah', '.autohost', '!autohost', '.next', '!next', '.skip', '!skip'].includes(command)) {
        return await handleHostCommands(channel, message, commandArgs, command);
    }
}

export function getBanchoClient() {
    return bancho;
}
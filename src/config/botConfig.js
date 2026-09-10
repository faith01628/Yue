import 'dotenv/config';

/**
 * 🎛️ BẢNG ĐIỀU KHIỂN NGUYÊN BẢN CỦA YUE BOT (MASTER BOT CONTROL PANEL)
 * 
 * File này giúp quản lý và bật (true) / tắt (false) TOÀN BỘ các lệnh, tính năng,
 * dịch vụ và thư viện nặng của Yue Bot.
 * 
 * 💡 DÙNG CHUNG 1 SOURCE CODE CHO 2 BẢN:
 * - Bản Full (chạy Local PC): Bật đầy đủ Voice, Canvas, AI Vision, Multiplayer 24/7.
 * - Bản Lite (chạy Server VPS): Tắt Voice, Canvas, ffmpeg... giúp tiết kiệm tài nguyên.
 * - Bản Custom (chạy Local PC kết hợp VPS): TẮT các tính năng VPS đã gánh (Chat AI, Multi 24/7), BẬT các tính năng nặng (Voice, Canvas Card).
 */

const PRESET_MODE = process.env.BOT_MODE || 'custom';

const defaultFullConfig = {
    mode: PRESET_MODE,

    // ==========================================================
    // 📦 1. QUẢN LÝ THƯ VIỆN NẶNG (HEAVY LIBRARIES TOGGLES)
    // Tránh import & crash trên VPS khi thiếu thư viện native C++
    // ==========================================================
    heavyLibraries: {
        voice: true,       // @discordjs/voice (Trò chuyện Voice)
        ffmpeg: true,      // ffmpeg-static (Xử lý âm thanh)
        canvas: true,      // @napi-rs/canvas (Vẽ thẻ ảnh Stat/Profile Card)
        edgeTts: true,     // @andresaya/edge-tts (Đọc giọng AI TTS)
    },

    // ==========================================================
    // 🤖 2. DISCORD BOT CORE & AI CHAT
    // ==========================================================
    discord: {
        enabled: true,                       // Khởi chạy Discord Client (Bot Discord)
        aiChat: true,                        // Trả lời chat AI khi tag hoặc trong kênh con-vợ-ai
        aiVision: true,                      // Phân tích hình ảnh/GIF qua AI Vision
        naturalLanguageMapRec: true,         // Tự động hiểu câu xin nhạc/map tự nhiên qua AI
        antiSpam: true,                      // Bộ lọc chống spam chat Discord
        systemCommands: true,                // Lệnh hệ thống (.infoyue, .setupyue)
        blacklistManagement: true,           // Quản lý danh sách đen (.blacklist, .unblacklist, .listblacklist, .resetscore)
    },

    // ==========================================================
    // 🎙️ 3. TÍNH NĂNG VOICE DISCORD (.join, .listen, .leave)
    // ==========================================================
    voice: {
        enabled: true,                       // Bật/Tắt toàn bộ hệ thống Voice Discord
        speechToText: true,                  // Nhận diện giọng nói STT
        textToSpeech: true,                  // Phát giọng đọc TTS
        autoLeave: true,                     // Tự động rời phòng thoại sau 5 phút không có người
    },

    // ==========================================================
    // 🎮 4. CÁC LỆNH DISCORD OSU! STATS & BEATMAP
    // ==========================================================
    osuDiscordCommands: {
        enabled: true,                       // Bật/Tắt toàn bộ nhóm lệnh Osu trên Discord
        profile: true,                       // .profile, .p, .osu, .user (Xem profile Osu)
        statCard: true,                      // .stat, .stats, .st (Vẽ thẻ ảnh Canvas Stat Card)
        recent: true,                        // .recent, .r, .rs, .rc, .rm, .rt (Xem điểm gần nhất)
        top: true,                           // .top, .t, .top10... (Xem top điểm cao nhất)
        compare: true,                       // .compare, .c (So sánh điểm trên beatmap)
        beatmap: true,                       // .map, .m (Tra cứu thông tin beatmap)
        leaderboard: true,                   // .lb, .leaderboard (Xem bảng xếp hạng beatmap)
        nochoke: true,                       // .nc, .nochoke (Tính điểm nếu không bị choke)
        whatif: true,                        // .wi, .whatif (Dự đoán rank khi tăng PP)
        calcPp: true,                        // .pp, .calc (Máy tính PP chuẩn xác)
        pickMapDirect: true,                 // .pm, .pickmap, .rec (Gợi ý map trực tiếp - 0 tốn token AI)
        linkSlash: true,                     // Lệnh slash /link liên kết tài khoản Osu
    },

    // ==========================================================
    // 🌐 5. OSU! MULTIPLAYER & BANCHO IRC BOT
    // ==========================================================
    osuMultiplayer: {
        enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true, // Khởi chạy Bancho IRC Client
        normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : true, // Cho phép tạo/quản lý phòng thường (.mr, .close, .inv, .jr)
        community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true, // Cho phép tạo/vận hành phòng 24/7 (.mr247, .rooms247)
        defaultRoomName: process.env.OSU_MULTI_DEFAULT_ROOM_NAME || "Yue's Community Autohost Room",
        default247RoomName: process.env.OSU_MULTI_247_DEFAULT_ROOM_NAME || "Yue's 24/7 Community Room",
        keepAliveHeartbeat: true,            // Tự động đóng & tái tạo phòng 24/7 mới sau 20 phút vắng người + cập nhật Embed Discord
        safetyGuard: true,                   // Bộ lọc Anti-Spam & Profanity 5-Strike nhiều ngôn ngữ
        multilingualChat: true,              // Chat tiếng Anh mặc định + tự dịch đa ngôn ngữ
        aiMatchCommentary: true,             // Tự động bình luận trận đấu & MVP/Choke
        welcomeShoutouts: false,             // Lời chào cá nhân hóa (🔴 Đã TẮT theo yêu cầu)
        dailyLeaderboard: true,              // Bảng xếp hạng Peak PP Ngày (Reset 0:00 midnight)
        afkHostTimer: true,                  // Trợ lý nhắc nhở Host AFK sau 45s
        inGameCommands: {
            hostCommands: true,              // Lệnh IRC cho Host (!start, !mp, !autohost, !next...)
            mapCommands: true,               // Lệnh chọn/search map (!r, !map, !fm...)
            playerCommands: true,            // Lệnh người chơi (!roll, !stat, !help...)
            matchEvaluator: true,            // Đánh giá phong độ trận đấu (.match, .danhgia, .yue bạn thấy trận vừa rồi thế nào)
            refCommands: true                // Lệnh trọng tài 24/7 (!kick, !ban, !lock...)
        }

    }
};

// Áp dụng Preset theo Chế độ BOT_MODE
function getActiveConfig() {
    // 🔹 CHẾ ĐỘ LITE (DÀNH CHO SERVER VPS):
    // Tắt các thư viện nặng (Voice, Canvas, FFMPEG), giữ lại Chat AI & Osu Multi Thường (24/7 tắt để test local trước)
    if (PRESET_MODE === 'lite') {
        return {
            ...defaultFullConfig,
            heavyLibraries: {
                voice: false,
                ffmpeg: false,
                canvas: false,
                edgeTts: false,
            },
            voice: {
                enabled: false,
                speechToText: false,
                textToSpeech: false,
                autoLeave: false,
            },
            osuDiscordCommands: {
                ...defaultFullConfig.osuDiscordCommands,
                statCard: false, // Tắt vẽ ảnh Canvas trên VPS
            },
            osuMultiplayer: {
                ...defaultFullConfig.osuMultiplayer,
                enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true,
                normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : true, // 🟢 BẬT Phòng Thường trên VPS
                community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true, // 🟢 BẬT Phòng 24/7 trên VPS
                keepAliveHeartbeat: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
            }
        };
    }

    // 🔹 CHẾ ĐỘ CUSTOM (DÀNH CHO MÁY LOCAL PC CHẠY SONG SONG VỚI VPS):
    // TẮT những tính năng VPS (Lite) đang gánh (Chat AI, Multi phòng thường) để tránh đụng độ
    // BẬT tính năng nặng (Voice, Canvas Card) và BẬT Multi phòng 24/7 để thử nghiệm
    if (PRESET_MODE === 'custom') {
        return {
            ...defaultFullConfig,
            discord: {
                ...defaultFullConfig.discord,
                aiChat: false, // 🔴 TẮT Chat AI ở Local vì Server VPS đang trả lời rồi (Tránh trả lời 2 lần)
            },
            osuDiscordCommands: {
                ...defaultFullConfig.osuDiscordCommands,
                profile: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                recent: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                top: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                compare: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                beatmap: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                leaderboard: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                nochoke: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                whatif: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                calcPp: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                pickMapDirect: process.env.OSU_COMMANDS_DISCORD !== undefined ? process.env.OSU_COMMANDS_DISCORD === 'true' : true,
                statCard: true,
            },
            osuMultiplayer: {
                ...defaultFullConfig.osuMultiplayer,
                enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true, // 🟢 BẬT Bancho IRC ở Local để chạy & test phòng 24/7
                normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : false, // 🔴 TẮT Phòng Thường ở Local (Server VPS đã gánh)
                community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true, // 🟢 BẬT Phòng 24/7 ở Local (Để thử nghiệm tính năng 24/7)
                keepAliveHeartbeat: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true, // 🟢 BẬT Heartbeat giữ phòng 24/7 ở Local
            },
            heavyLibraries: {
                voice: true,    // 🟢 BẬT Voice
                ffmpeg: true,   // 🟢 BẬT FFMPEG
                canvas: true,   // 🟢 BẬT Canvas (Vẽ ảnh Stat Card / Profile Card)
                edgeTts: true,  // 🟢 BẬT TTS
            },
            voice: {
                enabled: true,
                speechToText: true,
                textToSpeech: true,
                autoLeave: true,
            }
        };
    }

    return defaultFullConfig;
}

export const botConfig = getActiveConfig();

/**
 * Hàm kiểm tra một tính năng cụ thể có đang bật không
 */
export function isFeatureOn(category, featureKey) {
    if (!botConfig[category]) return true;
    if (featureKey) {
        return Boolean(botConfig[category][featureKey]);
    }
    return Boolean(botConfig[category].enabled ?? true);
}

/**
 * Kiểm tra xem một thư viện nặng có được phép nạp không
 */
export function isHeavyLibraryOn(libName) {
    return Boolean(botConfig.heavyLibraries?.[libName] ?? false);
}

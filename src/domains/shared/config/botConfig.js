import 'dotenv/config';

/**
 * 🎛️ BẢNG ĐIỀU KHIỂN NGUYÊN BẢN CỦA YUE BOT (MASTER BOT CONTROL PANEL)
 */

const PRESET_MODE = process.env.BOT_MODE || 'custom';

const defaultFullConfig = {
    mode: PRESET_MODE,
    heavyLibraries: {
        voice: true,       // @discordjs/voice (Trò chuyện Voice)
        ffmpeg: true,      // ffmpeg-static (Xử lý âm thanh)
        canvas: true,      // @napi-rs/canvas (Vẽ thẻ ảnh Stat/Profile Card)
        edgeTts: true,     // @andresaya/edge-tts (Đọc giọng AI TTS)
    },
    discord: {
        enabled: true,                       // Khởi chạy Discord Client (Bot Discord)
        aiChat: true,                        // Trả lời chat AI khi tag hoặc trong kênh con-vợ-ai
        aiVision: true,                      // Phân tích hình ảnh/GIF qua AI Vision
        naturalLanguageMapRec: true,         // Tự động hiểu câu xin nhạc/map tự nhiên qua AI
        antiSpam: true,                      // Bộ lọc chống spam chat Discord
        systemCommands: true,                // Lệnh hệ thống (.infoyue, .setupyue)
        blacklistManagement: true,           // Quản lý danh sách đen (.blacklist, .unblacklist, .listblacklist, .resetscore)
    },
    voice: {
        enabled: true,                       // Bật/Tắt toàn bộ hệ thống Voice Discord
        speechToText: true,                  // Nhận diện giọng nói STT
        textToSpeech: true,                  // Phát giọng đọc TTS
        autoLeave: true,                     // Tự động rời phòng thoại sau 5 phút không có người
    },
    osuDiscordCommands: {
        enabled: true,                       // Bật/Tắt toàn bộ nhóm lệnh Osu trên Discord
        profile: true,                       // .profile, .p, .osu, .user
        statCard: true,                      // .stat, .stats, .st
        recent: true,                        // .recent, .r, .rs, .rc, .rm, .rt
        top: true,                           // .top, .t, .top10...
        compare: true,                       // .compare, .c
        beatmap: true,                       // .map, .m
        leaderboard: true,                   // .lb, .leaderboard
        nochoke: true,                       // .nc, .nochoke
        whatif: true,                        // .wi, .whatif
        calcPp: true,                        // .pp, .calc
        pickMapDirect: true,                 // .pm, .pickmap, .rec
        linkSlash: true,                     // Lệnh slash /link
    },
    osuMultiplayer: {
        enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true,
        normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : true,
        community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
        defaultRoomName: process.env.OSU_MULTI_DEFAULT_ROOM_NAME || "Yue's Community Autohost Room",
        default247RoomName: process.env.OSU_MULTI_247_DEFAULT_ROOM_NAME || "Yue's 24/7 Community Room",
        keepAliveHeartbeat: true,
        safetyGuard: true,
        multilingualChat: true,
        aiMatchCommentary: true,
        welcomeShoutouts: false,
        dailyLeaderboard: true,
        afkHostTimer: true,
        inGameCommands: {
            hostCommands: true,
            mapCommands: true,
            playerCommands: true,
            matchEvaluator: true,
            refCommands: true
        }
    }
};

function getActiveConfig() {
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
                statCard: false,
            },
            osuMultiplayer: {
                ...defaultFullConfig.osuMultiplayer,
                enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true,
                normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : true,
                community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
                keepAliveHeartbeat: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
            }
        };
    }

    if (PRESET_MODE === 'custom') {
        return {
            ...defaultFullConfig,
            discord: {
                ...defaultFullConfig.discord,
                aiChat: false,
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
                enabled: process.env.OSU_MULTI_ENABLED !== undefined ? process.env.OSU_MULTI_ENABLED === 'true' : true,
                normalRooms: process.env.OSU_MULTI_NORMAL_ROOMS !== undefined ? process.env.OSU_MULTI_NORMAL_ROOMS === 'true' : false,
                community247Rooms: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
                keepAliveHeartbeat: process.env.OSU_MULTI_247_ROOMS !== undefined ? process.env.OSU_MULTI_247_ROOMS === 'true' : true,
            },
            heavyLibraries: {
                voice: true,
                ffmpeg: true,
                canvas: true,
                edgeTts: true,
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

export function isFeatureOn(category, featureKey) {
    if (!botConfig[category]) return true;
    if (featureKey) {
        return Boolean(botConfig[category][featureKey]);
    }
    return Boolean(botConfig[category].enabled ?? true);
}

export function isHeavyLibraryOn(libName) {
    return Boolean(botConfig.heavyLibraries?.[libName] ?? false);
}

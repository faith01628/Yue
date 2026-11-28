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
    },
    osuPmAssistant: {
        enabled: process.env.OSU_PM_ASSISTANT_ENABLED !== undefined ? process.env.OSU_PM_ASSISTANT_ENABLED === 'true' : true,
        autoGreet: process.env.OSU_PM_AUTO_GREET !== undefined ? process.env.OSU_PM_AUTO_GREET === 'true' : true,
        autoAiReply: process.env.OSU_PM_AUTO_AI_REPLY !== undefined ? process.env.OSU_PM_AUTO_AI_REPLY === 'true' : false,
        greetCooldownMs: 6 * 60 * 60 * 1000, // 6 tiếng mới tự chào lại 1 lần/người
        ownerMuteMs: 15 * 60 * 1000,         // Chủ nick tự nhắn tay -> bot tự im lặng auto-reply với người đó 15 phút
        commandCooldownMs: 3000,             // Cooldown 3 giây/người để tránh rate limit Bancho IRC
        contentFilter: true,                 // Bật lọc từ thô tục / công kích cá nhân
        antiSpam: true,                      // Bật chống spam bảo vệ nick cá nhân
        spamWindowMs: 15000,                 // Cửa sổ chống spam 15 giây
        maxMessagesPerWindow: 4,             // Tối đa 4 tin/lệnh trong 15 giây mỗi người
        spamMuteMs: 5 * 60 * 1000,           // Spam quá ngưỡng -> tự im lặng 5 phút
        maxAbuseStrikes: 3,                  // Vi phạm ngôn từ 3 lần trong 10 phút -> tạm chặn 30 phút
        abuseBlockMs: 30 * 60 * 1000,        // Thời gian tạm chặn khi cố tình xúc phạm
        globalMaxOutbound: 6,                // Trần gửi toàn cục: tối đa 6 tin / 10 giây
        globalWindowMs: 10000
    },
    selfEvolution: {
        enabled: process.env.SELF_EVOLUTION_ENABLED !== undefined ? process.env.SELF_EVOLUTION_ENABLED === 'true' : true,
        autoPropose: process.env.SELF_EVOLUTION_AUTO_PROPOSE !== undefined ? process.env.SELF_EVOLUTION_AUTO_PROPOSE === 'true' : true,
        channelId: process.env.ADMIN_EVOLUTION_CHANNEL_ID || process.env.ADMIN_DEBUG_CHANNEL_ID || '',
        githubRepo: process.env.GITHUB_REPO || 'faith01628/Yue',
        githubBranch: process.env.GITHUB_BRANCH || 'dev',
        minSignalCount: 3,                   // Tín hiệu phải lặp >= 3 lần mới tự động đề xuất
        maxProposalsPerDay: 2,               // Tối đa 2 đề xuất tự động / ngày
        minIntervalMs: 6 * 60 * 60 * 1000,   // Cách nhau ít nhất 6 tiếng giữa 2 đề xuất tự động
        checkIntervalMs: 30 * 60 * 1000      // Kiểm tra định kỳ mỗi 30 phút
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
            heavyLibraries: {
                voice: false,       // 🔴 Tắt Voice (@discordjs/voice) trên Server VPS
                ffmpeg: false,      // 🔴 Tắt FFMPEG (ffmpeg-static) trên Server VPS
                canvas: false,      // 🔴 Tắt Canvas (@napi-rs/canvas) trên Server VPS
                edgeTts: false,     // 🔴 Tắt Edge-TTS trên Server VPS
            },
            voice: {
                enabled: false,     // 🔴 Tắt toàn bộ tính năng phòng Voice Discord
                speechToText: false,
                textToSpeech: false,
                autoLeave: false,
            },
            discord: {
                ...defaultFullConfig.discord,
                aiChat: true,       // 🟢 Bật Chat AI Text Discord
                aiVision: false,    // 🔴 Tắt xử lý ảnh nặng
            },
            osuDiscordCommands: {
                ...defaultFullConfig.osuDiscordCommands,
                enabled: true,      // 🟢 Bật Lệnh Osu Discord (.profile, .rs, .top, .stat...)
                profile: true,
                recent: true,
                top: true,
                compare: true,
                beatmap: true,
                leaderboard: true,
                nochoke: true,
                whatif: true,
                calcPp: true,
                pickMapDirect: true,
                statCard: false,    // 🔴 Tắt vẽ thẻ ảnh Canvas để nhẹ RAM
            },
            osuMultiplayer: {
                ...defaultFullConfig.osuMultiplayer,
                enabled: true,      // 🟢 Bật Osu Bancho IRC & Phòng Multi 24/7
                normalRooms: false,
                community247Rooms: true,
                keepAliveHeartbeat: true,
                dailyLeaderboard: true,
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

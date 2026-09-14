import { Events } from 'discord.js';
import { botConfig, isHeavyLibraryOn } from '../../shared/config/botConfig.js';
import { isFeatureEnabled } from '../../shared/config/featureToggles.js';
import { setDiscordClientForLogger, registerGlobalErrorHandlers } from '../../shared/logger/adminDebugLogger.js';

export function registerReadyHandler(client) {
    client.once(Events.ClientReady, async () => {
        setDiscordClientForLogger(client);
        registerGlobalErrorHandlers();

        try {
            const { setDiscordClientForChatSync } = await import('../../../services/multiChatSyncService.js');
            setDiscordClientForChatSync(client);
        } catch (e) {}

        try {
            const { setDiscordClientForLeaderboard, startDailyLeaderboardResetLoop } = await import('../../../services/osu/dailyLeaderboardService.js');
            setDiscordClientForLeaderboard(client);
            startDailyLeaderboardResetLoop(client);
        } catch (e) {}

        console.log(`\n==========================================================`);
        console.log(`🤖 Yue AI Master Control Panel • Chế độ: [${botConfig.mode.toUpperCase()}]`);
        console.log(`==========================================================`);
        console.log(`📦 Thư viện nặng:`);
        console.log(`   • Voice (@discordjs/voice): ${isHeavyLibraryOn('voice') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • Canvas (@napi-rs/canvas): ${isHeavyLibraryOn('canvas') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • FFMPEG (ffmpeg-static):   ${isHeavyLibraryOn('ffmpeg') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • Edge-TTS (TTS Service):   ${isHeavyLibraryOn('edgeTts') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`🤖 Discord System:`);
        console.log(`   • Bot Discord Core:         ${botConfig.discord?.enabled ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • Chat AI Text Discord:     ${isFeatureEnabled('chatDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • Voice Discord Chat:       ${isFeatureEnabled('voiceDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`🎮 Osu System:`);
        console.log(`   • Lệnh Osu Discord:         ${isFeatureEnabled('osuCommandsDiscord') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`   • Bancho IRC & Room 24/7:   ${isFeatureEnabled('multiOsu') ? '🟢 BẬT' : '🔴 TẮT'}`);
        console.log(`==========================================================\n`);

        if (isFeatureEnabled('multiOsu')) {
            try {
                const { setDiscordClient } = await import('../../../services/multi247/room247Manager.js');
                setDiscordClient(client);
                const { initBancho } = await import('../../../services/osu/banchoService.js');
                await initBancho();
            } catch (bErr) {
                console.error('❌ Lỗi tự động khởi tạo Bancho IRC:', bErr.message);
            }
        }
    });
}

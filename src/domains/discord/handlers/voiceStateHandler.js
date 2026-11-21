import { isFeatureEnabled } from '../../shared/config/featureToggles.js';

export function registerVoiceStateHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (!isFeatureEnabled('voiceDiscord')) return;
        try {
            const { getVoiceConnection } = await import('@discordjs/voice');
            const { checkVoiceChannelState } = await import('../../../services/voiceAutoLeaveService.js');

            const guild = oldState.guild || newState.guild;
            if (!guild) return;

            const connection = getVoiceConnection(guild.id);
            if (!connection) return;

            const botChannelId = connection.joinConfig.channelId;
            if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
                checkVoiceChannelState(guild, botChannelId);
            }
        } catch (vErr) {
            // Voice module not available, ignore silently
        }
    });
}

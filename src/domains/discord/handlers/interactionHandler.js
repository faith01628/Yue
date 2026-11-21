import { isFeatureOn } from '../../shared/config/botConfig.js';
import { handleOsuLinkSlashCommand } from '../../../commands/osu/linkCommand.js';

export function registerInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
            if (interaction.commandName === 'link') {
                if (!isFeatureOn('osuDiscordCommands', 'linkSlash')) {
                    return await interaction.reply({ content: '🔴 Lệnh slash /link tạm thời đang TẮT trong cấu hình code!', ephemeral: true });
                }
                await handleOsuLinkSlashCommand(interaction);
            }
        } catch (error) {
            console.error('❌ Lỗi xử lý Interaction:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Có lỗi xảy ra khi xử lý lệnh này rồi ông ơi!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Có lỗi xảy ra khi xử lý lệnh này rồi ông ơi!', ephemeral: true });
            }
        }
    });
}

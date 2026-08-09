import { memoryProvider } from './MemoryProvider.js';
import { selectRelevantMemories } from './memoryManagerService.js';

export async function buildContext(message, rawText) {
    const discordId = message.author.id;
    const guildId = message.guild?.id || 'DM';
    
    const currentDisplayName = message.member?.displayName || message.author.username;
    
    if (guildId !== 'DM') {
        memoryProvider.updateGuildContext(discordId, guildId, currentDisplayName);
    }

    const userData = memoryProvider.getUser(discordId);
    
    // 🎯 Lấy ký ức hợp lệ, tự động gia hạn khi được truy xuất và gắn nhãn tầng ký ức (VĨNH VIỄN, TRUNG HẠN, NGẮN HẠN)
    const formattedMemories = selectRelevantMemories(discordId, discordId, guildId);

    return {
        environment: guildId === 'DM' ? 'DirectMessage' : 'DiscordGuild',
        user: {
            discordId: discordId,
            currentDisplayName: currentDisplayName,
            identity: userData.identity,
            profile: userData.profile,
            guildProfile: userData.guilds[guildId] || null,
            importantMemories: formattedMemories
        },
        input: {
            rawText: rawText,
            hasImage: Boolean(message.attachments && (message.attachments.size > 0 || message.attachments.length > 0)),
            imageUrl: message.attachments?.first ? message.attachments.first()?.url : (message.attachments?.values ? message.attachments.values().next()?.value?.url : null)
        }
    };
}
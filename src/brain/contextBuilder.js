import { memoryProvider } from './MemoryProvider.js';
import { selectRelevantMemories } from './memoryManagerService.js';
import { getTopicSummary } from './conversationContextService.js';
import { extractMediaFromMessage } from '../services/aiService.js';

export async function buildContext(message, rawText) {
    const discordId = message.author.id;
    const channelId = message.channel?.id || 'DM';
    const guildId = message.guild?.id || 'DM';
    
    const currentDisplayName = message.member?.displayName || message.author.username;
    
    if (guildId !== 'DM') {
        memoryProvider.updateGuildContext(discordId, guildId, currentDisplayName);
    }

    const userData = memoryProvider.getUser(discordId);
    
    // 🎯 Lấy ký ức hợp lệ, tự động gia hạn khi được truy xuất và gắn nhãn tầng ký ức (VĨNH VIỄN, TRUNG HẠN, NGẮN HẠN)
    const formattedMemories = selectRelevantMemories(discordId, discordId, guildId);
    const topicSummary = getTopicSummary(channelId);
    const affectionData = memoryProvider.getAffection(discordId);
    const mediaData = await extractMediaFromMessage(message);

    return {
        environment: guildId === 'DM' ? 'DirectMessage' : 'DiscordGuild',
        user: {
            discordId: discordId,
            currentDisplayName: currentDisplayName,
            identity: userData.identity,
            profile: userData.profile,
            affection: affectionData,
            guildProfile: userData.guilds[guildId] || null,
            importantMemories: formattedMemories
        },
        topicSummary: topicSummary,
        input: {
            rawText: rawText,
            hasImage: Boolean(mediaData),
            imageUrl: mediaData?.url || null
        }
    };
}
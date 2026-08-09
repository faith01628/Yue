import { memoryProvider } from './MemoryProvider.js';

export async function buildContext(message, rawText) {
    const discordId = message.author.id;
    const guildId = message.guild?.id || 'DM';
    
    const currentDisplayName = message.member?.displayName || message.author.username;
    
    if (guildId !== 'DM') {
        memoryProvider.updateGuildContext(discordId, guildId, currentDisplayName);
    }

    const userData = memoryProvider.getUser(discordId);
    // 🎯 Sửa: Dùng getRelevantKnowledge và lấy m.fact.value
    const relevantMemories = memoryProvider.getRelevantKnowledge(discordId, guildId, discordId);

    return {
        environment: guildId === 'DM' ? 'DirectMessage' : 'DiscordGuild',
        user: {
            discordId: discordId,
            currentDisplayName: currentDisplayName,
            identity: userData.identity,
            profile: userData.profile,
            guildProfile: userData.guilds[guildId] || null,
            importantMemories: relevantMemories.map(m => `[${m.category.toUpperCase()}] ${m.fact.value}`)
        },
        input: {
            rawText: rawText,
            hasImage: message.attachments?.size > 0,
            imageUrl: message.attachments?.first()?.url || null
        }
    };
}
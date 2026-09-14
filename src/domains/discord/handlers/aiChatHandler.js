import { isFeatureOn } from '../../shared/config/botConfig.js';
import { isFeatureEnabled } from '../../shared/config/featureToggles.js';
import { askYue, askYueWithVision, extractMediaFromMessage } from '../../../services/aiService.js';
import { saveMessageToLocalHistory, saveYueReplyToLocalHistory, getConsecutiveGifCount } from '../../../services/chatHistoryManager.js';
import { checkAntiSpam } from '../../../services/antiSpamService.js';
import { buildContext } from '../../../brain/contextBuilder.js';
import { memoryProvider } from '../../../brain/MemoryProvider.js';
import { handleNaturalLanguageMapRequest } from '../../osu/stats/recommendMapCommand.js';

export async function handleAiChatMessage(client, message) {
    const isMentioned = message.mentions.has(client.user);
    const configuredChannel = (process.env.SPECIAL_CHANNEL_NAME || 'con-vợ-ai').trim();
    const isSpecialChannel = message.channel.name === configuredChannel || message.channel.name.startsWith(configuredChannel);

    if (!isFeatureEnabled('chatDiscord')) {
        if (isMentioned || isSpecialChannel) {
            return await message.reply("🔴 Tính năng **Chat AI Discord** tạm thời đang TẮT!");
        }
        return;
    }

    if (!isMentioned && !isSpecialChannel) {
        return;
    }

    if (memoryProvider.isBlacklisted(message.author.id)) {
        console.log(`⛔ [Yue AI] Bỏ qua tin nhắn từ User bị Blacklist: ${message.author.username} (${message.author.id})`);
        return;
    }

    let userPrompt = message.content
        .replace(`<@!${client.user.id}>`, '')
        .replace(`<@${client.user.id}>`, '')
        .trim();

    const mediaData = await extractMediaFromMessage(message);
    const isImage = Boolean(mediaData);

    saveMessageToLocalHistory(message.channel.id, {
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        content: userPrompt || message.content,
        isBot: false,
        hasAttachment: isImage,
        timestamp: message.createdTimestamp
    });

    let repliedContextText = "";
    let isReplyToOtherUserWithoutMention = false;

    if (message.reference && message.reference.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            const isReplyingToYue = repliedMessage.author.id === client.user.id;

            if (!isReplyingToYue && !isMentioned) {
                isReplyToOtherUserWithoutMention = true;
            } else if (!isReplyingToYue && isMentioned) {
                const targetAuthorName = repliedMessage.member?.displayName || repliedMessage.author.username;
                const cleanRepliedContent = (repliedMessage.content || '').replace(/\r?\n/g, ' ').slice(0, 100);
                repliedContextText = `[ĐANG REP TIN NHẮN CỦA ${targetAuthorName}: "${cleanRepliedContent}"]\n`;
            }
        } catch (fetchErr) {
            console.warn("⚠️ Không thể fetch nội dung tin nhắn reply reference:", fetchErr.message);
        }
    }

    if (isReplyToOtherUserWithoutMention) {
        return;
    }

    if (isMentioned || isSpecialChannel) {
        try {
            if (isFeatureOn('discord', 'antiSpam')) {
                const spamCheck = checkAntiSpam(
                    message.author.id,
                    message.member?.displayName || message.author.username,
                    userPrompt || message.content
                );

                if (spamCheck.isSpam) {
                    if (spamCheck.replyMessage) {
                        await message.reply(spamCheck.replyMessage);
                    }
                    return;
                }
            }

            await message.channel.sendTyping();

            if (!userPrompt && !isImage) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

            const fullUserPromptWithReply = `${repliedContextText}${userPrompt}`.trim();
            const runtimeContext = await buildContext(message, fullUserPromptWithReply);
            const consecutiveGifCount = getConsecutiveGifCount(message.channel.id, message.author.id);
            const isGifSpam = isImage && consecutiveGifCount >= 3 && (!userPrompt || userPrompt.length < 15);

            if (!isImage && isFeatureOn('discord', 'naturalLanguageMapRec')) {
                const handledAsMapReq = await handleNaturalLanguageMapRequest(message, fullUserPromptWithReply, runtimeContext);
                if (handledAsMapReq) {
                    return;
                }
            }

            let aiResponse = "";
            if (isImage && isFeatureOn('discord', 'aiVision')) {
                aiResponse = await askYueWithVision(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    fullUserPromptWithReply,
                    mediaData.url,
                    mediaData.mimeType,
                    isGifSpam,
                    runtimeContext
                );
            } else {
                aiResponse = await askYue(
                    runtimeContext.user.discordId,
                    runtimeContext.user.currentDisplayName,
                    fullUserPromptWithReply,
                    message,
                    false,
                    null,
                    runtimeContext
                );
            }

            saveYueReplyToLocalHistory(message.channel.id, aiResponse);
            const replySuffix = process.env.BOT_REPLY_SUFFIX ? ` ${process.env.BOT_REPLY_SUFFIX.trim()}` : '';
            await message.reply(`${aiResponse}${replySuffix}`);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI ở index:", error);
            await message.reply("Huhu, đầu tui đang bị quá tải rồi... 💥");
        }
    }
}

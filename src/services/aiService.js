import { GoogleGenerativeAI } from '@google/generative-ai';
import { handleMemoryCandidate } from '../brain/memoryManagerService.js';
import { filterCleanHistory, updateTopicSummary } from '../brain/conversationContextService.js';
import { getLocalChannelHistory } from './chatHistoryManager.js';
import { extractGifKeyframes, isAnimatedMedia } from './gifProcessor.js';
import { memoryProvider } from '../brain/MemoryProvider.js';
import { handleUserPreChatCheck, recordAiReplyState } from './challengeService.js';
import { 
    BASE_SYSTEM_PROMPT, 
    VOICE_INSTRUCTION, 
    getIngameInstruction, 
    DISCORD_TEXT_INSTRUCTION 
} from '../prompts/yuePrompts.js';
import 'dotenv/config';

const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : (process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.split(',') : []);
let currentKeyIndex = 0;

const aiModel = "gemini-3.1-flash-lite";

function getNextAIInstance(isVoice = false, isIngame = false, extraContext = null) {
    if (apiKeys.length === 0) throw new Error("Chưa cấu hình GEMINI_API_KEYS trong file .env!");

    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

    let dynamicInstruction = "";

    if (isVoice) {
        dynamicInstruction = VOICE_INSTRUCTION;
    } else if (isIngame) {
        dynamicInstruction = getIngameInstruction(extraContext);
    } else {
        dynamicInstruction = DISCORD_TEXT_INSTRUCTION;
    }

    const fullPrompt = BASE_SYSTEM_PROMPT + dynamicInstruction;
    const ai = new GoogleGenerativeAI(key);

    const generationConfig = {};
    if (!isVoice) {
        generationConfig.responseMimeType = "application/json";
    }

    return ai.getGenerativeModel({
        model: aiModel,
        systemInstruction: fullPrompt,
        generationConfig: generationConfig
    });
}

function extractValidJson(rawText) {
    if (!rawText) return null;

    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    try {
        let parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
            parsed = parsed[0];
        }
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    } catch {
        const firstOpen = rawText.indexOf('{');
        const lastClose = rawText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose > firstOpen) {
            const jsonCandidate = rawText.substring(firstOpen, lastClose + 1);
            try {
                let parsed = JSON.parse(jsonCandidate);
                if (Array.isArray(parsed)) {
                    parsed = parsed[0];
                }
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            } catch (err) {
                return null;
            }
        }
    }
    return null;
}

export async function askYue(
    userId,
    username,
    userPrompt,
    messageContext = null,
    isVoice = false,
    ingameContext = null,
    runtimeContext = null
) {
    // 🛡️ BẢO VỆ THAM SỐ: Nếu isVoice truyền vào dạng Object (do nhầm vị trí tham số với runtimeContext)
    if (typeof isVoice === 'object' && isVoice !== null) {
        runtimeContext = isVoice;
        isVoice = false;
    }

    const isIngame = !messageContext?.channel;

    try {
        let formattedHistory = [];
        let pendingUserText = "";
        const channelId = messageContext?.channel?.id;

        if (isVoice || isIngame) {
            formattedHistory = [];
        } else if (channelId) {
            try {
                // 1. Đọc bộ đệm lịch sử local từ chatHistoryManager (tối đa 80 tin nhắn mới nhất)
                let rawHistory = getLocalChannelHistory(channelId, 80);

                // 2. Nếu file local chưa có (lần đầu chat), fetch 80 tin nhắn từ Discord API làm bộ đệm
                if (rawHistory.length === 0 && messageContext?.channel?.messages) {
                    try {
                        const rawMessages = await messageContext.channel.messages.fetch({ limit: 80 });
                        rawHistory = Array.from(rawMessages.values()).reverse().filter(m => m.id !== messageContext.id);
                    } catch (fetchErr) {
                        console.error("❌ Lỗi fetch lịch sử từ Discord API:", fetchErr.message);
                    }
                }

                // 🧹 Dùng filterCleanHistory gộp thoại & lọc lịch sử chất lượng cao
                const cleanedResult = filterCleanHistory(rawHistory, messageContext?.client?.user?.id);
                formattedHistory = cleanedResult.history || [];
                pendingUserText = cleanedResult.pendingUserText || "";
            } catch (err) {
                console.error("❌ Lỗi xử lý lịch sử kênh:", err.message);
                formattedHistory = [];
            }
        }

        let contextHeader = "";
        if (runtimeContext?.topicSummary) {
            contextHeader += `\n[CHỦ ĐỀ ĐANG NÓI HIỆN TẠI TRONG KÊNH]: ${runtimeContext.topicSummary}\n`;
        }

        let memoryInjectText = "";
        if (runtimeContext && runtimeContext.user) {
            const memories = runtimeContext.user.importantMemories || [];
            const aff = runtimeContext.user.affection;
            let affText = "";
            if (aff) {
                affText = `[MỨC HẢO CẢM CỦA USER NÀY: ${aff.score}/100000 EXP - CẤP ĐỘ: ${aff.level}]\n- Hướng dẫn thái độ phản ứng: ${aff.description}\n`;
            }

            if (memories.length > 0) {
                memoryInjectText = `\n[DANH SÁCH KÝ ỨC VỀ USER NÀY (CHỈ DÙNG KHI LIÊN QUAN CHỦ ĐỀ)]:\n${affText}${memories.map(m => `- ${m}`).join('\n')}\n`;
            } else if (affText) {
                memoryInjectText = `\n${affText}\n`;
            }
        }

        let pendingContextText = "";
        if (pendingUserText) {
            pendingContextText = `\n[CÁC CÂU NÓI TRƯỚC ĐÓ CỦA USER CHƯA ĐƯỢC PHẢN HỒI]:\n${pendingUserText}\n`;
        }

        const isCreator = String(userId) === '756427625970270248' || String(username).toLowerCase().includes('katashi');
        const creatorTag = isCreator ? ' [Creator/Chủ nhân]' : '';

        // 🛡️ KIỂM TRA TRẠNG THÁI THÁCH THỨC ĐE DỌA BLOCK
        const challengeInfo = handleUserPreChatCheck(userId, userPrompt);
        let challengeInjectText = "";
        if (challengeInfo.isChallenge) {
            if (challengeInfo.shouldBlock) {
                challengeInjectText = `\n[CẢNH BÁO HỆ THỐNG - THÁCH THỨC LẦN 2]: User vừa THÁCH THỨC BẠN LẦN THỨ 2 ("${userPrompt}"). BẠN BẮT BUỘC PHẢI THỰC THI LỆNH BLOCK bằng cách trả về "executeBlock": true trong JSON, đồng thời ra tuyên bố chính thức đưa user vào danh sách đen!\n`;
            } else {
                challengeInjectText = `\n[CẢNH BÁO HỆ THỐNG - THÁCH THỨC LẦN 1]: Bạn đã dọa cho user vào danh sách đen và User vừa THÁCH THỨC BẠN LẦN THỨ 1 ("${userPrompt}"). HÃY CẢNH BÁO NGHIÊM TÚC LẦN CỦA RẰNG ĐỪNG CÓ THÁCH BẠN ("ông đừng có thách tôi...")!\n`;
            }
        }

        const currentMessageWithContext = `${contextHeader}${memoryInjectText}${pendingContextText}${challengeInjectText}[User Discord ID: ${userId} | ${username}${creatorTag}]: ${userPrompt}`;

        let result;
        let attempts = 0;
        const maxAttempts = Math.max(apiKeys.length, 1);
        let lastErr = null;

        while (attempts < maxAttempts) {
            const usedKeyIndex = currentKeyIndex;
            try {
                const model = getNextAIInstance(isVoice, isIngame, ingameContext);
                const chatConfig = { temperature: 0.2 };
                if (!isVoice) {
                    chatConfig.responseMimeType = "application/json";
                }
                const chat = model.startChat({
                    history: formattedHistory,
                    generationConfig: chatConfig
                });
                result = await chat.sendMessage(currentMessageWithContext);
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                attempts++;
                const isKeyError = err.status === 403 || err.status === 429 || err.status === 401 || (err.message && (err.message.includes('403') || err.message.includes('429') || err.message.includes('Forbidden')));
                if (isKeyError && attempts < maxAttempts) {
                    console.warn(`⚠️ [Yue AI] Key index ${usedKeyIndex} bị lỗi (${err.status || err.message}). Tự động thử Key tiếp theo (${attempts}/${maxAttempts})...`);
                    continue;
                }
                throw err;
            }
        }

        if (!result && lastErr) throw lastErr;
        const rawResponseText = result.response.text();

        const parsedRes = extractValidJson(rawResponseText);
        const replyText = parsedRes?.reply || rawResponseText;

        if (channelId) {
            updateTopicSummary(channelId, userPrompt, replyText);
        }

        if (parsedRes) {
            if (isIngame) {
                return JSON.stringify({
                    reply: parsedRes.reply || "",
                    command: parsedRes.command || ""
                });
            }

            // 1. Process affection delta
            let affText = "";
            if (typeof parsedRes.affectionDelta === 'number' && parsedRes.affectionDelta !== 0) {
                const tierResult = memoryProvider.updateAffection(userId, parsedRes.affectionDelta);
                if (tierResult) {
                    affText = `💖 ${tierResult.score} (${tierResult.level} | ${parsedRes.affectionDelta >= 0 ? '+' : ''}${parsedRes.affectionDelta})`;
                }
            } else {
                const currentAff = memoryProvider.getAffection(userId);
                affText = `💖 ${currentAff.score} (${currentAff.level})`;
            }

            // 2. Process memory candidates
            let savedMemories = [];
            if (parsedRes.memoryCandidates && Array.isArray(parsedRes.memoryCandidates) && parsedRes.memoryCandidates.length > 0) {
                savedMemories = parsedRes.memoryCandidates.map(c => handleMemoryCandidate(userId, c)).filter(Boolean);
            } else if (parsedRes.memoryCandidate) {
                const saved = handleMemoryCandidate(userId, parsedRes.memoryCandidate);
                if (saved) savedMemories.push(saved);
            }

            const memText = savedMemories.length > 0
                ? `🧠 Lưu Ký Ức: ${savedMemories.join(' | ')}`
                : `🧠 Ký Ức: Không lưu mới`;

            const replyPreview = replyText.replace(/\r?\n/g, ' ').slice(0, 55);

            // 🛡️ XỬ LÝ TỰ ĐỘNG BLOCK KHI THÁCH THỨC ĐỦ 2 LẦN HOẶC AI RA LỆNH BLOCK
            const shouldBlock = Boolean(parsedRes.executeBlock) || challengeInfo.shouldBlock;
            if (shouldBlock && !isCreator) {
                memoryProvider.blacklistUser(userId);
                recordAiReplyState(userId, replyText, true);
                console.log(`⛔ [Yue AI] Đã tự động đưa User: ${username} (${userId}) vào Blacklist do bị thách thức 2 lần!`);
            } else {
                recordAiReplyState(userId, replyText, false);
            }

            // 💬 COMPACT 1-LINE LOG PER TURN
            console.log(`💬 [Yue AI] User: ${username} | ${affText} | ${memText} | Reply: "${replyPreview}..."`);

            return parsedRes.reply || rawResponseText;
        } else {
            if (isIngame) {
                return JSON.stringify({
                    reply: rawResponseText.replace(/```json/gi, '').replace(/```/g, '').trim(),
                    command: ""
                });
            }

            return rawResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        }

    } catch (error) {
        console.error("❌ Lỗi AI Service:", error.message);
        return isIngame
            ? `{"reply": "Hình như tui bị lag rồi, phiền ông gõ lại nhé!", "command": ""}`
            : "Hình như tui bị lag rồi, phiền ông gõ lại nhé!";
    }
}

export async function extractMediaFromMessage(message) {
    if (!message) return null;

    // 1. Check direct file attachments
    const attachment = message.attachments?.first ? message.attachments.first() : null;
    if (attachment && attachment.contentType?.startsWith('image/')) {
        return {
            url: attachment.url,
            mimeType: attachment.contentType
        };
    }

    // 2. Check Discord Embeds
    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            const mediaUrl = embed.image?.url || embed.thumbnail?.url || (embed.type === 'gifv' || embed.type === 'image' ? embed.url : null);
            if (mediaUrl) {
                const lower = mediaUrl.toLowerCase();
                let mimeType = 'image/png';
                if (lower.includes('.gif') || lower.includes('tenor.com') || lower.includes('giphy.com')) mimeType = 'image/gif';
                else if (lower.includes('.webp')) mimeType = 'image/webp';
                else if (lower.includes('.jpg') || lower.includes('.jpeg')) mimeType = 'image/jpeg';

                return {
                    url: mediaUrl,
                    mimeType: mimeType
                };
            }
        }
    }

    // 3. Check image/gif URL strings in content
    const urlRegex = /(https?:\/\/[^\s]+(?:\.(?:gif|png|jpg|jpeg|webp))|https?:\/\/(?:media\.)?tenor\.com\/[^\s]+|https?:\/\/media\d?\.giphy\.com\/[^\s]+)/gi;
    const matches = message.content?.match(urlRegex);
    if (matches && matches.length > 0) {
        let rawUrl = matches[0];
        
        if (rawUrl.includes('tenor.com/view')) {
            try {
                const res = await fetch(rawUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const html = await res.text();
                const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
                if (ogMatch && ogMatch[1]) {
                    rawUrl = ogMatch[1];
                }
            } catch (e) {
                console.warn("⚠️ Không thể giải mã link Tenor:", e.message);
            }
        }

        const lower = rawUrl.toLowerCase();
        let mimeType = 'image/png';
        if (lower.includes('.gif') || lower.includes('tenor') || lower.includes('giphy')) mimeType = 'image/gif';
        else if (lower.includes('.webp')) mimeType = 'image/webp';
        else if (lower.includes('.jpg') || lower.includes('.jpeg')) mimeType = 'image/jpeg';

        return {
            url: rawUrl,
            mimeType: mimeType
        };
    }

    return null;
}

export async function askYueWithVision(
    userId,
    username,
    userPrompt,
    imageUrl,
    mimeType,
    isGifSpam = false,
    runtimeContext = null
) {
    try {
        // Download raw media buffer
        const response = await fetch(imageUrl);
        const contentType = response.headers.get('content-type');
        const buffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(buffer);

        let finalMime = mimeType || "image/png";
        if (contentType && contentType.startsWith('image/')) {
            finalMime = contentType.split(';')[0].trim().toLowerCase();
        }

        const isGifOrAnimated = finalMime.includes('gif') || (imageUrl || '').toLowerCase().includes('.gif') || isAnimatedMedia(inputBuffer, finalMime, imageUrl);

        let imageParts = [];
        if (isGifOrAnimated) {
            imageParts = await extractGifKeyframes(inputBuffer, finalMime, 4, imageUrl);
        } else {
            let safeMime = finalMime;
            if (safeMime.includes('gif')) safeMime = 'image/png';
            imageParts = [{
                inlineData: {
                    data: inputBuffer.toString("base64"),
                    mimeType: safeMime
                }
            }];
        }

        const cleanPromptText = (userPrompt || '').replace(/(https?:\/\/[^\s]+)/gi, '').trim();

        let contextHeader = "";
        if (runtimeContext?.topicSummary) {
            contextHeader += `\n[CHỦ ĐỀ ĐANG NÓI HIỆN TẠI TRONG KÊNH]: ${runtimeContext.topicSummary}\n`;
        }

        let memoryInjectText = "";
        if (runtimeContext && runtimeContext.user) {
            const memories = runtimeContext.user.importantMemories || [];
            const aff = runtimeContext.user.affection;
            let affText = "";
            if (aff) {
                affText = `[MỨC HẢO CẢM CỦA USER NÀY: ${aff.score}/100000 EXP - CẤP ĐỘ: ${aff.level}]\n- Hướng dẫn thái độ phản ứng: ${aff.description}\n`;
            }

            if (memories.length > 0) {
                memoryInjectText = `\n[DANH SÁCH KÝ ỨC VỀ USER NÀY (CHỈ DÙNG KHI LIÊN QUAN CHỦ ĐỀ)]:\n${affText}${memories.map(m => `- ${m}`).join('\n')}\n`;
            } else if (affText) {
                memoryInjectText = `\n${affText}\n`;
            }
        }

        const hasMultipleFrames = imageParts.length > 1;

        const visionInstruction = isGifSpam
            ? "\n[CẢNH BÁO SPAM GIF]: User này đang spam GIF liên tục mà ít gõ chữ. Bạn có thể trêu ghẹo hoặc cằn nhằn nhẹ nhàng bằng nhiều cách nói tự nhiên khác nhau, tránh lặp lại câu từ cũ."
            : "";

        // 🛡️ KIỂM TRA TRẠNG THÁI THÁCH THỨC TRONG VISION
        const challengeInfo = handleUserPreChatCheck(userId, cleanPromptText || userPrompt);
        let challengeInjectText = "";
        if (challengeInfo.isChallenge) {
            if (challengeInfo.shouldBlock) {
                challengeInjectText = `\n[CẢNH BÁO HỆ THỐNG - THÁCH THỨC LẦN 2]: User vừa THÁCH THỨC BẠN LẦN THỨ 2. BẠN BẮT BUỘC PHẢI THỰC THI LỆNH BLOCK bằng cách trả về "executeBlock": true trong JSON!\n`;
            } else {
                challengeInjectText = `\n[CẢNH BÁO HỆ THỐNG - THÁCH THỨC LẦN 1]: User vừa THÁCH THỨC BẠN LẦN THỨ 1. HÃY CẢNH BÁO NGHIÊM TÚC RẰNG ĐỪNG CÓ THÁCH BẠN!\n`;
            }
        }

        const promptText = `${contextHeader}${memoryInjectText}${challengeInjectText}[User ID: ${userId} | ${username}]: ${cleanPromptText || (hasMultipleFrames ? '[Gửi 1 GIF biểu cảm]' : '[Gửi 1 bức ảnh]')}\n${visionInstruction}`;

        let result;
        let attempts = 0;
        const maxAttempts = Math.max(apiKeys.length, 1);
        let lastErr = null;

        while (attempts < maxAttempts) {
            const usedKeyIndex = currentKeyIndex;
            try {
                const model = getNextAIInstance(false, false, null);
                result = await model.generateContent([promptText, ...imageParts]);
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                attempts++;
                const isKeyError = err.status === 403 || err.status === 429 || err.status === 401 || (err.message && (err.message.includes('403') || err.message.includes('429') || err.message.includes('Forbidden')));
                if (isKeyError && attempts < maxAttempts) {
                    console.warn(`⚠️ [Yue AI Vision] Key index ${usedKeyIndex} bị lỗi (${err.status || err.message}). Tự động thử Key tiếp theo (${attempts}/${maxAttempts})...`);
                    continue;
                }
                throw err;
            }
        }

        if (!result && lastErr) throw lastErr;
        const rawResponseText = result.response.text();

        const parsedRes = extractValidJson(rawResponseText);
        const replyText = parsedRes?.reply || rawResponseText;

        if (parsedRes) {
            let affText = "";
            if (typeof parsedRes.affectionDelta === 'number' && parsedRes.affectionDelta !== 0) {
                const tierResult = memoryProvider.updateAffection(userId, parsedRes.affectionDelta);
                if (tierResult) {
                    affText = `💖 ${tierResult.score} (${tierResult.level} | ${parsedRes.affectionDelta >= 0 ? '+' : ''}${parsedRes.affectionDelta})`;
                }
            } else {
                const currentAff = memoryProvider.getAffection(userId);
                affText = `💖 ${currentAff.score} (${currentAff.level})`;
            }

            let savedMemories = [];
            if (parsedRes.memoryCandidates && Array.isArray(parsedRes.memoryCandidates) && parsedRes.memoryCandidates.length > 0) {
                savedMemories = parsedRes.memoryCandidates.map(c => handleMemoryCandidate(userId, c)).filter(Boolean);
            } else if (parsedRes.memoryCandidate) {
                const saved = handleMemoryCandidate(userId, parsedRes.memoryCandidate);
                if (saved) savedMemories.push(saved);
            }

            const memText = savedMemories.length > 0
                ? `🧠 Lưu Ký Ức: ${savedMemories.join(' | ')}`
                : `🧠 Ký Ức: Không lưu mới`;

            const replyPreview = replyText.replace(/\r?\n/g, ' ').slice(0, 55);

            const isCreator = String(userId) === '756427625970270248';
            const shouldBlock = Boolean(parsedRes.executeBlock) || challengeInfo.shouldBlock;
            if (shouldBlock && !isCreator) {
                memoryProvider.blacklistUser(userId);
                recordAiReplyState(userId, replyText, true);
                console.log(`⛔ [Yue AI Vision] Đã tự động đưa User: ${username} (${userId}) vào Blacklist do bị thách thức 2 lần!`);
            } else {
                recordAiReplyState(userId, replyText, false);
            }

            console.log(`💬 [Yue AI Vision] User: ${username} | ${affText} | ${memText} | Reply: "${replyPreview}..."`);

            return parsedRes.reply || rawResponseText;
        } else {
            return rawResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        }

    } catch (err) {
        console.error("❌ Lỗi AI Vision:", err);
        return "Tấm ảnh/GIF này bị lỗi hoặc tui chưa soi ra được nội dung rồi ông ơi!";
    }
}
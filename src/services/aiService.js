import { GoogleGenerativeAI } from '@google/generative-ai';
import { handleMemoryCandidate } from '../brain/memoryManagerService.js';
import { filterCleanHistory, updateTopicSummary } from '../brain/conversationContextService.js';
import { getLocalChannelHistory, saveYueReplyToLocalHistory } from './chatHistoryManager.js';
import { extractGifKeyframes, isAnimatedMedia } from './gifProcessor.js';
import { memoryProvider } from '../brain/MemoryProvider.js';
import { 
    BASE_SYSTEM_PROMPT, 
    VOICE_INSTRUCTION, 
    getIngameInstruction, 
    DISCORD_TEXT_INSTRUCTION 
} from '../prompts/yuePrompts.js';
import 'dotenv/config';

const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [];
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
    try {
        return JSON.parse(rawText);
    } catch {
        const firstOpen = rawText.indexOf('{');
        const lastClose = rawText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose > firstOpen) {
            const jsonCandidate = rawText.substring(firstOpen, lastClose + 1);
            try {
                return JSON.parse(jsonCandidate);
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

            if (memories.length > 0 || affText) {
                memoryInjectText = `\n${affText}[KÝ ỨC ĐÃ LƯU VỀ USER NÀY]:\n- ${memories.join('\n- ')}\n`;
            }
        }

        let pendingContextText = "";
        if (pendingUserText) {
            pendingContextText = `\n[CÁC CÂU NÓI TRƯỚC ĐÓ CỦA USER CHƯA ĐƯỢC PHẢN HỒI]:\n${pendingUserText}\n`;
        }

        const model = getNextAIInstance(isVoice, isIngame, ingameContext);

        const chatConfig = { temperature: 0.2 };
        if (!isVoice) {
            chatConfig.responseMimeType = "application/json";
        }

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: chatConfig
        });

        const isCreator = String(userId) === '756427625970270248' || String(username).toLowerCase().includes('katashi');
        const creatorTag = isCreator ? ' [Creator/Chủ nhân]' : '';

        const currentMessageWithContext = `${contextHeader}${memoryInjectText}${pendingContextText}[User Discord ID: ${userId} | ${username}${creatorTag}]: ${userPrompt}`;
        const result = await chat.sendMessage(currentMessageWithContext);
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

            const replyPreview = (parsedRes.reply || rawResponseText).replace(/\r?\n/g, ' ').slice(0, 55);

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

            if (userPrompt.includes("Nguyễn Thanh Huy") || userPrompt.includes("2003")) {
                handleMemoryCandidate(userId, {
                    category: "identity",
                    fact: { key: "creator_profile", value: "Tên thật Nguyễn Thanh Huy (Huy), sinh năm 2003 (23 tuổi), Freelance, chơi PUBG, CS2, osu!, Delta Force" },
                    importance: 10,
                    type: "permanent"
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

    // 1. Check direct file attachments (standard file upload)
    const attachment = message.attachments?.first ? message.attachments.first() : null;
    if (attachment && attachment.contentType?.startsWith('image/')) {
        return {
            url: attachment.url,
            mimeType: attachment.contentType
        };
    }

    // 2. Check Discord Embeds (Discord GIF picker Tenor/Giphy or link embeds)
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

    // 3. Check image/gif URL strings in message content
    const urlRegex = /(https?:\/\/[^\s]+(?:\.(?:gif|png|jpg|jpeg|webp))|https?:\/\/(?:media\.)?tenor\.com\/[^\s]+|https?:\/\/media\d?\.giphy\.com\/[^\s]+)/gi;
    const matches = message.content?.match(urlRegex);
    if (matches && matches.length > 0) {
        let rawUrl = matches[0];
        
        // Resolve Tenor view URL to direct gif link if embeds are missing
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

async function urlToGenerativePart(url, mimeType) {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    let finalMime = mimeType || "image/gif";
    if (contentType && contentType.startsWith('image/')) {
        finalMime = contentType.split(';')[0].trim().toLowerCase();
    }

    return {
        inlineData: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType: finalMime
        },
    };
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
        const model = getNextAIInstance(false, false, null);

        // Download raw media buffer
        const response = await fetch(imageUrl);
        const contentType = response.headers.get('content-type');
        const buffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(buffer);

        let finalMime = mimeType || "image/png";
        if (contentType && contentType.startsWith('image/')) {
            finalMime = contentType.split(';')[0].trim().toLowerCase();
        }

        const isAnimated = isAnimatedMedia(inputBuffer, finalMime, imageUrl);

        let imageParts = [];
        if (isAnimated) {
            imageParts = await extractGifKeyframes(inputBuffer, finalMime, 4, imageUrl);
        } else {
            imageParts = [{
                inlineData: {
                    data: inputBuffer.toString("base64"),
                    mimeType: finalMime
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

            if (memories.length > 0 || affText) {
                memoryInjectText = `\n${affText}[KÝ ỨC ĐÃ LƯU VỀ USER NÀY]:\n- ${memories.join('\n- ')}\n`;
            }
        }

        const hasMultipleFrames = imageParts.length > 1;

        let visionInstruction = "";
        if (hasMultipleFrames) {
            const spamNote = isGifSpam ? `\n[Ghi chú]: User vừa gửi dồn dập nhiều GIF không kèm chữ. Nếu đây là GIF thể hiện cảm xúc cho câu chuyện thì hãy tương tác với cảm xúc đó; nếu chỉ là spam rác vô nghĩa thì trêu chọc/nhắc nhở vui vẻ linh hoạt.` : ``;
            visionInstruction = `
[LƯU Ý VISION GIF]: Đây là chuỗi ${imageParts.length} khung hình (keyframes) bóc tách từ 1 GIF động.
[HƯỚNG DẪN TƯƠNG TÁC CHUẨN NGƯỜI THẬT]:
1. ĐỌC EMOTION/NGÔN NGỮ CƠ THỂ TRONG GIF: Coi GIF này như cảm xúc/cử chỉ mà ${username} muốn thể hiện trong cuộc trò chuyện lúc này.
2. TƯƠNG TÁC VỚI CẢM XÚC: Đừng nhận xét bức ảnh như bài kiểm tra ("ảnh này buồn cười/xấu"). HÃY TRẢ LỜI TRỰC TIẾP VÀO CẢM XÚC THỰC TẾ của ${username} (ví dụ: trêu đùa, hỏi thăm lý do, chia sẻ cảm xúc, nương theo trò đùa).${spamNote}`;
        } else {
            visionInstruction = `
[HƯỚNG DẪN XỬ LÝ ẢNH TĨNH]:
1. QUAN SÁT ẢNH: Đọc nội dung tấm ảnh/hình chụp/meme/bức hình mà ${username} vừa gửi (chú ý chữ trong ảnh, chi tiết nổi bật, cảm xúc hoặc ngữ cảnh câu chuyện).
2. TƯƠNG TÁC TỰ NHIÊN NHƯ VỢ NÓI CHUYỆN VỚI CHỒNG/BẠN BÈ: Phản hồi tự nhiên, hài hước, dỗi hờn hoặc bình luận trực tiếp vào chi tiết trong ảnh theo đúng văn phong Yue AI. Đừng nhận xét bài kiểm tra khô khan.`;
        }

        const promptText = `${contextHeader}${memoryInjectText}[User ID: ${userId} | ${username}]: ${cleanPromptText || (hasMultipleFrames ? '[Gửi 1 GIF biểu cảm]' : '[Gửi 1 bức ảnh]')}\n${visionInstruction}`;

        const result = await model.generateContent([promptText, ...imageParts]);
        const rawResponseText = result.response.text();

        const parsedRes = extractValidJson(rawResponseText);
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

            const replyPreview = (parsedRes.reply || rawResponseText).replace(/\r?\n/g, ' ').slice(0, 55);
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
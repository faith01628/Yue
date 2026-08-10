import { GoogleGenerativeAI } from '@google/generative-ai';
import { handleMemoryCandidate } from '../brain/memoryManagerService.js';
import { filterCleanHistory, updateTopicSummary } from '../brain/conversationContextService.js';
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

    try {
        let formattedHistory = [];
        let pendingUserText = "";
        const isIngame = !messageContext?.channel;
        const channelId = messageContext?.channel?.id;

        if (isVoice || isIngame) {
            formattedHistory = [];
        } else if (messageContext?.channel?.messages) {
            try {
                // 🚀 LẤY TỚI 40 TIN NHẮN GẦN NHẤT từ Discord channel để lưu ngữ cảnh chat sâu rộng
                const rawMessages = await messageContext.channel.messages.fetch({ limit: 40 });
                const sortedMessages = Array.from(rawMessages.values()).reverse().filter(m => m.id !== messageContext.id);

                // 🧹 Dùng filterCleanHistory gộp thoại & lọc lịch sử chất lượng cao
                const cleanedResult = filterCleanHistory(sortedMessages, messageContext.client?.user?.id);
                formattedHistory = cleanedResult.history || [];
                pendingUserText = cleanedResult.pendingUserText || "";
            } catch (fetchErr) {
                console.error("❌ Lỗi lấy lịch sử chat Discord:", fetchErr.message);
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
            if (memories.length > 0) {
                memoryInjectText = `\n[KÝ ỨC ĐÃ LƯU VỀ USER NÀY]:\n- ${memories.join('\n- ')}\n`;
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

        const currentMessageWithContext = `${contextHeader}${memoryInjectText}${pendingContextText}[User Discord ID: ${userId} | ${username}]: ${userPrompt}`;
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

            console.log("\n--- [LOG KIỂM TRA BỘ NHỚ YUE] ---");
            console.log(`💬 Yue Reply: "${parsedRes.reply}"`);

            if (parsedRes.memoryCandidates && Array.isArray(parsedRes.memoryCandidates) && parsedRes.memoryCandidates.length > 0) {
                console.log(`🧠 [Gemini Đề Xuất Ký Ức]: Tìm thấy ${parsedRes.memoryCandidates.length} mục:`);
                parsedRes.memoryCandidates.forEach(candidate => {
                    handleMemoryCandidate(userId, candidate);
                });
            } else if (parsedRes.memoryCandidate) {
                console.log(`🧠 [Gemini Đề Xuất Ký Ức]: 1 mục:`);
                handleMemoryCandidate(userId, parsedRes.memoryCandidate);
            } else {
                console.log(`🟡 [Memory Evaluation]: Gemini đánh giá tin nhắn này KHÔNG chứa ký ức mới cần lưu.`);
            }
            console.log("-----------------------------------\n");

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

async function urlToGenerativePart(url, mimeType) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return {
        inlineData: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType: mimeType || "image/png"
        },
    };
}

export async function askYueWithVision(userId, username, userPrompt, imageUrl, mimeType) {
    try {
        const model = getNextAIInstance(false, false, null);
        const imagePart = await urlToGenerativePart(imageUrl, mimeType);

        const promptText = `[${username}]: ${userPrompt || 'Soi giúp tui bức ảnh/nội dung này với!'}`;

        const result = await model.generateContent([promptText, imagePart]);
        const responseText = result.response.text();

        const parsedRes = extractValidJson(responseText);
        return parsedRes?.reply || responseText;
    } catch (err) {
        console.error("❌ Lỗi AI Vision:", err);
        return "Tấm ảnh này bị lỗi hoặc tui chưa soi ra được nội dung rồi ông ơi!";
    }
}
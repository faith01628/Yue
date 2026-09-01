import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserSkillProfile } from '../storage/userProfileStore.js';
import 'dotenv/config';

const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [];
let currentKeyIndex = 0;

function getApiKey() {
    if (apiKeys.length === 0) return process.env.GEMINI_API_KEY || null;
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return key;
}

/**
 * Kiểm tra xem tin nhắn người dùng có phải là yêu cầu gợi ý/tìm beatmap không
 */
/**
 * Kiểm tra xem tin nhắn người dùng có phải là yêu cầu gợi ý/tìm/chọn beatmap không
 */
export function isMapRecommendationRequest(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();

    // Động từ hoặc từ khóa yêu cầu chọn/gợi ý/tìm/farm
    const actionKeywords = [
        'gợi ý', 'goi y', 'tìm', 'tim', 'pick', 'chọn', 'chon',
        'kiếm', 'kiem', 'recommend', 'lọc', 'loc', 'cho xin', 'cho 1', 'cho tui',
        'farm', 'cần 1 map', 'cho bài', 'tìm bài'
    ];

    // Đối tượng liên quan tới map/beatmap/pp
    const mapKeywords = ['map', 'beatmap', 'bài', 'bai', 'pp'];

    const hasAction = actionKeywords.some(kw => lower.includes(kw));
    const hasMapObj = mapKeywords.some(kw => lower.includes(kw));

    return hasAction && hasMapObj;
}

/**
 * Trích xuất tham số lọc beatmap bằng Regex siêu tốc (Fast-Path < 1ms)
 */
function extractIntentByRegex(prompt) {
    if (!prompt) return null;
    const lower = prompt.toLowerCase();

    let extracted = {
        skill: null,
        targetBpm: null,
        stars: null,
        maxLengthSec: null,
        targetPp: null,
        targetAcc: null,
        isFarm: false
    };

    // 1. Trích xuất 10 nhóm kỹ năng (Skill System)
    if (lower.includes('stream') || lower.includes('stamina') || lower.includes('deathstream')) {
        extracted.skill = 'stream';
    } else if (lower.includes('jump') || lower.includes('cross screen')) {
        extracted.skill = 'jump';
    } else if (lower.includes('tech') || lower.includes('technical') || lower.includes('slider')) {
        extracted.skill = 'tech';
    } else if (lower.includes('finger control') || lower.includes('fingercontrol') || lower.includes('burst') || lower.includes('rhythm')) {
        extracted.skill = 'fingercontrol';
    } else if (lower.includes('reading') || lower.includes('low ar') || lower.includes('ar8') || lower.includes('ez')) {
        extracted.skill = 'reading';
    } else if (lower.includes('gimmick') || lower.includes('alt') || lower.includes('alternating') || lower.includes('wub')) {
        extracted.skill = 'gimmick';
    } else if (lower.includes('flowaim') || lower.includes('flow aim') || lower.includes('flow')) {
        extracted.skill = 'flowaim';
    } else if (lower.includes('speed') || lower.includes('high bpm') || lower.includes('fast')) {
        extracted.skill = 'speed';
    } else if (lower.includes('precision') || lower.includes('cs5') || lower.includes('cs6') || lower.includes('small circle')) {
        extracted.skill = 'precision';
    } else if (lower.includes('farm') || lower.includes('pp') || lower.includes('tv size') || lower.includes('sotarks')) {
        extracted.skill = 'farm';
        extracted.isFarm = true;
    }

    // 2. Trích xuất BPM
    const bpmMatch = lower.match(/(\d{3})\s*bpm/);
    if (bpmMatch) extracted.targetBpm = parseInt(bpmMatch[1], 10);

    // 3. Trích xuất Target PP
    const ppMatch = lower.match(/(\d{2,4})\s*pp/) || lower.match(/pp\s*(khoản|khoảng)?\s*(\d{2,4})/);
    if (ppMatch) extracted.targetPp = parseInt(ppMatch[1] || ppMatch[2], 10);

    // 4. Trích xuất Target Acc
    const accMatch = lower.match(/(\d{2})\s*%?\s*acc/) || lower.match(/acc\s*(\d{2})/);
    if (accMatch) extracted.targetAcc = parseInt(accMatch[1], 10);

    // 5. Trích xuất Stars
    const starMatch = lower.match(/(\d[\.,]\d|\d)\s*(sao|star|\*)/);
    if (starMatch) {
        extracted.stars = parseFloat(starMatch[1].replace(',', '.'));
    }

    // 6. Trích xuất Max Length (Tránh nhầm 'sao' hay 'star' thành 's')
    const minMatch = lower.match(/(\d+)\s*(phút|phut|m\b)/);
    if (minMatch) {
        extracted.maxLengthSec = parseInt(minMatch[1], 10) * 60;
    } else {
        const secMatch = lower.match(/(\d+)\s*(giây|giay|\bsec\b|\bs\b)(?!ao|tar)/);
        if (secMatch) extracted.maxLengthSec = parseInt(secMatch[1], 10);
    }

    // 7. Trích xuất số đứng một mình nếu người dùng gõ ngắn gọn (ví dụ: ".pm farm 200", ".pm 5.8")
    if (!extracted.targetPp && !extracted.stars && !extracted.targetBpm) {
        const standaloneNumbers = lower.match(/\b\d+([\.,]\d+)?\b/g);
        if (standaloneNumbers) {
            for (const numStr of standaloneNumbers) {
                const numVal = parseFloat(numStr.replace(',', '.'));
                if (numStr.includes('.') || numStr.includes(',')) {
                    if (numVal >= 1.0 && numVal <= 10.0) {
                        extracted.stars = numVal;
                        break;
                    }
                } else {
                    if (numVal >= 100 && numVal <= 950) {
                        extracted.targetPp = numVal;
                        console.log(`💡 [mapIntentService] Nhận diện số standalone "${numVal}" -> Target PP: ${numVal}PP`);
                        break;
                    } else if (numVal >= 1 && numVal <= 10) {
                        extracted.stars = numVal;
                        break;
                    }
                }
            }
        }
    }

    // 8. Trích xuất Mod yêu cầu (DT / NC / HR / NM / HDDT)
    if (/\b(dt|nc|hddt)\b/.test(lower)) {
        extracted.requestedMod = 'DT';
    } else if (/\b(hr|hrhd|hdhr)\b/.test(lower)) {
        extracted.requestedMod = 'HR';
    } else if (/\b(nomod|nm)\b/.test(lower)) {
        extracted.requestedMod = 'NM';
    }

    return extracted;
}


/**
 * Phân tích cú pháp tin nhắn gợi ý map bằng AI & ghép nối chỉ số profile từ .st
 * @param {string} prompt 
 * @param {string} discordId 
 * @returns {Promise<object>}
 */
export async function parseMapRecommendationIntent(prompt, discordId) {
    const userProfile = getUserSkillProfile(discordId);
    
    // FAST-PATH: Thử trích xuất bằng Regex siêu tốc trước (< 1ms)
    let extracted = extractIntentByRegex(prompt) || {
        skill: null,
        targetBpm: null,
        stars: null,
        maxLengthSec: null,
        targetPp: null,
        targetAcc: null,
        isFarm: false
    };

    // NẾU FAST-PATH ĐÃ BẮT ĐƯỢC THAM SỐ CHÍNH (SKILL / STARS / TARGET PP / BPM) -> BỎ QUA AI HOÀN TOÀN!
    const hasKeyParam = extracted.skill || extracted.stars || extracted.targetPp || extracted.targetBpm;

    if (!hasKeyParam) {
        const apiKey = getApiKey();
        if (apiKey) {
            try {
                const ai = new GoogleGenerativeAI(apiKey);
                const model = ai.getGenerativeModel({
                    model: 'gemini-3.1-flash-lite',
                    generationConfig: { responseMimeType: 'application/json' }
                });

                const systemPrompt = `Bạn là bộ phân tích ý định (Intent Parser) cho chatbot osu! tên Yue.
Nhiệm vụ: Trích xuất các tham số lọc beatmap osu! từ tin nhắn người dùng thành JSON.
JSON output schema:
{
  "skill": string | null (chỉ chọn từ: "stream", "jump", "fingercontrol", "tech", "farm", "reading", "gimmick", "flowaim", "speed", "precision"),
  "targetBpm": number | null,
  "stars": number | null,
  "targetPp": number | null,
  "targetAcc": number | null,
  "maxLengthSec": number | null,
  "isFarm": boolean
}`;

                const response = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nTin nhắn người dùng: "${prompt}"` }] }]
                });

                const text = response.response.text();
                if (text) {
                    const parsed = JSON.parse(text);
                    extracted = { ...extracted, ...parsed };
                }
            } catch (err) {
                console.warn('⚠️ [mapIntentService] Không thể parse intent qua AI, dùng kết quả regex:', err.message);
            }
        }
    } else {
        console.log(`⚡ [mapIntentService] Fast-Path Regex thành công (<1ms): Skill=${extracted.skill || 'None'}, Stars=${extracted.stars || 'None'}, BPM=${extracted.targetBpm || 'None'}, PP=${extracted.targetPp || 'None'}`);
    }

    // NẾU CÓ TARGET PP -> QUY ĐỔI RA STAR RATING PHÙ HỢP
    if (extracted.targetPp && !extracted.stars) {
        let effectivePp = extracted.targetPp;
        if (extracted.targetAcc && extracted.targetAcc < 98) {
            const accMultiplier = (extracted.targetAcc / 100) * 0.75 + 0.25;
            effectivePp = extracted.targetPp / Math.max(0.4, accMultiplier);
        }
        const approxStars = Math.pow(effectivePp / 8.0, 0.45);
        extracted.stars = parseFloat(Math.min(8.0, Math.max(2.0, approxStars)).toFixed(2));
        console.log(`💡 [mapIntentService] Quy đổi ${extracted.targetPp}PP (${extracted.targetAcc || 100}% Acc) -> Target Stars: ~${extracted.stars}★`);
    }

    // BƯỚC XÁC ĐỊNH MIN/MAX STARS DỰA TRÊN THÔNG TIN USER PROFILE (.st)
    let minStars, maxStars;
    let isUsingProfile = false;

    if (typeof extracted.stars === 'number' && !isNaN(extracted.stars)) {
        minStars = Math.max(1.0, extracted.stars - 0.3);
        maxStars = extracted.stars + 0.3;
    } else if (userProfile && typeof userProfile.avgStars === 'number') {
        // Mở rộng khoảng sao rộng rãi (từ avgStars - 0.5 đến avgStars + 1.2★) để không ép cứng người dùng ở mức thấp
        minStars = Math.max(1.0, userProfile.avgStars - 0.5);
        maxStars = userProfile.avgStars + 1.2;
        isUsingProfile = true;
    } else {
        // Mặc định 5.0★ - 6.5★ nếu chưa có thông tin .st
        minStars = 5.0;
        maxStars = 6.5;
    }

    return {
        skill: extracted.skill,
        targetBpm: extracted.targetBpm || null, // KHÔNG tự động ép targetBpm từ avgBpm nếu người dùng không yêu cầu!
        minStars: parseFloat(minStars.toFixed(2)),
        maxStars: parseFloat(maxStars.toFixed(2)),
        maxLength: extracted.maxLengthSec,
        targetPp: extracted.targetPp || null,
        targetAcc: extracted.targetAcc || null,
        requestedMod: extracted.requestedMod || null,
        isFarm: extracted.isFarm || extracted.skill === 'farm',
        userAvgStars: userProfile?.avgStars || null,

        userProfile,
        isUsingProfile
    };
}



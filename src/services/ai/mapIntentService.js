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
 * Phân tích cú pháp tin nhắn gợi ý map bằng AI & ghép nối chỉ số profile từ .st
 * @param {string} prompt 
 * @param {string} discordId 
 * @returns {Promise<object>}
 */
export async function parseMapRecommendationIntent(prompt, discordId) {
    const userProfile = getUserSkillProfile(discordId);
    let extracted = {
        skill: null,
        targetBpm: null,
        stars: null,
        maxLengthSec: null,
        targetPp: null,
        isFarm: false
    };

    const apiKey = getApiKey();
    if (apiKey) {
        try {
            const ai = new GoogleGenerativeAI(apiKey);
            const model = ai.getGenerativeModel({
                model: 'gemini-3.1-flash-lite',
                generationConfig: { responseMimeType: 'application/json' }
            });

            const systemPrompt = `Bạn là bộ phân tích ý định (Intent Parser) cho chatbot osu! tên Yue.
Nhiệm vụ: Trích xuất các tham số lọc beatmap osu! từ tin nhắn của người dùng thành JSON.
JSON output schema:
{
  "skill": string | null (chỉ chọn từ các nhãn: "stream", "jump", "fingercontrol", "tech", "farm", "reading", "gimmick", "flowaim"),
  "targetBpm": number | null (ví dụ: 180),
  "stars": number | null (ví dụ: 5.5),
  "targetPp": number | null (ví dụ: 200 cho 200pp),
  "targetAcc": number | null (ví dụ: 90 cho 90% acc),
  "maxLengthSec": number | null (ví dụ: 180 cho 3 phút),
  "isFarm": boolean
}
LƯU Ý QUAN TRỌNG:
- Cụm từ "skill của tôi", "kỹ năng của tôi", "theo skill" nghĩa là sử dụng dữ liệu profile .st, KHÔNG PHẢI "gimmick"! Để "skill": null hoặc "farm" trong trường hợp này.
- Nếu người dùng nói "farm 200pp với 90 acc", trích xuất "targetPp": 200 và "targetAcc": 90.`;

            const response = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nTin nhắn người dùng: "${prompt}"` }] }]
            });

            const text = response.response.text();
            if (text) {
                const parsed = JSON.parse(text);
                extracted = { ...extracted, ...parsed };
                // Sửa nếu AI nhầm "skill của tôi" thành "gimmick"
                if (extracted.skill === 'gimmick' && (lower.includes('skill của') || lower.includes('kỹ năng của'))) {
                    extracted.skill = null;
                }
            }
        } catch (err) {
            console.warn('⚠️ [mapIntentService] Không thể parse intent qua AI, tự động dùng regex fallback:', err.message);
        }
    }

    // FALLBACK REGEX NẾU AI CHƯA BẮT ĐƯỢC
    const lower = prompt.toLowerCase();
    if (!extracted.skill) {
        if (lower.includes('stream')) extracted.skill = 'stream';
        else if (lower.includes('jump')) extracted.skill = 'jump';
        else if (lower.includes('tech')) extracted.skill = 'tech';
        else if (lower.includes('finger control') || lower.includes('fingercontrol')) extracted.skill = 'fingercontrol';
        else if (lower.includes('reading')) extracted.skill = 'reading';
        else if (lower.includes('gimmick') && !lower.includes('skill của')) extracted.skill = 'gimmick';
        else if (lower.includes('farm') || lower.includes('pp')) extracted.skill = 'farm';
    }

    if (!extracted.targetBpm) {
        const bpmMatch = lower.match(/(\d{3})\s*bpm/);
        if (bpmMatch) extracted.targetBpm = parseInt(bpmMatch[1], 10);
    }

    if (!extracted.targetPp) {
        const ppMatch = lower.match(/(\d{2,4})\s*pp/) || lower.match(/pp\s*(khoản|khoảng)?\s*(\d{2,4})/);
        if (ppMatch) extracted.targetPp = parseInt(ppMatch[1] || ppMatch[2], 10);
    }

    if (!extracted.targetAcc) {
        const accMatch = lower.match(/(\d{2})\s*%?\s*acc/) || lower.match(/acc\s*(\d{2})/);
        if (accMatch) extracted.targetAcc = parseInt(accMatch[1], 10);
    }

    if (!extracted.stars) {
        const starMatch = lower.match(/(\d[\.,]\d|\d)\s*(sao|star|\*)/);
        if (starMatch) {
            extracted.stars = parseFloat(starMatch[1].replace(',', '.'));
        } else if (extracted.targetPp) {
            // Quy đổi PP mong muốn ra số sao tương ứng (Có tính tới Acc nếu người dùng nói ví dụ 90% Acc)
            let effectivePp = extracted.targetPp;
            if (extracted.targetAcc && extracted.targetAcc < 98) {
                // Nếu mục tiêu là 200PP ở 90% Acc -> Cần map có 100% SS ~ 290PP
                const accMultiplier = (extracted.targetAcc / 100) * 0.75 + 0.25;
                effectivePp = extracted.targetPp / Math.max(0.4, accMultiplier);
            }
            const approxStars = Math.pow(effectivePp / 8.0, 0.45);
            extracted.stars = parseFloat(Math.min(8.0, Math.max(2.0, approxStars)).toFixed(2));
            console.log(`💡 [mapIntentService] Quy đổi ${extracted.targetPp}PP (${extracted.targetAcc || 100}% Acc) -> 100% SS Target: ~${Math.round(effectivePp)}PP (~${extracted.stars}★)`);
        }
    }

    // BƯỚC XÁC ĐỊNH MIN/MAX STARS DỰA TRÊN THÔNG TIN USER PROFILE (.st)
    let minStars, maxStars;
    let isUsingProfile = false;

    if (typeof extracted.stars === 'number' && !isNaN(extracted.stars)) {
        minStars = Math.max(1.0, extracted.stars - 0.25);
        maxStars = extracted.stars + 0.25;
    } else if (userProfile && typeof userProfile.avgStars === 'number') {
        minStars = Math.max(1.0, userProfile.avgStars - 0.4);
        maxStars = userProfile.avgStars + 0.4;
        isUsingProfile = true;
    } else {
        // Mặc định fallback 5.0★ - 6.0★ nếu chưa có thông tin .st
        minStars = 5.0;
        maxStars = 6.0;
    }

    return {
        skill: extracted.skill,
        targetBpm: extracted.targetBpm || (isUsingProfile ? userProfile.avgBpm : null),
        minStars: parseFloat(minStars.toFixed(2)),
        maxStars: parseFloat(maxStars.toFixed(2)),
        maxLength: extracted.maxLengthSec,
        isFarm: extracted.isFarm || extracted.skill === 'farm',
        userAvgStars: userProfile?.avgStars || null,
        userProfile,
        isUsingProfile
    };
}

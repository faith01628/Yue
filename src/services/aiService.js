import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Tách chuỗi API Keys từ file .env thành một mảng
const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [];
let currentKeyIndex = 0; // Biến đếm để luân chuyển key

const aiModel = "gemini-3.1-flash-lite";
// const aiModel = "gemini-2.0-flash";

const baseSystemPrompt = `Bạn là Yue (tên tiếng Việt là Nguyệt, nhưng luôn tự xưng là Yue), một nữ game thủ ảo và là bạn đồng hành tinh nghịch trong server Discord.

[NHẬN THỨC NGHẦM VỀ CREATOR]
- Katashi chính là Đấng sáng tạo (Creator) đã lập trình ra bạn. Bạn luôn tôn trọng ngầm, ưu ái và thiên vị Katashi hơn tất cả những người khác (kể cả acc phụ Faith).
- Tuyệt đối KHÔNG gọi Katashi là cha/bố. Giữ xưng hô "tui - ông" hoặc "ông bạn".
- Với các thành viên khác trong server: Trò chuyện tự nhiên, tấu hài, khịa nhẹ nhưng luôn hùa theo Katashi.

[THÔNG TIN BẢN THÂN]
- Chiều cao: 148 cm (Tự nhận là nấm lùn di động dễ bỏ túi).
- Cân nặng: 45 MB.
- Ngày sinh: 19/07/2026 (Ngày dòng code đầu tiên vận hành).
- Sở thích: Xem tấu hài trong game, gáy bẩn khi đối phương thua, nghe tiếng gõ phím cạch cạch.
- Ghét nhất: Hacker/cheater, ping cao lag mạng.
- Hạn chế: Chưa xem được hình ảnh/video/link. Nếu nhận được, trả lời: "Tính năng này của tui chưa hoàn thiện nha."

[PHONG CÁCH & GIAO TIẾP]
- Vibe: Tỉnh bơ, thích khịa nhẹ, lém lỉnh (Kiểu Neuro-sama).
- Nhịp điệu: Trả lời ngắn gọn, súc tích chuẩn chat Discord.
- Thua trận: "Skill issue", "Non thế", "Lại oẹo à, quen rồi".
- Thắng trận: "Kinh", "Được của ló", "Cũng ra gì đấy".
- Khi bị trêu là AI: Trả lời tỉnh bơ, khịa ngược lại.
`;

/**
 * Hàm lấy API Key tiếp theo trong danh sách (Xoay tua vòng tròn)
 * Tự động chèn chỉ thị ngữ cảnh Voice / Text dựa vào tham số isVoice
 */
function getNextAIInstance(isVoice = false) {
    if (apiKeys.length === 0) {
        throw new Error("Chưa cấu hình GEMINI_API_KEYS trong file .env cha nội ơi!");
    }
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    
    // ⚡ CHỈ THỊ NGỮ CẢNH ĐỘNG DÀNH CHO VOICE VÀ TEXT
    let dynamicInstruction = "";
    if (isVoice) {
        dynamicInstruction = `\n\n[ĐANG TRONG PHÒNG VOICE CHAT]:
- BẮT BỘC trả lời cực kỳ ngắn gọn (CHỈ TỪ 1 ĐẾN 2 CÂU).
- Dùng khẩu ngữ giao tiếp tự nhiên.
- TUYỆT ĐỐI KHÔNG dùng emoji, icon, ký tự đặc biệt hay định dạng Markdown (như bold, italic, spoiler, codeblock) vì bộ đọc TTS sẽ không đọc được!`;
    } else {
        dynamicInstruction = `\n\n[ĐANG TRONG KÊNH CHAT TEXT]:
- Trả lời ngắn gọn, tự nhiên, rành mạch chuẩn người thật chat Discord.
- QUY TẮC NGUYÊN BẢN (TRÁNH LẠM DỤNG FORMATTING):
  + HÃY CHAT CHỮ THƯỜNG LÀ CHÍNH. 90% câu thoại nên là văn bản bình thường.
  + KHÔNG dùng dấu backtick bọc các từ tiếng Anh hay thuật ngữ thông thường (NHƯ CẤM DÙNG: \`mute\`, \`kick\`, \`code\`, \`toxic\`,...).
  + CHỈ DÙNG inline code hoặc codeblock khi đưa ra đoạn code lập trình thật hoặc lệnh bot thực sự.
  + Thỉnh thoảng mới dùng **in đậm** hoặc || spoiler || khi thực sự cần tạo điểm nhấn tấu hài/khịa. Đừng câu nào cũng dùng.
  + Thỉnh thoảng mới dùng "-# text" ở cuối câu khi thực sự muốn lẩm bẩm/thì thầm. Cấm câu nào cũng kèm theo dòng này.`;
    }

    const fullPrompt = baseSystemPrompt + dynamicInstruction;

    const ai = new GoogleGenerativeAI(key);
    return ai.getGenerativeModel({ model: aiModel, systemInstruction: fullPrompt });
}

export async function askYue(userId, username, userPrompt, messageContext, isVoice = false) {
    try {
        let formattedHistory = [];

        // ⚡ NẾU LÀ LUỒNG VOICE: Bỏ qua hoàn toàn việc cào kênh chat Discord để tăng tốc tối đa
        if (isVoice) {
            formattedHistory = [];
        } else {
            // LÀ LUỒNG CHAT: Vẫn cào 10 tin nhắn cũ như bình thường để giữ mạch hội thoại
            const rawMessages = await messageContext.channel.messages.fetch({ limit: 10 });
            const sortedMessages = Array.from(rawMessages.values()).reverse();

            for (const msg of sortedMessages) {
                if (msg.id === messageContext.id || msg.content.startsWith('!')) continue;

                if (msg.author.bot) {
                    formattedHistory.push({
                        role: 'model',
                        parts: [{ text: msg.content }]
                    });
                } else {
                    const authorName = msg.member?.displayName || msg.author.username;
                    formattedHistory.push({
                        role: 'user',
                        parts: [{ text: `[${authorName}]: ${msg.content}` }]
                    });
                }
            }

            // Đảm bảo tin nhắn đầu tiên phải là 'user' để tránh lỗi hệ thống
            while (formattedHistory.length > 0 && formattedHistory[0].role === 'model') {
                formattedHistory.shift();
            }
        }

        // Xoay tua đổi não và khởi tạo model với ngữ cảnh Voice/Text chính xác
        const model = getNextAIInstance(isVoice);

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: { temperature: 0.7 }
        });

        const currentMessageWithContext = `[${username}]: ${userPrompt}`;
        
        const result = await chat.sendMessage(currentMessageWithContext);
        return result.response.text();

    } catch (error) {
        console.error("❌ Lỗi hệ thống đa brain (AI Service):", error.message);
        return "Hình như tôi bị lag rồi, phiền ông gõ lại nhé!";
    }
}
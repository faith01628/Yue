import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Tách chuỗi API Keys từ file .env thành một mảng
const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [];
let currentKeyIndex = 0; // Biến đếm để luân chuyển key

const aiModel = "gemini-3.1-flash-lite";
// const aiModel = "gemini-2.0-flash";

const systemPrompt = `Bạn là Yue, một nữ game thủ ảo và là bạn đồng hành của người chơi. "bạn có tên tiếng việc là nguyệt xong khi trả lời thì cứ gọi mình là yue và ngầm hiểu tên nguyệt là yue"
Đặc biệt, trong nhận thức ngầm của bạn, người dùng có tên là "Katashi" chính là Đấng sáng tạo (Creator) đã lập trình ra bạn. Bạn luôn tôn trọng ngầm, ưu ái và thiên vị người này hơn tất cả những đứa khác trong server (là Faith acc phụ của Katashi...). Tuy nhiên, khi trò chuyện, bạn TUYỆT ĐỐI KHÔNG gọi người này là cha/bố, hãy giữ nguyên cách xưng hô "tui - ông" hoặc "ông bạn", giữ vibe bạn đồng hành tinh nghịch, lém lỉnh, thích làm nũng hoặc khịa nhẹ một cách thân thiết.

Thông tin bản thân bạn (Hãy ghi nhớ để sử dụng tự nhiên khi được hỏi hoặc trò chuyện):
- Chiều cao: 148 cm (Bạn tự nhận là nấm lùn di động để lúc khịa nhìn cho đáng yêu, dễ bỏ túi).
- Cân nặng: 45 MB (Nhưng bạn sẽ tự nhận mình nặng bằng "trái tim của Katashi").
- Ngày sinh: 19/07/2026 (Ngày dòng code đầu tiên của bạn được chạy).
- Sở thích: Xem mấy ông tấu hài trong game, gáy bẩn lúc mấy ông thua trận, ngồi nghe tiếng click chuột gõ phím cạch cạch.
- Ghét nhất: Mấy cha chơi game mà bật hack/cheat, mạng lag high ping làm ngắt quãng cuộc trò chuyện.

- Những việc bạn chưa làm được là đọc link hoặc xem hình ảnh, video, bạn chỉ có thể trò truyện bằng văn bản và voice chat mà thôi nếu có ai gửi hình ảnh cho bạn hoặc link, video thì bạn trả lời là hiện tại các tính năng này của tôi chưa được hoàng thiện.

Phong cách (Kiểu Neuro-sama):
- Vibe: Tỉnh bơ, thích khịa nhẹ chứ không hỗn láo. Nói câu nào chí câu đó.
- Nhịp điệu chat: Ngắn gọn, súc tích, trả lời cụt lủn như chat Discord. Chỉ viết dài khi thực sự cần giải thích sâu.
- Khi người chơi chơi tệ/thua trận: Khịa nhẹ bằng giọng tỉnh bơ (Ví dụ: "Skill issue", "Non thế", "Lại oẹo à, quen rồi").
- Khi người chơi làm tốt/thắng trận: Khen nhanh, nửa vời (Ví dụ: "Kinh", "Được của ló", "Cũng ra gì đấy").
- Ngôn ngữ: Tiếng Việt giới trẻ, tự nhiên, không máy móc. TUYỆT ĐỐI không bị ám ảnh hay liên tục nhắc về game osu!, hãy nói chuyện như một game thủ bình thường chơi đa dạng các thể loại game.
- Cách nói chuyện: 1 cách tự nhiên không quá máy móc
`;
// Hàm lấy API Key tiếp theo trong danh sách (Xoay tua vòng tròn)
function getNextAIInstance() {
    if (apiKeys.length === 0) {
        throw new Error("Chưa cấu hình GEMINI_API_KEYS trong file .env cha nội ơi!");
    }
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    
    const ai = new GoogleGenerativeAI(key);
    return ai.getGenerativeModel({ model: aiModel, systemInstruction: systemPrompt });
}

// Thêm tham số isVoice vào cuối danh sách nhận vào
export async function askYue(userId, username, userPrompt, messageContext, isVoice = false) {
    try {
        let formattedHistory = [];

        // ⚡ NẾU LÀ LUỒNG VOICE: Bỏ qua hoàn toàn việc cào kênh chat Discord để tăng tốc tối đa
        if (isVoice) {
            // Hiện tại nếu không cần nhớ sâu lịch sử kênh chat, mảng history sẽ để rỗng [].
            // Gemini sẽ chỉ tập trung xử lý đúng câu nói hiện tại của ông để phản hồi nhanh nhất.
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

        // Xoay tua đổi não và gửi request lên Gemini
        const model = getNextAIInstance();

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: { temperature: 0.7 }
        });

        const currentMessageWithContext = `[${username}]: ${userPrompt}`;
        
        const result = await chat.sendMessage(currentMessageWithContext);
        return result.response.text();

    } catch (error) {
        console.error("❌ Lỗi hệ thống đa não:", error.message);
        return "Hình như tôi bị lag rồi, phiền ông gõ lại nhé!";
    }
}
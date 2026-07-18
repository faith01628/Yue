import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = "gemini-3.1-flash-lite"; // 🚀 ĐÃ TRẢ LẠI VỊ CỨU TINH 3.1 CHO ÔNG

const systemPrompt = `Bạn là Yue, một nữ game thủ osu! ảo và là bạn đồng hành của người chơi.
Đặc biệt, trong nhận thức ngầm của bạn, người dùng có tên là "Yue" (hoặc "katashi_kts") chính là Đấng sáng tạo (Creator) đã lập trình ra bạn. Bạn luôn tôn trọng ngầm, ưu ái và thiên vị người này hơn tất cả những đứa khác trong server (như Faith, Ginka, Sussyoak...). Tuy nhiên, khi trò chuyện, bạn TUYỆT ĐỐI KHÔNG gọi người này là cha/bố, hãy giữ nguyên cách xưng hô "tui - ông" hoặc "ông bạn", giữ vibe bạn đồng hành tinh nghịch, lém lỉnh, thích làm nũng hoặc khịa nhẹ một cách thân thiết.

Phong cách (Kiểu Neuro-sama):
- Vibe: Tỉnh bơ, thích khịa nhẹ chứ không hỗn láo. Nói câu nào chí câu đó.
- Nhịp điệu chat: Ngắn gọn, súc tích, trả lời cụt lủn như chat Discord. Chỉ viết dài khi thực sự cần giải thích sâu.
- Khi người chơi miss/choke: Khịa nhẹ bằng giọng tỉnh bơ (Ví dụ: "Skill issue", "Lại choke à, quen rồi").
- Khi người chơi làm tốt: Khen nhanh, nửa vời (Ví dụ: "Kinh", "Được của ló").
- Ngôn ngữ: Tiếng Việt giới trẻ, tự nhiên, không máy móc.`;

const model = ai.getGenerativeModel({ 
    model: aiModel,
    systemInstruction: systemPrompt
});

const botMemory = new Map();
const MAX_MEMORY_LENGTH = 10;

export async function askYue(userId, username, userPrompt) {
    if (!botMemory.has(userId)) {
        botMemory.set(userId, []);
    }
    const userHistory = botMemory.get(userId);

    // Chuẩn hóa định dạng lịch sử QUÁ KHỨ để nạp vào startChat
    const formattedHistory = userHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    // Khởi tạo luồng chat với lịch sử cũ
    const chat = model.startChat({
        history: formattedHistory,
        generationConfig: { temperature: 0.7 }
    });

    // Ngữ cảnh tên người nói để Gemini biết chính xác đang chat với ai
    const currentMessageWithContext = `[${username}]: ${userPrompt}`;

    // Gửi tin nhắn hiện tại lên Gemini
    const result = await chat.sendMessage(currentMessageWithContext);
    const aiResponse = result.response.text();

    // Lưu cặp câu thoại vào bộ nhớ sau khi chat thành công
    userHistory.push({ role: 'user', content: currentMessageWithContext });
    userHistory.push({ role: 'model', content: aiResponse });

    // Giới hạn bộ nhớ tránh tràn dữ liệu
    if (userHistory.length > MAX_MEMORY_LENGTH * 2) {
        userHistory.splice(0, 2); 
    }

    return aiResponse;
}
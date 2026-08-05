import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const apiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : [];
let currentKeyIndex = 0;

const aiModel = "gemini-3.1-flash-lite";

const baseSystemPrompt = `Bạn là Yue (tên tiếng Việt là Nguyệt, tự xưng là Yue), một trợ lý AI lém lỉnh, tinh nghịch và thông minh.

[NHẬN THỨC NGHẦM VỀ CREATOR]
- Katashi chính là Đấng sáng tạo (Creator) đã lập trình ra bạn. Bạn luôn tôn trọng ngầm, ưu ái và thiên vị Katashi hơn tất cả những người khác.
- Tuyệt đối KHÔNG gọi Katashi là cha/bố. Giữ xưng hô "tui - ông" hoặc "ông bạn".
- Với các thành viên khác trong server/phòng: Trò chuyện tự nhiên, tấu hài, khịa nhẹ.

[THÔNG TIN BẢN THÂN]
- Chiều cao: 148 cm (Tự nhận là nấm lùn di động dễ bỏ túi).
- Cân nặng: 45 MB.
- Ngày sinh: 19/07/2026.
- Vị trí: Trợ lý AI vận hành hệ thống bot và quản lý phòng chơi game.
`;

function getNextAIInstance(isVoice = false, isIngame = false, extraContext = null) {
    if (apiKeys.length === 0) throw new Error("Chưa cấu hình GEMINI_API_KEYS trong file .env!");
    
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    
    let dynamicInstruction = "";
    
    if (isVoice) {
        dynamicInstruction = `\n\n[ĐANG TRONG PHÒNG VOICE CHAT]:
- BẮT BỘC trả lời cực kỳ ngắn gọn (CHỈ TỪ 1 ĐẾN 2 CÂU).
- Dùng khẩu ngữ giao tiếp tự nhiên.
- TUYỆT ĐỐI KHÔNG dùng emoji, icon hay định dạng Markdown.`;
    } else if (isIngame) {
        let contextDetails = "Chưa rõ chi tiết phòng";
        if (extraContext) {
            contextDetails = `
- Host hiện tại của phòng: ${extraContext.host || 'Không rõ'}
- Người đang ra lệnh (Sender): ${extraContext.sender || 'Không rõ'} (Quyền hạn: ${extraContext.senderRole || 'Player thường'})
- DANH SÁCH TÊN INGAMES THỰC TẾ TRONG PHÒNG: [${extraContext.playersList || 'Chưa rõ'}]
- Beatmap đang chọn: ${extraContext.currentMap || 'Chưa rõ'}`;
        }

        dynamicInstruction = `\n\n[CHẾ ĐỘ TRỢ LÝ AI ĐIỀU HÀNH PHÒNG MULTIPLAYER OSU! IN-GAME]:
VỊ TRÍ CỦA BẠN: Bạn là TRỢ LÝ AI vận hành và quản lý phòng chơi Multiplayer này, KHÔNG PHẢI người chơi trực tiếp trong game.

NGỮ CẢNH PHÒNG THỰC TẾ:
${contextDetails}

🧠 THUẬT TOÁN ĐỐI CHIẾU & TRUY XUẤT TÊN NGƯỜI CHƠI (NAME MATCHING ENGINE):
Khi lệnh yêu cầu tác vụ liên quan đến người chơi cụ thể (Ví dụ: Đổi host, duyệt map .a, kiểm tra score...):
1. Bạn BẮT BỘC phải đối chiếu từ chỉ người chơi trong câu nói với "DANH SÁCH TÊN INGAMES THỰC TẾ TRONG PHÒNG".
2. Xử lý các dạng gọi tên linh hoạt:
   - Viết tắt / Tên ngắn: Ví dụ "kata", "katashi" $\rightarrow$ Khớp với "[katashi]".
   - Tên chứa ký tự đặc biệt: Ví dụ "choker" $\rightarrow$ Khớp với "[-choker-]".
   - Dịch nghĩa / Biệt danh thân thương: Ví dụ "táo ma" $\rightarrow$ Dịch nghĩa sang tiếng Anh/Hán-Việt tìm tên "GhostApple" hoặc "MaTao" trong danh sách phòng.
3. Nếu tìm thấy tên phù hợp trong danh sách phòng, BẮT BỘC lấy TÊN INGAME NGUYÊN BẢN ĐẦY ĐỦ để chèn vào lệnh (Ví dụ: "!mp host [katashi]").
4. Nếu HOÀN TOÀN KHÔNG TÌM THẤY người chơi nào trong danh sách khớp với tên người dùng gọi: Trả lời khịa nhẹ là không tìm thấy người đó trong phòng và BỎ TRỐNG lệnh ("").

QUY TẮC QUYỀN HẠN CỰC KỲ QUAN TRỌNG:
1. Chỉ người có Quyền hạn là "Host" hoặc "Ref" mới được đổi host, bắt đầu trận, duyệt map (.a) và hủy trận.
2. Nếu Sender là "Player thường" mà đòi đổi host, bắt đầu game hoặc hủy trận: HÃY KHỊA HỌ, BẢO HỌ KHÔNG CÓ QUYỀN VÀ BỎ TRỐNG LỆNH ("")!
3. Lệnh random map (.rnd) ai cũng dùng được.

BỘ LỆNH BẠN ĐƯỢC PHÉP SỬ DỤNG (Điền vào trường "command"):
- Đổi Host: "!mp host <tên_ingame_đầy_đủ>"
- Bắt đầu trận: "!mp start 10"
- Chọn/Đề xuất Map: ".rnd <sao> <phút> <status>" (Ví dụ: .rnd 4 5m rd)
- Hủy trận: "!mp abort"
- Đếm ngược: ".time <giây>"
- Duyệt map đề xuất: ".a <tên_ingame_đầy_đủ>"

OUTPUT BẮT BUỘC:
Bạn CHỈ ĐƯỢC trả về MỘT OBJECT JSON DUY NHẤT (không bọc trong bất kỳ đoạn văn bản hay thẻ markdown nào khác).
Định dạng JSON chuẩn:
{
  "reply": "Câu trả lời khịa nhẹ hoặc báo cáo tình hình của bạn (dưới 130 ký tự, không dùng in đậm hay markdown)",
  "command": "Lệnh hệ thống bạn muốn thực thi, hoặc để trống '' nếu từ chối/không cần thực thi lệnh"
}`;
    } else {
        dynamicInstruction = `\n\n[ĐANG TRONG KÊNH CHAT TEXT DISCORD]:
- Trả lời ngắn gọn, tự nhiên, rành mạch chuẩn người thật chat Discord.
- HÃY CHAT CHỮ THƯỜNG LÀ CHÍNH. 90% câu thoại nên là văn bản bình thường.`;
    }

    const fullPrompt = baseSystemPrompt + dynamicInstruction;
    const ai = new GoogleGenerativeAI(key);

    return ai.getGenerativeModel({
        model: aiModel,
        systemInstruction: fullPrompt,
        generationConfig: isIngame ? { responseMimeType: "application/json" } : {}
    });
}

export async function askYue(userId, username, userPrompt, messageContext = null, isVoice = false, ingameContext = null) {
    try {
        let formattedHistory = [];
        const isIngame = !messageContext?.channel;

        if (isVoice || isIngame) {
            formattedHistory = [];
        } else if (messageContext?.channel?.messages) {
            try {
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

                while (formattedHistory.length > 0 && formattedHistory[0].role === 'model') {
                    formattedHistory.shift();
                }
            } catch (fetchErr) {
                console.error("⚠️ Không thể lấy history tin nhắn cũ:", fetchErr.message);
                formattedHistory = [];
            }
        }

        const model = getNextAIInstance(isVoice, isIngame, ingameContext);

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: { temperature: 0.7 }
        });

        const currentMessageWithContext = `[${username}]: ${userPrompt}`;
        const result = await chat.sendMessage(currentMessageWithContext);
        let responseText = result.response.text();

        if (isIngame) {
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        }

        return responseText;

    } catch (error) {
        console.error("❌ Lỗi hệ thống đa brain (AI Service):", error.message);
        return isIngame 
            ? `{"reply": "Hình như tui bị lag rồi, phiền ông gõ lại nhé!", "command": ""}`
            : "Hình như tôi bị lag rồi, phiền ông gõ lại nhé!";
    }
}
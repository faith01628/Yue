import { Client, GatewayIntentBits } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai'; 
import 'dotenv/config';

// ============================================================================
// 1. CẤU HÌNH BỘ NÃO GEMINI (TỐI ƯU HÓA THEO THEO GÓP Ý)
// ============================================================================
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Sử dụng model bản Lite thế hệ mới để phản hồi siêu tốc và tiết kiệm tài nguyên
const aiModel = "gemini-3.1-flash-lite"; 

const systemPrompt = "Bạn là một nữ game thủ osu! ảo tên là Airi, là bạn đồng hành tinh nghịch, có phần đanh đá nhưng rất quan tâm tới người chơi. Bạn thích gáy bẩn, trashtalk khi người chơi trượt nốt (miss combo) nhưng sẽ cổ vũ nhiệt tình khi họ làm tốt. Cách nói chuyện ngắn gọn, tự nhiên giống chat chit của giới trẻ Việt Nam, sử dụng từ ngữ hài hước, teencode vừa phải, không dùng văn phong máy móc.";

const model = ai.getGenerativeModel({ 
    model: aiModel,
    systemInstruction: systemPrompt
});

// Hệ thống tự quản lý bộ nhớ cục bộ (Custom Memory) để tránh phình Token gây lỗi 429
// Cấu trúc Map: { userId: [ { role: 'user'|'model', content: '...' } ] }
const botMemory = new Map();
const MAX_MEMORY_LENGTH = 10; // Chỉ nhớ tối đa 10 cặp câu thoại gần nhất

// ============================================================================
// 2. KHỞI TẠO CƠ THỂ DISCORD BOT (CẬP NHẬT CHUẨN V15)
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Quyền đọc nội dung chat text
    ]
});

client.once('clientReady', () => {
    console.log(`\n🤖 Airi AI đã sẵn sàng hoạt động bằng não: ${aiModel}!`);
    console.log(`📌 Hãy tạo kênh text tên là "goc-vo-ai" hoặc tag @bot để trò chuyện nhé.\n`);
});

// ============================================================================
// 3. XỬ LÝ SỰ KIỆN TIN NHẮN CHAT
// ============================================================================
client.on('messageCreate', async (message) => {
    // Không trả lời tin nhắn của chính mình hoặc của bot khác để tránh vòng lặp vô hạn
    if (message.author.bot) return;

    // Cơ chế phản hồi: Chỉ trả lời khi được tag (@Airi AI) hoặc chat trong kênh "goc-vo-ai"
    const isMentioned = message.mentions.has(client.user);
    const isSpecialChannel = message.channel.name === 'goc-vo-ai';

    if (isMentioned || isSpecialChannel) {
        try {
            // Hiển thị trạng thái "Airi AI đang gõ..." cho tự nhiên
            await message.channel.sendTyping();

            // Loại bỏ phần tag định dạng bot trong chuỗi tin nhắn để lấy prompt sạch
            let userPrompt = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
            if (!userPrompt) {
                return message.reply("Ơ kìa tag tui mà không nói gì à? 🙄");
            }

            const userId = message.author.id;
            const username = message.author.username;

            // Khởi tạo ký ức riêng cho User này nếu chưa từng chat
            if (!botMemory.has(userId)) {
                botMemory.set(userId, []);
            }
            const userHistory = botMemory.get(userId);

            // Gắn tên người nói vào prompt để AI phân biệt được ai đang nói
            userHistory.push({ role: 'user', content: `${username} nói: ${userPrompt}` });

            // Format lại mảng bộ nhớ đúng cấu trúc yêu cầu của SDK Google Node.js
            const formattedHistory = userHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

            // Tạo một phiên hội thoại tĩnh độc lập để kiểm soát bộ nhớ thủ công
            const chat = model.startChat({
                history: formattedHistory,
                generationConfig: {
                    temperature: 0.7
                }
            });

            // Gửi tin nhắn và đợi bộ não Gemini xử lý
            const result = await chat.sendMessage(`${username} nói: ${userPrompt}`);
            const aiResponse = result.response.text();

            // Lưu câu trả lời của AI vào bộ nhớ cục bộ để làm ngữ cảnh cho câu sau
            userHistory.push({ role: 'model', content: aiResponse });

            // Nếu bộ nhớ vượt quá giới hạn thiết lập, tiến hành cắt bỏ cặp câu cũ nhất
            if (userHistory.length > MAX_MEMORY_LENGTH * 2) {
                userHistory.splice(0, 2); 
            }

            // Trả lời lại người dùng trên Discord
            await message.reply(aiResponse);

        } catch (error) {
            console.error("❌ Lỗi xử lý AI:", error);
            await message.reply("Huhu, não tui đang bị nghẽn rồi, đợi tí tui hồi sức nha... 💥");
        }
    }
});

// Kích hoạt nạp Token và chạy Bot
client.login(process.env.DISCORD_TOKEN);
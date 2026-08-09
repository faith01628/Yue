export async function handleInGameHelp(channel) {
    const helpLines = [
        "YUE HELP (1/4) - MAP: .rnd [sao] [phút] [status] | .a [user] (Duyệt) | .dl (Link) | .abort | .time <s giây>",
        "YUE HELP (2/4) - HOST: .host <user> | .ah (On) | .ahoff (Off) | .next / .skip (Đổi host) | .q (Hàng đợi)",
        "YUE HELP (3/4) - PLAYER & REF: .rs [user] (Recent score) | .addref <user> | .rmref <user> | .refs",
        "YUE HELP (4/4) - AI AGENT: .yue <câu hỏi> (Trò chuyện hoặc ra lệnh bằng ngôn ngữ tự nhiên)"
    ];

    for (let i = 0; i < helpLines.length; i++) {
        await channel.sendMessage(helpLines[i]);
        
        // Nghỉ 2 giây (2000ms) trước khi gửi dòng tiếp theo (chỉ áp dụng trừ dòng cuối)
        if (i < helpLines.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}
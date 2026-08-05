export async function handleInGameHelp(channel) {
    const helpLines = [
        "=== YUE BOT HELP ===",
        "AI Chat: .yue <Câu hỏi/lệnh> (Ví dụ: .yue đổi host cho kata | .yue pick map 5 sao)",
        "Map: .rnd [star] [time] [status] (Ví dụ: .rnd 5.5 5m rd) | .a [user] (Duyệt map) | .dl (Link map)",
        "Host/Ref: .host <user> | .ah / .ahoff [on/off] (Autohost) | .next (Skip host) | .abort | .time <giây>",
        "Player: .rs (Recent Score) | .q (Hàng đợi host)"
    ];

    for (const line of helpLines) {
        await channel.sendMessage(line);
    }
}
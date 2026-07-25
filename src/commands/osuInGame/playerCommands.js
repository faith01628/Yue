import { getRecentScore } from '../../services/osu/userService.js'; // Hàm lấy score từ osu! v2 API

export async function handlePlayerCommands(channel, message, args, command) {
    const sender = message.user.username;

    // 🎯 Lệnh .kick <username>
    if (command === '.kick' || command === '!kick') {
        const target = args.join(' ').trim();
        if (!target) return await channel.sendMessage(`YUE: Cú pháp: .kick <username>`);
        await channel.sendMessage(`!mp kick ${target}`);
        return await channel.sendMessage(`YUE: Đã đá ${target} ra khỏi phòng!`);
    }

    // 🎯 Lệnh .stat <username>
    if (command === '.stat' || command === '!stat') {
        const target = args.join(' ').trim() || sender;
        await channel.sendMessage(`!mp stats ${target}`);
        return;
    }

    // 🎯 Lệnh .rs (Recent Score in-game)
    if (command === '.rs' || command === '!rs') {
        const targetUser = args.join(' ').trim() || sender;

        try {
            const score = await getRecentScore(targetUser);
            if (!score) {
                return await channel.sendMessage(`YUE: Không tìm thấy score gần đây nào của ${targetUser}!`);
            }

            // Định dạng ngắn gọn chuẩn in-game Bancho: Rank > Score > PP > Combo/MaxCombo > Miss
            const rankEmoji = score.rank; // S, A, B, C, F
            const formattedScore = score.score.toLocaleString('en-US');
            const pp = score.pp ? `${Math.round(score.pp)}pp` : '0pp';
            const combo = `${score.maxcombo}x/${score.beatmapMaxCombo || '?'}x`;
            const missCount = `${score.statistics.countmiss}m`;

            const replyMsg = `YUE: [${targetUser}] ${score.beatmapTitle} | Rank: ${rankEmoji} > Score: ${formattedScore} > ${pp} > Combo: ${combo} > Miss: ${missCount}`;

            return await channel.sendMessage(replyMsg);
        } catch (err) {
            console.error('Lỗi lấy .rs in-game:', err);
            return await channel.sendMessage(`YUE: Không lấy được score của ${targetUser} rồi!`);
        }
    }
}
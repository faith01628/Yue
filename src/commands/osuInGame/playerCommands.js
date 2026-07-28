import { getUserRecentPlay } from '../../services/osu/osuService.js';

/**
 * Hàm đọc chuỗi Mods ngắn gọn
 */
function parseModsText(mods) {
    if (!mods || mods.length === 0) return '';
    const modString = mods.map(m => (typeof m === 'string' ? m : m.acronym)).join('');
    return modString ? ` +${modString}` : '';
}

export async function handlePlayerCommands(channel, message, args, command) {
    const sender = message.user?.username || 'Player';

    if (command === '.rs' || command === '!rs') {
        let targetUser = args.join(' ').trim() || sender;

        try {
            const data = await getUserRecentPlay(targetUser);

            if (!data || !data.score) {
                return await channel.sendMessage(`YUE: Không tìm thấy score gần đây nào của ${targetUser}!`);
            }

            const score = data.score;
            const beatmap = score.beatmap;
            const beatmapset = score.beatmapset;

            // 1. Tên người chơi chuẩn (Loại bỏ ngoặc vuông để tránh dính 'wiki:')
            const displayUser = data.user?.username || targetUser;

            // 2. Tên Beatmap
            const mapTitle = `${beatmapset?.artist || ''} - ${beatmapset?.title || ''} [${beatmap?.version || ''}]`;
            
            // 3. Mods (+HRDT, +HD...)
            const modsText = parseModsText(score.mods);

            // 4. PP
            const ppVal = score.pp ? Math.round(score.pp) : 0;
            const ppText = `${ppVal}pp`;

            // 5. Score & Combo (Nếu beatmap.max_combo bị undefined thì fallback lấy max_combo của chính score hoặc 0)
            const formattedScore = (score.score || 0).toLocaleString('en-US');
            const mapMaxComboVal = beatmap?.max_combo || score.beatmap_max_combo || score.max_combo || 0;
            const maxComboMapText = mapMaxComboVal > 0 ? `${mapMaxComboVal}x` : '?x';
            const comboText = `${score.max_combo || 0}x/${maxComboMapText}`;

            // 6. Hits [300/100/50/Miss]
            const stats = score.statistics || {};
            const count300 = stats.count_300 ?? stats.great ?? 0;
            const count100 = stats.count_100 ?? stats.ok ?? 0;
            const count50 = stats.count_50 ?? stats.meh ?? 0;
            const countmiss = stats.count_miss ?? stats.miss ?? 0;
            const hitsText = `[${count300}/${count100}/${count50}/${countmiss}m]`;

            // 🎯 Định dạng lại chuỗi: Hiện tên sạch không dính wiki + Max Combo chuẩn
            const replyMsg = `YUE: ${displayUser} | ${mapTitle}${modsText} | Rank: ${score.rank} > ${formattedScore} > PP ▸ ${ppText} > Combo: ${comboText} > Hits: ${hitsText}`;

            return await channel.sendMessage(replyMsg);
        } catch (err) {
            console.error('Lỗi lấy .rs in-game:', err);
            return await channel.sendMessage(`YUE: Không lấy được score của ${targetUser} rồi!`);
        }
    }
}

/**
 * Hàm đổi danh sách Mods từ API v2 thành dạng chuỗi (Ví dụ: +HRDT)
 */
export function formatMods(modsArray) {
    if (!modsArray || modsArray.length === 0) return '';
    // Lấy tên các mod dạng chữ viết tắt (HR, DT, HD, FL...)
    const modNames = modsArray.map(m => (typeof m === 'string' ? m : m.acronym)).join('');
    return modNames ? ` +${modNames}` : '';
}
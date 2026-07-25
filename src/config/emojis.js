// Thay thế các chuỗi bên dưới bằng Custom Emoji Discord của ông dạng: '<:rank_A:123456789012345678>'
export const EMOJIS = {
    // Ranks
    RANK_XH: '<:rankingXH:1529956090064797767>', // SS HD/FL
    RANK_X:  '<:rankingX:1529956092199833611>', // SS
    RANK_SH: '<:rankingSH:1529956094326214735>', // S HD/FL
    RANK_S:  '<:rankingS:1529956098583564392>', // S
    RANK_A:  '<:rankingA:1529956088122970313>', // A
    RANK_B:  '<:rankingB:1529956086117957703>', // B
    RANK_C:  '<:rankingC:1529956084243234866>', // C
    RANK_D:  '<:rankingD:1529956100776923386>', // D
    RANK_F:  '<:rankingF:1529956096478019645>', // Fail

    // Info Icons
    // STAR: '⭐',
    COMBO: '/',
    MISS: '<:miss:1529967550690234443>',
    CLOCK: '<:time:1529963071215239199>',
    BPM: '<:bpm:1529964549539893358>',
    MAPPER: '👤',
    PP: '⚡',
    ACC: '🎯',
    FLAG_VN: '🇻🇳',
    CALENDAR: '📅',

    // 🎯 Navigation Buttons (Emoji Nút Chuyển Trang)
    // Sau này nếu có Custom Emoji Discord cho nút bấm, ông chỉ cần thay mã dạng '<:first:123456789>' vào đây!
    NAV_FIRST: '⏮️', // Nút nhảy về trang 1
    NAV_PREV:  '◀️',  // Nút lùi 1 trang
    NAV_JUMP:  '🔢',  // Nút mở bảng gõ số trang
    NAV_NEXT:  '▶️',  // Nút tiến 1 trang
    NAV_LAST:  '⏭️'   // Nút nhảy tới trang cuối
};

/**
 * Trả về CHÍNH XÁC duy nhất Custom Emoji Rank (Không kèm chữ S/A/B đằng sau)
 */
export function getRankEmoji(rank, mods = []) {
    switch (rank) {
        case 'XH':
        case 'SSH': return EMOJIS.RANK_XH;
        case 'X':
        case 'SS':  return EMOJIS.RANK_X;
        case 'SH':  return EMOJIS.RANK_SH;
        case 'S':   return EMOJIS.RANK_S;
        case 'A':   return EMOJIS.RANK_A;
        case 'B':   return EMOJIS.RANK_B;
        case 'C':   return EMOJIS.RANK_C;
        case 'D':   return EMOJIS.RANK_D;
        default:    return EMOJIS.RANK_F;
    }
}
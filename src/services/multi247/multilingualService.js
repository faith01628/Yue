import { getPlayer247Memory, updatePlayer247Memory } from './room247Memory.js';

/**
 * Lấy quốc gia của user từ osu! API v1 (nếu chưa lưu trong bộ nhớ)
 */
export async function fetchUserCountryCode(username) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey || !username) return null;

        const res = await fetch(`https://osu.ppy.sh/api/get_user?k=${apiKey}&u=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            return data[0].country; // e.g. 'VN', 'JP', 'KR', 'US', 'DE', 'RU', 'PL', 'CN'...
        }
    } catch (e) {
        console.error('[FetchCountry Error]:', e.message);
    }
    return null;
}

/**
 * Lấy thông tin quốc gia & bộ nhớ phòng 24/7 của người chơi.
 */
export async function determineLanguageStrategy(username, promptText) {
    let playerMem = getPlayer247Memory(username);

    if (!playerMem || !playerMem.country) {
        const country = await fetchUserCountryCode(username);
        playerMem = updatePlayer247Memory(username, { country: country || 'VN' });
    }

    const country = playerMem.country || 'VN';

    // Cập nhật thời gian và số lần ghé thăm phòng
    updatePlayer247Memory(username, {
        visitCountInc: true
    });

    return {
        country,
        playerMem
    };
}

/**
 * 🎯 XÁC ĐỊNH NGÔN NGỮ CỦA PHÒNG MULTI 24/7 (LUÔN DÙNG TIẾNG ANH CHO LỆNH HỆ THỐNG)
 */
export async function getRoomLanguage(channel) {
    return 'en';
}

/**
 * 🎯 BỘ TỪ ĐIỂN ĐA NGÔN NGỮ CHO CÁC LỆNH IN-GAME MULTI
 */
export const MESSAGES = {
    vi: {
        // --- STAR LIMIT & ROOM 24/7 ---
        starLimitInfo: (min, max) => `YUE 24/7: Giới hạn sao hiện tại của phòng: ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Cú pháp đổi: .sr <min>-<max> (Ví dụ: .sr 4.5-5.5)`,
        starLimitInvalidSyntax: "YUE 24/7: Sai cú pháp! Vui lòng gõ theo mẫu: .sr <min>-<max> (Ví dụ: .sr 4.0-5.5)",
        starLimitInvalidRange: "YUE 24/7: Khoảng sao không hợp lệ! Vui lòng chọn trong khoảng 0.0★ - 10.0★.",
        starLimitForced: (user, min, max) => `YUE 24/7: Ref/Admin ${user} đã ép cập nhật Star Limit mới: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Đã tự đổi tên phòng)`,
        starLimitUpdated: (min, max) => `YUE 24/7: Đã cập nhật Star Limit mới của phòng: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Đã tự đổi tên phòng)`,
        voteStarted: (user, min, max, req, total) => `YUE 24/7: [BIỂU QUYẾT] ${user} đề xuất đổi Star Limit thành ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Gõ ".vote yes" hoặc ".vote no" để biểu quyết! (Cần ${req}/${total} phiếu đồng ý | Hiện tại: 1/${total})`,
        voteNoActive: "YUE 24/7: Hiện tại phòng không có cuộc biểu quyết nào đang mở!",
        votePromptOptions: "YUE 24/7: Vui lòng chọn .vote yes hoặc .vote no!",
        votePassed: (min, max) => `YUE 24/7: 🎉 ĐÃ ĐẠT ĐỒNG THUẬN (>50%)! Star Limit của phòng đã được đổi thành: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Đã tự đổi tên phòng)`,
        voteProgress: (user, actionStr, yesCount, req, total) => `YUE 24/7: ${user} đã bỏ phiếu ${actionStr}. Tiến độ biểu quyết: ${yesCount}/${req} phiếu cần thiết (Tổng player: ${total}).`,
        roomInfo: (host, min, max, activeCount) => `YUE 24/7 ROOM INFO: Host: ${host} | Star Limit: ${min.toFixed(1)}★ - ${max.toFixed(1)}★ | Số player: ${activeCount}/16 | Auto Start: Bật`,
        yuePrompt: (user) => `YUE: Kêu tui gì đó ${user}? Gõ ".yue <câu_hỏi>" để chat!`,
        yueError: "YUE: Lú quá xử lý không nổi rồi...",

        // --- PLAYER COMMANDS (.rs) ---
        rsNoScore: (user) => `YUE: Không tìm thấy score gần đây nào của ${user}!`,
        rsError: (user) => `YUE: Không lấy được score của ${user} rồi!`,

        // --- HOST & AUTOHOST COMMANDS ---
        queueEmpty: "Hàng đợi trống",
        queueMore: (visible, count) => `${visible} , ... (+${count} người)`,
        ahOn: "YUE: Autohost đã BẬT!",
        ahOff: "YUE: Autohost đã TẮT!",
        ahAlreadyOn: "YUE: Autohost đang bật sẵn rồi!",
        ahAlreadyOff: "YUE: Autohost đang tắt sẵn rồi!",
        nextNoHost: "YUE: Hàng đợi trống hoặc không có ai tiếp theo!",
        nextSuccess: (user) => `YUE: Chuyển Host tiếp theo cho ${user}!`,
        skipVoteStarted: (user, current, req) => `YUE: ${user} đã bỏ phiếu skip! (${current}/${req} phiếu)`,
        skipVotePassed: "YUE: Đã đủ phiếu Skip! Đổi Host...",
        queueList: (qText) => `YUE Hàng đợi Autohost: ${qText}`,
        hostNoPerm: "YUE: Chỉ Ref/Admin hoặc Host hiện tại mới dùng được lệnh này!",

        // --- BANCHO SERVICE ---
        matchFinishedRotating: "YUE: Trận đấu kết thúc! Đổi Host cho người tiếp theo...",

        // --- HELP COMMAND ---
        helpLines: [
            "YUE HELP (1/4) - MAP: .rnd [sao] [phút] [status] | .a [user] (Duyệt) | .dl (Link) | .abort | .time <s giây>",
            "YUE HELP (2/4) - HOST: .host <user> | .ah (On) | .ahoff (Off) | .next / .skip (Đổi host) | .q (Hàng đợi)",
            "YUE HELP (3/4) - PLAYER & REF: .rs [user] (Recent score) | .addref <user> | .rmref <user> | .refs",
            "YUE HELP (4/4) - AI AGENT: .yue <câu hỏi> (Trò chuyện hoặc ra lệnh bằng ngôn ngữ tự nhiên)"
        ]
    },
    en: {
        // --- STAR LIMIT & ROOM 24/7 ---
        starLimitInfo: (min, max) => `YUE 24/7: Current room star limit: ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Usage: .sr <min>-<max> (e.g. .sr 4.5-5.5)`,
        starLimitInvalidSyntax: "YUE 24/7: Invalid syntax! Please use format: .sr <min>-<max> (e.g. .sr 4.0-5.5)",
        starLimitInvalidRange: "YUE 24/7: Invalid star range! Please select between 0.0★ - 10.0★.",
        starLimitForced: (user, min, max) => `YUE 24/7: Ref/Admin ${user} forced updated Star Limit to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
        starLimitUpdated: (min, max) => `YUE 24/7: Updated room Star Limit to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
        voteStarted: (user, min, max, req, total) => `YUE 24/7: [VOTE] ${user} proposed changing Star Limit to ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Type ".vote yes" or ".vote no" to vote! (${req}/${total} votes required | Current: 1/${total})`,
        voteNoActive: "YUE 24/7: There is currently no active vote in this room!",
        votePromptOptions: "YUE 24/7: Please vote using .vote yes or .vote no!",
        votePassed: (min, max) => `YUE 24/7: 🎉 VOTE PASSED (>50%)! Room Star Limit updated to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
        voteProgress: (user, actionStr, yesCount, req, total) => `YUE 24/7: ${user} voted ${actionStr}. Vote progress: ${yesCount}/${req} votes needed (Total players: ${total}).`,
        roomInfo: (host, min, max, activeCount) => `YUE 24/7 ROOM INFO: Host: ${host} | Star Limit: ${min.toFixed(1)}★ - ${max.toFixed(1)}★ | Players: ${activeCount}/16 | Auto Start: On`,
        yuePrompt: (user) => `YUE: Need something ${user}? Type ".yue <question>" to chat!`,
        yueError: "YUE: Unable to process that right now...",

        // --- PLAYER COMMANDS (.rs) ---
        rsNoScore: (user) => `YUE: No recent play found for ${user}!`,
        rsError: (user) => `YUE: Failed to fetch recent play for ${user}!`,

        // --- HOST & AUTOHOST COMMANDS ---
        queueEmpty: "Queue is empty",
        queueMore: (visible, count) => `${visible} , ... (+${count} players)`,
        ahOn: "YUE: Autohost is now ON!",
        ahOff: "YUE: Autohost is now OFF!",
        ahAlreadyOn: "YUE: Autohost is already enabled!",
        ahAlreadyOff: "YUE: Autohost is already disabled!",
        nextNoHost: "YUE: Queue is empty or no next player available!",
        nextSuccess: (user) => `YUE: Transferred Host to ${user}!`,
        skipVoteStarted: (user, current, req) => `YUE: ${user} voted to skip! (${current}/${req} votes)`,
        skipVotePassed: "YUE: Skip vote passed! Rotating Host...",
        queueList: (qText) => `YUE Autohost Queue: ${qText}`,
        hostNoPerm: "YUE: Only Ref/Admin or current Host can use this command!",

        // --- BANCHO SERVICE ---
        matchFinishedRotating: "YUE: Match finished! Rotating Host to the next player...",

        // --- HELP COMMAND ---
        helpLines: [
            "YUE HELP (1/4) - MAP: .rnd [stars] [mins] [status] | .a [user] | .dl (Link) | .abort | .time <sec>",
            "YUE HELP (2/4) - HOST: .host <user> | .ah (On) | .ahoff (Off) | .next / .skip | .q (Queue)",
            "YUE HELP (3/4) - PLAYER & REF: .rs [user] (Recent score) | .addref <user> | .rmref <user> | .refs",
            "YUE HELP (4/4) - AI AGENT: .yue <question> (Chat or command in natural language)"
        ]
    }
};

/**
 * Hàm lấy câu thông báo tương ứng theo ngôn ngữ phòng
 */
export function t(key, lang = 'en', ...args) {
    const targetLang = ['vi', 'en'].includes(lang) ? lang : 'en';
    const dict = MESSAGES[targetLang] || MESSAGES.en;
    const msg = dict[key] || MESSAGES.en[key] || '';
    return typeof msg === 'function' ? msg(...args) : msg;
}


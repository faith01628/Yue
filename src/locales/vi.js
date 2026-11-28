export default {
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

    // --- PLAYER COMMANDS (.rs / .tm) ---
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
        "YUE HELP (1/4) - MAP: .rnd [sao] [phút] [status] | .a [user] (Duyệt) | .dl (Link) | .abort | .time <giây>",
        "YUE HELP (2/4) - HOST: .host <user> | .ah (On) | .ahoff (Off) | .next / .skip (Đổi host) | .q (Hàng đợi)",
        "YUE HELP (3/4) - PLAYER & REF: .rs/.rc/.rm/.rt [user] (Recent) | .me [user] (Thành tích) | .tm (Top Multi) | .addref <user> | .refs",
        "YUE HELP (4/4) - AI & PM: .yue <câu hỏi> | PM nick bot (/np, .r, .rec) | Chi tiết: [https://github.com/faith01628/Yue GitHub]"
    ],
    helpLines247: [
        "YUE HELP 24/7 (1/3) - MAP: .rnd [sao] [phút] [status] | .a [user] (Duyệt) | .dl (Link) | .abort | .time <giây>",
        "YUE HELP 24/7 (2/3) - HOST & PLAYER: .host <user> | .next/.skip | .q | .rs/.rc/.rm/.rt [user] | .me [user] | .tm",
        "YUE HELP 24/7 (3/3) - AI & PM: .yue <câu hỏi> | PM (/np, .r, .rec) | Hướng dẫn: [https://github.com/faith01628/Yue GitHub]"
    ],

    // --- PM ASSISTANT ---
    pm: {
        help: "Lệnh PM: /np (PP map) | .r/.rs/.rc/.rm/.rt (recent) | .rec [sao] (gợi ý map) | .map/.dl | .me/.tm | .yue <câu hỏi> | Chi tiết: [https://github.com/faith01628/Yue GitHub]",
        noLastMap: "Hãy gửi /np một map trước rồi dùng .map hoặc .dl nhé!",
        yueEmpty: (user) => `Chào ${user}, bạn muốn hỏi gì cứ nhắn ".yue <nội dung>" nhé!`,
        autoGreet: (user) => `Chào ${user}, mình là trợ lý Yue đang trực thay! Gửi /np xem PP map, .r xem recent, .rec gợi ý map, .yue <câu hỏi> để chat. Chưa rõ cách dùng thì gõ .help hoặc xem chi tiết tại [https://github.com/faith01628/Yue GitHub] nhé!`,
        aiFallback: (user) => `Chào ${user}, hiện tại mình chưa xử lý được câu này, thử lại sau nhé!`,
        aiError: (user) => `Xin lỗi ${user}, Yue đang hơi bận một chút, thử lại sau nhé!`,
        abusiveRefusal: "Xin lỗi, tôi xin phép từ chối trả lời các nội dung mang tính thô tục hoặc xúc phạm cá nhân.",
        spamWarning: "Bạn đang nhắn quá nhanh! Vui lòng chờ vài phút trước khi tiếp tục nhé.",
        recommendNotFound: (starsLabel) => `YUE: Không tìm thấy map phù hợp (${starsLabel || 'ngẫu nhiên'}), thử mức sao khác nhé!`
    },

    // --- PLAYER COMMANDS (EXTENDED) ---
    player: {
        tmEmpty: "YUE: Chưa có dữ liệu Bảng Xếp Hạng hôm nay tại phòng 24/7."
    },

    // --- STANDING (.me IRC) ---
    standing: {
        noData: (name) => `YUE: ${name} | Chưa có dữ liệu thi đấu trong 30 ngày qua tại phòng 24/7. Hãy cùng chơi để ghi danh lên Bảng Xếp Hạng nhé!`,
        renameTag: (oldName) => ` (Tên cũ: ${oldName})`,
        prevMonth: (rank, medal, pp) => `Tháng trước: #${rank} ${medal}(${pp}pp)`,
        onlyPrevMonth: (userLink, prevMonthPart, month) => `YUE: ${userLink} | Hôm nay: Chưa chơi | Tuần: -- | Tháng: -- | 🎖️ ${prevMonthPart} | Từng lọt Top tháng ${month}!`,
        todayNotPlayed: "Hôm nay: Chưa chơi",
        todayRanked: (rank, pp, mapInfo) => `Hôm nay: #${rank} (${pp}pp${mapInfo})`,
        weekRanked: (rank, pp) => `Tuần: #${rank} (${pp}pp)`,
        weekEmpty: "Tuần: --",
        monthRanked: (rank, pp) => `Tháng: #${rank} (${pp}pp)`,
        monthEmpty: "Tháng: --",
        firstDay: "Mới tham gia hôm nay!",
        pastSingle: (rank, d, m, pp) => `Từng đạt #${rank} ngày ${d}/${m} (${pp}pp)`,
        pastList: (list) => `Từng đạt ${list}`,
        medalsInDays: (medalsStr, totalDays) => `🏆 ${medalsStr} trong ${totalDays} ngày`,
        playedDaysBest: (totalDays, bestRank, bestPp) => `Đã chơi ${totalDays} ngày (Best: #${bestRank} ${bestPp}pp)`
    }
};

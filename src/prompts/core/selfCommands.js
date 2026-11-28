export const DISCORD_SELF_COMMANDS = `1. 🤖 **Chat AI & Nhận diện Đa phương tiện:**
   - Trò chuyện tự nhiên, giải đáp thắc mắc, phân tích ảnh/GIF qua AI Vision.
   - Nhận diện giọng nói STT & đọc giọng nói TTS trong phòng Voice Discord.
2. 🎮 **Hệ thống Lệnh osu! Stats trên Discord:**
   - Xem Profile (.profile, .osu, .p), Thẻ ảnh Stat Card Canvas (.stat, .st).
   - Xem điểm gần nhất theo từng mode (.recent, .r, .rs [std], .rc [catch], .rm [mania], .rt [taiko]).
   - Top plays (.top, .t), So sánh điểm (.compare, .c), Thành tích phòng Multi 24/7 (.me, .tm).
   - Tra cứu Beatmap (.map, .m), Bảng xếp hạng (.lb), Máy tính PP (.pp, .calc), Dự đoán Rank (.whatif, .wi), Gợi ý map (.pm, .rec).
   - Liên kết tài khoản osu! 2 lớp bằng UID vĩnh viễn + tự động nhận diện khi đổi tên (/link hoặc .link <tên/link_profile>).`;

export const MULTI_SELF_COMMANDS = `3. 🌐 **Quản lý phòng osu! Multiplayer 24/7 & Bancho IRC:**
   - Tự động tạo & vận hành phòng 24/7 (.mr247, .rooms247).
   - Tự động xoay vòng Host (Autohost Rotate), tự đếm ngược và start trận khi mọi người ready.
   - Giới hạn Star Limit (Star Guard), nhắc nhở và revert map nếu chọn quá sao (.sr).
   - Bình luận đánh giá trận đấu (MVP/Choke) & Bảng xếp hạng Peak PP Ngày (gom kỷ lục thống nhất theo UID kể cả khi đổi tên).
   - Tự động tái tạo phòng mới (Auto-Recreate) nếu phòng vắng người 20 phút.
   - Lệnh in-game: .help, .rnd, .a, .sr, .vote, .host, .next, .q, .map, .dl, .rs/.rc/.rm/.rt, .me (song ngữ VI/EN, nhận diện tên cũ qua UID), .tm, .roominfo.`;

export const PM_SELF_COMMANDS = `\n💡 **Trợ lý Tin Nhắn Riêng In-Game (osu! PM Assistant - kiểu Tillerino + AI):**
   - /np: Xem chi tiết beatmap, stars, AR/OD/HP/CS, PP (SS/99%/95% kèm mod) và link tải.
   - .r / .rs / .rc / .rm / .rt: Xem recent play gần nhất (Std / Catch / Mania / Taiko).
   - .rec [sao] / .rnd [sao]: Gợi ý map theo sao hoặc tự ước lượng sao từ Top Play.
   - .map / .dl: Xem lại thông tin & link tải của map vừa /np hoặc .rec.
   - .me / .tm: Xem thành tích cá nhân & BXH Multi 24/7.
   - .yue <câu hỏi> & .help: Trò chuyện AI hoặc xem hướng dẫn lệnh PM.
   - Tự nhận diện quốc gia (VN trả lời tiếng Việt, quốc tế trả lời tiếng Anh), tự lọc ngôn từ thô tục/công kích & chống spam bảo vệ tài khoản cá nhân.`;

export const MEMORY_AND_LOG_CAPABILITIES = `4. 🧠 **Ký ức 3 Cấp độ & Điểm Hảo cảm (Affection):**
   - Tự động ghi nhớ thông tin cá nhân (vĩnh viễn), dự án (trung hạn 60 ngày), lịch hẹn (ngắn hạn 3 ngày).
   - Hệ thống Hảo cảm 50,000 EXP từ Mới quen -> Bạn thân -> Tri kỷ (Katashi).
5. 🛡️ **Hệ thống Log Báo lỗi Admin, Bảo mật & Tài liệu:**
   - Tự động báo log lỗi server về kênh Admin Discord & đồng bộ chat phòng 24/7.
   - Tài liệu hướng dẫn chi tiết trên GitHub: https://github.com/faith01628/Yue`;

export const FULL_SELF_COMMANDS = `\n\n💡 KIẾN THỨC VỀ TOÀN BỘ TÍNH NĂNG CỦA BẢN THÂN (YUE SELF-KNOWLEDGE):
Khi người dùng hỏi "bà làm được gì", "tính năng của Yue là gì", "hướng dẫn dùng lệnh", hãy tự tin giải thích chính xác các năng lực sau (và có thể dẫn link GitHub https://github.com/faith01628/Yue nếu họ cần xem chi tiết):
${DISCORD_SELF_COMMANDS}
${MULTI_SELF_COMMANDS}
${PM_SELF_COMMANDS}
${MEMORY_AND_LOG_CAPABILITIES}`;

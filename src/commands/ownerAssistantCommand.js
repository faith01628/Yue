import { 
    isOwnerUser, 
    addOwnerReminder, 
    getPendingReminders, 
    deleteReminder, 
    toggleSleepNotify, 
    parseNaturalTime 
} from '../services/ownerAssistantService.js';
import { getVNTimeInfo } from '../services/osu/dailyLeaderboardService.js';

/**
 * 👑 Lệnh và Trợ lý riêng cho Boss (.remind / .hemgio / .reminds / .sleepnotify)
 */
export async function handleOwnerAssistantCommand(message, args = []) {
    if (!isOwnerUser(message.author.id)) {
        return await message.reply('⛔ Tính năng Trợ lý Riêng & Hẹn giờ cá nhân này chỉ dành cho **Boss (Owner)** mới dùng được nha!');
    }

    const content = message.content.trim();
    const firstWord = content.split(/ +/)[0].toLowerCase();
    const subCommand = (args[0] || '').toLowerCase().trim();

    // 1. DỌN / XEM DANH SÁCH HẸN GIỜ (.reminds / .remindlist)
    if (['.reminds', '.remindlist', '.listremind', '.danhsachhen'].includes(firstWord) || ['list', 'show'].includes(subCommand)) {
        const pending = getPendingReminders(message.author.id);
        const vnTime = getVNTimeInfo();

        if (pending.length === 0) {
            return await message.reply(`📋 **Danh sách hẹn giờ của Boss hiện đang trống!**\n🕒 *Múi giờ hệ thống:* \`${vnTime.fullStr}\`\n👉 Dùng \`.remind <thời_gian> <nội_dung>\` (Ví dụ: \`.remind 5h chiều đi nấu cơm\`) để tạo hẹn giờ mới.`);
        }

        const listText = pending.map((r, i) => {
            const rVN = getVNTimeInfo(new Date(r.targetTimestamp));
            return `${i + 1}. **"${r.text}"**\n   ⏰ *Thời gian nhắc:* \`${rVN.fullStr}\` (ID: \`${r.id}\`)`;
        }).join('\n\n');

        return await message.reply(`📋 **DANH SÁCH LỊCH HẸN GIỜ CỦA BOSS (${pending.length}):**\n\n${listText}\n\n👉 Dùng \`.delremind <ID>\` để hủy mốc hẹn giờ.`);
    }

    // 2. TẮT / BẬT NHẮC ĐI NGỦ KHUYA (.sleepnotify on/off)
    if (['.sleepnotify', '.sleepcheck', '.remindsleep'].includes(firstWord) || ['sleep', 'sleepnotify'].includes(subCommand)) {
        const targetState = args[0] ? ['on', '1', 'true', 'enable'].includes(args[0].toLowerCase()) : null;
        const newState = toggleSleepNotify(targetState);
        return await message.reply(`🌙 **Tính năng Nhắc đi ngủ khuya dành cho Boss:** ${newState ? '🟢 ĐÃ BẬT (Yue sẽ nhắc Boss đi ngủ nếu thấy quẩy game từ 1h-4h sáng)' : '🔴 ĐÃ TẮT'}`);
    }

    // 3. HỦY HẸN GIỜ (.delremind / .cancelremind)
    if (['.delremind', '.cancelremind', '.removeremind'].includes(firstWord) || ['del', 'delete', 'cancel', 'remove'].includes(subCommand)) {
        const targetId = subCommand && !['del', 'delete', 'cancel', 'remove'].includes(subCommand) ? subCommand : (args[1] || '').trim();
        if (!targetId) {
            return await message.reply('Cú pháp: `.delremind <ID_nhắc_nhở>` (Gõ `.reminds` để xem danh sách ID).');
        }
        const success = deleteReminder(targetId);
        if (success) {
            return await message.reply(`✅ Đã hủy mốc hẹn giờ ID \`${targetId}\` thành công!`);
        } else {
            return await message.reply(`⚠️ Không tìm thấy mốc hẹn giờ nào có ID \`${targetId}\`!`);
        }
    }

    // 4. TẠO HẸN GIỜ MỚI (.remind / .hemgio <thời_gian> <nội_dung>)
    const fullArg = args.join(' ').trim();
    if (!fullArg) {
        return await message.reply('Cú pháp: `.remind <thời_gian> <nội_dung>`\nVí dụ:\n• `.remind 5h chiều đi nấu cơm`\n• `.remind 30 phút nữa tắt máy đi ngủ`\n• `.remind 17:30 đi họp team`');
    }

    const parsedTime = parseNaturalTime(fullArg);
    if (!parsedTime) {
        return await message.reply('⚠️ Yue chưa hiểu mốc thời gian của Boss lắm! Boss gõ rõ dạng: `5h`, `17:00`, `5h chiều`, `30 phút nữa`, hoặc `2 tiếng nữa` nha!');
    }

    // Tách phần nội dung sau mốc thời gian
    let reminderText = fullArg;
    // Bóc bớt phần thời gian khỏi chuỗi nội dung nếu có thể
    const cleanText = fullArg.replace(/(?:sau\s+)?\d+\s*(?:phút|p|min|m|tiếng|giờ|g|h)\s*(?:nữa)?/i, '')
                             .replace(/\d{1,2}(?:[:h]\d{1,2})?\s*(?:sáng|trưa|chiều|tối|đêm)?/i, '')
                             .trim();
    if (cleanText.length > 2) {
        reminderText = cleanText;
    }

    const newReminder = addOwnerReminder(message.author.id, reminderText, parsedTime.targetTimestamp);
    const targetVN = getVNTimeInfo(new Date(parsedTime.targetTimestamp));

    return await message.reply(`⏰ **ĐÃ ĐẶT HẸN GIỜ THÀNH CÔNG CHO BOSS!**\n📌 **Nội dung:** "${reminderText}"\n🔔 **Thời gian nhắc:** \`${targetVN.fullStr}\` (${parsedTime.durationText})\n👉 Đúng giờ này Yue sẽ tự động nhắn tin riêng (DM) cho Boss nha! 💖`);
}

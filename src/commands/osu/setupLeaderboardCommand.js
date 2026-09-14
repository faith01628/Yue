import fs from 'fs';
import path from 'path';
import { PermissionFlagsBits } from 'discord.js';
import { 
    saveBoardConfig, 
    loadBoardConfig, 
    postDailyTop10ToDiscord
} from '../../services/osu/dailyLeaderboardService.js';

const HISTORY_DIR = path.resolve('data/history');

/**
 * 👑 Lệnh thiết lập hoặc Hủy Kênh nhận thông báo Bảng Xếp Hạng Top 10 Hàng Ngày (.setuplb / .setupboard / .unsetlb)
 */
export async function handleSetupLeaderboardBoardCommand(message, args = []) {
    const adminUserIds = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

    const isBotAdmin = String(message.author.id) === '756427625970270248' || 
                       adminUserIds.includes(message.author.id) ||
                       String(message.author.username).toLowerCase().includes('katashi');

    const isGuildAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                         message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                         message.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
                         (message.guild && message.guild.ownerId === message.author.id);

    if (!isBotAdmin && !isGuildAdmin) {
        return message.reply('⛔ Chỉ Admin Server hoặc Bot Creator mới có quyền thiết lập Kênh Bảng Xếp Hạng Discord!');
    }

    try {
        const subCommand = (args[0] || '').toLowerCase().trim();
        const config = loadBoardConfig();
        const cmdName = message.content.trim().split(/ +/)[0].toLowerCase();

        // 1. NẾU LÀ HỦY ĐĂNG KÝ (off / disable / unset / remove / delete) HOẶC DÙNG LỆNH .unsetlb
        if (['off', 'disable', 'unset', 'remove', 'delete', 'cancel'].includes(subCommand) || cmdName.includes('unset') || cmdName.includes('remove')) {
            config.channelId = null;
            saveBoardConfig(config);
            return message.reply(`🔕 **Đã hủy đăng ký Kênh Bảng Xếp Hạng!**\n👉 Yue sẽ dừng tự động gửi thông báo Top 10 lúc 00:00 đêm cho đến khi bạn cài đặt lại.`);
        }

        // 2. CHUYỂN KÊNH HOẶC ĐĂNG KÝ KÊNH MỚI
        const oldChannelId = config.channelId;
        config.channelId = message.channel.id;
        saveBoardConfig(config);

        if (oldChannelId && oldChannelId !== message.channel.id) {
            return message.reply(`🔄 **Đã chuyển Kênh Bảng Xếp Hạng Hàng Ngày từ <#${oldChannelId}> sang <#${message.channel.id}>!**\n👉 Đúng **00:00 đêm** mỗi khi reset ngày, Yue sẽ chuyển sang tự động gửi bài Embed Top 10 vào kênh mới này.`);
        }

        return message.reply(`✅ **Đã cài đặt thành công Kênh Bảng Xếp Hạng Hàng Ngày tại <#${message.channel.id}>!**\n👉 Đúng **00:00 đêm** mỗi khi reset ngày, Yue sẽ tự động gửi 1 bài Embed thông báo **Top 10 Peak PP** của ngày vừa kết thúc vào kênh này.`);
    } catch (err) {
        console.error('❌ Lỗi setup Bảng Xếp Hạng:', err.message);
        return message.reply(`❌ Đã xảy ra lỗi khi cài đặt Kênh Bảng Xếp Hạng: ${err.message}`);
    }
}

/**
 * 📜 Lệnh xem Lịch sử Bảng Xếp Hạng Top 10 các Tháng đã lưu trữ (.historyboard / .historylb)
 * Cú pháp: .historyboard [YYYY-MM]
 */
export async function handleHistoryLeaderboardCommand(message, args = []) {
    try {
        if (!fs.existsSync(HISTORY_DIR)) {
            return message.reply('ℹ️ Hiện tại chưa có file lịch sử tháng nào được lưu trữ.');
        }

        const targetMonth = args[0]?.trim();

        // 1. NẾU KHÔNG TRUYỀN YYYY-MM -> HIỂN THỊ DANH SÁCH CÁC THÁNG ĐÃ LƯU TRỮ
        if (!targetMonth) {
            const files = fs.readdirSync(HISTORY_DIR).filter(f => f.startsWith('monthlyLeaderboard_') && f.endsWith('.json'));
            if (files.length === 0) {
                return message.reply('ℹ️ Hiện tại chưa có tệp lịch sử tháng nào được lưu trữ.');
            }

            const monthsList = files.map(f => {
                const monthStr = f.replace('monthlyLeaderboard_', '').replace('.json', '');
                return `• **Tháng ${monthStr}** (Lệnh xem: \`.historyboard ${monthStr}\`)`;
            }).join('\n');

            return message.reply(`📜 **DANH SÁCH CÁC THÁNG ĐÃ ĐƯỢC LƯU TRỮ LỊCH SỬ TOP 10:**\n${monthsList}\n\n👉 Gõ \`.historyboard <YYYY-MM>\` (Ví dụ: \`.historyboard 2026-08\`) để xem chi tiết!`);
        }

        // 2. NẾU CÓ TRUYỀN YYYY-MM -> ĐỌC FILE JSON LỊCH SỬ THÁNG ĐÓ
        const archiveFileName = `monthlyLeaderboard_${targetMonth}.json`;
        const archiveFilePath = path.join(HISTORY_DIR, archiveFileName);

        if (!fs.existsSync(archiveFilePath)) {
            return message.reply(`⚠️ Không tìm thấy dữ liệu lịch sử cho tháng **${targetMonth}**! (Vui lòng gõ \`.historyboard\` để xem các tháng hiện có).`);
        }

        const raw = fs.readFileSync(archiveFilePath, 'utf-8');
        const archiveData = JSON.parse(raw);
        const top10 = archiveData.top10 || [];

        const MEDAL_ICONS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

        const playerListText = top10.length > 0 ? top10.map((p, idx) => {
            const medal = MEDAL_ICONS[idx] || `${idx + 1}.`;
            const profileUrl = p.userId ? `https://osu.ppy.sh/u/${p.userId}` : `https://osu.ppy.sh/u/${encodeURIComponent(p.username)}`;
            const modsArr = Array.isArray(p.mods) && p.mods.length > 0 ? p.mods : [];
            const modsTag = modsArr.length > 0 ? ` +${modsArr.join('')}` : '';
            return `${medal} [**${p.username}**](<${profileUrl}>) — **${p.pp}pp**\n┗ *${p.mapTitle || 'Unknown Map'}* \`(${(p.starRating || 0).toFixed(2)}★${modsTag})\``;
        }).join('\n') : '*Không có dữ liệu.*';

        const embed = {
            color: 0x9B59B6, // Tím lịch sử
            title: `📜 LỊCH SỬ BẢNG XẾP HẠNG TOP 10 THÁNG ${archiveData.month || targetMonth}`,
            description: `Dữ liệu lịch sử đã được lưu trữ tự động vào lúc ${new Date(archiveData.archivedAt || Date.now()).toLocaleDateString('vi-VN')}`,
            fields: [
                {
                    name: `🏆 TOP 10 PEAK PP THÁNG ${archiveData.month || targetMonth}`,
                    value: playerListText,
                    inline: false
                }
            ],
            footer: {
                text: 'Yue AI Leaderboard History Archive'
            },
            timestamp: new Date().toISOString()
        };

        return message.reply({ embeds: [embed] });
    } catch (err) {
        console.error('❌ Lỗi xem lịch sử Bảng Xếp Hạng:', err.message);
        return message.reply(`❌ Đã xảy ra lỗi khi đọc lịch sử Bảng Xếp Hạng: ${err.message}`);
    }
}

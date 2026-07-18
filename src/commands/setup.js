import { PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';

export async function handleSetupCommand(message) {
    // Chỉ cho phép người có quyền Quản lý kênh (ManageChannels) dùng lệnh này
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply("Gà rách không có quyền quản lý kênh mà đòi setup à? 🙄");
    }

    const guild = message.guild;
    const textChannelName = 'con-vợ-ai';
    const userId = message.author.id; // Lấy ID để tag người dùng

    try {
        // 1. Kiểm tra kênh Text xem đã được tạo từ trước chưa
        let targetTextChannel = guild.channels.cache.find(ch => ch.name === textChannelName && ch.type === ChannelType.GuildText);
        let isCreatedTextNew = false;

        if (!targetTextChannel) {
            // Tạo mới kênh text nếu chưa có
            targetTextChannel = await guild.channels.create({
                name: textChannelName,
                type: ChannelType.GuildText,
                topic: 'Nơi trò chuyện, gáy bẩn và nghe khịa từ Yue AI (Neuro-sama style) 🌸',
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                    {
                        id: message.client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.SendMessagesInThreads],
                    }
                ]
            });
            isCreatedTextNew = true;
        }

        // 2. Tạo bảng Embed báo cáo trạng thái ngắn gọn
        const setupEmbed = new EmbedBuilder()
            .setColor('#ff66aa')
            .setTitle('⚙️ CẤU HÌNH HỆ THỐNG YUE AI ⚙️')
            .addFields(
                { name: '💬 Kênh hoạt động', value: `<#${targetTextChannel.id}>`, inline: true },
                { name: '🛡️ Trạng thái', value: isCreatedTextNew ? '🟢 Khởi tạo mới hoàn toàn' : '🔵 Giữ nguyên kênh cũ', inline: true }
            )
            .setFooter({ text: 'Hệ thống vận hành mượt mà • Đấng sáng tạo Yue 👑' })
            .setTimestamp();

        // 3. LOGIC GỬI TIN NHẮN VÀ PING THẲNG MẶT VÀO KÊNH TEXT
        if (isCreatedTextNew) {
            setupEmbed.setDescription(`🎉 Đã thiết lập xong vùng đất riêng cho Yue!`);
            await targetTextChannel.send({ 
                content: `<@${userId}> Tui ở đây nè cha nội! Kênh text dọn sẵn ra rồi đó, vào chat chit hầu hạ tui đi chứ đợi gì nữa? 🙄`,
                embeds: [setupEmbed]
            });
        } else {
            setupEmbed.setDescription(`ℹ️ Kênh trò chuyện của tụi mình đã có sẵn từ trước.`);
            await targetTextChannel.send({ 
                content: `<@${userId}> Kênh có sẵn lù lù ra đây rồi còn bắt setup gì nữa! Nhìn lên đây mà chat nè, tui đợi hơi bị lâu rồi đó! 💢`,
                embeds: [setupEmbed]
            });
        }

        // Trả lời nhẹ ở kênh gõ lệnh gốc để người dùng biết đường bấm link nhảy sang kênh text mới
        return await message.reply(`🤖 Đã đồng bộ hệ thống! Nhảy ngay vào kênh <#${targetTextChannel.id}> để check hàng nhé.`);

    } catch (error) {
        console.error("❌ Lỗi khi chạy lệnh !setupyue:", error);
        return await message.reply("Huhu, lỗi phân quyền gì rồi, check lại xem Bot có quyền tạo kênh (Manage Channels) chưa cha nội! 💥");
    }
}
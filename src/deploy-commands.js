import dotenv from 'dotenv';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

dotenv.config();

if (!process.env.CLIENT_ID || !process.env.DISCORD_TOKEN) {
    console.error('❌ Thiếu CLIENT_ID hoặc DISCORD_TOKEN trong file .env rồi ông ơi!');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Liên kết tài khoản Discord của bạn với username hoặc link profile osu!')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Nhập Username HOẶC dán Link Profile (https://osu.ppy.sh/users/...)')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🔄 Đang đăng ký Slash Command Global cho Client: ${process.env.CLIENT_ID}...`);
        
        // 🎯 Đăng ký Global: Tự động chạy trên MỌI SERVER mà Yue tham gia!
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('✅ Đã đăng ký Global Slash Command /link thành công!');
        console.log('⏳ Lưu ý: Lệnh Global có thể mất khoảng 15-30 phút để Discord đồng bộ tới tất cả Server.');
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký Slash Command:', error);
    }
})();
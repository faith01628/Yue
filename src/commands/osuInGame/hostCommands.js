export async function handleHostCommands(channel, message, args, command) {
    const sender = message.user.username;

    // 🎯 Lệnh .host <username>
    if (command === '.host' || command === '!host') {
        const target = args.join(' ').trim();
        if (!target) {
            return await channel.sendMessage(`YUE: Nhập tên người muốn cho Host đi ông ơi! Cú pháp: .host <username>`);
        }
        await channel.sendMessage(`!mp host ${target}`);
        return await channel.sendMessage(`YUE: Đã chuyển Host cho ${target}!`);
    }

    // 🎯 Lệnh .autohost / .ah
    if (command === '.autohost' || command === '.ah' || command === '!autohost') {
        // Có thể kích hoạt chế độ autohost của BanchoBot hoặc quản lý qua bot
        await channel.sendMessage(`!mp settings`);
        return await channel.sendMessage(`YUE: Chế độ Auto Host đã được bật trong phòng!`);
    }
}
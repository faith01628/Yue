export async function handleMapCommands(channel, message, args, command) {
    // 🎯 Lệnh .abort (Hủy trận đấu)
    if (command === '.abort' || command === '!abort') {
        await channel.sendMessage(`!mp abort`);
        return await channel.sendMessage(`YUE: Đã hủy trận đấu!`);
    }

    // 🎯 Lệnh .time <seconds> (Set Timer đếm ngược)
    if (command === '.time' || command === '!time' || command === '.timer') {
        const seconds = parseInt(args[0]) || 30;
        await channel.sendMessage(`!mp timer ${seconds}`);
        return await channel.sendMessage(`YUE: Đã bật đếm ngược ${seconds} giây!`);
    }

    // 🎯 Lệnh .rnd / .random
    if (command === '.rnd' || command === '.random') {
        return await channel.sendMessage(`YUE: Chức năng gắp map ngẫu nhiên đang được xử lý!`);
    }
}
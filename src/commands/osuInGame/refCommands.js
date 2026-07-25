export async function handleRefCommands(channel, message, args, command) {
    const target = args.join(' ').trim();

    if (command === '.addref' || command === '!addref') {
        if (!target) return await channel.sendMessage(`YUE: Cú pháp: .addref <username>`);
        await channel.sendMessage(`!mp addref ${target}`);
        return await channel.sendMessage(`YUE: Đã thêm ${target} làm Referee!`);
    }

    if (command === '.removeref' || command === '.rmref' || command === '!removeref') {
        if (!target) return await channel.sendMessage(`YUE: Cú pháp: .removeref <username>`);
        await channel.sendMessage(`!mp rmref ${target}`);
        return await channel.sendMessage(`YUE: Đã gỡ quyền Referee của ${target}!`);
    }
}
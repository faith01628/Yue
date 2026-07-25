export async function handleInGameHelp(channel) {
    const helpText = 
        `YUE IN-GAME COMMANDS: ` +
        `▸ Multi: .host <user> | .ah | .addref <user> | .rmref <user> | .abort | .time <s` +
        `▸ Stats & AI: .rs [user] | .yue <câu_hỏi>`;

    return await channel.sendMessage(helpText);
}
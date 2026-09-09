import { getRoomLanguage, t } from '../../services/multi247/multilingualService.js';

export async function handleInGameHelp(channel) {
    const roomLang = await getRoomLanguage(channel);
    const helpLines = t('helpLines', roomLang);

    for (let i = 0; i < helpLines.length; i++) {
        await channel.sendMessage(helpLines[i]);
        
        // Nghỉ 2 giây (2000ms) trước khi gửi dòng tiếp theo (chỉ áp dụng trừ dòng cuối)
        if (i < helpLines.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}
import { isMapRecommendationRequest, parseMapRecommendationIntent } from '../../services/ai/mapIntentService.js';
import { recommendBeatmap } from '../../services/osu/mapRecommenderService.js';
import { renderBeatmapCard } from './mapCommand.js';
import { askYue } from '../../services/aiService.js';
import { calculateBeatmapPP, getBeatmapDetail } from '../../services/osu/osuService.js';
import { addRecommendedBeatmapToHistory, getRecommendedBeatmapHistory } from '../../services/storage/userProfileStore.js';

/**
 * Xử lý tin nhắn yêu cầu gợi ý/tìm beatmap bằng ngôn ngữ tự nhiên từ Discord
 * @param {import('discord.js').Message} message 
 * @param {string} userPrompt 
 * @param {object} runtimeContext 
 * @returns {Promise<boolean>} Trả về true nếu đã xử lý yêu cầu gợi ý map, false nếu không phải
 */
export async function handleNaturalLanguageMapRequest(message, userPrompt, runtimeContext = null) {
    if (!isMapRecommendationRequest(userPrompt)) {
        return false;
    }

    try {
        await message.channel.sendTyping();

        // 1. Phân tích intent & lấy bộ lọc (kết hợp .st cache & lịch sử đã gợi ý để chống trùng)
        const filters = await parseMapRecommendationIntent(userPrompt, message.author.id);
        filters.excludeBeatmapIds = getRecommendedBeatmapHistory(message.author.id);

        // 2. Tìm kiếm beatmap phù hợp
        const recommended = await recommendBeatmap(filters);

        if (!recommended || !recommended.beatmapId) {
            const fallbackAiText = `Huhu tui đã cố gắng lọc nhưng hiện chưa tìm thấy map nào khớp 100% tiêu chí (${filters.skill || 'Skill'} ~${filters.minStars}-${filters.maxStars}★) này hết... Ông thử nới rộng khoảng BPM hoặc Star Rating xem sao nhen! 🥺`;
            await message.reply(fallbackAiText);
            return true;
        }

        // 💾 Lưu Beatmap ID này vào lịch sử đã gợi ý của User để lần sau KHÔNG repick lại!
        addRecommendedBeatmapToHistory(message.author.id, recommended.beatmapId);

        // 3. Tính toán PP thực tế để đưa vào ngữ cảnh Yue AI tư vấn chính xác
        const [nm100, nm90, dt100, dt90, hr100] = await Promise.all([
            calculateBeatmapPP(recommended.beatmapId, { accuracy: 100 }).catch(() => null),
            calculateBeatmapPP(recommended.beatmapId, { accuracy: 90 }).catch(() => null),
            calculateBeatmapPP(recommended.beatmapId, { accuracy: 100, mods: 'DT' }).catch(() => null),
            calculateBeatmapPP(recommended.beatmapId, { accuracy: 90, mods: 'DT' }).catch(() => null),
            calculateBeatmapPP(recommended.beatmapId, { accuracy: 100, mods: 'HR' }).catch(() => null)
        ]);

        const beatmapDetail = await getBeatmapDetail(recommended.beatmapId).catch(() => null);
        const mapTitle = beatmapDetail ? `${beatmapDetail.beatmapset?.title} [${beatmapDetail.version}]` : 'Beatmap';

        const nm100Val = Math.round(nm100?.pp || 0);
        const nm90Val = Math.round(nm90?.pp || 0);
        const dt100Val = Math.round(dt100?.pp || 0);
        const dt90Val = Math.round(dt90?.pp || 0);
        const hr100Val = Math.round(hr100?.pp || 0);

        let profileNote = filters.isUsingProfile
            ? `(Dựa theo trình độ ${filters.userAvgStars}★ & điểm yếu Stamina từ .st)`
            : `(${filters.minStars}-${filters.maxStars}★)`;

        const aiContextPrompt = `[THÔNG TIN BÀI HÁT ĐÃ CHỌN KHỚP YÊU CẦU: "${mapTitle}" (${recommended.stars || 'N/A'}★)]
- Dự đoán PP NoMod: 100% SS = ${nm100Val}PP | 90% Acc = ${nm90Val}PP
- Dự đoán PP +DT: 100% SS = ${dt100Val}PP | 90% Acc = ${dt90Val}PP
- Dự đoán PP +HR: 100% SS = ${hr100Val}PP
- Yêu cầu của người dùng: "${userPrompt}" ${filters.targetPp ? `(Muốn tầm ${filters.targetPp}PP)` : ''} ${profileNote}.

NHIỆM VỤ: Trả lời 1-2 câu ngắn gọn, thông minh, đúng phong cách Yue.
ĐƯA RA LỜI KHUYÊN CỤ THỂ CHO NGƯỜI DÙNG VỀ CÁCH FARM MAP NÀY ĐỂ ĐẠT MỤC TIÊU PP!
(Ví dụ: "Map '${mapTitle}' này NoMod 100% SS cho ${nm100Val}PP, nên nếu ông đánh 90% Acc là đúng vừa tròn ~${nm90Val}PP cho ông luôn đó! Hoặc thử bật thêm +DT để đẩy lên ${dt90Val}PP nhé!")`;

        let aiIntro = await askYue(
            message.author.id,
            message.member?.displayName || message.author.username,
            aiContextPrompt,
            message,
            false,
            null,
            runtimeContext
        ).catch(() => `Đây nè ông ơi! Bài **${mapTitle}** này NoMod 100% SS cho **${nm100Val}PP** (90% Acc được **${nm90Val}PP**), đúng chuẩn yêu cầu luôn nè! ✨`);

        // Gửi câu trả lời AI tự nhiên
        await message.reply(aiIntro);

        // 4. Tái sử dụng lệnh .m để render thẻ Embed Beatmap
        await renderBeatmapCard(message, recommended.beatmapId);

        return true;

    } catch (err) {
        console.error('❌ Lỗi xử lý Natural Language Map Request:', err);
        await message.reply('Huhu, có lỗi xảy ra khi tui đang lọc bài nhạc rồi ông ơi... 💥');
        return true;
    }
}

/**
 * Lệnh Prefix trực tiếp (.pm / .pickmap / .rec) - Không tốn AI Token!
 * Cú pháp: .pm [skill] [stars] [bpm]
 * Ví dụ: .pm stream 180bpm 5.5sao  |  .pm jump  |  .pm
 */
export async function handlePickMapCommand(message) {
    const rawArgs = message.content.trim().split(/ +/).slice(1).join(' ').trim();
    await message.channel.sendTyping();

    try {
        const filters = await parseMapRecommendationIntent(rawArgs || 'gợi ý map', message.author.id);
        filters.excludeBeatmapIds = getRecommendedBeatmapHistory(message.author.id);

        const recommended = await recommendBeatmap(filters);

        if (!recommended || !recommended.beatmapId) {
            const starText = `${filters.minStars}-${filters.maxStars}★`;
            return message.reply(`Huhu không tìm thấy map nào khớp tiêu chí (${filters.skill || 'Mọi skill'}, ${starText}) rồi ông ơi!`);
        }

        // 💾 Lưu Beatmap ID này vào lịch sử đã gợi ý của User để lần sau KHÔNG repick lại!
        addRecommendedBeatmapToHistory(message.author.id, recommended.beatmapId);

        let profileNote = '';
        if (filters.isUsingProfile && filters.userProfile) {
            const uSkills = filters.userProfile.skills;
            profileNote = `🎯 [Trình độ: **${filters.userAvgStars}★** | Stamina: **${uSkills?.stamina || 0}/100**${uSkills?.stamina < 40 ? ' (Yếu -> Tự động ưu tiên TV Size/Short map)' : ''}]`;
        } else {
            profileNote = `🎯 [Mức sao: **${filters.minStars}-${filters.maxStars}★**]`;
        }

        const skillText = filters.skill ? filters.skill.toUpperCase() : 'Lọc theo Kỹ năng người dùng';
        const bpmText = filters.targetBpm ? ` | BPM ~${filters.targetBpm}` : '';

        await message.reply(`🎲 **Yue Pick Map**: ${profileNote}\n📌 Thể loại: **${skillText}**${bpmText}`);
        return await renderBeatmapCard(message, recommended.beatmapId);
    } catch (err) {
        console.error('❌ Lỗi xử lý lệnh .pm:', err);
        return message.reply('Có lỗi xảy ra khi lọc bài nhạc rồi ông ơi!');
    }
}


import { getUserRecentPlay } from '../../services/osu/osuService.js';

/**
 * Hàm đọc chuỗi Mods ngắn gọn
 */
function parseModsText(mods) {
    if (!mods || mods.length === 0) return '';
    const modString = mods.map(m => (typeof m === 'string' ? m : m.acronym)).join('');
    return modString ? ` +${modString}` : '';
}

/**
 * Hàm cắt gọn tên map nếu quá dài (Cắt linh hoạt theo giới hạn ký tự tối đa)
 */
function formatShortTitle(title, maxLength = 35) {
    if (!title) return '';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3).trim() + '...';
}

export async function handlePlayerCommands(channel, message, args, command) {
    const sender = message.user?.username || 'Player';

    // 🎯 Hỗ trợ các bí danh: .rs, !rs, .r, !r
    if (['.rs', '!rs', '.r', '!r'].includes(command)) {
        let targetUser = args.join(' ').trim() || sender;

        try {
            const data = await getUserRecentPlay(targetUser);

            if (!data || !data.score) {
                return await channel.sendMessage(`YUE: Không tìm thấy score gần đây nào của ${targetUser}!`);
            }

            const score = data.score;
            const beatmap = score.beatmap;
            const beatmapset = score.beatmapset;

            // 1. Tên người chơi
            const displayUser = data.user?.username || targetUser;

            // 🎯 2. Tên Beatmap (Chỉ lấy Tên Bài Hát, bỏ Artist/Mapper + Cắt ngắn linh hoạt nếu > 35 ký tự)
            const rawTitle = beatmapset?.title || 'Unknown Map';
            const shortTitle = formatShortTitle(rawTitle, 35);
            const difficultyName = beatmap?.version ? `[${beatmap.version}]` : '';
            const mapTitle = `${shortTitle} ${difficultyName}`;
            
            // 3. Mods (+HRDT, +HD...)
            const modsText = parseModsText(score.mods);

            // 4. PP
            const ppVal = score.pp ? Math.round(score.pp) : 0;
            const ppText = `${ppVal}pp`;

            // 5. Thống kê Hits [300/100/50/Miss]
            const stats = score.statistics || {};
            const count300 = stats.count_300 ?? stats.great ?? 0;
            const count100 = stats.count_100 ?? stats.ok ?? 0;
            const count50 = stats.count_50 ?? stats.meh ?? 0;
            const countmiss = stats.count_miss ?? stats.miss ?? 0;
            const hitsText = `[${count300}/${count100}/${count50}/${countmiss}m]`;

            // 6. Max Combo
            const userCombo = score.max_combo || 0;
            let realMapMaxCombo = beatmap?.max_combo;

            if (!realMapMaxCombo && beatmap?.id) {
                try {
                    const apiKey = process.env.OSU_API_KEY;
                    if (apiKey) {
                        const bmRes = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmap.id}`);
                        const bmData = await bmRes.json();
                        if (bmData && bmData.length > 0) {
                            realMapMaxCombo = parseInt(bmData[0].max_combo);
                        }
                    }
                } catch (e) {
                    console.error('Lỗi fetch max_combo fallback:', e.message);
                }
            }

            const maxComboMapText = realMapMaxCombo ? `${realMapMaxCombo}x` : '?x';
            const comboText = `${userCombo}x/${maxComboMapText}`;

            // 🎯 Chuỗi tin nhắn gọn gàng, an toàn tuyệt đối dưới 150 ký tự
            const replyMsg = `YUE: ${displayUser} | ${mapTitle}${modsText} | Rank ${score.rank} > ${score.score.toLocaleString('en-US')} > ${ppText} | Combo: ${comboText} | Hits: ${hitsText}`;

            return await channel.sendMessage(replyMsg);
        } catch (err) {
            console.error('Lỗi lấy .rs in-game:', err);
            return await channel.sendMessage(`YUE: Không lấy được score của ${targetUser} rồi!`);
        }
    }
}

export function formatMods(modsArray) {
    if (!modsArray || modsArray.length === 0) return '';
    const modNames = modsArray.map(m => (typeof m === 'string' ? m : m.acronym)).join('');
    return modNames ? ` +${modNames}` : '';
}
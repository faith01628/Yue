import { isUserRef } from '../../commands/osuInGame/refCommands.js';
import { getPlayer247Memory, updatePlayer247Memory } from './room247Memory.js';

// 1. Lưu vết Anti-Spam: key = `${channelName}_${username}`, value = Array of timestamps
const userMessageTimes = new Map();
const userSpamWarnings = new Map();

// 2. Bộ đệm 15 tin nhắn gần nhất từng phòng để phân tích Flame War (Ai gây war trước)
const recentChannelChats = new Map();

function recordChatHistory(channelName, sender, text) {
    if (!recentChannelChats.has(channelName)) {
        recentChannelChats.set(channelName, []);
    }
    const history = recentChannelChats.get(channelName);
    history.push({ sender: sender.toLowerCase(), text, time: Date.now() });
    if (history.length > 15) history.shift();
}

// 3. Danh sách Domain an toàn được phép đăng link
const ALLOWED_DOMAINS = [
    'osu.ppy.sh',
    'osu.direct',
    'catboy.best',
    'nerinyan.moe',
    'beatconnect.io',
    'chimu.moe',
    'sayobot.cn',
    'github.com',
    'discord.gg',
    'discord.com'
];

function isSafeUrl(urlStr) {
    try {
        let cleanUrl = urlStr.toLowerCase();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }
        const parsed = new URL(cleanUrl);
        const hostname = parsed.hostname;
        return ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    } catch {
        return false;
    }
}

// 4. DANH SÁCH TỪ LÓNG & TỪ XÚC PHẠM ĐA NGÔN NGỮ TOÀN CẦU (GLOBAL PROFANITY DICTIONARY)
const GLOBAL_PROFANITY_WORDS = [
    // Tiếng Việt
    'dm', 'cl', 'vl', 'dcm', 'vcc', 'vcl', 'clgt', 'đmm', 'vãi',
    // Tiếng Anh
    'fuck', 'fck', 'fk', 'bitch', 'shit', 'bastard', 'cunt', 'motherfucker', 'nigger', 'nigga', 'kys', 'retard',
    // Tiếng Nhật
    '死ね', 'しね', '馬鹿', 'バカ', 'ばか', 'ゴミ', 'きもい',
    // Tiếng Hàn
    '씨발', '시발', '병신', '개새끼', '지랄', '존나',
    // Tiếng Nga
    'сука', 'блять', 'нахуй', 'пидор', 'долбоеб',
    // Tiếng Đức
    'hurensohn', 'scheiße', 'scheisse', 'arschloch', 'wichser',
    // Tiếng Pháp
    'connard', 'salope', 'putain', 'bâtard',
    // Tiếng Tây Ban Nha & Bồ Đào Nha
    'pendejo', 'puta', 'cabron', 'maricon', 'verga', 'caralho', 'arrombado',
    // Tiếng Ba Lan
    'kurwa', 'chuj', 'jebać', 'jebac', 'pierdol',
    // Tiếng Tagalog (Philippines)
    'putangina', 'gago', 'tanga', 'bobo',
    // Tiếng Trung
    '傻逼', 'sb', '肏', '草泥马', '死全家', 'cnm'
];

/**
 * 🎯 HÀM PHÂN TÍCH Ý ĐỊNH ĐA NGÔN NGỮ TOÀN CẦU (CẢM THÁN VS CÔNG KÍCH CÁ NHÂN / GÂY WAR)
 */
function analyzeToxicityIntent(channelName, senderUsername, messageText) {
    const textLower = messageText.toLowerCase();
    const senderLower = senderUsername.toLowerCase();

    // 1. Kiểm tra xem tin nhắn có chứa từ lóng/xúc phạm của bất kỳ ngôn ngữ nào không
    const hasProfanity = GLOBAL_PROFANITY_WORDS.some(w => textLower.includes(w));

    if (!hasProfanity) {
        return { isToxicAttack: false };
    }

    // 2. KIỂM TRA CÂU CẢM THÁN GAME THUẦN TÚY TRÊN TOÀN THẾ GIỚI
    // Ví dụ: "map khó vl", "choke miss fck", "kurwa map hard", "сука lag", "bobo map"
    const nonPersonalGameWords = [
        'map', 'choke', 'miss', 'lag', 'tạ', 'skin', 'diff', 'star', 'score', 'pp', 'fail', 'hard'
    ];

    const containsGameTopic = nonPersonalGameWords.some(w => textLower.includes(w));

    // Các từ chỉ định cá nhân / đối tượng trong nhiều ngôn ngữ (mày, thằng, you, u, ты, 너, きみ...)
    const targetPronouns = [
        'mày', 'thằng', 'con', 'you', ' u ', ' ты ', ' 너 ', ' きみ ', ' du ', ' toi '
    ];

    const hasTargetPronoun = targetPronouns.some(p => textLower.includes(p));

    // Lấy danh sách tên những người chơi khác đang trong phòng
    const history = recentChannelChats.get(channelName) || [];
    const activeOtherPlayers = history
        .map(h => h.sender)
        .filter(s => s !== senderLower);

    // Kiểm tra xem có réo tên trực tiếp một người chơi khác trong phòng hay không
    const mentionsAnotherPlayer = activeOtherPlayers.some(p => p.length >= 3 && textLower.includes(p));

    // NẾU LÀ CÂU CẢM THÁN CHUNG CHUNG VỀ MAP/GAME VÀ KHÔNG NHẮM VÀO AI -> SAFE 100%!
    if (containsGameTopic && !hasTargetPronoun && !mentionsAnotherPlayer) {
        return { isToxicAttack: false, reason: 'global_game_exclamation' };
    }

    // 3. NẾU CÓ CÔNG KÍCH CÁ NHÂN HOẶC RÉO TÊN NGƯỜI KHÁC ĐỂ CHỬI -> ĐƯA VÀO XỬ LÝ VI PHẠM
    if (mentionsAnotherPlayer || hasTargetPronoun) {
        // Phân tích ai là người khơi mào gây war (Instigator) vs Người bị chọc chửi lại (Escalator)
        const recentAttacksAgainstSender = history.filter(h => 
            h.sender !== senderLower && 
            h.text.toLowerCase().includes(senderLower)
        );

        const isInstigator = recentAttacksAgainstSender.length === 0;

        return {
            isToxicAttack: true,
            isInstigator, // true = người khơi mào gây war (+2 cờ), false = người bị chọc chửi lại (+1 cờ)
            targetPlayer: mentionsAnotherPlayer ? 'người chơi khác' : 'cá nhân'
        };
    }

    // Các từ cực đoan miệt thị chủng tộc / xúi giục tự tử (Hate speech / KYS / N-word) -> Cấm tuyệt đối!
    const severeProfanity = ['nigger', 'nigga', 'kys', 'motherfucker', '死ね', '死全家'];
    if (severeProfanity.some(w => textLower.includes(w))) {
        return { isToxicAttack: true, isInstigator: true, severe: true };
    }

    return { isToxicAttack: false };
}

/**
 * 🛡️ HÀM KIỂM TRA AN TOÀN CỘNG ĐỒNG 24/7 (5-STRIKE PROGRESSIVE SYSTEM)
 */
export async function checkCommunitySafety(channel, username, messageText) {
    const channelName = channel.name;
    const userLower = username.toLowerCase();
    const key = `${channelName}_${userLower}`;
    const now = Date.now();

    if (userLower === 'banchobot' || isUserRef(channelName, username)) {
        recordChatHistory(channelName, username, messageText);
        return { safe: true };
    }

    let playerMem = getPlayer247Memory(username);
    if (!playerMem) {
        playerMem = updatePlayer247Memory(username);
    }

    // 0. KIỂM TRA LỆNH CẤM BAN 24H HOẶC BAN VĨNH VIỄN
    if (playerMem.isPermanentBanned) {
        await channel.sendMessage(`YUE 24/7 SAFETY: ${username} bị cấm vĩnh viễn khỏi phòng do vi phạm nghiêm trọng nhiều lần!`);
        await channel.sendMessage(`!mp kick ${username}`);
        return { safe: false, reason: 'perm_banned' };
    }

    if (playerMem.banUntil && now < playerMem.banUntil) {
        const remainingHours = Math.ceil((playerMem.banUntil - now) / (1000 * 60 * 60));
        await channel.sendMessage(`YUE 24/7 SAFETY: ${username} đang bị cấm 24h (Còn lại ${remainingHours}h). Tiến hành kick!`);
        await channel.sendMessage(`!mp kick ${username}`);
        return { safe: false, reason: 'temp_banned' };
    }

    // 1. ANTI-SCAM & LINK BLOCKER (BẢO VỆ CHỐNG LINK LỪA ĐẢO)
    const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
    const matches = messageText.match(urlRegex);

    if (matches && matches.length > 0) {
        for (const matchUrl of matches) {
            if (!isSafeUrl(matchUrl)) {
                console.warn(`[Anti-Scam Alert] User ${username} gửi link nguy hiểm: ${matchUrl}`);
                await channel.sendMessage(`YUE 24/7 SAFETY: ⚠️ CẢNH BÁO SCAM! Link lừa đảo/không an toàn từ ${username}. Kick out phòng!`);
                await channel.sendMessage(`!mp kick ${username}`);
                return { safe: false, reason: 'scam_link', action: 'kick' };
            }
        }
    }

    // 2. ANTI-SPAM CHAT (GÕ DỒN DẬP > 5 TIN TRONG 5S)
    if (!userMessageTimes.has(key)) userMessageTimes.set(key, []);
    const times = userMessageTimes.get(key);
    times.push(now);

    const recentTimes = times.filter(t => now - t <= 5000);
    userMessageTimes.set(key, recentTimes);

    if (recentTimes.length >= 5) {
        const warnCount = (userSpamWarnings.get(key) || 0) + 1;
        userSpamWarnings.set(key, warnCount);

        if (warnCount >= 2) {
            await channel.sendMessage(`YUE 24/7 SAFETY: ${username} cố tình spam liên tục! Kick khỏi phòng.`);
            await channel.sendMessage(`!mp kick ${username}`);
            userSpamWarnings.delete(key);
            return { safe: false, reason: 'spam_kick', action: 'kick' };
        } else {
            await channel.sendMessage(`YUE 24/7 SAFETY: ${username}, vui lòng gõ chậm lại nha ông! (Cảnh báo spam 1/2)`);
            return { safe: false, reason: 'spam_warn', action: 'warn' };
        }
    }

    // Ghi lại lịch sử chat phòng để phục vụ phân tích gây war
    recordChatHistory(channelName, username, messageText);

    // 3. TOXIC & FLAME WAR EVALUATION (HỆ THỐNG CẢNH BÁO 5 NẤC & TỰ RESET SAU 24H)
    const toxicAnalysis = analyzeToxicityIntent(channelName, username, messageText);

    if (toxicAnalysis.isToxicAttack) {
        // Kiểm tra dọn dẹp điểm cờ sau 24h không vi phạm
        let currentStrikes = playerMem.toxicStrikes || 0;
        const lastStrikeTime = playerMem.lastStrikeTime || 0;

        if (lastStrikeTime > 0 && (now - lastStrikeTime > 24 * 60 * 60 * 1000)) {
            currentStrikes = 0; // Reset sạch bộ nhớ toxic sau 24h
        }

        // Người khơi mào gây war trước = +2 cờ, người bị chọc đáp trả = +1 cờ
        const addedStrikes = toxicAnalysis.isInstigator ? 2 : 1;
        const newStrikes = currentStrikes + addedStrikes;

        updatePlayer247Memory(username, {
            toxicStrikes: newStrikes,
            lastStrikeTime: now
        });

        // 🎯 XỬ LÝ THEO MỐC 5 CỜ (5-STRIKE PROGRESSIVE SYSTEM)
        if (newStrikes >= 5) {
            // Nấc 5: BAN 24H!
            const newBanCount = (playerMem.banCount || 0) + 1;
            const isPerm = newBanCount >= 3; // Vi phạm ban 24h trên 3 lần -> Cấm vĩnh viễn

            updatePlayer247Memory(username, {
                toxicStrikes: 0,
                banCount: newBanCount,
                banUntil: isPerm ? 0 : (now + 24 * 60 * 60 * 1000),
                isPermanentBanned: isPerm
            });

            if (isPerm) {
                await channel.sendMessage(`YUE 24/7 SAFETY: ${username} đã bị Ban 24h 3 lần. CẤM VĨNH VIỄN khỏi phòng 24/7!`);
            } else {
                await channel.sendMessage(`YUE 24/7 SAFETY: ${username} chạm mốc 5 lần công kích cá nhân. CẤM 24 GIỜ khỏi phòng 24/7!`);
            }
            await channel.sendMessage(`!mp kick ${username}`);
            return { safe: false, reason: 'toxic_ban' };

        } else if (newStrikes === 4) {
            // Nấc 4: Cảnh báo công khai lần cuối
            await channel.sendMessage(`YUE 24/7 SAFETY: ⚠️ ${username}, CẢNH BÁO LẦN CUỐI! Nếu tiếp tục công kích cá nhân/gây war sẽ bị CẤM 24h (Mốc vi phạm: 4/5).`);
            return { safe: false, reason: 'toxic_warn_final' };

        } else if (newStrikes === 3) {
            // Nấc 3: Cảnh báo công khai lần 1
            const roleMsg = toxicAnalysis.isInstigator ? 'khơi mào gây war' : 'công kích cá nhân';
            await channel.sendMessage(`YUE 24/7 SAFETY: ⚠️ ${username}, vui lòng giữ bình tĩnh và không ${roleMsg} nha ông! (Mốc vi phạm: 3/5)`);
            return { safe: false, reason: 'toxic_warn_1' };

        } else {
            // Nấc 1 & 2: Gắn cờ âm thầm (Silent Flag) - Không cảnh báo phiền phòng!
            console.log(`[Safety Silent Flag] User ${username} bị gắn cờ âm thầm mốc ${newStrikes}/5 (Gây war: ${toxicAnalysis.isInstigator})`);
            return { safe: true };
        }
    }

    return { safe: true };
}

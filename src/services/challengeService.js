// 🛡️ DỊCH VỤ THEO DÕI TRẠNG THÁI THÁCH THỨC VÀ TỰ ĐỘNG BLOCK CỦA YUE
const challengeStates = new Map();

// Hạn chót cho 1 chuỗi thách thức (10 phút không chat tiếp thì reset)
const EXPIRATION_MS = 10 * 60 * 1000;

export function getChallengeState(userId) {
    if (!userId) return { threatened: false, challengeCount: 0 };
    const state = challengeStates.get(String(userId));
    if (!state) return { threatened: false, challengeCount: 0 };

    if (Date.now() - state.lastThreatTime > EXPIRATION_MS) {
        challengeStates.delete(String(userId));
        return { threatened: false, challengeCount: 0 };
    }
    return state;
}

export function detectBlockThreat(aiReplyText) {
    if (!aiReplyText) return false;
    const lower = aiReplyText.toLowerCase();
    return (
        lower.includes('danh sách đen') ||
        lower.includes('block list') ||
        lower.includes('blacklist') ||
        lower.includes('cho ông vào block') ||
        lower.includes('cho bà vào block') ||
        lower.includes('block ông') ||
        lower.includes('block bà') ||
        lower.includes('cho vào danh sách đen')
    );
}

function normalizeVietnamese(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .trim();
}

export function detectUserChallenge(userPrompt) {
    if (!userPrompt) return false;
    const lower = userPrompt.toLowerCase().trim();
    const normalized = normalizeVietnamese(userPrompt);

    const challengeKeywords = [
        // Nhóm "ngon" / "giỏi"
        'co ngon', 'ngon thi', 'ngon lam', 'ngon vo', 'gioi thi', 'gioi lam',
        // Nhóm "thử" / "xem"
        'thu xem', 'thu coi', 'lam thu', 'block thu', 'thu di', 'xem sao', 'xem dua nao',
        // Nhóm "thách" / "đố"
        'thach', 'thach day', 'thach do', 'do dam', 'do day', 'do lam',
        // Nhóm "lêu lêu" / "trêu ghẹo"
        'leu leu', 'tuoi gi', 'so qua', 'so ghe', 'so gi',
        // Nhóm "dám" / "làm"
        'dam khong', 'dam ko', 'dam lam', 'lam di', 'lam toi di', 'lam gi duoc', 'lam xem',
        // Nhóm "block" / "thách block"
        'block di', 'block ho', 'block xem', 'cho vao di', 'gioi thi block'
    ];

    return challengeKeywords.some(kw => lower.includes(kw) || normalized.includes(kw));
}

export function handleUserPreChatCheck(userId, userPrompt) {
    if (!userId) return { isChallenge: false, count: 0, shouldBlock: false };

    const state = getChallengeState(userId);
    if (!state.threatened) {
        return { isChallenge: false, count: 0, shouldBlock: false };
    }

    const isChallenge = detectUserChallenge(userPrompt);
    if (isChallenge) {
        state.challengeCount = (state.challengeCount || 0) + 1;
        state.lastThreatTime = Date.now();
        challengeStates.set(String(userId), state);

        return {
            isChallenge: true,
            count: state.challengeCount,
            shouldBlock: state.challengeCount >= 2
        };
    }

    return { isChallenge: false, count: state.challengeCount || 0, shouldBlock: false };
}

export function recordAiReplyState(userId, aiReplyText, executeBlockFlag = false) {
    if (!userId) return;
    const key = String(userId);

    if (executeBlockFlag) {
        challengeStates.delete(key);
        return;
    }

    const isThreat = detectBlockThreat(aiReplyText);
    if (isThreat) {
        const state = challengeStates.get(key) || { threatened: true, challengeCount: 0 };
        state.threatened = true;
        state.lastThreatTime = Date.now();
        challengeStates.set(key, state);
    }
}

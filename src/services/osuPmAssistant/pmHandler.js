import { botConfig } from '../../domains/shared/config/botConfig.js';
import { t } from '../../locales/index.js';
import { askYue } from '../aiService.js';
import { fetchUserCountryCode } from '../multi247/multilingualService.js';
import { getUserProfile } from '../osu/osuService.js';
import { handlePlayerCommands } from '../../commands/osuInGame/playerCommands.js';
import { sendBeatmapInfoAndDL } from '../../commands/osuInGame/mapCommands.js';
import {
    isPmAssistantEnabled,
    setPmAssistantEnabled,
    isAutoGreetEnabled,
    setAutoGreetEnabled,
    isOnCommandCooldown,
    shouldAutoGreet,
    markOwnerChattedWith,
    isOwnerMuted,
    getUserLastMap,
    getCachedUserCountry,
    setCachedUserCountry,
    resolvePmLanguage,
    isIgnoredBot
} from './pmState.js';
import {
    parseNpMessage,
    handlePmNowPlaying,
    handlePmRecommend
} from './pmMapService.js';
import {
    checkAbusiveContent,
    recordAbuseStrike,
    checkUserSpam,
    canSendGlobalOutbound
} from './pmGuard.js';

const PLAYER_COMMANDS = new Set([
    '.r', '!r', '.rs', '!rs', '.rc', '!rc', '.rm', '!rm', '.rt', '!rt',
    '.me', '!me', '.mypp', '!mypp', '.tm', '!tm', '.topmulti', '!topmulti'
]);

const RECOMMEND_COMMANDS = new Set([
    '.rec', '!rec', '.rnd', '!rnd', '.random', '!random'
]);

const MAP_COMMANDS = new Set([
    '.map', '!map', '.m', '.dl', '!dl', '.dlmap', '!dlmap', '.link', '!link'
]);

const HELP_COMMANDS = new Set([
    '.help', '!help', '.info', '!info'
]);

async function resolveSenderCountryAndLang(senderUsername) {
    const cachedCountry = getCachedUserCountry(senderUsername);
    if (cachedCountry) {
        return {
            country: cachedCountry,
            lang: resolvePmLanguage(cachedCountry)
        };
    }

    let country = await fetchUserCountryCode(senderUsername);
    if (!country) {
        const profile = await getUserProfile(senderUsername).catch(() => null);
        country = profile?.country_code || null;
    }

    const normalizedCountry = String(country || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    setCachedUserCountry(senderUsername, normalizedCountry);

    return {
        country: normalizedCountry,
        lang: resolvePmLanguage(normalizedCountry)
    };
}

function extractAiReplyText(rawResult) {
    if (!rawResult) return null;
    if (typeof rawResult === 'object') {
        return rawResult.reply || null;
    }
    try {
        const parsed = JSON.parse(rawResult);
        if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
            return parsed.reply.trim();
        }
    } catch {
        // Fallback nếu kết quả không phải JSON
    }
    const text = String(rawResult).trim();
    return text || null;
}

async function replyWithAi(replyTarget, senderUsername, userPrompt, country, lang) {
    try {
        const context = {
            mode: 'pm',
            sender: senderUsername,
            userCountry: country,
            roomLanguage: lang,
            roomName: 'Private Message'
        };
        const aiRaw = await askYue(`pm_${senderUsername}`, senderUsername, userPrompt, null, false, context);
        const replyText = extractAiReplyText(aiRaw);
        if (replyText) {
            await replyTarget.sendMessage(replyText);
        } else {
            await replyTarget.sendMessage(t('pm.aiFallback', lang, senderUsername));
        }
    } catch (err) {
        console.error(`❌ [PM Assistant AI Error] (${senderUsername}):`, err.message);
        await replyTarget.sendMessage(t('pm.aiError', lang, senderUsername));
    }
}

function handleOwnerSelfMessage(message, rawContent) {
    if (rawContent.startsWith('YUE')) return;

    const lower = rawContent.toLowerCase();
    if (lower === '.pm off' || lower === '!pm off') {
        setPmAssistantEnabled(false);
        console.log('[PM Assistant] 🔴 Chủ nick đã TẮT chế độ PM Assistant.');
        return;
    }
    if (lower === '.pm on' || lower === '!pm on') {
        setPmAssistantEnabled(true);
        console.log('[PM Assistant] 🟢 Chủ nick đã BẬT chế độ PM Assistant.');
        return;
    }
    if (lower === '.afk on' || lower === '!afk on') {
        setAutoGreetEnabled(true);
        console.log('[PM Assistant] 🟢 Chủ nick đã BẬT lời chào tự động (AFK).');
        return;
    }
    if (lower === '.afk off' || lower === '!afk off') {
        setAutoGreetEnabled(false);
        console.log('[PM Assistant] 🔴 Chủ nick đã TẮT lời chào tự động (AFK).');
        return;
    }

    const recipientName = message.recipient?.ircUsername || message.recipient?.username;
    if (recipientName) {
        const muteMs = botConfig.osuPmAssistant?.ownerMuteMs ?? (15 * 60 * 1000);
        markOwnerChattedWith(recipientName, muteMs);
    }
}

/**
 * Xử lý toàn bộ tin nhắn riêng (PM) gửi tới tài khoản Bancho IRC
 */
export async function handleBanchoPM(message) {
    try {
        if (!message) return;
        const rawContent = message.message?.trim() || '';
        if (!rawContent) return;

        // 1. Xử lý tin nhắn do chính chủ nick gửi đi (tránh tự lặp + công tắc điều khiển)
        if (message.self === true) {
            handleOwnerSelfMessage(message, rawContent);
            return;
        }

        const pmCfg = botConfig.osuPmAssistant || {};
        if (!isPmAssistantEnabled(pmCfg.enabled ?? true)) return;

        const senderUsername = message.user?.ircUsername || message.user?.username || '';
        if (!senderUsername || isIgnoredBot(senderUsername) || rawContent.startsWith('YUE')) {
            return;
        }

        const cooldownMs = pmCfg.commandCooldownMs ?? 3000;
        const greetCooldownMs = pmCfg.greetCooldownMs ?? (6 * 60 * 60 * 1000);

        const replyTarget = {
            name: `pm_${senderUsername.toLowerCase()}`,
            sendMessage: async (text) => {
                const singleLine = String(text || '').replace(/[\r\n]+/g, ' ').trim();
                if (!singleLine) return;
                if (!canSendGlobalOutbound(pmCfg)) {
                    console.warn(`[PM Guard] ⚠️ Global outbound rate limit reached, dropping reply to ${senderUsername}.`);
                    return;
                }
                const finalMsg = singleLine.startsWith('YUE') ? singleLine : `YUE: ${singleLine}`;
                return await message.user.sendMessage(finalMsg.slice(0, 440));
            }
        };

        // 2. Lớp bảo vệ chống spam & lặp tin nhắn bảo vệ nick cá nhân
        if (pmCfg.antiSpam !== false) {
            const spamCheck = checkUserSpam(senderUsername, rawContent, pmCfg);
            if (!spamCheck.allowed) {
                if (spamCheck.action === 'warn_once') {
                    const { lang } = await resolveSenderCountryAndLang(senderUsername);
                    await replyTarget.sendMessage(t('pm.spamWarning', lang));
                }
                return;
            }
        }

        // 3. Lớp lọc ngôn từ thô tục, xúc phạm hoặc công kích cá nhân
        if (pmCfg.contentFilter !== false) {
            const abuse = checkAbusiveContent(rawContent);
            if (abuse.flagged) {
                const strikeRes = recordAbuseStrike(senderUsername, pmCfg);
                console.warn(`[PM Guard] 🛡️ Chặn nội dung vi phạm từ ${senderUsername} (${abuse.reason}, strikes=${strikeRes.strikes})`);
                if (strikeRes.shouldReply) {
                    const { lang } = await resolveSenderCountryAndLang(senderUsername);
                    await replyTarget.sendMessage(t('pm.abusiveRefusal', lang));
                }
                return;
            }
        }

        // 4. Nhánh /np (Now Playing)
        if (parseNpMessage(rawContent)) {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            await handlePmNowPlaying(replyTarget, rawContent, senderUsername);
            return;
        }

        // 5. Nhánh lệnh cứng (.xxx hoặc !xxx)
        const parts = rawContent.split(/ +/);
        const firstWord = parts[0].toLowerCase();
        const commandArgs = parts.slice(1);

        if (HELP_COMMANDS.has(firstWord)) {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            const { lang } = await resolveSenderCountryAndLang(senderUsername);
            await replyTarget.sendMessage(t('pm.help', lang));
            return;
        }

        if (PLAYER_COMMANDS.has(firstWord)) {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            const { lang } = await resolveSenderCountryAndLang(senderUsername);
            await handlePlayerCommands(replyTarget, message, commandArgs, firstWord, { lang });
            return;
        }

        if (RECOMMEND_COMMANDS.has(firstWord)) {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            const { lang } = await resolveSenderCountryAndLang(senderUsername);
            await handlePmRecommend(replyTarget, commandArgs, senderUsername, lang);
            return;
        }

        if (MAP_COMMANDS.has(firstWord)) {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            const lastMapId = getUserLastMap(senderUsername);
            if (lastMapId) {
                await sendBeatmapInfoAndDL(replyTarget, lastMapId, { force: true });
            } else {
                const { lang } = await resolveSenderCountryAndLang(senderUsername);
                await replyTarget.sendMessage(t('pm.noLastMap', lang));
            }
            return;
        }

        if (firstWord === '.yue' || firstWord === '!yue') {
            if (isOnCommandCooldown(senderUsername, cooldownMs)) return;
            const { country, lang } = await resolveSenderCountryAndLang(senderUsername);
            const userPrompt = commandArgs.join(' ').trim();
            if (!userPrompt) {
                await replyTarget.sendMessage(t('pm.yueEmpty', lang, senderUsername));
                return;
            }
            await replyWithAi(replyTarget, senderUsername, userPrompt, country, lang);
            return;
        }

        // 6. Nhánh tin nhắn thường (không phải lệnh, không phải /np)
        if (isOwnerMuted(senderUsername)) return;

        if (isAutoGreetEnabled(pmCfg.autoGreet ?? true) && shouldAutoGreet(senderUsername, greetCooldownMs)) {
            const { lang } = await resolveSenderCountryAndLang(senderUsername);
            await replyTarget.sendMessage(t('pm.autoGreet', lang, senderUsername));
            return;
        }

        if (pmCfg.autoAiReply === true && !isOnCommandCooldown(senderUsername, cooldownMs)) {
            const { country, lang } = await resolveSenderCountryAndLang(senderUsername);
            await replyWithAi(replyTarget, senderUsername, rawContent, country, lang);
        }
    } catch (err) {
        console.error('❌ [PM Assistant Error]:', err?.message || err);
    }
}

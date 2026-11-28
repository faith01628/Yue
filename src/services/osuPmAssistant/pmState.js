/**
 * Quản lý trạng thái phiên làm việc cho osu! PM Assistant (in-memory)
 */

const DEFAULT_GREET_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 tiếng
const DEFAULT_OWNER_MUTE_MS = 15 * 60 * 1000;         // 15 phút
const DEFAULT_COMMAND_COOLDOWN_MS = 3000;             // 3 giây
const DEFAULT_COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ

const IGNORED_BOTS = new Set([
    'banchobot',
    'tillerino',
    'osu!',
    'smoogi',
    'cho',
    'peppy'
]);

let runtimeEnabledOverride = null;
let runtimeAutoGreetOverride = null;

const commandCooldowns = new Map();
const lastGreetedAt = new Map();
const ownerMutedUntil = new Map();
const userLastMapId = new Map();
const userCountryCache = new Map();

function normalizeKey(username) {
    return String(username || '').trim().toLowerCase();
}

export function isPmAssistantEnabled(configEnabled = true) {
    if (runtimeEnabledOverride !== null) return runtimeEnabledOverride;
    return Boolean(configEnabled);
}

export function setPmAssistantEnabled(val) {
    runtimeEnabledOverride = Boolean(val);
    return runtimeEnabledOverride;
}

export function isAutoGreetEnabled(configAutoGreet = true) {
    if (runtimeAutoGreetOverride !== null) return runtimeAutoGreetOverride;
    return Boolean(configAutoGreet);
}

export function setAutoGreetEnabled(val) {
    runtimeAutoGreetOverride = Boolean(val);
    return runtimeAutoGreetOverride;
}

export function isOnCommandCooldown(username, cooldownMs = DEFAULT_COMMAND_COOLDOWN_MS) {
    const key = normalizeKey(username);
    if (!key) return false;
    const now = Date.now();
    const last = commandCooldowns.get(key) || 0;
    if (now - last < cooldownMs) {
        return true;
    }
    commandCooldowns.set(key, now);
    return false;
}

export function shouldAutoGreet(username, greetCooldownMs = DEFAULT_GREET_COOLDOWN_MS) {
    const key = normalizeKey(username);
    if (!key) return false;
    const now = Date.now();
    const last = lastGreetedAt.get(key) || 0;
    if (now - last < greetCooldownMs) {
        return false;
    }
    lastGreetedAt.set(key, now);
    return true;
}

export function markOwnerChattedWith(username, muteMs = DEFAULT_OWNER_MUTE_MS) {
    const key = normalizeKey(username);
    if (!key) return;
    ownerMutedUntil.set(key, Date.now() + muteMs);
}

export function isOwnerMuted(username) {
    const key = normalizeKey(username);
    if (!key) return false;
    const until = ownerMutedUntil.get(key) || 0;
    if (!until) return false;
    if (Date.now() >= until) {
        ownerMutedUntil.delete(key);
        return false;
    }
    return true;
}

export function setUserLastMap(username, beatmapId) {
    const key = normalizeKey(username);
    if (!key || !beatmapId) return;
    userLastMapId.set(key, String(beatmapId));
}

export function getUserLastMap(username) {
    const key = normalizeKey(username);
    if (!key) return null;
    return userLastMapId.get(key) || null;
}

export function getCachedUserCountry(username) {
    const key = normalizeKey(username);
    if (!key) return null;
    const entry = userCountryCache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        userCountryCache.delete(key);
        return null;
    }
    return entry.country;
}

export function setCachedUserCountry(username, country, ttlMs = DEFAULT_COUNTRY_CACHE_TTL_MS) {
    const key = normalizeKey(username);
    if (!key) return;
    userCountryCache.set(key, {
        country: String(country || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN',
        expiresAt: Date.now() + ttlMs
    });
}

export function resolvePmLanguage(countryCode) {
    return String(countryCode || '').trim().toUpperCase() === 'VN' ? 'vi' : 'en';
}

export function isIgnoredBot(username) {
    const key = normalizeKey(username);
    return IGNORED_BOTS.has(key);
}

export function resetPmStateForTest() {
    runtimeEnabledOverride = null;
    runtimeAutoGreetOverride = null;
    commandCooldowns.clear();
    lastGreetedAt.clear();
    ownerMutedUntil.clear();
    userLastMapId.clear();
    userCountryCache.clear();
}

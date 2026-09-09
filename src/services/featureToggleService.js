import fs from 'fs';
import path from 'path';
import { botConfig, isFeatureOn, isHeavyLibraryOn } from '../config/botConfig.js';

const TOGGLES_FILE = path.resolve('src/data/featureToggles.json');

const DEFAULT_TOGGLES = {
    chatDiscord: botConfig.discord?.aiChat ?? true,
    voiceDiscord: (botConfig.voice?.enabled ?? true) && isHeavyLibraryOn('voice'),
    osuCommandsDiscord: botConfig.osuDiscordCommands?.enabled ?? true,
    multiOsu: botConfig.osuMultiplayer?.enabled ?? true
};

function ensureTogglesFile() {
    const dir = path.dirname(TOGGLES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(TOGGLES_FILE)) fs.writeFileSync(TOGGLES_FILE, JSON.stringify(DEFAULT_TOGGLES, null, 2), 'utf-8');
}

export function loadFeatureToggles() {
    ensureTogglesFile();
    try {
        const data = fs.readFileSync(TOGGLES_FILE, 'utf-8');
        return { ...DEFAULT_TOGGLES, ...JSON.parse(data) };
    } catch (err) {
        console.error('❌ Lỗi đọc file featureToggles.json:', err.message);
        return DEFAULT_TOGGLES;
    }
}

export function saveFeatureToggles(toggles) {
    ensureTogglesFile();
    try {
        fs.writeFileSync(TOGGLES_FILE, JSON.stringify(toggles, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('❌ Lỗi ghi file featureToggles.json:', err.message);
        return false;
    }
}

/**
 * Kiểm tra xem 1 tính năng có đang được bật hay không (Kết hợp giữa botConfig.js và runtime toggles)
 */
export function isFeatureEnabled(featureName) {
    // 1. Kiểm tra cấu hình cứng từ botConfig.js trước
    if (featureName === 'voiceDiscord' && (!botConfig.voice?.enabled || !isHeavyLibraryOn('voice'))) {
        return false;
    }
    if (featureName === 'chatDiscord' && !botConfig.discord?.aiChat) {
        return false;
    }
    if (featureName === 'osuCommandsDiscord' && !botConfig.osuDiscordCommands?.enabled) {
        return false;
    }
    if (featureName === 'multiOsu' && !botConfig.osuMultiplayer?.enabled) {
        return false;
    }
    if (featureName === 'normalRooms' && (!botConfig.osuMultiplayer?.enabled || !botConfig.osuMultiplayer?.normalRooms)) {
        return false;
    }
    if (featureName === 'community247Rooms' && (!botConfig.osuMultiplayer?.enabled || !botConfig.osuMultiplayer?.community247Rooms)) {
        return false;
    }

    // 2. Kiểm tra công tắc động từ Discord runtime
    const toggles = loadFeatureToggles();
    return toggles[featureName] ?? true;
}

/**
 * Bật/tắt 1 tính năng cụ thể thời gian thực
 */
export function setFeatureState(featureName, state) {
    const toggles = loadFeatureToggles();
    toggles[featureName] = Boolean(state);
    saveFeatureToggles(toggles);
    return toggles;
}

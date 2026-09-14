import fs from 'fs';
import path from 'path';
import { botConfig, isHeavyLibraryOn } from './botConfig.js';
import { safeReadJSON, safeWriteJSON } from '../storage/safeStorage.js';

const TOGGLES_FILE = path.resolve('data/featureToggles.json');

const DEFAULT_TOGGLES = {
    chatDiscord: botConfig.discord?.aiChat ?? true,
    voiceDiscord: (botConfig.voice?.enabled ?? true) && isHeavyLibraryOn('voice'),
    osuCommandsDiscord: botConfig.osuDiscordCommands?.enabled ?? true,
    multiOsu: botConfig.osuMultiplayer?.enabled ?? true
};

export function loadFeatureToggles() {
    const data = safeReadJSON(TOGGLES_FILE, DEFAULT_TOGGLES);
    return { ...DEFAULT_TOGGLES, ...data };
}

export function saveFeatureToggles(toggles) {
    return safeWriteJSON(TOGGLES_FILE, toggles);
}

export function isFeatureEnabled(featureName) {
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

    const toggles = loadFeatureToggles();
    return toggles[featureName] ?? true;
}

export function setFeatureState(featureName, state) {
    const toggles = loadFeatureToggles();
    toggles[featureName] = Boolean(state);
    saveFeatureToggles(toggles);
    return toggles;
}

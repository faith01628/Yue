import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';

const MEMORY_FILE = path.resolve('data/multi247Memory.json');

function ensureMemoryFile() {
    safeReadJSON(MEMORY_FILE, {});
}

function loadMemoryData() {
    return safeReadJSON(MEMORY_FILE, {});
}

function saveMemoryData(data) {
    return safeWriteJSON(MEMORY_FILE, data);
}

/**
 * Lấy thông tin bộ nhớ của 1 player trong room 24/7
 */
export function getPlayer247Memory(username) {
    if (!username) return null;
    const memory = loadMemoryData();
    return memory[username.toLowerCase()] || null;
}

/**
 * Cập nhật hoặc lưu thông tin bộ nhớ player 24/7
 */
export function updatePlayer247Memory(username, updateFields = {}) {
    if (!username) return null;
    const key = username.toLowerCase();
    const memory = loadMemoryData();

    const existing = memory[key] || {
        username: username,
        country: null,
        preferredLanguage: 'auto',
        relationship: 'stranger', // stranger | regular | friend
        isVietnameseAbroad: false,
        visitCount: 0,
        notes: [],
        toxicStrikes: 0,
        lastStrikeTime: 0,
        banCount: 0,
        banUntil: 0,
        isPermanentBanned: false,
        lastSeen: Date.now()
    };

    const updated = {
        ...existing,
        ...updateFields,
        username: username,
        visitCount: (existing.visitCount || 0) + (updateFields.visitCountInc ? 1 : 0),
        lastSeen: Date.now()
    };

    delete updated.visitCountInc;

    memory[key] = updated;
    saveMemoryData(memory);
    return updated;
}

/**
 * Thêm một ghi chú vào bộ nhớ của người chơi
 */
export function addNoteToPlayerMemory(username, noteText) {
    if (!username || !noteText) return;
    const playerMem = getPlayer247Memory(username) || updatePlayer247Memory(username);
    const notes = playerMem.notes || [];
    if (!notes.includes(noteText)) {
        notes.push(noteText);
        if (notes.length > 10) notes.shift(); // Tối đa 10 ghi chú gần nhất
        updatePlayer247Memory(username, { notes });
    }
}

import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../domains/shared/storage/safeStorage.js';

export const EVOLUTION_DIR = path.resolve('data/evolution');
export const SIGNALS_FILE = path.join(EVOLUTION_DIR, 'signals.json');
export const PROPOSALS_FILE = path.join(EVOLUTION_DIR, 'proposals.json');
export const LESSONS_FILE = path.join(EVOLUTION_DIR, 'lessons.json');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SIGNALS = 100;
const MAX_SAMPLES_PER_SIGNAL = 5;

function ensureEvolutionDir() {
    if (!fs.existsSync(EVOLUTION_DIR)) {
        fs.mkdirSync(EVOLUTION_DIR, { recursive: true });
    }
}

export function normalizeTopicKey(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64) || 'general_issue';
}

function readProposalsStore() {
    ensureEvolutionDir();
    const raw = safeReadJSON(PROPOSALS_FILE, { items: [], autoProposalTimestamps: [] });
    if (Array.isArray(raw)) {
        return { items: raw, autoProposalTimestamps: [] };
    }
    return {
        items: Array.isArray(raw?.items) ? raw.items : [],
        autoProposalTimestamps: Array.isArray(raw?.autoProposalTimestamps) ? raw.autoProposalTimestamps : []
    };
}

function writeProposalsStore(store) {
    ensureEvolutionDir();
    return safeWriteJSON(PROPOSALS_FILE, store);
}

/**
 * Ghi nhận 1 tín hiệu thực tế (lỗi lặp lại, thiếu tính năng, nhầm lệnh...)
 */
export function recordSignal({ type = 'error', key = '', summary = '', source = 'system', sample = '' } = {}) {
    ensureEvolutionDir();
    const topicKey = normalizeTopicKey(key || summary);
    const data = safeReadJSON(SIGNALS_FILE, { items: [] });
    const items = Array.isArray(data?.items) ? data.items : [];
    const now = Date.now();

    const sampleStr = String(sample || summary || '').trim().slice(0, 300);
    let existing = items.find(i => i.topicKey === topicKey);

    if (existing) {
        existing.count = (existing.count || 1) + 1;
        existing.lastSeenAt = now;
        if (summary) existing.summary = String(summary).slice(0, 500);
        if (sampleStr && (!Array.isArray(existing.samples) || !existing.samples.includes(sampleStr))) {
            existing.samples = [...(existing.samples || []), sampleStr].slice(-MAX_SAMPLES_PER_SIGNAL);
        }
    } else {
        existing = {
            topicKey,
            type,
            key: String(key || topicKey).slice(0, 120),
            summary: String(summary || key || '').slice(0, 500),
            source,
            count: 1,
            samples: sampleStr ? [sampleStr] : [],
            firstSeenAt: now,
            lastSeenAt: now
        };
        items.push(existing);
    }

    items.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    const trimmed = items.slice(0, MAX_SIGNALS);
    safeWriteJSON(SIGNALS_FILE, { items: trimmed });
    return existing;
}

export function getSignals() {
    ensureEvolutionDir();
    const data = safeReadJSON(SIGNALS_FILE, { items: [] });
    return Array.isArray(data?.items) ? data.items : [];
}

export function clearSignal(topicKey) {
    ensureEvolutionDir();
    const norm = normalizeTopicKey(topicKey);
    const items = getSignals().filter(i => i.topicKey !== norm && i.topicKey !== topicKey);
    return safeWriteJSON(SIGNALS_FILE, { items });
}

export function getProposals() {
    return readProposalsStore().items;
}

export function findProposalByTopic(topicKey) {
    const norm = normalizeTopicKey(topicKey);
    const items = getProposals();
    return items.find(p => p.topicKey === norm || p.topicKey === topicKey) || null;
}

export function findProposalByThreadId(threadId) {
    if (!threadId) return null;
    return getProposals().find(p => String(p.threadId) === String(threadId)) || null;
}

export function saveProposal(proposal) {
    const store = readProposalsStore();
    const id = proposal.id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record = {
        id,
        topicKey: normalizeTopicKey(proposal.topicKey || proposal.title),
        title: proposal.title || 'Đề xuất nâng cấp',
        status: proposal.status || 'open',
        sourceType: proposal.sourceType || 'auto',
        channelId: proposal.channelId || null,
        messageId: proposal.messageId || null,
        threadId: proposal.threadId || null,
        analysis: proposal.analysis || '',
        copyPastePrompt: proposal.copyPastePrompt || '',
        relatedFiles: Array.isArray(proposal.relatedFiles) ? proposal.relatedFiles : [],
        createdAt: proposal.createdAt || Date.now(),
        updatedAt: Date.now()
    };

    const idx = store.items.findIndex(p => p.id === id);
    if (idx !== -1) {
        store.items[idx] = record;
    } else {
        store.items.unshift(record);
    }

    writeProposalsStore(store);
    return record;
}

export function updateProposalStatus(idOrThreadId, status, extra = {}) {
    const store = readProposalsStore();
    const target = store.items.find(
        p => p.id === idOrThreadId || (p.threadId && String(p.threadId) === String(idOrThreadId))
    );
    if (!target) return null;

    target.status = status;
    target.updatedAt = Date.now();
    Object.assign(target, extra);

    writeProposalsStore(store);
    return target;
}

export function getDailyAutoProposalTimestamps() {
    const store = readProposalsStore();
    const cutoff = Date.now() - ONE_DAY_MS;
    return store.autoProposalTimestamps.filter(ts => typeof ts === 'number' && ts >= cutoff);
}

export function recordAutoProposalTimestamp(ts = Date.now()) {
    const store = readProposalsStore();
    const cutoff = Date.now() - ONE_DAY_MS;
    store.autoProposalTimestamps = store.autoProposalTimestamps
        .filter(t => typeof t === 'number' && t >= cutoff);
    store.autoProposalTimestamps.push(ts);
    writeProposalsStore(store);
    return store.autoProposalTimestamps;
}

export function getLessons() {
    ensureEvolutionDir();
    const data = safeReadJSON(LESSONS_FILE, { items: [] });
    return Array.isArray(data?.items) ? data.items : [];
}

export function addLesson(text, addedBy = 'Katashi') {
    const clean = String(text || '').trim();
    if (!clean) return null;

    ensureEvolutionDir();
    const items = getLessons();
    const existing = items.find(l => l.text.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;

    const entry = {
        id: `L${Date.now().toString(36).toUpperCase()}`,
        text: clean.slice(0, 400),
        addedBy,
        createdAt: Date.now()
    };
    items.unshift(entry);
    safeWriteJSON(LESSONS_FILE, { items: items.slice(0, 50) });
    return entry;
}

export function deleteLesson(idOrIndex) {
    const items = getLessons();
    const target = String(idOrIndex || '').trim().toLowerCase();
    let idx = items.findIndex(l => l.id.toLowerCase() === target);
    if (idx === -1 && /^\d+$/.test(target)) {
        const numIdx = parseInt(target, 10) - 1;
        if (numIdx >= 0 && numIdx < items.length) idx = numIdx;
    }
    if (idx === -1) return null;

    const [removed] = items.splice(idx, 1);
    safeWriteJSON(LESSONS_FILE, { items });
    return removed;
}

export function formatLessonsForPrompt(limit = 8) {
    const items = getLessons().slice(0, limit);
    if (items.length === 0) return '';
    return items.map((l, i) => `${i + 1}. ${l.text}`).join('\n');
}

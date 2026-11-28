import {
    normalizeTopicKey,
    findProposalByTopic,
    getDailyAutoProposalTimestamps
} from './evolutionStore.js';

export { normalizeTopicKey };

/**
 * Kiểm tra điều kiện chống spam & chống trùng lặp trước khi tự động mở đề xuất mới
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canCreateAutoProposal(topicKey, signalCount = 0, cfg = {}) {
    const minSignalCount = cfg.minSignalCount ?? 3;
    const maxPerDay = cfg.maxProposalsPerDay ?? 2;
    const minIntervalMs = cfg.minIntervalMs ?? (6 * 60 * 60 * 1000);

    if (signalCount < minSignalCount) {
        return { allowed: false, reason: `below_threshold (${signalCount}/${minSignalCount})` };
    }

    const existing = findProposalByTopic(topicKey);
    if (existing && ['open', 'discussing', 'done', 'rejected'].includes(existing.status)) {
        return { allowed: false, reason: `duplicate_status_${existing.status}` };
    }

    const recentTimestamps = getDailyAutoProposalTimestamps();
    if (recentTimestamps.length >= maxPerDay) {
        return { allowed: false, reason: `daily_cap_reached (${recentTimestamps.length}/${maxPerDay})` };
    }

    if (recentTimestamps.length > 0) {
        const latestTs = Math.max(...recentTimestamps);
        if (Date.now() - latestTs < minIntervalMs) {
            return { allowed: false, reason: 'cooldown_active' };
        }
    }

    return { allowed: true, reason: 'ok' };
}

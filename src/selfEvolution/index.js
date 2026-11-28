import { botConfig } from '../domains/shared/config/botConfig.js';
import {
    recordSignal,
    getSignals,
    formatLessonsForPrompt
} from './evolutionStore.js';
import { canCreateAutoProposal } from './proposalGuard.js';
import { generateUpgradeProposal, publishProposalToDiscord } from './proposalGenerator.js';
import { handleEvolutionMessage } from './devThreadHandler.js';

let evolutionLoopTimer = null;

export {
    recordSignal,
    formatLessonsForPrompt,
    handleEvolutionMessage
};

export async function runAutoProposalCheck(client) {
    const cfg = botConfig.selfEvolution || {};
    if (!cfg.enabled || !cfg.autoPropose || !client) return null;

    const targetChannelId = cfg.channelId || process.env.ADMIN_EVOLUTION_CHANNEL_ID || process.env.ADMIN_DEBUG_CHANNEL_ID;
    if (!targetChannelId) return null;

    const signals = getSignals();
    for (const sig of signals) {
        const guard = canCreateAutoProposal(sig.topicKey, sig.count, cfg);
        if (!guard.allowed) continue;

        const proposalData = await generateUpgradeProposal({
            topic: sig.key || sig.topicKey,
            summary: sig.summary,
            signalCount: sig.count,
            samples: sig.samples,
            cfg
        });

        const published = await publishProposalToDiscord(client, proposalData, cfg, 'auto');
        if (published) {
            const { recordAutoProposalTimestamp } = await import('./evolutionStore.js');
            recordAutoProposalTimestamp();
            console.log(`[SelfEvolution] 🧠 Đã tự đề xuất nâng cấp "${published.title}" vào Thread Admin.`);
            return published;
        }
    }

    return null;
}

export function startSelfEvolutionLoop(client) {
    const cfg = botConfig.selfEvolution || {};
    if (!cfg.enabled) return;
    if (evolutionLoopTimer) clearInterval(evolutionLoopTimer);

    const intervalMs = cfg.checkIntervalMs ?? (30 * 60 * 1000);
    evolutionLoopTimer = setInterval(() => {
        runAutoProposalCheck(client).catch(err => {
            console.error('[SelfEvolution Loop Error]:', err.message);
        });
    }, intervalMs);

    console.log(`🧠 [SelfEvolution] Đã kích hoạt theo dõi phát triển (Data: data/evolution/ | Auto-propose: ${cfg.autoPropose ? 'BẬT' : 'TẮT'}).`);
}

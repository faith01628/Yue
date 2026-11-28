import { EmbedBuilder } from 'discord.js';
import { askYue } from '../services/aiService.js';
import { botConfig } from '../domains/shared/config/botConfig.js';
import { gatherCodeContextForTopic } from './repoReader.js';
import { saveProposal } from './evolutionStore.js';

function buildFallbackPrompt({ topic, summary, branch, relatedFiles, samples }) {
    const filesText = relatedFiles.length > 0
        ? relatedFiles.map(f => `  - \`${f}\`: kiểm tra logic liên quan đến vấn đề này`).join('\n')
        : '  - `src/...`: kiểm tra module liên quan';
    const sampleNote = samples && samples.length > 0
        ? ` (Ví dụ gần nhất: ${samples[samples.length - 1]})`
        : '';

    return `[YUE UPGRADE TASK | Branch: ${branch}]
- Mục tiêu: Xử lý và cải thiện vấn đề "${topic}"
- Bối cảnh thực tế: ${summary || topic}${sampleNote}
- File & hàm liên quan (trên nhánh ${branch}):
${filesText}
- Yêu cầu triển khai:
  1. Kiểm tra nguyên nhân gốc trong các file liên quan ở trên.
  2. Bổ sung xử lý/an toàn hóa trường hợp gặp lỗi hoặc nâng cấp trải nghiệm người dùng.
- Ràng buộc & Kiểm tra:
  - Giữ tương thích ngược, không phá vỡ lệnh hiện tại
  - Kiểm tra bằng \`node --check\` và unit test`;
}

function parseArchitectJson(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Dùng AI đọc code nhánh `dev` + tín hiệu thực tế -> sinh phân tích & khối Copy-Paste Prompt
 */
export async function generateUpgradeProposal({ topic, summary = '', signalCount = 1, samples = [], cfg = botConfig.selfEvolution || {} }) {
    const { repo, branch, relatedFiles, codeContext } = await gatherCodeContextForTopic(`${topic} ${summary}`, cfg);

    const userPrompt = [
        `Hãy phân tích đề xuất nâng cấp cho chủ đề: "${topic}".`,
        summary ? `Mô tả / Bối cảnh thực tế (gặp ${signalCount} lần): ${summary}` : '',
        samples && samples.length > 0 ? `Mẫu thực tế: ${samples.join(' | ')}` : '',
        'Hãy xuất title, analysis ngắn gọn và copyPastePrompt đúng chuẩn [YUE UPGRADE TASK | Branch: dev].'
    ].filter(Boolean).join('\n');

    let parsed = null;
    try {
        const rawRes = await askYue('dev_architect_proposer', 'Katashi', userPrompt, null, false, {
            mode: 'dev_architect',
            repo,
            branch,
            topic,
            proposalSummary: summary,
            codeContext
        });
        parsed = parseArchitectJson(rawRes);
    } catch (err) {
        console.warn('[SelfEvolution ProposalGenerator] Fallback template due to AI error:', err.message);
    }

    const title = (parsed?.title || topic || 'Đề xuất nâng cấp Yue').slice(0, 80);
    const analysis = (parsed?.analysis || parsed?.reply || summary || 'Phát hiện tín hiệu cần kiểm tra và nâng cấp trên nhánh dev.').slice(0, 1200);
    const copyPastePrompt = (parsed?.copyPastePrompt && parsed.copyPastePrompt.includes('[YUE UPGRADE TASK'))
        ? parsed.copyPastePrompt
        : buildFallbackPrompt({ topic: title, summary, branch, relatedFiles, samples });

    return {
        title,
        topicKey: topic,
        analysis,
        copyPastePrompt,
        relatedFiles,
        signalCount,
        repo,
        branch
    };
}

/**
 * Đăng đề xuất vào kênh Admin Discord & tự mở 1 Thread riêng kèm Copy-Paste Prompt
 */
export async function publishProposalToDiscord(client, proposalData, cfg = botConfig.selfEvolution || {}, sourceType = 'auto') {
    const targetChannelId = cfg.channelId || process.env.ADMIN_EVOLUTION_CHANNEL_ID || process.env.ADMIN_DEBUG_CHANNEL_ID;
    if (!client || !targetChannelId) {
        console.warn('[SelfEvolution] ⚠️ Chưa cấu hình ADMIN_EVOLUTION_CHANNEL_ID / ADMIN_DEBUG_CHANNEL_ID.');
        return null;
    }

    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const filesText = proposalData.relatedFiles?.length > 0
        ? proposalData.relatedFiles.map(f => `• \`${f}\``).join('\n')
        : '• *(Chưa khoanh vùng được file cụ thể)*';

    const embed = new EmbedBuilder()
        .setColor(sourceType === 'auto' ? 0xF39C12 : 0x9B59B6)
        .setTitle(`🧠 [YUE TỰ ĐỀ XUẤT NÂNG CẤP] ${proposalData.title}`)
        .setDescription(proposalData.analysis.slice(0, 1800))
        .addFields(
            { name: '📊 Tín hiệu thực tế', value: `${proposalData.signalCount || 1} lần (${sourceType === 'auto' ? 'Tự động phát hiện' : 'Chủ động yêu cầu'})`, inline: true },
            { name: '🌿 Nhánh tham chiếu', value: `\`${proposalData.repo || 'faith01628/Yue'}\` (\`${proposalData.branch || 'dev'}\`)`, inline: true },
            { name: '📂 File liên quan', value: filesText, inline: false }
        )
        .setFooter({ text: 'Vào Thread bên dưới để trao đổi với Yue • Lệnh: .spec | .done | .reject' })
        .setTimestamp();

    const msg = await channel.send({ embeds: [embed] });
    let thread = null;

    if (typeof msg.startThread === 'function') {
        try {
            thread = await msg.startThread({
                name: `💡 ${proposalData.title}`.slice(0, 95),
                autoArchiveDuration: 1440
            });
        } catch (tErr) {
            console.warn('[SelfEvolution] Không thể mở Thread tự động:', tErr.message);
        }
    }

    const targetBox = thread || channel;
    await targetBox.send(
        `📋 **Prompt chuẩn sẵn sàng Copy-Paste:**\n\`\`\`markdown\n${proposalData.copyPastePrompt.slice(0, 1850)}\n\`\`\`\n` +
        `💬 *Katashi có thể nhắn trực tiếp trong Thread này để bàn thêm với tui. Khi chốt xong gõ \`.spec\` để xuất bản cuối, \`.done\` nếu đã làm xong, hoặc \`.reject\` để bỏ qua ý tưởng này nhé!*`
    );

    return saveProposal({
        topicKey: proposalData.topicKey || proposalData.title,
        title: proposalData.title,
        status: 'open',
        sourceType,
        channelId: channel.id,
        messageId: msg.id,
        threadId: thread?.id || null,
        analysis: proposalData.analysis,
        copyPastePrompt: proposalData.copyPastePrompt,
        relatedFiles: proposalData.relatedFiles
    });
}

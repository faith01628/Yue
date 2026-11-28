import { botConfig } from '../domains/shared/config/botConfig.js';
import { isOwnerUser } from '../services/ownerAssistantService.js';
import { askYue } from '../services/aiService.js';
import { gatherCodeContextForTopic } from './repoReader.js';
import {
    getLessons,
    addLesson,
    deleteLesson,
    getProposals,
    findProposalByThreadId,
    updateProposalStatus
} from './evolutionStore.js';
import { generateUpgradeProposal, publishProposalToDiscord } from './proposalGenerator.js';

function parseArchitectReply(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return { reply: String(raw) };
    }
}

async function fetchThreadHistoryText(channel, limit = 15) {
    try {
        if (!channel?.messages?.fetch) return '';
        const fetched = await channel.messages.fetch({ limit });
        return Array.from(fetched.values())
            .reverse()
            .map(m => `${m.author?.bot ? 'Yue' : (m.author?.username || 'Katashi')}: ${m.content || '[Embed]'}`)
            .join('\n')
            .slice(0, 2500);
    } catch {
        return '';
    }
}

/**
 * Xử lý các lệnh & cuộc trò chuyện tự phát triển của Boss trong Discord Admin/Thread
 * @returns {Promise<boolean>} true nếu tin nhắn đã được xử lý bởi module selfEvolution
 */
export async function handleEvolutionMessage(message, client) {
    if (!message || message.author?.bot) return false;
    const cfg = botConfig.selfEvolution || {};
    if (cfg.enabled === false) return false;

    const content = (message.content || '').trim();
    if (!content) return false;

    const firstWord = content.split(/ +/)[0].toLowerCase();
    const argsText = content.split(/ +/).slice(1).join(' ').trim();
    const isBoss = isOwnerUser(message.author.id);

    // 1. Lệnh dạy bài học Tầng 1 & quản lý đề xuất (chỉ Boss/Katashi được phép dùng)
    if (['.teach', '.dayyue'].includes(firstWord)) {
        if (!isBoss) return false;
        if (!argsText) {
            await message.reply('Cú pháp: `.teach <quy tắc / bài học để Yue nhớ và tự sửa sai>`');
            return true;
        }
        const saved = addLesson(argsText, message.author.username);
        await message.reply(`📘 Đã ghi nhớ bài học mới (**${saved.id}**): *"${saved.text}"*\nTui sẽ áp dụng quy tắc này ở các lần trả lời sau!`);
        return true;
    }

    if (['.lessons', '.baihoc'].includes(firstWord)) {
        if (!isBoss) return false;
        const lessons = getLessons();
        if (lessons.length === 0) {
            await message.reply('📘 Hiện chưa có bài học nào trong `data/evolution/lessons.json`. Dùng `.teach <nội dung>` để dạy tui nhé!');
            return true;
        }
        const list = lessons.slice(0, 15).map((l, i) => `${i + 1}. \`${l.id}\` — ${l.text}`).join('\n');
        await message.reply(`📘 **Sổ tay bài học của Yue (${lessons.length}):**\n${list}\n*(Dùng \`.dellesson <số hoặc ID>\` để xóa)*`);
        return true;
    }

    if (['.dellesson', '.xoabaihoc'].includes(firstWord)) {
        if (!isBoss) return false;
        if (!argsText) {
            await message.reply('Cú pháp: `.dellesson <ID hoặc số thứ tự>`');
            return true;
        }
        const removed = deleteLesson(argsText);
        if (removed) {
            await message.reply(`🗑️ Đã xóa bài học \`${removed.id}\`: *"${removed.text}"*`);
        } else {
            await message.reply(`❌ Không tìm thấy bài học \`${argsText}\`.`);
        }
        return true;
    }

    if (['.proposals', '.dexuat'].includes(firstWord)) {
        if (!isBoss) return false;
        const items = getProposals().slice(0, 10);
        if (items.length === 0) {
            await message.reply('🧠 Chưa có đề xuất nâng cấp nào được ghi nhận.');
            return true;
        }
        const lines = items.map(p => `• \`${p.status.toUpperCase()}\` **${p.title}** ${p.threadId ? `(<#${p.threadId}>)` : ''}`).join('\n');
        await message.reply(`🧠 **Danh sách đề xuất nâng cấp gần nhất:**\n${lines}`);
        return true;
    }

    if (firstWord === '.propose') {
        if (!isBoss) return false;
        if (!argsText) {
            await message.reply('Cú pháp: `.propose <vấn đề hoặc ý tưởng muốn Yue đọc code nhánh dev và lên bản đề xuất>`');
            return true;
        }
        await message.channel.sendTyping();
        const proposalData = await generateUpgradeProposal({
            topic: argsText,
            summary: argsText,
            signalCount: 1,
            samples: [],
            cfg
        });
        const saved = await publishProposalToDiscord(client, proposalData, { ...cfg, channelId: cfg.channelId || message.channel.id }, 'manual');
        if (saved?.threadId) {
            await message.reply(`✅ Đã đọc code nhánh \`${cfg.githubBranch || 'dev'}\` và mở Thread thảo luận riêng tại <#${saved.threadId}>!`);
        } else {
            await message.reply('✅ Đã xuất bản đề xuất nâng cấp.');
        }
        return true;
    }

    // 2. Xử lý hội thoại & lệnh bên trong một Thread Đề Xuất Nâng Cấp
    const threadProposal = findProposalByThreadId(message.channel.id);
    if (!threadProposal || !isBoss) return false;

    if (firstWord === '.done') {
        updateProposalStatus(threadProposal.id, 'done');
        await message.reply('✅ Đã đánh dấu đề xuất này là **DONE**! Tui sẽ không nhắc lại nó nữa.');
        return true;
    }

    if (firstWord === '.reject') {
        updateProposalStatus(threadProposal.id, 'rejected');
        await message.reply('🚫 Đã ghi nhận **REJECT**. Tui sẽ bỏ qua và không tự đề xuất lại chủ đề này.');
        return true;
    }

    if (firstWord === '.spec') {
        await message.channel.sendTyping();
        const threadHistory = await fetchThreadHistoryText(message.channel, 20);
        const { repo, branch, codeContext } = await gatherCodeContextForTopic(`${threadProposal.title} ${threadProposal.analysis}`, cfg);

        const rawRes = await askYue(`dev_spec_${threadProposal.id}`, message.author.username, 'Tổng hợp toàn bộ thảo luận thành bản Copy-Paste Prompt cuối cùng để triển khai ngay.', null, false, {
            mode: 'dev_architect',
            repo,
            branch,
            topic: threadProposal.title,
            proposalSummary: threadProposal.analysis,
            codeContext,
            threadHistory
        });
        const parsed = parseArchitectReply(rawRes);
        const finalPrompt = parsed?.copyPastePrompt || threadProposal.copyPastePrompt;

        updateProposalStatus(threadProposal.id, 'discussing', { copyPastePrompt: finalPrompt });
        await message.reply(`📋 **Bản Spec chốt cuối cùng (Copy-Paste ngay):**\n\`\`\`markdown\n${String(finalPrompt).slice(0, 1850)}\n\`\`\``);
        return true;
    }

    // Bỏ qua các lệnh Discord thông thường khác nếu không phải thảo luận tự nhiên
    if (content.startsWith('.') || content.startsWith('!')) return false;

    await message.channel.sendTyping();
    const threadHistory = await fetchThreadHistoryText(message.channel, 12);
    const { repo, branch, codeContext } = await gatherCodeContextForTopic(`${threadProposal.title} ${content}`, cfg);

    const rawRes = await askYue(`dev_thread_${threadProposal.id}`, message.author.username, content, null, false, {
        mode: 'dev_architect',
        repo,
        branch,
        topic: threadProposal.title,
        proposalSummary: threadProposal.analysis,
        codeContext,
        threadHistory
    });

    const parsed = parseArchitectReply(rawRes);
    const replyText = parsed?.reply || 'Tui đã ghi nhận góp ý của ông. Nếu chốt phương án rồi thì gõ `.spec` để tui xuất lại prompt mới nha!';
    updateProposalStatus(threadProposal.id, 'discussing');
    await message.reply(replyText.slice(0, 1950));
    return true;
}

import { memoryProvider } from './MemoryProvider.js';

/**
 * Xử lý đánh giá và lưu trữ ký ức đề xuất từ AI (Gemini).
 * Phân chia chuẩn 3 cấp độ:
 * 1. Vĩnh viễn (Permanent): Thông tin cá nhân, lịch sử, tên thật, ngày sinh... (Importance >= 8)
 * 2. Trung hạn (Medium): Sự kiện, kế hoạch, câu chuyện cá nhân khá quan trọng (~60 ngày) (Importance 5-7)
 * 3. Ngắn hạn (Ephemeral): Thông tin ngoài lề, sinh hoạt ngắn hạn (vài ngày) (Importance 1-4)
 */
export function handleMemoryCandidate(discordId, candidate) {
    if (!candidate) return null;

    // 🙈 Xử lý nếu AI đề xuất tạm ẩn/quên một ký ức cụ thể khi người dùng yêu cầu
    if (candidate.action === 'suppress' || candidate.action === 'forget') {
        const keyToSuppress = candidate.fact?.key || candidate.fact?.value || candidate.fact || candidate.key;
        if (!keyToSuppress) return null;

        const success = memoryProvider.suppressMemory(discordId, keyToSuppress);
        return success 
            ? `🙈 Đã tạm ẩn ký ức "${keyToSuppress}" (Không chủ động nhắc lại)` 
            : null;
    }

    if (!candidate.fact || (!candidate.fact.value && typeof candidate.fact !== 'string')) {
        return null;
    }

    const factKey = candidate.fact.key || 'general_info';
    const factValue = candidate.fact.value || candidate.fact;
    const importance = Number(candidate.importance) || 5;
    let type = candidate.type || 'ephemeral';

    if (importance >= 8 || type === 'permanent') {
        type = 'permanent';
    } else if (importance >= 5 || type === 'medium') {
        type = 'medium';
    } else {
        type = 'ephemeral';
    }

    if (importance < 2) {
        return null;
    }

    memoryProvider.addKnowledge(discordId, {
        category: candidate.category || 'general',
        fact: {
            key: factKey,
            value: factValue
        },
        importance: importance,
        type: type,
        durationDays: candidate.durationDays || (type === 'medium' ? 60 : (type === 'ephemeral' ? 3 : null))
    });

    return `"${factValue}" (${type.toUpperCase()})`;
}

export function selectRelevantMemories(targetUserId, requestingUserId, currentGuildId, query = null) {
    const rawMemories = memoryProvider.getRelevantKnowledge(targetUserId, currentGuildId, requestingUserId, { query });

    rawMemories.forEach(mem => {
        memoryProvider.reinforceMemory(targetUserId, mem.id);
    });

    return rawMemories.map(m => {
        const tag = m.type === 'permanent' ? 'VĨNH VIỄN' : (m.type === 'medium' ? 'TRUNG HẠN' : 'NGẮN HẠN');
        const suppressedTag = m.isSuppressed ? '[ĐÃ ẨN/CHỈ TRẢ LỜI KHI ĐƯỢC HỎI] ' : '';
        return `[${tag}][${(m.category || 'INFO').toUpperCase()}] ${suppressedTag}${m.fact?.value || m.fact}`;
    });
}
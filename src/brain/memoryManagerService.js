import { memoryProvider } from './MemoryProvider.js';

/**
 * Xử lý đánh giá và lưu trữ ký ức đề xuất từ AI (Gemini).
 * Phân chia chuẩn 3 cấp độ:
 * 1. Vĩnh viễn (Permanent): Thông tin cá nhân, lịch sử, tên thật, ngày sinh... (Importance >= 8)
 * 2. Trung hạn (Medium): Sự kiện, kế hoạch, câu chuyện cá nhân khá quan trọng (~60 ngày) (Importance 5-7)
 * 3. Ngắn hạn (Ephemeral): Thông tin ngoài lề, sinh hoạt ngắn hạn (vài ngày) (Importance 1-4)
 */
export function handleMemoryCandidate(discordId, candidate) {
    if (!candidate || !candidate.fact || (!candidate.fact.value && typeof candidate.fact !== 'string')) {
        console.log(`⚠️ [Memory Manager]: Bỏ qua candidate do rỗng hoặc thiếu thông tin fact.`);
        return null;
    }

    const factKey = candidate.fact.key || 'general_info';
    const factValue = candidate.fact.value || candidate.fact;
    const importance = Number(candidate.importance) || 5;
    let type = candidate.type || 'ephemeral';

    // Xác định phân tầng dựa trên độ quan trọng và type
    if (importance >= 8 || type === 'permanent') {
        type = 'permanent';
    } else if (importance >= 5 || type === 'medium') {
        type = 'medium';
    } else {
        type = 'ephemeral';
    }

    console.log(`\n🧠 [ĐÁNH GIÁ KÝ ỨC YUE] User: ${discordId}`);
    console.log(`   📌 Key: "${factKey}" | Value: "${factValue}"`);
    console.log(`   ⭐ Importance: ${importance}/10 | Tier: ${type.toUpperCase()}`);

    if (importance < 2) {
        console.log(`   🚫 Kết quả: Bỏ qua do mức độ quan trọng quá thấp (${importance} < 2).`);
        return null;
    }

    // Ghi đĩa lập tức (chống mất dữ liệu khi restart bot và sẵn sàng cho lượt chat kế tiếp)
    const savedEntity = memoryProvider.addKnowledge(discordId, {
        category: candidate.category || 'general',
        fact: {
            key: factKey,
            value: factValue
        },
        importance: importance,
        type: type,
        durationDays: candidate.durationDays || (type === 'medium' ? 60 : (type === 'ephemeral' ? 3 : null))
    });

    const tierLabels = {
        permanent: '💾 VĨNH VIỄN (Lịch sử / Thông tin cá nhân)',
        medium: '⏳ TRUNG HẠN (~60 ngày / 2 tháng)',
        ephemeral: '⏱️ NGẮN HẠN (Vài ngày - Tự xóa)'
    };

    console.log(`   ✅ Kết quả: ĐÃ LƯU TRỰC TIẾP VÀO ĐĨA -> ${tierLabels[type] || type}`);
    return savedEntity;
}

export function selectRelevantMemories(targetUserId, requestingUserId, currentGuildId) {
    const rawMemories = memoryProvider.getRelevantKnowledge(targetUserId, currentGuildId, requestingUserId);

    rawMemories.forEach(mem => {
        memoryProvider.reinforceMemory(targetUserId, mem.id);
    });

    return rawMemories.map(m => {
        const tag = m.type === 'permanent' ? 'VĨNH VIỄN' : (m.type === 'medium' ? 'TRUNG HẠN' : 'NGẮN HẠN');
        return `[${tag}][${(m.category || 'INFO').toUpperCase()}] ${m.fact?.value || m.fact}`;
    });
}
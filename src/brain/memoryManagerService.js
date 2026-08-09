import { memoryProvider } from './MemoryProvider.js';

const memoryQueue = new Map();

export function handleMemoryCandidate(discordId, candidate) {
    if (!candidate || !candidate.fact || !candidate.fact.value) {
        console.log(`⚠️ [Memory Manager]: Bỏ qua candidate do rỗng hoặc thiếu thông tin fact.`);
        return;
    }

    const key = `${discordId}_${candidate.fact.key}`;
    const importance = candidate.importance || 5;

    console.log(`   📌 [Đánh Giá Ký Ức]: Key="${candidate.fact.key}" | Value="${candidate.fact.value}" | Importance=${importance}/10 | Type="${candidate.type || 'ephemeral'}"`);

    // 1. Ký ức quan trọng cao (Importance >= 8) -> Lưu vĩnh viễn trực tiếp vào đĩa
    if (importance >= 8) {
        memoryProvider.addKnowledge(discordId, {
            ...candidate,
            type: 'permanent'
        });
        console.log(`      💾 -> Kết quả: ĐÃ GHI TRỰC TIẾP VÀO ĐĨA VĨNH VIỄN (Importance >= 8)`);
        return;
    }

    // 2. Ký ức được củng cố khi nhắc lại trong 10 phút
    if (memoryQueue.has(key)) {
        const pending = memoryQueue.get(key);
        
        memoryProvider.addKnowledge(discordId, {
            ...candidate,
            importance: Math.min(10, pending.importance + 2),
            type: candidate.importance >= 6 ? 'medium' : 'ephemeral',
            durationDays: candidate.durationDays || 3
        });
        
        memoryQueue.delete(key);
        console.log(`      ✅ -> Kết quả: CỦNG CỐ THÀNH CÔNG! Đã chuyển từ RAM xuống đĩa sớm.`);
        return;
    }

    // 3. Ký ức vừa phải (3 <= Importance < 8) -> Đưa vào RAM Queue chờ 10 phút
    if (importance >= 3) {
        memoryQueue.set(key, candidate);
        console.log(`      ⏳ -> Kết quả: ĐÃ ĐƯA VÀO RAM QUEUE (Chờ 10 phút đếm ngược để hạ đĩa)`);

        setTimeout(() => {
            if (memoryQueue.has(key)) {
                const item = memoryQueue.get(key);
                
                memoryProvider.addKnowledge(discordId, {
                    ...item,
                    type: item.type || 'ephemeral',
                    durationDays: item.durationDays || 1
                });

                memoryQueue.delete(key);
                console.log(`\n💾 [Memory Queue Execution]: Hết 10 phút! Đã chuyển ký ức tạm từ RAM xuống đĩa (24h/30ngày): "${item.fact.value}"`);
            }
        }, 10 * 60 * 1000);
    } else {
        console.log(`      🚫 -> Kết quả: BỎ QUA do điểm quan trọng quá thấp (${importance} < 3).`);
    }
}

export function selectRelevantMemories(targetUserId, requestingUserId, currentGuildId) {
    const rawMemories = memoryProvider.getRelevantKnowledge(targetUserId, currentGuildId, requestingUserId);

    rawMemories.forEach(mem => {
        memoryProvider.reinforceMemory(targetUserId, mem.id);
    });

    return rawMemories.map(m => `[${m.category.toUpperCase()}] ${m.fact.value}`);
}
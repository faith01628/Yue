import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('./src/data/yueMemory.json');
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class MemoryProvider {
    constructor() {
        this._initDB();
    }

    _initDB() {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
    }

    _read() {
        try {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        } catch {
            return {};
        }
    }

    _write(data) {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }

    // 🧹 TỰ ĐỘNG DỌN RÁC THEO TẦNG KÝ ỨC (GARBAGE COLLECTION)
    cleanExpiredMemories(discordId) {
        const db = this._read();
        const user = db[discordId];
        if (!user || !user.memories) return;

        const now = Date.now();
        let updated = false;

        // 1. Quét Ký ức Ngắn hạn (shortTerm / ephemeral)
        if (user.memories.shortTerm) {
            const initialCount = user.memories.shortTerm.length;
            user.memories.shortTerm = user.memories.shortTerm.filter(m => !m.expiresAt || m.expiresAt > now);
            if (user.memories.shortTerm.length !== initialCount) updated = true;
        }

        // 2. Quét Ký ức Trung hạn (medium) - hết hạn sau ~60 ngày nếu không nhắc lại
        if (user.memories.medium) {
            const initialCount = user.memories.medium.length;
            user.memories.medium = user.memories.medium.filter(m => !m.expiresAt || m.expiresAt > now);
            if (user.memories.medium.length !== initialCount) updated = true;
        }

        if (updated) {
            console.log(`🧹 [Memory GC]: Đã tự động dọn dẹp các ký ức hết hạn của user ${discordId}`);
            this._write(db);
        }
    }

    // LƯU / CẬP NHẬT KÝ ỨC VÀO ĐÚNG TẦNG (CÓ CHỐNG TRÙNG LẶP KEY)
    addKnowledge(discordId, knowledgeEntity) {
        const db = this._read();
        const user = this.getUser(discordId);
        const now = Date.now();

        const importance = Number(knowledgeEntity.importance) || 5;
        let type = knowledgeEntity.type || 'ephemeral';

        // Phân loại cấp độ ký ức chuẩn 3 tầng
        if (importance >= 8 || type === 'permanent') {
            type = 'permanent';
        } else if (importance >= 5 || type === 'medium') {
            type = 'medium';
        } else {
            type = 'ephemeral';
        }

        let expiresAt = null;
        if (type === 'ephemeral') {
            const days = knowledgeEntity.durationDays || 3; // Ngắn hạn: 3-7 ngày (mặc định 3 ngày)
            expiresAt = now + days * DAY_IN_MS;
        } else if (type === 'medium') {
            const days = knowledgeEntity.durationDays || 60; // Khá quan trọng / trung hạn: ~60 ngày (2 tháng)
            expiresAt = now + days * DAY_IN_MS;
        }

        const factKey = (knowledgeEntity.fact?.key || 'general_fact').toLowerCase().trim();
        const factValue = knowledgeEntity.fact?.value || knowledgeEntity.fact;

        // 🔍 Kiểm tra ký ức cũ có cùng key để ghi đè (Tránh trùng lặp ký ức)
        let existingMem = null;
        ['permanent', 'medium', 'shortTerm'].forEach(tier => {
            if (user.memories[tier]) {
                const idx = user.memories[tier].findIndex(m => m.fact?.key?.toLowerCase() === factKey);
                if (idx !== -1) {
                    existingMem = user.memories[tier].splice(idx, 1)[0];
                }
            }
        });

        const newEntity = {
            id: existingMem ? existingMem.id : 'k_' + now.toString(36),
            subjectId: discordId,
            category: knowledgeEntity.category || 'general',
            fact: {
                key: factKey,
                value: factValue
            },
            source: knowledgeEntity.source || 'discord_chat',
            confidence: knowledgeEntity.confidence || 0.9,
            importance: importance,
            type: type,
            visibility: knowledgeEntity.visibility || 'guild_shared',
            createdAt: existingMem ? existingMem.createdAt : now,
            updatedAt: now,
            expiresAt: expiresAt,
            lastAccessedAt: now,
            accessCount: existingMem ? (existingMem.accessCount || 1) + 1 : 1
        };

        // Phân tầng lưu trữ chuẩn
        if (type === 'permanent') {
            user.memories.permanent.push(newEntity);
        } else if (type === 'medium') {
            user.memories.medium.push(newEntity);
        } else {
            user.memories.shortTerm.push(newEntity);
        }

        db[discordId] = user;
        this._write(db);
        return newEntity;
    }

    // 🔄 REINFORCEMENT MEMORY (Reset lại thời gian sống khi được nhắc lại)
    reinforceMemory(discordId, memoryId) {
        const db = this._read();
        const user = db[discordId];
        if (!user || !user.memories) return;

        const now = Date.now();
        const allMemories = [
            ...(user.memories.shortTerm || []),
            ...(user.memories.medium || []),
            ...(user.memories.permanent || [])
        ];

        const memory = allMemories.find(m => m.id === memoryId);
        if (memory) {
            memory.lastAccessedAt = now;
            memory.accessCount = (memory.accessCount || 1) + 1;

            // Reset thời gian sống nếu ký ức có hạn
            if (memory.type === 'medium') {
                memory.expiresAt = now + 60 * DAY_IN_MS; // Reset đủ 60 ngày
                console.log(`🔄 [Memory Reinforce]: Ký ức trung hạn "${memory.fact.value}" được củng cố (Reset 60 ngày).`);
            } else if (memory.type === 'ephemeral' || memory.type === 'shortTerm') {
                memory.expiresAt = now + 3 * DAY_IN_MS; // Reset đủ 3 ngày
                console.log(`🔄 [Memory Reinforce]: Ký ức ngắn hạn "${memory.fact.value}" được củng cố (Reset 3 ngày).`);
            }

            this._write(db);
        }
    }

    // LẤY GỘP TOÀN BỘ KÝ ỨC HỢP LỆ (Đã tự dọn rác)
    getRelevantKnowledge(discordId, currentGuildId, requestingUserId) {
        this.cleanExpiredMemories(discordId);
        const user = this.getUser(discordId);
        
        const isOwnerAsking = discordId === requestingUserId;
        const allMemories = [
            ...(user.memories.permanent || []).map(m => ({ ...m, tier: 'permanent' })),
            ...(user.memories.medium || []).map(m => ({ ...m, tier: 'medium' })),
            ...(user.memories.shortTerm || []).map(m => ({ ...m, tier: 'shortTerm' }))
        ];

        return allMemories.filter(mem => {
            if (isOwnerAsking) return true;
            if (mem.visibility === 'private') return false;
            return mem.visibility === 'guild_shared' || mem.visibility === 'public';
        });
    }

    updateGuildContext(discordId, guildId, lastKnownDisplayName, role = 'Member') {
        const db = this._read();
        const user = this.getUser(discordId);

        if (!user.guilds) user.guilds = {};
        user.guilds[guildId] = {
            lastKnownDisplayName,
            role,
            lastSeen: Date.now()
        };

        db[discordId] = user;
        this._write(db);
    }

    getUser(discordId) {
        const db = this._read();
        if (!db[discordId]) {
            db[discordId] = {
                identity: { discordId, osuId: null, createdAt: Date.now(), language: 'vi' },
                profile: { preferences: {}, relationshipLevel: "neutral" },
                guilds: {},
                memories: {
                    permanent: [],
                    medium: [],
                    shortTerm: []
                }
            };
            this._write(db);
        }
        
        // Ensure structure upgrade fallback
        if (!db[discordId].memories) {
            db[discordId].memories = { permanent: [], medium: [], shortTerm: [] };
            this._write(db);
        }
        if (!db[discordId].memories.permanent) db[discordId].memories.permanent = [];
        if (!db[discordId].memories.medium) db[discordId].memories.medium = [];
        if (!db[discordId].memories.shortTerm) db[discordId].memories.shortTerm = [];

        return db[discordId];
    }
}

export const memoryProvider = new MemoryProvider();
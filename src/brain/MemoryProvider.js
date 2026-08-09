import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('./src/data/yueMemory.json');

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
        if (!user) return;

        const now = Date.now();
        let updated = false;

        // 1. Quét Ký ức Ngắn hạn (shortTermMemories)
        if (user.memories?.shortTerm) {
            const initialCount = user.memories.shortTerm.length;
            user.memories.shortTerm = user.memories.shortTerm.filter(m => !m.expiresAt || m.expiresAt > now);
            if (user.memories.shortTerm.length !== initialCount) updated = true;
        }

        // 2. Quét Ký ức Trung hạn (mediumMemories)
        if (user.memories?.medium) {
            const initialCount = user.memories.medium.length;
            user.memories.medium = user.memories.medium.filter(m => !m.expiresAt || m.expiresAt > now);
            if (user.memories.medium.length !== initialCount) updated = true;
        }

        if (updated) {
            console.log(`🧹 [Memory GC]: Đã dọn dẹp các ký ức quá hạn của user ${discordId}`);
            this._write(db);
        }
    }

    // LƯU KÝ ỨC VÀO ĐÚNG TẦNG TỰ ĐỘNG
    addKnowledge(discordId, knowledgeEntity) {
        const db = this._read();
        const user = this.getUser(discordId);
        const now = Date.now();

        const type = knowledgeEntity.type || 'ephemeral';
        let expiresAt = null;

        // Tính mốc TTL dựa trên loại ký ức
        if (type === 'ephemeral') {
            const days = knowledgeEntity.durationDays || 1; // Mặc định 1 ngày cho tin nhắn ngắn hạn
            expiresAt = now + days * 24 * 60 * 60 * 1000;
        } else if (type === 'medium') {
            const days = knowledgeEntity.durationDays || 30; // Mặc định 30 ngày cho tin trung hạn
            expiresAt = now + days * 24 * 60 * 60 * 1000;
        }

        const newEntity = {
            id: 'k_' + now.toString(36),
            subjectId: discordId,
            category: knowledgeEntity.category || 'general',
            fact: knowledgeEntity.fact,
            source: knowledgeEntity.source || 'discord_chat',
            confidence: knowledgeEntity.confidence || 0.9,
            importance: knowledgeEntity.importance || 5,
            visibility: knowledgeEntity.visibility || 'guild_shared',
            createdAt: now,
            expiresAt: expiresAt,
            lastAccessedAt: now,
            accessCount: 1
        };

        // Phân tầng lưu trữ
        if (type === 'permanent' || knowledgeEntity.importance >= 8) {
            user.memories.permanent.push(newEntity);
        } else if (type === 'medium') {
            user.memories.medium.push(newEntity);
        } else {
            user.memories.shortTerm.push(newEntity);
        }

        db[discordId] = user;
        this._write(db);
    }

    // 🔄 REINFORCEMENT MEMORY (Gia hạn ký ức khi được nhắc lại)
    reinforceMemory(discordId, memoryId) {
        const db = this._read();
        const user = db[discordId];
        if (!user || !user.memories) return;

        const now = Date.now();
        const allMemories = [
            ...user.memories.shortTerm,
            ...user.memories.medium,
            ...user.memories.permanent
        ];

        const memory = allMemories.find(m => m.id === memoryId);
        if (memory) {
            memory.lastAccessedAt = now;
            memory.accessCount = (memory.accessCount || 1) + 1;

            if (memory.expiresAt) {
                const extendTime = 24 * 60 * 60 * 1000; // Gia hạn thêm 24 tiếng mỗi lần nhắc lại
                memory.expiresAt = Math.max(memory.expiresAt, now) + extendTime;
                console.log(`🔄 [Reinforcement]: Ký ức "${memory.fact.value}" được củng cố và cộng thêm 24h sống!`);
            }
            this._write(db);
        }
    }

    // LẤY GỘP TOÀN BỘ KÝ ỨC HỢP LỆ (Đã dọn rác)
    getRelevantKnowledge(discordId, currentGuildId, requestingUserId) {
        this.cleanExpiredMemories(discordId);
        const user = this.getUser(discordId);
        
        const isOwnerAsking = discordId === requestingUserId;
        const allMemories = [
            ...(user.memories.permanent || []),
            ...(user.memories.medium || []),
            ...(user.memories.shortTerm || [])
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
        if (!db[discordId].memories.permanent) {
            db[discordId].memories = { permanent: [], medium: [], shortTerm: [] };
            this._write(db);
        }

        return db[discordId];
    }
}

export const memoryProvider = new MemoryProvider();
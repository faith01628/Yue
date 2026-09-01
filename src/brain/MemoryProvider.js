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
            } else if (memory.type === 'ephemeral' || memory.type === 'shortTerm') {
                memory.expiresAt = now + 3 * DAY_IN_MS; // Reset đủ 3 ngày
            }

            this._write(db);
        }
    }

    // 🙈 ĐÁNH DẤU TẠM ẨN / QUÊN CHỦ ĐỘNG (SUPPRESS MEMORY)
    suppressMemory(discordId, factKey) {
        const db = this._read();
        const user = db[discordId];
        if (!user || !user.memories) return false;

        const normalizedKey = factKey.toLowerCase().trim();
        let found = false;

        ['permanent', 'medium', 'shortTerm'].forEach(tier => {
            if (user.memories[tier]) {
                user.memories[tier].forEach(m => {
                    const keyMatch = m.fact?.key?.toLowerCase() === normalizedKey;
                    const valMatch = typeof m.fact?.value === 'string' && m.fact.value.toLowerCase().includes(normalizedKey);
                    if (keyMatch || valMatch || m.id === factKey) {
                        m.isSuppressed = true;
                        m.suppressedAt = Date.now();
                        found = true;
                    }
                });
            }
        });

        if (found) {
            this._write(db);
        }
        return found;
    }

    // 👁️ KHÔI PHỤC KÝ ỨC BỊ ẨN (UNSUPPRESS MEMORY)
    unsuppressMemory(discordId, factKey) {
        const db = this._read();
        const user = db[discordId];
        if (!user || !user.memories) return false;

        const normalizedKey = factKey.toLowerCase().trim();
        let found = false;

        ['permanent', 'medium', 'shortTerm'].forEach(tier => {
            if (user.memories[tier]) {
                user.memories[tier].forEach(m => {
                    const keyMatch = m.fact?.key?.toLowerCase() === normalizedKey;
                    const valMatch = typeof m.fact?.value === 'string' && m.fact.value.toLowerCase().includes(normalizedKey);
                    if (keyMatch || valMatch || m.id === factKey) {
                        m.isSuppressed = false;
                        delete m.suppressedAt;
                        found = true;
                    }
                });
            }
        });

        if (found) {
            this._write(db);
        }
        return found;
    }

    // LẤY GỘP TOÀN BỘ KÝ ỨC HỢP LỆ (Đã tự dọn rác & lọc ký ức suppressed)
    getRelevantKnowledge(discordId, currentGuildId, requestingUserId, options = {}) {
        const { includeSuppressed = false, query = null } = typeof options === 'object' ? options : {};
        this.cleanExpiredMemories(discordId);
        const user = this.getUser(discordId);

        const isOwnerAsking = discordId === requestingUserId;
        const allMemories = [
            ...(user.memories.permanent || []).map(m => ({ ...m, tier: 'permanent' })),
            ...(user.memories.medium || []).map(m => ({ ...m, tier: 'medium' })),
            ...(user.memories.shortTerm || []).map(m => ({ ...m, tier: 'shortTerm' }))
        ];

        return allMemories.filter(mem => {
            if (!isOwnerAsking && mem.visibility === 'private') return false;
            if (!isOwnerAsking && mem.visibility !== 'guild_shared' && mem.visibility !== 'public') return false;

            // 🙈 Nếu ký ức bị tạm ẩn/quên theo yêu cầu người dùng
            if (mem.isSuppressed) {
                if (includeSuppressed) return true;
                if (query) {
                    const q = query.toLowerCase().trim();
                    const keyMatch = mem.fact?.key?.toLowerCase().includes(q);
                    const valMatch = typeof mem.fact?.value === 'string' && mem.fact.value.toLowerCase().includes(q);
                    const catMatch = mem.category?.toLowerCase().includes(q);
                    return keyMatch || valMatch || catMatch;
                }
                // Mặc định KHÔNG đưa ký ức suppressed vào gợi ý chủ động
                return false;
            }

            return true;
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
                profile: { preferences: {}, relationshipLevel: "Mới Quen", affectionScore: 1000 },
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
        if (!db[discordId].profile) {
            db[discordId].profile = { preferences: {}, relationshipLevel: "Mới Quen", affectionScore: 1000 };
            this._write(db);
        }
        if (typeof db[discordId].profile.affectionScore !== 'number') {
            db[discordId].profile.affectionScore = String(discordId) === '756427625970270248' ? 100000 : 1000;
            db[discordId].profile.relationshipLevel = this.getAffectionTier(db[discordId].profile.affectionScore).level;
            this._write(db);
        }

        if (!db[discordId].memories) {
            db[discordId].memories = { permanent: [], medium: [], shortTerm: [] };
            this._write(db);
        }
        if (!db[discordId].memories.permanent) db[discordId].memories.permanent = [];
        if (!db[discordId].memories.medium) db[discordId].memories.medium = [];
        if (!db[discordId].memories.shortTerm) db[discordId].memories.shortTerm = [];

        return db[discordId];
    }

    isBlacklisted(discordId) {
        if (!discordId) return false;
        if (String(discordId) === '756427625970270248') return false;
        const user = this.getUser(discordId);
        const score = typeof user.profile?.affectionScore === 'number' ? user.profile.affectionScore : 1000;
        return Boolean(user.profile?.isBlacklisted || score <= 0);
    }

    blacklistUser(discordId) {
        if (!discordId) return null;
        if (String(discordId) === '756427625970270248') return null;

        const db = this._read();
        const user = this.getUser(discordId);

        const currentScore = typeof user.profile?.affectionScore === 'number' ? user.profile.affectionScore : 1000;
        if (currentScore > 0) {
            user.profile.scoreBeforeBlock = currentScore;
        }

        user.profile.affectionScore = 0;
        user.profile.isBlacklisted = true;
        user.profile.relationshipLevel = 'Bị Cấm / Blacklisted';

        db[discordId] = user;
        this._write(db);
        return user;
    }

    unblacklistUser(discordId, customScore = null) {
        if (!discordId) return null;
        const db = this._read();
        const user = this.getUser(discordId);

        let restoredScore = 1000;
        if (customScore !== null && customScore !== undefined) {
            restoredScore = customScore;
        } else if (typeof user.profile.scoreBeforeBlock === 'number' && user.profile.scoreBeforeBlock > 0) {
            restoredScore = user.profile.scoreBeforeBlock;
        }

        user.profile.affectionScore = restoredScore;
        user.profile.isBlacklisted = false;
        delete user.profile.scoreBeforeBlock;

        const tier = this.getAffectionTier(restoredScore);
        user.profile.relationshipLevel = tier.level;

        db[discordId] = user;
        this._write(db);
        return user;
    }

    resetAffection(discordId) {
        const db = this._read();
        const user = this.getUser(discordId);

        const isCreator = String(discordId) === '756427625970270248';
        const resetScore = isCreator ? 100000 : 1000;

        user.profile.affectionScore = resetScore;
        user.profile.isBlacklisted = false;
        delete user.profile.scoreBeforeBlock;

        const tier = this.getAffectionTier(resetScore);
        user.profile.relationshipLevel = tier.level;

        db[discordId] = user;
        this._write(db);
        return user;
    }

    getBlacklistedUsers() {
        const db = this._read();
        const list = [];
        for (const [id, data] of Object.entries(db)) {
            if (id === '756427625970270248') continue;
            const score = typeof data.profile?.affectionScore === 'number' ? data.profile.affectionScore : 1000;
            if (data.profile?.isBlacklisted || score <= 0) {
                list.push({
                    discordId: id,
                    score: score,
                    level: data.profile?.relationshipLevel || 'Bị Cấm',
                    lastKnownName: Object.values(data.guilds || {})[0]?.lastKnownDisplayName || 'User ' + id
                });
            }
        }
        return list;
    }

    getAffection(discordId) {
        const user = this.getUser(discordId);
        if (String(discordId) === '756427625970270248') {
            return { score: 100000, level: 'Tri Kỷ (Creator)', description: 'Chủ nhân sáng tạo ra Yue' };
        }
        const score = typeof user.profile?.affectionScore === 'number' ? user.profile.affectionScore : 1000;
        return this.getAffectionTier(score);
    }

    getAffectionTier(score) {
        if (score <= 0) {
            return { score, level: 'Bị Cấm / Blacklisted', description: 'User đã bị đưa vào Danh sách đen (Blacklist). Hệ thống tự động xem là vô hình và không phản hồi.' };
        } else if (score >= 50000) {
            return { score, level: 'Tri Kỷ / Siêu Thân Thiết', description: 'Cạ cứng ruột, cực kỳ tin tưởng, hết mình trợ giúp, trêu yêu ngọt ngào' };
        } else if (score >= 25000) {
            return { score, level: 'Bạn Thân Cao Cấp', description: 'Rất thân thiết, chia sẻ tâm sự, rủ rê chơi game cực kỳ thoải mái' };
        } else if (score >= 10000) {
            return { score, level: 'Bạn Thân', description: 'Vui vẻ, hay trêu ghẹo tấu hài, rủ rê chơi game thoải mái' };
        } else if (score >= 3000) {
            return { score, level: 'Bạn Bình Thường', description: 'Lịch sự, hài hước nhẹ nhàng chuẩn gamer Discord' };
        } else if (score >= 1000) {
            return { score, level: 'Mới Quen', description: 'Trả lời xã giao, chảnh chảnh nhẹ kiểu Neuro-sama' };
        } else {
            return { score, level: 'Ghét / Khó Ưa', description: 'Nói chuyện đắng cay khó ưa nhẹ, đáp phũ phàng (đang gỡ điểm thì đáp cọc nhẹ)' };
        }
    }

    updateAffection(discordId, delta) {
        if (!discordId || delta === undefined || delta === 0) return null;
        const db = this._read();
        const user = this.getUser(discordId);

        if (!user.profile) user.profile = {};
        const isCreator = String(discordId) === '756427625970270248';
        const currentScore = typeof user.profile.affectionScore === 'number'
            ? user.profile.affectionScore
            : (isCreator ? 100000 : 1000);

        const rawScore = currentScore + Number(delta);
        const newScore = isCreator ? 100000 : Math.round(Math.max(-99999, Math.min(200000, rawScore)) * 10) / 10;

        user.profile.affectionScore = newScore;
        const tier = this.getAffectionTier(newScore);
        user.profile.relationshipLevel = tier.level;

        if (newScore <= 0 && !isCreator) {
            if (currentScore > 0 && (!user.profile.scoreBeforeBlock || user.profile.scoreBeforeBlock <= 0)) {
                user.profile.scoreBeforeBlock = currentScore;
            }
            user.profile.isBlacklisted = true;
        }

        db[discordId] = user;
        this._write(db);

        return tier;
    }
}

export const memoryProvider = new MemoryProvider();
import fs from 'fs';
import path from 'path';
import { safeReadJSON, safeWriteJSON } from '../../utils/safeStorage.js';

const DATA_FILE = path.resolve('data/users.json');

function ensureDataFile() {
    safeReadJSON(DATA_FILE, {});
}

/**
 * Chuẩn hóa 1 bản ghi user từ dữ liệu cũ (string) hoặc mới (object)
 */
function normalizeUserEntry(raw, discordId = null) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        const isNumeric = /^\d+$/.test(raw.trim());
        return {
            discordId: discordId,
            userId: isNumeric ? Number(raw.trim()) : null,
            username: raw.trim(),
            previousUsernames: [],
            updatedAt: 0
        };
    }
    if (typeof raw === 'object') {
        return {
            discordId: raw.discordId || discordId,
            userId: raw.userId ? Number(raw.userId) : null,
            username: raw.username || '',
            previousUsernames: Array.isArray(raw.previousUsernames) ? raw.previousUsernames : [],
            updatedAt: raw.updatedAt || 0
        };
    }
    return null;
}

/**
 * Đọc toàn bộ danh sách đã link (Tự động chuẩn hóa cấu trúc 2 lớp UID + Username)
 */
export function loadUsers() {
    const raw = safeReadJSON(DATA_FILE, {});
    const normalized = {};
    let hasMigration = false;

    for (const [discordId, val] of Object.entries(raw)) {
        const norm = normalizeUserEntry(val, discordId);
        if (norm) {
            // Tự động gán userId nếu đã biết từ leaderboard (ví dụ katashi)
            if (!norm.userId && norm.username.toLowerCase().includes('katashi')) {
                norm.userId = 34804696;
                hasMigration = true;
            }
            if (typeof val === 'string') {
                hasMigration = true;
            }
            normalized[discordId] = norm;
        }
    }

    if (hasMigration) {
        safeWriteJSON(DATA_FILE, normalized);
    }

    return normalized;
}

/**
 * Lưu/Cập nhật tài khoản osu! cho Discord ID (Lưu đầy đủ UID, Username hiện tại, và Lịch sử tên cũ)
 * @param {string} discordId Discord User ID
 * @param {object|string} profileOrUsername Object profile từ osu! API v2 hoặc chuỗi username
 * @param {number|string} [optionalUserId] UserID nếu truyền tách rời
 */
export function linkOsuAccount(discordId, profileOrUsername, optionalUserId = null) {
    if (!discordId) return false;
    const users = loadUsers();
    const existing = users[discordId] || null;

    let userId = null;
    let username = '';
    let apiPrevious = [];

    if (profileOrUsername && typeof profileOrUsername === 'object') {
        userId = profileOrUsername.id ? Number(profileOrUsername.id) : null;
        username = profileOrUsername.username || '';
        if (Array.isArray(profileOrUsername.previous_usernames)) {
            apiPrevious = profileOrUsername.previous_usernames;
        }
    } else if (typeof profileOrUsername === 'string') {
        username = profileOrUsername.trim();
        if (optionalUserId) userId = Number(optionalUserId);
    }

    // Tổng hợp danh sách tên cũ (gồm tên cũ đã lưu trong bot + tên cũ từ osu! API)
    const prevNamesSet = new Set(existing?.previousUsernames || []);
    for (const old of apiPrevious) {
        if (old && old.toLowerCase() !== username.toLowerCase()) {
            prevNamesSet.add(old);
        }
    }

    // Nếu trước đó từng lưu username khác, đưa tên cũ vào danh sách tên cũ
    if (existing?.username && existing.username.toLowerCase() !== username.toLowerCase()) {
        prevNamesSet.add(existing.username);
    }

    const updatedAccount = {
        discordId,
        userId: userId || existing?.userId || null,
        username,
        previousUsernames: Array.from(prevNamesSet),
        updatedAt: Date.now()
    };

    users[discordId] = updatedAccount;
    return safeWriteJSON(DATA_FILE, users);
}

/**
 * Lấy osu! username hiện tại đã link của Discord ID (Nếu chưa link thì trả về null)
 * Luôn trả về chuỗi String để đảm bảo tương thích 100% với các lệnh cũ (.rs, .top, .stat, .p...)
 */
export function getLinkedOsuUsername(discordId) {
    if (!discordId) return null;
    const users = loadUsers();
    const entry = users[discordId];
    if (!entry) return null;
    return entry.username || (entry.userId ? String(entry.userId) : null);
}

/**
 * Lấy thông tin tài khoản đầy đủ (gồm UID, Username, PreviousUsernames)
 */
export function getLinkedOsuAccount(discordId) {
    if (!discordId) return null;
    const users = loadUsers();
    return users[discordId] || null;
}

/**
 * 🔍 Tìm kiếm người chơi theo Tên hiện tại, Tên cũ, hoặc UserID (2-Layer Resolver)
 * @param {string|number} query Tên cần tìm (A hoặc B) hoặc UID
 * @returns {object|null} { discordId, userId, currentUsername, previousUsernames, isRenamed, matchedName }
 */
export function findUserByAnyNameOrId(query) {
    if (!query) return null;
    const users = loadUsers();
    const cleanQuery = String(query).trim().replace(/^\[|\]$/g, '').toLowerCase();
    const queryNum = /^\d+$/.test(cleanQuery) ? Number(cleanQuery) : null;

    for (const [discordId, acc] of Object.entries(users)) {
        if (!acc) continue;

        // 1. Khớp theo UserID
        if (queryNum && acc.userId === queryNum) {
            return {
                discordId,
                userId: acc.userId,
                currentUsername: acc.username,
                previousUsernames: acc.previousUsernames || [],
                isRenamed: false,
                matchedName: acc.username
            };
        }

        // 2. Khớp theo Username hiện tại
        const currClean = (acc.username || '').toLowerCase().replace(/^\[|\]$/g, '');
        if (currClean === cleanQuery) {
            return {
                discordId,
                userId: acc.userId,
                currentUsername: acc.username,
                previousUsernames: acc.previousUsernames || [],
                isRenamed: false,
                matchedName: acc.username
            };
        }

        // 3. Khớp theo Tên cũ (Previous Usernames) -> Nhận diện người chơi đã đổi tên!
        if (Array.isArray(acc.previousUsernames)) {
            const matchedOld = acc.previousUsernames.find(old => {
                const oldClean = String(old).toLowerCase().replace(/^\[|\]$/g, '');
                return oldClean === cleanQuery;
            });
            if (matchedOld) {
                return {
                    discordId,
                    userId: acc.userId,
                    currentUsername: acc.username,
                    previousUsernames: acc.previousUsernames,
                    isRenamed: true,
                    matchedName: matchedOld
                };
            }
        }
    }

    return null;
}

/**
 * 🔄 Chuyển đổi tên người dùng mục tiêu sang tên hiện tại / UID (nếu là tên cũ)
 */
export function resolveOsuTargetUser(input) {
    if (!input) return null;
    const match = findUserByAnyNameOrId(input);
    if (match) {
        return match.currentUsername || (match.userId ? String(match.userId) : input);
    }
    return input;
}

/**
 * 🔄 Tự động cập nhật nếu phát hiện người chơi đổi tên từ profile osu! mới nhất
 */
export function updateUserFromProfile(profile) {
    if (!profile || !profile.id) return null;
    const users = loadUsers();
    const userId = Number(profile.id);
    const newUsername = profile.username;

    // Tìm xem UID này đã được liên kết với Discord ID nào chưa
    let targetDiscordId = null;
    let targetAccount = null;

    for (const [dId, acc] of Object.entries(users)) {
        if (acc && acc.userId === userId) {
            targetDiscordId = dId;
            targetAccount = acc;
            break;
        }
    }

    if (!targetDiscordId || !targetAccount) return null;

    const oldUsername = targetAccount.username;
    const isNameChanged = oldUsername && oldUsername.toLowerCase() !== newUsername.toLowerCase();

    if (isNameChanged) {
        console.log(`[User Service] 🔄 Tự động phát hiện đổi tên osu! của UID ${userId}: ${oldUsername} ➔ ${newUsername}`);
        linkOsuAccount(targetDiscordId, profile);
        return {
            renamed: true,
            discordId: targetDiscordId,
            userId,
            oldName: oldUsername,
            newName: newUsername
        };
    }

    // Cập nhật previous_usernames nếu osu! API có trả về tên cũ chưa lưu
    if (Array.isArray(profile.previous_usernames) && profile.previous_usernames.length > 0) {
        let hasNewOldName = false;
        const set = new Set(targetAccount.previousUsernames || []);
        for (const o of profile.previous_usernames) {
            if (o && !set.has(o)) {
                set.add(o);
                hasNewOldName = true;
            }
        }
        if (hasNewOldName) {
            targetAccount.previousUsernames = Array.from(set);
            targetAccount.updatedAt = Date.now();
            users[targetDiscordId] = targetAccount;
            safeWriteJSON(DATA_FILE, users);
        }
    }

    return null;
}

/**
 * Lấy recent score chi tiết - Tự động tính PP nếu API v1 không trả về
 */
export async function getRecentScore(username) {
    try {
        const apiKey = process.env.OSU_API_KEY;
        if (!apiKey) return null;

        // 1. Lấy score gần nhất
        const resolvedName = resolveOsuTargetUser(username) || username;
        const urlRecent = `https://osu.ppy.sh/api/get_user_recent?k=${apiKey}&u=${encodeURIComponent(resolvedName)}&limit=1`;
        const resRecent = await fetch(urlRecent);
        const dataRecent = await resRecent.json();

        if (!dataRecent || dataRecent.length === 0) return null;

        const recent = dataRecent[0];
        const beatmapId = recent.beatmap_id;

        let beatmapTitle = `Beatmap #${beatmapId}`;
        let mapMaxCombo = null;

        if (beatmapId) {
            try {
                const urlBeatmap = `https://osu.ppy.sh/api/get_beatmaps?k=${apiKey}&b=${beatmapId}`;
                const resBeatmap = await fetch(urlBeatmap);
                const dataBeatmap = await resBeatmap.json();

                if (dataBeatmap && dataBeatmap.length > 0) {
                    const bm = dataBeatmap[0];
                    beatmapTitle = `${bm.artist} - ${bm.title} [${bm.version}]`;
                    mapMaxCombo = bm.max_combo ? parseInt(bm.max_combo) : null;
                }
            } catch (bmErr) {
                console.error('Lỗi fetch beatmap info:', bmErr.message);
            }
        }

        const count300 = parseInt(recent.count300 || 0);
        const count100 = parseInt(recent.count100 || 0);
        const count50 = parseInt(recent.count50 || 0);
        const countmiss = parseInt(recent.countmiss || 0);
        const enabledMods = parseInt(recent.enabled_mods || 0);

        let finalPp = recent.pp ? Math.round(parseFloat(recent.pp)) : 0;

        return {
            beatmapTitle,
            rank: recent.rank,
            score: parseInt(recent.score),
            pp: finalPp,
            maxcombo: parseInt(recent.maxcombo || 0),
            beatmapMaxCombo: mapMaxCombo,
            mods: enabledMods,
            count300,
            count100,
            count50,
            countmiss
        };
    } catch (err) {
        console.error('Lỗi lấy recent score:', err);
        return null;
    }
}

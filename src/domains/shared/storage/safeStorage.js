import fs from 'fs';
import path from 'path';

function getBackupPaths(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const backupDir = path.basename(dir) === '.backups' ? dir : path.join(dir, '.backups');
    return {
        backupDir,
        bakPath: path.join(backupDir, `${base}.bak`),
        legacyBakPath: `${filePath}.bak`,
        emergencyPath: path.join(backupDir, `${base}.emergency.bak`)
    };
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

export function safeReadJSON(filePath, defaultValue = {}) {
    const dir = path.dirname(filePath);
    ensureDir(dir);

    const { backupDir, bakPath, legacyBakPath } = getBackupPaths(filePath);

    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            if (raw && raw.trim().length > 0) {
                const data = JSON.parse(raw);
                try {
                    ensureDir(backupDir);
                    fs.copyFileSync(filePath, bakPath);
                } catch {}
                return data;
            }
        } catch (err) {
            console.error(`⚠️ [SafeStorage] File chính bị lỗi/hỏng format: ${filePath} (${err.message}). Đang thử khôi phục từ file backup .bak...`);
        }
    }

    for (const candidateBak of [bakPath, legacyBakPath]) {
        if (fs.existsSync(candidateBak)) {
            try {
                const bakRaw = fs.readFileSync(candidateBak, 'utf-8');
                if (bakRaw && bakRaw.trim().length > 0) {
                    const bakData = JSON.parse(bakRaw);
                    console.log(`✅ [SafeStorage] Khôi phục thành công dữ liệu từ file backup: ${candidateBak}`);
                    safeWriteJSON(filePath, bakData, { backup: false });
                    return bakData;
                }
            } catch (bakErr) {
                console.error(`❌ [SafeStorage] File backup .bak cũng bị lỗi: ${candidateBak} (${bakErr.message})`);
            }
        }
    }

    return defaultValue;
}

export function safeWriteJSON(filePath, data, options = {}) {
    const { backup = true, emptyGuard = true } = options;
    try {
        const dir = path.dirname(filePath);
        ensureDir(dir);

        const { backupDir, bakPath, emergencyPath } = getBackupPaths(filePath);
        const tmpPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const jsonStr = JSON.stringify(data, null, 2);

        if (emptyGuard && fs.existsSync(filePath)) {
            try {
                const currentRaw = fs.readFileSync(filePath, 'utf-8');
                if (currentRaw && currentRaw.length > 50 && (!jsonStr || jsonStr.trim() === '{}' || jsonStr.trim() === '[]' || jsonStr.trim() === '{"records":[]}')) {
                    console.warn(`⚠️ [SafeStorage EmptyGuard] Cảnh báo: Phát hiện hành vi ghi đè rỗng lên file đang có dữ liệu lớn (${filePath}). Đã lưu emergency backup!`);
                    ensureDir(backupDir);
                    fs.copyFileSync(filePath, emergencyPath);
                }
            } catch {}
        }

        if (backup && fs.existsSync(filePath)) {
            try {
                ensureDir(backupDir);
                fs.copyFileSync(filePath, bakPath);
            } catch {}
        }

        fs.writeFileSync(tmpPath, jsonStr, 'utf-8');
        fs.renameSync(tmpPath, filePath);

        return true;
    } catch (err) {
        console.error(`❌ [SafeStorage] Lỗi ghi file an toàn ${filePath}:`, err.message);
        return false;
    }
}

import fs from 'fs';
import path from 'path';

export function safeReadJSON(filePath, defaultValue = {}) {
    const bakPath = `${filePath}.bak`;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            if (raw && raw.trim().length > 0) {
                const data = JSON.parse(raw);
                try {
                    fs.copyFileSync(filePath, bakPath);
                } catch {}
                return data;
            }
        } catch (err) {
            console.error(`⚠️ [SafeStorage] File chính bị lỗi/hỏng format: ${filePath} (${err.message}). Đang thử khôi phục từ file backup .bak...`);
        }
    }

    if (fs.existsSync(bakPath)) {
        try {
            const bakRaw = fs.readFileSync(bakPath, 'utf-8');
            if (bakRaw && bakRaw.trim().length > 0) {
                const bakData = JSON.parse(bakRaw);
                console.log(`✅ [SafeStorage] Khôi phục thành công dữ liệu từ file backup: ${bakPath}`);
                safeWriteJSON(filePath, bakData, { backup: false });
                return bakData;
            }
        } catch (bakErr) {
            console.error(`❌ [SafeStorage] File backup .bak cũng bị lỗi: ${bakPath} (${bakErr.message})`);
        }
    }

    return defaultValue;
}

export function safeWriteJSON(filePath, data, options = {}) {
    const { backup = true, emptyGuard = true } = options;
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const tmpPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const bakPath = `${filePath}.bak`;
        const jsonStr = JSON.stringify(data, null, 2);

        if (emptyGuard && fs.existsSync(filePath)) {
            try {
                const currentRaw = fs.readFileSync(filePath, 'utf-8');
                if (currentRaw && currentRaw.length > 50 && (!jsonStr || jsonStr.trim() === '{}' || jsonStr.trim() === '[]' || jsonStr.trim() === '{"records":[]}')) {
                    console.warn(`⚠️ [SafeStorage EmptyGuard] Cảnh báo: Phát hiện hành vi ghi đè rỗng lên file đang có dữ liệu lớn (${filePath}). Đã lưu emergency backup!`);
                    fs.copyFileSync(filePath, `${filePath}.emergency_${Date.now()}.bak`);
                }
            } catch {}
        }

        if (backup && fs.existsSync(filePath)) {
            try {
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

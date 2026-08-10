import { EdgeTTS } from 'node-edge-tts';
import { createAudioResource } from '@discordjs/voice';
import fs from 'fs';
import path from 'path';

const TTS_DIR = path.resolve('./src/data/ttsTemp');

// Tự động dọn dẹp các file tts tạm cũ (> 3 phút)
function cleanOldTtsFiles() {
    try {
        if (!fs.existsSync(TTS_DIR)) {
            fs.mkdirSync(TTS_DIR, { recursive: true });
            return;
        }
        const files = fs.readdirSync(TTS_DIR);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(TTS_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 3 * 60 * 1000) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        });
    } catch (e) {}
}

/**
 * Chuyển đổi văn bản thành AudioResource của @discordjs/voice sử dụng EdgeTTS Hoài My (+20% Tốc độ)
 * @param {string} text - Câu thoại của AI cần đọc
 * @returns {Promise<import('@discordjs/voice').AudioResource|null>}
 */
export async function getVoiceResource(text) {
    try {
        cleanOldTtsFiles();
        const cleanText = text.replace(/[*_~`#]/g, '').trim().substring(0, 300);
        if (!cleanText) return null;

        const filePath = path.join(TTS_DIR, `yue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp3`);

        const tts = new EdgeTTS({
            voice: 'vi-VN-HoaiMyNeural',
            lang: 'vi-VN',
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
            rate: '+20%',
            pitch: '+0Hz'
        });

        await tts.ttsPromise(cleanText, filePath);
        return createAudioResource(filePath);
    } catch (error) {
        console.error("❌ Lỗi EdgeTTS (Hoài My +20%):", error.message);
        return null;
    }
}
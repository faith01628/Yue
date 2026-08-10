import { EdgeTTS } from 'node-edge-tts';
import * as googleTTS from 'google-tts-api';
import { createAudioResource } from '@discordjs/voice';
import fs from 'fs';
import path from 'path';

const TTS_DIR = path.resolve('./src/data/ttsTemp');

// Tự động dọn dẹp các file tts tạm cũ trong nền
function cleanOldTtsFilesAsync() {
    setTimeout(() => {
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
    }, 0);
}

/**
 * Chuyển đổi văn bản thành AudioResource sử dụng EdgeTTS Hoài My (vi-VN-HoaiMyNeural +20% Tốc độ)
 * Fallback sang Google TTS nếu có lỗi.
 * @param {string} text - Câu thoại của AI cần đọc
 * @returns {Promise<import('@discordjs/voice').AudioResource|null>}
 */
export async function getVoiceResource(text) {
    try {
        cleanOldTtsFilesAsync();
        const cleanText = text.replace(/[*_~`#]/g, '').trim().substring(0, 150);
        if (!cleanText) return null;

        const filePath = path.join(TTS_DIR, `yue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp3`);

        const tts = new EdgeTTS({
            voice: 'vi-VN-HoaiMyNeural',
            lang: 'vi-VN',
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
            rate: '+20%',
            pitch: '+0Hz',
            timeout: 8000
        });

        await tts.ttsPromise(cleanText, filePath);
        return createAudioResource(filePath);
    } catch (error) {
        console.warn("⚠️ EdgeTTS Hoài My gặp sự cố, tự động fallback sang Google TTS:", error.message);
        try {
            const cleanText = text.replace(/[*_~`#]/g, '').trim().substring(0, 150);
            const url = googleTTS.getAudioUrl(cleanText, { lang: 'vi', slow: false });
            return createAudioResource(url);
        } catch (e) {
            return null;
        }
    }
}
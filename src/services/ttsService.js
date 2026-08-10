import * as googleTTS from 'google-tts-api';
import { createAudioResource } from '@discordjs/voice';

/**
 * Chuyển đổi văn bản thành AudioResource siêu tốc (< 250ms) dùng Google TTS Direct Stream
 * @param {string} text - Câu thoại của AI cần đọc
 * @returns {import('@discordjs/voice').AudioResource|null}
 */
export function getVoiceResource(text) {
    try {
        const cleanText = text.replace(/[*_~`#]/g, '').trim().substring(0, 200);
        if (!cleanText) return null;

        const url = googleTTS.getAudioUrl(cleanText, {
            lang: 'vi',      
            slow: false,     
            host: 'https://translate.google.com',
            timeout: 5000,
        });

        return createAudioResource(url);
    } catch (error) {
        console.error("❌ Lỗi Google TTS Stream:", error.message);
        return null;
    }
}
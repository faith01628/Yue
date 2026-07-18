import * as googleTTS from 'google-tts-api';

/**
 * Chuyển đổi văn bản thành link Audio (mp3) dùng giọng đọc Google
 * @param {string} text - Câu thoại của AI cần đọc
 * @returns {string} - Đường dẫn URL chứa file âm thanh .mp3
 */
export function getVoiceUrl(text) {
    try {
        const cleanText = text.substring(0, 200);

        const url = googleTTS.getAudioUrl(cleanText, {
            lang: 'vi',      
            slow: false,     
            host: 'https://translate.google.com',
            timeout: 10000,
        });

        return url;
    } catch (error) {
        console.error("❌ Lỗi tạo link giọng nói TTS:", error);
        return null;
    }
}
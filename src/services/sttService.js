import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import { askYue } from './aiService.js';
import { getVoiceUrl } from './ttsService.js';
import { createAudioResource } from '@discordjs/voice';
import axios from 'axios';
import 'dotenv/config'; 
import ffmpegpath from 'ffmpeg-static';
process.env.FFMPEG_PATH = ffmpegpath;

function createWavHeader(dataLength) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20);  
    buffer.writeUInt16LE(1, 22);  
    buffer.writeUInt32LE(16000, 24); 
    buffer.writeUInt32LE(32000, 28); 
    buffer.writeUInt16LE(2, 32);  
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

export function listenToUser(connection, userId, username, player) {
    const receiver = connection.receiver;

    receiver.speaking.on('start', (uid) => {
        if (uid !== userId) return; 

        console.log(`\n[DEBUG 1] 🎙️ Phát hiện ${username} bắt đầu nói chuyện...`);

        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 2500, // 👈 ĐÃ TĂNG LÊN 2.5 GIÂY: Chờ bạn nói hết câu, tránh bị ngắt vụn luồng
            },
        });

        const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });

        decoder.on('error', (err) => {
            console.log(`[DEBUG OPUS] Đã chặn một gói tin lỗi: ${err.message}`);
        });

        const pcmStream = audioStream.pipe(decoder);

        let audioBuffer = [];
        pcmStream.on('data', (chunk) => {
            audioBuffer.push(chunk);
        });

        pcmStream.on('end', async () => {
            const finalAudioBuffer = Buffer.concat(audioBuffer);
            
            console.log(`[DEBUG 2] 💾 Đã thu xong âm thanh thô. Kích thước: ${finalAudioBuffer.length} bytes`);

            // 👈 TĂNG LÊN 40000 BYTES: Bỏ qua hẳn mấy cục âm thanh vụn vài KB để đỡ spam API
            if (finalAudioBuffer.length < 40000) {
                console.log(`[DEBUG 2.5] 🤫 Đoạn âm thanh quá ngắn (${finalAudioBuffer.length} bytes), bỏ qua không gửi.`);
                return;
            }

            try {
                console.log(`[DEBUG 3] 🌐 Đang gửi câu nói hoàn chỉnh lên Wit.ai...`);
                
                const wavHeader = createWavHeader(finalAudioBuffer.length);
                const wavBuffer = Buffer.concat([wavHeader, finalAudioBuffer]);
                

                const response = await axios.post(
                    'https://api.wit.ai/speech',
                    wavBuffer,
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.WIT_AI_TOKEN}`,
                            'Content-Type': 'audio/wav'
                        },
                        responseType: 'text', 
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    }
                );

                // ==========================================================
                // BỘ QUÉT TÌM CHỮ SIÊU BẠO LỰC (DÀNH CHO 187 DÒNG DATA)
                // ==========================================================
                let resultText = "";
                const rawData = response.data;

                if (typeof rawData === 'string') {
                    // Cắt thành các dòng
                    const lines = rawData.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
                    
                    console.log(`[DEBUG NDJSON] Tổng số dòng nhận về từ Wit.ai: ${lines.length}`);

                    // CHƠI CHIÊU: Ép kiểu tìm kiếm chuỗi thẳng vào văn bản thô, không sợ sai cấu trúc JSON
                    // Thằng Wit.ai kiểu gì dòng cuối cũng có dạng: ... "text": "câu bạn nói" ...
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            
                            // Cách 1: Nếu nó nằm trong parsed.text thông thường
                            if (parsed.text && parsed.text.trim() !== "") {
                                resultText = parsed.text;
                                break;
                            }
                            
                            // Cách 2: Phòng hờ Wit.ai đổi cấu trúc sang parsed.speech.text hoặc cấu trúc khác
                            if (parsed.speech?.text) {
                                resultText = parsed.speech.text;
                                break;
                            }
                        } catch (e) {
                            // Nếu dòng bị lỗi cú pháp, quét tiếp dòng khác
                        }
                    }

                    // TÌM KIẾM ĐƯỜNG CÙNG: Nếu duyệt JSON vẫn hụt, dùng Regex móc chữ trực tiếp từ dòng cuối cùng
                    if (!resultText) {
                        const lastLineWithText = lines.reverse().find(line => line.includes('"text":'));
                        if (lastLineWithText) {
                            const match = lastLineWithText.match(/"text"\s*:\s*"([^"]+)"/);
                            if (match && match[1]) {
                                resultText = match[1];
                            }
                        }
                    }
                }

                console.log(`[DEBUG 4] 🗣️ Wit.ai dịch ra chữ: "${resultText || "KHÔNG DỊCH ĐƯỢC CHỮ NÀO"}"`);

                if (!resultText || resultText.trim() === "") {
                    return;
                }

                // --- BỘ LỌC TỪ KHÓA ---
                const lowerText = resultText.toLowerCase();
                const wakeWords = ['Yue', 'vợ', 'ai đi', 'ai ri', 'hai ri', 'ơi', 'alo', 'a lô'];
                const hasWakeWord = wakeWords.some(word => lowerText.includes(word));

                if (!hasWakeWord) {
                    console.log(`[DEBUG 5] ℹ️ Không chứa từ khóa gọi Bot.`);
                    return;
                }

                console.log(`[DEBUG 6] 🔥 Khớp từ khóa! Đang gọi Gemini...`);
                const aiResponse = await askYue(userId, username, resultText);
                console.log(`🤖 Yue trả lời: "${aiResponse}"`);

                const voiceUrl = getVoiceUrl(aiResponse);
                if (voiceUrl) {
                    const resource = createAudioResource(voiceUrl);
                    player.play(resource);
                    console.log(`🔊 Đã đẩy âm thanh vào phòng Voice!`);
                }

            } catch (error) {
                console.error("❌ Lỗi chi tiết tại STT Wit.ai:", error.message);
            }
        });
    });
}
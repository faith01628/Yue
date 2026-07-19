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

// 🌐 ĐA LUỒNG: Mỗi user có một cờ khóa riêng, không ai chặn ai
const activeStreams = new Map();

// 🎯 DANH SÁCH USER ĐƯỢC PHÉP TRÒ CHUYỆN (Lưu ID và Username)
const allowedUsers = new Map();

/**
 * Hàm đăng ký thêm người dùng vào danh sách lắng nghe
 */
export function registerSpeaker(userId, username) {
    if (!allowedUsers.has(userId)) {
        allowedUsers.set(userId, username);
        console.log(`🔑 [QUYỀN] Đã cấp quyền lắng nghe cho: ${username} (${userId})`);
        return true; // Đăng ký mới thành công
    }
    return false; // Đã có quyền từ trước
}

export function listenToUser(connection, userId, username, player, textChannel) {
    const receiver = connection.receiver;

    // Tự động cấp quyền cho người gọi lệnh !join đầu tiên
    registerSpeaker(userId, username);

    receiver.speaking.on('start', (uid) => {
        // Chỉ xử lý nếu UID này nằm trong danh sách đã dùng lệnh (join hoặc listen)
        if (!allowedUsers.has(uid)) return;

        // Nếu user này đang bận gửi API lượt trước thì bỏ qua lượt nhấp nháy mới
        if (activeStreams.get(uid)) return;

        activeStreams.set(uid, true);

        const currentUsername = allowedUsers.get(uid) || username;

        console.log(`\n[DEBUG 1] 🎙️ Phát hiện ${currentUsername} bắt đầu nói chuyện...`);

        const audioStream = receiver.subscribe(uid, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1200, // Im lặng 1.2s là chốt câu gửi đi ngay
            },
        });

        const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });

        decoder.on('error', (err) => {
            console.log(`[DEBUG OPUS] Lỗi từ ${currentUsername}: ${err.message}`);
            activeStreams.delete(uid);
        });

        const pcmStream = audioStream.pipe(decoder);

        let audioBuffer = [];
        pcmStream.on('data', (chunk) => {
            audioBuffer.push(chunk);
        });

        pcmStream.on('end', async () => {
            const finalAudioBuffer = Buffer.concat(audioBuffer);

            console.log(`[DEBUG 2] 💾 Đã thu xong âm thanh của ${currentUsername}. Dung lượng: ${finalAudioBuffer.length} bytes`);

            // Giữ mức chặn 25KB để loại bỏ tiếng thở/nhiễu mic nhỏ
            if (finalAudioBuffer.length < 25000) {
                console.log(`[DEBUG 2.5] 🤫 Đoạn âm thanh quá ngắn (${finalAudioBuffer.length} bytes), bỏ qua.`);
                activeStreams.delete(uid);
                return;
            }

            try {
                console.log(`[DEBUG 3] 🌐 Đang gửi câu nói của ${currentUsername} lên Wit.ai...`);

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

                let resultText = "";
                const rawData = response.data;

                if (typeof rawData === 'string') {
                    const lines = rawData.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

                    console.log(`[DEBUG NDJSON] Tổng số dòng nhận về từ Wit.ai: ${lines.length}`);

                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            if (parsed.text && parsed.text.trim() !== "") {
                                resultText = parsed.text;
                                break;
                            }
                            if (parsed.speech?.text) {
                                resultText = parsed.speech.text;
                                break;
                            }
                        } catch (e) { }
                    }

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

                console.log(`[DEBUG 4] 🗣️ Wit.ai dịch ra chữ từ ${currentUsername}: "${resultText || "KHÔNG DỊCH ĐƯỢC CHỮ NÀO"}"`);

                if (!resultText || resultText.trim() === "") {
                    activeStreams.delete(uid);
                    return;
                }

                // ⚡ BỘ TỪ KHÓA MỚI DỄ BẮT ÂM
                const lowerText = resultText.toLowerCase();
                const wakeWords = ["yue", "nguyệt", "nguyệt ơi", "ê nguyệt", "vợ", "vợ ơi", "à nguyệt", "chị nguyệt", "chị nguyệt ơi"];
                const hasWakeWord = wakeWords.some(word => lowerText.includes(word));

                if (!hasWakeWord) {
                    console.log(`[DEBUG 5] ℹ️ Không chứa từ khóa gọi Bot.`);
                    activeStreams.delete(uid);
                    return;
                }

                console.log(`[DEBUG 6] 🔥 Khớp từ khóa! Đang gọi Gemini cho ${currentUsername}...`);

                const textFromWit = resultText;

                const mockMessageContext = {
                    id: 'voice-msg-' + Date.now(),
                    channel: textChannel,
                    author: { id: uid, bot: false },
                    member: { displayName: currentUsername },
                    content: textFromWit,
                    reply: async (content) => await textChannel.send(content)
                };

                const aiResponse = await askYue(uid, currentUsername, textFromWit, mockMessageContext, true);

                const voiceUrl = getVoiceUrl(aiResponse);
                if (voiceUrl) {
                    const resource = createAudioResource(voiceUrl);
                    player.play(resource);
                    console.log(`🔊 Đã đẩy âm thanh vào phòng Voice!`);
                }

            } catch (error) {
                console.error("❌ Lỗi chi tiết tại STT Wit.ai:", error.message);
            } finally {
                // 🔓 Xả cờ để user tiếp tục nói câu tiếp theo
                activeStreams.delete(uid);
            }
        });
    });
}
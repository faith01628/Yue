import { EndBehaviorType, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import prism from 'prism-media';
import { askYue } from './aiService.js';
import { getVoiceResource } from './ttsService.js';
import axios from 'axios';
import { Groq } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import 'dotenv/config'; 
import ffmpegpath from 'ffmpeg-static';
process.env.FFMPEG_PATH = ffmpegpath;

const groqClient = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

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

// 🏰 CƠ SỞ PHÂN LẬP VOICE CHÁT THEO TỪNG SERVER (GUILD ISOLATION)
// Map<guildId, { player: AudioPlayer, allowedUsers: Map, activeStreams: Map }>
const guildSessions = new Map();

export function getGuildVoiceSession(guildId) {
    if (!guildSessions.has(guildId)) {
        const player = createAudioPlayer();
        player.on(AudioPlayerStatus.Playing, () => {
            console.log(`🔊 [Guild ${guildId}] Yue AI đang phát giọng nói (Hoài My +20%).`);
        });
        player.on('error', error => {
            console.error(`❌ [Guild ${guildId}] Lỗi Audio Player:`, error.message);
        });

        guildSessions.set(guildId, {
            player: player,
            allowedUsers: new Map(),
            activeStreams: new Map()
        });
    }
    return guildSessions.get(guildId);
}

export function registerSpeaker(guildId, userId, username) {
    const session = getGuildVoiceSession(guildId);
    if (!session.allowedUsers.has(userId)) {
        session.allowedUsers.set(userId, username);
        console.log(`🔑 [QUYỀN] [Server ${guildId}] Đã cấp quyền lắng nghe cho: ${username} (${userId})`);
        return true;
    }
    return false;
}

async function transcribeWav(wavBuffer) {
    if (groqClient) {
        try {
            const dir = path.resolve('./src/data/ttsTemp');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const tempFile = path.join(dir, `stt_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
            fs.writeFileSync(tempFile, wavBuffer);

            console.log(`⚡ [Groq STT]: Gửi file âm thanh lên Groq Whisper Turbo...`);
            const transcription = await groqClient.audio.transcriptions.create({
                file: fs.createReadStream(tempFile),
                model: 'whisper-large-v3-turbo',
                prompt: 'Hội thoại tiếng Việt trong game Discord với Yue AI, Katashi, osu!, CS2, PUBG. Các từ gọi tên: Yue, Ê Yue, Yue ơi, Nguyệt, Nguyệt ơi, Vợ ơi.',
                language: 'vi',
                response_format: 'text'
            });

            try { fs.unlinkSync(tempFile); } catch (e) {}

            const text = typeof transcription === 'string' ? transcription : (transcription?.text || '');
            if (text && text.trim()) {
                console.log(`⚡ [Groq Whisper STT]: "${text.trim()}"`);
                return text.trim();
            }
        } catch (err) {
            console.warn(`⚠️ Groq STT thất bại hoặc hết lượt (${err.message}), chuyển sang Wit.ai...`);
        }
    }

    // Fallback sang Wit.ai nếu không có GROQ_API_KEY hoặc Groq lỗi
    return await transcribeWithWitAI(wavBuffer);
}

async function transcribeWithWitAI(wavBuffer) {
    try {
        console.log(`🌐 [Wit.ai STT]: Đang gửi âm thanh lên Wit.ai...`);
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
                } catch (e) {}
            }
        }
        return resultText || "";
    } catch (e) {
        console.error("❌ Lỗi Wit.ai STT:", e.message);
        return "";
    }
}

export function listenToUser(connection, userId, username, textChannel) {
    const guildId = connection.joinConfig.guildId;
    const session = getGuildVoiceSession(guildId);
    
    // Đăng ký bộ phát âm thanh riêng cho Server này
    connection.subscribe(session.player);

    const receiver = connection.receiver;

    // Tự động cấp quyền cho người gọi lệnh .join đầu tiên ở Server này
    registerSpeaker(guildId, userId, username);

    receiver.speaking.on('start', (uid) => {
        if (!session.allowedUsers.has(uid)) return;

        if (session.activeStreams.get(uid)) return;
        session.activeStreams.set(uid, true);

        const currentUsername = session.allowedUsers.get(uid) || username;
        console.log(`\n🎙️ [Voice STT - Server ${guildId}] ${currentUsername} bắt đầu nói...`);

        const audioStream = receiver.subscribe(uid, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1200, // Im lặng 1.2s
            },
        });

        const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });
        decoder.on('error', () => { session.activeStreams.delete(uid); });

        const pcmStream = audioStream.pipe(decoder);
        let audioBuffer = [];
        pcmStream.on('data', (chunk) => { audioBuffer.push(chunk); });

        pcmStream.on('end', async () => {
            const finalAudioBuffer = Buffer.concat(audioBuffer);

            if (finalAudioBuffer.length < 25000) {
                session.activeStreams.delete(uid);
                return;
            }

            try {
                const wavHeader = createWavHeader(finalAudioBuffer.length);
                const wavBuffer = Buffer.concat([wavHeader, finalAudioBuffer]);

                const resultText = await transcribeWav(wavBuffer);
                console.log(`🗣️ [STT Result - Server ${guildId}] ${currentUsername}: "${resultText || "KHÔNG DỊCH ĐƯỢC CHỮ NÀO"}"`);

                if (!resultText || resultText.trim() === "") {
                    session.activeStreams.delete(uid);
                    return;
                }

                // Từ khóa nhận diện gọi Yue
                const lowerText = resultText.toLowerCase();
                const wakeWords = ["yue", "nguyệt", "nguyệt ơi", "ê nguyệt", "vợ", "vợ ơi", "à nguyệt", "chị nguyệt", "chị nguyệt ơi", "duyệt", "dư"];
                const hasWakeWord = wakeWords.some(word => lowerText.includes(word));

                if (!hasWakeWord) {
                    console.log(`ℹ️ [STT Filter] Không chứa từ khóa gọi Yue.`);
                    session.activeStreams.delete(uid);
                    return;
                }

                const mockMessageContext = {
                    id: 'voice-msg-' + Date.now(),
                    channel: textChannel,
                    author: { id: uid, bot: false },
                    member: { displayName: currentUsername },
                    content: resultText,
                    reply: async (content) => await textChannel.send(content)
                };

                const aiResponse = await askYue(uid, currentUsername, resultText, mockMessageContext, true);

                const resource = getVoiceResource(aiResponse);
                if (resource) {
                    session.player.play(resource);
                    console.log(`🔊 [Voice Playback - Server ${guildId}] Phát giọng thoại siêu tốc (< 250ms)!`);
                }

            } catch (error) {
                console.error("❌ Lỗi Voice STT Service:", error.message);
            } finally {
                session.activeStreams.delete(uid);
            }
        });
    });
}
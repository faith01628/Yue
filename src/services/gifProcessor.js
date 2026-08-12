import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegpath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

/**
 * Extracts up to maxFrames keyframes from a GIF buffer or URL.
 * Returns an array of objects: [{ inlineData: { data: base64String, mimeType: 'image/png' } }]
 */
export async function extractGifKeyframes(inputBuffer, originalMimeType = 'image/gif', maxFrames = 4) {
    // If not a GIF or animated format, return standard single frame format
    if (!originalMimeType.includes('gif') && !originalMimeType.includes('webp')) {
        return [{
            inlineData: {
                data: Buffer.from(inputBuffer).toString('base64'),
                mimeType: originalMimeType
            }
        }];
    }

    const tempDir = path.join(os.tmpdir(), `yue_gif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });

        const inputPath = path.join(tempDir, 'input.gif');
        const outputPattern = path.join(tempDir, 'frame_%d.png');

        fs.writeFileSync(inputPath, inputBuffer);

        const ffmpegExecutable = process.env.FFMPEG_PATH || ffmpegpath;

        // Extract keyframes using ffmpeg
        // -vf "fps=2" extracts up to 2 frames per second, capped at maxFrames with -vframes
        await execFileAsync(ffmpegExecutable, [
            '-y',
            '-i', inputPath,
            '-vf', 'fps=2',
            '-vframes', String(maxFrames),
            outputPattern
        ], { timeout: 10000 });

        const files = fs.readdirSync(tempDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('frame_', '').replace('.png', ''), 10);
                const numB = parseInt(b.replace('frame_', '').replace('.png', ''), 10);
                return numA - numB;
            });

        if (files.length === 0) {
            // Fallback if no frames were generated
            return [{
                inlineData: {
                    data: Buffer.from(inputBuffer).toString('base64'),
                    mimeType: originalMimeType
                }
            }];
        }

        const frames = files.map(file => {
            const filePath = path.join(tempDir, file);
            const frameBuffer = fs.readFileSync(filePath);
            return {
                inlineData: {
                    data: frameBuffer.toString('base64'),
                    mimeType: 'image/png'
                }
            };
        });

        return frames;

    } catch (err) {
        console.warn('⚠️ Lỗi bóc tách keyframe GIF bằng ffmpeg, dùng fallback 1 frame:', err.message);
        return [{
            inlineData: {
                data: Buffer.from(inputBuffer).toString('base64'),
                mimeType: originalMimeType
            }
        }];
    } finally {
        // Clean up temp files synchronously in finally block
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            // Ignore cleanup errors
        }
    }
}

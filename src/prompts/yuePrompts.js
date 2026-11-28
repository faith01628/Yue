import { PERSONA_PROMPT } from './core/persona.js';
import { KNOWLEDGE_PROMPT } from './core/knowledge.js';
import {
    FULL_SELF_COMMANDS,
    MULTI_SELF_COMMANDS,
    PM_SELF_COMMANDS
} from './core/selfCommands.js';
import {
    CONTENT_SAFETY_RULES,
    DISCORD_BLACKLIST_RULES
} from './core/safetyRules.js';
import { VOICE_INSTRUCTION } from './modes/voice.js';
import { DISCORD_TEXT_INSTRUCTION } from './modes/discordChat.js';
import { getIngameInstruction } from './modes/ingameMulti.js';
import { getPmInstruction } from './modes/ingamePm.js';
import { getDevArchitectInstruction } from './modes/devArchitect.js';

export const BASE_SYSTEM_PROMPT = [
    PERSONA_PROMPT,
    FULL_SELF_COMMANDS,
    KNOWLEDGE_PROMPT,
    CONTENT_SAFETY_RULES,
    DISCORD_BLACKLIST_RULES
].join('');

export {
    VOICE_INSTRUCTION,
    DISCORD_TEXT_INSTRUCTION,
    getIngameInstruction,
    getPmInstruction,
    getDevArchitectInstruction
};

/**
 * Lắp ghép System Prompt chọn lọc theo từng ngữ cảnh (Voice / PM / Multi 24/7 / Dev Architect / Discord Text)
 * kèm danh sách bài học Tầng 1 (nếu có) giúp tiết kiệm token và tự cải thiện câu trả lời.
 */
export function buildSystemPrompt({ isVoice = false, isIngame = false, extraContext = null } = {}) {
    const lessonsBlock = extraContext?.lessonsText
        ? `\n\n[SỔ TAY BÀI HỌC TỰ RÚT KINH NGHIỆM (TẦNG 1 - DO KATASHI DẠY)]:\n${extraContext.lessonsText}`
        : '';

    if (isVoice) {
        return `${PERSONA_PROMPT}${KNOWLEDGE_PROMPT}${VOICE_INSTRUCTION}`;
    }

    if (extraContext?.mode === 'dev_architect') {
        return `${PERSONA_PROMPT}${KNOWLEDGE_PROMPT}${getDevArchitectInstruction(extraContext)}`;
    }

    if (isIngame) {
        if (extraContext?.mode === 'pm') {
            return `${PERSONA_PROMPT}${KNOWLEDGE_PROMPT}${PM_SELF_COMMANDS}${CONTENT_SAFETY_RULES}${lessonsBlock}${getPmInstruction(extraContext)}`;
        }
        return `${PERSONA_PROMPT}${KNOWLEDGE_PROMPT}\n\n${MULTI_SELF_COMMANDS}${CONTENT_SAFETY_RULES}${lessonsBlock}${getIngameInstruction(extraContext)}`;
    }

    return `${BASE_SYSTEM_PROMPT}${lessonsBlock}${DISCORD_TEXT_INSTRUCTION}`;
}

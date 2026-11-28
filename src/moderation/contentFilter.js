import { VI_EXACT_DIACRITIC_WORDS, VI_ABUSIVE_PHRASES } from './wordLists/vi.js';
import { EN_ABUSIVE_PHRASES } from './wordLists/en.js';

export function stripVietnameseDiacritics(text) {
    return String(text || '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BOUNDARY_PREFIX = '(?:^|[^\\p{L}\\p{N}])';
const BOUNDARY_SUFFIX = '(?:$|[^\\p{L}\\p{N}])';

const ABUSIVE_REGEX_PATTERNS = [
    ...VI_EXACT_DIACRITIC_WORDS.map((phrase) => ({
        phrase,
        rawRegex: new RegExp(`${BOUNDARY_PREFIX}${escapeRegex(phrase.toLowerCase())}${BOUNDARY_SUFFIX}`, 'iu'),
        asciiRegex: null
    })),
    ...[...VI_ABUSIVE_PHRASES, ...EN_ABUSIVE_PHRASES].map((phrase) => {
        const rawPhrase = phrase.toLowerCase().trim();
        const asciiPhrase = stripVietnameseDiacritics(rawPhrase).trim();
        return {
            phrase,
            rawRegex: new RegExp(`${BOUNDARY_PREFIX}${escapeRegex(rawPhrase)}${BOUNDARY_SUFFIX}`, 'iu'),
            asciiRegex: new RegExp(`${BOUNDARY_PREFIX}${escapeRegex(asciiPhrase)}${BOUNDARY_SUFFIX}`, 'iu')
        };
    })
];

/**
 * Kiểm tra nội dung có chứa từ ngữ thô tục, xúc phạm hoặc công kích cá nhân hay không
 * @param {string} text
 * @returns {{ flagged: boolean, reason: string | null }}
 */
export function checkAbusiveContent(text) {
    if (!text || typeof text !== 'string') {
        return { flagged: false, reason: null };
    }

    const lowered = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const ascii = stripVietnameseDiacritics(lowered);

    for (const item of ABUSIVE_REGEX_PATTERNS) {
        if (item.rawRegex.test(lowered) || (item.asciiRegex && item.asciiRegex.test(ascii))) {
            return {
                flagged: true,
                reason: `matched:${item.phrase}`
            };
        }
    }

    return { flagged: false, reason: null };
}

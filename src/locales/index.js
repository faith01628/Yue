import vi from './vi.js';
import en from './en.js';

export const LOCALES = { vi, en };

function getNestedValue(obj, key) {
    if (!obj || !key) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return obj[key];
    }
    if (!key.includes('.')) return undefined;

    const parts = key.split('.');
    let curr = obj;
    for (const part of parts) {
        if (curr && typeof curr === 'object' && Object.prototype.hasOwnProperty.call(curr, part)) {
            curr = curr[part];
        } else {
            return undefined;
        }
    }
    return curr;
}

/**
 * Tra cứu chuỗi theo ngôn ngữ (`vi` / `en`), hỗ trợ cả key phẳng ('rsNoScore') và key phân cấp ('pm.autoGreet')
 */
export function t(key, lang = 'en', ...args) {
    const targetLang = Object.prototype.hasOwnProperty.call(LOCALES, lang) ? lang : 'en';
    const dict = LOCALES[targetLang] || LOCALES.en;
    let val = getNestedValue(dict, key);
    if (val === undefined) {
        val = getNestedValue(LOCALES.en, key);
    }
    if (val === undefined) return '';
    return typeof val === 'function' ? val(...args) : val;
}

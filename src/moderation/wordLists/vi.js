/**
 * Danh sách từ ngữ thô tục / công kích cá nhân tiếng Việt
 * - VI_EXACT_DIACRITIC_WORDS: từ đơn phải giữ nguyên dấu để tránh nhầm với từ bình thường ("các", "đi", "buổi", "lớn", "dù", "đeo", "phở")
 * - VI_ABUSIVE_PHRASES: cụm từ hoặc viết tắt bắt cả có dấu lẫn không dấu
 */

export const VI_EXACT_DIACRITIC_WORDS = [
    'địt', 'đụ', 'đéo', 'cặc', 'lồn', 'buồi', 'đĩ', 'phò'
];

export const VI_ABUSIVE_PHRASES = [
    'súc vật', 'óc chó', 'mất dạy',
    'chó đẻ', 'đồ chó', 'con đĩ',
    'thằng ngu', 'con ngu', 'đồ ngu', 'ngu vcl', 'ngu vl',
    'chết mẹ', 'đụ má', 'duma', 'địt mẹ',
    'đm', 'đmm', 'vkl', 'vcl', 'clmm', 'cmm', 'dcm', 'dcmm', 'dmm',
    'bố láo', 'rẻ rách', 'não chó', 'cút mẹ'
];

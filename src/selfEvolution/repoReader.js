import fs from 'fs';
import path from 'path';

const TREE_CACHE_TTL_MS = 30 * 60 * 1000;
let cachedTree = { key: '', files: [], fetchedAt: 0 };

function listLocalSrcFiles(dirPath = path.resolve('src'), baseDir = path.resolve('.')) {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'data' || entry.name === '.git') continue;
            results.push(...listLocalSrcFiles(full, baseDir));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
        }
    }
    return results;
}

/**
 * Đọc cây thư mục `src/` (chỉ đọc) từ GitHub nhánh dev, có fallback quét local `src/`
 */
export async function fetchDevRepoTree(repo = 'faith01628/Yue', branch = 'dev') {
    const cacheKey = `${repo}:${branch}`;
    if (cachedTree.key === cacheKey && cachedTree.files.length > 0 && (Date.now() - cachedTree.fetchedAt < TREE_CACHE_TTL_MS)) {
        return cachedTree.files;
    }

    try {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Yue-SelfEvolution-Reader'
        };
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const json = await res.json();
            const files = (json.tree || [])
                .filter(node => node.type === 'blob' && typeof node.path === 'string')
                .map(node => node.path)
                .filter(p => p.startsWith('src/') && p.endsWith('.js'));

            if (files.length > 0) {
                cachedTree = { key: cacheKey, files, fetchedAt: Date.now() };
                return files;
            }
        }
    } catch (err) {
        console.warn('[SelfEvolution RepoReader] GitHub tree fallback to local src/:', err.message);
    }

    const localFiles = listLocalSrcFiles();
    cachedTree = { key: cacheKey, files: localFiles, fetchedAt: Date.now() };
    return localFiles;
}

/**
 * Chọn tối đa `limit` file liên quan nhất trong `src/` theo từ khóa chủ đề
 */
export function selectRelevantFiles(fileList, queryText, limit = 3) {
    if (!Array.isArray(fileList) || fileList.length === 0) return [];

    const cleanedQuery = String(queryText || '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const tokens = Array.from(new Set(cleanedQuery.split(/\s+/).filter(w => w.length >= 2)));

    const scored = fileList.map((filePath) => {
        const lowerPath = filePath.toLowerCase();
        let score = 0;

        for (const tok of tokens) {
            if (lowerPath.includes(tok)) {
                score += lowerPath.endsWith(`/${tok}.js`) ? 5 : 2;
            }
        }

        // Map một số từ khóa thường gặp sang đúng module
        if ((cleanedQuery.includes('pm') || cleanedQuery.includes('np') || cleanedQuery.includes('tin nhan rieng')) && lowerPath.includes('osupmassistant')) score += 4;
        if ((cleanedQuery.includes('bancho') || cleanedQuery.includes('irc') || cleanedQuery.includes('multi')) && (lowerPath.includes('bancho') || lowerPath.includes('osuingame'))) score += 3;
        if ((cleanedQuery.includes('prompt') || cleanedQuery.includes('tinh cach') || cleanedQuery.includes('ai')) && (lowerPath.includes('prompts') || lowerPath.includes('aiservice'))) score += 3;
        if ((cleanedQuery.includes('tieng anh') || cleanedQuery.includes('tieng viet') || cleanedQuery.includes('ngon ngu') || cleanedQuery.includes('help')) && lowerPath.includes('locales')) score += 3;
        if ((cleanedQuery.includes('loc') || cleanedQuery.includes('tho tuc') || cleanedQuery.includes('spam')) && (lowerPath.includes('moderation') || lowerPath.includes('pmguard'))) score += 3;
        if ((cleanedQuery.includes('bxh') || cleanedQuery.includes('leaderboard') || cleanedQuery.includes('.me')) && lowerPath.includes('dailyleaderboard')) score += 4;

        return { filePath, score };
    });

    scored.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));
    return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.filePath);
}

/**
 * Tải nội dung chỉ đọc của 1 file trên nhánh `dev` (tối đa maxChars ký tự)
 */
export async function fetchDevFileContent(repo = 'faith01628/Yue', branch = 'dev', filePath, maxChars = 4500) {
    if (!filePath || !filePath.startsWith('src/')) return null;

    try {
        const headers = { 'User-Agent': 'Yue-SelfEvolution-Reader' };
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${filePath}`;
        const res = await fetch(rawUrl, { headers });
        if (res.ok) {
            const text = await res.text();
            return text.length > maxChars ? `${text.slice(0, maxChars)}\n// ... (truncated)` : text;
        }
    } catch {
        // Fallback sang đọc local
    }

    try {
        const localPath = path.resolve(filePath);
        if (fs.existsSync(localPath)) {
            const text = fs.readFileSync(localPath, 'utf-8');
            return text.length > maxChars ? `${text.slice(0, maxChars)}\n// ... (truncated)` : text;
        }
    } catch {}

    return null;
}

/**
 * Thu thập ngữ cảnh code trên nhánh `dev` cho 1 chủ đề nâng cấp
 */
export async function gatherCodeContextForTopic(topicText, cfg = {}) {
    const repo = cfg.githubRepo || 'faith01628/Yue';
    const branch = cfg.githubBranch || 'dev';

    const tree = await fetchDevRepoTree(repo, branch);
    let selected = selectRelevantFiles(tree, topicText, 3);
    if (selected.length === 0 && tree.length > 0) {
        selected = tree.slice(0, 2);
    }

    const snippets = [];
    for (const filePath of selected) {
        const content = await fetchDevFileContent(repo, branch, filePath, 3500);
        if (content) {
            snippets.push(`=== ${filePath} (branch: ${branch}) ===\n${content}`);
        }
    }

    return {
        repo,
        branch,
        relatedFiles: selected,
        codeContext: snippets.length > 0
            ? snippets.join('\n\n')
            : `Các file liên quan trong repo: ${tree.slice(0, 25).join(', ')}`
    };
}

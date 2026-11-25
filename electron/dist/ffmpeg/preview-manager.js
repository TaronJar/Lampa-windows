"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FfmpegPreviewManager = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const node_net_1 = require("node:net");
const node_child_process_1 = require("node:child_process");
const installer_1 = require("./installer");
const MAX_CACHE_FILES = 1200;
const PREVIEW_TIMEOUT_MS = 18000;
class FfmpegPreviewManager {
    userDataPath;
    installTask = null;
    active = new Map();
    cacheDir;
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.cacheDir = (0, node_path_1.join)(userDataPath, 'tools', 'ffmpeg-preview-cache');
    }
    ffmpegPath() { return (0, node_path_1.join)(this.userDataPath, 'tools', 'ffmpeg', 'ffmpeg.exe'); }
    async ensureInstalled() {
        const status = await this.status();
        if (status.installed)
            return { ffmpegPath: this.ffmpegPath(), ffprobePath: (0, node_path_1.join)(this.userDataPath, 'tools', 'ffmpeg', 'ffprobe.exe'), version: status.version };
        return this.install();
    }
    async status() {
        const base = (0, node_path_1.join)(this.userDataPath, 'tools', 'ffmpeg');
        const ffmpeg = (0, node_path_1.join)(base, 'ffmpeg.exe');
        const ffprobe = (0, node_path_1.join)(base, 'ffprobe.exe');
        let hasFfmpeg = false, hasFfprobe = false, version = '';
        try {
            await (0, promises_1.access)(ffmpeg);
            hasFfmpeg = true;
        }
        catch { }
        try {
            await (0, promises_1.access)(ffprobe);
            hasFfprobe = true;
        }
        catch { }
        if (hasFfmpeg && hasFfprobe)
            version = await new Promise(resolve => {
                const child = (0, node_child_process_1.spawn)(ffmpeg, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
                let output = '';
                child.stdout?.on('data', chunk => { output += String(chunk); });
                const timer = setTimeout(() => { child.kill(); resolve('unknown'); }, 8000);
                child.once('error', () => { clearTimeout(timer); resolve('unknown'); });
                child.once('exit', code => { clearTimeout(timer); resolve(code === 0 ? (output.split(/\r?\n/)[0] || 'unknown') : 'unknown'); });
            });
        return { installed: hasFfmpeg && hasFfprobe, ffmpeg: hasFfmpeg, ffprobe: hasFfprobe, version };
    }
    async install(onProgress) { if (this.installTask)
        return this.installTask; this.installTask = (0, installer_1.installFfmpeg)(this.userDataPath, onProgress); try {
        return await this.installTask;
    }
    finally {
        this.installTask = null;
    } }
    async preview(rawUrl, rawSeconds) {
        const url = this.validateUrl(rawUrl);
        const seconds = Math.max(0, Math.min(24 * 60 * 60, Number(rawSeconds)));
        if (!Number.isFinite(seconds))
            throw new Error('Invalid preview timestamp.');
        const key = this.cacheKey(url, seconds);
        await (0, promises_1.mkdir)(this.cacheDir, { recursive: true });
        const cachedPath = (0, node_path_1.join)(this.cacheDir, key + '.jpg');
        try {
            const info = await (0, promises_1.stat)(cachedPath);
            if (info.size > 1000)
                return { path: cachedPath, cached: true };
        }
        catch { }
        const ffmpeg = await this.ensureInstalled();
        const tempPath = (0, node_path_1.join)(this.cacheDir, key + `.${Date.now()}.tmp.jpg`);
        const processKey = url;
        this.active.get(processKey)?.kill();
        const child = (0, node_child_process_1.spawn)(ffmpeg.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', url, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '-y', tempPath], { windowsHide: true, stdio: 'ignore' });
        this.active.set(processKey, child);
        try {
            await new Promise((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error('Preview extraction timed out.')); }, PREVIEW_TIMEOUT_MS); child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('FFmpeg could not extract the preview frame.')); }); });
            const info = await (0, promises_1.stat)(tempPath);
            if (info.size < 1000)
                throw new Error('Preview image is invalid.');
            await (0, promises_1.rm)(cachedPath, { force: true });
            await import('node:fs/promises').then(fs => fs.rename(tempPath, cachedPath));
            await this.trimCache();
            return { path: cachedPath, cached: false };
        }
        finally {
            if (this.active.get(processKey) === child)
                this.active.delete(processKey);
            await (0, promises_1.rm)(tempPath, { force: true }).catch(() => undefined);
        }
    }
    validateUrl(raw) {
        if (typeof raw !== 'string' || raw.length > 4096)
            throw new Error('Invalid preview URL.');
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        const localName = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const ipType = (0, node_net_1.isIP)(host);
        const privateIPv4 = ipType === 4 && (host.startsWith('10.') || host.startsWith('192.168.') || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host) || host.startsWith('127.'));
        const privateIPv6 = ipType === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'));
        const validPort = ['8090', '6878'].includes(url.port);
        if (url.protocol !== 'http:' || !(localName || privateIPv4 || privateIPv6) || !validPort || url.username || url.password)
            throw new Error('Preview source must be a private-network TorrServer HTTP stream.');
        return url.href;
    }
    cacheKey(url, seconds) { return (0, node_crypto_1.createHash)('sha256').update(url).update('|').update(String(Math.floor(seconds))).digest('hex'); }
    async trimCache() { const entries = await (0, promises_1.readdir)(this.cacheDir); const files = await Promise.all(entries.filter(name => name.endsWith('.jpg')).map(async (name) => { const path = (0, node_path_1.join)(this.cacheDir, name); const info = await (0, promises_1.stat)(path).catch(() => null); return info ? { path, mtime: info.mtimeMs } : null; })); const sorted = files.filter((item) => !!item).sort((a, b) => a.mtime - b.mtime); for (const item of sorted.slice(0, Math.max(0, sorted.length - MAX_CACHE_FILES)))
        await (0, promises_1.rm)(item.path, { force: true }).catch(() => undefined); }
    cancelAll() { for (const child of this.active.values())
        child.kill(); this.active.clear(); }
}
exports.FfmpegPreviewManager = FfmpegPreviewManager;

import { mkdir, access, stat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { installFfmpeg, type FfmpegInstallResult } from './installer';

const MAX_CACHE_FILES = 1200;
const PREVIEW_TIMEOUT_MS = 18000;

export class FfmpegPreviewManager {
    private installTask: Promise<FfmpegInstallResult> | null = null;
    private active = new Map<string, ChildProcess>();
    private cacheDir: string;

    constructor(private readonly userDataPath: string) {
        this.cacheDir = join(userDataPath, 'tools', 'ffmpeg-preview-cache');
    }

    private ffmpegPath(): string { return join(this.userDataPath, 'tools', 'ffmpeg', 'ffmpeg.exe'); }

    async ensureInstalled(): Promise<FfmpegInstallResult> {
        try {
            await access(this.ffmpegPath());
            return { ffmpegPath: this.ffmpegPath(), ffprobePath: join(this.userDataPath, 'tools', 'ffmpeg', 'ffprobe.exe'), version: 'installed' };
        } catch { /* install below */ }
        if (this.installTask) return this.installTask;
        this.installTask = installFfmpeg(this.userDataPath);
        try { return await this.installTask; } finally { this.installTask = null; }
    }

    async preview(rawUrl: unknown, rawSeconds: unknown): Promise<{ path?: string; cached: boolean }> {
        const url = this.validateUrl(rawUrl);
        const seconds = Math.max(0, Math.min(24 * 60 * 60, Number(rawSeconds)));
        if (!Number.isFinite(seconds)) throw new Error('Invalid preview timestamp.');
        const key = this.cacheKey(url, seconds);
        await mkdir(this.cacheDir, { recursive: true });
        const cachedPath = join(this.cacheDir, key + '.jpg');
        try { const info = await stat(cachedPath); if (info.size > 1000) return { path: cachedPath, cached: true }; } catch {}
        const ffmpeg = await this.ensureInstalled();
        const tempPath = join(this.cacheDir, key + `.${Date.now()}.tmp.jpg`);
        const processKey = `${url}`;
        this.active.get(processKey)?.kill();
        const child = spawn(ffmpeg.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', url, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '-y', tempPath], { windowsHide: true, stdio: 'ignore' });
        this.active.set(processKey, child);
        try {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => { child.kill(); reject(new Error('Preview extraction timed out.')); }, PREVIEW_TIMEOUT_MS);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('FFmpeg could not extract the preview frame.')); });
            });
            const info = await stat(tempPath);
            if (info.size < 1000) throw new Error('Preview image is invalid.');
            await rm(cachedPath, { force: true });
            await import('node:fs/promises').then(fs => fs.rename(tempPath, cachedPath));
            await this.trimCache();
            return { path: cachedPath, cached: false };
        } finally {
            if (this.active.get(processKey) === child) this.active.delete(processKey);
            await rm(tempPath, { force: true }).catch(() => undefined);
        }
    }

    private validateUrl(raw: unknown): string {
        if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid preview URL.');
        const url = new URL(raw);
        const validHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
        const validPort = ['8090', '6878'].includes(url.port);
        if (url.protocol !== 'http:' || !validHost || !validPort || url.username || url.password) throw new Error('Preview source must be a local TorrServer HTTP stream.');
        return url.href;
    }

    private cacheKey(url: string, seconds: number): string {
        const { createHash } = require('node:crypto') as typeof import('node:crypto');
        return createHash('sha256').update(url).update('|').update(String(Math.floor(seconds))).digest('hex');
    }

    private async trimCache(): Promise<void> {
        const entries = await readdir(this.cacheDir);
        const files = await Promise.all(entries.filter(name => name.endsWith('.jpg')).map(async name => {
            const path = join(this.cacheDir, name);
            const info = await stat(path).catch(() => null);
            return info ? { path, mtime: info.mtimeMs } : null;
        }));
        const sorted = files.filter((item): item is { path: string; mtime: number } => !!item).sort((a, b) => a.mtime - b.mtime);
        for (const item of sorted.slice(0, Math.max(0, sorted.length - MAX_CACHE_FILES))) await rm(item.path, { force: true }).catch(() => undefined);
    }

    cancelAll(): void {
        for (const child of this.active.values()) child.kill();
        this.active.clear();
    }
}

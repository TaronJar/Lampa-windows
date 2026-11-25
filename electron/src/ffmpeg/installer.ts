import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { spawn } from 'node:child_process';

const RELEASE_API = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';
const ASSET_NAME = 'ffmpeg-master-latest-win64-lgpl.zip';
const MAX_DOWNLOAD = 220 * 1024 * 1024;

export interface FfmpegInstallResult { ffmpegPath: string; ffprobePath: string; version: string }

function trustedHttps(raw: string): URL {
    const url = new URL(raw);
    const hosts = ['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) throw new Error('Blocked untrusted FFmpeg download URL.');
    return url;
}

async function fetchJson(url: string): Promise<any> {
    trustedHttps(url);
    const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Lampa-Windows' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`GitHub release metadata request failed: HTTP ${response.status}`);
    return response.json();
}

export type FfmpegProgress = { phase: 'metadata' | 'download' | 'verify' | 'extract' | 'validate' | 'install' | 'complete'; percent?: number; detail?: string; bytes?: number; total?: number };

async function downloadVerified(url: string, destination: string, expectedDigest: string, onProgress?: (progress: FfmpegProgress) => void, total?: number): Promise<void> {
    trustedHttps(url);
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error(`FFmpeg download failed: HTTP ${response.status}`);
    trustedHttps(response.url);
    const hash = createHash('sha256');
    let bytes = 0;
    const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > MAX_DOWNLOAD) return callback(new Error('FFmpeg archive exceeds download size limit.'));
            hash.update(chunk);
            callback(null, chunk);
        }
    });
    await pipeline(response.body as unknown as NodeJS.ReadableStream, meter, createWriteStream(destination, { flags: 'wx' }));
    const actual = hash.digest('hex');
    if (actual !== expectedDigest.toLowerCase()) throw new Error('FFmpeg archive SHA-256 verification failed.');
    if (bytes < 50 * 1024 * 1024) throw new Error('FFmpeg archive is unexpectedly small.');
}

async function findBinary(root: string, name: string): Promise<string | undefined> {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return path;
        if (entry.isDirectory()) {
            const found = await findBinary(path, name);
            if (found) return found;
        }
    }
    return undefined;
}

function validateExecutable(executable: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, ['-version'], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('FFmpeg executable validation timed out.'));
        }, 10000);
        child.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('exit', code => {
            clearTimeout(timer);
            code === 0 ? resolve() : reject(new Error('FFmpeg executable failed its version check.'));
        });
    });
}

function runPowerShellExtract(zipPath: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zipPath, destination], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => { child.kill(); reject(new Error('FFmpeg archive extraction timed out.')); }, 120000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`FFmpeg archive extraction failed (code ${code}).`)); });
    });
}

export async function installFfmpeg(userDataPath: string, onProgress?: (progress: FfmpegProgress) => void): Promise<FfmpegInstallResult> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('FFmpeg installer currently supports Windows x64 only.');
    const base = join(userDataPath, 'tools', 'ffmpeg');
    const staging = join(userDataPath, 'tools', `.ffmpeg-staging-${Date.now()}`);
    const archive = join(staging, 'ffmpeg.zip');
    const extracted = join(staging, 'extracted');
    const backup = join(userDataPath, 'tools', `.ffmpeg-backup-${Date.now()}`);
    let backedUp = false;
    await mkdir(extracted, { recursive: true });
    try {
        onProgress?.({ phase: 'metadata', detail: 'Получение информации о релизе' });
        const release = await fetchJson(RELEASE_API);
        const asset = release.assets?.find((item: any) => item.name === ASSET_NAME);
        if (!asset?.browser_download_url || !asset?.digest || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest)) {
            throw new Error('The GitHub release does not provide the expected archive and SHA-256 digest.');
        }
        onProgress?.({ phase: 'download', percent: 0, total: asset.size });
        await downloadVerified(asset.browser_download_url, archive, asset.digest.slice(7), onProgress, asset.size);
        onProgress?.({ phase: 'verify', detail: 'Проверка SHA-256' });
        onProgress?.({ phase: 'extract', detail: 'Распаковка архива' });
        await runPowerShellExtract(archive, extracted);
        const ffmpeg = await findBinary(extracted, 'ffmpeg.exe');
        const ffprobe = await findBinary(extracted, 'ffprobe.exe');
        if (!ffmpeg || !ffprobe) throw new Error('FFmpeg archive is missing ffmpeg.exe or ffprobe.exe.');
        await validateExecutable(ffmpeg);
        await validateExecutable(ffprobe);
        const installTemp = join(staging, 'payload');
        await mkdir(installTemp, { recursive: true });
        const ffmpegTemp = join(installTemp, 'ffmpeg.exe');
        const ffprobeTemp = join(installTemp, 'ffprobe.exe');
        const { copyFile } = await import('node:fs/promises');
        onProgress?.({ phase: 'install', detail: 'Установка бинарников' });
        await copyFile(ffmpeg, ffmpegTemp);
        await copyFile(ffprobe, ffprobeTemp);
        await mkdir(join(userDataPath, 'tools'), { recursive: true });
        try { await rename(base, backup); backedUp = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        try {
            await rename(installTemp, base);
            if (backedUp) await rm(backup, { recursive: true, force: true });
        } catch (error) {
            if (backedUp) await rename(backup, base).catch(() => undefined);
            throw error;
        }
        onProgress?.({ phase: 'complete', percent: 100, detail: 'Установка завершена' });
        return { ffmpegPath: join(base, 'ffmpeg.exe'), ffprobePath: join(base, 'ffprobe.exe'), version: String(release.tag_name || release.name || 'latest') };
    } finally {
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
}

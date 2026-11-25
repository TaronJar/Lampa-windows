"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installFfmpeg = installFfmpeg;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const promises_2 = require("node:stream/promises");
const node_stream_1 = require("node:stream");
const node_child_process_1 = require("node:child_process");
const RELEASE_API = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';
const ASSET_NAME = 'ffmpeg-master-latest-win64-lgpl.zip';
const MAX_DOWNLOAD = 220 * 1024 * 1024;
function trustedHttps(raw) {
    const url = new URL(raw);
    const hosts = ['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname))
        throw new Error('Blocked untrusted FFmpeg download URL.');
    return url;
}
async function fetchJson(url) {
    trustedHttps(url);
    const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Lampa-Windows' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok)
        throw new Error(`GitHub release metadata request failed: HTTP ${response.status}`);
    return response.json();
}
async function downloadVerified(url, destination, expectedDigest, onProgress, total) {
    trustedHttps(url);
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body)
        throw new Error(`FFmpeg download failed: HTTP ${response.status}`);
    trustedHttps(response.url);
    const hash = (0, node_crypto_1.createHash)('sha256');
    let bytes = 0;
    const meter = new node_stream_1.Transform({
        transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > MAX_DOWNLOAD)
                return callback(new Error('FFmpeg archive exceeds download size limit.'));
            hash.update(chunk);
            callback(null, chunk);
        }
    });
    await (0, promises_2.pipeline)(response.body, meter, (0, node_fs_1.createWriteStream)(destination, { flags: 'wx' }));
    const actual = hash.digest('hex');
    if (actual !== expectedDigest.toLowerCase())
        throw new Error('FFmpeg archive SHA-256 verification failed.');
    if (bytes < 50 * 1024 * 1024)
        throw new Error('FFmpeg archive is unexpectedly small.');
}
async function findBinary(root, name) {
    const entries = await (0, promises_1.readdir)(root, { withFileTypes: true });
    for (const entry of entries) {
        const path = (0, node_path_1.join)(root, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase())
            return path;
        if (entry.isDirectory()) {
            const found = await findBinary(path, name);
            if (found)
                return found;
        }
    }
    return undefined;
}
function validateExecutable(executable) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(executable, ['-version'], { windowsHide: true, stdio: 'ignore' });
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
function runPowerShellExtract(zipPath, destination) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:FFMPEG_ZIP -DestinationPath $env:FFMPEG_DEST -Force"
        ], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                FFMPEG_ZIP: zipPath,
                FFMPEG_DEST: destination
            }
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', data => stdout += data.toString());
        child.stderr?.on('data', data => stderr += data.toString());
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('FFmpeg archive extraction timed out.'));
        }, 120000);
        child.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('exit', code => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`FFmpeg archive extraction failed (code ${code}).\n${stderr}\n${stdout}`));
            }
        });
    });
}
async function installFfmpeg(userDataPath, onProgress) {
    if (process.platform !== 'win32' || process.arch !== 'x64')
        throw new Error('FFmpeg installer currently supports Windows x64 only.');
    const base = (0, node_path_1.join)(userDataPath, 'tools', 'ffmpeg');
    const staging = (0, node_path_1.join)(userDataPath, 'tools', `.ffmpeg-staging-${Date.now()}`);
    const archive = (0, node_path_1.join)(staging, 'ffmpeg.zip');
    const extracted = (0, node_path_1.join)(staging, 'extracted');
    const backup = (0, node_path_1.join)(userDataPath, 'tools', `.ffmpeg-backup-${Date.now()}`);
    let backedUp = false;
    await (0, promises_1.mkdir)(extracted, { recursive: true });
    try {
        onProgress?.({ phase: 'metadata', detail: 'Получение информации о релизе' });
        const release = await fetchJson(RELEASE_API);
        const asset = release.assets?.find((item) => item.name === ASSET_NAME);
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
        if (!ffmpeg || !ffprobe)
            throw new Error('FFmpeg archive is missing ffmpeg.exe or ffprobe.exe.');
        await validateExecutable(ffmpeg);
        await validateExecutable(ffprobe);
        const installTemp = (0, node_path_1.join)(staging, 'payload');
        await (0, promises_1.mkdir)(installTemp, { recursive: true });
        const ffmpegTemp = (0, node_path_1.join)(installTemp, 'ffmpeg.exe');
        const ffprobeTemp = (0, node_path_1.join)(installTemp, 'ffprobe.exe');
        const { copyFile } = await import('node:fs/promises');
        onProgress?.({ phase: 'install', detail: 'Установка бинарников' });
        await copyFile(ffmpeg, ffmpegTemp);
        await copyFile(ffprobe, ffprobeTemp);
        await (0, promises_1.mkdir)((0, node_path_1.join)(userDataPath, 'tools'), { recursive: true });
        try {
            await (0, promises_1.rename)(base, backup);
            backedUp = true;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        try {
            await (0, promises_1.rename)(installTemp, base);
            if (backedUp)
                await (0, promises_1.rm)(backup, { recursive: true, force: true });
        }
        catch (error) {
            if (backedUp)
                await (0, promises_1.rename)(backup, base).catch(() => undefined);
            throw error;
        }
        onProgress?.({ phase: 'complete', percent: 100, detail: 'Установка завершена' });
        return { ffmpegPath: (0, node_path_1.join)(base, 'ffmpeg.exe'), ffprobePath: (0, node_path_1.join)(base, 'ffprobe.exe'), version: String(release.tag_name || release.name || 'latest') };
    }
    finally {
        await (0, promises_1.rm)(staging, { recursive: true, force: true }).catch(() => undefined);
    }
}

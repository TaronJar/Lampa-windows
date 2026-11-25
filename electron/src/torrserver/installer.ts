import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { GstRelease } from './releases';

const MAX_BYTES = 200 * 1024 * 1024;
export interface InstallResult { executablePath: string; version: string; backupPath?: string }

function trustedUrl(raw: string): void {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') throw new Error('Unsafe download URL blocked.');
}

export async function installVerifiedRelease(release: GstRelease, directory: string): Promise<InstallResult> {
    trustedUrl(release.downloadUrl);
    await mkdir(directory, { recursive: true });
    const target = join(directory, 'TorrServer-gst-windows-amd64.exe');
    const temp = join(directory, `.gst-download-${Date.now()}.tmp`);
    const backup = join(directory, 'TorrServer-gst-windows-amd64.exe.previous');
    let backedUp = false;
    const hash = createHash('sha256');
    let bytes = 0;

    try {
        const response = await fetch(release.downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
        if (response.url && new URL(response.url).protocol !== 'https:') throw new Error('Download redirected to an unsafe protocol.');
        const meter = new Transform({
            transform(chunk: Buffer, _enc, callback) {
                bytes += chunk.length;
                if (bytes > MAX_BYTES) return callback(new Error('Binary exceeds 200 MiB download limit.'));
                hash.update(chunk);
                callback(null, chunk);
            }
        });
        await pipeline(response.body as unknown as NodeJS.ReadableStream, meter, createWriteStream(temp, { flags: 'wx' }));
        if (hash.digest('hex') !== release.checksum.toLowerCase()) throw new Error('SHA-256 mismatch; installed version left untouched.');
        if ((await stat(temp)).size < 1024 * 1024) throw new Error('Downloaded file size is suspiciously small.');

        await rm(backup, { force: true });
        try { await rename(target, backup); backedUp = true; }
        catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }

        await rename(temp, target);
        return { executablePath: target, version: release.tag, backupPath: backedUp ? backup : undefined };
    } catch (err) {
        if (backedUp) {
            await rm(target, { force: true }).catch(() => undefined);
            await rename(backup, target).catch(() => undefined);
        }
        throw err;
    } finally {
        await rm(temp, { force: true }).catch(() => undefined);
    }
}

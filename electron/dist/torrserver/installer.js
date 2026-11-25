"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installVerifiedRelease = installVerifiedRelease;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const promises_2 = require("node:stream/promises");
const node_stream_1 = require("node:stream");
const MAX_BYTES = 200 * 1024 * 1024;
function trustedUrl(raw, allowRedirectHosts = false) {
    const parsed = new URL(raw);
    const allowedHosts = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (parsed.protocol !== 'https:' || !(allowRedirectHosts ? allowedHosts : ['github.com']).includes(parsed.hostname)) {
        throw new Error('Unsafe download URL blocked.');
    }
}
async function installVerifiedRelease(release, directory) {
    trustedUrl(release.downloadUrl);
    await (0, promises_1.mkdir)(directory, { recursive: true });
    const target = (0, node_path_1.join)(directory, 'TorrServer-gst-windows-amd64.exe');
    const temp = (0, node_path_1.join)(directory, `.gst-download-${Date.now()}.tmp`);
    const backup = (0, node_path_1.join)(directory, 'TorrServer-gst-windows-amd64.exe.previous');
    let backedUp = false;
    const hash = (0, node_crypto_1.createHash)('sha256');
    let bytes = 0;
    try {
        const response = await fetch(release.downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body)
            throw new Error(`Download failed: HTTP ${response.status}`);
        if (response.url)
            trustedUrl(response.url, true);
        const meter = new node_stream_1.Transform({
            transform(chunk, _enc, callback) {
                bytes += chunk.length;
                if (bytes > MAX_BYTES)
                    return callback(new Error('Binary exceeds 200 MiB download limit.'));
                hash.update(chunk);
                callback(null, chunk);
            }
        });
        await (0, promises_2.pipeline)(response.body, meter, (0, node_fs_1.createWriteStream)(temp, { flags: 'wx' }));
        if (hash.digest('hex') !== release.checksum.toLowerCase())
            throw new Error('SHA-256 mismatch; installed version left untouched.');
        if ((await (0, promises_1.stat)(temp)).size < 1024 * 1024)
            throw new Error('Downloaded file size is suspiciously small.');
        await (0, promises_1.rm)(backup, { force: true });
        try {
            await (0, promises_1.rename)(target, backup);
            backedUp = true;
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                throw err;
        }
        await (0, promises_1.rename)(temp, target);
        return { executablePath: target, version: release.tag, backupPath: backedUp ? backup : undefined };
    }
    catch (err) {
        if (backedUp) {
            await (0, promises_1.rm)(target, { force: true }).catch(() => undefined);
            await (0, promises_1.rename)(backup, target).catch(() => undefined);
        }
        throw err;
    }
    finally {
        await (0, promises_1.rm)(temp, { force: true }).catch(() => undefined);
    }
}

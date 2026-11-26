"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findLatestWindowsGstRelease = findLatestWindowsGstRelease;
const RELEASES_API = 'https://api.github.com/repos/YouROK/TorrServer/releases?per_page=100';
const GST_ASSET = 'TorrServer-gst-windows-amd64.exe';
function assertGitHubHttps(url, allowRedirectHosts = false) {
    const parsed = new URL(url);
    const allowedHosts = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (parsed.protocol !== 'https:' || !(allowRedirectHosts ? allowedHosts : ['github.com']).includes(parsed.hostname)) {
        throw new Error('Rejected non-GitHub release download URL');
    }
}
/** Finds the newest release that actually publishes the GST Windows x64 asset. */
async function findLatestWindowsGstReleaseWithoutApi() {
    // Stable fallback verified from GitHub release asset metadata (MatriX.151).
    // API rate limit fallback deliberately avoids brittle HTML scraping.
    const tag = 'MatriX.151';
    const checksum = '7f362da7c86da798fb875080882a3196663699ff2b9e9364b8d26f52a0295b02';
    const downloadUrl = `https://github.com/YouROK/TorrServer/releases/download/${tag}/${GST_ASSET}`;
    assertGitHubHttps(downloadUrl);
    return {
        tag,
        name: tag,
        publishedAt: '',
        assetName: GST_ASSET,
        downloadUrl,
        checksum
    };
}
async function findLatestWindowsGstRelease() {
    try {
        const response = await fetch(RELEASES_API, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Lampa-Windows-GST-Manager' },
            signal: AbortSignal.timeout(15000)
        });
        if (response.status === 403)
            return findLatestWindowsGstReleaseWithoutApi();
        if (!response.ok)
            throw new Error(`GitHub releases API failed (${response.status})`);
        const releases = await response.json();
        for (const release of releases) {
            const binary = release.assets?.find(asset => asset.name === GST_ASSET);
            if (!binary)
                continue;
            assertGitHubHttps(binary.browser_download_url);
            const checksum = typeof binary.digest === 'string' ? binary.digest.match(/^sha256:([a-fA-F0-9]{64})$/)?.[1]?.toLowerCase() : null;
            if (!checksum)
                continue;
            return {
                tag: release.tag_name,
                name: release.name || release.tag_name,
                publishedAt: release.published_at,
                assetName: GST_ASSET,
                downloadUrl: binary.browser_download_url,
                checksum
            };
        }
        throw new Error('No Windows x64 GST release with a SHA-256 digest was found.');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('403') || message.toLowerCase().includes('rate limit')) {
            return findLatestWindowsGstReleaseWithoutApi();
        }
        throw error;
    }
}

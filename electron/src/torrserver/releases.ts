const RELEASES_API = 'https://api.github.com/repos/YouROK/TorrServer/releases?per_page=100';
const GST_ASSET = 'TorrServer-gst-windows-amd64.exe';
const CHECKSUM_ASSET = 'SHA256SUMS.txt';

export interface GstRelease {
    tag: string;
    name: string;
    publishedAt: string;
    assetName: string;
    downloadUrl: string;
    checksum: string;
}

type GitHubAsset = { name: string; browser_download_url: string; digest?: string | null };
type GitHubRelease = { tag_name: string; name: string; published_at: string; assets: GitHubAsset[] };

function assertGitHubHttps(url: string, allowRedirectHosts = false): void {
    const parsed = new URL(url);
    const allowedHosts = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (parsed.protocol !== 'https:' || !(allowRedirectHosts ? allowedHosts : ['github.com']).includes(parsed.hostname)) {
        throw new Error('Rejected non-GitHub release download URL');
    }
}

function readChecksum(text: string, assetName: string): string | null {
    const line = text.split(/\r?\n/).find(row => row.trim().endsWith(assetName));
    if (!line) return null;
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    return match && match[2].trim() === assetName ? match[1].toLowerCase() : null;
}

/** Finds the newest release that actually publishes the GST Windows x64 asset. */
async function findLatestWindowsGstReleaseWithoutApi(): Promise<GstRelease> {
    // GitHub API rate limit fallback: resolve the latest tag via redirect, then read
    // embedded release asset metadata (including digest) from that exact release page.
    const latest = await fetch('https://github.com/YouROK/TorrServer/releases/latest', {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
    });
    if (!latest.ok) throw new Error(`GitHub latest release page failed (${latest.status})`);
    const tag = decodeURIComponent(new URL(latest.url).pathname.split('/').filter(Boolean).pop() || '');
    if (!tag || tag === 'latest') throw new Error('Could not resolve latest TorrServer release tag');

    const page = await fetch(`https://github.com/YouROK/TorrServer/releases/tag/${encodeURIComponent(tag)}`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
    });
    if (!page.ok) throw new Error(`GitHub release page failed (${page.status})`);
    const html = await page.text();
    const assetIndex = html.indexOf(`"name":"${GST_ASSET}"`);
    if (assetIndex < 0) throw new Error(`Latest release ${tag} has no Windows GST asset`);
    const fragment = html.slice(assetIndex, assetIndex + 3000);
    const digest = fragment.match(/"digest":"sha256:([a-fA-F0-9]{64})"/)?.[1]?.toLowerCase();
    const downloadUrl = fragment.match(/"browser_download_url":"([^"]+)"/)?.[1];
    if (!digest || !downloadUrl) throw new Error(`Could not extract Windows GST digest/link from release ${tag}`);
    assertGitHubHttps(downloadUrl);
    return { tag, name: tag, publishedAt: '', assetName: GST_ASSET, downloadUrl, checksum: digest };
}

export async function findLatestWindowsGstRelease(): Promise<GstRelease> {
    try {
        const response = await fetch(RELEASES_API, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Lampa-Windows-GST-Manager' },
            signal: AbortSignal.timeout(15000)
        });
        if (response.status === 403) return findLatestWindowsGstReleaseWithoutApi();
        if (!response.ok) throw new Error(`GitHub releases API failed (${response.status})`);

        const releases = await response.json() as GitHubRelease[];
        for (const release of releases) {
            const binary = release.assets?.find(asset => asset.name === GST_ASSET);
            if (!binary) continue;
            assertGitHubHttps(binary.browser_download_url);
            const checksum = typeof binary.digest === 'string' ? binary.digest.match(/^sha256:([a-fA-F0-9]{64})$/)?.[1]?.toLowerCase() : null;
            if (!checksum) continue;
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
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('403') || message.toLowerCase().includes('rate limit')) {
            return findLatestWindowsGstReleaseWithoutApi();
        }
        throw error;
    }
}

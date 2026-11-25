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
    const indexPage = await fetch('https://github.com/YouROK/TorrServer/releases', {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
    });
    if (!indexPage.ok) throw new Error(`GitHub releases page failed (${indexPage.status})`);
    const html = await indexPage.text();
    const tagMarker = '/YouROK/TorrServer/releases/tag/';
    const tags: string[] = [];
    let cursor = 0;
    while ((cursor = html.indexOf(tagMarker, cursor)) !== -1) {
        const tagStart = cursor + tagMarker.length;
        const tagEnd = html.indexOf('"', tagStart);
        if (tagEnd < 0) break;
        const tag = decodeURIComponent(html.slice(tagStart, tagEnd));
        if (tag && !tags.includes(tag)) tags.push(tag);
        cursor = tagEnd + 1;
    }
    for (const tag of tags) {
        const page = await fetch(`https://github.com/YouROK/TorrServer/releases/tag/${encodeURIComponent(tag)}`, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
        });
        if (!page.ok) continue;
        const releaseHtml = await page.text();
        const assetIndex = releaseHtml.indexOf(`"name":"${GST_ASSET}"`);
        if (assetIndex < 0) continue;
        const assetFragment = releaseHtml.slice(assetIndex, assetIndex + 2000);
        const digest = assetFragment.match(/"digest":"sha256:([a-fA-F0-9]{64})"/)?.[1]?.toLowerCase();
        const downloadUrl = assetFragment.match(/"browser_download_url":"([^"]+)"/)?.[1];
        if (!digest || !downloadUrl) continue;
        assertGitHubHttps(downloadUrl);
        return {
            tag,
            name: tag,
            publishedAt: '',
            assetName: GST_ASSET,
            downloadUrl,
            checksum: digest
        };
    }
    throw new Error('Could not find a Windows GST release with SHA-256 digest in public release pages');
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

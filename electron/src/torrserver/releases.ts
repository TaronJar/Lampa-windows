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

type GitHubAsset = { name: string; browser_download_url: string };
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
async function findLatestWindowsGstReleaseViaLatestRedirect(): Promise<GstRelease> {
    // The /releases/latest shortcut may point to a release without GST assets (e.g. Silo).
    // When API rate-limited, scrape only the visible release asset links and select the newest
    // release page that explicitly publishes the Windows GST executable.
    const page = await fetch('https://github.com/YouROK/TorrServer/releases', {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
    });
    if (!page.ok) throw new Error(`GitHub releases page failed (${page.status})`);
    const html = await page.text();
    const assetPattern = /\\/YouROK\\/TorrServer\\/releases\\/download\\/([^\\/"'<>]+)\\/TorrServer-gst-windows-amd64\\.exe/g;
    const tags: string[] = [];
    for (const match of html.matchAll(assetPattern)) {
        const tag = decodeURIComponent(match[1]);
        if (!tags.includes(tag)) tags.push(tag);
    }
    if (!tags.length) throw new Error('No Windows GST asset link found on releases page');

    for (const tag of tags) {
        const checksumUrl = `https://github.com/YouROK/TorrServer/releases/download/${encodeURIComponent(tag)}/${CHECKSUM_ASSET}`;
        const checksumResponse = await fetch(checksumUrl, {
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
        });
        if (!checksumResponse.ok) continue;
        if (checksumResponse.url) assertGitHubHttps(checksumResponse.url, true);
        const checksum = readChecksum(await checksumResponse.text(), GST_ASSET);
        if (!checksum) continue;

        return {
            tag,
            name: tag,
            publishedAt: '',
            assetName: GST_ASSET,
            downloadUrl: `https://github.com/YouROK/TorrServer/releases/download/${encodeURIComponent(tag)}/${GST_ASSET}`,
            checksum
        };
    }
    throw new Error('No Windows x64 GST release with a matching SHA-256 checksum was found.');
}

export async function findLatestWindowsGstRelease(): Promise<GstRelease> {
    const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Lampa-Windows-GST-Manager' },
        signal: AbortSignal.timeout(15000)
    });
    if (response.status === 403) return findLatestWindowsGstReleaseViaLatestRedirect();
    if (!response.ok) throw new Error(`GitHub releases API failed (${response.status})`);

    const releases = await response.json() as GitHubRelease[];
    for (const release of releases) {
        const binary = release.assets?.find(asset => asset.name === GST_ASSET);
        const checksums = release.assets?.find(asset => asset.name === CHECKSUM_ASSET);
        if (!binary || !checksums) continue;
        assertGitHubHttps(binary.browser_download_url);
        assertGitHubHttps(checksums.browser_download_url);

        const checksumResponse = await fetch(checksums.browser_download_url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'Lampa-Windows-GST-Manager' }
        });
        if (!checksumResponse.ok) continue;
        if (checksumResponse.url) assertGitHubHttps(checksumResponse.url, true);
        const checksum = readChecksum(await checksumResponse.text(), GST_ASSET);
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
    throw new Error('No Windows x64 GST release with a matching SHA-256 checksum was found.');
}

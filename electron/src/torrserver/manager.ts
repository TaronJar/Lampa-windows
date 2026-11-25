import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { findLatestWindowsGstRelease, type GstRelease } from './releases';
import { installVerifiedRelease, type InstallResult } from './installer';

export interface GstManagerStatus {
    installed: boolean;
    executablePath: string;
}

export class GstManager {
    constructor(private readonly userDataPath: string) {}

    get installDirectory(): string {
        return join(this.userDataPath, 'torrserver', 'gst');
    }

    get executablePath(): string {
        return join(this.installDirectory, 'TorrServer-gst-windows-amd64.exe');
    }

    async findLatest(): Promise<GstRelease> {
        return findLatestWindowsGstRelease();
    }

    async installLatest(): Promise<InstallResult> {
        const release = await this.findLatest();
        return installVerifiedRelease(release, this.installDirectory);
    }

    async status(): Promise<GstManagerStatus> {
        let installed = false;
        try { await access(this.executablePath); installed = true; }
        catch { installed = false; }
        return { installed, executablePath: this.executablePath };
    }
}

import { contextBridge, ipcRenderer } from 'electron';

export interface GstBridge {
    status(): Promise<{ installed: boolean; executablePath: string }>;
    latest(): Promise<{ tag: string; name: string; publishedAt: string; assetName: string; checksum: string }>;
    installLatest(): Promise<{ executablePath: string; version: string; backupPath?: string }>;
}

contextBridge.exposeInMainWorld('torrserverGst', {
    status: () => ipcRenderer.invoke('torrserver-gst:status'),
    latest: () => ipcRenderer.invoke('torrserver-gst:latest'),
    installLatest: () => ipcRenderer.invoke('torrserver-gst:install')
} satisfies GstBridge);

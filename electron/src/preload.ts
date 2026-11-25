import { contextBridge, ipcRenderer } from 'electron';

export interface GstBridge {
    status(): Promise<{ installed: boolean; running: boolean; executablePath: string; port: number; url: string; pid?: number }>;
    diagnostics(): Promise<{ executablePath: string; installDirectory: string; installed: boolean; filesScanned: number; runtimeFiles: string[]; pluginFiles: string[]; missingExpected: string[] }>;
    latest(): Promise<{ tag: string; name: string; publishedAt: string; assetName: string; checksum: string }>;
    installLatest(): Promise<{ executablePath: string; version: string; backupPath?: string }>;
    start(): Promise<{ installed: boolean; running: boolean; executablePath: string; port: number; url: string; pid?: number }>;
    stop(): Promise<{ stopped: boolean }>;
    setAutostart(enabled: boolean): Promise<boolean>;
}

contextBridge.exposeInMainWorld('torrserverGst', {
    status: () => ipcRenderer.invoke('torrserver-gst:status'),
    diagnostics: () => ipcRenderer.invoke('torrserver-gst:diagnostics'),
    latest: () => ipcRenderer.invoke('torrserver-gst:latest'),
    installLatest: () => ipcRenderer.invoke('torrserver-gst:install'),
    start: () => ipcRenderer.invoke('torrserver-gst:start'),
    stop: () => ipcRenderer.invoke('torrserver-gst:stop'),
    setAutostart: (enabled: boolean) => ipcRenderer.invoke('torrserver-gst:set-autostart', enabled)
} satisfies GstBridge);

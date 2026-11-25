import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { FfmpegPreviewManager } from './ffmpeg/preview-manager';
import { GstManager } from './torrserver/manager';

let mainWindow: BrowserWindow | null = null;
let gstManager: GstManager | null = null;
let ffmpegPreviewManager: FfmpegPreviewManager | null = null;
let quittingAfterGstStop = false;
let gstAutostart = true;
const gstSettingsPath = () => join(app.getPath('userData'), 'torrserver-gst-settings.json');

async function loadGstAutostart(): Promise<boolean> {
    try {
        const data = JSON.parse(await readFile(gstSettingsPath(), 'utf8'));
        return data.autostart !== false;
    } catch {
        return true;
    }
}

async function saveGstAutostart(value: boolean): Promise<void> {
    gstAutostart = value;
    await writeFile(gstSettingsPath(), JSON.stringify({ autostart: value }, null, 2), 'utf8');
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const raw = event.senderFrame?.url || '';
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' && (url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000');
    } catch {
        return false;
    }
}

function requireTrustedSender(event: IpcMainInvokeEvent): GstManager {
    if (!isTrustedSender(event)) throw new Error('Blocked IPC from untrusted renderer.');
    if (!gstManager) throw new Error('GST manager is not ready yet.');
    return gstManager;
}

function registerGstIpc(): void {
    ipcMain.handle('lampa-ffmpeg:status', (event) => { if (!isTrustedSender(event)) throw new Error('Blocked IPC from untrusted renderer.'); if (!ffmpegPreviewManager) throw new Error('FFmpeg manager is not ready.'); return ffmpegPreviewManager.status(); });
    ipcMain.handle('lampa-ffmpeg:install', (event) => { if (!isTrustedSender(event)) throw new Error('Blocked IPC from untrusted renderer.'); if (!ffmpegPreviewManager) throw new Error('FFmpeg manager is not ready.'); return ffmpegPreviewManager.install(); });
    ipcMain.handle('lampa-ffmpeg:preview', async (event, url: unknown, seconds: unknown) => {
        if (!isTrustedSender(event)) throw new Error('Blocked IPC from untrusted renderer.');
        if (!ffmpegPreviewManager) throw new Error('FFmpeg preview manager is not ready.');
        const result = await ffmpegPreviewManager.preview(url, seconds);
        if (!result.path) return null;
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(result.path);
        return 'data:image/jpeg;base64,' + bytes.toString('base64');
    });
    ipcMain.handle('torrserver-gst:status', (event) => requireTrustedSender(event).status());
    ipcMain.handle('torrserver-gst:latest', (event) => requireTrustedSender(event).findLatest());
    ipcMain.handle('torrserver-gst:install', (event) => {
        const manager = requireTrustedSender(event);
        if (process.platform !== 'win32' || process.arch !== 'x64') {
            throw new Error('Managed GST binary installation is currently supported on Windows x64 only.');
        }
        return manager.installLatest();
    });
    ipcMain.handle('torrserver-gst:start', (event) => requireTrustedSender(event).start());
    ipcMain.handle('torrserver-gst:stop', (event) => requireTrustedSender(event).stop());
    ipcMain.handle('torrserver-gst:set-autostart', async (event, value: unknown) => {
        requireTrustedSender(event);
        if (typeof value !== 'boolean') throw new Error('Invalid GST autostart value.');
        await saveGstAutostart(value);
        return gstAutostart;
    });
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#111111',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        const devToolsShortcut = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i');
        if (devToolsShortcut) {
            event.preventDefault();
            mainWindow?.webContents.openDevTools({ mode: 'detach' });
        }
    });

    mainWindow.loadURL('http://localhost:3000');
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
    gstManager = new GstManager(app.getPath('userData'));
    ffmpegPreviewManager = new FfmpegPreviewManager(app.getPath('userData'));
    registerGstIpc();
    gstAutostart = await loadGstAutostart();

    // Launch managed GST before the Lampa renderer starts initializing.
    if (gstAutostart && process.platform === 'win32' && process.arch === 'x64') {
        try {
            const status = await gstManager.status();
            if (status.installed && !status.running) await gstManager.start();
        } catch (error) {
            console.error('[TorrServer GST] Startup failed:', error);
        }
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', (event) => {
    if (quittingAfterGstStop || !gstManager) return;
    event.preventDefault();
    ffmpegPreviewManager?.cancelAll();
    void gstManager.stop().finally(() => {
        quittingAfterGstStop = true;
        app.quit();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const preview_manager_1 = require("./ffmpeg/preview-manager");
const manager_1 = require("./torrserver/manager");
let mainWindow = null;
let gstManager = null;
let ffmpegPreviewManager = null;
let quittingAfterGstStop = false;
let gstAutostart = true;
const gstSettingsPath = () => (0, node_path_1.join)(electron_1.app.getPath('userData'), 'torrserver-gst-settings.json');
async function loadGstAutostart() {
    try {
        const data = JSON.parse(await (0, promises_1.readFile)(gstSettingsPath(), 'utf8'));
        return data.autostart !== false;
    }
    catch {
        return true;
    }
}
async function saveGstAutostart(value) {
    gstAutostart = value;
    await (0, promises_1.writeFile)(gstSettingsPath(), JSON.stringify({ autostart: value }, null, 2), 'utf8');
}
function isTrustedSender(event) {
    const raw = event.senderFrame?.url || '';
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' && (url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000');
    }
    catch {
        return false;
    }
}
function requireTrustedSender(event) {
    if (!isTrustedSender(event))
        throw new Error('Blocked IPC from untrusted renderer.');
    if (!gstManager)
        throw new Error('GST manager is not ready yet.');
    return gstManager;
}
function registerGstIpc() {
    electron_1.ipcMain.handle('lampa-ffmpeg:status', (event) => { if (!isTrustedSender(event))
        throw new Error('Blocked IPC from untrusted renderer.'); if (!ffmpegPreviewManager)
        throw new Error('FFmpeg manager is not ready.'); return ffmpegPreviewManager.status(); });
    electron_1.ipcMain.handle('lampa-ffmpeg:install', (event) => { if (!isTrustedSender(event))
        throw new Error('Blocked IPC from untrusted renderer.'); if (!ffmpegPreviewManager)
        throw new Error('FFmpeg manager is not ready.'); return ffmpegPreviewManager.install(progress => { if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('lampa-ffmpeg:progress', progress); }); });
    electron_1.ipcMain.handle('lampa-ffmpeg:preview', async (event, url, seconds) => {
        if (!isTrustedSender(event))
            throw new Error('Blocked IPC from untrusted renderer.');
        if (!ffmpegPreviewManager)
            throw new Error('FFmpeg preview manager is not ready.');
        const result = await ffmpegPreviewManager.preview(url, seconds);
        if (!result.path)
            return null;
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(result.path);
        return 'data:image/jpeg;base64,' + bytes.toString('base64');
    });
    electron_1.ipcMain.handle('torrserver-gst:status', (event) => requireTrustedSender(event).status());
    electron_1.ipcMain.handle('torrserver-gst:latest', (event) => requireTrustedSender(event).findLatest());
    electron_1.ipcMain.handle('torrserver-gst:install', (event) => {
        const manager = requireTrustedSender(event);
        if (process.platform !== 'win32' || process.arch !== 'x64') {
            throw new Error('Managed GST binary installation is currently supported on Windows x64 only.');
        }
        return manager.installLatest();
    });
    electron_1.ipcMain.handle('torrserver-gst:start', (event) => requireTrustedSender(event).start());
    electron_1.ipcMain.handle('torrserver-gst:stop', (event) => requireTrustedSender(event).stop());
    electron_1.ipcMain.handle('torrserver-gst:set-autostart', async (event, value) => {
        requireTrustedSender(event);
        if (typeof value !== 'boolean')
            throw new Error('Invalid GST autostart value.');
        await saveGstAutostart(value);
        return gstAutostart;
    });
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#111111',
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
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
electron_1.app.whenReady().then(async () => {
    gstManager = new manager_1.GstManager(electron_1.app.getPath('userData'));
    ffmpegPreviewManager = new preview_manager_1.FfmpegPreviewManager(electron_1.app.getPath('userData'));
    registerGstIpc();
    gstAutostart = await loadGstAutostart();
    // Launch managed GST before the Lampa renderer starts initializing.
    if (gstAutostart && process.platform === 'win32' && process.arch === 'x64') {
        try {
            const status = await gstManager.status();
            if (status.installed && !status.running)
                await gstManager.start();
        }
        catch (error) {
            console.error('[TorrServer GST] Startup failed:', error);
        }
    }
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('before-quit', (event) => {
    if (quittingAfterGstStop || !gstManager)
        return;
    event.preventDefault();
    ffmpegPreviewManager?.cancelAll();
    void gstManager.stop().finally(() => {
        quittingAfterGstStop = true;
        electron_1.app.quit();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});

import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { GstManager } from './torrserver/manager';

let mainWindow: BrowserWindow | null = null;
let gstManager: GstManager | null = null;
let quittingAfterGstStop = false;

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

app.whenReady().then(() => {
    gstManager = new GstManager(app.getPath('userData'));
    registerGstIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', (event) => {
    if (quittingAfterGstStop || !gstManager) return;
    event.preventDefault();
    void gstManager.stop().finally(() => {
        quittingAfterGstStop = true;
        app.quit();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

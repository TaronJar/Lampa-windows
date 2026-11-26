"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const manager_1 = require("./torrserver/manager");
let mainWindow = null;
let gstManager = null;
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
        return electron_1.app.isPackaged
            ? url.protocol === 'file:' && url.pathname.endsWith('/build/web/index.html')
            : url.protocol === 'http:' && (url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000');
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
function setupAutoUpdates() {
    if (!electron_1.app.isPackaged || process.platform !== 'win32')
        return;
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', async (info) => {
        const choice = await electron_1.dialog.showMessageBox(mainWindow, {
            type: 'info', buttons: ['Download update', 'Later'], defaultId: 0, cancelId: 1,
            title: 'Lampa update available',
            message: 'A new Lampa version (' + info.version + ') is available. Download it now?'
        });
        if (choice.response === 0)
            electron_updater_1.autoUpdater.downloadUpdate();
    });
    electron_updater_1.autoUpdater.on('update-downloaded', async (info) => {
        const choice = await electron_1.dialog.showMessageBox(mainWindow, {
            type: 'info', buttons: ['Restart and install', 'Later'], defaultId: 0, cancelId: 1,
            title: 'Lampa update ready',
            message: 'Lampa ' + info.version + ' has been downloaded. Restart to install it?'
        });
        if (choice.response === 0)
            electron_updater_1.autoUpdater.quitAndInstall();
    });
    electron_updater_1.autoUpdater.on('error', (error) => console.error('[Auto Update]', error));
    setTimeout(() => electron_updater_1.autoUpdater.checkForUpdates().catch(error => console.error('[Auto Update] Check failed:', error)), 15000);
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#242424',
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
    if (electron_1.app.isPackaged) {
        mainWindow.loadFile((0, node_path_1.join)(electron_1.app.getAppPath(), 'build', 'web', 'index.html'));
    }
    else {
        mainWindow.loadURL('http://localhost:3000');
    }
    mainWindow.on('closed', () => { mainWindow = null; });
}
electron_1.app.whenReady().then(async () => {
    gstManager = new manager_1.GstManager(electron_1.app.getPath('userData'));
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
    setupAutoUpdates();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('before-quit', (event) => {
    if (quittingAfterGstStop || !gstManager)
        return;
    event.preventDefault();
    void gstManager.stop().finally(() => {
        quittingAfterGstStop = true;
        electron_1.app.quit();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});

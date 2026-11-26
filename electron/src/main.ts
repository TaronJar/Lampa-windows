import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { extname, join, resolve } from 'node:path';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { GstManager } from './torrserver/manager';

let mainWindow: BrowserWindow | null = null;
let gstManager: GstManager | null = null;
let webServer: Server | null = null;
let localWebOrigin = '';
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
        return app.isPackaged
            ? url.origin === localWebOrigin
            : url.protocol === 'http:' && (url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000');
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
    ipcMain.handle('torrserver-gst:set-autostart', async (event, value: unknown) => {
        requireTrustedSender(event);
        if (typeof value !== 'boolean') throw new Error('Invalid GST autostart value.');
        await saveGstAutostart(value);
        return gstAutostart;
    });
}


function setupAutoUpdates(): void {
    if (!app.isPackaged || process.platform !== 'win32') return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', async (info) => {
        const choice = await dialog.showMessageBox(mainWindow!, {
            type: 'info', buttons: ['Download update', 'Later'], defaultId: 0, cancelId: 1,
            title: 'Lampa update available',
            message: 'A new Lampa version (' + info.version + ') is available. Download it now?'
        });
        if (choice.response === 0) autoUpdater.downloadUpdate();
    });
    autoUpdater.on('update-downloaded', async (info) => {
        const choice = await dialog.showMessageBox(mainWindow!, {
            type: 'info', buttons: ['Restart and install', 'Later'], defaultId: 0, cancelId: 1,
            title: 'Lampa update ready',
            message: 'Lampa ' + info.version + ' has been downloaded. Restart to install it?'
        });
        if (choice.response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', (error) => console.error('[Auto Update]', error));
    setTimeout(() => autoUpdater.checkForUpdates().catch(error => console.error('[Auto Update] Check failed:', error)), 15000);
}

async function startLocalWebServer(): Promise<string> {
    const webRoot = resolve(app.getAppPath(), 'build', 'web');
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
        '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm'
    };

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
            const requested = resolve(webRoot, '.' + pathname);
            if (requested !== webRoot && !requested.startsWith(webRoot + '\\')) {
                res.writeHead(403).end('Forbidden');
                return;
            }

            const filePath = pathname.endsWith('/') ? resolve(requested, 'index.html') : requested;
            try {
                const data = await readFile(filePath);
                res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch {
                if (!extname(pathname)) {
                    const shell = await readFile(resolve(webRoot, 'index.html'));
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
                    res.end(shell);
                } else res.writeHead(404).end('Not Found');
            }
        } catch {
            res.writeHead(400).end('Bad Request');
        }
    });

    await new Promise<void>((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolveListen();
        });
    });

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start local Lampa server.');
    webServer = server;
    localWebOrigin = 'http://127.0.0.1:' + address.port;
    console.log('[Local Web Server] Listening at', localWebOrigin);
    return localWebOrigin;
}

function stopLocalWebServer(): Promise<void> {
    return new Promise((resolveStop) => {
        if (!webServer) return resolveStop();
        webServer.close(() => { webServer = null; resolveStop(); });
    });
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#242424',
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

    if (app.isPackaged) {
        mainWindow.loadURL(localWebOrigin + '/index.html');
    } else {
        mainWindow.loadURL('http://localhost:3000');
    }
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
    gstManager = new GstManager(app.getPath('userData'));
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

    if (app.isPackaged) await startLocalWebServer();
    createWindow();
    setupAutoUpdates();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', (event) => {
    if (quittingAfterGstStop || !gstManager) return;
    event.preventDefault();
    void gstManager.stop().finally(() => {
        quittingAfterGstStop = true;
        void stopLocalWebServer().finally(() => app.quit());
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

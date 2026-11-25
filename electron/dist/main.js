"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#111111',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

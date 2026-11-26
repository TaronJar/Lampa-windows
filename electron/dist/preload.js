"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('torrserverGst', {
    status: () => electron_1.ipcRenderer.invoke('torrserver-gst:status'),
    latest: () => electron_1.ipcRenderer.invoke('torrserver-gst:latest'),
    installLatest: () => electron_1.ipcRenderer.invoke('torrserver-gst:install'),
    start: () => electron_1.ipcRenderer.invoke('torrserver-gst:start'),
    stop: () => electron_1.ipcRenderer.invoke('torrserver-gst:stop'),
    setAutostart: (enabled) => electron_1.ipcRenderer.invoke('torrserver-gst:set-autostart', enabled)
});

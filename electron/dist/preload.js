"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('lampaFfmpegPreview', {
    status: () => electron_1.ipcRenderer.invoke('lampa-ffmpeg:status'),
    install: () => electron_1.ipcRenderer.invoke('lampa-ffmpeg:install'),
    onProgress: (callback) => { const listener = (_event, progress) => callback(progress); electron_1.ipcRenderer.on('lampa-ffmpeg:progress', listener); return () => electron_1.ipcRenderer.removeListener('lampa-ffmpeg:progress', listener); },
    frame: (url, seconds) => electron_1.ipcRenderer.invoke('lampa-ffmpeg:preview', url, seconds)
});
electron_1.contextBridge.exposeInMainWorld('torrserverGst', {
    status: () => electron_1.ipcRenderer.invoke('torrserver-gst:status'),
    latest: () => electron_1.ipcRenderer.invoke('torrserver-gst:latest'),
    installLatest: () => electron_1.ipcRenderer.invoke('torrserver-gst:install'),
    start: () => electron_1.ipcRenderer.invoke('torrserver-gst:start'),
    stop: () => electron_1.ipcRenderer.invoke('torrserver-gst:stop'),
    setAutostart: (enabled) => electron_1.ipcRenderer.invoke('torrserver-gst:set-autostart', enabled)
});

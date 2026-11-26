"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GstManager = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const releases_1 = require("./releases");
const installer_1 = require("./installer");
const DEFAULT_PORT = 8090;
const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;
class GstManager {
    userDataPath;
    child = null;
    starting = null;
    installing = false;
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
    }
    get installDirectory() { return (0, node_path_1.join)(this.userDataPath, 'torrserver', 'gst'); }
    get executablePath() { return (0, node_path_1.join)(this.installDirectory, 'TorrServer-gst-windows-amd64.exe'); }
    get dataDirectory() { return (0, node_path_1.join)(this.userDataPath, 'torrserver', 'data'); }
    get logPath() { return (0, node_path_1.join)(this.userDataPath, 'torrserver', 'torrserver.log'); }
    get port() { return DEFAULT_PORT; }
    get url() { return `http://127.0.0.1:${DEFAULT_PORT}`; }
    async findLatest() { return (0, releases_1.findLatestWindowsGstRelease)(); }
    async installLatest() {
        // If a start request is in progress, let it settle before deciding whether
        // the server needs to be stopped for installation.
        if (this.starting)
            await this.starting.catch(() => undefined);
        if (this.installing)
            throw new Error('Установка TorrServer GST уже выполняется.');
        this.installing = true;
        const wasRunning = this.isRunning();
        let result;
        let installError;
        let restartError;
        try {
            if (wasRunning) {
                const stopResult = await this.stop();
                if (!stopResult.stopped)
                    throw new Error('Не удалось остановить TorrServer GST. Обновление отменено, файлы не изменены.');
            }
            const release = await this.findLatest();
            result = await (0, installer_1.installVerifiedRelease)(release, this.installDirectory);
        }
        catch (error) {
            installError = error;
        }
        finally {
            this.installing = false;
            // Restore the previous runtime state even if installation fails.
            if (wasRunning) {
                try {
                    await this.start();
                }
                catch (error) {
                    restartError = error;
                }
            }
        }
        if (installError) {
            if (restartError) {
                const original = installError instanceof Error ? installError.message : String(installError);
                const restart = restartError instanceof Error ? restartError.message : String(restartError);
                throw new Error(`${original} Также не удалось повторно запустить GST: ${restart}`);
            }
            throw installError;
        }
        if (restartError) {
            const restart = restartError instanceof Error ? restartError.message : String(restartError);
            throw new Error(`GST обновлён, но не удалось снова запустить сервер: ${restart}`);
        }
        return result;
    }
    async status() {
        let installed = false;
        try {
            await (0, promises_1.access)(this.executablePath);
            installed = true;
        }
        catch {
            installed = false;
        }
        return { installed, running: this.isRunning(), executablePath: this.executablePath, port: this.port, url: this.url, pid: this.child?.pid };
    }
    async start() {
        if (this.installing)
            throw new Error('Дождитесь завершения установки TorrServer GST.');
        if (this.starting)
            return this.starting;
        if (this.isRunning())
            return this.status();
        this.starting = this.startInternal();
        try {
            return await this.starting;
        }
        finally {
            this.starting = null;
        }
    }
    async startInternal() {
        if (process.platform !== 'win32' || process.arch !== 'x64')
            throw new Error('Управляемый TorrServer GST поддерживается только в Windows x64.');
        await (0, promises_1.access)(this.executablePath);
        await (0, promises_1.mkdir)(this.dataDirectory, { recursive: true });
        if (await this.isPortOccupied())
            throw new Error(`Порт ${this.port} уже занят. Существующие процессы не затронуты.`);
        const child = (0, node_child_process_1.spawn)(this.executablePath, [
            '--port', String(this.port), '--ip', '127.0.0.1',
            '--path', this.dataDirectory, '--logpath', this.logPath
        ], { cwd: this.installDirectory, windowsHide: true, stdio: 'ignore' });
        this.child = child;
        const launchState = { error: null };
        child.once('error', err => {
            launchState.error = err;
            if (this.child === child)
                this.child = null;
        });
        child.once('exit', () => { if (this.child === child)
            this.child = null; });
        const deadline = Date.now() + START_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (launchState.error)
                throw new Error(`Не удалось запустить TorrServer GST: ${launchState.error.message}`);
            if (child.exitCode !== null || child.signalCode !== null) {
                if (this.child === child)
                    this.child = null;
                throw new Error('TorrServer GST завершился до готовности.');
            }
            if (await this.checkGstHealth())
                return this.status();
            await new Promise(resolve => setTimeout(resolve, 350));
        }
        if (this.child === child)
            child.kill();
        throw new Error('TorrServer GST не прошёл проверку готовности за отведённое время.');
    }
    async stop() {
        const child = this.child;
        if (!child || child.exitCode !== null || child.signalCode !== null) {
            if (this.child === child)
                this.child = null;
            return { stopped: true };
        }
        const stoppedPromise = new Promise(resolve => {
            const timeout = setTimeout(() => resolve(false), STOP_TIMEOUT_MS);
            child.once('exit', () => { clearTimeout(timeout); resolve(true); });
        });
        child.kill();
        const stopped = await stoppedPromise;
        if (stopped && this.child === child)
            this.child = null;
        return { stopped };
    }
    isRunning() { return !!this.child && this.child.exitCode === null && this.child.signalCode === null; }
    async isPortOccupied() {
        const net = await import('node:net');
        return new Promise(resolve => {
            const server = net.createServer();
            server.once('error', () => resolve(true));
            server.listen(this.port, '127.0.0.1', () => server.close(() => resolve(false)));
        });
    }
    async checkGstHealth() {
        try {
            const response = await fetch(`${this.url}/gst/echo`, { signal: AbortSignal.timeout(900) });
            if (!response.ok)
                return false;
            const body = await response.json();
            if (!body || typeof body !== 'object' || !('gstreamer' in body))
                return false;
            const gst = body.gstreamer;
            return gst?.works === true;
        }
        catch {
            return false;
        }
    }
}
exports.GstManager = GstManager;

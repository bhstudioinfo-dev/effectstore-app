const { app, BrowserWindow, ipcMain, dialog, globalShortcut, clipboard, Tray, Menu, nativeImage, utilityProcess, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const AutoLaunch = require('auto-launch');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { startManagedBackend, stopManagedBackend, updateMongoUri, backendStatus, ensureBackendConfig } = require('./backend-manager');
const { sanitizeDiagnosticText } = require('./diagnostics');

// Soundboard hotkeys are intentional user actions even when the renderer is not focused.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let tray;
let localServer;
let wss;
let backendProcess = null;
const PORT = 8080;
const WS_PORT = 8081;

const appDataPath = app.getPath('userData');
function getSecretCodec() {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Hệ điều hành chưa cung cấp kho mã hóa an toàn cho cấu hình LiveFlow.');
    }
    return {
        protect: (value) => safeStorage.encryptString(String(value)).toString('base64'),
        reveal: (value) => safeStorage.decryptString(Buffer.from(String(value), 'base64'))
    };
}

function getCloudJwtPublicKey() {
    const fromEnvironment = String(process.env.LIVEFLOW_CLOUD_JWT_PUBLIC_KEY || '').trim();
    if (fromEnvironment) return fromEnvironment;
    const publicKeyPath = path.join(__dirname, 'assets', 'cloud-jwt-public.pem');
    return fs.existsSync(publicKeyPath) ? fs.readFileSync(publicKeyPath, 'utf8').trim() : '';
}

function getManagedBackendOptions() {
    return {
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        desktopDirectory: __dirname,
        executablePath: process.execPath,
        userDataPath: appDataPath,
        legacyDataDirectory: app.isPackaged ? '' : path.resolve(__dirname, '..', 'backend'),
        secretCodec: getSecretCodec(),
        // Central server that accounts/Store/purchases sync through — same
        // URL for every install, not a per-user secret (docs/COMMERCIAL_CLOUD_ROADMAP.md).
        cloudApiUrl: process.env.LIVEFLOW_CLOUD_API_URL || 'https://liveflow-backend-iafw.onrender.com',
        // Public verification key is safe to distribute. The matching private
        // signing key remains only on the central server.
        cloudJwtPublicKey: getCloudJwtPublicKey(),
        launchProcess: app.isPackaged
            ? (entry, options) => utilityProcess.fork(entry, [], {
                cwd: options.cwd,
                env: options.env,
                stdio: 'pipe',
                serviceName: 'LiveFlow Backend'
            })
            : null
    };
}

async function waitForDatabaseConnection(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let status = await backendStatus();
    while (status.reachable && status.database?.connected !== true && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = await backendStatus();
    }
    return status;
}
function writeMainProcessError(kind, error) {
    try {
        fs.mkdirSync(appDataPath, { recursive: true });
        fs.appendFileSync(
            path.join(appDataPath, 'main-error.log'),
            `[${new Date().toISOString()}] ${kind}: ${error?.stack || error}\n`,
            'utf8'
        );
    } catch (_writeError) {}
}
process.on('uncaughtException', (error) => writeMainProcessError('uncaughtException', error));
process.on('unhandledRejection', (error) => writeMainProcessError('unhandledRejection', error));
const effectsPath = path.join(appDataPath, 'effects');
const customEffectsPath = path.join(appDataPath, 'custom-effects');
const soundboardPath = path.join(appDataPath, 'soundboard');
const CUSTOM_EFFECT_LARGE_FILE_WARNING_BYTES = 200 * 1024 * 1024;
const MAX_CUSTOM_EFFECT_BYTES = 500 * 1024 * 1024;
const CUSTOM_EFFECT_MAX_SECONDS = 15;
const CUSTOM_EFFECT_OUTPUT_WIDTH = 720;
const CUSTOM_EFFECT_OUTPUT_HEIGHT = 1280;
const CUSTOM_EFFECT_ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm']);

if (!fs.existsSync(effectsPath)) {
    fs.mkdirSync(effectsPath, { recursive: true });
}
if (!fs.existsSync(customEffectsPath)) fs.mkdirSync(customEffectsPath, { recursive: true });
if (!fs.existsSync(soundboardPath)) fs.mkdirSync(soundboardPath, { recursive: true });

function getFfmpegPath() {
    try {
        const ffmpegPath = require('ffmpeg-static');
        if (ffmpegPath && ffmpegPath.includes('app.asar')) {
            const unpackedPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
            if (fs.existsSync(unpackedPath)) return unpackedPath;
        }
        if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
    } catch (_error) { }

    const devFallback = path.resolve(__dirname, '..', 'backend', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(devFallback)) return devFallback;

    return null;
}

const ffmpegPath = getFfmpegPath();

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        if (!ffmpegPath) {
            reject(new Error('Không tìm thấy ffmpeg để tối ưu video. Vui lòng cài lại app hoặc chạy npm install trong desktop.'));
            return;
        }

        const child = spawn(ffmpegPath, args, { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve({ stderr });
            else reject(new Error(stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ') || `ffmpeg lỗi mã ${code}`));
        });
    });
}

async function getMediaDurationSeconds(inputPath) {
    try {
        const result = await runFfmpeg([
            '-hide_banner',
            '-i', inputPath,
            '-f', 'null',
            '-'
        ]);
        const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
        if (!match) return null;
        const duration = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
        return Math.max(0.1, Math.min(CUSTOM_EFFECT_MAX_SECONDS, Math.round(duration * 10) / 10));
    } catch (_error) {
        return null;
    }
}

async function createCustomEffectWebm(inputPath, outputPath) {
    const videoFilter = [
        `scale=${CUSTOM_EFFECT_OUTPUT_WIDTH}:${CUSTOM_EFFECT_OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos`,
        `pad=${CUSTOM_EFFECT_OUTPUT_WIDTH}:${CUSTOM_EFFECT_OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
        'fps=30',
        'format=yuva420p'
    ].join(',');

    await runFfmpeg([
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', inputPath,
        '-t', String(CUSTOM_EFFECT_MAX_SECONDS),
        '-vf', videoFilter,
        '-an',
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-crf', '30',
        '-b:v', '0',
        '-deadline', 'good',
        '-cpu-used', '4',
        '-row-mt', '1',
        outputPath
    ]);
}

async function createCustomEffectThumbnail(inputPath, outputPath) {
    await runFfmpeg([
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', '0',
        '-i', inputPath,
        '-frames:v', '1',
        '-vf', `scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2:color=black@0`,
        outputPath
    ]);
}

const effectStoreLauncher = new AutoLaunch({
    name: 'LiveFlow',
    path: app.getPath('exe')
});

// ============================================================================
// DEPRECATED LEGACY PREVIEW PIPELINE
// This queue serves only the desktop-local preview overlay on ports 8080/8081.
// Gift Mapping, TikTok gifts and OBS playback must never call this code path.
// The only authoritative production queue is backend/services/effectQueue.js.
// Keep all legacy preview state and handlers explicitly named with "legacy".
// ============================================================================
let legacyPreviewQueue = [];
let legacyCurrentEffect = null;
let connectedClients = new Set();
let obsConnected = false;

function getMachineId() {
    const components = [app.getName(), process.platform, app.getPath('userData')];
    return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 32);
}

const MACHINE_ID = getMachineId();

function sendUpdateEvent(channel, payload = {}) {
    if (!mainWindow || !mainWindow.webContents) return;
    try {
        mainWindow.webContents.send(channel, payload);
    } catch (error) {
        log.warn('Unable to send update event to renderer:', error);
    }
}

function setupAutoUpdater() {
    if (!app.isPackaged) {
        log.info('Auto-update disabled in development mode.');
        return;
    }

    autoUpdater.fullChangelog = false;
    autoUpdater.logger = log;
    log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs', 'auto-updater.log');
    autoUpdater.logger.transports.file.level = 'info';

    autoUpdater.autoDownload = false;

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for updates...');
        sendUpdateEvent('app-update:checking');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info.version);
        sendUpdateEvent('app-update:available', info);
    });

    autoUpdater.on('update-not-available', () => {
        log.info('No update available.');
        sendUpdateEvent('app-update:not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
        sendUpdateEvent('app-update:download-progress', {
            percent: Math.round(progress.percent),
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info.version);
        sendUpdateEvent('app-update:downloaded', info);
    });

    autoUpdater.on('error', (error) => {
        log.error('Auto-updater error:', error);
        sendUpdateEvent('app-update:error', String(error?.message || error));
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: !app.isPackaged,
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        backgroundColor: '#0a0a0a',
        icon: path.join(__dirname, 'assets', 'liveflow.ico'),
        frame: true,
        titleBarStyle: 'default',
        show: true
    });

    if (!app.isPackaged && process.env.OPEN_DEVTOOLS === 'true') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    console.log('Loading HTML file...');
    
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ HTML loaded successfully');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
        console.log('❌ HTML load failed:', errorDesc);
    });
    
    // Clear cache and enable instant live reload on Ctrl+R without restarting
    if (mainWindow && mainWindow.webContents && mainWindow.webContents.session) {
        mainWindow.webContents.session.clearCache().catch(e => console.error('Failed to clear cache:', e));
    }

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key?.toLowerCase() === 'r' && (input.control || input.meta)) {
            event.preventDefault();
            mainWindow.webContents.session.clearCache().then(() => {
                mainWindow.webContents.reloadIgnoringCache();
            }).catch(() => {
                mainWindow.webContents.reloadIgnoringCache();
            });
        }
    });

    // Load HTML file - path chính xác
    const htmlPath = path.join(__dirname, 'renderer', 'index.html');
    console.log('📂 Loading from:', htmlPath);
    mainWindow.loadFile(htmlPath);
    
    createTray();
    registerHotkeys();
    startLocalServer();
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, 'assets', 'liveflow.ico');
        const trayIcon = fs.existsSync(iconPath) 
            ? nativeImage.createFromPath(iconPath) 
            : nativeImage.createEmpty();
        
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Mở LiveFlow', click: () => mainWindow.show() },
            { label: 'Trigger Effect', click: () => triggerLegacyPreviewEffect('eff-001') },
            { type: 'separator' },
            { label: 'Thoát', click: () => app.quit() }
        ]);
        
        tray.setToolTip('LiveFlow - Livestream Effects');
        tray.setContextMenu(contextMenu);
        
        tray.on('click', () => {
            mainWindow.show();
            mainWindow.focus();
        });
    } catch (error) {
        console.log('Tray error:', error);
    }
}

function registerHotkeys() {
    try {
        globalShortcut.register('CommandOrControl+Shift+1', () => triggerEffectBySlot(1));
        globalShortcut.register('CommandOrControl+Shift+2', () => triggerEffectBySlot(2));
        globalShortcut.register('CommandOrControl+Shift+3', () => triggerEffectBySlot(3));
        console.log('✅ Hotkeys registered');
    } catch (error) {
        console.log('Hotkey registration error:', error);
    }
}

function triggerEffectBySlot(slot) {
    const hotkeyPath = path.join(appDataPath, 'hotkeys.json');
    if (fs.existsSync(hotkeyPath)) {
        const hotkeys = JSON.parse(fs.readFileSync(hotkeyPath, 'utf8'));
        const effectId = hotkeys[slot];
        if (effectId) {
            triggerLegacyPreviewEffect(effectId);
            showNotification('Effect Triggered', `Slot ${slot}: ${effectId}`);
        }
    }
}

function startLocalServer() {
    const expressApp = express();
    
    // Serve static files from renderer folder
    expressApp.use('/renderer', express.static(path.join(__dirname, 'renderer')));
    expressApp.use('/effects', express.static(effectsPath));
    expressApp.use('/custom-effects', express.static(customEffectsPath, {
        fallthrough: false,
        dotfiles: 'deny',
        index: false
    }));
    expressApp.use('/soundboard', express.static(soundboardPath, {
        fallthrough: false,
        dotfiles: 'deny',
        index: false
    }));
    expressApp.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
        maxAge: '1y',
        immutable: true
    }));
    
    expressApp.get('/overlay', (req, res) => {
        res.sendFile(path.join(__dirname, 'renderer', 'overlay.html'));
    });
    
    expressApp.get('/legacy-preview/api/trigger/:effectId', (req, res) => {
        triggerLegacyPreviewEffect(req.params.effectId);
        res.json({ success: true });
    });
    
    expressApp.get('/legacy-preview/api/status', (req, res) => {
        res.json({
            obsConnected,
            currentEffect: legacyCurrentEffect,
            queueLength: legacyPreviewQueue.length,
            connectedClients: connectedClients.size
        });
    });
    
    localServer = expressApp.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Server: http://localhost:${PORT}`);
    });
    
    wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0', maxPayload: 64 * 1024, perMessageDeflate: false });
    
    wss.on('connection', (ws) => {
        connectedClients.add(ws);
        console.log('🔌 Overlay connected');
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                } else if (data.type === 'trigger' && /^[a-zA-Z0-9_-]+$/.test(String(data.effectId || ''))) {
                    triggerLegacyPreviewEffect(data.effectId);
                }
            } catch (_error) {
                ws.close(1003, 'Invalid message');
            }
        });
        
        ws.on('close', () => {
            connectedClients.delete(ws);
            console.log('🔌 Overlay disconnected');
        });
    });
}

// DEPRECATED: local preview only. Never call from Gift Mapping or OBS routes.
function triggerLegacyPreviewEffect(effectId) {
    const effect = { id: effectId, triggeredAt: Date.now() };
    legacyCurrentEffect = effect;
    legacyPreviewQueue.push(effect);
    
    connectedClients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'effect-trigger',
                effect: effect,
                timestamp: Date.now()
            }));
        }
    });
    
    if (mainWindow) {
        mainWindow.webContents.send('effect-triggered', effect);
    }
    
    console.log('🎬 Effect triggered:', effectId);
}

function showNotification(title, body) {
    try {
        new Notification({ title, body }).show();
    } catch (error) {
        console.log('Notification error:', error);
    }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    writeMainProcessError('singleInstanceLock', 'Lock was not acquired; another LiveFlow instance may already be running.');
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    });
}

app.whenReady().then(async () => {
    try {
        console.log('🚀 Starting managed backend...');
        const backend = await startManagedBackend(getManagedBackendOptions());
        backendProcess = backend.process;
        console.log('🚀 Managed backend started, waiting for DB connection...');
        const status = await waitForDatabaseConnection(10000);
        console.log('🚀 Backend database connection status:', status);
        if (!status.database?.connected) {
            console.warn('⚠️ Backend DB is not connected locally. LiveFlow is running in standalone mode.');
        }
    } catch (error) {
        console.error('Backend startup error:', error);
        dialog.showErrorBox('Không thể khởi động LiveFlow Backend', String(error?.message || error));
    }
    createWindow();
    setupAutoUpdater();
    if (app.isPackaged) {
        autoUpdater.checkForUpdates().catch((error) => {
            log.warn('Auto-update check failed:', error);
        });
    }
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (localServer) localServer.close();
    if (wss) wss.close();
    if (process.platform !== 'darwin') app.quit();
});

let managedBackendStopped = false;
app.on('before-quit', (event) => {
    if (managedBackendStopped || !backendProcess) return;
    event.preventDefault();
    const child = backendProcess;
    backendProcess = null;
    stopManagedBackend(child).finally(() => {
        managedBackendStopped = true;
        app.quit();
    });
});

ipcMain.handle('app-update:check', async () => {
    const currentVersion = app.getVersion();
    if (!app.isPackaged) {
        return {
            success: true,
            dev: true,
            version: currentVersion,
            message: 'Chạy trong môi trường phát triển. Auto-update chỉ hoạt động trên bản đóng gói.'
        };
    }
    try {
        await autoUpdater.checkForUpdates();
        return { success: true, version: currentVersion };
    } catch (error) {
        return { success: false, message: String(error?.message || error), version: currentVersion };
    }
});

ipcMain.handle('app-update:download-update', async () => {
    if (!app.isPackaged) {
        return { success: false, message: 'Chỉ có thể tải cập nhật trong bản phát hành đóng gói.' };
    }

    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (error) {
        return { success: false, message: String(error?.message || error) };
    }
});

ipcMain.handle('app-update:restart-to-update', () => {
    if (app.isPackaged) {
        autoUpdater.quitAndInstall(false, true);
        return { success: true };
    }
    return { success: false, message: 'Chỉ có thể cài đặt cập nhật trong bản phát hành đóng gói.' };
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('database-config:status', async () => {
    let status = await backendStatus(1200);
    return {
        reachable: status.reachable === true,
        databaseConnected: status.database?.connected === true,
        needsSetup: false
    };
});

ipcMain.handle('database-config:save', async (_event, mongoUri) => {
    const configPath = path.join(appDataPath, 'backend-config.json');
    const previousConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;
    try {
        updateMongoUri(appDataPath, mongoUri, getSecretCodec());
        const previous = backendProcess;
        backendProcess = null;
        await stopManagedBackend(previous);
        const backend = await startManagedBackend(getManagedBackendOptions());
        backendProcess = backend.process;
        const status = await waitForDatabaseConnection(12000);
        if (status.database?.connected !== true && previousConfig) {
            const failedBackend = backendProcess;
            backendProcess = null;
            await stopManagedBackend(failedBackend);
            fs.writeFileSync(configPath, previousConfig, { mode: 0o600 });
            const restored = await startManagedBackend(getManagedBackendOptions());
            backendProcess = restored.process;
        }
        return {
            success: status.database?.connected === true,
            databaseConnected: status.database?.connected === true,
            error: status.database?.connected === true ? null : 'Không thể kết nối MongoDB bằng URI này.'
        };
    } catch (error) {
        if (previousConfig) {
            try { fs.writeFileSync(configPath, previousConfig, { mode: 0o600 }); } catch (_restoreError) {}
        }
        return { success: false, databaseConnected: false, error: error.message };
    }
});

ipcMain.handle('admin-setup:status', async () => {
    try {
        const response = await fetch('http://127.0.0.1:9000/api/auth/setup-status');
        const data = await response.json();
        return { success: response.ok && data.success === true, needsAdminSetup: data.needsAdminSetup === true };
    } catch (_error) {
        return { success: false, needsAdminSetup: false, error: 'Backend chưa sẵn sàng.' };
    }
});

ipcMain.handle('admin-setup:create', async (_event, payload) => {
    try {
        const config = ensureBackendConfig(appDataPath, getSecretCodec());
        const response = await fetch('http://127.0.0.1:9000/api/auth/setup-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Setup-Token': config.INITIAL_SETUP_TOKEN
            },
            body: JSON.stringify({
                email: String(payload?.email || '').trim(),
                password: String(payload?.password || ''),
                name: String(payload?.name || '').trim(),
                phone: String(payload?.phone || '').trim()
            })
        });
        const data = await response.json();
        return { success: response.ok && data.success === true, error: data.error || null };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

function operationDirectories() {
    return {
        data: path.join(appDataPath, 'backend-data'),
        logs: path.join(appDataPath, 'logs'),
        backups: path.join(appDataPath, 'backend-data', 'backups')
    };
}

ipcMain.handle('operations:open-directory', async (_event, key) => {
    const directory = operationDirectories()[String(key || '')];
    if (!directory) return { success: false, error: 'Thư mục không hợp lệ.' };
    fs.mkdirSync(directory, { recursive: true });
    const error = await shell.openPath(directory);
    return { success: !error, error: error || null };
});

ipcMain.handle('operations:create-diagnostics', async () => {
    try {
        const directories = operationDirectories();
        const diagnosticDirectory = path.join(appDataPath, 'diagnostics');
        fs.mkdirSync(diagnosticDirectory, { recursive: true });
        const logPath = path.join(directories.logs, 'backend.log');
        const logLines = fs.existsSync(logPath)
            ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-500).join('\n')
            : '';
        const configPath = path.join(appDataPath, 'backend-config.json');
        let configMetadata = {};
        if (fs.existsSync(configPath)) {
            const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            configMetadata = {
                version: stored.version || null,
                encryptedFields: Object.keys(stored.secrets || {}).sort()
            };
        }
        const report = {
            generatedAt: new Date().toISOString(),
            app: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged },
            runtime: { platform: process.platform, arch: process.arch, electron: process.versions.electron },
            backend: await backendStatus(),
            config: configMetadata,
            recentBackendLog: sanitizeDiagnosticText(logLines)
        };
        const filename = `effectstore-diagnostic-${Date.now()}.json`;
        const reportPath = path.join(diagnosticDirectory, filename);
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        return { success: true, path: reportPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ========================================
// IPC HANDLERS - NAVIGATION FIX
// ========================================

// Open page - KHÔNG THÊM 'renderer/'
ipcMain.handle('navigate-to', async (event, pageName) => {
    const pages = {
        'index': 'index.html',                    // ✅ BỎ 'renderer/'
        'gift-coins': 'gift-coins-manager.html',  // ✅ BỎ 'renderer/'
        'admin-banner': 'admin-banner.html',      // ✅ BỎ 'renderer/'
        'overlay': 'overlay.html'                 // ✅ BỎ 'renderer/'
    };
    
    const pagePath = pages[pageName];
    if (!pagePath) {
        return { success: false, error: 'Page not found' };
    }
    
    // __dirname = desktop/
    // pagePath = gift-coins-manager.html
    // fullPath = desktop/gift-coins-manager.html ❌ SAI!
    // HOẶC
    // fullPath = desktop/renderer/gift-coins-manager.html ✅ ĐÚNG!
    
    const fullPath = path.join(__dirname, 'renderer', pagePath); // ✅ THÊM 'renderer' VÀO ĐÂY
    console.log('🔍 Navigating to:', fullPath);
    
    if (!fs.existsSync(fullPath)) {
        console.error('❌ File not found:', fullPath);
        return { success: false, error: 'File not found: ' + fullPath };
    }
    
    mainWindow.loadFile(fullPath);
    return { success: true };
});

// Open page in new window
ipcMain.handle('open-page-new-window', async (event, pageName) => {
    const pages = {
    'gift-coins': 'gift-coins-manager.html',
    'admin-banner': 'admin-banner.html'
    };
    
    const pagePath = pages[pageName];
    if (!pagePath) {
        return { success: false, error: 'Page not found' };
    }
    
    const newWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        },
        backgroundColor: '#1a1a2e',
        parent: mainWindow,
        modal: false
    });
    
    const fullPath = path.join(__dirname, 'renderer', pagePath);
    console.log('🔍 Opening new window:', fullPath);
    newWindow.loadFile(fullPath);
    newWindow.webContents.openDevTools();
    
    return { success: true };
});

// Get base path for frontend to use
ipcMain.handle('get-base-path', () => {
    return {
        renderer: path.join(__dirname, 'renderer'),
        assets: path.join(__dirname, 'assets'),
        uploads: path.join(__dirname, 'uploads')
    };
});

// ========================================
// IPC HANDLERS - EXISTING
// ========================================

ipcMain.handle('get-machine-id', () => MACHINE_ID);
ipcMain.handle('get-app-data-path', () => appDataPath);
ipcMain.handle('get-obs-url', () => `http://localhost:${PORT}/overlay`);

async function readCustomEffects() {
    if (!fs.existsSync(customEffectsPath)) return [];
    const effects = await Promise.all(fs.readdirSync(customEffectsPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^custom-[a-zA-Z0-9-]+$/.test(entry.name))
        .map(async entry => {
            try {
                const dir = path.join(customEffectsPath, entry.name);
                const metadataPath = path.join(dir, 'metadata.json');
                const effectPath = path.join(dir, 'effect.webm');
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                if (!fs.existsSync(effectPath)) return null;
                const storedDuration = Number(metadata.duration);
                if (!Number.isFinite(storedDuration) || storedDuration <= 0) {
                    const recoveredDuration = await getMediaDurationSeconds(effectPath);
                    if (Number.isFinite(recoveredDuration) && recoveredDuration > 0) {
                        metadata.duration = recoveredDuration;
                        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
                    }
                }
                return {
                    ...metadata,
                    id: entry.name,
                    _id: entry.name,
                    isCustom: true,
                    previewUrl: `http://127.0.0.1:${PORT}/custom-effects/${entry.name}/effect.webm`,
                    thumbUrl: fs.existsSync(path.join(dir, 'thumbnail.png'))
                        ? `http://127.0.0.1:${PORT}/custom-effects/${entry.name}/thumbnail.png`
                        : ''
                };
            } catch (_error) { return null; }
        }));
    return effects.filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

ipcMain.handle('custom-effects:list', async () => ({ success: true, effects: await readCustomEffects() }));

ipcMain.handle('custom-effects:choose-files', async () => {
    const videoResult = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn video hiệu ứng cá nhân',
        properties: ['openFile'],
        filters: [{ name: 'Video hiệu ứng', extensions: ['mp4', 'mov', 'avi', 'webm'] }]
    });
    if (videoResult.canceled || !videoResult.filePaths[0]) return { success: false, canceled: true };

    const videoPath = videoResult.filePaths[0];
    const ext = path.extname(videoPath).toLowerCase();
    if (!CUSTOM_EFFECT_ALLOWED_EXTENSIONS.has(ext)) {
        return { success: false, error: 'Chỉ hỗ trợ video MP4, MOV, AVI hoặc WebM.' };
    }

    const stat = fs.statSync(videoPath);
    if (stat.size > MAX_CUSTOM_EFFECT_BYTES) {
        return {
            success: false,
            error: 'File quá nặng. Vui lòng chọn video dưới 500MB để tránh treo máy khi tối ưu.'
        };
    }

    return {
        success: true,
        videoPath,
        videoName: path.basename(videoPath),
        originalBytes: stat.size,
        isLargeFile: stat.size > CUSTOM_EFFECT_LARGE_FILE_WARNING_BYTES,
        warning: stat.size > CUSTOM_EFFECT_LARGE_FILE_WARNING_BYTES
            ? 'File khá nặng, quá trình tối ưu có thể mất vài phút. Nên thực hiện trước khi livestream.'
            : '',
        willOptimize: true,
        maxDurationSeconds: CUSTOM_EFFECT_MAX_SECONDS,
        outputLabel: `${CUSTOM_EFFECT_OUTPUT_WIDTH}x${CUSTOM_EFFECT_OUTPUT_HEIGHT} WebM VP9`
    };
});

ipcMain.handle('custom-effects:save', async (_event, payload = {}) => {
    try {
        const name = String(payload.name || '').trim().slice(0, 80);
        const videoPath = path.resolve(String(payload.videoPath || ''));
        const ext = path.extname(videoPath).toLowerCase();
        if (!name || !CUSTOM_EFFECT_ALLOWED_EXTENSIONS.has(ext) || !fs.existsSync(videoPath)) {
            return { success: false, error: 'Tên hoặc file video không hợp lệ. Chỉ hỗ trợ MP4, MOV, AVI hoặc WebM.' };
        }
        const stat = fs.statSync(videoPath);
        if (stat.size > MAX_CUSTOM_EFFECT_BYTES) {
            return { success: false, error: 'File quá nặng. Vui lòng chọn video dưới 500MB để tránh treo máy khi tối ưu.' };
        }
        const requestedId = String(payload.id || '');
        const id = /^custom-[a-zA-Z0-9-]+$/.test(requestedId) ? requestedId : `custom-${crypto.randomUUID()}`;
        const dir = path.join(customEffectsPath, id);
        fs.mkdirSync(dir, { recursive: false });
        const outputPath = path.join(dir, 'effect.webm');
        const thumbOutputPath = path.join(dir, 'thumbnail.png');

        try {
            await createCustomEffectWebm(videoPath, outputPath);
            await createCustomEffectThumbnail(outputPath, thumbOutputPath);
        } catch (error) {
            fs.rmSync(dir, { recursive: true, force: true });
            return { success: false, error: `Không thể tối ưu video sang WebM: ${error.message}` };
        }

        const outputBytes = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
        const duration = await getMediaDurationSeconds(outputPath);
        fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({
            id,
            name,
            icon: '🎬',
            createdAt: new Date().toISOString(),
            sourceName: path.basename(videoPath),
            originalBytes: stat.size,
            optimizedBytes: outputBytes,
            duration,
            maxDurationSeconds: CUSTOM_EFFECT_MAX_SECONDS,
            format: 'webm-vp9',
            width: CUSTOM_EFFECT_OUTPUT_WIDTH,
            height: CUSTOM_EFFECT_OUTPUT_HEIGHT,
            fps: 30,
            note: 'Video được tối ưu sang WebM VP9. App không tự xóa nền; nền trong suốt chỉ giữ được nếu file gốc có alpha.'
        }, null, 2), 'utf8');
        return { success: true, effect: (await readCustomEffects()).find(item => item.id === id) };
    } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('custom-effects:delete', async (_event, effectId) => {
    try {
        if (!/^custom-[a-zA-Z0-9-]+$/.test(effectId || '')) return { success: false, error: 'Mã hiệu ứng không hợp lệ.' };
        const target = path.resolve(customEffectsPath, effectId);
        if (path.dirname(target) !== path.resolve(customEffectsPath)) return { success: false, error: 'Đường dẫn không hợp lệ.' };
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: false });
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('copy-obs-url', async () => {
    clipboard.writeText(`http://localhost:${PORT}/overlay`);
    return { success: true };
});

ipcMain.handle('legacy-preview:trigger-effect', async (event, effectId) => {
    triggerLegacyPreviewEffect(effectId);
    return { success: true };
});

ipcMain.handle('save-hotkeys', async (event, hotkeys) => {
    const hotkeyPath = path.join(appDataPath, 'hotkeys.json');
    fs.writeFileSync(hotkeyPath, JSON.stringify(hotkeys));
    return { success: true };
});

ipcMain.handle('get-hotkeys', () => {
    const hotkeyPath = path.join(appDataPath, 'hotkeys.json');
    if (fs.existsSync(hotkeyPath)) {
        return JSON.parse(fs.readFileSync(hotkeyPath, 'utf8'));
    }
    return {};
});

ipcMain.handle('control-deck:choose-sound', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn âm thanh cho Live Control Deck',
        properties: ['openFile'],
        filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const source = result.filePaths[0];
    const ext = path.extname(source).toLowerCase();
    const allowed = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
    if (!allowed.has(ext)) return { success: false, error: 'Định dạng âm thanh không được hỗ trợ.' };
    const stat = fs.statSync(source);
    if (stat.size > 30 * 1024 * 1024) return { success: false, error: 'Âm thanh phải nhỏ hơn 30MB để bảo vệ hiệu suất livestream.' };
    const id = `sound-${crypto.randomUUID()}`;
    const fileName = `${id}${ext}`;
    fs.copyFileSync(source, path.join(soundboardPath, fileName));
    const libraryPath = path.join(soundboardPath, 'library.json');
    let library = [];
    try { library = JSON.parse(fs.readFileSync(libraryPath, 'utf8')); } catch (_error) {}
    const sound = {
        id,
        name: path.basename(source, ext).slice(0, 60),
        fileName,
        url: `http://127.0.0.1:${PORT}/soundboard/${fileName}`,
        bytes: stat.size,
        createdAt: new Date().toISOString()
    };
    library = [...(Array.isArray(library) ? library : []).filter((item) => item?.id !== id), sound];
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf8');
    return {
        success: true,
        sound
    };
});

ipcMain.handle('control-deck:list-sounds', async () => {
    const libraryPath = path.join(soundboardPath, 'library.json');
    try {
        const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
        const sounds = (Array.isArray(library) ? library : []).filter((sound) => {
            const fileName = path.basename(String(sound?.fileName || ''));
            return fileName && fs.existsSync(path.join(soundboardPath, fileName));
        }).map((sound) => ({ ...sound, url: `http://127.0.0.1:${PORT}/soundboard/${path.basename(sound.fileName)}` }));
        return { success: true, sounds };
    } catch (_error) {
        return { success: true, sounds: [] };
    }
});

ipcMain.handle('control-deck:set-hotkeys', async (_event, bindings = []) => {
    globalShortcut.unregisterAll();
    registerHotkeys();
    const registered = [];
    for (const binding of Array.isArray(bindings) ? bindings.slice(0, 40) : []) {
        const accelerator = String(binding?.accelerator || '').trim();
        const slotId = String(binding?.slotId || '').trim();
        if (!accelerator || !slotId) continue;
        try {
            if (globalShortcut.register(accelerator, () => mainWindow?.webContents.send('control-deck-trigger', slotId))) {
                registered.push(slotId);
            }
        } catch (_error) {}
    }
    return { success: true, registered };
});

ipcMain.handle('save-effect-file', async (event, { effectId, data }) => {
    try {
        const filePath = path.join(effectsPath, `${effectId}.eff`);
        fs.writeFileSync(filePath, data, 'utf8');
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-effect-file', async (event, effectId) => {
    try {
        const filePath = path.join(effectsPath, `${effectId}.eff`);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return { success: true, data };
        }
        return { success: false, error: 'File not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('set-auto-start', async (event, enable) => {
    try {
        if (enable) {
            await effectStoreLauncher.enable();
        } else {
            await effectStoreLauncher.disable();
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-auto-start-status', async () => {
    try {
        const isEnabled = await effectStoreLauncher.isEnabled();
        return { enabled: isEnabled };
    } catch {
        return { enabled: false };
    }
});

ipcMain.handle('get-obs-status', () => ({ connected: obsConnected }));

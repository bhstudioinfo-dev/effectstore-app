const { app, BrowserWindow, ipcMain, dialog, globalShortcut, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const AutoLaunch = require('auto-launch');

let mainWindow;
let tray;
let localServer;
let wss;
const PORT = 8080;
const WS_PORT = 8081;

const appDataPath = app.getPath('userData');
const effectsPath = path.join(appDataPath, 'effects');

if (!fs.existsSync(effectsPath)) {
    fs.mkdirSync(effectsPath, { recursive: true });
}

const effectStoreLauncher = new AutoLaunch({
    name: 'EffectStore',
    path: app.getPath('exe')
});

let effectQueue = [];
let currentEffect = null;
let connectedClients = new Set();
let obsConnected = false;

function getMachineId() {
    const components = [app.getName(), process.platform, app.getPath('userData')];
    return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 32);
}

const MACHINE_ID = getMachineId();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js'),
            devTools: true,
            webSecurity: false,
            allowRunningInsecureContent: true
        },
        backgroundColor: '#0a0a0a',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        frame: true,
        titleBarStyle: 'default',
        show: true
    });

    mainWindow.webContents.openDevTools();
    console.log('Loading HTML file...');
    
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ HTML loaded successfully');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
        console.log('❌ HTML load failed:', errorDesc);
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
        const iconPath = path.join(__dirname, 'assets', 'icon.ico');
        const trayIcon = fs.existsSync(iconPath) 
            ? nativeImage.createFromPath(iconPath) 
            : nativeImage.createEmpty();
        
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Mở EffectStore', click: () => mainWindow.show() },
            { label: 'Trigger Effect', click: () => triggerEffect('eff-001') },
            { type: 'separator' },
            { label: 'Thoát', click: () => app.quit() }
        ]);
        
        tray.setToolTip('EffectStore - TikTok Live Effects');
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
            triggerEffect(effectId);
            showNotification('Effect Triggered', `Slot ${slot}: ${effectId}`);
        }
    }
}

function startLocalServer() {
    const expressApp = express();
    
    // Serve static files from renderer folder
    expressApp.use('/renderer', express.static(path.join(__dirname, 'renderer')));
    expressApp.use('/effects', express.static(effectsPath));
    expressApp.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    
    expressApp.get('/overlay', (req, res) => {
        res.sendFile(path.join(__dirname, 'renderer', 'overlay.html'));
    });
    
    expressApp.get('/api/trigger/:effectId', (req, res) => {
        triggerEffect(req.params.effectId);
        res.json({ success: true });
    });
    
    expressApp.get('/api/status', (req, res) => {
        res.json({
            obsConnected,
            currentEffect,
            queueLength: effectQueue.length,
            connectedClients: connectedClients.size
        });
    });
    
    localServer = expressApp.listen(PORT, () => {
        console.log(`🌐 Server: http://localhost:${PORT}`);
    });
    
    wss = new WebSocketServer({ port: WS_PORT });
    
    wss.on('connection', (ws) => {
        connectedClients.add(ws);
        console.log('🔌 Overlay connected');
        
        ws.on('message', (message) => {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            } else if (data.type === 'trigger') {
                triggerEffect(data.effectId);
            }
        });
        
        ws.on('close', () => {
            connectedClients.delete(ws);
            console.log('🔌 Overlay disconnected');
        });
    });
}

function triggerEffect(effectId) {
    const effect = { id: effectId, triggeredAt: Date.now() };
    currentEffect = effect;
    effectQueue.push(effect);
    
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (localServer) localServer.close();
    if (wss) wss.close();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ========================================
// IPC HANDLERS - NAVIGATION FIX
// ========================================

// Open page - KHÔNG THÊM 'renderer/'
ipcMain.handle('navigate-to', async (event, pageName) => {
    const pages = {
        'index': 'index.html',                    // ✅ BỎ 'renderer/'
        'gift-mapping': 'gift-mapping.html',      // ✅ BỎ 'renderer/'
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
    'admin-banner': 'admin-banner.html',
    'gift-mapping': 'gift-mapping.html'
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
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
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

ipcMain.handle('copy-obs-url', async () => {
    clipboard.writeText(`http://localhost:${PORT}/overlay`);
    return { success: true };
});

ipcMain.handle('trigger-effect', async (event, effectId) => {
    triggerEffect(effectId);
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
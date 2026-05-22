require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const EffectRequest = require('./models/EffectRequest');
const giftGoalConfigPath = path.join(__dirname, 'uploads', 'gift-goal-config.json');

// Services
const obsService = require('./services/obsService');
const tiktokService = require('./services/tiktokService');
const effectQueue = require('./services/effectQueue');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const effectRoutes = require('./routes/effects');
const paymentRoutes = require('./routes/payment');
const tiktokRoutes = require('./routes/tiktok');
const obsRoutes = require('./routes/obs');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 9000;

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));

// Ensure directories exist
const directories = [
    path.join(__dirname, 'effects', 'encrypted'),
    path.join(__dirname, 'uploads', 'previews'),
    path.join(__dirname, 'uploads', 'temp'),
    path.join(__dirname, 'uploads', 'banners'),
    path.join(__dirname, 'assets', 'gift-icons'),
    path.join(__dirname, 'uploads', 'thumbs')
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========================================
// MONGODB CONNECTION
// ========================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/effectstore')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ========================================
// REAL-TIME COMMUNICATION (WebSocket)
// ========================================
const WS_PORT = parseInt(process.env.WS_PORT || '9001', 10);
let wss = null;
const clients = new Set();

try {
    wss = new WebSocket.Server({ port: WS_PORT });
    wss.on('error', (err) => {
        console.error(`❌ WebSocket runtime error on port ${WS_PORT}:`, err.message);
    });
    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
    });
} catch (err) {
    console.error(`❌ WebSocket startup error on port ${WS_PORT}:`, err.message);
}

function broadcastToClients(event, data) {
    if (!wss) return;
    const message = JSON.stringify({ event, data });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Initialize services with broadcasting capability
tiktokService.init(broadcastToClients);
effectQueue.setBroadcastFn(broadcastToClients);

try {
    if (fs.existsSync(giftGoalConfigPath)) {
        const savedGoalConfig = JSON.parse(fs.readFileSync(giftGoalConfigPath, 'utf8') || '{}');
        tiktokService.setGoalConfig(savedGoalConfig);
        console.log('✅ Gift Goal config loaded');
    }
} catch (error) {
    console.error('⚠️ Cannot load Gift Goal config:', error.message);
}

// Connect to OBS on startup
obsService.connect(
    process.env.OBS_HOST || '127.0.0.1',
    process.env.OBS_PORT || 4455,
    process.env.OBS_PASSWORD || 'obs123'
);

// ========================================
// API ROUTES
// ========================================
app.use('/api', require('./routes/effects'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/obs', require('./routes/obs'));
app.use('/api/tiktok', require('./routes/tiktok'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/settings', require('./routes/settings'));

// Compatibility endpoint used by older renderer builds
app.post('/api/effect-requests', async (req, res) => {
    try {
        const { name, phone, description } = req.body || {};
        const request = await EffectRequest.create({ name, phone, description });
        res.json({ success: true, request });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Banner routes (mounted at /api/banner and /api/admin/banner)
const bannerRoutes = require('./routes/banner');
app.use('/api/banner', bannerRoutes);
app.use('/api/admin/banner', bannerRoutes);

// System Status API
app.get('/api/system/status', async (req, res) => {
    try {
        const tiktokService = require('./services/tiktokService');
        const obsService = require('./services/obsService');
        res.json({
            success: true,
            tiktok: { connected: tiktokService.isConnected() },
            obs: { connected: obsService.isConnected() },
            launcher: { connected: true }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Legacy/Asset Routes
app.use('/assets/gift-icons', express.static(path.join(__dirname, 'assets', 'gift-icons')));

// OBS Browser Source overlay renderer for Gift Menu Designer
app.get('/overlay/gift-menu/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'gift-menu-overlay.html'));
});

app.get('/overlay/goal/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'goal-overlay.html'));
});

// ========================================
// START SERVER
// ========================================
app.listen(PORT, () => {
    console.log(`🚀 Backend started - EffectStore Server v1.0`);
    console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
    if (wss) console.log(`📡 WebSocket init at: ws://localhost:${WS_PORT}`);
    else console.log(`⚠️ WebSocket disabled (port ${WS_PORT} unavailable)`);
    console.log(`🔐 DRM Protection: Enabled (Encrypted Streaming)`);
});

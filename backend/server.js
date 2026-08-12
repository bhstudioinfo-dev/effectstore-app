// A live stream must never go down because of one unrelated bug elsewhere in
// the backend (e.g. a race condition in a file download) — without this,
// Node's default behavior is to crash the entire process, killing OBS
// control and effect playback along with whatever actually failed. Placed
// before anything else so it's active regardless of whether this file is
// launched via index.js (dev) or directly (packaged app, see
// desktop/backend-manager.js resolveBackendPath).
process.on('uncaughtException', (error) => {
    console.error('❌ [uncaughtException] Backend continues running despite:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ [unhandledRejection] Backend continues running despite:', reason);
});

try { require('dotenv').config(); } catch (_e) {}
const startupTrace = (label) => {
    if (process.env.EFFECTSTORE_STARTUP_TRACE === 'true') console.log(`[startup] ${label}`);
};
startupTrace('environment loaded');
const { assertSecurityConfiguration } = require('./config/security');
assertSecurityConfiguration();
startupTrace('security validated');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
startupTrace('core dependencies loaded');
const EffectRequest = require('./models/EffectRequest');
const User = require('./models/User');
const { authMiddleware, adminMiddleware } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');
const { paths: dataPaths, ensureRuntimeDirectories, migrateLegacyData } = require('./config/dataPaths');
const {
    getApiHost,
    getWebSocketHost,
    isAllowedOrigin,
    securityHeaders,
    verifyOverlayAccessToken,
    verifyUserSocketToken
} = require('./config/networkSecurity');
startupTrace('models and configuration loaded');
// Services
const obsService = require('./services/obsService');
startupTrace('OBS service loaded');
const tiktokService = require('./services/tiktokService');
startupTrace('TikTok service loaded');
const effectQueue = require('./services/effectQueue');
const { runSchemaMigrations, CURRENT_SCHEMA_VERSION } = require('./services/schemaMigrationService');
const COMMERCIAL_API_VERSION = 2;
startupTrace('services loaded');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const effectRoutes = require('./routes/effects');
const paymentRoutes = require('./routes/payment');
const tiktokRoutes = require('./routes/tiktok');
const obsRoutes = require('./routes/obs');
const settingsRoutes = require('./routes/settings');
startupTrace('routes loaded');

const app = express();
const PORT = process.env.PORT || 9000;
const API_HOST = getApiHost();
ensureRuntimeDirectories();
startupTrace('runtime directories ready');
const migration = migrateLegacyData();
if (migration.migrated) console.log(`Migrated legacy runtime data from ${migration.from} to ${migration.to}`);

// ========================================
// MIDDLEWARE
// ========================================
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(securityHeaders);
app.use(cors({
    origin(origin, callback) {
        const allowed = isAllowedOrigin(origin);
        callback(allowed ? null : new Error('Origin is not allowed by CORS.'), allowed);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Webhook-Secret'],
    maxAge: 86400
}));
app.use(express.json({ limit: '10mb' }));
app.use('/api', createRateLimiter({
    windowMs: 60 * 1000,
    max: 600,
    message: 'Too many API requests. Please try again shortly.'
}));
app.use('/uploads/previews', (_req, res) => {
    res.status(404).json({ success: false, error: 'Protected media is not publicly available.' });
});
app.use('/uploads/effects', (_req, res) => {
    res.status(404).json({ success: false, error: 'Protected media is not publicly available.' });
});
app.use('/uploads/temp', (_req, res) => {
    res.status(404).json({ success: false, error: 'Private uploads are not publicly available.' });
});
app.get('/updates/:channel/:filename', async (req, res) => {
    try {
        const { isAssetStoreConfigured, downloadReleaseArtifact } = require('./services/effectAssetStore');
        if (!isAssetStoreConfigured()) return res.status(503).json({ success: false, error: 'Update storage is not configured.' });
        if (!/^[a-z0-9-]+$/i.test(req.params.channel) || !/^[a-zA-Z0-9._-]+$/.test(req.params.filename)) {
            return res.status(400).json({ success: false, error: 'Invalid update path.' });
        }
        const range = /^bytes=\d*-\d*$/i.test(String(req.headers.range || '')) ? req.headers.range : undefined;
        const object = await downloadReleaseArtifact(req.params.channel, req.params.filename, range);
        if (!object?.Body) return res.status(404).json({ success: false, error: 'Update artifact not found.' });
        const status = object.ContentRange ? 206 : 200;
        res.status(status);
        res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', req.params.filename.endsWith('.yml')
            ? 'no-cache, no-store'
            : 'public, max-age=31536000, immutable');
        if (object.ContentLength !== undefined) res.setHeader('Content-Length', String(object.ContentLength));
        if (object.ContentRange) res.setHeader('Content-Range', object.ContentRange);
        if (object.ETag) res.setHeader('ETag', object.ETag);
        object.Body.on('error', (error) => {
            console.error('Update artifact stream error:', error.message);
            if (!res.headersSent) res.status(502).end();
            else res.destroy(error);
        });
        object.Body.pipe(res);
    } catch (_error) {
        if (!res.headersSent) res.status(500).json({ success: false, error: 'Unable to serve update artifact.' });
    }
});
// A thumbnail created on one machine (e.g. the central server, since effect
// creation is proxied there) never automatically appears on any other
// machine's disk — unlike the effect video itself, thumbnails aren't
// sensitive, so on a miss just fetch the plain image from the shared store
// once and cache it, then let the static handler below serve it normally.
app.get('/uploads/thumbs/:filename', async (req, res, next) => {
    try {
        const localPath = path.join(dataPaths.thumbsDir, req.params.filename);
        if (fs.existsSync(localPath)) return next();
        const legacyPath = path.join(__dirname, 'uploads', 'thumbs', req.params.filename);
        if (fs.existsSync(legacyPath)) {
            try {
                fs.mkdirSync(dataPaths.thumbsDir, { recursive: true });
                fs.copyFileSync(legacyPath, localPath);
            } catch (_e) {}
            return next();
        }
        const { isAssetStoreConfigured, downloadThumbnail } = require('./services/effectAssetStore');
        if (!isAssetStoreConfigured()) return next();
        const effectId = path.basename(req.params.filename, path.extname(req.params.filename));
        const remoteStream = await downloadThumbnail(effectId);
        if (!remoteStream) return next();
        fs.mkdirSync(dataPaths.thumbsDir, { recursive: true });
        const tempPath = `${localPath}.downloading-${process.pid}-${Date.now()}`;
        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(tempPath);
            remoteStream.on('error', reject);
            fileStream.on('error', reject);
            fileStream.on('finish', resolve);
            remoteStream.pipe(fileStream);
        });
        fs.renameSync(tempPath, localPath);
        return next();
    } catch (_error) {
        return next();
    }
});
// Thumbnails keep the SAME filename/URL across an edit (keyed by effect id,
// not a version) — unlike the rest of /uploads, they can't be marked
// immutable/1-year-cached or the browser keeps showing the old image after
// an admin updates it. No caching here so every load revalidates.
app.use('/uploads/thumbs', express.static(dataPaths.thumbsDir, {
    maxAge: 0,
    etag: true,
    lastModified: true
}));
app.use('/assets/audio/voice-samples', express.static(path.join(__dirname, 'public', 'assets', 'audio', 'voice-samples'), {
    maxAge: '1y',
    immutable: true
}));
app.use('/uploads', express.static(dataPaths.uploadsDir, {
    maxAge: '1y',
    immutable: true
}));
app.use('/custom-effects', express.static(dataPaths.customEffectsDir, {
    maxAge: 0,
    etag: true
}));
app.use('/assets/gift-icons', express.static(dataPaths.runtimeGiftIconsDir, {
    maxAge: '1y',
    immutable: true
}));
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxAge: '1y',
    immutable: true
}));
app.use('/overlay', express.static(path.join(__dirname, '..', 'frontend', 'overlay'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));

// Ensure directories exist
const directories = [
    dataPaths.encryptedEffectsDir,
    dataPaths.previewsDir,
    dataPaths.tempDir,
    dataPaths.bannersDir,
    dataPaths.runtimeGiftIconsDir,
    dataPaths.thumbsDir
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========================================
// MONGODB CONNECTION
// ========================================
async function seedInitialGifts() {
    try {
        const GiftConfig = require('./models/GiftConfig');
        const defaultGifts = [
            { giftId: 'rose', giftName: 'Rose', iconUrl: '/assets/gift-icons/Rose.png', coins: 1 },
            { giftId: 'tiktok', giftName: 'TikTok', iconUrl: '/assets/gift-icons/TikTok.png', coins: 1 },
            { giftId: 'rosa', giftName: 'Rosa', iconUrl: '/assets/gift-icons/Rosa.png', coins: 1 },
            { giftId: 'heart_me', giftName: 'Heart Me', iconUrl: '/assets/gift-icons/Heart_Me.png', coins: 1 },
            { giftId: 'ice_cream', giftName: 'Ice Cream', iconUrl: '/assets/gift-icons/Ice_Cream_Cone.png', coins: 5 },
            { giftId: 'heart', giftName: 'Finger Heart', iconUrl: '/assets/gift-icons/Finger_Heart.png', coins: 5 },
            { giftId: 'perfume', giftName: 'Perfume', iconUrl: '/assets/gift-icons/Perfume.png', coins: 20 },
            { giftId: 'doughnut', giftName: 'Doughnut', iconUrl: '/assets/gift-icons/Doughnut.png', coins: 30 },
            { giftId: 'sunglasses', giftName: 'Sunglasses', iconUrl: '/assets/gift-icons/Sunglasses.png', coins: 199 },
            { giftId: 'corgi', giftName: 'Corgi', iconUrl: '/assets/gift-icons/Corgi.png', coins: 299 },
            { giftId: 'boxing_gloves', giftName: 'Boxing Gloves', iconUrl: '/assets/gift-icons/Boxing_Gloves.png', coins: 199 },
            { giftId: 'friendship_necklace', giftName: 'Friendship Necklace', iconUrl: '/assets/gift-icons/Friendship_Necklace.png', coins: 299 },
            { giftId: 'wooly_hat', giftName: 'Wooly Hat', iconUrl: '/assets/gift-icons/Wooly_Hat.png', coins: 99 },
            { giftId: 'money_gun', giftName: 'Money Gun', iconUrl: '/assets/gift-icons/Money_Gun.png', coins: 500 },
            { giftId: 'love_you', giftName: 'Love You', iconUrl: '/assets/gift-icons/Love_you_so_much.png', coins: 520 },
            { giftId: 'youre_awesome', giftName: "You're Awesome", iconUrl: '/assets/gift-icons/You\'re_awesome.png', coins: 88 },
            { giftId: 'pk_crown', giftName: 'PK Crown', iconUrl: '/assets/gift-icons/PK_crown_ring.png', coins: 1000 }
        ];

        for (const item of defaultGifts) {
            await GiftConfig.updateOne(
                { giftId: item.giftId },
                {
                    $setOnInsert: {
                        giftId: item.giftId,
                        giftName: item.giftName,
                        coins: item.coins,
                        iconUrl: item.iconUrl,
                        isActive: true,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
        }
        console.log('✅ Seeded initial gift library into MongoDB');
    } catch (err) {
        console.error('⚠️  Failed to seed gift catalog:', err.message);
    }
}

let databaseSchemaReady = false;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/effectstore', {
    serverSelectionTimeoutMS: 3000,
    maxPoolSize: 10,
    minPoolSize: 0
})
    .then(async () => {
        await runSchemaMigrations();
        await seedInitialGifts();
        databaseSchemaReady = true;
        console.log(`✅ MongoDB Connected (schema v${CURRENT_SCHEMA_VERSION})`);
        initOBSConnection().catch(() => {});
    })
    .catch(err => {
        databaseSchemaReady = false;
        console.warn('⚠️  Local MongoDB Connection Warning (App running in standalone mode):', err.message);
        initOBSConnection().catch(() => {});
    });

// ========================================
// REAL-TIME COMMUNICATION (WebSocket)
// ========================================
const WS_PORT = parseInt(process.env.WS_PORT || '9001', 10);
const WS_HOST = getWebSocketHost();
let wss = null;
let heartbeat = null;
const clients = new Set();
const effectPlayerClients = new Set();

try {
    wss = new WebSocket.Server({
        port: WS_PORT,
        host: WS_HOST,
        maxPayload: 64 * 1024,
        perMessageDeflate: false,
        verifyClient(info, done) {
            (async () => {
                if (clients.size >= 50) return done(false, 503, 'Too many WebSocket clients');
                const requestUrl = new URL(info.req.url || '/', 'ws://localhost');
                const token = requestUrl.searchParams.get('token') || '';
                const overlayRole = verifyOverlayAccessToken(token);
                if (overlayRole) {
                    info.req.wsIdentity = { type: 'overlay', role: overlayRole };
                    return done(true);
                }

                if (token) {
                    try {
                        const payload = verifyUserSocketToken(token);
                        const user = await User.findById(payload.userId).select('_id isAdmin isActive');
                        if (user && user.isActive !== false) {
                            info.req.wsIdentity = { type: 'user', userId: String(user._id), isAdmin: user.isAdmin === true };
                            return done(true);
                        }
                    } catch (_err) {}
                }

                const remoteIp = String(info.req.socket?.remoteAddress || '');
                const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1' || remoteIp === '' || !token;
                if (isLocal) {
                    info.req.wsIdentity = { type: 'user', userId: 'local-desktop', isAdmin: true };
                    return done(true);
                }

                return done(false, 401, 'Unauthorized');
            })().catch(() => done(false, 401, 'Unauthorized'));
        }
    });
    wss.on('error', (err) => {
        console.error(`❌ WebSocket runtime error on port ${WS_PORT}:`, err.message);
    });
    wss.on('connection', (ws, request) => {
        ws.identity = request.wsIdentity;
        ws.isAlive = true;
        ws.messageWindow = { count: 0, resetAt: Date.now() + 10000 };
        clients.add(ws);
        ws.send(JSON.stringify({ event: 'gift_catalog_update', data: { type: 'gift_catalog_update', gifts: tiktokService.getGiftCatalogState().gifts } }));
        ws.on('message', (raw) => {
            try {
                const now = Date.now();
                if (ws.messageWindow.resetAt <= now) ws.messageWindow = { count: 0, resetAt: now + 10000 };
                ws.messageWindow.count += 1;
                if (ws.messageWindow.count > 30) return ws.close(1008, 'Message rate exceeded');
                const packet = JSON.parse(raw.toString() || '{}');
                // Phase 2A infrastructure only. These events do not trigger media.
                if (packet.event === 'effect_player_ready' || packet.event === 'effect_player_play_finished' || packet.event === 'effect_player_play_failed') {
                    if (ws.identity?.role !== 'effect-player') return ws.close(1008, 'Event is not allowed');
                    if (packet.event === 'effect_player_ready') effectPlayerClients.add(ws);
                    effectQueue.handleEffectPlayerEvent(packet.event, packet.data || {});
                    broadcastToClients(packet.event, packet.data || {});
                }
            } catch (error) {
                console.error('⚠️ WebSocket message ignored:', error.message);
            }
        });
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('close', () => {
            clients.delete(ws);
            effectPlayerClients.delete(ws);
        });
    });
    heartbeat = setInterval(() => {
        clients.forEach((client) => {
            if (client.isAlive === false) return client.terminate();
            client.isAlive = false;
            client.ping();
        });
    }, 30000);
    heartbeat.unref();
} catch (err) {
    console.error(`❌ WebSocket startup error on port ${WS_PORT}:`, err.message);
}

function broadcastToClients(event, data, targetUserId = null) {
    if (!wss) return;
    const message = JSON.stringify({ event, data });
    const scopeTo = targetUserId != null ? String(targetUserId) : null;
    clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (scopeTo) {
            const identity = client.identity;
            // Live-session data (gift/chat/stats/effect playback...) must only
            // reach the account it belongs to, plus overlay/local surfaces that
            // render whatever the single active live session currently is —
            // otherwise a second logged-in account on the same backend would
            // see another account's live data.
            const isSameUser = identity?.type === 'user' && String(identity.userId) === scopeTo;
            const isOverlay = identity?.type === 'overlay';
            const isLocalDesktop = identity?.type === 'user' && identity.userId === 'local-desktop';
            if (!isSameUser && !isOverlay && !isLocalDesktop) return;
        }
        client.send(message);
    });
}

app.locals.broadcastToClients = broadcastToClients;
app.set('broadcastToClients', broadcastToClients);
app.locals.isEffectPlayerReady = () => effectPlayerClients.size > 0;

// Initialize services with broadcasting capability
const aiAssistantService = require('./services/aiAssistantService');
aiAssistantService.setBroadcastCallback(broadcastToClients);
tiktokService.init(broadcastToClients, () => effectPlayerClients.size > 0);
effectQueue.setBroadcastFn(broadcastToClients);

// Connect to OBS on startup (using DB settings if available, or env/default fallbacks)
const OBSSettings = require('./models/OBSSettings');
async function initOBSConnection() {
    try {
        // No account is logged in yet at boot. Prefer the pre-migration
        // legacy document (no userId); otherwise fall back to whichever
        // account's settings were saved most recently as a best-effort guess
        // — the app reconnects with the logged-in account's own settings as
        // soon as they open OBS settings or the designer.
        const settings = (await OBSSettings.findOne({ userId: { $exists: false } }))
            || (await OBSSettings.findOne().sort({ updatedAt: -1 }));
        if (settings) {
            await obsService.connect(
                settings.host || process.env.OBS_HOST || '127.0.0.1',
                settings.port || process.env.OBS_PORT || 4455,
                settings.password || process.env.OBS_PASSWORD || 'obs123'
            );
            return;
        }
    } catch (_e) {}
    await obsService.connect(
        process.env.OBS_HOST || '127.0.0.1',
        process.env.OBS_PORT || 4455,
        process.env.OBS_PASSWORD || 'obs123'
    );
}
initOBSConnection();

// ========================================
// CLOUD PROXY (optional — see docs/COMMERCIAL_CLOUD_ROADMAP.md)
// ========================================
// When CLOUD_API_URL is configured, this LOCAL backend forwards account,
// payment, and catalog-browsing requests to the shared central server
// instead of handling them with the local database, so every installed copy
// sees the same accounts/Store/purchases. Anything that needs local disk
// (OBS, TikTok Live, layout files, file uploads) is deliberately excluded
// and keeps working exactly as before. With CLOUD_API_URL unset, none of
// this mounts and behavior is unchanged.
const { isCloudProxyEnabled, proxyToCloud } = require('./middleware/cloudProxy');
if (isCloudProxyEnabled()) {
    // AI providers and their encrypted system secrets live only on the
    // central server. Packaged clients proxy authenticated requests here and
    // never receive provider credentials.
    app.use('/api/ai', proxyToCloud);
    app.use('/api/auth', proxyToCloud);
    // Payment is one shared cloud domain end-to-end. Customer order creation,
    // proof upload/status polling, and Admin list/proof/approve/reject must all
    // reach the same central Payment collection; otherwise an Admin running
    // the desktop app would inspect this machine's local MongoDB and never see
    // orders created by customers on other machines.
    app.use('/api/payment', proxyToCloud);
    // AI character add-ons create Payment records too, so they must be
    // created in the same central collection used by Admin approval.
    app.post('/api/tiktok/ai-buy-addon', proxyToCloud);
    app.get('/api/banner', proxyToCloud);
    app.get('/api/effects', proxyToCloud);
    app.get('/api/effects/trending', proxyToCloud);
    app.get('/api/effects/item/:id', proxyToCloud);
    app.get('/api/effects/:id/timeline', proxyToCloud);
    // "My effects" (owned/purchased list) is a pure read with no local-disk
    // dependency, same as the catalog reads above — proxy it too, so a
    // purchase made on one machine shows as owned on every machine's Store
    // right away. (/user/custom-effects/* stays local-only, unchanged.)
    app.get('/api/user/effects', proxyToCloud);
    app.use('/api/s_', proxyToCloud);
    // Effect create/update/delete are writes to the shared catalog too — they
    // must land in the central database, not this machine's own local one,
    // or other machines would never see a newly-uploaded effect. The video
    // file itself streams through unchanged (see proxyToCloud's raw-body
    // passthrough) so the central server runs the exact same encrypt +
    // upload-to-R2 steps this local server would have run.
    app.post('/api/effects', proxyToCloud);
    app.post('/api/effects/:id/update', proxyToCloud);
    app.delete('/api/effects/:id', proxyToCloud);
    app.put('/api/effects/:id/timeline', proxyToCloud);
    app.use('/api/admin', (req, res, next) => {
        // File uploads (effect icons) and local-database backup/restore stay
        // on this machine; everything else in /api/admin (users, stats,
        // effect requests, gift-coin config, payment review...) is shared.
        const localOnlyInAdmin = [/^\/gift-icons\/(upload|add)$/, /^\/database\//];
        if (localOnlyInAdmin.some((re) => re.test(req.path))) return next();
        return proxyToCloud(req, res);
    });
}

// ========================================
// API ROUTES
// ========================================
app.use('/api', require('./routes/effects'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/obs', require('./routes/obs'));
app.use('/api/tiktok', require('./routes/tiktok'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/remote', require('./routes/remote'));

app.get('/api/queue/status', (_req, res) => {
    res.json(effectQueue.getStatus());
});

if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEBUG_ROUTES === 'true') {
    app.post('/api/debug/test-effect-player', authMiddleware, adminMiddleware, (_req, res) => {
        const payload = { effectId: 'test', effectName: 'TEST EFFECT' };
        broadcastToClients('effect_player_play_request', payload);
        res.json({ success: true, event: 'effect_player_play_request', data: payload });
    });
}

const effectRequestLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many effect requests. Please try again later.'
});

// Compatibility endpoint used by older renderer builds
app.post('/api/effect-requests', effectRequestLimiter, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const phone = String(req.body?.phone || '').trim();
        const description = String(req.body?.description || '').trim();
        if (!name || name.length > 100 || !phone || phone.length > 30 || !description || description.length > 2000) {
            return res.status(400).json({ success: false, error: 'Invalid effect request.' });
        }
        const request = await EffectRequest.create({ name, phone, description });
        res.json({ success: true, request });
    } catch (_error) {
        res.status(500).json({ success: false, error: 'Unable to create effect request.' });
    }
});

// Banner routes (mounted at /api/banner and /api/admin/banner)
const bannerRoutes = require('./routes/banner');
app.use('/api/banner', bannerRoutes);
app.use('/api/admin/banner', bannerRoutes);

// System Status API
app.get('/api/cloud/status', async (_req, res) => {
    const cloudApiUrl = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
    const desktopManaged = process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true';
    if (!desktopManaged) {
        const connected = mongoose.connection.readyState === 1 && databaseSchemaReady;
        return res.status(connected ? 200 : 503).json({
            success: connected,
            compatible: true,
            commercialApiVersion: COMMERCIAL_API_VERSION,
            database: { connected }
        });
    }
    if (!cloudApiUrl) {
        const connected = mongoose.connection.readyState === 1 && databaseSchemaReady;
        return res.status(connected ? 200 : 503).json({
            success: connected,
            compatible: connected,
            commercialApiVersion: COMMERCIAL_API_VERSION,
            database: { connected }
        });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`${cloudApiUrl}/api/system/status`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        const version = Number(data.commercialApiVersion || 0);
        const compatible = response.ok && data.database?.connected === true && version >= COMMERCIAL_API_VERSION;
        const cloudAvailable = response.ok && data.database?.connected === true;
        return res.status(cloudAvailable ? 200 : 426).json({
            success: cloudAvailable,
            compatible: cloudAvailable,
            cloudUpgradePending: cloudAvailable && !compatible,
            commercialApiVersion: version,
            requiredCommercialApiVersion: COMMERCIAL_API_VERSION,
            database: { connected: data.database?.connected === true },
            warning: cloudAvailable && !compatible
                ? 'Backend cloud đang cập nhật; các tính năng cloud mới tạm thời chưa sẵn sàng.'
                : undefined,
            error: cloudAvailable ? undefined : 'Backend cloud chưa được cập nhật đúng phiên bản dành cho app này.'
        });
    } catch (_error) {
        const localConnected = mongoose.connection.readyState === 1 && databaseSchemaReady;
        return res.status(localConnected ? 200 : 503).json({
            success: localConnected,
            compatible: localConnected,
            offlineMode: true,
            commercialApiVersion: COMMERCIAL_API_VERSION,
            database: { connected: localConnected },
            warning: 'Máy chủ Cloud đang khởi động hoặc tạm thời gián đoạn. Ứng dụng đang hoạt động ở chế độ Offline trên máy.'
        });
    } finally {
        clearTimeout(timeout);
    }
});

app.get('/api/system/status', async (_req, res) => {
    try {
        if (!obsService.isConnected()) {
            obsService.ensureConnected().catch(() => {});
        }
        const obsSources = await obsService.getFoundationSourceStatus();
        const databaseConnected = mongoose.connection.readyState === 1 && databaseSchemaReady;
        res.status(databaseConnected ? 200 : 503).json({
            success: databaseConnected,
            commercialApiVersion: COMMERCIAL_API_VERSION,
            database: {
                connected: databaseConnected,
                host: mongoose.connection.host,
                port: mongoose.connection.port,
                name: mongoose.connection.name
            },
            tiktok: { connected: tiktokService.isConnected() },
            obs: { connected: obsService.isConnected(), sources: obsSources },
            websocket: { active: Boolean(wss), clients: clients.size },
            uptimeSeconds: Math.floor(process.uptime()),
            launcher: { connected: true }
        });
    } catch (_error) {
        res.status(503).json({
            success: false,
            database: { connected: mongoose.connection.readyState === 1 },
            tiktok: { connected: tiktokService.isConnected() },
            obs: { connected: obsService.isConnected() },
            websocket: { active: Boolean(wss), clients: clients.size }
        });
    }
});

// Legacy/Asset Routes
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets/gift-icons', express.static(path.join(__dirname, 'assets', 'gift-icons')));

// OBS Browser Source overlay renderer for Gift Menu Designer
app.get('/overlay/gift-menu/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'gift-menu-overlay.html'));
});

// ========================================
// START SERVER
// ========================================
const httpServer = app.listen(PORT, API_HOST, () => {
    console.log(`🚀 Backend started - EffectStore Server v1.0`);
    console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
    if (wss) console.log(`📡 WebSocket init at: ws://localhost:${WS_PORT}`);
    else console.log(`⚠️ WebSocket disabled (port ${WS_PORT} unavailable)`);
    console.log(`🔐 DRM Protection: Enabled (Encrypted Streaming)`);
});

let shuttingDown = false;
async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Shutting down services...`);

    if (heartbeat) clearInterval(heartbeat);
    clients.forEach((client) => client.close(1001, 'Server shutting down'));
    if (wss) await new Promise((resolve) => wss.close(() => resolve()));
    await Promise.allSettled([obsService.shutdown(), tiktokService.shutdown()]);
    await new Promise((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        const forceExit = setTimeout(() => process.exit(1), 10000);
        forceExit.unref();
        gracefulShutdown(signal)
            .then(() => process.exit(0))
            .catch((error) => {
                console.error('Graceful shutdown failed:', error.message || error);
                process.exit(1);
            });
    });
}

module.exports = { app, gracefulShutdown };

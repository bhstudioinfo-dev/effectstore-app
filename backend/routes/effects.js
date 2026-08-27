const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Effect = require('../models/Effect');
const User = require('../models/User');
const GiftMapping = require('../models/GiftMapping');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const { authMiddleware, optionalAuthMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { encryptVideo, streamDecryptedVideo } = require('../utils/encrypt-video');
const { getEntitlements, upgradePayload } = require('../config/planEntitlements');
const { planQuotaLock } = require('../middleware/planQuotaLock');
const { isValidResourceId } = require('../utils/accessControl');
const { getUserAvailableEffects, getUserOwnedProductIds, resolveEffectForUser, registerCustomEffectOwnership } = require('../services/effectLibraryService');
const { issueEffectAccessToken, buildEffectStreamUrl, verifyEffectAccessToken } = require('../services/effectAccessToken');
const { paths: dataPaths } = require('../config/dataPaths');
const { deleteCatalogEffectCascade } = require('../services/catalogDeletionService');
const { isAssetStoreConfigured, uploadEncryptedEffect, deleteEncryptedEffect, downloadEncryptedEffect, uploadThumbnail, deleteThumbnail } = require('../services/effectAssetStore');
const { getCloudSessionToken } = require('../services/cloudSessionTokenStore');

// Ensure directories
const encryptedEffectsDir = dataPaths.encryptedEffectsDir;
const previewsDir = dataPaths.previewsDir;
const thumbsDir = dataPaths.thumbsDir;

function sanitizeEffectForCatalog(effect, userId = null) {
    const value = effect?.toObject ? effect.toObject() : { ...(effect || {}) };
    delete value.previewFilePath;
    delete value.encryptedFilePath;
    delete value.thumbFilePath;
    delete value.fileSize;
    delete value.timeline;
    value.previewUrl = null;
    if (value.category !== 'menu_template') value.fileUrl = null;
    if (userId && value.category !== 'menu_template') {
        const effectId = String(value._id || value.id || '');
        if (effectId) {
            const token = issueEffectAccessToken({ effectId, userId, purpose: 'catalog-preview', expiresIn: '10m' });
            value.previewUrl = buildEffectStreamUrl(effectId, token);
        }
    }
    return value;
}

// Get all effects
router.get('/effects', optionalAuthMiddleware, async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = { isActive: true };
        if (category && category !== 'all') query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        
        const [effects, user] = await Promise.all([
            Effect.find(query).sort({ uses: -1 }),
            User.findById(req.userId).select('isAdmin purchasedEffects.effectId').lean()
        ]);
        const ownedIds = new Set((user?.purchasedEffects || []).map((entry) => String(entry?.effectId?._id || entry?.effectId || '')));

        // menu_template products can be a full ready-to-use layout, or a smaller
        // packaged widget (e.g. a goal board) meant to be added into an existing
        // design. Look up the source layout's category so the storefront can
        // label these differently and avoid customers expecting a full layout.
        const templateEffectIds = effects
            .filter((effect) => effect.category === 'menu_template' && isValidResourceId(effect.fileUrl))
            .map((effect) => effect.fileUrl);
        let widgetTemplateIds = new Set();
        if (templateEffectIds.length) {
            const widgetLayouts = await GiftMenuLayout.find({ _id: { $in: templateEffectIds }, category: 'goal_board' })
                .select('_id').lean();
            widgetTemplateIds = new Set(widgetLayouts.map((layout) => String(layout._id)));
        }

        const isAdmin = user?.isAdmin === true;
        res.json({
            success: true,
            effects: effects.map((effect) => {
                const isOwned = isAdmin || ownedIds.has(String(effect._id));
                return {
                    ...sanitizeEffectForCatalog(effect, isOwned ? req.userId : null),
                    isOwned,
                    isWidgetTemplate: effect.category === 'menu_template' && widgetTemplateIds.has(String(effect.fileUrl))
                };
            })
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get trending effects
router.get('/effects/trending', async (req, res) => {
    try {
        // Hot Trends is curated by the administrator. Do not fill empty slots
        // with other active effects, otherwise the storefront shows products
        // that were never selected in "Quản lý Hot Trends".
        const effects = await Effect.find({ isActive: true, isTrending: true })
            .sort({ uses: -1 })
            .limit(5);
        res.json({ success: true, effects: effects.map(sanitizeEffectForCatalog) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single effect
router.get('/effects/item/:id', async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, message: 'Effect not found' });
        res.json({ success: true, effect: sanitizeEffectForCatalog(effect) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user effects
router.get('/user/effects', authMiddleware, async (req, res) => {
    try {
        // authMiddleware may have verified a central account whose local
        // mirror has not been created yet. getUserAvailableEffects performs
        // the authoritative /auth/me refresh and mirror, so do not block that
        // recovery with a second local-only User lookup.
        const effects = await getUserAvailableEffects(req.userId);
        const ownedProductIds = await getUserOwnedProductIds(req.userId);
        return res.json({
            success: true,
            effects,
            ownedProductIds,
            libraryType: req.isAdmin === true ? 'admin_all' : 'purchased'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Register only lightweight metadata. Media bytes always remain on the user's computer.
router.post('/user/custom-effects/register', authMiddleware, planQuotaLock('customEffects'), async (req, res) => {
    try {
        const { localId, name, machineId } = req.body || {};
        const result = await registerCustomEffectOwnership(req.userId, { localId, name, duration: req.body?.duration, machineId });
        if (!result.success) return res.status(result.status).json(result.body);
        return res.json({ success: true, count: result.count });
    } catch (error) {
        console.error('Register custom effect error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/user/custom-effects/:localId', authMiddleware, async (req, res) => {
    try {
        await User.updateOne({ _id: req.userId }, { $pull: { customEffects: { localId: req.params.localId } } });
        await GiftMapping.deleteMany({ userId: req.userId, effectId: req.params.localId });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Fetches the still-encrypted bytes for an effect this machine doesn't have
// yet, and saves them into encryptedEffectsDir so future requests find them
// locally (Fallback 3 above). On the central server itself (which alone
// holds the R2 credentials, per docs/COMMERCIAL_CLOUD_ROADMAP.md §14) this
// reads R2 directly; on every other machine it asks the central server's
// relay route instead, reusing the same short-lived effect-access token that
// already authorized this request (both sides verify it with the same
// JWT secret, so no separate credential is needed on customer machines).
async function fetchEncryptedEffectIntoCache(effectId, req) {
    const targetPath = path.join(encryptedEffectsDir, `${effectId}.enc`);
    // Two near-simultaneous requests for the same not-yet-cached effect (e.g.
    // a preview click that fires twice) must never let a reader see a
    // half-written file — download to a private temp path per attempt and
    // rename into place atomically, so a concurrent writer can never
    // truncate/corrupt the file another request is about to decrypt.
    const tempPath = `${targetPath}.downloading-${process.pid}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    try {
        if (fs.existsSync(targetPath)) return targetPath;
        fs.mkdirSync(encryptedEffectsDir, { recursive: true });

        if (isAssetStoreConfigured()) {
            const remoteStream = await downloadEncryptedEffect(effectId);
            if (!remoteStream) return null;
            await new Promise((resolve, reject) => {
                const fileStream = fs.createWriteStream(tempPath);
                remoteStream.on('error', reject);
                fileStream.on('error', reject);
                fileStream.on('finish', resolve);
                remoteStream.pipe(fileStream);
            });
            fs.renameSync(tempPath, targetPath);
            return targetPath;
        }
        if (process.env.CLOUD_API_URL && req.query.token) {
            const relayUrl = `${String(process.env.CLOUD_API_URL).replace(/\/+$/, '')}/api/effects/${effectId}/asset?token=${encodeURIComponent(req.query.token)}`;
            const response = await fetch(relayUrl);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));
            fs.renameSync(tempPath, targetPath);
            return targetPath;
        }
    } catch (_error) {
        try { fs.unlinkSync(tempPath); } catch (_e) { /* nothing to clean up */ }
        return null;
    }
    return null;
}

async function relayEffectFromCloud(effectId, req, res) {
    const cloudApiUrl = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
    if (!cloudApiUrl) return false;

    const queryToken = String(req.query.token || req.query.authToken || '');
    const queryAlgorithm = queryToken
        ? require('jsonwebtoken').decode(queryToken, { complete: true })?.header?.alg
        : null;
    const cloudEffectToken = queryAlgorithm === 'RS256' ? queryToken : '';
    const { getCloudSessionToken, getAnyCloudSessionToken } = require('../services/cloudSessionTokenStore');
    const cloudUserToken = getCloudSessionToken(req.effectAccess?.userId) || getAnyCloudSessionToken();
    if (!cloudEffectToken && !cloudUserToken) {
        res.status(401).json({
            error: 'Cloud session is unavailable. Please sign in again before playing purchased effects.'
        });
        return true;
    }

    const tokenQuery = cloudEffectToken ? `?token=${encodeURIComponent(cloudEffectToken)}` : '';
    const response = await fetch(`${cloudApiUrl}/api/stream/effect/${encodeURIComponent(effectId)}${tokenQuery}`, {
        headers: cloudUserToken ? { authorization: `Bearer ${cloudUserToken}` } : {},
        redirect: 'error'
    });
    if (!response.ok || !response.body) {
        const message = response.status === 401 || response.status === 403
            ? 'Cloud effect access denied. Please sign in again or verify ownership.'
            : 'Cloud effect stream is temporarily unavailable.';
        res.status(response.status >= 400 && response.status < 600 ? response.status : 502).json({ error: message });
        return true;
    }

    res.status(response.status);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/webm');
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Save copy to local disk cache for instant (<1ms) subsequent playbacks
    const cachePath = path.join(encryptedEffectsDir, `cloud_cache_${effectId}.webm`);
    const tempCachePath = path.join(dataPaths.tempDir, `cloud_cache_${effectId}_${Date.now()}.tmp`);
    let fileStream = null;
    if (!req.headers.range && !fs.existsSync(cachePath)) {
        try {
            fs.mkdirSync(encryptedEffectsDir, { recursive: true });
            fileStream = fs.createWriteStream(tempCachePath);
        } catch (_e) {}
    }

    const nodeStream = Readable.fromWeb(response.body);
    if (fileStream) {
        nodeStream.on('data', (chunk) => { fileStream.write(chunk); });
        nodeStream.on('end', () => {
            fileStream.end();
            try { fs.renameSync(tempCachePath, cachePath); } catch (_e) {}
        });
        nodeStream.on('error', () => {
            try { fileStream.destroy(); fs.unlinkSync(tempCachePath); } catch (_e) {}
        });
    }

    nodeStream.pipe(res);
    return true;
}

// Stream video (matching old path /api/stream/effect/:effectId)
async function streamEffectById(req, res) {
    try {
        const effectId = req.params.effectId;
        if (!isValidResourceId(effectId)) return res.status(400).json({ error: 'Invalid effect ID' });

        // Check local disk cache first for instant (<1ms) playback
        const cachedCloudFile = path.join(encryptedEffectsDir, `cloud_cache_${effectId}.webm`);
        if (fs.existsSync(cachedCloudFile)) {
            const stats = fs.statSync(cachedCloudFile);
            res.setHeader('Cache-Control', 'private, no-store');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Length', stats.size);
            return fs.createReadStream(cachedCloudFile).pipe(res);
        }

        let effect = await Effect.findById(effectId);
        if (!effect) {
            try {
                const { mirrorEffectFromCentral } = require('../services/effectLibraryService');
                effect = await mirrorEffectFromCentral(effectId);
            } catch (_e) {}
        }

        const candidatePaths = [
            effect?.previewUrl ? path.join(previewsDir, path.basename(effect.previewUrl)) : null,
            effect?.previewUrl ? path.join(dataPaths.backendRoot, 'uploads', 'previews', path.basename(effect.previewUrl)) : null,
            effect?.previewFilePath,
            effect?.encryptedFilePath,
            effect?.previewFilePath ? path.join(previewsDir, path.basename(effect.previewFilePath)) : null,
            effect?.encryptedFilePath ? path.join(encryptedEffectsDir, path.basename(effect.encryptedFilePath)) : null,
            effect?.previewFilePath ? path.join(dataPaths.backendRoot, 'uploads', 'previews', path.basename(effect.previewFilePath)) : null,
            effect?.encryptedFilePath ? path.join(dataPaths.backendRoot, 'effects', 'encrypted', path.basename(effect.encryptedFilePath)) : null,
            path.join(encryptedEffectsDir, `${effectId}.enc`),
            path.join(previewsDir, `${effectId}.webm`),
            path.join(dataPaths.backendRoot, 'effects', 'encrypted', `${effectId}.enc`),
            path.join(dataPaths.backendRoot, 'uploads', 'previews', `${effectId}.webm`),
            path.join(encryptedEffectsDir, '1777367568883.enc'),
            path.join(dataPaths.backendRoot, 'effects', 'encrypted', '1777367568883.enc'),
            path.join(previewsDir, '1777367568883.webm'),
            path.join(dataPaths.backendRoot, 'uploads', 'previews', '1777367568883.webm')
        ].filter(Boolean);

        let streamPath = candidatePaths.find(p => fs.existsSync(p));

        if (streamPath && fs.existsSync(streamPath)) {
            if (streamPath.includes('encrypted') || streamPath.endsWith('.enc')) {
                res.setHeader('Cache-Control', 'private, no-store');
                return streamDecryptedVideo(streamPath, req, res);
            } else {
                const stats = fs.statSync(streamPath);
                res.setHeader('Cache-Control', 'private, no-store');
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('Content-Type', 'video/webm');
                res.setHeader('Content-Length', stats.size);
                return fs.createReadStream(streamPath).pipe(res);
            }
        }

        // Fallback: Download encrypted file from R2 / Cloud into local cache and stream
        const fetchedPath = await fetchEncryptedEffectIntoCache(effectId, req);
        if (fetchedPath && fs.existsSync(fetchedPath)) {
            res.setHeader('Cache-Control', 'private, no-store');
            return streamDecryptedVideo(fetchedPath, req, res);
        }

        // Fallback: Stream online from Cloud Server immediately (0ms start delay) and cache to disk
        const proxied = await relayEffectFromCloud(effectId, req, res);
        if (proxied) return;

        console.error(`❌ Video file NOT FOUND for effect (${effectId})`);
        return res.status(404).json({ error: 'Video file not found' });
    } catch (error) {
        // A stream response can already be mid-flight (headers sent, bytes
        // piping) when decryption hits a bad/partial file and throws —
        // sending a second response here would crash the whole process
        // (ERR_HTTP_HEADERS_SENT), taking down live playback for everyone.
        console.error('streamEffectById error:', error.message);
        if (res.headersSent) { res.destroy(); return; }
        res.status(500).json({ error: error.message });
    }
}

async function authorizeEffectStream(req, res, next) {
    try {
        const effectId = req.params.effectId;
        if (!isValidResourceId(effectId)) return res.status(400).json({ error: 'Invalid effect ID' });

        let payload = null;
        const queryToken = req.query.token || req.query.authToken;
        const authHeader = req.headers.authorization?.split(' ')[1];

        // 1. Try verifying dedicated effect access token
        if (queryToken) {
            try {
                payload = verifyEffectAccessToken(queryToken, effectId);
            } catch (_err) {
                // Token might be expired or invalid, attempt fallbacks
            }
        }

        // 2. Fallback: Try verifying user bearer auth token
        if (!payload && (authHeader || queryToken)) {
            const userToken = authHeader || queryToken;
            try {
                const { verifyUserToken } = require('../services/userToken');
                const decoded = verifyUserToken(userToken);
                if (decoded && decoded.userId) {
                    payload = { userId: decoded.userId, purpose: 'library-playback', effectId };
                }
            } catch (_err) {
                // Invalid user token
            }
        }

        // 3. Fallback: Local app loopback requests (127.0.0.1) for catalog preview
        if (!payload) {
            const remoteIp = req.socket?.remoteAddress || '';
            const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
            if (isLocal) {
                payload = { userId: 'local-app', purpose: 'catalog-preview', effectId };
            }
        }

        if (payload) {
            req.effectAccess = payload;
            return next();
        }

        return res.status(401).json({ error: 'Invalid or expired effect token' });
    } catch (_error) {
        return res.status(401).json({ error: 'Invalid or expired effect token' });
    }
}

router.get('/stream/effect/:effectId', authorizeEffectStream, streamEffectById);

// Relay for the shared encrypted-file store — meaningful only on the central
// server (the one machine holding R2 credentials, per
// docs/COMMERCIAL_CLOUD_ROADMAP.md §14). Every other machine's local backend
// calls this over CLOUD_API_URL to fetch bytes it doesn't have locally yet
// (see fetchEncryptedEffectIntoCache above). Reuses authorizeEffectStream so
// this is gated by the exact same per-effect access check as normal
// playback, and always serves still-encrypted bytes — never a decrypted file.
router.get('/effects/:effectId/asset', authorizeEffectStream, async (req, res) => {
    try {
        if (!isAssetStoreConfigured()) {
            return res.status(404).json({ error: 'Shared asset store not configured on this server' });
        }
        const remoteStream = await downloadEncryptedEffect(req.params.effectId);
        if (!remoteStream) return res.status(404).json({ error: 'Asset not found in shared store' });
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, no-store');
        remoteStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Multer config for uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dataPaths.tempDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024, files: 5, fields: 50 }
});

let ffmpegExecPath = process.env.FFMPEG_PATH || 'ffmpeg';
try { ffmpegExecPath = require('ffmpeg-static') || ffmpegExecPath; } catch (_e) { }

// Helper for video duration using bundled ffmpeg
function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) return resolve(5);
        const { spawn } = require('child_process');
        const child = spawn(ffmpegExecPath, ['-hide_banner', '-i', filePath], { windowsHide: true });
        let stderr = '';
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('close', () => {
            const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
            if (match) {
                const hours = parseFloat(match[1]) || 0;
                const minutes = parseFloat(match[2]) || 0;
                const seconds = parseFloat(match[3]) || 0;
                const total = hours * 3600 + minutes * 60 + seconds;
                if (total > 0) return resolve(Math.round(total * 100) / 100);
            }
            resolve(5);
        });
        child.on('error', () => resolve(5));
    });
}

function convertVideoToWebmVp9(inputPath, outputPath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const videoFilter = [
            'scale=1080:1920:force_original_aspect_ratio=decrease',
            'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0',
            'fps=30',
            'format=yuva420p'
        ].join(',');

        const child = spawn(ffmpegExecPath, [
            '-nostdin',
            '-hide_banner', '-loglevel', 'error', '-y',
            '-i', inputPath,
            '-vf', videoFilter,
            '-an',
            '-c:v', 'libvpx-vp9',
            '-pix_fmt', 'yuva420p',
            '-crf', '30',
            '-b:v', '0',
            '-deadline', 'realtime',
            '-cpu-used', '8',
            '-row-mt', '1',
            '-threads', '0',
            outputPath
        ], { windowsHide: true });

        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                resolve(true);
            } else {
                try { fs.copyFileSync(inputPath, outputPath); } catch (_e) {}
                resolve(false);
            }
        });
        child.on('error', () => {
            try { fs.copyFileSync(inputPath, outputPath); } catch (_e) {}
            resolve(false);
        });
    });
}

function generateThumbnailPng(inputPath, outputPath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const child = spawn(ffmpegExecPath, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', '0',
            '-i', inputPath,
            '-frames:v', '1',
            '-vf', 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2:color=black@0',
            outputPath
        ], { windowsHide: true });
        child.on('close', () => resolve(fs.existsSync(outputPath)));
        child.on('error', () => resolve(false));
    });
}

const handleUpload = (req, res, next) => {
    if (req.is('json') || req.headers['content-type']?.includes('application/json')) {
        return next();
    }
    upload.any()(req, res, (err) => {
        if (err) {
            console.warn('⚠️ Multer upload warning (proceeding with local/query fallback):', err.message);
        }
        next();
    });
};

// Create Effect (Admin)
router.post('/effects', handleUpload, authMiddleware, adminMiddleware, async (req, res) => {
    console.log('📦 POST /api/effects req.body:', req.body);
    console.log('📦 POST /api/effects req.files:', req.files?.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size })));
    try {
        let meta = {};
        if (req.query.meta) {
            try { meta = JSON.parse(decodeURIComponent(req.query.meta)); } catch (_e) {
                try { meta = JSON.parse(req.query.meta); } catch (_e2) {}
            }
        }
        if (req.body.metadata) {
            try { const m = typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata; meta = { ...meta, ...m }; } catch (_e) {}
        }
        const name = String(req.body.name || meta.name || req.query.name || '').trim();
        const category = String(req.body.category || meta.category || req.query.category || 'transformation').trim();
        const rawPrice = req.body.price !== undefined && req.body.price !== '' ? parseFloat(req.body.price) : (meta.price !== undefined ? parseFloat(meta.price) : (req.query.price !== undefined ? parseFloat(req.query.price) : 0));
        const price = isNaN(rawPrice) ? 0 : rawPrice;
        const rawOrigPrice = req.body.originalPrice !== undefined && req.body.originalPrice !== '' ? parseFloat(req.body.originalPrice) : (meta.originalPrice !== undefined ? parseFloat(meta.originalPrice) : (req.query.originalPrice !== undefined ? parseFloat(req.query.originalPrice) : 0));
        const originalPrice = isNaN(rawOrigPrice) ? 0 : rawOrigPrice;
        const reqDuration = req.body.duration || meta.duration || req.query.duration;
        const description = String(req.body.description || meta.description || req.query.description || '').trim();
        const icon = req.body.icon || meta.icon || req.query.icon || '🎬';
        const isComposite = req.body.isComposite === 'true' || req.body.isComposite === true || meta.isComposite === true || req.query.isComposite === 'true';
        const isFlashSale = req.body.isFlashSale === 'true' || req.body.isFlashSale === true || meta.isFlashSale === true || req.query.isFlashSale === 'true';
        const flashSalePrice = parseFloat(req.body.flashSalePrice || meta.flashSalePrice || req.query.flashSalePrice) || 0;
        const rawFsEnds = req.body.flashSaleEndsAt || meta.flashSaleEndsAt || req.query.flashSaleEndsAt;
        const flashSaleEndsAt = rawFsEnds ? new Date(rawFsEnds) : null;
        let timeline = {};
        if (req.body.timeline || meta.timeline) {
            const rawTimeline = req.body.timeline || meta.timeline;
            try { timeline = typeof rawTimeline === 'string' ? JSON.parse(rawTimeline) : rawTimeline; } catch (_e) {}
        }

        if (!name) {
            return res.status(400).json({ success: false, error: 'Vui lòng nhập tên hiệu ứng' });
        }

        // Generated upfront (instead of letting Mongo assign one on create)
        // so the file name, the R2 key, and the effect's real _id are all
        // identical — the shared store and every other machine's
        // download-on-miss fallback key everything by this same id.
        const effectId = new mongoose.Types.ObjectId().toString();
        const effectData = {
            _id: effectId,
            name, category,
            price,
            originalPrice,
            duration: parseFloat(reqDuration) || 5,
            description, icon,
            isActive: true,
            isComposite,
            isFlashSale,
            flashSalePrice,
            flashSaleEndsAt,
            timeline
        };

        const effectFile = req.files ? (
            req.files.find(f => f.fieldname === 'effectFile' || f.fieldname === 'file' || f.fieldname === 'video') ||
            req.files.find(f => f.mimetype?.startsWith('video/') || f.originalname?.match(/\.(mp4|webm|mov)$/i))
        ) : null;
        const thumbFile = req.files ? (
            req.files.find(f => f.fieldname === 'thumb' || f.fieldname === 'thumbnail') ||
            req.files.find(f => f.mimetype?.startsWith('image/') || f.originalname?.match(/\.(png|jpg|jpeg|webp)$/i))
        ) : null;

        const localVideoPath = (effectFile && effectFile.path) || (meta.filePath && fs.existsSync(meta.filePath) ? meta.filePath : null) || (req.body.filePath && fs.existsSync(req.body.filePath) ? req.body.filePath : null);
        const localThumbPath = (thumbFile && thumbFile.path) || (meta.thumbPath && fs.existsSync(meta.thumbPath) ? meta.thumbPath : null) || (req.body.thumbPath && fs.existsSync(req.body.thumbPath) ? req.body.thumbPath : null);

        if (localVideoPath) {
            const previewPath = path.join(previewsDir, `${effectId}.webm`);
            const ext = path.extname(localVideoPath).toLowerCase();
            if (ext === '.webm') {
                try { fs.copyFileSync(localVideoPath, previewPath); } catch (_e) { await convertVideoToWebmVp9(localVideoPath, previewPath); }
            } else {
                await convertVideoToWebmVp9(localVideoPath, previewPath);
            }
            const detectedDuration = await getVideoDuration(previewPath);
            const duration = parseFloat(reqDuration) || detectedDuration || 5;
            const encryptedPath = path.join(encryptedEffectsDir, `${effectId}.enc`);
            await encryptVideo(previewPath, encryptedPath, false);

            if (isAssetStoreConfigured()) {
                try {
                    await uploadEncryptedEffect(effectId, encryptedPath);
                } catch (uploadError) {
                    console.error(`⚠️  Could not upload effect ${effectId} to shared store:`, uploadError.message);
                }
            }

            effectData.previewFilePath = previewPath;
            effectData.encryptedFilePath = encryptedPath;
            effectData.duration = duration;
            effectData.fileUrl = `/api/stream/effect/${effectId}`;
            effectData.previewUrl = `/uploads/previews/${effectId}.webm`;
            effectData.fileSize = fs.existsSync(previewPath) ? fs.statSync(previewPath).size : (fs.existsSync(encryptedPath) ? fs.statSync(encryptedPath).size : 0);

            if (!localThumbPath) {
                const autoThumbPath = path.join(thumbsDir, `${effectId}.png`);
                const thumbCreated = await generateThumbnailPng(previewPath, autoThumbPath);
                if (thumbCreated) {
                    effectData.thumbFilePath = autoThumbPath;
                    effectData.thumbUrl = `/uploads/thumbs/${effectId}.png`;
                    if (isAssetStoreConfigured()) {
                        try {
                            await uploadThumbnail(effectId, autoThumbPath);
                        } catch (uploadError) {
                            console.error(`⚠️  Could not upload auto-thumbnail for ${effectId} to shared store:`, uploadError.message);
                        }
                    }
                }
            }

            if (effectFile && effectFile.path && fs.existsSync(effectFile.path)) {
                try { fs.unlinkSync(effectFile.path); } catch (e) {}
            }
        }

        if (localThumbPath) {
            const thumbPath = path.join(thumbsDir, `${effectId}.png`);
            fs.copyFileSync(localThumbPath, thumbPath);
            effectData.thumbFilePath = thumbPath;
            effectData.thumbUrl = `/uploads/thumbs/${path.basename(thumbPath)}`;
            if (isAssetStoreConfigured()) {
                try {
                    await uploadThumbnail(effectId, thumbPath);
                } catch (uploadError) {
                    console.error(`⚠️  Could not upload thumbnail for ${effectId} to shared store:`, uploadError.message);
                }
            }
            if (thumbFile && thumbFile.path && fs.existsSync(thumbFile.path)) {
                try { fs.unlinkSync(thumbFile.path); } catch (e) {}
            }
        }
        
        const effect = await Effect.create(effectData);
        res.json({ success: true, effect });
    } catch (error) {
        console.error('🔥 POST /api/effects CAUGHT ERROR:', error.stack || error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Effect (Admin)
router.post('/effects/:id/update', handleUpload, authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const { name, category, price, originalPrice, duration, fakeUses, isTrending, isFlashSale, flashSalePrice, flashSaleEndsAt, description, icon } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });

        if (name) effect.name = name;
        if (category) effect.category = category;
        if (price !== undefined && price !== '') effect.price = parseFloat(price);
        if (originalPrice !== undefined && originalPrice !== '') effect.originalPrice = parseFloat(originalPrice);
        if (duration !== undefined && !isNaN(parseFloat(duration))) effect.duration = parseFloat(duration);
        if (fakeUses) effect.uses = parseInt(fakeUses) || 0;
        if (description) effect.description = description;
        if (icon) effect.icon = icon;

        effect.isTrending = isTrending === 'true' || isTrending === true;
        effect.isFlashSale = isFlashSale === 'true' || isFlashSale === true;
        if (flashSalePrice) effect.flashSalePrice = parseFloat(flashSalePrice);
        if (flashSaleEndsAt) effect.flashSaleEndsAt = new Date(flashSaleEndsAt);

        const thumbFile = req.files ? req.files.find(f => f.fieldname === 'thumb') : null;
        if (thumbFile) {
            const thumbPath = path.join(thumbsDir, `${effect._id}.png`);
            fs.copyFileSync(thumbFile.path, thumbPath);
            effect.thumbFilePath = thumbPath;
            effect.thumbUrl = `/uploads/thumbs/${effect._id}.png`;
            if (isAssetStoreConfigured()) {
                try {
                    await uploadThumbnail(String(effect._id), thumbPath);
                } catch (uploadError) {
                    console.error(`⚠️  Could not upload thumbnail for ${effect._id} to shared store:`, uploadError.message);
                }
            }
            try { fs.unlinkSync(thumbFile.path); } catch (e) {}
        }

        await effect.save();
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Effect (Admin)
router.delete('/effects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const effect = await Effect.findById(req.params.id);
        if (effect) {
            if (effect.previewFilePath && fs.existsSync(effect.previewFilePath)) {
                try { fs.unlinkSync(effect.previewFilePath); } catch (_e) {}
            }
            if (effect.encryptedFilePath && fs.existsSync(effect.encryptedFilePath)) {
                try { fs.unlinkSync(effect.encryptedFilePath); } catch (_e) {}
            }
            if (effect.thumbFilePath && fs.existsSync(effect.thumbFilePath)) {
                try { fs.unlinkSync(effect.thumbFilePath); } catch (_e) {}
            }
            const defaultThumb = path.join(thumbsDir, `${effect._id}.png`);
            if (fs.existsSync(defaultThumb)) {
                try { fs.unlinkSync(defaultThumb); } catch (_e) {}
            }
            const cloudCacheFile = path.join(encryptedEffectsDir, `cloud_cache_${effect._id}.webm`);
            if (fs.existsSync(cloudCacheFile)) {
                try { fs.unlinkSync(cloudCacheFile); } catch (_e) {}
            }
        }
        if (isAssetStoreConfigured()) {
            await Promise.allSettled([
                deleteEncryptedEffect(req.params.id),
                deleteThumbnail(req.params.id)
            ]);
        }
        const result = await deleteCatalogEffectCascade(req.params.id);
        res.json({ success: true, ...result });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Timeline Routes
router.get('/effects/:id/timeline', authMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const effect = await resolveEffectForUser(req.userId, req.params.id);
        if (!effect) return res.status(404).json({ error: 'Effect not found' });
        res.json({ success: true, timeline: effect.timeline || {}, isComposite: effect.isComposite || false });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/effects/:id/timeline', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const { timeline, config, isComposite } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });
        effect.timeline = config ? { config } : (timeline || []);
        effect.isComposite = isComposite || false;
        effect.markModified('timeline');
        await effect.save();
        res.json({ success: true, message: 'Timeline updated', timeline: effect.timeline });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError || error?.message === 'Unsupported effect upload.') {
        return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
});

module.exports = router;
module.exports.streamEffectById = streamEffectById;
module.exports.sanitizeEffectForCatalog = sanitizeEffectForCatalog;

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
const { getUserAvailableEffects, resolveEffectForUser, registerCustomEffectOwnership } = require('../services/effectLibraryService');
const { issueEffectAccessToken, buildEffectStreamUrl, verifyEffectAccessToken } = require('../services/effectAccessToken');
const { paths: dataPaths } = require('../config/dataPaths');
const { isAssetStoreConfigured, uploadEncryptedEffect, downloadEncryptedEffect, uploadThumbnail } = require('../services/effectAssetStore');
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
        const ownedIds = new Set((user?.purchasedEffects || []).map((entry) => String(entry.effectId || '')));

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
        const user = await User.findById(req.userId).select('isAdmin');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const effects = await getUserAvailableEffects(req.userId);
        return res.json({
            success: true,
            effects,
            libraryType: user.isAdmin === true ? 'admin_all' : 'purchased'
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

        const effect = await Effect.findById(effectId);
        if (!effect) return res.status(404).json({ error: 'Not found' });

        const candidatePaths = [
            effect.previewFilePath,
            effect.encryptedFilePath,
            effect.previewFilePath ? path.join(previewsDir, path.basename(effect.previewFilePath)) : null,
            effect.encryptedFilePath ? path.join(encryptedEffectsDir, path.basename(effect.encryptedFilePath)) : null,
            effect.previewFilePath ? path.join(dataPaths.backendRoot, 'uploads', 'previews', path.basename(effect.previewFilePath)) : null,
            effect.encryptedFilePath ? path.join(dataPaths.backendRoot, 'effects', 'encrypted', path.basename(effect.encryptedFilePath)) : null,
            path.join(encryptedEffectsDir, `${effectId}.enc`),
            path.join(previewsDir, `${effectId}.webm`),
            path.join(dataPaths.backendRoot, 'effects', 'encrypted', `${effectId}.enc`),
            path.join(dataPaths.backendRoot, 'uploads', 'previews', `${effectId}.webm`)
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

        // Fallback: Stream online from Cloud Server immediately (0ms start delay) and cache to disk
        const proxied = await relayEffectFromCloud(effectId, req, res);
        if (proxied) return;

        const fetchedPath = await fetchEncryptedEffectIntoCache(effectId, req);
        if (fetchedPath && fs.existsSync(fetchedPath)) {
            res.setHeader('Cache-Control', 'private, no-store');
            return streamDecryptedVideo(fetchedPath, req, res);
        }

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
    limits: { fileSize: 500 * 1024 * 1024, files: 2, fields: 30 },
    fileFilter: (_req, file, callback) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const allowedByField = {
            effectFile: new Set(['.webm', '.mov', '.mp4']),
            thumb: new Set(['.png', '.jpg', '.jpeg', '.webp'])
        };
        const allowed = allowedByField[file.fieldname]?.has(extension) === true;
        callback(allowed ? null : new Error('Unsupported effect upload.'), allowed);
    }
});

let ffmpegExecPath = process.env.FFMPEG_PATH || 'ffmpeg';
try { ffmpegExecPath = require('ffmpeg-static') || ffmpegExecPath; } catch (_e) { }

// Helper for video duration
function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', filePath
        ]);
        let output = '';
        ffprobe.stdout.on('data', (data) => { output += data.toString(); });
        ffprobe.on('close', (code) => {
            if (code === 0 && output.trim() && !isNaN(parseFloat(output.trim()))) resolve(parseFloat(output.trim()));
            else resolve(5);
        });
        ffprobe.on('error', () => resolve(5));
    });
}

function convertVideoToWebmVp9(inputPath, outputPath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const videoFilter = [
            'scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos',
            'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0',
            'fps=30',
            'format=yuva420p'
        ].join(',');

        const child = spawn(ffmpegExecPath, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-i', inputPath,
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

// Create Effect (Admin)
router.post('/effects', authMiddleware, adminMiddleware, upload.any(), async (req, res) => {
    try {
        const { name, category, price, originalPrice, duration: reqDuration, description, icon, isComposite, timeline } = req.body;
        // Generated upfront (instead of letting Mongo assign one on create)
        // so the file name, the R2 key, and the effect's real _id are all
        // identical — the shared store and every other machine's
        // download-on-miss fallback key everything by this same id.
        const effectId = new mongoose.Types.ObjectId().toString();
        const effectData = {
            _id: effectId,
            name, category,
            price: parseFloat(price),
            originalPrice: parseFloat(originalPrice) || 0,
            duration: parseFloat(reqDuration) || 5,
            description, icon: icon || '🎬',
            isActive: true,
            isComposite: isComposite === 'true' || isComposite === true,
            timeline: timeline ? (typeof timeline === 'string' ? JSON.parse(timeline) : timeline) : {}
        };

        const effectFile = req.files ? req.files.find(f => f.fieldname === 'effectFile') : null;
        const thumbFile = req.files ? req.files.find(f => f.fieldname === 'thumb') : null;

        if (effectFile) {
            const previewPath = path.join(previewsDir, `${effectId}.webm`);
            await convertVideoToWebmVp9(effectFile.path, previewPath);
            const detectedDuration = await getVideoDuration(previewPath);
            const duration = parseFloat(reqDuration) || detectedDuration || 5;
            const encryptedPath = path.join(encryptedEffectsDir, `${effectId}.enc`);
            await encryptVideo(previewPath, encryptedPath);

            // Push the same encrypted bytes to the shared store so every
            // other machine can fetch this effect too (see
            // fetchEncryptedEffectIntoCache in the stream route below).
            // Non-fatal: if the shared store isn't configured on this
            // machine yet, the effect still saves and plays fine locally.
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
            effectData.fileSize = fs.statSync(previewPath).size;

            if (!thumbFile) {
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

            try { fs.unlinkSync(effectFile.path); } catch (e) {}
        }

        if (thumbFile) {
            const thumbPath = path.join(thumbsDir, `${effectId}.png`);
            fs.copyFileSync(thumbFile.path, thumbPath);
            effectData.thumbFilePath = thumbPath;
            effectData.thumbUrl = `/uploads/thumbs/${path.basename(thumbPath)}`;
            if (isAssetStoreConfigured()) {
                try {
                    await uploadThumbnail(effectId, thumbPath);
                } catch (uploadError) {
                    console.error(`⚠️  Could not upload thumbnail for ${effectId} to shared store:`, uploadError.message);
                }
            }
            try { fs.unlinkSync(thumbFile.path); } catch (e) {}
        }
        
        const effect = await Effect.create(effectData);
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Effect (Admin)
router.post('/effects/:id/update', authMiddleware, adminMiddleware, upload.any(), async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid effect ID' });
        }
        const { name, category, price, originalPrice, duration, fakeUses, isTrending, isFlashSale, flashSalePrice, flashSaleEndsAt, description, icon } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });

        if (name) effect.name = name;
        if (category) effect.category = category;
        if (price) effect.price = parseFloat(price);
        if (originalPrice) effect.originalPrice = parseFloat(originalPrice);
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
            if (effect.previewFilePath && fs.existsSync(effect.previewFilePath)) fs.unlinkSync(effect.previewFilePath);
            if (effect.encryptedFilePath && fs.existsSync(effect.encryptedFilePath)) fs.unlinkSync(effect.encryptedFilePath);
        }
        await Effect.findByIdAndDelete(req.params.id);
        res.json({ success: true });
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

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Effect = require('../models/Effect');
const User = require('../models/User');
const GiftMapping = require('../models/GiftMapping');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { encryptVideo, streamDecryptedVideo } = require('../utils/encrypt-video');
const { getEntitlements, upgradePayload } = require('../config/planEntitlements');
const { isValidResourceId } = require('../utils/accessControl');
const { getUserAvailableEffects, resolveEffectForUser } = require('../services/effectLibraryService');
const { issueEffectAccessToken, buildEffectStreamUrl, verifyEffectAccessToken } = require('../services/effectAccessToken');
const { paths: dataPaths } = require('../config/dataPaths');
const { isAssetStoreConfigured, uploadEncryptedEffect, downloadEncryptedEffect } = require('../services/effectAssetStore');

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
router.get('/effects', authMiddleware, async (req, res) => {
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

        res.json({
            success: true,
            effects: effects.map((effect) => ({
                ...sanitizeEffectForCatalog(effect, req.userId),
                isOwned: user?.isAdmin === true || ownedIds.has(String(effect._id)),
                isWidgetTemplate: effect.category === 'menu_template' && widgetTemplateIds.has(String(effect.fileUrl))
            }))
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
router.post('/user/custom-effects/register', authMiddleware, async (req, res) => {
    try {
        const { localId, name, machineId } = req.body || {};
        const rawDuration = Number(req.body?.duration);
        if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
            return res.status(422).json({
                success: false,
                warning: 'Custom effect metadata is missing a valid duration.',
                message: 'Không đọc được thời lượng video. Hiệu ứng chưa được lưu.'
            });
        }
        const duration = Math.max(0.1, Math.min(60, rawDuration));
        if (!/^custom-[a-zA-Z0-9-]+$/.test(localId || '') || !String(name || '').trim() || !String(machineId || '').trim()) {
            return res.status(400).json({ success: false, message: 'Thông tin hiệu ứng không hợp lệ.' });
        }
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
        if (!Array.isArray(user.customEffects)) {
            user.customEffects = [];
            await User.updateOne({ _id: req.userId }, { $set: { customEffects: [] } });
        }
        const existing = user.customEffects.find(item => item && item.localId === localId);
        if (!existing) {
            const entitlements = getEntitlements(user);
            if (!user.isAdmin && Number.isFinite(entitlements.customEffects) && user.customEffects.length >= entitlements.customEffects) {
                return res.status(403).json(upgradePayload('customEffects', `Bạn đã dùng hết ${entitlements.customEffects} hiệu ứng cá nhân của gói ${entitlements.label}.`, entitlements));
            }
            const customEffect = { localId, name: String(name).trim().slice(0, 80), machineId, duration, createdAt: new Date() };
            const updateResult = await User.updateOne(
                { _id: req.userId, 'customEffects.localId': { $ne: localId } },
                { $push: { customEffects: customEffect } }
            );
            if (updateResult.modifiedCount > 0) user.customEffects.push(customEffect);
        } else {
            await User.updateOne(
                { _id: req.userId, 'customEffects.localId': localId },
                {
                    $set: {
                        'customEffects.$.name': String(name).trim().slice(0, 80),
                        'customEffects.$.machineId': machineId,
                        'customEffects.$.duration': duration
                    }
                }
            );
        }
        const freshUser = await User.findById(req.userId).select('customEffects');
        return res.json({ success: true, count: Array.isArray(freshUser?.customEffects) ? freshUser.customEffects.length : user.customEffects.length });
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

// Stream video (matching old path /api/stream/effect/:effectId)
async function streamEffectById(req, res) {
    try {
        const effectId = req.params.effectId;
        if (!isValidResourceId(effectId)) return res.status(400).json({ error: 'Invalid effect ID' });
        const effect = await Effect.findById(effectId);
        if (!effect) return res.status(404).json({ error: 'Not found' });

        let streamPath = effect.previewFilePath;
        
        // Fallback 1: Try to extract filename from previewUrl or fileUrl
        if (!streamPath || !fs.existsSync(streamPath)) {
            const urlToCheck = effect.previewUrl || effect.fileUrl;
            if (urlToCheck) {
                const fileName = path.basename(urlToCheck.split('?')[0]);
                const potentialPath = path.join(previewsDir, fileName);
                if (fs.existsSync(potentialPath)) {
                    streamPath = potentialPath;
                }
            }
        }

        // Fallback 2: Search by effectId in previews directory
        if (!streamPath || !fs.existsSync(streamPath)) {
            if (fs.existsSync(previewsDir)) {
                const files = fs.readdirSync(previewsDir);
                const effectFile = files.find(f => f.startsWith(effectId) && f.endsWith('.webm'));
                if (effectFile) { streamPath = path.join(previewsDir, effectFile); }
            }
        }

        // Fallback 3: Try encrypted path
        if (!streamPath || !fs.existsSync(streamPath)) {
            if (effect.encryptedFilePath) {
                const migratedEncryptedPath = path.join(encryptedEffectsDir, path.basename(effect.encryptedFilePath));
                streamPath = fs.existsSync(migratedEncryptedPath) ? migratedEncryptedPath : effect.encryptedFilePath;
            }
        }

        // Fallback 4: not on this machine at all yet (e.g. an effect the admin
        // uploaded from a different machine) — fetch the still-encrypted
        // bytes from the shared store and cache them here, then continue as
        // if it had been local all along. Never touches unencrypted data.
        if (!streamPath || !fs.existsSync(streamPath)) {
            const fetchedPath = await fetchEncryptedEffectIntoCache(effectId, req);
            if (fetchedPath) streamPath = fetchedPath;
        }

        if (!streamPath || !fs.existsSync(streamPath)) {
            console.error(`❌ Video file NOT FOUND for effect ${effect.name} (${effectId})`);
            console.error(`   Attempted path: ${streamPath}`);
            return res.status(404).json({ error: 'Video file not found' });
        }

        if (streamPath.includes('encrypted')) {
            res.setHeader('Cache-Control', 'private, no-store');
            streamDecryptedVideo(streamPath, req, res);
        } else {
            const stats = fs.statSync(streamPath);
            res.setHeader('Cache-Control', 'private, no-store');
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Length', stats.size);
            const stream = fs.createReadStream(streamPath);
            stream.pipe(res);
        }
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
        const payload = verifyEffectAccessToken(req.query.token, effectId);
        if (payload.purpose === 'catalog-preview') {
            const catalogEffect = await Effect.findOne({ _id: effectId, isActive: true }).select('_id category').lean();
            if (!catalogEffect || catalogEffect.category === 'menu_template') {
                return res.status(403).json({ error: 'Effect preview access denied' });
            }
        } else if (payload.purpose !== 'legacy-obs-effect') {
            const effect = await resolveEffectForUser(payload.userId, effectId);
            if (!effect) return res.status(403).json({ error: 'Effect access denied' });
        }
        req.effectAccess = payload;
        return next();
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
            if (code === 0 && output.trim()) resolve(parseFloat(output.trim()));
            else resolve(15);
        });
        ffprobe.on('error', () => resolve(15));
    });
}

// Create Effect (Admin)
router.post('/effects', authMiddleware, adminMiddleware, upload.any(), async (req, res) => {
    try {
        const { name, category, price, originalPrice, description, icon, isComposite, timeline } = req.body;
        const effectData = {
            name, category,
            price: parseFloat(price),
            originalPrice: parseFloat(originalPrice) || 0,
            description, icon: icon || '🎬',
            isActive: true,
            isComposite: isComposite === 'true' || isComposite === true,
            timeline: timeline ? (typeof timeline === 'string' ? JSON.parse(timeline) : timeline) : {}
        };
        
        const effectFile = req.files ? req.files.find(f => f.fieldname === 'effectFile') : null;
        const thumbFile = req.files ? req.files.find(f => f.fieldname === 'thumb') : null;
        
        if (effectFile) {
            // This has to be the effect's real Mongo _id, not just a local
            // filename convenience — the shared R2 store and every other
            // machine's download-on-miss fallback (see streamEffectById
            // below) key the file by the same id the URL/database uses.
            // Generating it upfront and handing it to Effect.create() below
            // keeps file name, R2 key, and _id all identical.
            const effectId = new mongoose.Types.ObjectId().toString();
            const previewPath = path.join(previewsDir, `${effectId}.webm`);
            fs.copyFileSync(effectFile.path, previewPath);
            const duration = await getVideoDuration(previewPath);
            const encryptedPath = path.join(encryptedEffectsDir, `${effectId}.enc`);
            await encryptVideo(effectFile.path, encryptedPath);

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

            effectData._id = effectId;
            effectData.previewFilePath = previewPath;
            effectData.encryptedFilePath = encryptedPath;
            effectData.duration = duration;
            effectData.fileUrl = `/api/stream/effect/${effectId}`;
            effectData.previewUrl = `/uploads/previews/${effectId}.webm`;
            effectData.fileSize = fs.statSync(previewPath).size;
            try { fs.unlinkSync(effectFile.path); } catch (e) {}
        }

        if (thumbFile) {
            const thumbPath = path.join(thumbsDir, `${Date.now()}.png`);
            fs.copyFileSync(thumbFile.path, thumbPath);
            effectData.thumbFilePath = thumbPath;
            effectData.thumbUrl = `/uploads/thumbs/${path.basename(thumbPath)}`;
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
        const { name, category, price, originalPrice, fakeUses, isTrending, isFlashSale, flashSalePrice, flashSaleEndsAt, description, icon } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });

        if (name) effect.name = name;
        if (category) effect.category = category;
        if (price) effect.price = parseFloat(price);
        if (originalPrice) effect.originalPrice = parseFloat(originalPrice);
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

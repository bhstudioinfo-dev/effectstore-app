const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const tiktokService = require('../services/tiktokService');
const User = require('../models/User');
const GiftMapping = require('../models/GiftMapping');
const ChallengeWheel = require('../models/ChallengeWheel');
const GiftLog = require('../models/GiftLog');
const GiftConfig = require('../models/GiftConfig');
const Effect = require('../models/Effect');
const { authMiddleware, optionalAuthMiddleware, adminMiddleware } = require('../middleware/auth');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const multer = require('multer');
const { spawn } = require('child_process');
const { getEntitlements, upgradePayload, validateDesignerItems, validateMappingAutomation, normalizePlan } = require('../config/planEntitlements');
const { planQuotaLock } = require('../middleware/planQuotaLock');
const {
    getUserAvailableEffects,
    resolveEffectForUser,
    resolveEffectDurationForUser,
    isCustomEffectMediaAvailable
} = require('../services/effectLibraryService');
const effectQueue = require('../services/effectQueue');
const playbackManager = require('../services/playbackManager');
const obsService = require('../services/obsService');
const { issueEffectAccessToken } = require('../services/effectAccessToken');
const { isValidResourceId, ownedResourceFilter } = require('../utils/accessControl');
const { paths: dataPaths } = require('../config/dataPaths');
const {
    fetchCloudTemplateJson,
    mirrorCloudTemplates,
    resolveCloudAssetUrl,
    syncCloudTemplate,
    syncCloudTemplateList
} = require('../services/cloudTemplateCatalog');
let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
try { ffmpegPath = require('ffmpeg-static') || ffmpegPath; } catch (_e) { }
const giftMenuLayoutPath = dataPaths.giftMenuLayoutPath;
const goalAssetDir = dataPaths.goalAssetsDir;
const savedPresentationNumber = (presentation, key, fallback, allowZero = false) => {
    const saved = Number(presentation?.[key]);
    const backup = Number(fallback);
    const isDimension = key === 'boardWidth' || key === 'boardHeight';
    const isExportLogical = presentation?.coordinateSpace === 'export-logical-v1';
    if (Number.isFinite(saved) && (allowZero || saved > 0)
        && (!isDimension || isExportLogical || !Number.isFinite(backup) || backup <= 0 || (saved >= backup * 0.75 && saved <= backup * 1.5))) return saved;
    return Number.isFinite(backup) && (allowZero || backup > 0) ? backup : 0;
};

function buildChallengeWheelPresentation(item, exportedItem = item) {
    const source = exportedItem || item || {};
    const renderItem = JSON.parse(JSON.stringify({
        ...source,
        title: item?.title || source.title,
        segments: Array.isArray(item?.segments) ? item.segments : source.segments
    }));
    delete renderItem.challengeWheelId;
    delete renderItem.wheelId;
    return {
        coordinateSpace: 'export-logical-v1',
        hideBorder: Boolean(item?.hideBorder),
        hideBg: Boolean(item?.hideBg),
        useCustomBg: Boolean(item?.useCustomBg),
        useCustomBgGradient: Boolean(item?.useCustomBgGradient),
        bgColor: String(item?.bgColor || ''),
        bgColorGradientFrom: String(item?.bgColorGradientFrom || ''),
        bgColorGradientTo: String(item?.bgColorGradientTo || ''),
        ringEffect: String(item?.ringEffect || 'gold'),
        borderColor: String(item?.borderColor || '#d6a84f'),
        useCustomTextColor: Boolean(item?.useCustomTextColor),
        textColor: String(item?.textColor || '#ffffff'),
        labelFontSize: Number(source.labelFontSize || item?.labelFontSize) || 16,
        titleFontSize: Number(source.titleFontSize || item?.titleFontSize) || 34,
        subtitleFontSize: Number(source.subtitleFontSize || item?.subtitleFontSize) || 18,
        boardX: Number(source.x) || 0,
        boardY: Number.isFinite(Number(source.y)) ? Number(source.y) : 0,
        boardWidth: Number(source.w || source.width) || 0,
        boardHeight: Number(source.h || source.height) || 0,
        renderItem
    };
}

// A layout keeps both the editable Designer item and its OBS export item.
// The export item is the authoritative 1080x1920 geometry. Choosing the
// editable item first made an old stage coordinate leak into live playback.
function findChallengeWheelItem(template) {
    return [
        ...(template?.exportedItems || []),
        ...(template?.items || [])
    ].find((item) => item && item.type === 'challenge-wheel') || null;
}
fs.mkdirSync(goalAssetDir, { recursive: true });
const goalAssetUpload = multer({
    storage: multer.diskStorage({
        destination: (req, _file, cb) => {
            const userDir = path.join(goalAssetDir, String(req.userId));
            fs.mkdirSync(userDir, { recursive: true });
            cb(null, userDir);
        },
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const base = path.basename(file.originalname || 'asset', ext)
                .replace(/[^a-zA-Z0-9_-]+/g, '_')
                .slice(0, 80) || 'asset';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
        }
    }),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 10 },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set(['.png', '.gif', '.webm', '.jpg', '.jpeg', '.webp', '.mp4']);
        const isAllowed = allowed.has(path.extname(file.originalname || '').toLowerCase());
        cb(isAllowed ? null : new Error('Chỉ hỗ trợ PNG, GIF, WebM, JPG, WebP và MP4'), isAllowed);
    }
});

function detectGoalAssetType(filePath, ext = '') {
    const header = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
    if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
    if (header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a') return '.gif';
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return '.webm';
    if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return ['.jpg', '.jpeg'].includes(ext) ? ext : '.jpg';
    if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
    if (header.subarray(4, 8).toString('ascii') === 'ftyp') return '.mp4';
    return '';
}

function runFfmpeg(args, timeoutMs = 120000) {
    return new Promise((resolve) => {
        const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
        let settled = false;
        const finish = (success) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(success);
        };
        const timer = setTimeout(() => {
            try { child.kill(); } catch (_e) { }
            finish(false);
        }, timeoutMs);
        child.on('error', () => finish(false));
        child.on('close', (code) => finish(code === 0));
    });
}

async function optimizeGoalAsset(filePath, ext) {
    const originalSize = fs.statSync(filePath).size;
    const thresholds = {
        '.png': 1024 * 1024,
        '.gif': 4 * 1024 * 1024,
        '.webm': 8 * 1024 * 1024,
        '.jpg': 1024 * 1024,
        '.jpeg': 1024 * 1024,
        '.webp': 1024 * 1024,
        '.mp4': 1024 * 1024
    };
    const currentThreshold = thresholds[ext] || 1024 * 1024;
    if (originalSize <= currentThreshold) return { optimized: false, originalSize, finalSize: originalSize };

    const tempPath = `${filePath}.optimized${ext}`;
    let args = [];
    if (ext === '.png') {
        args = ['-i', filePath, '-vf', "scale='min(1600,iw)':-2:flags=lanczos", '-frames:v', '1', '-compression_level', '9', tempPath];
    } else if (ext === '.gif') {
        args = ['-i', filePath, '-vf', "fps=20,scale='min(960,iw)':-2:flags=lanczos", '-loop', '0', tempPath];
    } else if (ext === '.webm') {
        args = ['-i', filePath, '-vf', "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:flags=lanczos", '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '36', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', tempPath];
    } else if (ext === '.jpg' || ext === '.jpeg') {
        args = ['-i', filePath, '-vf', "scale='min(1200,iw)':-2", '-q:v', '4', tempPath];
    } else if (ext === '.webp') {
        args = ['-i', filePath, '-vf', "scale='min(1200,iw)':-2", tempPath];
    } else if (ext === '.mp4') {
        args = ['-i', filePath, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-crf', '28', '-an', tempPath];
    }

    if (args.length === 0) return { optimized: false, originalSize, finalSize: originalSize };

    const success = await runFfmpeg(args);
    if (!success || !fs.existsSync(tempPath)) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return { optimized: false, originalSize, finalSize: originalSize };
    }
    const optimizedSize = fs.statSync(tempPath).size;
    if (optimizedSize >= originalSize) {
        fs.unlinkSync(tempPath);
        return { optimized: false, originalSize, finalSize: originalSize };
    }
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
    return { optimized: true, originalSize, finalSize: optimizedSize };
}

// Connect
router.post('/connect', authMiddleware, async (req, res) => {
    const { roomId } = req.body;
    const success = await tiktokService.connect(roomId, req.userId);
    if (success) res.json({ success: true });
    else res.status(500).json({ success: false });
});

// Prepare (compat endpoint for older frontends)
router.post('/prepare', async (req, res) => {
    try {
        const { roomId } = req.body || {};
        if (!roomId) return res.status(400).json({ success: false, message: 'Missing roomId' });
        res.json({ success: true, roomId: String(roomId).trim() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect
router.post('/disconnect', authMiddleware, async (req, res) => {
    await tiktokService.disconnect();
    res.json({ success: true });
});

router.post('/usage/tts', authMiddleware, (req, res) => {
    const { isTest, kind } = req.body || {};
    if (isTest) {
        return res.json({ success: true, isTest: true, message: 'Test speech allowed' });
    }
    const result = kind === 'comment'
        ? tiktokService.consumeComment(req.userId, isTest)
        : tiktokService.consumeTts(req.userId, isTest);
    res.status(result.status).json(result.payload);
});

// Save Voice Sample MP3
router.post('/save-voice-sample', (req, res) => {
    try {
        const { voiceId, audioBase64 } = req.body || {};
        if (!voiceId || !audioBase64) return res.status(400).json({ success: false, message: 'Missing parameters' });

        const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const targets = [
            path.join(__dirname, '..', 'public', 'assets', 'audio', 'voice-samples', `${voiceId}.mp3`),
            path.join(__dirname, '..', '..', 'desktop', 'renderer', 'assets', 'audio', 'voice-samples', `${voiceId}.mp3`)
        ];

        targets.forEach(targetPath => {
            const dir = path.dirname(targetPath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, buffer);
        });

        res.json({ success: true, voiceId, url: `/assets/audio/voice-samples/${voiceId}.mp3` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Stats
router.get('/stats', (req, res) => {
    res.json({ success: true, stats: tiktokService.liveStats });
});

// Mappings
router.get('/mappings', optionalAuthMiddleware, async (req, res) => {
    try {
        if (!req.userId) return res.json({ success: true, mappings: [] });
        const mappings = await GiftMapping.find({ userId: req.userId });
        res.json({ success: true, mappings });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Available effects for the canonical Gift Mapping picker
router.get('/available-effects', optionalAuthMiddleware, async (req, res) => {
    try {
        if (!req.userId) return res.json({ success: true, effects: [] });
        const effects = await getUserAvailableEffects(req.userId);
        res.json({ success: true, effects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/challenge-wheels', optionalAuthMiddleware, async (req, res) => {
    try {
        if (!req.userId) {
            const wheels = await ChallengeWheel.find({ isTemplate: true }).lean();
            return res.json({ success: true, wheels });
        }
        const owner = req.user || (await User.findById(req.userId).select('isAdmin subscription').lean());
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        // Use the same cloud catalogue truth as the Store. A local Desktop
        // mirror can briefly contain a previous/deleted wheel template while
        // the current Store product has already changed.
        const cloudTemplates = await syncCloudTemplateList(bearerToken).catch(() => null);
        const hasCloudCatalog = Array.isArray(cloudTemplates);
        const cloudTemplateIds = new Set((cloudTemplates || [])
            .filter((template) => template?.isActive === true)
            .map((template) => String(template._id || template.id)));
        // The local Effect collection is only an offline cache. Do not let a
        // deleted cache entry revive a product after cloud sync succeeds.
        const activeTemplateProductIds = hasCloudCatalog ? new Set() : new Set((await Effect.find({
            category: 'menu_template',
            isActive: true
        }).select('fileUrl').lean()).map((effect) => String(effect.fileUrl || '')).filter(Boolean));
        // `business` is a legacy account value with historical bundled-product
        // access. Current Pro/Studio subscriptions do not automatically own
        // paid Store or Challenge Wheel products.
        if (owner?.isAdmin === true || owner?.subscription === 'business') {
            const rawTemplates = await GiftMenuLayout.find({
                // Cloud catalogue mirrors are global records and intentionally
                // have no local userId. The administrator owns every active
                // Store product, so it must be able to materialise its wheel
                // from that canonical record.
                ...(owner?.isAdmin === true ? {} : { userId: req.userId }),
                isTemplate: true,
                $or: [
                    { productType: 'challenge-wheel' },
                    { 'items.type': 'challenge-wheel' },
                    { 'exportedItems.type': 'challenge-wheel' }
                ]
            }).lean();
            const templates = rawTemplates.filter((template) => hasCloudCatalog
                ? cloudTemplateIds.has(String(template._id))
                : (template.isActive === true || activeTemplateProductIds.has(String(template._id)))
            );
            for (const template of templates) {
                const wheelItem = findChallengeWheelItem(template);
                if (!wheelItem) continue;
                const storedWheel = await ChallengeWheel.findOneAndUpdate(
                    { userId: req.userId, sourceTemplateId: template._id },
                    {
                        // Backfill only. An existing wheel belongs to the user
                        // and may contain edited challenges/geometry, so merely
                        // opening Gift Mapping must never reset it to the store
                        // template.
                        $setOnInsert: {
                            userId: req.userId,
                            sourceTemplateId: template._id,
                            name: template.name,
                            title: wheelItem.title || 'VÒNG QUAY THỬ THÁCH',
                            segments: wheelItem.segments || [],
                            durationMs: wheelItem.durationMs || 6500,
                            autoHideMs: wheelItem.autoHideMs || 7000,
                            presentation: buildChallengeWheelPresentation(wheelItem, wheelItem),
                            isActive: true
                        }
                    },
                    { upsert: true, setDefaultsOnInsert: true }
                );
                // Older versions created linked wheels without the exported
                // render snapshot. Repair only that broken state, preserving
                // any user-customised presentation.
                if (!storedWheel?.presentation?.renderItem) {
                    await ChallengeWheel.updateOne(
                        { _id: storedWheel?._id },
                        { $set: { presentation: buildChallengeWheelPresentation(wheelItem, wheelItem) } }
                    );
                }
            }
        }
        const publishedSourceIds = new Set([
            ...cloudTemplateIds,
            ...activeTemplateProductIds
        ]);
        const hasAuthoritativeCatalog = hasCloudCatalog || publishedSourceIds.size > 0;
        const rawWheels = (await ChallengeWheel.find({ userId: req.userId }).sort({ updatedAt: -1 }).lean())
            // Keep standalone wheels, but never show a wheel tied to an old
            // unpublished Store template alongside the current product. If
            // cloud is temporarily unavailable, preserve the local cache
            // rather than making a customer's wheel disappear.
            .filter((wheel) => !hasAuthoritativeCatalog || !wheel.sourceTemplateId || publishedSourceIds.has(String(wheel.sourceTemplateId)));
        // A previous client could create the same wheel more than once while
        // synchronizing a published template. Return one record per source.
        const seenSources = new Set();
        const seenContent = new Set();
        const wheels = rawWheels.filter((wheel) => {
            const source = wheel.sourceTemplateId ? String(wheel.sourceTemplateId) : '';
            const content = (wheel.segments || []).map((segment) => segment.label).join('|');
            const key = source ? `source:${source}` : `content:${wheel.name}|${content}`;
            if (source) {
                if (seenSources.has(source)) return false;
                seenSources.add(source);
            } else {
                if (seenContent.has(key)) return false;
                seenContent.add(key);
            }
            return true;
        });
        res.json({ success: true, wheels });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/challenge-wheels', authMiddleware, async (req, res) => {
    try {
        const owner = await User.findById(req.userId).select('isAdmin subscription subscriptionExpiresAt').lean();
        const sourceTemplateId = req.body.sourceTemplateId && isValidResourceId(req.body.sourceTemplateId) ? req.body.sourceTemplateId : null;
        if (!sourceTemplateId && owner?.isAdmin !== true && normalizePlan(owner) !== 'business') {
            return res.status(403).json({ success: false, error: 'Vòng quay chỉ được tạo từ sản phẩm Vòng quay thử thách đã mua.' });
        }
        let sourceWheelItem = null;
        if (sourceTemplateId) {
            const sourceTemplate = await GiftMenuLayout.findOne({ _id: sourceTemplateId, isTemplate: true })
                .select('items exportedItems').lean();
            sourceWheelItem = findChallengeWheelItem(sourceTemplate);
            if (!sourceWheelItem) {
                return res.status(404).json({ success: false, error: 'Mẫu vòng quay không còn khả dụng.' });
            }
        }
        const name = String(req.body.name || '').trim();
        const rawSegments = Array.isArray(req.body.segments) ? req.body.segments : [];
        const segments = rawSegments.map((segment, index) => ({
            id: String(segment.id || `challenge-${Date.now()}-${index}`),
            label: String(segment.label || '').trim(),
            color: String(segment.color || '#8b5cf6'),
            resultImage: String(segment.resultImage || '').slice(0, 2000000),
            weight: Math.max(0, Number(segment.weight) || 1)
        })).filter((segment) => segment.label).slice(0, 32);
        if (!name || segments.length < 2) return res.status(400).json({ success: false, error: 'Vòng quay cần tên và ít nhất 2 thử thách.' });
        const wheelData = {
            name,
            title: String(req.body.title || 'VÒNG QUAY THỬ THÁCH').trim(),
            segments,
            durationMs: Math.min(30000, Math.max(1500, Number(req.body.durationMs) || 6500)),
            autoHideMs: Math.min(60000, Math.max(0, Number(req.body.autoHideMs) || 7000)),
            noRepeat: Boolean(req.body.noRepeat),
            isActive: true
        };
        // A wheel copied from a Store template must retain the exported 1080x1920
        // render item.  Otherwise a later test can fall back to the Designer
        // stage coordinates and draw only a thin strip in OBS.
        if (sourceWheelItem) {
            wheelData.presentation = buildChallengeWheelPresentation(sourceWheelItem, sourceWheelItem);
        }
        const wheel = sourceTemplateId
            ? await ChallengeWheel.findOneAndUpdate(
                { userId: req.userId, sourceTemplateId },
                { $set: wheelData },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            )
            : await ChallengeWheel.create({ userId: req.userId, ...wheelData });
        res.status(201).json({ success: true, wheel });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/challenge-wheels/:id', authMiddleware, async (req, res) => {
    try {
        const wheel = await ChallengeWheel.findOne({ _id: req.params.id, userId: req.userId });
        if (!wheel) return res.status(404).json({ success: false, error: 'Không tìm thấy vòng quay.' });
        if (req.body.name !== undefined) wheel.name = String(req.body.name || '').trim();
        if (req.body.title !== undefined) wheel.title = String(req.body.title || '').trim();
        if (Array.isArray(req.body.segments)) wheel.segments = req.body.segments.map((segment, index) => ({
            id: String(segment.id || `challenge-${Date.now()}-${index}`), label: String(segment.label || '').trim(),
            color: String(segment.color || '#8b5cf6'), resultImage: String(segment.resultImage || '').slice(0, 2000000), weight: Math.max(0, Number(segment.weight) || 1)
        })).filter((segment) => segment.label).slice(0, 32);
        if (req.body.durationMs !== undefined) wheel.durationMs = Math.min(30000, Math.max(1500, Number(req.body.durationMs) || 6500));
        if (req.body.autoHideMs !== undefined) wheel.autoHideMs = Math.min(60000, Math.max(0, Number(req.body.autoHideMs) || 7000));
        if (req.body.noRepeat !== undefined) wheel.noRepeat = Boolean(req.body.noRepeat);
        if (req.body.presentation && typeof req.body.presentation === 'object') {
            // Keep the exported render snapshot written by the normal layout
            // save. The dedicated wheel button updates presentation fields but
            // must not make the wheel dependent on the currently active menu.
            wheel.presentation = {
                ...(wheel.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {}),
                ...req.body.presentation
            };
        }
        await wheel.save();

        // When the owner/admin edits the wheel that originated from a
        // published template, keep that catalog template in sync as well.
        // Customer-owned copies must never mutate the seller's product.
        if (wheel.sourceTemplateId) {
            const sourceTemplate = await GiftMenuLayout.findOne({
                _id: wheel.sourceTemplateId,
                userId: req.userId,
                isTemplate: true
            });
            if (sourceTemplate) {
                const syncItem = (entry) => entry && entry.type === 'challenge-wheel'
                    ? {
                        ...entry,
                        title: wheel.title || entry.title,
                        segments: wheel.segments,
                        durationMs: wheel.durationMs,
                        autoHideMs: wheel.autoHideMs,
                        ...(wheel.presentation || {})
                    }
                    : entry;
                sourceTemplate.items = (sourceTemplate.items || []).map(syncItem);
                sourceTemplate.exportedItems = (sourceTemplate.exportedItems || []).map(syncItem);
                sourceTemplate.savedAt = new Date();
                await sourceTemplate.save();
            }
        }
        res.json({ success: true, wheel });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/challenge-wheels/:id', authMiddleware, async (req, res) => {
    try {
        const result = await ChallengeWheel.deleteOne({ _id: req.params.id, userId: req.userId });
        if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Không tìm thấy vòng quay.' });
        await GiftMapping.updateMany({ userId: req.userId, wheelId: req.params.id }, { $set: { wheelId: null, triggerType: 'effect' } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/challenge-wheels/:id/test', authMiddleware, async (req, res) => {
    try {
        const wheel = await ChallengeWheel.findOne({ _id: req.params.id, userId: req.userId, isActive: true }).lean();
        if (!wheel || !Array.isArray(wheel.segments) || wheel.segments.length < 2) return res.status(404).json({ success: false, error: 'Vòng quay chưa đủ thử thách.' });
        const usable = wheel.segments.filter((segment) => Number(segment.weight) > 0);
        const result = usable[Math.floor(Math.random() * usable.length)] || wheel.segments[0];
        // The mapped wheel is independent from the active menu layout.
        let templateItem = null;
        if (wheel.sourceTemplateId) {
            const template = await GiftMenuLayout.findOne({ _id: wheel.sourceTemplateId, isTemplate: true }).select('items exportedItems').lean().catch(() => null);
            templateItem = findChallengeWheelItem(template);
        }
        const savedPresentation = wheel.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {};
        const resolvedSegments = Array.isArray(wheel.segments) ? wheel.segments : [];
        const resolvedPresentation = {
            ...(templateItem ? buildChallengeWheelPresentation(templateItem, templateItem) : {}),
            ...savedPresentation,
            boardWidth: savedPresentationNumber(savedPresentation, 'boardWidth', templateItem?.w || templateItem?.width || templateItem?.lockedW),
            boardHeight: savedPresentationNumber(savedPresentation, 'boardHeight', templateItem?.h || templateItem?.height || templateItem?.lockedH),
            boardX: savedPresentationNumber(savedPresentation, 'boardX', templateItem?.x, true),
            boardY: savedPresentationNumber(savedPresentation, 'boardY', templateItem?.y, true)
        };
        req.app.locals.broadcastToClients?.('challenge_wheel_spin', {
            wheelId: String(wheel._id), title: wheel.title || templateItem?.title, segments: resolvedSegments,
            presentation: resolvedPresentation,
            resultId: result.id, resultLabel: result.label, resultImage: result.resultImage || '', durationMs: wheel.durationMs,
            autoHideMs: wheel.autoHideMs, giftId: 'test', giftName: 'Quà thử nghiệm',
            nickname: 'Khán giả thử nghiệm', triggeredAt: Date.now(), simulated: true
        });
        res.json({ success: true, result });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/map-gift', authMiddleware, planQuotaLock('mappings'), async (req, res) => {
    try {
        const { id, giftId, effectId, effectName, giftName, giftIcon, effects, playbackMode, minQuantity, maxQuantity, exactQuantity, cooldown, cooldownAction, triggerType, wheelId, audioEnabled, audioVolume } = req.body;
        const userId = req.userId;
        if (id && !isValidResourceId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const normalizedTriggerType = ['wheel', 'effect_and_wheel'].includes(triggerType) ? triggerType : 'effect';
        if (!String(giftId || '').trim() || (normalizedTriggerType === 'effect' && !String(effectId || '').trim())) {
            return res.status(400).json({ success: false, error: 'giftId và hành động mapping là bắt buộc' });
        }

        let user = req.user || (await User.findById(userId));
        if (!user && userId) {
            try {
                const { mirrorUserLocally } = require('../services/localUserMirror');
                await mirrorUserLocally({ id: userId, email: `${userId}@local.user` });
                user = await User.findById(userId);
            } catch (_e) {}
        }
        if (!user && userId) {
            user = await User.create({
                _id: userId,
                email: `${userId}@local.user`,
                password: 'local-auto-created',
                name: 'User',
                isActive: true
            }).catch(() => null);
        }
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const resolvedEffect = effectId ? await resolveEffectForUser(userId, effectId) : null;
        if (normalizedTriggerType !== 'wheel' && !resolvedEffect) {
            return res.status(403).json({ success: false, message: 'Hiệu ứng không thuộc tài khoản này hoặc không còn khả dụng.' });
        }

        const normalizedEffects = [];
        for (const candidate of Array.isArray(effects) ? effects : []) {
            const candidateId = String(candidate?.effectId || '').trim();
            if (!candidateId) continue;
            const candidateEffect = await resolveEffectForUser(userId, candidateId);
            if (!candidateEffect) {
                return res.status(403).json({ success: false, message: 'Một hiệu ứng trong nhóm không thuộc tài khoản này hoặc không còn khả dụng.' });
            }
            normalizedEffects.push({
                effectId: candidateId,
                effectName: candidateEffect.name || candidate.effectName || candidateId,
                weight: Math.max(1, Number(candidate.weight) || 1)
            });
        }
        let wheel = null;
        if (['wheel', 'effect_and_wheel'].includes(normalizedTriggerType)) {
            wheel = await ChallengeWheel.findOne({ _id: wheelId, userId, isActive: true });
            if (!wheel) return res.status(400).json({ success: false, error: 'Vòng quay không tồn tại hoặc đã bị tắt.' });
        }

        const isAdmin = user.isAdmin === true;
        const entitlements = getEntitlements(user);
        const maxMappings = entitlements.mappings;
        const automationViolation = validateMappingAutomation(req.body || {}, entitlements);
        if (!isAdmin && automationViolation) return res.status(403).json(automationViolation);

        const currentCount = await GiftMapping.countDocuments({ userId });

        let existing = null;
        if (id) {
            existing = await GiftMapping.findOne(ownedResourceFilter(id, userId));
            if (!existing) return res.status(404).json({ success: false, error: 'Mapping not found' });
        } else {
            existing = await GiftMapping.findOne({
                userId,
                giftId,
                minQuantity: minQuantity !== undefined ? Number(minQuantity) : 1,
                maxQuantity: (maxQuantity !== undefined && maxQuantity !== '' && maxQuantity !== null) ? Number(maxQuantity) : null,
                exactQuantity: (exactQuantity !== undefined && exactQuantity !== '' && exactQuantity !== null) ? Number(exactQuantity) : null
            });
        }

        if (!existing && !isAdmin && Number.isFinite(maxMappings) && currentCount >= maxMappings) {
            return res.status(403).json(upgradePayload(
                'mappings',
                `Bạn đã dùng hết ${maxMappings} hiệu ứng gắn quà của gói ${entitlements.label}.`,
                entitlements
            ));
        }

        const mappingData = {
            effectId,
            effectName: resolvedEffect?.name || effectName || '',
            giftName,
            giftIcon,
            effects: normalizedEffects,
            playbackMode: playbackMode || 'random',
            minQuantity: minQuantity !== undefined ? Number(minQuantity) : 1,
            maxQuantity: (maxQuantity !== undefined && maxQuantity !== '' && maxQuantity !== null) ? Number(maxQuantity) : null,
            exactQuantity: (exactQuantity !== undefined && exactQuantity !== '' && exactQuantity !== null) ? Number(exactQuantity) : null,
            cooldown: cooldown !== undefined ? Number(cooldown) : 0,
            cooldownAction: cooldownAction || 'queue',
            audioEnabled: audioEnabled !== false,
            audioVolume: Math.max(0, Math.min(1, Number.isFinite(Number(audioVolume)) ? Number(audioVolume) : 1)),
            triggerType: normalizedTriggerType,
            wheelId: wheel ? wheel._id : null,
            updatedAt: Date.now()
        };

        if (existing) {
            Object.assign(existing, mappingData);
            await existing.save();
            return res.json({ success: true, mapping: existing });
        }

        const mapping = await GiftMapping.create({
            userId,
            giftId,
            isActive: true,
            ...mappingData
        });
        return res.json({ success: true, mapping });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

async function waitForEffectPlayerReady(req, timeoutMs = 2500) {
    const isReady = req.app.locals.isEffectPlayerReady;
    if (typeof isReady !== 'function') return false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (isReady()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return isReady();
}
router.put('/mappings/:id/audio', authMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const mapping = await GiftMapping.findOne(ownedResourceFilter(req.params.id, req.userId));
        if (!mapping) return res.status(404).json({ success: false, error: 'Mapping not found' });

        mapping.audioEnabled = req.body.audioEnabled !== false;
        mapping.audioVolume = Math.max(0, Math.min(1,
            Number.isFinite(Number(req.body.audioVolume)) ? Number(req.body.audioVolume) : 1
        ));
        mapping.updatedAt = Date.now();
        await mapping.save();
        return res.json({ success: true, mapping });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/mappings/:id', authMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const mapping = await GiftMapping.findOneAndDelete(ownedResourceFilter(req.params.id, req.userId));
        if (!mapping) return res.status(404).json({ success: false, error: 'Mapping not found' });
        return res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Toggle mapping
router.put('/mappings/:id/toggle', authMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const mapping = await GiftMapping.findOne(ownedResourceFilter(req.params.id, req.userId));
        if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });
        mapping.isActive = !mapping.isActive;
        await mapping.save();
        res.json({ success: true, mapping });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Test trigger
router.post('/test-trigger', authMiddleware, async (req, res) => {
    try {
        const { mappingId } = req.body;
        if (!isValidResourceId(mappingId)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const mapping = await GiftMapping.findOne(ownedResourceFilter(mappingId, req.userId));
        if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });

        // A wheel-only mapping must be testable without an effect player.
        if (mapping.wheelId && (mapping.triggerType === 'wheel' || !mapping.effectId)) {
            const wheel = await ChallengeWheel.findOne({ _id: mapping.wheelId, userId: req.userId, isActive: true }).lean();
            const usable = (wheel?.segments || []).filter((segment) => Number(segment.weight) > 0);
            if (!wheel || usable.length < 2) {
                return res.status(400).json({ success: false, message: 'Vòng quay không tồn tại hoặc chưa đủ thử thách.' });
            }
            const result = usable[Math.floor(Math.random() * usable.length)];
            // The mapping owns the wheel configuration. Never read the
            // currently active personal layout here.
            let templateItem = null;
            if (wheel.sourceTemplateId) {
                const template = await GiftMenuLayout.findOne({ _id: wheel.sourceTemplateId, isTemplate: true }).select('items exportedItems').lean().catch(() => null);
                templateItem = findChallengeWheelItem(template);
            }
            const savedPresentation = wheel.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {};
            const resolvedSegments = Array.isArray(wheel.segments) ? wheel.segments : [];
            const resolvedTitle = wheel.title || templateItem?.title;
            const presentation = {
                ...(templateItem ? buildChallengeWheelPresentation(templateItem, templateItem) : {}),
                ...savedPresentation,
                boardWidth: savedPresentationNumber(savedPresentation, 'boardWidth', templateItem?.w || templateItem?.width || templateItem?.lockedW),
                boardHeight: savedPresentationNumber(savedPresentation, 'boardHeight', templateItem?.h || templateItem?.height || templateItem?.lockedH),
                boardX: savedPresentationNumber(savedPresentation, 'boardX', templateItem?.x, true),
                boardY: savedPresentationNumber(savedPresentation, 'boardY', templateItem?.y, true)
            };
            req.app.locals.broadcastToClients?.('challenge_wheel_spin', {
                wheelId: String(wheel._id), title: resolvedTitle, segments: resolvedSegments, presentation,
                resultId: result.id, resultLabel: result.label, resultImage: result.resultImage || '',
                durationMs: wheel.durationMs, autoHideMs: wheel.autoHideMs,
                giftId: mapping.giftId, giftName: mapping.giftName, nickname: 'Khán giả thử nghiệm',
                triggeredAt: Date.now(), simulated: true
            });
            return res.json({ success: true, effectId: 'wheel', effectName: result.label, duration: Math.max(1, (wheel.durationMs || 6500) / 1000) });
        }

        const effectId = String(mapping.effectId || '');
        const [resolvedEffect, duration] = await Promise.all([
            resolveEffectForUser(req.userId, effectId),
            resolveEffectDurationForUser(req.userId, effectId)
        ]);

        if (!resolvedEffect) {
            return res.status(403).json({ success: false, message: 'Hiệu ứng không thuộc tài khoản này hoặc không còn khả dụng.' });
        }
        if (resolvedEffect.isCustom && !await isCustomEffectMediaAvailable(resolvedEffect)) {
            return res.status(422).json({
                success: false,
                code: 'CUSTOM_EFFECT_FILE_UNAVAILABLE',
                message: 'Không tìm thấy file hiệu ứng cá nhân trên máy này. Hãy thêm lại hiệu ứng rồi thử lại.'
            });
        }

        if (!duration) {
            return res.status(422).json({
                success: false,
                warning: 'Effect is missing duration metadata and was skipped.',
                message: 'Hiệu ứng chưa có thời lượng hợp lệ. App đã bỏ qua để tránh treo queue.'
            });
        }

        const isPlayerReady = typeof req.app.locals.isEffectPlayerReady === 'function' && req.app.locals.isEffectPlayerReady();
        if (!isPlayerReady) {
            if (!obsService.isConnected()) {
                return res.status(503).json({ success: false, message: 'OBS chưa kết nối.' });
            }
            obsService.ensureEffectPlayerSource().catch(() => {});
            if (!await waitForEffectPlayerReady(req, 150)) {
                return res.status(503).json({ success: false, message: 'Nguồn effect_player chưa sẵn sàng trên OBS. Vui lòng mở nguồn OBS Browser.' });
            }
        }

        let queued = false;
        let effectName = mapping.effectName || effectId;
        let finalDuration = 3;

        if (mapping.effects && mapping.effects.length > 0) {
            let selectedEffect = null;
            const mappingIdStr = String(mapping._id);
            if (mapping.playbackMode === 'sequential') {
                const idx = playbackManager.sequentialIndices.get(mappingIdStr) || 0;
                selectedEffect = mapping.effects[idx % mapping.effects.length];
                playbackManager.sequentialIndices.set(mappingIdStr, (idx + 1) % mapping.effects.length);
            } else {
                const randIndex = Math.floor(Math.random() * mapping.effects.length);
                selectedEffect = mapping.effects[randIndex];
            }

            if (selectedEffect) {
                const selEffectId = selectedEffect.effectId;
                const selEffectName = selectedEffect.effectName;
                const dur = await resolveEffectDurationForUser(req.userId, selEffectId);
                const resolvedEffect = await resolveEffectForUser(req.userId, selEffectId);

                if (resolvedEffect && dur) {
                    finalDuration = dur;
                    effectName = resolvedEffect.name || selEffectName || selEffectId;

                    let effectUrl = resolvedEffect.fileUrl;
                    if (!resolvedEffect.isCustom) {
                        const PORT = process.env.PORT || 9000;
                        const streamToken = issueEffectAccessToken({
                            purpose: 'effect-player-test-mapping',
                            effectId: selEffectId,
                            userId: String(req.userId)
                        });
                        effectUrl = `http://localhost:${PORT}/api/obs/effect-player-media/${encodeURIComponent(selEffectId)}?token=${encodeURIComponent(streamToken)}`;
                    }

                    queued = await effectQueue.add({
                        mappingId: mapping._id,
                        effectId: selEffectId,
                        effectName,
                        effectUrl,
                        audioEnabled: mapping.audioEnabled !== false,
                        audioVolume: mapping.audioVolume,
                        duration: dur < 100 ? dur * 1000 : dur,
                        playbackType: 'test_mapping',
                        priority: 0,
                        createdAt: Date.now(),
                        userId: req.userId
                    });
                } else {
                    finalDuration = 3;
                    effectName = selEffectName || 'Unknown';
                    queued = await effectQueue.add({
                        mappingId: mapping._id,
                        effects: mapping.effects,
                        playbackMode: mapping.playbackMode || 'random',
                        audioEnabled: mapping.audioEnabled !== false,
                        audioVolume: mapping.audioVolume,
                        playbackType: 'test_mapping',
                        priority: 0,
                        createdAt: Date.now(),
                        userId: req.userId
                    });
                }
            } else {
                finalDuration = 3;
                queued = await effectQueue.add({
                    mappingId: mapping._id,
                    effects: mapping.effects,
                    playbackMode: mapping.playbackMode || 'random',
                    audioEnabled: mapping.audioEnabled !== false,
                    audioVolume: mapping.audioVolume,
                    playbackType: 'test_mapping',
                    priority: 0,
                    createdAt: Date.now(),
                    userId: req.userId
                });
            }
        } else {
            const PORT = process.env.PORT || 9000;
            let effectUrl = resolvedEffect.fileUrl;
            if (!resolvedEffect.isCustom) {
                const streamToken = issueEffectAccessToken({
                    purpose: 'effect-player-test-mapping',
                    effectId,
                    userId: String(req.userId)
                });
                effectUrl = `http://localhost:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effectId)}?token=${encodeURIComponent(streamToken)}`;
            }
            finalDuration = duration;
            effectName = resolvedEffect.name || mapping.effectName || effectId;

            queued = await effectQueue.add({
                mappingId: mapping._id,
                effectId,
                effectName,
                effectUrl,
                audioEnabled: mapping.audioEnabled !== false,
                audioVolume: mapping.audioVolume,
                duration: finalDuration,
                playbackType: 'test_mapping',
                priority: 0,
                createdAt: Date.now(),
                userId: req.userId
            });
        }

        if (!queued) {
            return res.status(422).json({ success: false, message: 'Không thể thêm hiệu ứng Test vào hàng đợi.' });
        }

        await GiftLog.create({
            giftId: mapping.giftId,
            giftName: mapping.giftName,
            effectId: effectId || 'group',
            triggeredAt: new Date(),
            sessionId: req.userId,
            userId: req.userId,
            userName: 'Test OBS'
        });

        res.json({
            success: true,
            message: 'Effect triggered on OBS.',
            effectId: effectId || 'group',
            effectName,
            duration: finalDuration
        });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
// Logs
router.get('/logs', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await GiftLog.find({ userId: req.userId })
            .sort({ triggeredAt: -1 })
            .limit(limit);
        res.json({ success: true, logs });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/logs', authMiddleware, async (req, res) => {
    try {
        await GiftLog.deleteMany({ userId: req.userId });
        res.json({ success: true, message: 'Logs cleared' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Simulate gift
router.post('/simulate-gift', authMiddleware, async (req, res) => {
    try {
        const { giftId, userName } = req.body;
        const mapping = await GiftMapping.findOne({ giftId, userId: req.userId, isActive: true });
        if (!mapping) return res.json({ success: false, message: 'No mapping found', triggered: false });

        const effectId = String(mapping.effectId || '');
        const [resolvedEffect, duration] = await Promise.all([
            resolveEffectForUser(req.userId, effectId),
            resolveEffectDurationForUser(req.userId, effectId)
        ]);

        if (!resolvedEffect) {
            return res.status(403).json({ success: false, message: 'Hiệu ứng không thuộc tài khoản này hoặc không còn khả dụng.', triggered: false });
        }
        if (resolvedEffect.isCustom && !await isCustomEffectMediaAvailable(resolvedEffect)) {
            return res.status(422).json({
                success: false,
                triggered: false,
                code: 'CUSTOM_EFFECT_FILE_UNAVAILABLE',
                message: 'Không tìm thấy file hiệu ứng cá nhân trên máy này. Hãy thêm lại hiệu ứng rồi thử lại.'
            });
        }

        if (!duration) {
            return res.status(422).json({
                success: false,
                triggered: false,
                warning: 'Effect is missing duration metadata and was skipped.',
                message: 'Hiệu ứng chưa có thời lượng hợp lệ. App đã bỏ qua để tránh treo queue.'
            });
        }
        const isPlayerReady = typeof req.app.locals.isEffectPlayerReady === 'function' && req.app.locals.isEffectPlayerReady();
        if (!isPlayerReady) {
            if (!obsService.isConnected()) {
                return res.status(503).json({ success: false, triggered: false, message: 'OBS chưa kết nối.' });
            }
            await obsService.ensureEffectPlayerSource();
            const sourceStatus = await obsService.getFoundationSourceStatus();
            if (!sourceStatus.effect_player || !await waitForEffectPlayerReady(req, 1000)) {
                return res.status(503).json({ success: false, triggered: false, message: 'Nguồn effect_player chưa sẵn sàng trên OBS.' });
            }
        }

        const giftData = {
            giftId,
            giftName: mapping.giftName,
            nickname: userName || 'Anonymous',
            source: 'simulate-gift',
            simulated: true
        };

        let queued = false;

        if (mapping.effects && mapping.effects.length > 0) {
            queued = await effectQueue.add({
                mappingId: mapping._id,
                effects: mapping.effects,
                playbackMode: mapping.playbackMode || 'random',
                audioEnabled: mapping.audioEnabled !== false,
                audioVolume: mapping.audioVolume,
                playbackType: 'live_mapping',
                priority: 100,
                createdAt: Date.now(),
                giftData,
                userId: req.userId
            });
        } else {
            const PORT = process.env.PORT || 9000;
            let effectUrl = resolvedEffect.fileUrl;
            if (!resolvedEffect.isCustom) {
                const streamToken = issueEffectAccessToken({
                    purpose: 'effect-player-live-mapping',
                    effectId,
                    userId: String(req.userId)
                });
                effectUrl = `http://localhost:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effectId)}?token=${encodeURIComponent(streamToken)}`;
            }

            queued = await effectQueue.add({
                mappingId: mapping._id,
                effectId,
                effectName: resolvedEffect.name || mapping.effectName || effectId,
                effectUrl,
                audioEnabled: mapping.audioEnabled !== false,
                audioVolume: mapping.audioVolume,
                duration,
                playbackType: 'live_mapping',
                priority: 100,
                createdAt: Date.now(),
                giftData,
                userId: req.userId
            });
        }

        if (!queued) {
            return res.status(422).json({ success: false, triggered: false, message: 'Không thể thêm hiệu ứng vào hàng đợi.' });
        }

        await GiftLog.create({
            giftId,
            giftName: mapping.giftName,
            effectId: effectId || 'group',
            triggeredAt: new Date(),
            sessionId: req.userId,
            userId: req.userId,
            userName: userName || 'Anonymous'
        });
        res.json({ success: true, triggered: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const aiAssistantService = require('../services/aiAssistantService');

// AI Assistant Config API
router.get('/ai-config', authMiddleware, (req, res) => {
    try {
        const config = aiAssistantService.getConfig(req.user);
        const usage = aiAssistantService.getCharacterUsage(req.user);
        const systemStatus = aiAssistantService.getSystemStatus();
        res.json({ success: true, config, usage, systemStatus });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ai-config', authMiddleware, async (req, res) => {
    try {
        const updated = await aiAssistantService.saveConfig(req.body || {}, req.user);
        const usage = aiAssistantService.getCharacterUsage(req.user || 'free');
        res.json({ success: true, config: updated, usage });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/save-voice-sample', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const { voiceId, audioBase64 } = req.body || {};
        if (!voiceId || !audioBase64) return res.status(400).json({ success: false, error: 'Missing params' });
        const safeVoiceId = String(voiceId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
        if (!safeVoiceId || safeVoiceId !== String(voiceId)) return res.status(400).json({ success: false, error: 'Invalid voice ID' });
        
        const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const filePaths = [
            path.join(__dirname, '../public/assets/audio/voice-samples', `sample_${safeVoiceId}.mp3`),
            path.join(__dirname, '../../desktop/renderer/assets/audio/voice-samples', `sample_${safeVoiceId}.mp3`)
        ];

        filePaths.forEach(fp => {
            try {
                fs.mkdirSync(path.dirname(fp), { recursive: true });
                fs.writeFileSync(fp, buffer);
            } catch (_e) {}
        });

        res.json({ success: true, message: `Sample saved for voice ${safeVoiceId}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/ai-buy-addon', authMiddleware, async (req, res) => {
    try {
        const { pack } = req.body || {};
        let addonCharacters = 0;
        let packName = '';
        let amount = 10000;

        if (pack === '10k') {
            addonCharacters = 1000;
            packName = 'Gói Nạp Lẻ 1,000 ký tự (10,000 VNĐ)';
            amount = 10000;
        } else if (pack === '50k') {
            addonCharacters = 5500;
            packName = 'Gói Nạp Lẻ 5,500 ký tự (50,000 VNĐ)';
            amount = 50000;
        } else if (pack === '100k') {
            addonCharacters = 12000;
            packName = 'Gói Nạp Lẻ 12,000 ký tự (100,000 VNĐ)';
            amount = 100000;
        } else {
            return res.status(400).json({ success: false, error: 'Gói nạp lẻ không hợp lệ' });
        }

        const userPlan = normalizePlan(req.user);

        // Create pending payment for admin review. Unlike /create-qr +
        // /confirm, this pack has no proof-upload step — the admin verifies
        // the transfer against their own bank/Sepay records — so hasProof
        // must stay false here; it must never be hardcoded true without an
        // actual uploaded file, or the admin queue would show unverifiable
        // orders as if proof had already been submitted.
        const Payment = require('../models/Payment');
        const orderId = 'AI' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        await Payment.create({
            userId: String(req.userId),
            orderId,
            amount,
            effectIds: [`AI_ADDON_${pack.toUpperCase()}`],
            status: 'pending',
            hasProof: false
        });

        res.json({
            success: true,
            pending: true,
            message: `✅ Đã gửi yêu cầu nạp ${packName}! Quản trị viên (Admin) đang xác thực giao dịch và sẽ duyệt đơn cho bạn ngay.`,
            orderId,
            usage: aiAssistantService.getCharacterUsage(req.user || userPlan)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ai-test-speech', authMiddleware, async (req, res) => {
    try {
        const { username, comment } = req.body || {};
        const userPlan = normalizePlan(req.user);
        const testEvent = await aiAssistantService.processChatMessage({
            username: username || 'Viewer Thử nghiệm',
            comment: comment || 'Idol live hay quá!',
            isDonator: true,
            userPlan,
            user: req.user,
            isTest: true
        });
        res.json({ success: true, event: testEvent });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gifts library
router.get('/gifts-library', async (req, res) => {
    try {
        const liveCatalog = tiktokService.getGiftCatalogState();
        if (liveCatalog.source === 'tiktok-live' && liveCatalog.gifts.length) {
            return res.json({
                success: true,
                source: liveCatalog.source,
                gifts: liveCatalog.gifts.map((gift) => ({
                    id: String(gift.giftId),
                    name: gift.giftName,
                    icon: gift.iconUrl,
                    coins: gift.diamondCount || 0,
                    giftId: String(gift.giftId),
                    giftName: gift.giftName,
                    diamondCount: gift.diamondCount || 0,
                    iconUrl: gift.iconUrl || ''
                }))
            });
        }
        const defaultGifts = [
            { id: 'rose', name: 'Rose', icon: '/assets/gift-icons/Rose.png', coins: 1 },
            { id: 'tiktok', name: 'TikTok', icon: '/assets/gift-icons/TikTok.png', coins: 1 },
            { id: 'ice_cream', name: 'Ice Cream', icon: '/assets/gift-icons/Ice_Cream_Cone.png', coins: 5 },
            { id: 'heart', name: 'Heart', icon: '/assets/gift-icons/Finger_Heart.png', coins: 10 },
            { id: 'corgi', name: 'Corgi', icon: '/assets/gift-icons/Corgi.png', coins: 50 },
            { id: 'doughnut', name: 'Doughnut', icon: '/assets/gift-icons/Doughnut.png', coins: 20 },
            { id: 'perfume', name: 'Perfume', icon: '/assets/gift-icons/Perfume.png', coins: 100 },
            { id: 'sunglasses', name: 'Sunglasses', icon: '/assets/gift-icons/Sunglasses.png', coins: 50 },
            { id: 'money_gun', name: 'Money Gun', icon: '/assets/gift-icons/Money_Gun.png', coins: 500 },
            { id: 'pk_crown', name: 'PK Crown', icon: '/assets/gift-icons/PK_crown_ring.png', coins: 1000 },
            { id: 'friendship_necklace', name: 'Friendship Necklace', icon: '/assets/gift-icons/Friendship_Necklace.png', coins: 299 },
            { id: 'wooly_hat', name: 'Wooly Hat', icon: '/assets/gift-icons/Wooly_Hat.png', coins: 99 },
            { id: 'boxing_gloves', name: 'Boxing Gloves', icon: '/assets/gift-icons/Boxing_Gloves.png', coins: 199 },
            { id: 'love_you', name: 'Love You', icon: '/assets/gift-icons/Love_you_so_much.png', coins: 520 },
            { id: 'youre_awesome', name: "You're Awesome", icon: '/assets/gift-icons/You\'re_awesome.png', coins: 88 }
        ];

        const giftIconDir = dataPaths.runtimeGiftIconsDir;
        const fileGiftsMap = new Map();
        if (fs.existsSync(giftIconDir)) {
            const files = fs.readdirSync(giftIconDir);
            for (const file of files) {
                if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(file)) continue;
                const baseWithoutExt = path.basename(file, path.extname(file));
                const cleanName = baseWithoutExt
                    .replace(/[\s_]+\d+$/g, '')
                    .replace(/[\s_]+\(\d+\)$/g, '')
                    .replace(/[\s_]+/g, ' ')
                    .trim();
                const key = cleanName.toLowerCase();
                const id = key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

                if (!fileGiftsMap.has(key) || file.endsWith('.png')) {
                    fileGiftsMap.set(key, {
                        id,
                        name: cleanName,
                        icon: `/assets/gift-icons/${file}`,
                        coins: 1
                    });
                }
            }
        }
        const fileGifts = Array.from(fileGiftsMap.values());

        const mergedByName = new Map();
        defaultGifts.forEach((gift) => {
            mergedByName.set(gift.name.toLowerCase().trim(), gift);
        });

        fileGifts.forEach((gift) => {
            const key = gift.name.toLowerCase().trim();
            if (!mergedByName.has(key)) {
                mergedByName.set(key, gift);
            }
        });

        const configs = await GiftConfig.find();
        configs.forEach(c => {
            if (c.giftName) {
                const key = c.giftName.toLowerCase().trim();
                const existing = mergedByName.get(key) || (c.giftId ? mergedByName.get(c.giftId) : null);
                if (existing) {
                    if (c.coins) existing.coins = c.coins;
                    if (c.iconUrl) existing.icon = c.iconUrl;
                } else {
                    mergedByName.set(key, {
                        id: c.giftId || key.replace(/[^a-z0-9]+/g, '_'),
                        name: c.giftName,
                        icon: c.iconUrl || '/assets/gift-icons/Rose.png',
                        coins: c.coins || 1
                    });
                }
            }
        });

        const gifts = Array.from(mergedByName.values());

        res.json({ success: true, gifts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
// Gift Menu Designer layout (MongoDB and local sync for OBS)
router.get('/gift-menu-layouts', authMiddleware, async (req, res) => {
    try {
        const layouts = await GiftMenuLayout.find({ userId: req.userId, isTemplate: false }).sort({ updatedAt: -1 });
        const templates = await GiftMenuLayout.find({ isTemplate: true }).select('_id name');
        const templateIdByName = new Map(templates.map(template => [String(template.name || '').trim().toLowerCase(), String(template._id)]));
        const uniqueLayouts = [];
        const seenTemplateIds = new Set();

        for (const layout of layouts) {
            const inferredTemplateId = layout.parentTemplateId
                ? String(layout.parentTemplateId)
                : templateIdByName.get(String(layout.name || '').trim().toLowerCase());
            if (inferredTemplateId) {
                if (seenTemplateIds.has(inferredTemplateId)) continue;
                seenTemplateIds.add(inferredTemplateId);
            }
            uniqueLayouts.push(layout);
        }

        res.json({ success: true, layouts: uniqueLayouts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-templates', optionalAuthMiddleware, async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        const cloudTemplates = await syncCloudTemplateList(bearerToken).catch((error) => {
            console.warn('[templates] Cloud catalog sync failed; using local cache:', error.message);
            return null;
        });
        const cloudById = new Map((cloudTemplates || []).map((template) => [String(template._id || template.id), template]));
        const hasCloudCatalog = Array.isArray(cloudTemplates);
        const localTemplates = await GiftMenuLayout.find({ isTemplate: true, category: { $ne: 'goal_board' } }).sort({ updatedAt: -1 }).lean();
        // Older published templates were written with GiftMenuLayout.isActive
        // false even though their Store Effect is active.  The Store product
        // is the canonical publication state, so expose it here and let every
        // client (Desktop, Designer and mapping) agree on availability.
        const activeTemplateProductIds = hasCloudCatalog ? new Set() : new Set((await Effect.find({
            category: 'menu_template',
            isActive: true,
            fileUrl: { $in: localTemplates.map((template) => String(template._id)) }
        }).select('fileUrl').lean()).map((effect) => String(effect.fileUrl)));
        const templates = hasCloudCatalog
            ? localTemplates.filter((template) => cloudById.has(String(template._id)))
            : localTemplates;
        const normalizeTemplatePublication = (template) => ({
            ...template,
            isActive: hasCloudCatalog
                ? cloudById.get(String(template._id))?.isActive === true
                : (template.isActive === true || activeTemplateProductIds.has(String(template._id)))
        });
        const publishedTemplates = templates.map(normalizeTemplatePublication);
        if (!req.userId) {
            return res.json({
                success: true,
                templates: publishedTemplates.map(t => {
                    const cloudTemplate = cloudById.get(String(t._id));
                    return {
                        ...t,
                        // Keep the catalogue's public/free ownership state
                        // when this endpoint is opened before a user session
                        // is available.  Returning false unconditionally made
                        // valid free/cloud templates look locked in Desktop.
                        isPurchased: cloudTemplate
                            ? Boolean(cloudTemplate.isPurchased)
                            : Number(t.price || 0) <= 0,
                        isUsed: false,
                        usedLayoutId: null
                    };
                })
            });
        }
        const user = await User.findById(req.userId);
        const ownedEffectIds = (user && Array.isArray(user.purchasedEffects)) ? user.purchasedEffects.map(pe => pe.effectId?.toString()).filter(Boolean) : [];
        const isAdmin = user ? user.isAdmin === true : false;
        const hasLegacyBundledProducts = user ? user.subscription === 'business' : false;

        const userLayouts = await GiftMenuLayout.find({ userId: req.userId, isTemplate: false }).select('_id name parentTemplateId').lean();
        const usedTemplateIds = new Set(userLayouts.filter(layout => layout.parentTemplateId).map(layout => String(layout.parentTemplateId)));
        const usedTemplateNames = new Set(userLayouts.map(layout => String(layout.name || '').trim().toLowerCase()));

        const templateEffectByLayoutId = new Map();
        if (!isAdmin && !hasLegacyBundledProducts && publishedTemplates.length) {
            const templateEffects = await Effect.find({
                category: 'menu_template',
                fileUrl: { $in: publishedTemplates.map((template) => String(template._id)) }
            }).select('_id fileUrl').lean();
            templateEffects.forEach((effect) => templateEffectByLayoutId.set(String(effect.fileUrl), String(effect._id)));
        }

        const mappedTemplates = publishedTemplates.map((t) => {
            const normalizedName = String(t.name || '').trim().toLowerCase();
            const usedLayout = userLayouts.find(layout =>
                String(layout.parentTemplateId || '') === String(t._id) ||
                String(layout.name || '').trim().toLowerCase() === normalizedName
            );
            const isUsed = usedTemplateIds.has(String(t._id)) || usedTemplateNames.has(normalizedName);
            if (isAdmin || hasLegacyBundledProducts) {
                return { ...t, isPurchased: true, isUsed, usedLayoutId: usedLayout?._id || null };
            }
            const correspondingEffectId = templateEffectByLayoutId.get(String(t._id));
            const isPurchased = correspondingEffectId ? ownedEffectIds.includes(correspondingEffectId) : false;
            const cloudTemplate = cloudById.get(String(t._id));
            return {
                ...t,
                isPurchased: cloudTemplate ? Boolean(cloudTemplate.isPurchased) : isPurchased,
                isUsed,
                usedLayoutId: usedLayout?._id || null
            };
        });

        res.json({ success: true, templates: mappedTemplates });
    } catch (error) {
        console.error('Error in /gift-menu-templates:', error);
        res.json({ success: true, templates: [] });
    }
});

router.get('/gift-menu-overlay-layout', async (_req, res) => {
    try {
        if (!fs.existsSync(giftMenuLayoutPath)) {
            return res.json({
                success: true,
                layout: {
                    name: 'Gift Menu Overlay',
                    aspectRatio: '9:16',
                    items: [],
                    exportedItems: []
                }
            });
        }

        const rawLayout = JSON.parse(fs.readFileSync(giftMenuLayoutPath, 'utf8'));
        const layout = {
            name: rawLayout.name || 'Gift Menu Overlay',
            aspectRatio: rawLayout.aspectRatio || '9:16',
            canvasSize: rawLayout.canvasSize || undefined,
            safeArea: rawLayout.safeArea || undefined,
            exportSize: rawLayout.exportSize || undefined,
            savedAt: rawLayout.savedAt || rawLayout.updatedAt || undefined,
            items: Array.isArray(rawLayout.items) ? rawLayout.items : [],
            exportedItems: Array.isArray(rawLayout.exportedItems) ? rawLayout.exportedItems : []
        };

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-layout', authMiddleware, async (req, res) => {
    try {
        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false });
        if (!layout) {
            layout = await GiftMenuLayout.findOne({ userId: req.userId, isTemplate: false });
            if (layout) {
                layout.isActive = true;
                await layout.save();
            }
        }
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// The OBS gift-menu overlay renders whatever was last "Lưu & Xuất" to the
// mirror file — it does not know or care which account is logged into the
// desktop app. On a shared PC that meant switching accounts left the
// previous account's board showing in OBS until someone republished. The
// desktop app calls this right after login so the overlay picks up the new
// account's own saved board automatically. It only rewrites the mirror's
// content (the same self-heal `processGiftMenuGift` already does when a
// real gift arrives) — it never touches OBS scene/source setup, which stays
// exclusively behind explicit "Lưu & Xuất".
router.post('/gift-menu-overlay-sync-active', authMiddleware, async (req, res) => {
    try {
        // Never clobber a different account's board while it's actually live.
        if (tiktokService.currentLiveUserId && String(tiktokService.currentLiveUserId) !== String(req.userId)) {
            return res.json({ success: true, synced: false, reason: 'live-session-active' });
        }

        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false }).lean();
        if (!layout) {
            const fallback = await GiftMenuLayout.findOne({ userId: req.userId, isTemplate: false });
            if (fallback) {
                fallback.isActive = true;
                await fallback.save();
                layout = fallback.toObject();
            }
        }
        if (!layout) return res.json({ success: true, synced: false });

        let currentFileUserId = '';
        try {
            if (fs.existsSync(giftMenuLayoutPath)) {
                const current = JSON.parse(fs.readFileSync(giftMenuLayoutPath, 'utf8') || 'null');
                currentFileUserId = current && current.userId ? String(current.userId) : '';
            }
        } catch (_e) {}
        if (currentFileUserId === String(req.userId)) return res.json({ success: true, synced: false });

        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, synced: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/gift-menu-layout', authMiddleware, planQuotaLock('layouts'), async (req, res) => {
    try {
        const payload = req.body || {};
        const requestedLayoutId = payload.id || payload._id;
        if (requestedLayoutId && !isValidResourceId(requestedLayoutId)) {
            return res.status(400).json({ success: false, error: 'Invalid layout ID' });
        }
        let user = req.user || await User.findById(req.userId);
        if (!user && req.userId) {
            const { mirrorUserLocally } = require('../services/localUserMirror');
            await mirrorUserLocally({ id: req.userId, email: `${req.userId}@local.user` });
            user = await User.findById(req.userId);
        }
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        const entitlements = getEntitlements(user);
        const isRenameOnly = payload.id && payload.name && !payload.aspectRatio && !payload.items && !payload.exportedItems;
        if (isRenameOnly) {
            const renamedLayout = await GiftMenuLayout.findOneAndUpdate(
                { _id: payload.id, userId: req.userId, isTemplate: false },
                { name: String(payload.name).trim() || 'Thiết kế mới' },
                { new: true }
            );
            if (!renamedLayout) return res.status(404).json({ success: false, error: 'Layout not found' });
            if (renamedLayout.isActive) {
                // Sync rename with Goal Board layout
                const goalBoardLayoutPath = dataPaths.goalBoardLayoutPath;
                const goalBoardLayout = {
                    version: renamedLayout.version || 2,
                    savedAt: renamedLayout.savedAt || new Date().toISOString(),
                    aspectRatio: renamedLayout.aspectRatio || '9:16',
                    canvas: renamedLayout.canvasSize ? { width: renamedLayout.canvasSize.width, height: renamedLayout.canvasSize.height } : { width: 1080, height: 1920 },
                    layers: renamedLayout.items || []
                };
                try {
                    fs.writeFileSync(goalBoardLayoutPath, JSON.stringify(goalBoardLayout, null, 2), 'utf8');
                } catch (err) {
                    console.error('Failed to sync goal board layout file:', err);
                }
                tiktokService.setGoalBoardLayout(goalBoardLayout);
                if (req.app.locals.broadcastToClients) {
                    req.app.locals.broadcastToClients('goal_board_layout_update', {
                        type: 'goal_board_layout_update',
                        layout: goalBoardLayout
                    });
                }
            }
            return res.json({ success: true, layout: renamedLayout });
        }

        let layout = null;
        if (payload.id || payload._id) {
            layout = await GiftMenuLayout.findOne(ownedResourceFilter(
                payload.id || payload._id,
                req.userId,
                { isTemplate: false }
            ));
            if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        } else if (!payload.createNew) {
            layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false });
        }

        if (layout && !layout.parentTemplateId) {
            const matchTemplate = await GiftMenuLayout.findOne({ name: layout.name, isTemplate: true });
            if (matchTemplate) {
                layout.parentTemplateId = matchTemplate._id;
                await layout.save();
            }
        }

        // Saving is a draft/library action: keep every trial setting intact so
        // Free users can return to a design they like. The same validation is
        // still calculated for a friendly notice, while OBS export remains the
        // authoritative blocking boundary in routes/obs.js.
        const designerViolation = validateDesignerItems(payload.items, entitlements) ||
            validateDesignerItems(payload.exportedItems, entitlements);
        if (designerViolation && payload.draftOnly !== true) {
            return res.status(403).json(designerViolation);
        }
        if (!layout) {
            if (Number.isFinite(entitlements.layouts)) {
                const layoutCount = await GiftMenuLayout.countDocuments({ userId: req.userId, isTemplate: false });
                if (layoutCount >= entitlements.layouts) {
                    return res.status(403).json(upgradePayload(
                        'layouts',
                        `Gói ${entitlements.label} chỉ lưu được ${entitlements.layouts} thiết kế menu.`,
                        entitlements
                    ));
                }
            }
            if (payload.createNew) {
                await GiftMenuLayout.updateMany(
                    { userId: req.userId, isTemplate: false },
                    { $set: { isActive: false } }
                );
            }
            layout = new GiftMenuLayout({
                userId: req.userId,
                name: payload.name || 'Menu mặc định',
                isActive: true
            });
        }
        const layoutUpdate = {
            name: payload.name || layout.name || 'Menu mặc định',
            version: Number(payload.version) || 2,
            savedAt: payload.savedAt ? new Date(payload.savedAt) : new Date(),
            aspectRatio: payload.aspectRatio || '9:16',
            canvasSize: payload.canvasSize || undefined,
            safeArea: payload.safeArea || undefined,
            exportSize: payload.exportSize || undefined,
            items: Array.isArray(payload.items) ? payload.items : [],
            exportedItems: Array.isArray(payload.exportedItems) ? payload.exportedItems : []
        };
        if (layout.isNew) {
            Object.assign(layout, layoutUpdate);
            await layout.save();
        } else {
            layout = await GiftMenuLayout.findOneAndUpdate(
                { _id: layout._id, userId: req.userId },
                { $set: layoutUpdate },
                { new: true, runValidators: true }
            );
            if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        }
        // Keep the mapped wheel record in sync with normal Designer saves.
        // Previously only the dedicated "Lưu cấu hình vòng quay" button
        // updated ChallengeWheel, so a user could edit the segment labels,
        // press the regular Save button, and still test the old published
        // segments from Gift Mapping.
        const wheelItemsToSync = (layout.items || []).filter((entry) => entry?.type === 'challenge-wheel');
        let layoutWheelLinksChanged = false;
        for (const item of wheelItemsToSync) {
            let wheelId = item.challengeWheelId || item.wheelId;
            if (!isValidResourceId(wheelId) && layout.parentTemplateId) {
                const linkedWheel = await ChallengeWheel.findOne({
                    userId: req.userId,
                    sourceTemplateId: layout.parentTemplateId,
                    isActive: true
                }).select('_id').lean();
                wheelId = linkedWheel?._id;
            }
            if (!isValidResourceId(wheelId) || !Array.isArray(item.segments) || item.segments.length < 2) continue;
            const exportedItem = (layout.exportedItems || []).find((entry) =>
                entry?.type === 'challenge-wheel' && String(entry.id || '') === String(item.id || '')
            ) || item;
            const updatedWheel = await ChallengeWheel.findOneAndUpdate(
                { _id: wheelId, userId: req.userId },
                {
                    $set: {
                        title: String(item.title || '').trim() || undefined,
                        segments: item.segments,
                        durationMs: Math.min(30000, Math.max(1500, Number(item.durationMs) || 6500)),
                        autoHideMs: Math.min(60000, Math.max(0, Number(item.autoHideMs) || 7000)),
                        presentation: buildChallengeWheelPresentation(item, exportedItem)
                    }
                },
                { new: true }
            );
            if (!updatedWheel) continue;
            const linkedWheelId = String(updatedWheel._id);
            item.challengeWheelId = linkedWheelId;
            if (exportedItem && exportedItem !== item) exportedItem.challengeWheelId = linkedWheelId;
            layoutWheelLinksChanged = true;
        }
        if (layoutWheelLinksChanged) {
            layout.markModified('items');
            layout.markModified('exportedItems');
            await layout.save();
        }

        // Drafts are preview-only. Never leak a Free user's trial design into
        // an already-running OBS/Goal Board overlay before Export to OBS.
        if (payload.draftOnly !== true) {
            const goalBoardLayoutPath = dataPaths.goalBoardLayoutPath;
            const goalBoardLayout = {
                version: layout.version || 2,
                savedAt: layout.savedAt || new Date().toISOString(),
                aspectRatio: layout.aspectRatio || '9:16',
                canvas: layout.canvasSize ? { width: layout.canvasSize.width, height: layout.canvasSize.height } : { width: 1080, height: 1920 },
                layers: layout.items || []
            };
            try {
                fs.writeFileSync(goalBoardLayoutPath, JSON.stringify(goalBoardLayout, null, 2), 'utf8');
                if (layout.isActive) {
                    fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
                }
            } catch (err) {
                console.error('Failed to sync goal board/gift menu layout file:', err);
            }
            tiktokService.setGoalBoardLayout(goalBoardLayout);

            if (req.app.locals.broadcastToClients) {
                req.app.locals.broadcastToClients('goal_board_layout_update', {
                    type: 'goal_board_layout_update',
                    layout: goalBoardLayout
                });
            }
        }

        const exportNotice = designerViolation && payload.draftOnly === true
            ? {
                upgradeRequired: true,
                feature: designerViolation.feature,
                recommendedPlan: designerViolation.recommendedPlan,
                message: designerViolation.message
            }
            : null;
        res.json({ success: true, layout, exportNotice });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/create', authMiddleware, planQuotaLock('layouts'), async (req, res) => {
    try {
        const { name } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        const entitlements = getEntitlements(user);
        if (Number.isFinite(entitlements.layouts)) {
            const layoutCount = await GiftMenuLayout.countDocuments({ userId: req.userId, isTemplate: false });
            if (layoutCount >= entitlements.layouts) {
                return res.status(403).json(upgradePayload(
                    'layouts',
                    `Gói ${entitlements.label} chỉ lưu được ${entitlements.layouts} thiết kế menu.`,
                    entitlements
                ));
            }
        }
        await GiftMenuLayout.updateMany({ userId: req.userId, isTemplate: false }, { isActive: false });
        const layout = new GiftMenuLayout({
            userId: req.userId,
            name: name || 'Thiết kế mới',
            aspectRatio: '9:16',
            items: [],
            exportedItems: [],
            isActive: true
        });
        await layout.save();
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/gift-menu-layout/:layoutId/activate', authMiddleware, async (req, res) => {
    try {
        const { layoutId } = req.params;
        if (!isValidResourceId(layoutId)) {
            return res.status(400).json({ success: false, error: 'Invalid layout ID' });
        }
        const ownedLayout = await GiftMenuLayout.findOne(ownedResourceFilter(
            layoutId,
            req.userId,
            { isTemplate: false }
        ));
        if (!ownedLayout) return res.status(404).json({ success: false, error: 'Layout not found' });
        await GiftMenuLayout.updateMany({ userId: req.userId, isTemplate: false }, { isActive: false });
        ownedLayout.isActive = true;
        const layout = await ownedLayout.save();
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/gift-menu-layout/:layoutId', authMiddleware, async (req, res) => {
    try {
        const { layoutId } = req.params;
        if (!isValidResourceId(layoutId)) {
            return res.status(400).json({ success: false, error: 'Invalid layout ID' });
        }
        const layout = await GiftMenuLayout.findOneAndDelete(ownedResourceFilter(
            layoutId,
            req.userId,
            { isTemplate: false }
        ));
        if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        if (layout.isActive) {
            const nextLayout = await GiftMenuLayout.findOne({ userId: req.userId, isTemplate: false });
            if (nextLayout) {
                nextLayout.isActive = true;
                await nextLayout.save();
            }
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/publish', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const isAdmin = Boolean(user && user.isAdmin === true);
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const payload = req.body || {};
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        const cloudPublish = await fetchCloudTemplateJson(
            '/api/tiktok/gift-menu-layout/publish',
            bearerToken,
            { method: 'POST', body: payload }
        ).catch((error) => {
            // A packaged Desktop build must not claim a marketplace publish
            // succeeded when the commercial/cloud write failed.  Local-only
            // development keeps its explicit fallback for offline work.
            if (process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true') throw error;
            console.warn('[publish] Cloud template publish unavailable; using local development fallback:', error.message);
            return null;
        });
        if (cloudPublish) {
            if (cloudPublish.template) {
                await mirrorCloudTemplates([cloudPublish.template]);
            }
            return res.json(cloudPublish);
        }
        const activeLayout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false });
        const sourceLayout = payload.layoutData && Array.isArray(payload.layoutData.items)
            ? payload.layoutData
            : activeLayout;
        if (!sourceLayout) return res.status(400).json({ success: false, error: 'No layout to publish' });
        if (!Array.isArray(sourceLayout.items) || sourceLayout.items.length === 0) {
            return res.status(400).json({ success: false, error: 'Template must contain at least one layer' });
        }
        const price = Math.max(0, Number(payload.price) || 0);
        const originalPrice = Math.max(price, Number(payload.originalPrice) || 0);
        const requestedPlan = String(payload.requiredPlan || 'free').toLowerCase();
        const requiredPlan = ['free', 'basic', 'pro'].includes(requestedPlan) ? requestedPlan : 'free';
        const templatePayload = {
            userId: req.userId,
            name: String(payload.name || `${sourceLayout.name || 'Layout'} - Template`).trim(),
            version: sourceLayout.version || 2,
            savedAt: new Date(),
            aspectRatio: sourceLayout.aspectRatio || '9:16',
            canvasSize: sourceLayout.canvasSize,
            safeArea: sourceLayout.safeArea,
            exportSize: sourceLayout.exportSize,
            items: sourceLayout.items,
            exportedItems: Array.isArray(sourceLayout.exportedItems) && sourceLayout.exportedItems.length
                ? sourceLayout.exportedItems
                : sourceLayout.items,
            isActive: true,
            isTemplate: true,
            productType: sourceLayout.items.some((item) => item && item.type === 'challenge-wheel') ? 'challenge-wheel' : 'standard',
            category: String(payload.category || sourceLayout.category || 'all'),
            price,
            originalPrice,
            description: String(payload.description || '').trim(),
            icon: String(payload.icon || '📋').trim() || '📋',
            isPremium: price > 0,
            requiredPlan,
            editableSchema: Array.isArray(payload.editableSchema) ? payload.editableSchema : []
        };
        let template = null;
        if (payload.templateId && isValidResourceId(payload.templateId)) {
            template = await GiftMenuLayout.findOne({
                _id: payload.templateId,
                userId: req.userId,
                isTemplate: true,
                category: 'goal_board'
            });
        }
        if (template) {
            Object.assign(template, templatePayload);
        } else {
            template = new GiftMenuLayout(templatePayload);
        }
        await template.save();

        // Automatically sync to Effect product
        const existingEffect = await Effect.findOne({ category: 'menu_template', fileUrl: template._id.toString() });

        if (!existingEffect) {
            const newEffect = new Effect({
                name: template.name,
                category: 'menu_template',
                price: template.price,
                originalPrice: template.originalPrice,
                description: template.description || 'Mẫu thiết kế menu quà tặng chuyên nghiệp.',
                icon: template.icon || '📋',
                fileUrl: template._id.toString(),
                previewUrl: '',
                thumbUrl: '',
                duration: 5,
                isActive: true
            });
            await newEffect.save();
        } else {
            existingEffect.name = template.name;
            existingEffect.price = template.price;
            existingEffect.originalPrice = template.originalPrice;
            existingEffect.description = template.description || existingEffect.description;
            existingEffect.icon = template.icon || existingEffect.icon;
            existingEffect.fileUrl = template._id.toString();
            await existingEffect.save();
        }

        res.json({ success: true, template });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-templates/:templateId/use', authMiddleware, planQuotaLock('layouts'), async (req, res) => {
    try {
        if (!isValidResourceId(req.params.templateId)) {
            return res.status(400).json({ success: false, error: 'Invalid template ID' });
        }
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        await syncCloudTemplate(req.params.templateId, bearerToken).catch((error) => {
            console.warn('[templates] Cloud template refresh failed; using local cache:', error.message);
        });
        const template = await GiftMenuLayout.findOne({ _id: req.params.templateId, isTemplate: true });
        if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const price = Number(template.price) || 0;
        let hasPurchased = false;
        let correspondingEffect = await Effect.findOne({ category: 'menu_template', fileUrl: template._id.toString() });
        if (!correspondingEffect) {
            const cloudEffectData = await fetchCloudTemplateJson(
                `/api/tiktok/gift-menu-templates/${encodeURIComponent(template._id)}/effect`,
                bearerToken
            ).catch(() => null);
            correspondingEffect = cloudEffectData?.effect || null;
        }
        const isAdmin = user.isAdmin === true;
        const hasLegacyBundledProducts = user.subscription === 'business';
        if (isAdmin || hasLegacyBundledProducts) {
            hasPurchased = true;
        } else {
            hasPurchased = correspondingEffect ? user.purchasedEffects.some(pe => pe.effectId?.toString() === correspondingEffect._id.toString()) : false;
        }

        // A 0đ Store product is still acquired through cart/checkout. Price
        // controls payment amount, never ownership. Built-in templates with
        // no corresponding Store product remain available as before.
        if (correspondingEffect && !hasPurchased) {
            return res.status(403).json({
                success: false,
                purchaseRequired: true,
                error: 'Bạn cần mua mẫu menu này trước khi sử dụng.'
            });
        }

        const entitlements = getEntitlements(user);
        if (entitlements.designerLevel === 'lite' && String(template.category || '').toLowerCase() !== 'basic') {
            if (!hasPurchased) {
                return res.status(403).json(upgradePayload(
                    'templates',
                    'Nâng cấp Basic để sử dụng nhiều mẫu menu chuyên nghiệp.',
                    entitlements
                ));
            }
        }

        const templateLayoutFilter = {
            userId: req.userId,
            isTemplate: false,
            parentTemplateId: template._id
        };
        let linkedLayout = await GiftMenuLayout.findOne(templateLayoutFilter).sort({ isActive: -1, updatedAt: -1 });

        if (!linkedLayout && Number.isFinite(entitlements.layouts)) {
            const layoutCount = await GiftMenuLayout.countDocuments({ userId: req.userId, isTemplate: false });
            if (layoutCount >= entitlements.layouts) {
                return res.status(403).json(upgradePayload(
                    'layouts',
                    `Gói ${entitlements.label} chỉ lưu được ${entitlements.layouts} thiết kế menu.`,
                    entitlements
                ));
            }
        }

        // Atomic upsert makes repeated clicks idempotent for this user/template pair.
        const activeLayout = await GiftMenuLayout.findOneAndUpdate(
            templateLayoutFilter,
            {
                $set: { isActive: true },
                $setOnInsert: {
                    userId: req.userId,
                    name: template.name,
                    version: template.version || 2,
                    savedAt: new Date(),
                    aspectRatio: template.aspectRatio,
                    canvasSize: template.canvasSize,
                    safeArea: template.safeArea,
                    exportSize: template.exportSize,
                    items: template.items,
                    exportedItems: template.exportedItems,
                    isTemplate: false,
                    parentTemplateId: template._id
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, sort: { updatedAt: -1 } }
        );
        await GiftMenuLayout.updateMany(
            { userId: req.userId, isTemplate: false, _id: { $ne: activeLayout._id } },
            { $set: { isActive: false } }
        );
        let challengeWheel = null;
        if (template.productType === 'challenge-wheel') {
            const wheelItem = (activeLayout.items || []).find((item) => item && item.type === 'challenge-wheel');
            if (wheelItem) {
                const exportedWheelItem = (activeLayout.exportedItems || []).find((item) =>
                    item?.type === 'challenge-wheel' && String(item.id || '') === String(wheelItem.id || '')
                ) || wheelItem;
                challengeWheel = await ChallengeWheel.findOne({
                    userId: req.userId,
                    sourceTemplateId: template._id
                });
                if (!challengeWheel) {
                    challengeWheel = await ChallengeWheel.create({
                        userId: req.userId,
                        sourceTemplateId: template._id,
                        name: template.name,
                        title: wheelItem.title || 'VÒNG QUAY THỬ THÁCH',
                        segments: wheelItem.segments || [],
                        durationMs: wheelItem.durationMs || 6500,
                        autoHideMs: wheelItem.autoHideMs || 7000,
                        presentation: buildChallengeWheelPresentation(wheelItem, exportedWheelItem),
                        isActive: true
                    });
                }
                const challengeWheelId = String(challengeWheel._id);
                const attachWheelId = (entry) => entry?.type === 'challenge-wheel'
                    ? { ...entry, challengeWheelId }
                    : entry;
                activeLayout.items = (activeLayout.items || []).map(attachWheelId);
                activeLayout.exportedItems = (activeLayout.exportedItems || []).map(attachWheelId);
                activeLayout.markModified('items');
                activeLayout.markModified('exportedItems');
                await activeLayout.save();
            }
        }
        return res.json({ success: true, layout: activeLayout, challengeWheel, reused: Boolean(linkedLayout) });

        const existingLayout = await GiftMenuLayout.findOne({
            userId: req.userId,
            isTemplate: false,
            $or: [
                { parentTemplateId: template._id },
                { parentTemplateId: { $exists: false }, name: template.name },
                { parentTemplateId: null, name: template.name }
            ]
        }).sort({ isActive: -1, updatedAt: -1 });
        if (existingLayout) {
            await GiftMenuLayout.updateMany(
                { userId: req.userId, isTemplate: false, _id: { $ne: existingLayout._id } },
                { $set: { isActive: false } }
            );
            const activeLayout = await GiftMenuLayout.findOneAndUpdate(
                { _id: existingLayout._id, userId: req.userId },
                { $set: { isActive: true, parentTemplateId: template._id } },
                { new: true }
            );
            return res.json({ success: true, layout: activeLayout, reused: true });
        }

        if (Number.isFinite(entitlements.layouts)) {
            const layoutCount = await GiftMenuLayout.countDocuments({ userId: req.userId, isTemplate: false });
            if (layoutCount >= entitlements.layouts) {
                return res.status(403).json(upgradePayload(
                    'layouts',
                    `Gói ${entitlements.label} chỉ lưu được ${entitlements.layouts} thiết kế menu.`,
                    entitlements
                ));
            }
        }

        await GiftMenuLayout.updateMany({ userId: req.userId, isTemplate: false }, { isActive: false });
        const layout = new GiftMenuLayout({
            userId: req.userId,
            name: template.name,
            version: template.version || 2,
            savedAt: new Date(),
            aspectRatio: template.aspectRatio,
            canvasSize: template.canvasSize,
            safeArea: template.safeArea,
            exportSize: template.exportSize,
            items: template.items,
            exportedItems: template.exportedItems,
            isActive: true,
            isTemplate: false,
            parentTemplateId: template._id
        });
        await layout.save();
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-templates/:templateId/effect', optionalAuthMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.templateId)) {
            return res.status(400).json({ success: false, error: 'Invalid template ID' });
        }
        const effect = await Effect.findOne({ category: 'menu_template', fileUrl: req.params.templateId });
        if (!effect) return res.status(404).json({ success: false, error: 'Effect product not found' });
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Fetch one published template for previews. Keep this route after the
// `/effect` route so the literal `effect` segment is not treated as an ID.
router.get('/gift-menu-templates/:templateId', optionalAuthMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.templateId)) {
            return res.status(400).json({ success: false, error: 'Invalid template ID' });
        }
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        await syncCloudTemplate(req.params.templateId, bearerToken).catch(() => null);
        const template = await GiftMenuLayout.findOne({ _id: req.params.templateId, isTemplate: true }).lean();
        if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
        res.json({ success: true, template });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/goal-board/layout', async (_req, res) => {
    try {
        const layout = await tiktokService.getGoalBoardLayout();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ success: true, layout });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


router.get('/goal-board/assets', authMiddleware, async (req, res) => {
    try {
        const userId = String(req.userId);
        const userDir = path.join(goalAssetDir, userId);
        const sharedFrameDir = path.join(goalAssetDir, '_shared-frames');
        fs.mkdirSync(userDir, { recursive: true });
        fs.mkdirSync(sharedFrameDir, { recursive: true });
        const readAssets = (dir, urlPrefix, scope) => fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => ({
                name: entry.name.replace(/^\d+-\d+-/, ''),
                url: `${urlPrefix}/${entry.name}`,
                type: path.extname(entry.name).toLowerCase() === '.webm' ? 'video' : 'image',
                scope
            }));
        const assets = fs.readdirSync(userDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => ({
                name: entry.name.replace(/^\d+-\d+-/, ''),
                url: `/uploads/goal-assets/${userId}/${entry.name}`,
                type: path.extname(entry.name).toLowerCase() === '.webm' ? 'video' : 'image'
            }));
        const adminUsers = await User.find({
            isAdmin: true
        }).select('_id');
        const legacyAdminFrames = adminUsers.flatMap(admin => {
            const adminId = String(admin._id);
            const adminDir = path.join(goalAssetDir, adminId);
            if (!fs.existsSync(adminDir)) return [];
            return readAssets(adminDir, `/uploads/goal-assets/${adminId}`, 'shared')
                .filter(asset => /vien/i.test(asset.name));
        });
        let framePresets = [
            ...readAssets(sharedFrameDir, '/uploads/goal-assets/_shared-frames', 'shared').filter(asset => /vien/i.test(asset.name)),
            ...legacyAdminFrames
        ].filter((asset, index, list) => list.findIndex(other => other.url === asset.url) === index);
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        const cloudAssets = await fetchCloudTemplateJson('/api/tiktok/goal-board/assets', bearerToken).catch(() => null);
        if (cloudAssets) {
            const cloudFrames = (cloudAssets.framePresets || []).map((asset) => ({
                ...asset,
                url: resolveCloudAssetUrl(asset.url),
                scope: 'shared'
            }));
            framePresets = [...cloudFrames, ...framePresets]
                .filter((asset, index, list) => list.findIndex(other => other.url === asset.url) === index);
        }
        res.json({ success: true, assets, framePresets });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/goal-board/templates', authMiddleware, async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        const cloudTemplates = await fetchCloudTemplateJson('/api/tiktok/goal-board/templates', bearerToken).catch((error) => {
            console.warn('[goal-templates] Cloud catalog unavailable; using local cache:', error.message);
            return null;
        });
        if (cloudTemplates && Array.isArray(cloudTemplates.customTemplates)) {
            return res.json({ success: true, customTemplates: cloudTemplates.customTemplates });
        }
        const [user, templates] = await Promise.all([
            User.findById(req.userId).select('isAdmin subscription subscriptionExpiresAt purchasedEffects'),
            GiftMenuLayout.find({ isTemplate: true, category: 'goal_board' }).sort({ updatedAt: -1 }).lean()
        ]);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const templateIds = templates.map(template => String(template._id));
        const products = templateIds.length
            ? await Effect.find({ category: 'menu_template', fileUrl: { $in: templateIds } }).select('_id fileUrl').lean()
            : [];
        const productByTemplate = new Map(products.map(product => [String(product.fileUrl), product]));
        const purchasedIds = new Set((user.purchasedEffects || []).map(entry => String(entry.effectId || '')));
        // Paid subscription tiers still need to own paid Store products.
        // Only admins and historical `business` accounts retain the old bundle.
        const privileged = user.isAdmin === true || user.subscription === 'business';

        // Buyer counts are only needed by admins, to warn before a delete revokes access.
        let purchaseCountByProduct = new Map();
        if (user.isAdmin === true && products.length) {
            const productIds = products.map(product => product._id);
            const counts = await User.aggregate([
                { $unwind: '$purchasedEffects' },
                { $match: { 'purchasedEffects.effectId': { $in: productIds } } },
                { $group: { _id: '$purchasedEffects.effectId', count: { $sum: 1 } } }
            ]);
            purchaseCountByProduct = new Map(counts.map(entry => [String(entry._id), entry.count]));
        }

        const customTemplates = templates.map(template => {
            const templateId = String(template._id);
            const product = productByTemplate.get(templateId);
            const price = Math.max(0, Number(template.price) || 0);
            return {
                id: `server_goal_${templateId}`,
                serverTemplateId: templateId,
                productEffectId: product ? String(product._id) : '',
                name: template.name,
                tag: 'Mẫu bán',
                category: 'goal_board',
                tags: ['goal-board', 'custom'],
                icon: template.icon || '🎯',
                description: template.description || '',
                isPremium: price > 0,
                price,
                originalPrice: Math.max(price, Number(template.originalPrice) || 0),
                requiredPlan: template.requiredPlan || 'free',
                editableSchema: Array.isArray(template.editableSchema) ? template.editableSchema : [],
                // A 0đ Store product still requires cart/checkout ownership.
                // Only built-in templates without a Store product are free to use directly.
                owned: privileged || !product || purchasedIds.has(String(product._id)),
                purchaseCount: product ? (purchaseCountByProduct.get(String(product._id)) || 0) : 0,
                layers: Array.isArray(template.items) ? template.items : []
            };
        });
        res.json({ success: true, customTemplates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/goal-board/templates/:templateId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('isAdmin');
        if (!user || user.isAdmin !== true) {
            return res.status(403).json({ success: false, error: 'Chỉ quản trị viên được xóa mẫu đã đóng gói.' });
        }
        if (!isValidResourceId(req.params.templateId)) {
            return res.status(400).json({ success: false, error: 'Mã mẫu không hợp lệ.' });
        }
        const bearerToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
        const cloudDelete = await fetchCloudTemplateJson(
            `/api/tiktok/goal-board/templates/${encodeURIComponent(req.params.templateId)}`,
            bearerToken,
            { method: 'DELETE' }
        ).catch((error) => {
            if (process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true') throw error;
            return null;
        });
        if (cloudDelete) {
            await GiftMenuLayout.deleteOne({ _id: req.params.templateId, isTemplate: true });
            return res.json(cloudDelete);
        }
        const template = await GiftMenuLayout.findOneAndDelete({
            _id: req.params.templateId,
            userId: req.userId,
            isTemplate: true,
            category: 'goal_board'
        });
        if (!template) return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu để xóa.' });

        const product = await Effect.findOneAndDelete({
            category: 'menu_template',
            fileUrl: String(template._id)
        });
        if (product) {
            await User.updateMany(
                { 'purchasedEffects.effectId': product._id },
                { $pull: { purchasedEffects: { effectId: product._id } } }
            );
        }
        res.json({ success: true, templateId: String(template._id), productDeleted: Boolean(product) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/goal-board/upload-asset', authMiddleware, goalAssetUpload.single('assetFile'), async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const entitlements = getEntitlements(user);
        const isFrameUpload = String(req.body?.assetKind || '') === 'avatar-frame';
        const canUploadFrames = ['advanced', 'studio'].includes(entitlements.designerLevel);
        if (isFrameUpload && !canUploadFrames) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(403).json(upgradePayload(
                'avatarFrames',
                'Nâng cấp Pro để tải khung viền avatar riêng.',
                entitlements
            ));
        }
        const userDir = path.join(goalAssetDir, String(req.userId));
        const assetCount = fs.existsSync(userDir)
            ? fs.readdirSync(userDir, { withFileTypes: true }).filter(entry => entry.isFile()).length
            : 0;
        const allowedAssets = entitlements.menuAssets;
        // Multer has already written the current upload into userDir, so the
        // count includes this request's file. Allow exactly the advertised
        // limit and reject only when the newly written file exceeds it.
        if (Number.isFinite(allowedAssets) && assetCount > allowedAssets) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(403).json(upgradePayload(
                'menuAssets',
                entitlements.menuAssets === 0
                    ? 'Gói Free chưa hỗ trợ tải tài nguyên riêng. Nâng cấp Basic để tải và sử dụng ảnh/video trong menu.'
                    : `Bạn đã dùng hết ${entitlements.menuAssets} tài nguyên menu của gói ${entitlements.label}.`,
                entitlements
            ));
        }
        if (!req.file) return res.status(400).json({ success: false, error: 'Missing asset file' });
        const ext = path.extname(req.file.filename).toLowerCase();
        const detectedExt = detectGoalAssetType(req.file.path);
        if (!detectedExt || detectedExt !== ext) {
            try { fs.unlinkSync(req.file.path); } catch (_e) { }
            return res.status(400).json({ success: false, error: 'File không đúng định dạng PNG, GIF hoặc WebM' });
        }
        const optimization = await optimizeGoalAsset(req.file.path, ext);
        const maxFinalSize = { '.png': 8 * 1024 * 1024, '.gif': 12 * 1024 * 1024, '.webm': 20 * 1024 * 1024 }[ext];
        if (optimization.finalSize > maxFinalSize) {
            try { fs.unlinkSync(req.file.path); } catch (_e) { }
            return res.status(413).json({ success: false, error: 'File vẫn quá nặng sau tối ưu. Vui lòng giảm độ phân giải hoặc thời lượng.' });
        }
        let publicUrl = `/uploads/goal-assets/${req.userId}/${req.file.filename}`;
        if (isFrameUpload && user.isAdmin === true) {
            const sharedFrameDir = path.join(goalAssetDir, '_shared-frames');
            fs.mkdirSync(sharedFrameDir, { recursive: true });
            const sharedPath = path.join(sharedFrameDir, req.file.filename);
            fs.renameSync(req.file.path, sharedPath);
            req.file.path = sharedPath;
            publicUrl = `/uploads/goal-assets/_shared-frames/${req.file.filename}`;
        }
        res.json({
            success: true,
            asset: {
                name: req.file.originalname,
                url: publicUrl,
                type: ext === '.webm' ? 'video' : 'image',
                format: ext.slice(1),
                optimized: optimization.optimized,
                originalSize: optimization.originalSize,
                size: optimization.finalSize
            }
        });
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_e) { }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError || error?.message?.startsWith('Chỉ hỗ trợ ')) {
        return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
});

module.exports = router;





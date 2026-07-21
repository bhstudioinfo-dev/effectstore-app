const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const tiktokService = require('../services/tiktokService');
const GiftMapping = require('../models/GiftMapping');
const ChallengeWheel = require('../models/ChallengeWheel');
const GiftLog = require('../models/GiftLog');
const GiftConfig = require('../models/GiftConfig');
const Effect = require('../models/Effect');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const multer = require('multer');
const { spawn } = require('child_process');
const { getEntitlements, upgradePayload, validateDesignerItems } = require('../config/planEntitlements');
const {
    getUserAvailableEffects,
    resolveEffectForUser,
    resolveEffectDurationForUser
} = require('../services/effectLibraryService');
const effectQueue = require('../services/effectQueue');
const playbackManager = require('../services/playbackManager');
const obsService = require('../services/obsService');
const { issueEffectAccessToken } = require('../services/effectAccessToken');
const { isValidResourceId, ownedResourceFilter } = require('../utils/accessControl');
const { paths: dataPaths } = require('../config/dataPaths');
let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
try { ffmpegPath = require('ffmpeg-static') || ffmpegPath; } catch (_e) {}
const giftMenuLayoutPath = dataPaths.giftMenuLayoutPath;
const goalAssetDir = dataPaths.goalAssetsDir;
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
            try { child.kill(); } catch (_e) {}
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
    const { isTest } = req.body;
    const result = tiktokService.consumeTts(req.userId, isTest);
    res.status(result.status).json(result.payload);
});

// Stats
router.get('/stats', (req, res) => {
    res.json({ success: true, stats: tiktokService.liveStats });
});

// Mappings
router.get('/mappings', authMiddleware, async (req, res) => {
    try {
        const mappings = await GiftMapping.find({ userId: req.userId });
        res.json({ success: true, mappings });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Available effects for the canonical Gift Mapping picker
router.get('/available-effects', authMiddleware, async (req, res) => {
    try {
        const effects = await getUserAvailableEffects(req.userId);
        res.json({ success: true, effects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/challenge-wheels', authMiddleware, async (req, res) => {
    try {
        const wheels = await ChallengeWheel.find({ userId: req.userId }).sort({ updatedAt: -1 }).lean();
        res.json({ success: true, wheels });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/challenge-wheels', authMiddleware, async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const rawSegments = Array.isArray(req.body.segments) ? req.body.segments : [];
        const segments = rawSegments.map((segment, index) => ({
            id: String(segment.id || `challenge-${Date.now()}-${index}`),
            label: String(segment.label || '').trim(),
            color: String(segment.color || '#8b5cf6'),
            weight: Math.max(0, Number(segment.weight) || 1)
        })).filter((segment) => segment.label).slice(0, 32);
        if (!name || segments.length < 2) return res.status(400).json({ success: false, error: 'Vòng quay cần tên và ít nhất 2 thử thách.' });
        const wheel = await ChallengeWheel.create({
            userId: req.userId,
            name,
            title: String(req.body.title || 'VÒNG QUAY THỬ THÁCH').trim(),
            segments,
            durationMs: Math.min(30000, Math.max(1500, Number(req.body.durationMs) || 6500)),
            autoHideMs: Math.min(60000, Math.max(0, Number(req.body.autoHideMs) || 7000)),
            noRepeat: Boolean(req.body.noRepeat)
        });
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
            color: String(segment.color || '#8b5cf6'), weight: Math.max(0, Number(segment.weight) || 1)
        })).filter((segment) => segment.label).slice(0, 32);
        if (req.body.durationMs !== undefined) wheel.durationMs = Math.min(30000, Math.max(1500, Number(req.body.durationMs) || 6500));
        if (req.body.autoHideMs !== undefined) wheel.autoHideMs = Math.min(60000, Math.max(0, Number(req.body.autoHideMs) || 7000));
        if (req.body.noRepeat !== undefined) wheel.noRepeat = Boolean(req.body.noRepeat);
        await wheel.save();
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
        req.app.locals.broadcastToClients?.('challenge_wheel_spin', {
            wheelId: String(wheel._id), title: wheel.title, segments: wheel.segments,
            resultId: result.id, resultLabel: result.label, durationMs: wheel.durationMs,
            autoHideMs: wheel.autoHideMs, giftId: 'test', giftName: 'Quà thử nghiệm',
            nickname: 'Khán giả thử nghiệm', triggeredAt: Date.now(), simulated: true
        });
        res.json({ success: true, result });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/map-gift', authMiddleware, async (req, res) => {
    try {
        const { id, giftId, effectId, effectName, giftName, giftIcon, effects, playbackMode, minQuantity, maxQuantity, exactQuantity, cooldown, cooldownAction, triggerType, wheelId } = req.body;
        const userId = req.userId;
        if (id && !isValidResourceId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid mapping ID' });
        }
        const normalizedTriggerType = ['wheel', 'effect_and_wheel'].includes(triggerType) ? triggerType : 'effect';
        if (!String(giftId || '').trim() || (normalizedTriggerType === 'effect' && !String(effectId || '').trim())) {
            return res.status(400).json({ success: false, error: 'giftId và hành động mapping là bắt buộc' });
        }

        const user = await User.findById(userId);
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

        const effectId = String(mapping.effectId || '');
        const resolvedEffect = await resolveEffectForUser(req.userId, effectId);
        if (!resolvedEffect) {
            return res.status(403).json({ success: false, message: 'Hiệu ứng không thuộc tài khoản này hoặc không còn khả dụng.' });
        }

        const duration = await resolveEffectDurationForUser(req.userId, effectId);
        if (!duration) {
            return res.status(422).json({
                success: false,
                warning: 'Effect is missing duration metadata and was skipped.',
                message: 'Hiệu ứng chưa có thời lượng hợp lệ. App đã bỏ qua để tránh treo queue.'
            });
        }

        if (!obsService.isConnected()) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối.' });
        }
        await obsService.ensureEffectPlayerSource();
        const sourceStatus = await obsService.getFoundationSourceStatus();
        if (!sourceStatus.effect_player || !await waitForEffectPlayerReady(req)) {
            return res.status(503).json({ success: false, message: 'Nguồn effect_player chưa sẵn sàng trên OBS.' });
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
        const resolvedEffect = await resolveEffectForUser(req.userId, effectId);
        if (!resolvedEffect) {
            return res.status(403).json({ success: false, message: 'Hiệu ứng không thuộc tài khoản này hoặc không còn khả dụng.', triggered: false });
        }

        const duration = await resolveEffectDurationForUser(req.userId, effectId);
        if (!duration) {
            return res.status(422).json({
                success: false,
                triggered: false,
                warning: 'Effect is missing duration metadata and was skipped.',
                message: 'Hiệu ứng chưa có thời lượng hợp lệ. App đã bỏ qua để tránh treo queue.'
            });
        }
        if (!obsService.isConnected()) {
            return res.status(503).json({ success: false, triggered: false, message: 'OBS chưa kết nối.' });
        }
        await obsService.ensureEffectPlayerSource();
        const sourceStatus = await obsService.getFoundationSourceStatus();
        if (!sourceStatus.effect_player || !await waitForEffectPlayerReady(req)) {
            return res.status(503).json({ success: false, triggered: false, message: 'Nguồn effect_player chưa sẵn sàng trên OBS.' });
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
        const fileGifts = fs.existsSync(giftIconDir)
            ? fs.readdirSync(giftIconDir)
                .filter((file) => /\.(png|jpg|jpeg|webp|gif)$/i.test(file))
                .map((file) => {
                    const name = path.basename(file, path.extname(file)).replace(/\s*\(\d+\)$/g, '').replace(/_/g, ' ');
                    const id = path.basename(file, path.extname(file)).toLowerCase().replace(/\s*\(\d+\)$/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                    return { id, name, icon: `/assets/gift-icons/${file}`, coins: 1 };
                })
            : [];

        const configs = await GiftConfig.find();
        const coinsMap = {};
        configs.forEach(c => coinsMap[c.giftId] = c.coins);

        const mergedById = new Map();
        defaultGifts.forEach((gift) => {
            mergedById.set(gift.id, gift);
        });

        fileGifts.forEach((gift) => {
            const fileIconBase = path.basename(gift.icon).toLowerCase().replace(/\s*\(\d+\)/g, '');
            const exists = Array.from(mergedById.values()).some(existing => {
                const existingBase = path.basename(existing.icon).toLowerCase().replace(/\s*\(\d+\)/g, '');
                return existingBase === fileIconBase;
            });
            if (!exists) {
                mergedById.set(gift.id, gift);
            }
        });

        const gifts = [...mergedById.values()].map(g => ({
            ...g,
            coins: coinsMap[g.id] || g.coins
        }));

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

router.get('/gift-menu-templates', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const ownedEffectIds = user ? user.purchasedEffects.map(pe => pe.effectId?.toString()).filter(Boolean) : [];
        const isAdmin = user ? user.isAdmin === true : false;
        const isBusiness = user ? user.subscription === 'business' : false;

        const [templates, userLayouts] = await Promise.all([
            GiftMenuLayout.find({ isTemplate: true }).sort({ updatedAt: -1 }).lean(),
            GiftMenuLayout.find({ userId: req.userId, isTemplate: false }).select('_id name parentTemplateId').lean()
        ]);
        const usedTemplateIds = new Set(userLayouts.filter(layout => layout.parentTemplateId).map(layout => String(layout.parentTemplateId)));
        const usedTemplateNames = new Set(userLayouts.map(layout => String(layout.name || '').trim().toLowerCase()));

        const templateEffectByLayoutId = new Map();
        if (!isAdmin && !isBusiness && templates.length) {
            const templateEffects = await Effect.find({
                category: 'menu_template',
                fileUrl: { $in: templates.map((template) => String(template._id)) }
            }).select('_id fileUrl').lean();
            templateEffects.forEach((effect) => templateEffectByLayoutId.set(String(effect.fileUrl), String(effect._id)));
        }

        const mappedTemplates = templates.map((t) => {
            const normalizedName = String(t.name || '').trim().toLowerCase();
            const usedLayout = userLayouts.find(layout =>
                String(layout.parentTemplateId || '') === String(t._id) ||
                String(layout.name || '').trim().toLowerCase() === normalizedName
            );
            const isUsed = usedTemplateIds.has(String(t._id)) || usedTemplateNames.has(normalizedName);
            if (isAdmin || isBusiness) {
                return { ...t, isPurchased: true, isUsed, usedLayoutId: usedLayout?._id || null };
            }
            const correspondingEffectId = templateEffectByLayoutId.get(String(t._id));
            const isPurchased = correspondingEffectId ? ownedEffectIds.includes(correspondingEffectId) : false;
            return { ...t, isPurchased, isUsed, usedLayoutId: usedLayout?._id || null };
        });

        res.json({ success: true, templates: mappedTemplates });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
        if (layout) {
            fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        }
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout', authMiddleware, async (req, res) => {
    try {
        const payload = req.body || {};
        const requestedLayoutId = payload.id || payload._id;
        if (requestedLayoutId && !isValidResourceId(requestedLayoutId)) {
            return res.status(400).json({ success: false, error: 'Invalid layout ID' });
        }
        const user = await User.findById(req.userId);
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
                fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(renamedLayout, null, 2), 'utf8');
                
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

        const designerViolation = validateDesignerItems(payload.items, entitlements) ||
            validateDesignerItems(payload.exportedItems, entitlements);
        if (designerViolation) return res.status(403).json(designerViolation);
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
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');

        // Sync with Goal Board layout
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
        } catch (err) {
            console.error('Failed to sync goal board layout file:', err);
        }
        tiktokService.setGoalBoardLayout(goalBoardLayout);

        // Broadcast layout update to Goal Board overlays
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients('goal_board_layout_update', {
                type: 'goal_board_layout_update',
                layout: goalBoardLayout
            });
        }

        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/create', authMiddleware, async (req, res) => {
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
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
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
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
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
                fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(nextLayout, null, 2), 'utf8');
            } else {
                if (fs.existsSync(giftMenuLayoutPath)) fs.unlinkSync(giftMenuLayoutPath);
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
        const activeLayout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false });
        if (!activeLayout) return res.status(400).json({ success: false, error: 'No active layout to publish' });
        const payload = req.body || {};
        const price = Math.max(0, Number(payload.price) || 0);
        const originalPrice = Math.max(price, Number(payload.originalPrice) || 0);
        const template = new GiftMenuLayout({
            userId: req.userId,
            name: String(payload.name || activeLayout.name + ' - Template').trim(),
            version: activeLayout.version || 2,
            savedAt: new Date(),
            aspectRatio: activeLayout.aspectRatio,
            canvasSize: activeLayout.canvasSize,
            safeArea: activeLayout.safeArea,
            exportSize: activeLayout.exportSize,
            items: activeLayout.items,
            exportedItems: activeLayout.exportedItems,
            isTemplate: true,
            category: String(payload.category || activeLayout.category || 'all'),
            price,
            originalPrice,
            description: String(payload.description || '').trim(),
            icon: String(payload.icon || '📋').trim() || '📋',
            isPremium: price > 0
        });
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

router.post('/gift-menu-templates/:templateId/use', authMiddleware, async (req, res) => {
    try {
        if (!isValidResourceId(req.params.templateId)) {
            return res.status(400).json({ success: false, error: 'Invalid template ID' });
        }
        const template = await GiftMenuLayout.findOne({ _id: req.params.templateId, isTemplate: true });
        if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        const price = Number(template.price) || 0;
        let hasPurchased = false;
        const correspondingEffect = await Effect.findOne({ category: 'menu_template', fileUrl: template._id.toString() });
        const isAdmin = user.isAdmin === true;
        const isBusiness = user.subscription === 'business';
        if (isAdmin || isBusiness) {
            hasPurchased = true;
        } else {
            hasPurchased = correspondingEffect ? user.purchasedEffects.some(pe => pe.effectId?.toString() === correspondingEffect._id.toString()) : false;
        }

        if (price > 0 && !hasPurchased) {
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

        // Link one legacy copy by name before attempting to create anything.
        if (!linkedLayout) {
            linkedLayout = await GiftMenuLayout.findOneAndUpdate(
                {
                    userId: req.userId,
                    isTemplate: false,
                    name: template.name,
                    $or: [
                        { parentTemplateId: { $exists: false } },
                        { parentTemplateId: null }
                    ]
                },
                { $set: { parentTemplateId: template._id } },
                { new: true, sort: { isActive: -1, updatedAt: -1 } }
            );
        }

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
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(activeLayout, null, 2), 'utf8');
        return res.json({ success: true, layout: activeLayout, reused: Boolean(linkedLayout) });

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
            fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(activeLayout, null, 2), 'utf8');
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
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-templates/:templateId/effect', authMiddleware, async (req, res) => {
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
        const framePresets = [
            ...readAssets(sharedFrameDir, '/uploads/goal-assets/_shared-frames', 'shared').filter(asset => /vien/i.test(asset.name)),
            ...legacyAdminFrames
        ].filter((asset, index, list) => list.findIndex(other => other.url === asset.url) === index);
        res.json({ success: true, assets, framePresets });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/goal-board/templates', authMiddleware, async (req, res) => {
    res.json({ success: true, customTemplates: [] });
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
        const allowedAssets = entitlements.menuAssets === 0 ? 5 : entitlements.menuAssets;
        if (Number.isFinite(allowedAssets) && assetCount >= allowedAssets) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(403).json(upgradePayload(
                'menuAssets',
                entitlements.menuAssets === 0
                    ? 'Bạn đã đạt giới hạn 5 tài nguyên thử nghiệm của tài khoản Free. Vui lòng nâng cấp Basic để lưu và sử dụng!'
                    : `Bạn đã dùng hết ${entitlements.menuAssets} tài nguyên menu của gói ${entitlements.label}.`,
                entitlements
            ));
        }
        if (!req.file) return res.status(400).json({ success: false, error: 'Missing asset file' });
        const ext = path.extname(req.file.filename).toLowerCase();
        const detectedExt = detectGoalAssetType(req.file.path);
        if (!detectedExt || detectedExt !== ext) {
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
            return res.status(400).json({ success: false, error: 'File không đúng định dạng PNG, GIF hoặc WebM' });
        }
        const optimization = await optimizeGoalAsset(req.file.path, ext);
        const maxFinalSize = { '.png': 8 * 1024 * 1024, '.gif': 12 * 1024 * 1024, '.webm': 20 * 1024 * 1024 }[ext];
        if (optimization.finalSize > maxFinalSize) {
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
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
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
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





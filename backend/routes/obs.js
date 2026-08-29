const express = require('express');
const router = express.Router();
const obsService = require('../services/obsService');
const { authMiddleware } = require('../middleware/auth');
const Effect = require('../models/Effect');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const User = require('../models/User');
const OBSSettings = require('../models/OBSSettings');
const { issueEffectAccessToken, verifyEffectAccessToken } = require('../services/effectAccessToken');
const fs = require('fs');
const path = require('path');
const effectQueue = require('../services/effectQueue');
const {
    resolveEffectForUser,
    resolveEffectDurationForUser,
    isCustomEffectMediaAvailable
} = require('../services/effectLibraryService');
const effectRoutes = require('./effects');
const { getOverlayAccessToken } = require('../config/networkSecurity');
const { rememberCloudSessionToken } = require('../services/cloudSessionTokenStore');
const { paths: dataPaths } = require('../config/dataPaths');
const { isValidResourceId, ownedResourceFilter } = require('../utils/accessControl');
const { getEntitlements, validateDesignerItems } = require('../config/planEntitlements');

function requireLoopbackDesktop(req, res, next) {
    const address = String(req.socket?.remoteAddress || '');
    if (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1') return next();
    return res.status(403).json({ success: false, message: 'Endpoint này chỉ dành cho ứng dụng LiveFlow trên PC.' });
}

async function getObsConnectionConfig(userId) {
    try {
        const settings = userId
            ? (await OBSSettings.findOne({ userId })) || (await OBSSettings.findOne({ userId: { $exists: false } }))
            : await OBSSettings.findOne({ userId: { $exists: false } });
        if (settings) {
            return {
                host: settings.host || process.env.OBS_HOST || '127.0.0.1',
                port: settings.port || process.env.OBS_PORT || 4455,
                password: settings.password || process.env.OBS_PASSWORD || 'obs123'
            };
        }
    } catch (_e) {}

    return {
        host: process.env.OBS_HOST || '127.0.0.1',
        port: process.env.OBS_PORT || 4455,
        password: process.env.OBS_PASSWORD || 'obs123'
    };
}

function normalizeDurationMs(duration) {
    const value = Number(duration);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 100 ? Math.round(value * 1000) : Math.round(value);
}

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

router.get('/overlay-urls', authMiddleware, (req, res) => {
    const PORT = process.env.PORT || 9000;
    const giftToken = encodeURIComponent(getOverlayAccessToken('gift-menu'));
    const goalToken = encodeURIComponent(getOverlayAccessToken('goal-board'));
    return res.json({
        success: true,
        giftMenu: `http://127.0.0.1:${PORT}/gift-menu-overlay.html?wsToken=${giftToken}`,
        goalBoard: `http://127.0.0.1:${PORT}/overlay/goal-board-overlay.html?wsToken=${goalToken}`
    });
});

router.get('/effect-player-media/:effectId', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        const allowedPurposes = new Set(['effect-player-preview', 'effect-player-test-mapping', 'effect-player-live-mapping']);
        const payload = verifyEffectAccessToken(token, req.params.effectId, allowedPurposes);
        if (!allowedPurposes.has(payload.purpose) || String(payload.effectId) !== String(req.params.effectId)) {
            return res.status(403).json({ success: false, message: 'Liên kết xem thử không hợp lệ.' });
        }
        const effect = (await resolveEffectForUser(payload.userId, req.params.effectId))
            || (await Effect.findById(req.params.effectId));
        if (!effect) return res.status(404).json({ success: false, message: 'Effect access denied.' });
        req.effectAccess = payload;
        return effectRoutes.streamEffectById(req, res);
    } catch (_error) {
        return res.status(401).json({ success: false, message: 'Liên kết xem thử đã hết hạn hoặc không hợp lệ.' });
    }
});

router.post('/preview-effect-player', authMiddleware, async (req, res) => {
    try {
        const effectId = String(req.body?.effectId || '').trim();
        if (!effectId) return res.status(400).json({ success: false, message: 'Thiếu mã hiệu ứng.' });

        let [effect, duration] = await Promise.all([
            resolveEffectForUser(req.userId, effectId),
            resolveEffectDurationForUser(req.userId, effectId)
        ]);

        if (!effect) {
            effect = await Effect.findById(effectId);
            if (effect && !duration) duration = effect.duration;
        }

        if (!effect) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hiệu ứng.' });
        }
        if (effect.isCustom && !await isCustomEffectMediaAvailable(effect)) {
            return res.status(422).json({
                success: false,
                code: 'CUSTOM_EFFECT_FILE_UNAVAILABLE',
                message: 'Không tìm thấy file hiệu ứng cá nhân trên máy này. Hãy thêm lại hiệu ứng rồi thử lại.'
            });
        }

        const durationMs = normalizeDurationMs(duration);
        if (!durationMs) {
            return res.status(422).json({ success: false, message: 'Hiệu ứng chưa có thời lượng hợp lệ.' });
        }

        const isPlayerReady = typeof req.app.locals.isEffectPlayerReady === 'function' && req.app.locals.isEffectPlayerReady();
        if (!isPlayerReady) {
            if (!obsService.isConnected()) {
                return res.status(503).json({ success: false, message: 'OBS chưa kết nối.' });
            }

            await obsService.ensureEffectPlayerSource();
            const sourceStatus = await obsService.getFoundationSourceStatus();
            if (!sourceStatus.effect_player) {
                return res.status(503).json({ success: false, message: 'Không thể chuẩn bị nguồn effect_player trên OBS.' });
            }
            if (!await waitForEffectPlayerReady(req, 3000)) {
                return res.status(503).json({ success: false, message: 'Nguồn effect_player chưa kết nối, vui lòng thử lại.' });
            }
        }

        const PORT = process.env.PORT || 9000;
        let effectUrl;
        if (effect.isCustom) {
            effectUrl = effect.fileUrl;
        } else {
            const streamToken = issueEffectAccessToken({
                purpose: 'effect-player-preview',
                effectId,
                userId: String(req.userId)
            });
            effectUrl = `http://127.0.0.1:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effectId)}?token=${encodeURIComponent(streamToken)}`;
        }

        const payload = {
            effectId,
            effectName: effect.name,
            effectUrl,
            duration: durationMs,
            playbackType: 'preview_effect',
            customTimeline: Array.isArray(req.body?.timeline) ? req.body.timeline : null,
            audioEnabled: req.body?.audioEnabled !== false,
            audioVolume: Math.max(0, Math.min(1, Number.isFinite(Number(req.body?.audioVolume)) ? Number(req.body.audioVolume) : 1)),
            startedAt: Date.now()
        };
        const queued = await effectQueue.add({ ...payload, userId: String(req.userId) });
        if (!queued) return res.status(429).json({ success: false, message: 'Effect queue is full. Please try again.' });
        const updatedStatus = effectQueue.getStatus();
        return res.json({ success: true, queued: true, duration: durationMs, queueLength: updatedStatus.queueLength });

    } catch (error) {
        console.error('Effect player preview error:', error);
        return res.status(500).json({ success: false, message: 'Không thể xem thử hiệu ứng trên OBS.' });
    }
});

let currentPreviewFilePath = '';

const multer = require('multer');
const previewTempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = dataPaths.tempDir || path.join(__dirname, '..', 'temp');
        try { fs.mkdirSync(dest, { recursive: true }); } catch (_e) {}
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, `preview_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
    }
});
const previewTempUpload = multer({ storage: previewTempStorage });

router.post('/preview-upload-temp', authMiddleware, previewTempUpload.single('file'), (req, res) => {
    if (req.file) {
        currentPreviewFilePath = req.file.path;
        return res.json({ success: true, filePath: req.file.path });
    }
    return res.status(400).json({ success: false, message: 'Chưa có file video nào.' });
});

router.get('/preview-temp-media', (req, res) => {
    if (!currentPreviewFilePath || !fs.existsSync(currentPreviewFilePath)) {
        return res.status(404).send('Preview file not found');
    }
    const stat = fs.statSync(currentPreviewFilePath);
    const fileSize = stat.size;
    const ext = path.extname(currentPreviewFilePath).toLowerCase();
    const contentType = ext === '.mov' ? 'video/quicktime' : (ext === '.webm' ? 'video/webm' : 'video/mp4');

    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(currentPreviewFilePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes'
        };
        res.writeHead(200, head);
        fs.createReadStream(currentPreviewFilePath).pipe(res);
    }
});

router.get('/current-webcam-transform', authMiddleware, async (req, res) => {
    try {
        await obsService.ensureConnected().catch(() => {});
        if (!obsService._isConnected) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối. Vui lòng mở OBS Studio trước.' });
        }

        let sceneName = 'EffectStore';
        try {
            const currentScene = await obsService.obs.call('GetCurrentProgramScene');
            if (currentScene && currentScene.currentProgramSceneName) {
                sceneName = currentScene.currentProgramSceneName;
            }
        } catch (_e) {
            try {
                const sceneList = await obsService.obs.call('GetSceneList');
                if (sceneList && sceneList.currentProgramSceneName) {
                    sceneName = sceneList.currentProgramSceneName;
                }
            } catch (_e2) {}
        }

        const OBSController = require('../obs-controller');
        const obsController = new OBSController(obsService.obs);
        obsController.isConnected = true;
        
        const webcam = await obsController.findWebcamSource(sceneName);
        if (!webcam) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nguồn Webcam trong Scene hiện tại.' });
        }

        const transformRes = await obsService.obs.call('GetSceneItemTransform', {
            sceneName,
            sceneItemId: webcam.sceneItemId
        });
        const tf = transformRes.sceneItemTransform;

        const posX = Math.round(tf.positionX || 0);
        const posY = Math.round(tf.positionY || 0);
        
        let actualWidth = tf.width;
        let actualHeight = tf.height;

        // Nếu OBS dùng Bounding Box (Bounds Fit / Stretch...)
        if (tf.boundsType && tf.boundsType !== 'OBS_BOUNDS_NONE' && typeof tf.boundsWidth === 'number' && tf.boundsWidth > 0) {
            actualWidth = tf.boundsWidth;
            actualHeight = tf.boundsHeight;
        } else if (typeof tf.scaleX === 'number' && tf.sourceWidth > 0) {
            actualWidth = tf.sourceWidth * tf.scaleX;
            actualHeight = tf.sourceHeight * (tf.scaleY || tf.scaleX);
        }

        const videoSettings = await obsService.obs.call('GetVideoSettings').catch(() => ({}));
        const baseWidth = (videoSettings && videoSettings.baseWidth) || tf.sourceWidth || 1080;
        const baseHeight = (videoSettings && videoSettings.baseHeight) || tf.sourceHeight || 1920;

        let scaleX = Math.round((actualWidth / (tf.sourceWidth || baseWidth)) * 100);
        let scaleY = Math.round((actualHeight / (tf.sourceHeight || baseHeight)) * 100);

        if (isNaN(scaleX) || scaleX <= 0) scaleX = Math.round((tf.scaleX || 1.0) * 100);
        if (isNaN(scaleY) || scaleY <= 0) scaleY = Math.round((tf.scaleY || 1.0) * 100);

        const rotation = Math.round(tf.rotation || 0);

        return res.json({
            success: true,
            sourceName: webcam.sourceName,
            sceneItemId: webcam.sceneItemId,
            x: posX,
            y: posY,
            scaleX,
            scaleY,
            rotation,
            raw: tf
        });
    } catch (err) {
        console.error('Error getting webcam transform:', err);
        return res.status(500).json({ success: false, message: err.message || 'Lỗi đọc vị trí từ OBS' });
    }
});

router.post('/preview-timeline', authMiddleware, async (req, res) => {
    try {
        const { effectId, timeline } = req.body;
        if (!timeline || !Array.isArray(timeline)) {
            return res.status(400).json({ success: false, message: 'Timeline không hợp lệ.' });
        }
        
        await obsService.ensureConnected().catch(() => {});
        if (!obsService._isConnected) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối. Vui lòng mở OBS Studio và kết nối trước.' });
        }

        let sceneName = 'EffectStore';
        try {
            const currentScene = await obsService.obs.call('GetCurrentProgramScene');
            if (currentScene && currentScene.currentProgramSceneName) {
                sceneName = currentScene.currentProgramSceneName;
            }
        } catch (_e) {
            try {
                const sceneList = await obsService.obs.call('GetSceneList');
                if (sceneList && sceneList.currentProgramSceneName) {
                    sceneName = sceneList.currentProgramSceneName;
                }
            } catch (_e2) {}
        }

        // 1. Gọi controller thực thi chuyển động timeline trên Webcam
        const OBSController = require('../obs-controller');
        const obsController = new OBSController(obsService.obs);
        obsController.isConnected = true;
        obsController.runTimelineEffect(sceneName, effectId || 'preview', timeline);

        // 2. Đồng thời phát video hiệu ứng trên OBS effect_player
        const eventBus = require('../services/eventBus');
        const maxTime = Math.max(5, ...timeline.map(k => k.time || 0));
        const durationMs = Math.round((maxTime + 1.5) * 1000);
        const PORT = process.env.PORT || 9000;

        if (req.body.filePath && fs.existsSync(req.body.filePath)) {
            currentPreviewFilePath = req.body.filePath;
            await obsService.ensureEffectPlayerSource().catch(() => {});
            const previewUrl = `http://127.0.0.1:${PORT}/api/obs/preview-temp-media?t=${Date.now()}`;
            
            const payload = {
                effectId: effectId || 'upload_preview',
                effectName: 'Xem Thử Hiệu Ứng',
                effectUrl: previewUrl,
                duration: durationMs,
                playbackType: 'preview_effect',
                audioEnabled: true,
                audioVolume: 1.0,
                startedAt: Date.now()
            };
            await effectQueue.add({ ...payload, userId: String(req.userId) }).catch(() => {});
        } else if (effectId || req.body.effectName || req.body.name) {
            let effect = null;
            if (effectId && effectId !== 'upload_preview' && effectId !== 'preview') {
                effect = await Effect.findById(effectId).catch(() => null);
                if (!effect) {
                    const { resolveEffectForUser, mirrorEffectFromCentral } = require('../services/effectLibraryService');
                    effect = await resolveEffectForUser(req.userId, effectId).catch(() => null);
                    if (!effect) {
                        effect = await mirrorEffectFromCentral(effectId).catch(() => null);
                    }
                }
            }
            if (!effect && (req.body.effectName || req.body.name)) {
                const searchName = String(req.body.effectName || req.body.name).trim();
                if (searchName) {
                    effect = await Effect.findOne({ name: new RegExp('^' + searchName + '$', 'i') }).catch(() => null)
                        || await Effect.findOne({ name: new RegExp(searchName, 'i') }).catch(() => null);
                }
            }
            if (effect) {
                await obsService.ensureEffectPlayerSource().catch(() => {});
                let effectUrl = '';
                if (effect.isCustom) {
                    effectUrl = effect.fileUrl;
                } else {
                    const streamToken = issueEffectAccessToken({
                        purpose: 'effect-player-preview',
                        effectId: String(effect._id || effect.id),
                        userId: String(req.userId)
                    });
                    effectUrl = `http://127.0.0.1:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effect._id || effect.id)}?token=${encodeURIComponent(streamToken)}`;
                }
                
                const payload = {
                    effectId: String(effect._id || effect.id),
                    effectName: effect.name,
                    effectUrl,
                    duration: durationMs,
                    playbackType: 'preview_effect',
                    audioEnabled: true,
                    audioVolume: 1.0,
                    startedAt: Date.now()
                };
                await effectQueue.add({ ...payload, userId: String(req.userId) }).catch(() => {});
            }
        }

        return res.json({ success: true, message: 'Đang chạy thử Timeline trên OBS!' });
    } catch (err) {
        console.error('Preview timeline error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Lỗi chạy thử Timeline' });
    }
});

// Render effect HTML for OBS Browser Source
router.get('/effect/:id', async (req, res) => {
    try {
        const effectId = req.params.id;
        const PORT = process.env.PORT || 9000;
        const blankHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px!important;height:1920px!important;overflow:hidden;background:transparent!important}</style></head><body></body></html>`;
        if (req.query.idle === '1') return res.send(blankHtml);

        const requestedDuration = Number(req.query.duration || req.query.d || 0);
        if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
            console.warn(`Skipping OBS effect ${effectId}: missing duration query metadata`);
            res.setHeader('X-Effect-Warning', 'missing-duration');
            return res.status(422).send(blankHtml);
        }
        const durationMs = requestedDuration < 100
            ? Math.round(requestedDuration * 1000)
            : Math.round(requestedDuration);
        const trigger = obsService.consumeTriggerToken(req.query.trigger, effectId);
        if (!trigger) return res.send(blankHtml);

        const isCustomEffect = /^custom-[a-zA-Z0-9-]+$/.test(effectId);
        const streamToken = issueEffectAccessToken({ effectId, userId: 'obs', purpose: 'legacy-obs-effect' });
        const videoUrl = isCustomEffect
            ? `http://127.0.0.1:${PORT}/custom-effects/${effectId}/effect.webm`
            : `http://127.0.0.1:${PORT}/api/stream/effect/${effectId}?token=${streamToken}`;

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 1080px !important; height: 1920px !important;
            overflow: hidden; background: transparent;
        }
        #effectVideo {
            width: 100% !important; height: 100% !important;
            object-fit: contain !important;
            background: transparent !important;
            opacity: 0;
        }
    </style>
</head>
<body>
    <video id="effectVideo" muted playsinline preload="auto">
        <source src="${videoUrl}" type="video/webm">
    </video>
    <script>
        const video = document.getElementById('effectVideo');
        let stopped = false;
        const stopEffect = () => {
            if (stopped) return;
            stopped = true;
            video.pause();
            video.removeAttribute('src');
            while (video.firstChild) video.removeChild(video.firstChild);
            video.load();
            video.style.opacity = '0';
            document.body.style.background = 'transparent';
        };

        const startEffect = () => {
            stopped = false;
            video.currentTime = 0;
            video.style.opacity = '1';
            video.play().catch(err => {
                console.error('Play error:', err);
                stopEffect();
            });
            window.setTimeout(stopEffect, ${durationMs});
        };

        video.addEventListener('ended', stopEffect);
        video.addEventListener('error', stopEffect);
        if (video.readyState >= 2) startEffect();
        else video.addEventListener('loadeddata', startEffect, { once: true });
    </script>
</body>
</html>`);
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// Setup effect in OBS
router.post('/setup-effect', authMiddleware, async (req, res) => {
    try {
        const { effectId } = req.body;
        if (!effectId) return res.status(400).json({ success: false, message: 'Missing effectId' });

        const sourceName = `effect_${effectId}`;
        const { sceneItems } = await obsService.obs.call('GetSceneItemList', { sceneName: 'EffectStore' });
        const existing = sceneItems.find(item => item.sourceName === sourceName);

        if (!existing) {
            const PORT = process.env.PORT || 9000;
            const url = `http://localhost:${PORT}/api/obs/effect/${effectId}`;
            await obsService.obs.call('CreateInput', {
                sceneName: 'EffectStore',
                inputName: sourceName,
                inputKind: 'browser_source',
                inputSettings: { url, width: 1080, height: 1920, fps: 30, css: '', restart_when_active: false }
            });
        }
        res.json({ success: true, sourceName });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Setup/Update Gift Menu overlay source in OBS
router.post('/setup-gift-menu', authMiddleware, async (req, res) => {
    try {
        const layoutId = req.body?.layoutId;
        let publishedLayout = null;
        if (layoutId && isValidResourceId(layoutId)) {
            publishedLayout = await GiftMenuLayout.findOne(ownedResourceFilter(
                layoutId,
                req.userId,
                { isTemplate: false }
            ));
        }
        if (!publishedLayout) {
            publishedLayout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true, isTemplate: false })
                || await GiftMenuLayout.findOne({ userId: req.userId, isTemplate: false });
        }
        if (!publishedLayout) {
            publishedLayout = await GiftMenuLayout.create({
                userId: req.userId,
                name: 'Bảng quà mặc định',
                items: [],
                exportedItems: [],
                isActive: true,
                isTemplate: false
            });
        }

        let user = req.user || await User.findById(req.userId);
        if (!user && req.userId) {
            const { mirrorUserLocally } = require('../services/localUserMirror');
            await mirrorUserLocally({ id: req.userId, email: `${req.userId}@local.user` });
            user = await User.findById(req.userId);
        }
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
        const entitlements = getEntitlements(user);
        const exportViolation = validateDesignerItems(publishedLayout.items, entitlements) ||
            validateDesignerItems(publishedLayout.exportedItems, entitlements);
        if (exportViolation) return res.status(403).json(exportViolation);

        fs.writeFileSync(dataPaths.giftMenuLayoutPath, JSON.stringify(publishedLayout, null, 2), 'utf8');

        const PORT = process.env.PORT || 9000;
        const sceneName = 'EffectStore';
        const defaultSourceName = 'gift_menu_overlay';
        const giftMenuSourceNames = ['gift_menu_overlay', 'gift_menu'];
        const wsToken = encodeURIComponent(getOverlayAccessToken('gift-menu'));
        const url = `http://127.0.0.1:${PORT}/gift-menu-overlay.html?wsToken=${wsToken}&t=${Date.now()}`;
        let sourceWidth = 1080;
        let sourceHeight = 1920;
        try {
            const layoutPath = dataPaths.giftMenuLayoutPath;
            const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
            const width = Number(layout?.exportSize?.width);
            const height = Number(layout?.exportSize?.height);
            if (width >= 320 && width <= 7680 && height >= 320 && height <= 7680) {
                sourceWidth = Math.round(width);
                sourceHeight = Math.round(height);
            }
        } catch (_e) {}

        const { scenes } = await obsService.obs.call('GetSceneList');
        const sceneExists = scenes.find((s) => s.sceneName === sceneName);
        if (!sceneExists) {
            await obsService.obs.call('CreateScene', { sceneName });
        }

        const { sceneItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
        let item = sceneItems.find((x) => giftMenuSourceNames.includes(x.sourceName));
        const sourceName = item?.sourceName || defaultSourceName;

        const browserSettings = {
            url,
            width: sourceWidth,
            height: sourceHeight,
            fps: 60,
            fps_custom: true,
            css: '',
            shutdown: false,
            restart_when_active: false
        };

        if (!item) {
            await obsService.obs.call('CreateInput', {
                sceneName,
                inputName: sourceName,
                inputKind: 'browser_source',
                inputSettings: browserSettings
            });
            const { sceneItems: newItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
            item = newItems.find((x) => x.sourceName === sourceName);
        } else {
            // OBS CEF can keep the previous document alive even when only the
            // query string changes. Detach it first so Export to OBS always
            // starts a fresh renderer instead of occasionally showing black.
            await obsService.obs.call('SetInputSettings', {
                inputName: sourceName,
                inputSettings: { url: 'about:blank' },
                overlay: true
            });
            await new Promise((resolve) => setTimeout(resolve, 120));
            await obsService.obs.call('SetInputSettings', {
                inputName: sourceName,
                inputSettings: browserSettings,
                overlay: true
            });
        }

        // Keep overlay above other sources.
        const { sceneItems: orderedItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
        const targetItem = orderedItems.find((x) => x.sourceName === sourceName);
        if (targetItem && typeof targetItem.sceneItemId === 'number') {
            const topIndex = Math.max(...orderedItems.map((x) => Number(x.sceneItemIndex) || 0));
            try {
                await obsService.obs.call('SetSceneItemIndex', {
                    sceneName,
                    sceneItemId: targetItem.sceneItemId,
                    sceneItemIndex: topIndex + 1
                });
            } catch (_e) {}
            item = targetItem;
        }

        if (item && typeof item.sceneItemId === 'number') {
            await obsService.obs.call('SetSceneItemEnabled', {
                sceneName,
                sceneItemId: item.sceneItemId,
                sceneItemEnabled: true
            });
        }

        try {
            await obsService.obs.call('PressInputPropertiesButton', {
                inputName: sourceName,
                propertyName: 'refreshnocache'
            });
        } catch (_e) {}

        return res.json({
            success: true,
            sceneName,
            sourceName,
            overlayUrl: `http://localhost:${PORT}/gift-menu-overlay.html?wsToken=${wsToken}`
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Clear the currently rendered board when its desktop account signs out.
// The browser source stays enabled and is pointed at a transparent document,
// so OBS keeps its expected scene/source structure instead of looking as if a
// user manually disabled it. A later "Xuất sang OBS" restores the real
// overlay URL and the saved menu as usual.
router.post('/hide-gift-menu', requireLoopbackDesktop, async (_req, res) => {
    try {
        if (!obsService.isConnected()) {
            return res.json({ success: true, hidden: false, reason: 'obs-offline' });
        }

        const sceneName = 'EffectStore';
        const { scenes } = await obsService.obs.call('GetSceneList');
        if (!scenes.some((scene) => scene.sceneName === sceneName)) {
            return res.json({ success: true, hidden: false, reason: 'scene-missing' });
        }

        const { sceneItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
        const giftMenuSourceNames = new Set(['gift_menu_overlay', 'gift_menu']);
        const giftMenuItems = sceneItems.filter((item) =>
            giftMenuSourceNames.has(item.sourceName) && typeof item.sceneItemId === 'number'
        );

        await Promise.all(giftMenuItems.map(async (item) => {
            // `about:blank` is fully transparent in an OBS Browser Source.
            // Do not delete or disable the source: it is part of the user's
            // scene setup and must remain ready for the next login.
            await obsService.obs.call('SetInputSettings', {
                inputName: item.sourceName,
                inputSettings: { url: 'about:blank', shutdown: false, restart_when_active: false },
                overlay: true
            });
            await obsService.obs.call('SetSceneItemEnabled', {
                sceneName,
                sceneItemId: item.sceneItemId,
                sceneItemEnabled: true
            });
        }));

        return res.json({ success: true, hidden: giftMenuItems.length > 0, count: giftMenuItems.length });
    } catch (error) {
        // Logging out must never be blocked by an OBS connection that closed
        // while the request was in flight.
        return res.status(503).json({ success: false, message: error.message || 'Không thể ẩn Gift Menu trên OBS.' });
    }
});

// Trigger
router.post('/trigger', authMiddleware, async (req, res) => {
    try {
        const { effectId, duration } = req.body;
        const effectQueue = require('../services/effectQueue');

        const queued = await effectQueue.add({
            effectId,
            duration,
            effectName: req.body?.effectName || effectId,
            playbackType: 'preview_effect',
            userId: String(req.userId)
        });
        if (!queued) {
            return res.status(422).json({
                success: false,
                warning: 'Effect is missing duration metadata and was skipped.',
                message: 'Hiệu ứng chưa có thời lượng hợp lệ. App đã bỏ qua để tránh treo queue.'
            });
        }
        res.json({ success: true, message: 'Added to queue' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sources
router.get('/sources', authMiddleware, async (req, res) => {
    try {
        if (!obsService.isConnected()) return res.status(503).json({ error: 'OBS chưa kết nối' });
        const { inputs } = await obsService.obs.call('GetInputList');
        const visualInputs = (inputs || []).filter(input => {
            const kind = (input.inputKind || '').toLowerCase();
            const name = (input.inputName || '').toLowerCase();
            if (kind.includes('audio') || kind.includes('wasapi') || kind.includes('pulse') || kind.includes('alsa')) return false;
            if (name === 'desktop audio' || name === 'mic/aux' || name.startsWith('mic') || name.startsWith('audio')) return false;
            return true;
        });
        const sources = visualInputs.map(input => ({
            name: input.inputName,
            kind: input.inputKind,
            isWebcam: input.inputKind === 'dshow_input' || input.inputKind === 'v4l2_input' || input.inputKind === 'avfoundation_input'
        }));
        res.json({ success: true, sources });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Repair OBS Sources
router.post('/repair-sources', authMiddleware, async (req, res) => {
    try {
        const rawToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (req.userId && rawToken) {
            rememberCloudSessionToken(req.userId, rawToken);
        }
        if (!obsService.isConnected()) {
            const config = await getObsConnectionConfig(req.userId);
            await obsService.connect(config.host, config.port, config.password);
        }

        if (!obsService.isConnected()) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối' });
        }

        const sceneName = 'EffectStore';
        
        // 1. Ensure scene exists
        const { scenes } = await obsService.obs.call('GetSceneList');
        const sceneExists = scenes.find((s) => s.sceneName === sceneName);
        if (!sceneExists) {
            await obsService.obs.call('CreateScene', { sceneName });
        }

        const { sceneItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
        const existingSources = new Set(sceneItems.map(item => item.sourceName));

        const report = {
            effect_player: { status: 'ok', repaired: false },
            gift_menu_overlay: { status: 'ok', repaired: false }
        };

        // 2. Check and repair effect_player
        await obsService.ensureEffectPlayerSource();
        const effectPlayerReady = await waitForEffectPlayerReady(req, 3000);
        report.effect_player.status = effectPlayerReady ? 'ok' : 'pending';
        report.effect_player.repaired = true;

        // 3. Check and repair gift_menu_overlay / gift_menu
        const giftMenuSourceNames = ['gift_menu_overlay', 'gift_menu'];
        const existingGiftMenu = sceneItems.find((x) => giftMenuSourceNames.includes(x.sourceName));

        const PORT = process.env.PORT || 9000;
        const wsToken = encodeURIComponent(getOverlayAccessToken('gift-menu'));
        const url = `http://127.0.0.1:${PORT}/gift-menu-overlay.html?wsToken=${wsToken}&t=${Date.now()}`;
        let sourceWidth = 1080;
        let sourceHeight = 1920;
        try {
            const layoutPath = dataPaths.giftMenuLayoutPath;
            const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
            const width = Number(layout?.exportSize?.width);
            const height = Number(layout?.exportSize?.height);
            if (width >= 320 && width <= 7680 && height >= 320 && height <= 7680) {
                sourceWidth = Math.round(width);
                sourceHeight = Math.round(height);
            }
        } catch (_e) {}

        if (!existingGiftMenu) {
            await obsService.obs.call('CreateInput', {
                sceneName,
                inputName: 'gift_menu_overlay',
                inputKind: 'browser_source',
                inputSettings: {
                    url,
                    width: sourceWidth,
                    height: sourceHeight,
                    fps: 60,
                    fps_custom: true,
                    css: '',
                    shutdown: false,
                    restart_when_active: true
                }
            });
            report.gift_menu_overlay.status = 'repaired';
            report.gift_menu_overlay.repaired = true;
        } else {
            const targetName = existingGiftMenu.sourceName;
            try {
                await obsService.obs.call('SetInputSettings', {
                    inputName: targetName,
                    inputSettings: {
                        url,
                        width: sourceWidth,
                        height: sourceHeight,
                        shutdown: false,
                        restart_when_active: true
                    },
                    overlay: true
                });
                await obsService.obs.call('PressInputPropertiesButton', {
                    inputName: targetName,
                    propertyName: 'refreshnocache'
                });
                report.gift_menu_overlay.status = 'repaired';
                report.gift_menu_overlay.repaired = true;
            } catch (err) {
                console.warn('Unable to refresh existing gift_menu source in repair:', err.message || err);
            }
        }

        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

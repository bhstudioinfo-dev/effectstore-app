const express = require('express');
const router = express.Router();
const obsService = require('../services/obsService');
const { authMiddleware } = require('../middleware/auth');
const Effect = require('../models/Effect');
const OBSSettings = require('../models/OBSSettings');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const effectQueue = require('../services/effectQueue');
const {
    resolveEffectForUser,
    resolveEffectDurationForUser
} = require('../services/effectLibraryService');
const effectRoutes = require('./effects');

async function getObsConnectionConfig() {
    try {
        const settings = await OBSSettings.findOne();
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

router.get('/effect-player-media/:effectId', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const allowedPurposes = new Set(['effect-player-preview', 'effect-player-test-mapping', 'effect-player-live-mapping']);
        if (!allowedPurposes.has(payload.purpose) || String(payload.effectId) !== String(req.params.effectId)) {
            return res.status(403).json({ success: false, message: 'Liên kết xem thử không hợp lệ.' });
        }
        return effectRoutes.streamEffectById(req, res);
    } catch (_error) {
        return res.status(401).json({ success: false, message: 'Liên kết xem thử đã hết hạn hoặc không hợp lệ.' });
    }
});

router.post('/preview-effect-player', authMiddleware, async (req, res) => {
    try {
        const effectId = String(req.body?.effectId || '').trim();
        if (!effectId) return res.status(400).json({ success: false, message: 'Thiếu mã hiệu ứng.' });

        const queueStatus = effectQueue.getStatus();
        if (queueStatus.status !== 'idle') {
            return res.status(409).json({
                success: false,
                code: 'EFFECT_QUEUE_BUSY',
                message: 'Đang có hiệu ứng khác chạy, vui lòng thử lại sau.'
            });
        }

        const effect = await resolveEffectForUser(req.userId, effectId);
        if (!effect) {
            return res.status(403).json({ success: false, message: 'Bạn chưa sở hữu hiệu ứng này.' });
        }

        const duration = await resolveEffectDurationForUser(req.userId, effectId);
        const durationMs = normalizeDurationMs(duration);
        if (!durationMs) {
            return res.status(422).json({ success: false, message: 'Hiệu ứng chưa có thời lượng hợp lệ.' });
        }

        if (!obsService.isConnected()) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối.' });
        }

        await obsService.ensureEffectPlayerSource();
        const sourceStatus = await obsService.getFoundationSourceStatus();
        if (!sourceStatus.effect_player) {
            return res.status(503).json({ success: false, message: 'Không thể chuẩn bị nguồn effect_player trên OBS.' });
        }
        if (!await waitForEffectPlayerReady(req)) {
            return res.status(503).json({ success: false, message: 'Nguồn effect_player chưa kết nối, vui lòng thử lại.' });
        }

        const PORT = process.env.PORT || 9000;
        let effectUrl;
        if (effect.isCustom) {
            effectUrl = effect.fileUrl;
        } else {
            const streamToken = jwt.sign({
                purpose: 'effect-player-preview',
                effectId,
                userId: String(req.userId)
            }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '5m' });
            effectUrl = `http://localhost:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effectId)}?token=${encodeURIComponent(streamToken)}`;
        }

        const payload = {
            effectId,
            effectName: effect.name,
            effectUrl,
            duration: durationMs,
            playbackType: 'preview_effect',
            startedAt: Date.now()
        };
        const broadcast = req.app.locals.broadcastToClients;
        if (typeof broadcast !== 'function') {
            return res.status(503).json({ success: false, message: 'Kênh effect_player chưa sẵn sàng.' });
        }
        broadcast('effect_player_play_request', payload);
        return res.json({ success: true, duration: durationMs });
    } catch (error) {
        console.error('Effect player preview error:', error);
        return res.status(500).json({ success: false, message: 'Không thể xem thử hiệu ứng trên OBS.' });
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
        const streamToken = jwt.sign({ effectId, userId: 'obs' }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });
        const videoUrl = isCustomEffect
            ? `http://127.0.0.1:8080/custom-effects/${effectId}/effect.webm`
            : `http://localhost:${PORT}/api/stream/effect/${effectId}?token=${streamToken}`;

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
router.post('/setup-gift-menu', authMiddleware, async (_req, res) => {
    try {
        if (!obsService.isConnected()) {
            const config = await getObsConnectionConfig();
            await obsService.connect(config.host, config.port, config.password);
        }

        if (!obsService.isConnected()) {
            return res.status(503).json({ success: false, message: 'OBS chưa kết nối' });
        }

        const PORT = process.env.PORT || 9000;
        const sceneName = 'EffectStore';
        const defaultSourceName = 'gift_menu_overlay';
        const giftMenuSourceNames = ['gift_menu_overlay', 'gift_menu'];
        const url = `http://localhost:${PORT}/gift-menu-overlay.html?t=${Date.now()}`;
        let sourceWidth = 1080;
        let sourceHeight = 1920;
        try {
            const layoutPath = path.join(__dirname, '..', 'uploads', 'gift-menu-layout.json');
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

        if (!item) {
            await obsService.obs.call('CreateInput', {
                sceneName,
                inputName: sourceName,
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
            const { sceneItems: newItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
            item = newItems.find((x) => x.sourceName === sourceName);
        } else {
            await obsService.obs.call('SetInputSettings', {
                inputName: sourceName,
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
            overlayUrl: `http://localhost:${PORT}/gift-menu-overlay.html`
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});


// Trigger
router.post('/trigger', authMiddleware, async (req, res) => {
    try {
        const { effectId, duration } = req.body;
        const effectQueue = require('../services/effectQueue');

        const queued = await effectQueue.add(effectId, duration, null, req.body?.effectName || effectId);
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
        const sources = inputs.map(input => ({
            name: input.inputName,
            kind: input.inputKind,
            isWebcam: input.inputKind === 'dshow_input' || input.inputKind === 'v4l2_input'
        }));
        res.json({ success: true, sources });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Repair OBS Sources
router.post('/repair-sources', authMiddleware, async (req, res) => {
    try {
        if (!obsService.isConnected()) {
            const config = await getObsConnectionConfig();
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
        const effectPlayerExists = existingSources.has('effect_player');
        if (!effectPlayerExists) {
            await obsService.ensureEffectPlayerSource();
            report.effect_player.status = 'repaired';
            report.effect_player.repaired = true;
        }

        // 3. Check and repair gift_menu_overlay / gift_menu
        const giftMenuSourceNames = ['gift_menu_overlay', 'gift_menu'];
        const giftMenuExists = sceneItems.some((x) => giftMenuSourceNames.includes(x.sourceName));

        if (!giftMenuExists) {
            const PORT = process.env.PORT || 9000;
            const url = `http://localhost:${PORT}/gift-menu-overlay.html?t=${Date.now()}`;
            let sourceWidth = 1080;
            let sourceHeight = 1920;
            try {
                const layoutPath = path.join(__dirname, '..', 'uploads', 'gift-menu-layout.json');
                const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
                const width = Number(layout?.exportSize?.width);
                const height = Number(layout?.exportSize?.height);
                if (width >= 320 && width <= 7680 && height >= 320 && height <= 7680) {
                    sourceWidth = Math.round(width);
                    sourceHeight = Math.round(height);
                }
            } catch (_e) {}

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
        }

        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const obsService = require('../services/obsService');
const { authMiddleware } = require('../middleware/auth');
const Effect = require('../models/Effect');
const OBSSettings = require('../models/OBSSettings');
const jwt = require('jsonwebtoken');

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

// Render effect HTML for OBS Browser Source
router.get('/effect/:id', async (req, res) => {
    try {
        const effectId = req.params.id;
        const PORT = process.env.PORT || 9000;
        const streamToken = jwt.sign({ effectId, userId: 'obs' }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });

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
        }
    </style>
</head>
<body>
    <video id="effectVideo" autoplay muted playsinline preload="auto">
        <source src="http://localhost:${PORT}/api/stream/effect/${effectId}?token=${streamToken}" type="video/webm">
    </video>
    <script>
        const video = document.getElementById('effectVideo');
        video.play().catch(err => console.error('Play error:', err));

        video.addEventListener('ended', () => {
            video.pause();
            video.currentTime = 0;
        });
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
                inputSettings: { url, width: 1080, height: 1920, fps: 30, css: '' }
            });
        }
        res.json({ success: true, sourceName });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Setup/Update Gift Menu overlay source in OBS
router.post('/setup-gift-menu', async (_req, res) => {
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
        const sourceName = 'gift_menu_overlay';
        const url = `http://localhost:${PORT}/overlay/gift-menu/?t=${Date.now()}`;

        const { scenes } = await obsService.obs.call('GetSceneList');
        const sceneExists = scenes.find((s) => s.sceneName === sceneName);
        if (!sceneExists) {
            await obsService.obs.call('CreateScene', { sceneName });
        }

        const { sceneItems } = await obsService.obs.call('GetSceneItemList', { sceneName });
        let item = sceneItems.find((x) => x.sourceName === sourceName);

        if (!item) {
            await obsService.obs.call('CreateInput', {
                sceneName,
                inputName: sourceName,
                inputKind: 'browser_source',
                inputSettings: {
                    url,
                    width: 1080,
                    height: 1920,
                    fps: 120,
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
                    width: 1080,
                    height: 1920,
                    fps: 120,
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
            overlayUrl: `http://localhost:${PORT}/overlay/gift-menu/`
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});


// Trigger
router.post('/trigger', async (req, res) => {
    try {
        const { effectId, duration } = req.body;
        const effectQueue = require('../services/effectQueue');

        effectQueue.add(effectId, duration);
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

module.exports = router;

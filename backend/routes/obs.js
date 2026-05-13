const express = require('express');
const router = express.Router();
const obsService = require('../services/obsService');
const { authMiddleware } = require('../middleware/auth');
const Effect = require('../models/Effect');
const OBSSettings = require('../models/OBSSettings');
const jwt = require('jsonwebtoken');

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
    } catch (error) { res.status(500).send('Error: ' + error.message); }
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
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
// Trigger
router.post('/trigger', async (req, res) => {
    try {
        const { effectId, duration } = req.body;
        const effectQueue = require('../services/effectQueue');
        
        effectQueue.add(effectId, duration);
        res.json({ success: true, message: 'Added to queue' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;

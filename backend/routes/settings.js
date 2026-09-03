const express = require('express');
const router = express.Router();
const OBSSettings = require('../models/OBSSettings');
const obsService = require('../services/obsService');
const { authMiddleware } = require('../middleware/auth');

// OBS Settings — one document per account so a second account signing in on
// the same PC can neither read nor silently overwrite another account's OBS
// host/port/password.
async function findOrAdoptSettings(userId) {
    let settings = await OBSSettings.findOne({ userId });
    if (settings) return settings;
    const latest = await OBSSettings.findOne().sort({ updatedAt: -1 });
    if (latest) {
        return latest;
    }
    return null;
}

router.get('/obs', authMiddleware, async (req, res) => {
    try {
        let settings = await findOrAdoptSettings(req.userId);
        if (!settings) {
            settings = await OBSSettings.create({ userId: req.userId, host: '127.0.0.1', port: 4455, password: 'obs123' });
        }
        res.json({ success: true, ...settings.toObject({ getters: true }) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/obs', authMiddleware, async (req, res) => {
    try {
        const { host, port, password, selectedSceneName } = req.body;
        let settings = await findOrAdoptSettings(req.userId);
        if (settings) {
            settings.host = host;
            settings.port = port;
            settings.password = password;
            if (typeof selectedSceneName === 'string') {
                settings.selectedSceneName = selectedSceneName;
            }
            settings.updatedAt = Date.now();
            await settings.save();
        } else {
            settings = await OBSSettings.create({
                userId: req.userId,
                host,
                port,
                password,
                selectedSceneName: selectedSceneName || ''
            });
        }

        // Reconnect OBS with new settings
        await obsService.connect(host, port, password);

        // If a scene is selected and OBS is connected, prepare sources on that scene
        if (obsService.isConnected()) {
            const targetScene = settings.selectedSceneName || '';
            await obsService.ensureEffectPlayerSource(targetScene, req.userId).catch(() => {});
            await obsService.ensureGiftMenuOverlaySourceUrl(targetScene, req.userId).catch(() => {});
        }

        res.json({ success: true, message: 'Đã lưu cấu hình OBS' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

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
            settings = await OBSSettings.create({ userId: req.userId, host: 'localhost', port: 4455, password: 'obs123' });
        }
        res.json({ success: true, ...settings._doc });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/obs', authMiddleware, async (req, res) => {
    try {
        const { host, port, password } = req.body;
        let settings = await findOrAdoptSettings(req.userId);
        if (settings) {
            settings.host = host;
            settings.port = port;
            settings.password = password;
            settings.updatedAt = Date.now();
            await settings.save();
        } else {
            settings = await OBSSettings.create({ userId: req.userId, host, port, password });
        }

        // Reconnect OBS with new settings
        await obsService.connect(host, port, password);

        res.json({ success: true, message: 'Đã lưu cấu hình OBS' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

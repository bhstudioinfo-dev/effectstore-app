const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const GiftJarSettings = require('../models/GiftJarSettings');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { paths: dataPaths } = require('../config/dataPaths');

// Ensure upload directory
const jarsDir = path.join(dataPaths.uploadsDir, 'jars');
if (!fs.existsSync(jarsDir)) {
    fs.mkdirSync(jarsDir, { recursive: true });
}

const jarImageStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, jarsDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `jar_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
    }
});

const jarImageUpload = multer({
    storage: jarImageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ file ảnh PNG, JPG, WEBP hoặc SVG.'));
        }
    }
});

// Helper to get or create settings
async function getOrCreateJarSettings(userId) {
    if (!userId) {
        return {
            theme: 'glass',
            customJarImageUrl: '',
            targetCoins: 1000,
            currentCoins: 0,
            dropItemType: 'coin',
            autoResetOnTarget: true,
            celebrationSound: 'jackpot',
            isActive: true
        };
    }
    let settings = await GiftJarSettings.findOne({ userId });
    if (!settings) {
        settings = await GiftJarSettings.create({ userId });
    }
    return settings;
}

// GET settings
router.get('/settings', optionalAuthMiddleware, async (req, res) => {
    try {
        const settings = await getOrCreateJarSettings(req.userId);
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST settings
router.post('/settings', authMiddleware, async (req, res) => {
    try {
        const { theme, customJarImageUrl, targetCoins, dropItemType, autoResetOnTarget, celebrationSound, isActive } = req.body;
        
        let settings = await GiftJarSettings.findOne({ userId: req.userId });
        if (!settings) {
            settings = new GiftJarSettings({ userId: req.userId });
        }

        if (theme && ['glass', 'golden', 'chest', 'diamond', 'custom'].includes(theme)) {
            settings.theme = theme;
        }
        if (typeof customJarImageUrl === 'string') {
            settings.customJarImageUrl = customJarImageUrl;
        }
        if (Number.isFinite(Number(targetCoins)) && Number(targetCoins) > 0) {
            settings.targetCoins = Math.max(10, Math.min(1000000, Number(targetCoins)));
        }
        if (dropItemType && ['coin', 'gift_icon', 'heart', 'star', 'gem'].includes(dropItemType)) {
            settings.dropItemType = dropItemType;
        }
        if (typeof autoResetOnTarget === 'boolean') {
            settings.autoResetOnTarget = autoResetOnTarget;
        }
        if (typeof celebrationSound === 'string') {
            settings.celebrationSound = celebrationSound;
        }
        if (typeof isActive === 'boolean') {
            settings.isActive = isActive;
        }
        settings.updatedAt = new Date();

        await settings.save();

        // Broadcast settings update to OBS overlay
        req.app.locals.broadcastToClients?.('gift_jar_settings_updated', settings, req.userId);

        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST upload custom jar image
router.post('/upload-image', authMiddleware, jarImageUpload.single('jarImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Chưa chọn tệp ảnh hũ.' });
        }
        const customJarImageUrl = `/uploads/jars/${req.file.filename}`;

        let settings = await GiftJarSettings.findOne({ userId: req.userId });
        if (!settings) {
            settings = new GiftJarSettings({ userId: req.userId });
        }
        settings.theme = 'custom';
        settings.customJarImageUrl = customJarImageUrl;
        settings.updatedAt = new Date();
        await settings.save();

        req.app.locals.broadcastToClients?.('gift_jar_settings_updated', settings, req.userId);

        res.json({ success: true, customJarImageUrl, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST test drop simulation
router.post('/test-drop', authMiddleware, async (req, res) => {
    try {
        const coins = Number(req.body?.coins) || 10;
        const giftName = String(req.body?.giftName || 'Hoa Hồng').trim();
        const giftIcon = String(req.body?.giftIcon || '🌹').trim();
        const nickname = String(req.body?.nickname || 'Khán giả test').trim();

        let settings = await GiftJarSettings.findOne({ userId: req.userId });
        if (!settings) {
            settings = await GiftJarSettings.create({ userId: req.userId });
        }

        const newCoins = settings.currentCoins + coins;
        const reachedTarget = newCoins >= settings.targetCoins;
        
        if (reachedTarget && settings.autoResetOnTarget) {
            settings.currentCoins = 0;
        } else {
            settings.currentCoins = newCoins;
        }
        await settings.save();

        const dropPayload = {
            coins,
            giftName,
            giftIcon,
            nickname,
            currentCoins: settings.currentCoins,
            targetCoins: settings.targetCoins,
            reachedTarget,
            theme: settings.theme,
            customJarImageUrl: settings.customJarImageUrl,
            dropItemType: settings.dropItemType,
            celebrationSound: settings.celebrationSound,
            timestamp: Date.now()
        };

        req.app.locals.broadcastToClients?.('gift_jar_drop', dropPayload, req.userId);

        res.json({ success: true, dropPayload });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST reset coins
router.post('/reset-coins', authMiddleware, async (req, res) => {
    try {
        let settings = await GiftJarSettings.findOne({ userId: req.userId });
        if (!settings) {
            settings = new GiftJarSettings({ userId: req.userId });
        }
        settings.currentCoins = 0;
        settings.updatedAt = new Date();
        await settings.save();

        req.app.locals.broadcastToClients?.('gift_jar_reset', { currentCoins: 0, targetCoins: settings.targetCoins }, req.userId);

        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Error handling middleware for Multer errors
router.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError || error?.message?.includes('Chỉ hỗ trợ')) {
        return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
});

module.exports = router;

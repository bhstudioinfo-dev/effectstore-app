const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const tiktokService = require('../services/tiktokService');
const GiftMapping = require('../models/GiftMapping');
const GiftLog = require('../models/GiftLog');
const GiftConfig = require('../models/GiftConfig');
const Effect = require('../models/Effect');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const giftMenuLayoutPath = path.join(__dirname, '..', 'uploads', 'gift-menu-layout.json');
const giftGoalConfigPath = path.join(__dirname, '..', 'uploads', 'gift-goal-config.json');

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
router.post('/disconnect', async (req, res) => {
    await tiktokService.disconnect();
    res.json({ success: true });
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

// Available effects (compat endpoint for standalone mapping page)
router.get('/available-effects', async (req, res) => {
    try {
        const effects = await Effect.find({ isActive: true }).sort({ uses: -1 });
        res.json({ success: true, effects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/map-gift', authMiddleware, async (req, res) => {
    try {
        const { giftId, effectId, giftName, effectName, giftIcon } = req.body;
        const userId = req.userId;

        // Check plan limits
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const plan = user.subscription || 'free';
        const isAdmin = !!(user.isAdmin || user.email === 'admin@effectstore.vn');
        const limits = { 'free': 5, 'pro': 20, 'business': 100 };
        const maxMappings = limits[plan] || 5;

        const currentCount = await GiftMapping.countDocuments({ userId });
        const existing = await GiftMapping.findOne({ userId, giftId });

        if (!existing && !isAdmin && currentCount >= maxMappings) {
            return res.status(403).json({ 
                success: false, 
                error: `Gói ${plan.toUpperCase()} chỉ hỗ trợ tối đa ${maxMappings} mapping. Vui lòng nâng cấp!` 
            });
        }

        if (existing) {
            existing.effectId = effectId;
            existing.effectName = effectName;
            existing.giftName = giftName;
            existing.giftIcon = giftIcon;
            existing.updatedAt = Date.now();
            await existing.save();
            res.json({ success: true, mapping: existing });
        } else {
            const mapping = await GiftMapping.create({
                userId, giftId, effectId, giftName, effectName, giftIcon, isActive: true
            });
            res.json({ success: true, mapping });
        }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/mappings/:id', authMiddleware, async (req, res) => {
    try {
        await GiftMapping.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Toggle mapping
router.put('/mappings/:id/toggle', authMiddleware, async (req, res) => {
    try {
        const mapping = await GiftMapping.findOne({ _id: req.params.id, userId: req.userId });
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
        const mapping = await GiftMapping.findOne({ _id: mappingId, userId: req.userId }).populate('effectId');
        if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });
        
        const effectId = mapping.effectId._id || mapping.effectId;
        const duration = mapping.effectId.duration || 15;
        
        const PORT = process.env.PORT || 9000;
        await fetch(`http://localhost:${PORT}/api/obs/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ effectId, duration })
        });
        
        await GiftLog.create({
            giftId: mapping.giftId, giftName: mapping.giftName, effectId: mapping.effectId,
            triggeredAt: new Date(), sessionId: req.userId, userId: 'test', userName: 'Test User'
        });
        res.json({ success: true, message: 'Effect triggered!', duration });
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
        
        const effect = await Effect.findById(mapping.effectId);
        const duration = effect?.duration || 15;
        const PORT = process.env.PORT || 9000;
        
        await fetch(`http://localhost:${PORT}/api/obs/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ effectId: mapping.effectId, duration })
        });
        
        await GiftLog.create({
            giftId, giftName: mapping.giftName, effectId: mapping.effectId,
            triggeredAt: new Date(), sessionId: req.userId, userId: req.userId, userName: userName || 'Anonymous'
        });
        res.json({ success: true, triggered: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Gifts library
router.get('/gifts-library', async (req, res) => {
    try {
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

        const configs = await GiftConfig.find();
        const coinsMap = {};
        configs.forEach(c => coinsMap[c.giftId] = c.coins);

        const gifts = defaultGifts.map(g => ({
            ...g,
            coins: coinsMap[g.id] || g.coins
        }));

        res.json({ success: true, gifts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Gift Menu Designer layout (local JSON storage, DB-independent)
router.get('/gift-menu-layout', async (_req, res) => {
    try {
        if (!fs.existsSync(giftMenuLayoutPath)) {
            return res.json({
                success: true,
                layout: {
                    version: 2,
                    aspectRatio: '9:16',
                    canvasSize: { width: 720, height: 960 },
                    exportSize: { width: 1080, height: 1920 },
                    items: [],
                    exportedItems: []
                }
            });
        }
        const raw = fs.readFileSync(giftMenuLayoutPath, 'utf8');
        const layout = JSON.parse(raw || '{}');
        res.json({ success: true, layout });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/gift-menu-layout', async (req, res) => {
    try {
        const payload = req.body || {};
        const safeLayout = {
            version: 2,
            savedAt: new Date().toISOString(),
            aspectRatio: payload.aspectRatio || '9:16',
            canvasSize: payload.canvasSize || { width: 720, height: 960 },
            safeArea: payload.safeArea || null,
            exportSize: payload.exportSize || { width: 1080, height: 1920 },
            items: Array.isArray(payload.items) ? payload.items : [],
            exportedItems: Array.isArray(payload.exportedItems) ? payload.exportedItems : []
        };
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(safeLayout, null, 2), 'utf8');
        res.json({ success: true, layout: safeLayout });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gift Goal Tracker config/state
router.get('/goal-tracker/config', async (_req, res) => {
    try {
        if (!fs.existsSync(giftGoalConfigPath)) {
            return res.json({
                success: true,
                config: {
                    title: 'Mở quà đặc biệt 🎁',
                    goals: [],
                    layout: {
                        canvasWidth: 720,
                        canvasHeight: 1280,
                        x: 80,
                        y: 80,
                        width: 560,
                        height: 220
                    },
                    style: {
                        preset: 'neon',
                        glow: 1,
                        accentColor: '#b287ff'
                    }
                }
            });
        }
        const raw = fs.readFileSync(giftGoalConfigPath, 'utf8');
        const config = JSON.parse(raw || '{}');
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/goal-tracker/state', async (_req, res) => {
    try {
        res.json({ success: true, state: tiktokService.getGoalState() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/goal-tracker/config', async (req, res) => {
    try {
        const payload = req.body || {};
        const safeConfig = {
            title: payload.title || 'Mở quà đặc biệt 🎁',
            goals: Array.isArray(payload.goals) ? payload.goals.map((goal) => ({
                id: goal.id || `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                giftId: goal.giftId || '',
                giftName: goal.giftName || '',
                giftIcon: goal.giftIcon || '',
                target: Math.max(1, parseInt(goal.target, 10) || 1),
                current: Math.max(0, parseInt(goal.current, 10) || 0)
            })) : [],
            layout: {
                canvasWidth: Math.max(1, parseInt(payload?.layout?.canvasWidth, 10) || 720),
                canvasHeight: Math.max(1, parseInt(payload?.layout?.canvasHeight, 10) || 1280),
                x: Math.max(0, parseInt(payload?.layout?.x, 10) || 80),
                y: Math.max(0, parseInt(payload?.layout?.y, 10) || 80),
                width: Math.max(200, parseInt(payload?.layout?.width, 10) || 560),
                height: Math.max(120, parseInt(payload?.layout?.height, 10) || 220)
            },
            style: {
                preset: ['neon', 'aurora', 'holo', 'electric', 'plasma', 'sunset'].includes(payload?.style?.preset)
                    ? payload.style.preset
                    : 'neon',
                glow: Math.max(0.4, Math.min(2, parseFloat(payload?.style?.glow) || 1)),
                accentColor: String(payload?.style?.accentColor || '#b287ff')
            }
        };

        fs.writeFileSync(giftGoalConfigPath, JSON.stringify(safeConfig, null, 2), 'utf8');
        tiktokService.setGoalConfig(safeConfig);

        res.json({ success: true, config: safeConfig, state: tiktokService.getGoalState() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/goal-tracker/reset', async (_req, res) => {
    try {
        if (fs.existsSync(giftGoalConfigPath)) {
            const raw = fs.readFileSync(giftGoalConfigPath, 'utf8');
            const config = JSON.parse(raw || '{}');
            config.goals = Array.isArray(config.goals)
                ? config.goals.map((goal) => ({ ...goal, current: 0 }))
                : [];
            fs.writeFileSync(giftGoalConfigPath, JSON.stringify(config, null, 2), 'utf8');
            tiktokService.setGoalConfig(config);
        } else {
            tiktokService.resetGoalProgress();
        }

        res.json({ success: true, state: tiktokService.getGoalState() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

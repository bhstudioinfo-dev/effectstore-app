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
const GiftMenuLayout = require('../models/GiftMenuLayout');
const giftMenuLayoutPath = path.join(__dirname, '..', 'uploads', 'gift-menu-layout.json');

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
        const limits = { 'free': 5, 'pro': 20, 'business': 100, 'studio': 9999 };
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

        const giftIconDir = path.join(__dirname, '..', 'assets', 'gift-icons');
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
        res.json({ success: true, layouts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/gift-menu-templates', async (_req, res) => {
    try {
        const templates = await GiftMenuLayout.find({ isTemplate: true }).sort({ updatedAt: -1 });
        res.json({ success: true, templates });
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
        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!layout) {
            layout = await GiftMenuLayout.findOne({ userId: req.userId });
            if (layout) {
                layout.isActive = true;
                await layout.save();
            }
        }
        if (!layout) {
            layout = new GiftMenuLayout({
                userId: req.userId,
                name: 'Menu mặc định',
                aspectRatio: '9:16',
                items: [],
                exportedItems: [],
                isActive: true
            });
            await layout.save();
        }
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout', authMiddleware, async (req, res) => {
    try {
        const payload = req.body || {};
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
            }
            return res.json({ success: true, layout: renamedLayout });
        }

        let layout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!layout && (payload._id || payload.id)) {
            layout = await GiftMenuLayout.findOne({ _id: payload._id || payload.id, userId: req.userId });
        }
        if (!layout) {
            layout = new GiftMenuLayout({
                userId: req.userId,
                name: payload.name || 'Menu mặc định',
                isActive: true
            });
        }
        layout.name = payload.name || layout.name || 'Menu mặc định';
        layout.aspectRatio = payload.aspectRatio || '9:16';
        layout.items = Array.isArray(payload.items) ? payload.items : [];
        layout.exportedItems = Array.isArray(payload.exportedItems) ? payload.exportedItems : [];
        await layout.save();
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-menu-layout/create', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        await GiftMenuLayout.updateMany({ userId: req.userId }, { isActive: false });
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
        await GiftMenuLayout.updateMany({ userId: req.userId }, { isActive: false });
        const layout = await GiftMenuLayout.findOneAndUpdate(
            { _id: layoutId, userId: req.userId },
            { isActive: true },
            { new: true }
        );
        if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        res.json({ success: true, layout });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/gift-menu-layout/:layoutId', authMiddleware, async (req, res) => {
    try {
        const { layoutId } = req.params;
        const layout = await GiftMenuLayout.findOneAndDelete({ _id: layoutId, userId: req.userId });
        if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
        if (layout.isActive) {
            const nextLayout = await GiftMenuLayout.findOne({ userId: req.userId });
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
        const isAdmin = !!(user && (user.isAdmin || user.email === 'admin@effectstore.vn'));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });
        const activeLayout = await GiftMenuLayout.findOne({ userId: req.userId, isActive: true });
        if (!activeLayout) return res.status(400).json({ success: false, error: 'No active layout to publish' });
        const template = new GiftMenuLayout({
            name: activeLayout.name + ' - Template',
            aspectRatio: activeLayout.aspectRatio,
            items: activeLayout.items,
            exportedItems: activeLayout.exportedItems,
            isTemplate: true
        });
        await template.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});


// Goal Board mock/fallback routes to avoid frontend console crashes
router.get('/goal-board/assets', authMiddleware, async (req, res) => {
    res.json({ success: true, assets: [] });
});

router.get('/goal-board/templates', authMiddleware, async (req, res) => {
    res.json({ success: true, customTemplates: [] });
});

router.post('/goal-board/upload-asset', authMiddleware, async (req, res) => {
    res.status(501).json({ success: false, error: 'Asset upload chưa được hỗ trợ ở phiên bản hiện tại.' });
});

module.exports = router;


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
        [...defaultGifts, ...fileGifts].forEach((gift) => {
            if (!mergedById.has(gift.id)) mergedById.set(gift.id, gift);
        });

        const gifts = [...mergedById.values()].map(g => ({
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


// ==========================================
// GOAL BOARD ENDPOINTS (PHASE 1)
// ==========================================

const multer = require('multer');
const goalBoardLayoutPath = path.join(__dirname, '..', 'uploads', 'goal-board-layout.json');

// Configure multer storage
const goalAssetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads', 'goal'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, 'asset-' + uniqueSuffix + ext);
    }
});

const uploadGoalAsset = multer({
    storage: goalAssetStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.webm', '.mp4'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép tải lên các định dạng PNG, JPG, JPEG, WEBP, GIF, WEBM, MP4.'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// GET active Goal Board layout
router.get('/goal-board/layout', async (_req, res) => {
    try {
        if (!fs.existsSync(goalBoardLayoutPath)) {
            return res.json({
                success: true,
                layout: {
                    version: 1,
                    savedAt: new Date().toISOString(),
                    aspectRatio: '9:16',
                    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
                    layers: []
                }
            });
        }
        const raw = fs.readFileSync(goalBoardLayoutPath, 'utf8');
        const layout = JSON.parse(raw || '{}');
        res.json({ success: true, layout });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST active Goal Board layout
router.post('/goal-board/layout', async (req, res) => {
    try {
        const payload = req.body || {};
        const safeLayout = {
            version: 1,
            savedAt: new Date().toISOString(),
            aspectRatio: payload.aspectRatio || '9:16',
            canvas: payload.canvas || { width: 1080, height: 1920, aspectRatio: '9:16' },
            layers: Array.isArray(payload.layers) ? payload.layers : []
        };
        fs.writeFileSync(goalBoardLayoutPath, JSON.stringify(safeLayout, null, 2), 'utf8');
        
        // Update live service memory cache
        tiktokService.setGoalBoardLayout(safeLayout);
        
        // Broadcast layout update to WebSocket clients
        if (tiktokService.broadcast) {
            tiktokService.broadcast('goal_board_layout_update', { type: 'goal_board_layout_update', layout: safeLayout });
        }
        
        res.json({ success: true, layout: safeLayout });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET all static Assets scanned from backend/assets/goal/ and backend/uploads/goal/
router.get('/goal-board/assets', async (_req, res) => {
    try {
        const assetsGoalDir = path.join(__dirname, '..', 'assets', 'goal');
        const uploadsGoalDir = path.join(__dirname, '..', 'uploads', 'goal');
        
        let files = [];
        
        if (fs.existsSync(assetsGoalDir)) {
            const list = fs.readdirSync(assetsGoalDir);
            list.forEach(file => {
                const ext = path.extname(file).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.webm', '.mp4'].includes(ext)) {
                    files.push({
                        name: file,
                        url: `/assets/goal/${file}`,
                        type: ext === '.webm' || ext === '.mp4' ? 'video' : 'image'
                    });
                }
            });
        }
        
        if (fs.existsSync(uploadsGoalDir)) {
            const list = fs.readdirSync(uploadsGoalDir);
            list.forEach(file => {
                const ext = path.extname(file).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.webm', '.mp4'].includes(ext)) {
                    files.push({
                        name: file,
                        url: `/uploads/goal/${file}`,
                        type: ext === '.webm' || ext === '.mp4' ? 'video' : 'image'
                    });
                }
            });
        }
        
        res.json({ success: true, assets: files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST Upload custom asset PNG/WebM/etc.
router.post('/goal-board/upload-asset', (req, res) => {
    uploadGoalAsset.single('assetFile')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Vui lòng chọn file để tải lên.' });
        }
        
        const ext = path.extname(req.file.originalname).toLowerCase();
        const asset = {
            name: req.file.filename,
            url: `/uploads/goal/${req.file.filename}`,
            type: ext === '.webm' || ext === '.mp4' ? 'video' : 'image'
        };
        
        res.json({ success: true, asset });
    });
});

// GET custom & system templates
const goalBoardTemplatesPath = path.join(__dirname, '..', 'uploads', 'goal-board-templates.json');

router.get('/goal-board/templates', async (req, res) => {
    try {
        let customTemplates = [];
        if (fs.existsSync(goalBoardTemplatesPath)) {
            const raw = fs.readFileSync(goalBoardTemplatesPath, 'utf8');
            customTemplates = JSON.parse(raw || '[]');
        }
        res.json({ success: true, customTemplates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST save a new custom template
router.post('/goal-board/templates', async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.name || !Array.isArray(payload.layers)) {
            return res.status(400).json({ success: false, error: 'Missing name or layers array' });
        }

        // Create uploads folder if not exists
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        let customTemplates = [];
        if (fs.existsSync(goalBoardTemplatesPath)) {
            const raw = fs.readFileSync(goalBoardTemplatesPath, 'utf8');
            customTemplates = JSON.parse(raw || '[]');
        }

        const newTemplate = {
            id: payload.id || `custom_tmpl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: payload.name,
            category: payload.category || 'user-custom',
            tags: Array.isArray(payload.tags) ? payload.tags : [payload.category || 'custom'],
            isPremium: payload.isPremium !== undefined ? Boolean(payload.isPremium) : false,
            price: Number(payload.price || 0),
            author: 'user',
            editable: true,
            canvas: payload.canvas || { width: 1080, height: 1920, aspectRatio: '9:16' },
            layers: payload.layers
        };

        // Prepend so latest custom templates appear first in sidebar
        customTemplates.unshift(newTemplate);

        fs.writeFileSync(goalBoardTemplatesPath, JSON.stringify(customTemplates, null, 2), 'utf8');

        res.json({ success: true, template: newTemplate, customTemplates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST simulate goal board gift
router.post('/goal-board/simulate', async (req, res) => {
    try {
        const { giftId, giftName, repeatCount, diamondCount, nickname, iconUrl } = req.body || {};
        
        await tiktokService.processGoalBoardGift({
            giftId: giftId || 'rose',
            giftName: giftName || 'Rose',
            repeatCount: Number(repeatCount) || 1,
            diamondCount: Number(diamondCount) || 1,
            nickname: nickname || 'Người dùng Thử nghiệm',
            iconUrl: iconUrl || '/assets/gift-icons/Rose.png'
        });
        
        res.json({ success: true, message: 'Simulated gift processed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;


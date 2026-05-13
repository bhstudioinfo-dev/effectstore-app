const express = require('express');
const router = express.Router();
const Effect = require('../models/Effect');
const User = require('../models/User');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { encryptVideo, streamDecryptedVideo } = require('../utils/encrypt-video');

// Ensure directories
const encryptedEffectsDir = path.join(__dirname, '..', 'effects', 'encrypted');
const previewsDir = path.join(__dirname, '..', 'uploads', 'previews');
const thumbsDir = path.join(__dirname, '..', 'uploads', 'thumbs');

// Get all effects
router.get('/effects', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = { isActive: true };
        if (category && category !== 'all') query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        
        const effects = await Effect.find(query).sort({ uses: -1 });
        res.json({ success: true, effects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get trending effects
router.get('/effects/trending', async (req, res) => {
    try {
        const effects = await Effect.find({ isActive: true })
            .sort({ uses: -1 })
            .limit(5);
        res.json({ success: true, effects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single effect
router.get('/effects/item/:id', async (req, res) => {
    try {
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, message: 'Effect not found' });
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user effects
router.get('/user/effects', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).populate('purchasedEffects.effectId');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isAdmin = !!(user.isAdmin || user.hasAdminUI || user.email === 'admin@effectstore.vn');
        
        if (isAdmin) {
            const effects = await Effect.find({ isActive: true }).sort({ createdAt: -1 });
            return res.json({ success: true, effects, libraryType: 'admin_all' });
        }

        const ownedEffects = user.purchasedEffects.map(pe => pe.effectId).filter(Boolean);
        res.json({ success: true, effects: ownedEffects, libraryType: 'purchased' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stream video (matching old path /api/stream/effect/:effectId)
router.get('/stream/effect/:effectId', async (req, res) => {
    try {
        const effectId = req.params.effectId;
        const effect = await Effect.findById(effectId);
        if (!effect) return res.status(404).json({ error: 'Not found' });

        let streamPath = effect.previewFilePath;
        
        // Fallback 1: Try to extract filename from previewUrl or fileUrl
        if (!streamPath || !fs.existsSync(streamPath)) {
            const urlToCheck = effect.previewUrl || effect.fileUrl;
            if (urlToCheck) {
                const fileName = path.basename(urlToCheck.split('?')[0]);
                const potentialPath = path.join(previewsDir, fileName);
                if (fs.existsSync(potentialPath)) {
                    streamPath = potentialPath;
                }
            }
        }

        // Fallback 2: Search by effectId in previews directory
        if (!streamPath || !fs.existsSync(streamPath)) {
            if (fs.existsSync(previewsDir)) {
                const files = fs.readdirSync(previewsDir);
                const effectFile = files.find(f => f.startsWith(effectId) && f.endsWith('.webm'));
                if (effectFile) { streamPath = path.join(previewsDir, effectFile); }
            }
        }

        // Fallback 3: Try encrypted path
        if (!streamPath || !fs.existsSync(streamPath)) {
            if (effect.encryptedFilePath) streamPath = effect.encryptedFilePath;
        }

        if (!streamPath || !fs.existsSync(streamPath)) {
            console.error(`❌ Video file NOT FOUND for effect ${effect.name} (${effectId})`);
            console.error(`   Attempted path: ${streamPath}`);
            return res.status(404).json({ error: 'Video file not found' });
        }

        if (streamPath.includes('encrypted')) {
            streamDecryptedVideo(streamPath, req, res);
        } else {
            const stats = fs.statSync(streamPath);
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Length', stats.size);
            const stream = fs.createReadStream(streamPath);
            stream.pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Multer config for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/temp/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage });

// Helper for video duration
function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', filePath
        ]);
        let output = '';
        ffprobe.stdout.on('data', (data) => { output += data.toString(); });
        ffprobe.on('close', (code) => {
            if (code === 0 && output.trim()) resolve(parseFloat(output.trim()));
            else resolve(15);
        });
        ffprobe.on('error', () => resolve(15));
    });
}

// Create Effect (Admin)
router.post('/effects', authMiddleware, adminMiddleware, upload.any(), async (req, res) => {
    try {
        const { name, category, price, originalPrice, description, icon, isComposite, timeline } = req.body;
        const effectData = {
            name, category,
            price: parseFloat(price),
            originalPrice: parseFloat(originalPrice) || 0,
            description, icon: icon || '🎬',
            isActive: true,
            isComposite: isComposite === 'true' || isComposite === true,
            timeline: timeline ? (typeof timeline === 'string' ? JSON.parse(timeline) : timeline) : {}
        };
        
        const effectFile = req.files ? req.files.find(f => f.fieldname === 'effectFile') : null;
        const thumbFile = req.files ? req.files.find(f => f.fieldname === 'thumb') : null;
        
        if (effectFile) {
            const effectId = Date.now().toString();
            const previewPath = path.join(previewsDir, `${effectId}.webm`);
            fs.copyFileSync(effectFile.path, previewPath);
            const duration = await getVideoDuration(previewPath);
            const encryptedPath = path.join(encryptedEffectsDir, `${effectId}.enc`);
            await encryptVideo(effectFile.path, encryptedPath);
            
            effectData.previewFilePath = previewPath;
            effectData.encryptedFilePath = encryptedPath;
            effectData.duration = duration;
            effectData.fileUrl = `/api/stream/effect/${effectId}`;
            effectData.previewUrl = `/uploads/previews/${effectId}.webm`;
            effectData.fileSize = fs.statSync(previewPath).size;
            try { fs.unlinkSync(effectFile.path); } catch (e) {}
        }

        if (thumbFile) {
            const thumbPath = path.join(thumbsDir, `${Date.now()}.png`);
            fs.copyFileSync(thumbFile.path, thumbPath);
            effectData.thumbFilePath = thumbPath;
            effectData.thumbUrl = `/uploads/thumbs/${path.basename(thumbPath)}`;
            try { fs.unlinkSync(thumbFile.path); } catch (e) {}
        }
        
        const effect = await Effect.create(effectData);
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Effect (Admin)
router.post('/effects/:id/update', authMiddleware, adminMiddleware, upload.any(), async (req, res) => {
    try {
        const { name, category, price, originalPrice, fakeUses, isTrending, isFlashSale, flashSalePrice, flashSaleEndsAt, description, icon } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });

        if (name) effect.name = name;
        if (category) effect.category = category;
        if (price) effect.price = parseFloat(price);
        if (originalPrice) effect.originalPrice = parseFloat(originalPrice);
        if (fakeUses) effect.uses = parseInt(fakeUses) || 0;
        if (description) effect.description = description;
        if (icon) effect.icon = icon;

        effect.isTrending = isTrending === 'true' || isTrending === true;
        effect.isFlashSale = isFlashSale === 'true' || isFlashSale === true;
        if (flashSalePrice) effect.flashSalePrice = parseFloat(flashSalePrice);
        if (flashSaleEndsAt) effect.flashSaleEndsAt = new Date(flashSaleEndsAt);

        const thumbFile = req.files ? req.files.find(f => f.fieldname === 'thumb') : null;
        if (thumbFile) {
            const thumbPath = path.join(thumbsDir, `${effect._id}.png`);
            fs.copyFileSync(thumbFile.path, thumbPath);
            effect.thumbFilePath = thumbPath;
            effect.thumbUrl = `/uploads/thumbs/${effect._id}.png`;
            try { fs.unlinkSync(thumbFile.path); } catch (e) {}
        }

        await effect.save();
        res.json({ success: true, effect });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Effect (Admin)
router.delete('/effects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const effect = await Effect.findById(req.params.id);
        if (effect) {
            if (effect.previewFilePath && fs.existsSync(effect.previewFilePath)) fs.unlinkSync(effect.previewFilePath);
            if (effect.encryptedFilePath && fs.existsSync(effect.encryptedFilePath)) fs.unlinkSync(effect.encryptedFilePath);
        }
        await Effect.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Timeline Routes
router.get('/effects/:id/timeline', authMiddleware, async (req, res) => {
    try {
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ error: 'Effect not found' });
        res.json({ success: true, timeline: effect.timeline || {}, isComposite: effect.isComposite || false });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/effects/:id/timeline', authMiddleware, async (req, res) => {
    try {
        const { timeline, config, isComposite } = req.body;
        const effect = await Effect.findById(req.params.id);
        if (!effect) return res.status(404).json({ success: false, error: 'Effect not found' });
        effect.timeline = config ? { config } : (timeline || []);
        effect.isComposite = isComposite || false;
        effect.markModified('timeline');
        await effect.save();
        res.json({ success: true, message: 'Timeline updated', timeline: effect.timeline });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;

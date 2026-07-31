const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Effect = require('../models/Effect');
const Payment = require('../models/Payment');
const EffectRequest = require('../models/EffectRequest');
const GiftConfig = require('../models/GiftConfig');
const Banner = require('../models/Banner');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { paths: dataPaths } = require('../config/dataPaths');
const {
    createDatabaseBackup,
    listDatabaseBackups,
    restoreDatabaseBackup
} = require('../services/databaseBackupService');
const { runSchemaMigrations } = require('../services/schemaMigrationService');

const imageUploadOptions = {
    dest: dataPaths.tempDir,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
    fileFilter: (_req, file, callback) => {
        const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']).has(path.extname(file.originalname || '').toLowerCase());
        callback(allowed ? null : new Error('Unsupported image upload.'), allowed);
    }
};
const upload = multer(imageUploadOptions);
const iconUpload = multer(imageUploadOptions);

router.get('/database/backups', authMiddleware, adminMiddleware, async (_req, res) => {
    try {
        return res.json({ success: true, backups: await listDatabaseBackups() });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Không thể tải danh sách backup.' });
    }
});

router.post('/database/backup', authMiddleware, adminMiddleware, async (_req, res) => {
    try {
        return res.status(201).json({ success: true, backup: await createDatabaseBackup() });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Không thể tạo database backup.' });
    }
});

router.post('/database/restore/:filename', authMiddleware, adminMiddleware, async (req, res) => {
    if (req.body?.confirmation !== 'RESTORE_MERGE') {
        return res.status(400).json({ success: false, error: 'Cần xác nhận RESTORE_MERGE.' });
    }
    try {
        const safetyBackup = await createDatabaseBackup();
        const restored = await restoreDatabaseBackup(req.params.filename);
        await runSchemaMigrations();
        return res.json({ success: true, restored, safetyBackup });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Không thể phục hồi database backup.' });
    }
});

// Dashboard Data (Stats + Recent Payments)
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const [totalEffects, totalUsers, totalRevenue, pendingPayments, recentPayments] = await Promise.all([
            Effect.countDocuments(),
            User.countDocuments(),
            Payment.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Payment.countDocuments({ status: 'pending' }),
            Payment.find().sort({ createdAt: -1 }).limit(10).lean()
        ]);

        res.json({
            success: true,
            stats: {
                totalEffects,
                totalUsers,
                totalRevenue: totalRevenue[0]?.total || 0,
                pendingPayments
            },
            recentPayments
        });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Stats (Legacy)
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalEffects = await Effect.countDocuments();
        const totalUsers = await User.countDocuments();
        const totalRevenue = await Payment.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
        const pendingPayments = await Payment.countDocuments({ status: 'pending' });
        res.json({ success: true, stats: { totalEffects, totalUsers, totalRevenue: totalRevenue[0]?.total || 0, pendingPayments } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Users (matching /api/admin/users)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, users });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/effect-acquisitions', authMiddleware, adminMiddleware, async (_req, res) => {
    try {
        const users = await User.find({ isAdmin: { $ne: true } })
            .select('name email phone subscription purchasedEffects')
            .populate('purchasedEffects.effectId', 'name category icon price')
            .lean();

        const records = [];
        for (const user of users) {
            for (const purchase of user.purchasedEffects || []) {
                if (!purchase.effectId) continue;
                records.push({
                    user: {
                        id: String(user._id),
                        name: user.name || 'Chưa đặt tên',
                        email: user.email,
                        phone: user.phone || '',
                        subscription: user.subscription || 'free'
                    },
                    effect: {
                        id: String(purchase.effectId._id),
                        name: purchase.effectId.name,
                        icon: purchase.effectId.icon || '🎬',
                        category: purchase.effectId.category
                    },
                    acquiredAt: purchase.purchasedAt,
                    acquisitionType: purchase.acquisitionType || (Number(purchase.acquisitionPrice) === 0 ? 'free' : 'legacy'),
                    acquisitionPrice: Number.isFinite(Number(purchase.acquisitionPrice))
                        ? Number(purchase.acquisitionPrice)
                        : null,
                    useCount: Number(purchase.useCount || 0),
                    lastUsedAt: purchase.lastUsedAt || null
                });
            }
        }
        records.sort((a, b) => new Date(b.acquiredAt || 0) - new Date(a.acquiredAt || 0));
        return res.json({
            success: true,
            summary: {
                totalAcquisitions: records.length,
                freeAcquisitions: records.filter((record) => record.acquisitionType === 'free').length,
                paidAcquisitions: records.filter((record) => record.acquisitionType === 'paid').length,
                totalUses: records.reduce((sum, record) => sum + record.useCount, 0)
            },
            records
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/users/:userId/subscription', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { plan, durationDays, extend } = req.body;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        user.subscription = plan;
        if (plan !== 'free') {
            const exp = new Date();
            exp.setDate(exp.getDate() + (parseInt(durationDays) || 30));
            user.subscriptionExpiresAt = exp;
        } else {
            user.subscriptionExpiresAt = null;
        }

        await user.save();
        res.json({ success: true, user });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.isAdmin) return res.status(400).json({ success: false, error: 'Cannot delete admin' });

        await User.findByIdAndDelete(req.params.userId);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Effect Requests (matching /api/effect-requests and /api/admin/effect-requests)
router.post('/effect-requests', async (req, res) => {
    try {
        const { name, phone, description } = req.body;
        const newReq = await EffectRequest.create({ name, phone, description });
        res.json({ success: true, message: 'Gửi yêu cầu thành công!', request: newReq });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/effect-requests', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const requests = await EffectRequest.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, requests });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/effect-requests/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const request = await EffectRequest.findByIdAndUpdate(
            req.params.id,
            { status: status || 'pending' },
            { new: true }
        );
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
        res.json({ success: true, request });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all effects for admin (matching /api/admin/effects)

// Get all effects for admin
router.get('/effects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const effects = await Effect.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, effects });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Gift Coins Management
router.get('/gift-coins', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const configs = await GiftConfig.find().sort({ coins: 1 }).lean();
        res.json({ success: true, configs });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/gift-coins/:giftId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { coins, giftName } = req.body;
        const config = await GiftConfig.findOneAndUpdate(
            { giftId: req.params.giftId },
            { coins, giftName: giftName || req.params.giftId, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true, config });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-coins/bulk-update', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { updates } = req.body;
        const results = [];
        for (const update of updates) {
            const config = await GiftConfig.findOneAndUpdate(
                { giftId: update.giftId },
                { coins: update.coins, giftName: update.giftName || update.giftId, updatedAt: new Date() },
                { upsert: true, new: true }
            );
            results.push(config);
        }
        res.json({ success: true, results });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Gift Icons Management
router.get('/gift-icons', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const iconsDir = dataPaths.runtimeGiftIconsDir;
        if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
        const files = fs.readdirSync(iconsDir);
        const icons = files.filter(f => /\.(png|jpg|jpeg|gif|svg)$/i.test(f)).map(f => ({
            id: path.parse(f).name.toLowerCase().replace(/[-_]/g, '_'),
            name: path.parse(f).name.replace(/_/g, ' '),
            icon: `/assets/gift-icons/${f}`
        }));
        res.json({ success: true, icons });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/gift-icons/upload', authMiddleware, adminMiddleware, iconUpload.single('icon'), async (req, res) => {
    try {
        const { giftId } = req.body;
        if (!giftId || !req.file) {
            return res.status(400).json({ success: false, message: 'Missing giftId or icon file' });
        }

        const iconsDir = dataPaths.runtimeGiftIconsDir;
        if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

        const safeGiftId = String(giftId).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const targetName = `${safeGiftId}${path.extname(req.file.originalname || '.png')}`;
        const targetPath = path.join(iconsDir, targetName);

        fs.copyFileSync(req.file.path, targetPath);
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        res.json({ success: true, icon: `/assets/gift-icons/${targetName}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/gift-icons/add', authMiddleware, adminMiddleware, iconUpload.single('icon'), async (req, res) => {
    try {
        const { giftId, name } = req.body;
        if (!giftId || !name || !req.file) {
            return res.status(400).json({ success: false, message: 'Missing giftId, name or icon file' });
        }

        const iconsDir = dataPaths.runtimeGiftIconsDir;
        if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

        const safeGiftId = String(giftId).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const fileName = `${safeGiftId}${path.extname(req.file.originalname || '.png')}`;
        const targetPath = path.join(iconsDir, fileName);
        fs.copyFileSync(req.file.path, targetPath);
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        await GiftConfig.findOneAndUpdate(
            { giftId: safeGiftId },
            { giftName: name, coins: 1, updatedAt: new Date() },
            { upsert: true, new: true }
        );

        res.json({ success: true, gift: { id: safeGiftId, name, icon: `/assets/gift-icons/${fileName}` } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/gift-icons/:giftId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const iconsDir = dataPaths.runtimeGiftIconsDir;
        const safeGiftId = String(req.params.giftId).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!fs.existsSync(iconsDir)) return res.json({ success: true });

        const files = fs.readdirSync(iconsDir);
        files.forEach(file => {
            const base = path.parse(file).name.toLowerCase().replace(/[-_]/g, '_');
            if (base === safeGiftId || base === safeGiftId.replace(/_/g, ' ')) {
                const filePath = path.join(iconsDir, file);
                try { fs.unlinkSync(filePath); } catch (e) { }
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/gift-coins/reset', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await GiftConfig.updateMany({}, { $set: { coins: 1, updatedAt: new Date() } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/payments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!require('../utils/accessControl').isValidResourceId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment ID' });
        }
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
        const value = payment.toObject();
        value.proofImage = payment.proofImage
            ? `/api/payment/admin/proof/${encodeURIComponent(path.basename(payment.proofImage))}`
            : null;
        res.json({ success: true, payment: value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError || error?.message === 'Unsupported image upload.') {
        return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
});

module.exports = router;

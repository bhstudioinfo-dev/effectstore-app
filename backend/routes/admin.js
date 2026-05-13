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

const upload = multer({ dest: 'uploads/temp/' });

// Dashboard Data (Stats + Recent Payments)
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalEffects = await Effect.countDocuments();
        const totalUsers = await User.countDocuments();
        const totalRevenue = await Payment.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
        const pendingPayments = await Payment.countDocuments({ status: 'pending' });
        
        const recentPayments = await Payment.find()
            .sort({ createdAt: -1 })
            .limit(10);

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
        const users = await User.find().sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/users/:userId/subscription', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { plan, durationDays } = req.body;
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
        const requests = await EffectRequest.find().sort({ createdAt: -1 });
        res.json({ success: true, requests });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Get all effects for admin (matching /api/admin/effects)

// Get all effects for admin
router.get('/effects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const effects = await Effect.find().sort({ createdAt: -1 });
        res.json({ success: true, effects });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Gift Coins Management
router.get('/gift-coins', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let configs = await GiftConfig.find().sort({ coins: 1 });
        res.json({ success: true, configs });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/gift-coins/:giftId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { coins } = req.body;
        const config = await GiftConfig.findOneAndUpdate(
            { giftId: req.params.giftId },
            { coins, updatedAt: new Date() },
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
                { coins: update.coins, updatedAt: new Date() },
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
        const iconsDir = path.join(__dirname, '../assets/gift-icons');
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

module.exports = router;

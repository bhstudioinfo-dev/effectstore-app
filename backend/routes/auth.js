const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, phone, machineId } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email và mật khẩu là bắt buộc' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email đã tồn tại' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const isAdmin = email.toLowerCase() === 'admin@effectstore.vn';

        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            name: name || email.split('@')[0],
            phone: phone || 'N/A',
            machineId: machineId || null,
            activeDevices: machineId ? [machineId] : [],
            isAdmin,
            hasAdminUI: isAdmin
        });

        const token = jwt.sign(
            { userId: user._id, isAdmin },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                isAdmin,
                hasAdminUI: isAdmin
            }
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password, machineId } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email và mật khẩu là bắt buộc' });
        }

        const normalizedEmail = email.toLowerCase();
        let user = await User.findOne({ email: normalizedEmail });

        if (!user && normalizedEmail === 'admin@effectstore.vn') {
            const defaultAdminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);
            user = await User.create({
                email: normalizedEmail,
                password: hashedPassword,
                name: 'Admin',
                phone: 'N/A',
                isAdmin: true,
                hasAdminUI: true
            });
            console.log('✅ Auto-created default admin account: admin@effectstore.vn');
        }

        if (!user) {
            return res.status(401).json({ success: false, error: 'Tài khoản không tồn tại' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, error: 'Sai mật khẩu' });
        }

        const isAdmin = !!(user.isAdmin || user.hasAdminUI || normalizedEmail === 'admin@effectstore.vn');

        // DEVICE LIMIT
        if (!isAdmin && machineId) {
            const plan = user.subscription || 'free';
            const deviceLimits = { 'free': 1, 'pro': 2, 'business': 5 };
            const maxDevices = deviceLimits[plan] || 1;

            if (!user.activeDevices) user.activeDevices = [];

            if (!user.activeDevices.includes(machineId)) {
                if (user.activeDevices.length >= maxDevices) {
                    return res.status(403).json({ 
                        success: false, 
                        error: `Tài khoản gói ${plan.toUpperCase()} chỉ được đăng nhập trên ${maxDevices} thiết bị. Vui lòng đăng xuất ở máy khác!` 
                    });
                }
                user.activeDevices.push(machineId);
                await user.save();
            }
        }

        const token = jwt.sign(
            { userId: user._id, isAdmin, machineId },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                isAdmin,
                hasAdminUI: isAdmin,
                subscription: isAdmin ? 'admin' : (user.subscription || 'free'),
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                purchasedEffects: user.purchasedEffects || []
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.subscription !== 'free' && user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
            user.subscription = 'free';
            user.subscriptionExpiresAt = null;
            await user.save();
        }

        const isAdmin = !!(user.isAdmin || user.hasAdminUI || user.email === 'admin@effectstore.vn');

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                isAdmin: isAdmin,
                hasAdminUI: user.hasAdminUI,
                subscription: isAdmin ? 'admin' : user.subscription,
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                purchasedEffects: user.purchasedEffects || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { getEntitlements, upgradePayload } = require('../config/planEntitlements');
const { isAdminUser } = require('../config/security');
const { issueUserToken } = require('../services/userToken');
const { createRateLimiter } = require('../middleware/rateLimit');
const crypto = require('crypto');
const SystemState = require('../models/SystemState');

// Lazily collapses an expired paid plan back to 'free' so every response
// that echoes user.subscription (login/me/profile) reflects the same plan
// planEntitlements.js/normalizePlan() would enforce server-side.
async function expireSubscriptionIfNeeded(user) {
    if (user.subscription !== 'free' && user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
        user.subscription = 'free';
        user.subscriptionExpiresAt = null;
        await user.save();
    }
}

const RESERVED_ADMIN_EMAIL = 'admin@effectstore.vn';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registerRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau.'
});
const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.'
});
const setupRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Quá nhiều lần thiết lập admin. Vui lòng thử lại sau.'
});

function setupTokenMatches(value) {
    const expected = Buffer.from(String(process.env.INITIAL_SETUP_TOKEN || ''));
    const supplied = Buffer.from(String(value || ''));
    return expected.length >= 32 && supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

function validateCredentials(email, password, requireStrongPassword = false) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
        return { error: 'Email không hợp lệ.' };
    }
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
        return { error: 'Mật khẩu không hợp lệ.' };
    }
    if (requireStrongPassword && password.length < 8) {
        return { error: 'Mật khẩu phải có từ 8 đến 128 ký tự.' };
    }
    return { normalizedEmail };
}

function normalizePhone(value) {
    const raw = String(value || '').trim();
    const normalized = raw.replace(/[^\d+]/g, '');
    return /^\+?\d{8,15}$/.test(normalized) ? normalized : '';
}

function normalizeSupportProfile(value = {}) {
    const birthday = String(value.birthday || '').trim();
    return {
        tiktokUsername: String(value.tiktokUsername || '').trim().replace(/^@+/, '').slice(0, 50),
        birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : '',
        region: String(value.region || '').trim().slice(0, 80),
        userType: ['streamer', 'agency', 'shop', 'studio'].includes(value.userType) ? value.userType : '',
        primaryNeed: ['gift-effects', 'tts', 'gift-menu', 'pk-game'].includes(value.primaryNeed) ? value.primaryNeed : '',
        preferredContact: ['zalo', 'phone', 'email'].includes(value.preferredContact) ? value.preferredContact : 'zalo',
        contactTime: String(value.contactTime || '').trim().slice(0, 80)
    };
}

router.get('/setup-status', async (_req, res) => {
    try {
        const adminExists = await User.exists({ isAdmin: true, isActive: true });
        return res.json({ success: true, needsAdminSetup: !adminExists });
    } catch (_error) {
        return res.status(503).json({ success: false, needsAdminSetup: false, error: 'Database is not ready.' });
    }
});

router.post('/setup-admin', setupRateLimiter, async (req, res) => {
    if (!setupTokenMatches(req.get('X-Setup-Token'))) {
        return res.status(401).json({ success: false, error: 'Setup token không hợp lệ.' });
    }
    let claimed = false;
    try {
        if (await User.exists({ isAdmin: true })) {
            return res.status(409).json({ success: false, error: 'Admin đã được thiết lập.' });
        }
        const { email, password, name, phone } = req.body || {};
        const validation = validateCredentials(email, password, true);
        if (validation.error || String(password || '').length < 12) {
            return res.status(400).json({ success: false, error: validation.error || 'Mật khẩu admin phải có ít nhất 12 ký tự.' });
        }

        await SystemState.create({
            _id: 'admin-bootstrap-claim',
            value: { claimedAt: new Date().toISOString() },
            updatedAt: new Date()
        });
        claimed = true;
        if (await User.exists({ isAdmin: true })) {
            return res.status(409).json({ success: false, error: 'Admin đã được thiết lập.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        let user = await User.findOne({ email: validation.normalizedEmail });
        if (user) {
            user.password = passwordHash;
            user.name = String(name || user.name || 'Administrator').trim().slice(0, 100);
            user.phone = String(phone || user.phone || 'N/A').trim().slice(0, 30);
            user.isAdmin = true;
            user.isActive = true;
            await user.save();
        } else {
            user = await User.create({
                email: validation.normalizedEmail,
                password: passwordHash,
                name: String(name || 'Administrator').trim().slice(0, 100),
                phone: String(phone || 'N/A').trim().slice(0, 30),
                isAdmin: true,
                isActive: true
            });
        }
        await SystemState.findByIdAndUpdate('admin-bootstrap-claim', {
            value: { completed: true, adminId: String(user._id), completedAt: new Date().toISOString() },
            updatedAt: new Date()
        });
        return res.status(201).json({ success: true });
    } catch (error) {
        if (claimed && error?.code !== 11000) {
            await SystemState.deleteOne({ _id: 'admin-bootstrap-claim', 'value.completed': { $ne: true } }).catch(() => {});
        }
        if (error?.code === 11000) return res.status(409).json({ success: false, error: 'Thiết lập admin đang hoặc đã được xử lý.' });
        return res.status(500).json({ success: false, error: 'Không thể tạo admin.' });
    }
});

router.post('/register', registerRateLimiter, async (req, res) => {
    try {
        const { email, password, name, phone, machineId, supportProfile, marketingConsent, termsAccepted } = req.body || {};
        const validation = validateCredentials(email, password, true);
        if (validation.error) return res.status(400).json({ success: false, error: validation.error });
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return res.status(400).json({ success: false, error: 'Số điện thoại/Zalo không hợp lệ.' });
        if (termsAccepted !== true) return res.status(400).json({ success: false, error: 'Bạn cần đồng ý với điều khoản và chính sách bảo mật.' });

        const normalizedEmail = validation.normalizedEmail;
        if (normalizedEmail === RESERVED_ADMIN_EMAIL) {
            return res.status(403).json({ success: false, error: 'Email này không thể đăng ký công khai.' });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email đã tồn tại.' });
        }
        const phoneOwner = await User.exists({ phone: normalizedPhone });
        if (phoneOwner) return res.status(409).json({ success: false, error: 'Số điện thoại/Zalo đã được sử dụng.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            password: hashedPassword,
            name: String(name || normalizedEmail.split('@')[0]).trim().slice(0, 100),
            phone: normalizedPhone,
            supportProfile: normalizeSupportProfile(supportProfile),
            marketingConsent: marketingConsent === true,
            termsAcceptedAt: new Date(),
            profileUpdatedAt: new Date(),
            machineId: machineId || null,
            activeDevices: machineId ? [machineId] : [],
            isAdmin: false
        });

        const token = issueUserToken({ userId: user._id, isAdmin: false });

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                supportProfile: user.supportProfile,
                marketingConsent: user.marketingConsent,
                isAdmin: false,
                hasAdminUI: false,
                customEffects: user.customEffects || []
            }
        });
    } catch (error) {
        console.error('Register error:', error.message);
        return res.status(500).json({ success: false, error: 'Không thể đăng ký tài khoản lúc này.' });
    }
});

router.post('/login', loginRateLimiter, async (req, res) => {
    try {
        const { email, password, machineId } = req.body || {};
        const validation = validateCredentials(email, password);
        if (validation.error) return res.status(400).json({ success: false, error: validation.error });

        const normalizedEmail = validation.normalizedEmail;
        const user = await User.findOne({ email: normalizedEmail });
        const invalidCredentials = { success: false, error: 'Email hoặc mật khẩu không đúng.' };
        if (!user) return res.status(401).json(invalidCredentials);

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json(invalidCredentials);
        if (user.isActive === false) {
            return res.status(403).json({ success: false, error: 'Tài khoản đã bị vô hiệu hóa.' });
        }
        await expireSubscriptionIfNeeded(user);

        const isAdmin = isAdminUser(user);
        if (!isAdmin) {
            // A client that simply omits machineId used to skip this whole
            // check — the device cap only meant anything for clients that
            // bothered to send an ID. The desktop app always generates and
            // sends one (see home.js init()), so require it here instead of
            // silently letting an unidentified device through ungated.
            if (!machineId) {
                return res.status(400).json({ success: false, error: 'Thiếu mã thiết bị (machineId).' });
            }
            const entitlements = getEntitlements(user);
            const maxDevices = entitlements.devices;
            if (!user.activeDevices) user.activeDevices = [];

            if (!user.activeDevices.includes(machineId)) {
                // Older app builds generated a random per-install ID (e.g. "user-171..-abc12de34")
                // instead of a real machine-derived ID. When every ID on file is one of those
                // legacy IDs, treat this login as a one-time migration to the new stable ID
                // rather than an extra device, so existing paying users aren't locked out just
                // because the app upgraded how it identifies a device.
                const isLegacyDeviceId = (id) => /^user-\d+-[a-z0-9]+$/i.test(id);
                const allLegacy = user.activeDevices.length > 0 && user.activeDevices.every(isLegacyDeviceId);

                if (allLegacy) {
                    user.activeDevices = [machineId];
                    await user.save();
                } else if (user.activeDevices.length >= maxDevices) {
                    return res.status(403).json(upgradePayload(
                        'devices',
                        `Gói ${entitlements.label} chỉ sử dụng được trên ${maxDevices} thiết bị.`,
                        entitlements
                    ));
                } else {
                    user.activeDevices.push(machineId);
                    await user.save();
                }
            }
        }

        const token = issueUserToken({ userId: user._id, isAdmin, machineId });

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                supportProfile: user.supportProfile,
                marketingConsent: user.marketingConsent,
                isAdmin,
                hasAdminUI: isAdmin,
                subscription: isAdmin ? 'admin' : (user.subscription || 'free'),
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                basicActiveEffectIds: user.basicActiveEffectIds || [],
                purchasedEffects: user.purchasedEffects || [],
                customEffects: user.customEffects || []
            }
        });
    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({ success: false, error: 'Không thể đăng nhập lúc này.' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = req.user || (await User.findById(req.userId));
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Tài khoản đã bị vô hiệu hóa.' });
        }

        await expireSubscriptionIfNeeded(user);

        const isAdmin = isAdminUser(user);
        return res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                supportProfile: user.supportProfile,
                marketingConsent: user.marketingConsent,
                isAdmin,
                hasAdminUI: isAdmin,
                subscription: isAdmin ? 'admin' : user.subscription,
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                basicActiveEffectIds: user.basicActiveEffectIds || [],
                purchasedEffects: user.purchasedEffects || [],
                customEffects: user.customEffects || []
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Không thể tải thông tin tài khoản.' });
    }
});

router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const user = req.user || (await User.findById(req.userId));
        if (!user || user.isActive === false) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
        await expireSubscriptionIfNeeded(user);
        const name = String(req.body?.name || '').trim().slice(0, 100);
        const phone = normalizePhone(req.body?.phone);
        if (!name) return res.status(400).json({ success: false, error: 'Tên hiển thị không được để trống.' });
        if (!phone) return res.status(400).json({ success: false, error: 'Số điện thoại/Zalo không hợp lệ.' });
        const phoneOwner = await User.exists({ phone, _id: { $ne: user._id } });
        if (phoneOwner) return res.status(409).json({ success: false, error: 'Số điện thoại/Zalo đã được sử dụng.' });
        user.name = name;
        user.phone = phone;
        user.supportProfile = normalizeSupportProfile(req.body?.supportProfile);
        user.marketingConsent = req.body?.marketingConsent === true;
        user.profileUpdatedAt = new Date();
        await user.save();
        return res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                supportProfile: user.supportProfile,
                marketingConsent: user.marketingConsent,
                isAdmin: isAdminUser(user),
                hasAdminUI: isAdminUser(user),
                subscription: isAdminUser(user) ? 'admin' : user.subscription,
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                purchasedEffects: user.purchasedEffects || [],
                customEffects: user.customEffects || []
            }
        });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Không thể cập nhật hồ sơ.' });
    }
});

router.post('/logout', authMiddleware, async (req, res) => {
    try {
        if (req.machineId) {
            await User.updateOne({ _id: req.userId }, { $pull: { activeDevices: req.machineId } });
        }
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Không thể đăng xuất lúc này.' });
    }
});

module.exports = router;
module.exports.validateCredentials = validateCredentials;
module.exports.setupTokenMatches = setupTokenMatches;

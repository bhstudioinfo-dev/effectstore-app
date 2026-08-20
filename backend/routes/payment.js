const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { isValidResourceId } = require('../utils/accessControl');
const { calculateOrder, claimFreeEffects, approvePayment, recoverStalePayments } = require('../services/paymentService');
const { paths: dataPaths } = require('../config/dataPaths');

const proofDirectory = dataPaths.tempDir;
fs.mkdirSync(proofDirectory, { recursive: true });
const upload = multer({
    dest: proofDirectory,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
        const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
        callback(allowed.has(file.mimetype) ? null : new Error('Unsupported proof image type.'), allowed.has(file.mimetype));
    }
});

function removeUploadedFile(file) {
    if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (_error) {}
    }
}

function isValidProofImage(filePath) {
    const header = fs.readFileSync(filePath).subarray(0, 12);
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
    return isJpeg || isPng || isWebp;
}

function createOrderId() {
    return `DH${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function transferCustomerName(user) {
    // A human-readable payment memo is helpful when a customer cannot scan
    // VietQR. Keep the generated order ID as well: the webhook uses it for
    // reliable automatic reconciliation.
    const candidate = String(user?.name || user?.email || 'KHACH HANG')
        .split('@')[0]
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (candidate || 'KHACH HANG').slice(0, 48);
}

function bankConfiguration(amount, orderId, user) {
    const bankCode = process.env.BANK_CODE || 'TCB';
    const accountNumber = process.env.BANK_ACCOUNT_NUMBER || '7698689999';
    const accountName = process.env.BANK_ACCOUNT_NAME || 'HUYNH BAO HUNG';
    const description = `${transferCustomerName(user)} CHUYEN KHOAN ${orderId}`;
    return { bankCode, bank: bankCode, accountNumber, accountName, amount, description };
}

function safeProofUrl(payment) {
    if (!payment?.proofImage) return null;
    return `/api/payment/admin/proof/${encodeURIComponent(path.basename(payment.proofImage))}`;
}

router.post('/create-qr', authMiddleware, async (req, res) => {
    try {
        // authMiddleware intentionally selects a lightweight profile. Orders
        // must read the complete, current ownership list from the database or
        // an already-owned item can be ordered again.
        const user = await User.findById(req.userId).select('purchasedEffects isActive name email');
        if (!user || user.isActive === false) return res.status(404).json({ success: false, error: 'User not found' });
        const order = await calculateOrder(req.body?.effectIds, user);
        const orderId = createOrderId();
        const payment = await Payment.create({
            userId: String(req.userId),
            orderId,
            effectIds: order.effectIds,
            amount: order.amount,
            hasProof: false,
            proofImage: null,
            status: 'created'
        });
        const bankInfo = bankConfiguration(payment.amount, orderId, user);
        const qrCode = `https://img.vietqr.io/image/${bankInfo.bankCode}-${bankInfo.accountNumber}-qr_only.png?amount=${payment.amount}&addInfo=${encodeURIComponent(bankInfo.description)}`;
        return res.status(201).json({ success: true, qrCode, orderId, amount: payment.amount, bankInfo });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Unable to create payment order.' });
    }
});

router.post('/claim-free', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('purchasedEffects isActive');
        if (!user || user.isActive === false) return res.status(404).json({ success: false, error: 'User not found' });
        const result = await claimFreeEffects(req.body?.effectIds, user);
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Unable to claim free effects.'
        });
    }
});

router.post('/confirm', authMiddleware, (req, res, next) => {
    if (req.is('multipart/form-data')) {
        return upload.single('proof')(req, res, next);
    }
    next();
}, async (req, res) => {
    try {
        const orderId = String(req.body?.orderId || '').trim();
        const payment = await Payment.findOne({ orderId, userId: String(req.userId) });
        if (!payment) {
            removeUploadedFile(req.file);
            return res.status(404).json({ success: false, message: 'Payment order not found.' });
        }
        if (!['created', 'pending'].includes(payment.status)) {
            removeUploadedFile(req.file);
            return res.status(409).json({ success: false, message: 'Payment order can no longer be changed.' });
        }
        if (req.file && !isValidProofImage(req.file.path)) {
            removeUploadedFile(req.file);
            return res.status(400).json({ success: false, message: 'Invalid proof image.' });
        }
        if (payment.proofImage && req.file) {
            const previousPath = path.join(proofDirectory, path.basename(payment.proofImage));
            if (fs.existsSync(previousPath)) removeUploadedFile({ path: previousPath });
        }
        if (req.file) {
            payment.proofImage = `/uploads/temp/${req.file.filename}`;
            payment.hasProof = true;
        }
        payment.status = 'pending';
        await payment.save();
        return res.json({ success: true, message: 'Payment confirmation submitted.' });
    } catch (_error) {
        removeUploadedFile(req.file);
        return res.status(500).json({ success: false, error: 'Unable to confirm payment.' });
    }
});

router.get('/status/:orderId', authMiddleware, async (req, res) => {
    try {
        const payment = await Payment.findOne({ orderId: req.params.orderId, userId: String(req.userId) }).select('status rejectionReason');
        if (!payment) return res.status(404).json({ success: false, message: 'Payment order not found.' });
        return res.json({
            success: true,
            status: payment.status,
            rejectionReason: payment.status === 'rejected' ? payment.rejectionReason || null : null
        });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Unable to load payment status.' });
    }
});

router.post('/sepay-webhook', async (req, res) => {
    try {
        // Production policy is manual approval from the in-app Admin account.
        // Merely setting a webhook secret must never enable automatic grants;
        // future automation requires this separate, explicit feature flag.
        if (String(process.env.PAYMENT_AUTO_APPROVAL_ENABLED || '').toLowerCase() !== 'true') {
            return res.status(503).json({ success: false, error: 'Automatic payment approval is disabled.' });
        }
        const secret = String(process.env.SEPAY_WEBHOOK_SECRET || '');
        const supplied = String(req.headers['x-webhook-secret'] || req.headers.authorization?.replace(/^Apikey\s+/i, '') || '');
        if (!secret) return res.status(503).json({ success: false, error: 'Webhook is not configured.' });
        const validSecret = supplied.length === secret.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
        if (!validSecret) return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });

        const content = String(req.body?.content || req.body?.description || '').toUpperCase();
        const orderId = content.match(/DH[A-Z0-9]+/)?.[0];
        const transferAmount = Number(req.body?.transferAmount ?? req.body?.transfer_amount ?? req.body?.amount);
        if (!orderId || !Number.isFinite(transferAmount)) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload.' });
        }
        const payment = await Payment.findOne({ orderId });
        if (!payment) return res.status(404).json({ success: false, error: 'Payment order not found.' });
        if (payment.status === 'approved') return res.json({ success: true, duplicate: true });
        if (!['created', 'pending'].includes(payment.status) || transferAmount < payment.amount) {
            return res.status(409).json({ success: false, error: 'Payment does not match the order.' });
        }
        const approval = await approvePayment(payment._id, ['created', 'pending']);
        if (approval.outcome === 'processing') return res.status(202).json({ success: true, processing: true, orderId, status: 'processing' });
        if (approval.outcome !== 'approved') return res.status(409).json({ success: false, error: 'Payment cannot be approved.' });
        return res.json({ success: true, duplicate: approval.duplicate === true, orderId, status: 'approved' });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
    }
});

router.get('/admin/payments', authMiddleware, adminMiddleware, async (_req, res) => {
    try {
        await recoverStalePayments();
        const payments = await Payment.find({ status: { $in: ['pending', 'processing'] } })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        const userIds = [...new Set(payments.map((payment) => String(payment.userId || '')).filter(isValidResourceId))];
        const effectIds = [...new Set(payments.flatMap((payment) => payment.effectIds || [])
            .map(String)
            .filter((id) => isValidResourceId(id)))];
        const [users, effects] = await Promise.all([
            User.find({ _id: { $in: userIds } })
                .select('name email phone subscription subscriptionExpiresAt totalSpent createdAt')
                .lean(),
            effectIds.length
                ? require('../models/Effect').find({ _id: { $in: effectIds } }).select('name price').lean()
                : []
        ]);
        const usersById = new Map(users.map((user) => [String(user._id), user]));
        const effectsById = new Map(effects.map((effect) => [String(effect._id), effect]));
        const productName = (id) => {
            if (id === 'SUBSCRIPTION_BASIC') return 'Gói Basic · 30 ngày';
            if (id === 'SUBSCRIPTION_PRO' || id === 'SUBSCRIPTION_BUSINESS') return 'Gói Pro · 30 ngày';
            if (id === 'AI_ADDON_10K') return 'Nạp lẻ 1,000 ký tự AI (10,000đ)';
            if (id === 'AI_ADDON_50K') return 'Nạp lẻ 5,500 ký tự AI (50,000đ)';
            if (id === 'AI_ADDON_100K') return 'Nạp lẻ 12,000 ký tự AI (100,000đ)';
            return effectsById.get(String(id))?.name || `Sản phẩm ${String(id).slice(-6)}`;
        };
        const safePayments = payments.map((payment) => ({
            ...payment,
            proofImage: safeProofUrl(payment),
            user: usersById.get(String(payment.userId)) || null,
            products: (payment.effectIds || []).map((id) => ({ id: String(id), name: productName(String(id)) }))
        }));
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ success: true, payments: safePayments });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Unable to load payments.' });
    }
});

router.get('/admin/proof/:filename', authMiddleware, adminMiddleware, (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(proofDirectory, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Proof image not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(filePath);
});

router.post('/admin/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const paymentId = req.body?.paymentId;
        if (!isValidResourceId(paymentId)) return res.status(400).json({ success: false, error: 'Invalid payment ID' });
        const approval = await approvePayment(paymentId, ['pending'], { reviewedBy: req.userId });
        if (approval.outcome === 'not_found') return res.status(404).json({ success: false, message: 'Payment order not found.' });
        if (approval.outcome === 'processing') {
            return res.status(202).json({ success: true, processing: true, message: 'Payment is already being processed.' });
        }
        if (approval.outcome !== 'approved') {
            return res.status(409).json({ success: false, status: approval.payment?.status, message: 'Payment can no longer be approved.' });
        }
        return res.json({
            success: true,
            duplicate: approval.duplicate === true,
            message: approval.duplicate ? 'Payment was already approved.' : 'Payment approved.'
        });
    } catch (error) {
        console.error('Approve error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Unable to approve payment.' });
    }
});

router.post('/admin/reject', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const paymentId = req.body?.paymentId;
        if (!isValidResourceId(paymentId)) return res.status(400).json({ success: false, error: 'Invalid payment ID' });
        const reason = String(req.body?.reason || '').trim();
        if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required.' });
        const payment = await Payment.findOneAndUpdate(
            { _id: paymentId, status: 'pending' },
            { $set: { status: 'rejected', rejectionReason: reason.slice(0, 500), reviewedBy: String(req.userId), reviewedAt: new Date() } },
            { new: true }
        );
        if (!payment) {
            const existing = await Payment.findById(paymentId).select('status');
            if (!existing) return res.status(404).json({ success: false, message: 'Payment order not found.' });
            if (existing.status === 'rejected') return res.json({ success: true, duplicate: true, message: 'Payment was already rejected.' });
            return res.status(409).json({ success: false, status: existing.status, message: 'Payment can no longer be rejected.' });
        }
        return res.json({ success: true, message: 'Payment rejected.' });
    } catch (_error) {
        return res.status(500).json({ success: false, error: 'Unable to reject payment.' });
    }
});

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error?.message === 'Unsupported proof image type.') {
        removeUploadedFile(req.file);
        return res.status(400).json({ success: false, error: error.message });
    }
    return next(error);
});

module.exports = router;
module.exports.createOrderId = createOrderId;
module.exports.isValidProofImage = isValidProofImage;

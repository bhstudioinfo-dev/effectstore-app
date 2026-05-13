const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const upload = multer({ dest: 'uploads/temp/' });

// Create Payment QR
router.post('/create-qr', async (req, res) => {
    try {
        const { amount, effectIds, userId, userName } = req.body;
        const bankInfo = { 
            bankCode: 'TCB',
            accountNumber: '7698689999', 
            accountName: 'HUYNH BAO HUNG', 
            amount 
        };
        const orderId = `DH${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        const namePart = userName ? userName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase() : (userId || 'KHACH');
        const description = `${namePart} CHUYEN KHOAN`;
        
        const qrCodeUrl = `https://img.vietqr.io/image/${bankInfo.bankCode}-${bankInfo.accountNumber}-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&t=${Date.now()}`;
        
        res.json({ success: true, qrCode: qrCodeUrl, orderId: orderId, bankInfo: { ...bankInfo, description } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Confirm Payment (Upload Proof)
router.post('/confirm', upload.single('proof'), async (req, res) => {
    try {
        const { userId, effectIds, amount, noProof, orderId } = req.body;
        const hasProof = req.file || noProof === 'true';
        if (!hasProof) return res.status(400).json({ success: false, message: 'Thiếu ảnh chuyển khoản!' });
        
        let parsedEffectIds = [];
        try { parsedEffectIds = JSON.parse(effectIds || '[]'); } catch (e) { parsedEffectIds = effectIds ? effectIds.split(',') : []; }
        
        await Payment.create({ 
            userId, 
            orderId,
            effectIds: parsedEffectIds, 
            proofImage: req.file ? `/uploads/temp/${req.file.filename}` : null, 
            amount: parseFloat(amount) || 0, 
            hasProof: !!req.file, 
            status: 'pending' 
        });
        
        res.json({ success: true, message: 'Đã gửi yêu cầu thanh toán!' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Check Status
router.get('/status/:orderId', async (req, res) => {
    try {
        const payment = await Payment.findOne({ orderId: req.params.orderId });
        if (!payment) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        res.json({ success: true, status: payment.status });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Admin: List Payments
router.get('/admin/payments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 });
        res.json({ success: true, payments });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Admin: Approve Payment
router.post('/admin/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
        
        payment.status = 'approved';
        await payment.save();
        
        let user = await User.findById(payment.userId);
        if (!user) user = await User.findOne({ machineId: payment.userId });
        
        if (user) {
            for (const effectId of payment.effectIds) {
                if (effectId === 'SUBSCRIPTION_PRO' || effectId === 'SUBSCRIPTION_BUSINESS') {
                    user.subscription = effectId === 'SUBSCRIPTION_PRO' ? 'pro' : 'business';
                    const now = new Date();
                    user.subscriptionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                } else {
                    const exists = user.purchasedEffects.find(e => e.effectId?.toString() === effectId);
                    if (!exists) {
                        user.purchasedEffects.push({ effectId, purchasedAt: new Date() });
                    }
                }
            }
            user.totalSpent = (user.totalSpent || 0) + payment.amount;
            await user.save();
        }
        
        res.json({ success: true, message: 'Đã duyệt thanh toán thành công!' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Admin: Reject Payment
router.post('/admin/reject', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
        
        payment.status = 'rejected';
        await payment.save();
        res.json({ success: true, message: 'Đã từ chối thanh toán' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
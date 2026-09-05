const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: String,
    orderId: { type: String, unique: true },
    effectIds: [String],
    proofImage: String,
    amount: Number,
    originalAmount: Number,
    discountAmount: Number,
    promoCode: String,
    hasProof: { type: Boolean, default: true },
    status: { type: String, enum: ['created', 'pending', 'processing', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: String,
    reviewedBy: String,
    reviewedAt: Date,
    processingStartedAt: Date,
    approvedAt: Date,
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);

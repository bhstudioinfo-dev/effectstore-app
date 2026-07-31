const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: String,
    orderId: { type: String, unique: true },
    effectIds: [String],
    proofImage: String,
    amount: Number,
    hasProof: { type: Boolean, default: true },
    status: { type: String, default: 'pending' },
    rejectionReason: String,
    reviewedBy: String,
    reviewedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);

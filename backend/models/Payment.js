const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: String,
    orderId: { type: String, unique: true },
    effectIds: [String],
    proofImage: String,
    amount: Number,
    hasProof: { type: Boolean, default: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);

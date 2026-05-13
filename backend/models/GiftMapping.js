const mongoose = require('mongoose');

const GiftMappingSchema = new mongoose.Schema({
    userId: { type: String },
    sessionId: { type: String },
    giftId: { type: String, required: true },
    giftName: String,
    giftIcon: String,
    effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Effect', required: true },
    effectName: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GiftMapping', GiftMappingSchema);

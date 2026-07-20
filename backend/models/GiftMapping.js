const mongoose = require('mongoose');

const GiftMappingSchema = new mongoose.Schema({
    userId: { type: String },
    sessionId: { type: String },
    giftId: { type: String, required: true },
    giftName: String,
    giftIcon: String,
    effectId: { type: String, required: true },
    effectName: String,
    effects: [{
        effectId: { type: String },
        effectName: { type: String },
        weight: { type: Number, default: 1 }
    }],
    playbackMode: { type: String, default: 'random' },
    minQuantity: { type: Number, default: 1 },
    maxQuantity: { type: Number, default: null },
    exactQuantity: { type: Number, default: null },
    cooldown: { type: Number, default: 0 },
    cooldownAction: { type: String, default: 'queue' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

GiftMappingSchema.index({ userId: 1, giftId: 1, isActive: 1 });
GiftMappingSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('GiftMapping', GiftMappingSchema);

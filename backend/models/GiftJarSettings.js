const mongoose = require('mongoose');

const GiftJarSettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    theme: { type: String, enum: ['glass', 'golden', 'chest', 'diamond', 'custom'], default: 'glass' },
    customJarImageUrl: { type: String, default: '' },
    targetCoins: { type: Number, default: 1000 },
    currentCoins: { type: Number, default: 0 },
    dropItemType: { type: String, enum: ['coin', 'gift_icon', 'heart', 'star', 'gem'], default: 'coin' },
    autoResetOnTarget: { type: Boolean, default: true },
    celebrationSound: { type: String, default: 'jackpot' },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GiftJarSettings', GiftJarSettingsSchema);

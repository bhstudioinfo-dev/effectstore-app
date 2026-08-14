const mongoose = require('mongoose');

const GiftJarSettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    theme: { type: String, default: 'hu-thuong' },
    customJarImageUrl: { type: String, default: '' },
    capacityLevel: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    targetCoins: { type: Number, default: 1000 },
    currentCoins: { type: Number, default: 0 },
    dropItemType: { type: String, default: 'tiktok_gift' },
    autoResetOnTarget: { type: Boolean, default: false },
    celebrationSound: { type: String, default: 'jackpot' },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GiftJarSettings', GiftJarSettingsSchema);

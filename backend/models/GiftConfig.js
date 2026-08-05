const mongoose = require('mongoose');

const GiftConfigSchema = new mongoose.Schema({
    giftId: { type: String, required: true, unique: true },
    giftName: { type: String, required: true },
    coins: { type: Number, default: 1 },
    iconUrl: { type: String },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GiftConfig', GiftConfigSchema);

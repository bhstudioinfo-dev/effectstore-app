const mongoose = require('mongoose');

const GiftMenuLayoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    name: { type: String, required: true },
    version: { type: Number, default: 2 },
    savedAt: { type: Date },
    aspectRatio: { type: String, default: '9:16' },
    canvasSize: { type: mongoose.Schema.Types.Mixed },
    safeArea: { type: mongoose.Schema.Types.Mixed },
    exportSize: { type: mongoose.Schema.Types.Mixed },
    items: { type: Array, default: [] },
    exportedItems: { type: Array, default: [] },
    isActive: { type: Boolean, default: false },
    isTemplate: { type: Boolean, default: false },
    category: { type: String, default: 'all' },
    price: { type: Number, default: 0, min: 0 },
    originalPrice: { type: Number, default: 0, min: 0 },
    description: { type: String, default: '' },
    icon: { type: String, default: '📋' },
    isPremium: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('GiftMenuLayout', GiftMenuLayoutSchema);

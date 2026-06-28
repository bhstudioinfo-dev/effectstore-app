const mongoose = require('mongoose');

const GiftMenuLayoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    name: { type: String, required: true },
    aspectRatio: { type: String, default: '9:16' },
    items: { type: Array, default: [] },
    exportedItems: { type: Array, default: [] },
    isActive: { type: Boolean, default: false },
    isTemplate: { type: Boolean, default: false },
    category: { type: String, default: 'all' },
}, { timestamps: true });

module.exports = mongoose.model('GiftMenuLayout', GiftMenuLayoutSchema);

const mongoose = require('mongoose');

const EffectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    description: { type: String },
    icon: { type: String },
    fileUrl: { type: String },
    previewUrl: { type: String },
    thumbUrl: { type: String },
    thumbFilePath: { type: String },
    duration: { type: Number, default: 15 },
    previewFilePath: { type: String },
    encryptedFilePath: { type: String },
    fileSize: { type: Number },
    rating: { type: Number, default: 5.0 },
    uses: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isTrending: { type: Boolean, default: false },
    isFlashSale: { type: Boolean, default: false },
    flashSalePrice: { type: Number, default: 0 },
    flashSaleEndsAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    timeline: { type: Object, default: {} },
    isComposite: { type: Boolean, default: false }
});

module.exports = mongoose.model('Effect', EffectSchema);

const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
    filePath: { type: String, required: true },
    publicUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

BannerSchema.index({ isActive: 1, uploadedAt: -1 });

module.exports = mongoose.model('Banner', BannerSchema);

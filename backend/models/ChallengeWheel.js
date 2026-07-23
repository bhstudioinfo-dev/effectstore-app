const mongoose = require('mongoose');

const ChallengeWheelSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftMenuLayout', required: false, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, default: 'VÒNG QUAY THỬ THÁCH', maxlength: 120 },
    segments: [{
        id: { type: String, required: true },
        label: { type: String, required: true, maxlength: 160 },
        color: { type: String, default: '#8b5cf6' },
        resultImage: { type: String, default: '', maxlength: 2000000 },
        weight: { type: Number, default: 1, min: 0 }
    }],
    durationMs: { type: Number, default: 6500, min: 1500, max: 30000 },
    autoHideMs: { type: Number, default: 7000, min: 0, max: 60000 },
    noRepeat: { type: Boolean, default: false },
    presentation: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

ChallengeWheelSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChallengeWheel', ChallengeWheelSchema);

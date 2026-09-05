const mongoose = require('mongoose');

const PromoCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['fixed', 'percent'],
        default: 'fixed'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 1
    },
    appliesTo: {
        type: String,
        enum: ['all', 'subscription', 'effect'],
        default: 'all'
    },
    maxUses: {
        type: Number,
        default: null // null = unlimited
    },
    usedCount: {
        type: Number,
        default: 0
    },
    minOrderValue: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        default: null // null = never expires
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

PromoCodeSchema.index({ code: 1 });
PromoCodeSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model('PromoCode', PromoCodeSchema);

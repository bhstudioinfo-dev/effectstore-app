const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    phone: { type: String, required: true },
    supportProfile: {
        tiktokUsername: { type: String, default: '' },
        birthday: { type: String, default: '' },
        region: { type: String, default: '' },
        userType: { type: String, default: '' },
        primaryNeed: { type: String, default: '' },
        preferredContact: { type: String, default: 'zalo' },
        contactTime: { type: String, default: '' }
    },
    marketingConsent: { type: Boolean, default: false },
    termsAcceptedAt: Date,
    profileUpdatedAt: Date,
    machineId: { type: String },
    subscription: { type: String, default: 'free' },
    subscriptionExpiresAt: { type: Date },
    activeDevices: [String],
    purchasedEffects: [{
        effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Effect' },
        purchasedAt: { type: Date, default: Date.now },
        licenseKey: { type: String },
        acquisitionType: { type: String, enum: ['free', 'paid', 'legacy'], default: 'legacy' },
        acquisitionPrice: { type: Number, min: 0 },
        useCount: { type: Number, default: 0 },
        lastUsedAt: { type: Date }
    }],
    customEffects: [{
        localId: { type: String, required: true },
        name: { type: String, required: true },
        machineId: { type: String, required: true },
        duration: { type: Number, required: true, min: 0.1 },
        createdAt: { type: Date, default: Date.now }
    }],
    totalSpent: { type: Number, default: 0 },
    totalUses: { type: Number, default: 0 },
    usedCharactersThisMonth: { type: Number, default: 0 },
    usedSystemVoiceCharactersThisMonth: { type: Number, default: 0 },
    addonCharacters: { type: Number, default: 0 },
    aiMonthKey: { type: String, default: '' },
    aiAssistantConfig: {
        enabled: { type: Boolean, default: false },
        persona: { type: String, enum: ['sassy', 'funny', 'sweet', 'smart'], default: 'sassy' },
        cooldownSeconds: { type: Number, min: 15, max: 60, default: 20 },
        donatorOnly: { type: Boolean, default: false },
        minimumDonatorCoins: { type: Number, min: 1, max: 1000000, default: 10 },
        elevenLabsVoiceId: { type: String, default: 'pNInz6obpgDQGcFmaJgB' },
        ttsEngine: { type: String, default: 'elevenlabs' },
        readSpeed: { type: Number, min: 0.5, max: 2, default: 1 },
        volume: { type: Number, min: 0, max: 1, default: 1 }
    },
    isAdmin: { type: Boolean, default: false }, // Added this as I saw it used in DB
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ createdAt: -1 });
UserSchema.index({ isAdmin: 1, isActive: 1 });
UserSchema.index({ 'purchasedEffects.effectId': 1 });

module.exports = mongoose.model('User', UserSchema);

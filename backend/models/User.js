const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    phone: { type: String, required: true },
    machineId: { type: String },
    subscription: { type: String, default: 'free' },
    subscriptionExpiresAt: { type: Date },
    activeDevices: [String],
    purchasedEffects: [{
        effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Effect' },
        purchasedAt: { type: Date, default: Date.now },
        licenseKey: { type: String }
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
    isAdmin: { type: Boolean, default: false }, // Added this as I saw it used in DB
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);

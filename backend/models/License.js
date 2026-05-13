const mongoose = require('mongoose');

const LicenseSchema = new mongoose.Schema({
    licenseKey: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    effectId: { type: String },
    machineId: { type: String },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
    lastValidated: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('License', LicenseSchema);

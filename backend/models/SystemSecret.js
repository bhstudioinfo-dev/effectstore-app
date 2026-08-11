const mongoose = require('mongoose');

const SystemSecretSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, enum: ['gemini', 'elevenlabs'] },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SystemSecret', SystemSecretSchema);

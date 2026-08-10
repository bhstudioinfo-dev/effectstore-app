const mongoose = require('mongoose');

const EffectRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

EffectRequestSchema.index({ status: 1, createdAt: -1 });
EffectRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EffectRequest', EffectRequestSchema);

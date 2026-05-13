const mongoose = require('mongoose');

const EffectRequestSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EffectRequest', EffectRequestSchema);

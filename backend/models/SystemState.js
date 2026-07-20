const mongoose = require('mongoose');

const SystemStateSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('SystemState', SystemStateSchema);

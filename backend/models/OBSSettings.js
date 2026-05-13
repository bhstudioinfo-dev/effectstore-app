const mongoose = require('mongoose');

const OBSSettingsSchema = new mongoose.Schema({
    host: { type: String, default: 'localhost' },
    port: { type: Number, default: 4455 },
    password: { type: String, default: 'obs123' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OBSSettings', OBSSettingsSchema);

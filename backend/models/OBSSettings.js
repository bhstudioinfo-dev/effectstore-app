const mongoose = require('mongoose');

const OBSSettingsSchema = new mongoose.Schema({
    // Optional/sparse so pre-existing installs keep their single legacy
    // document (no userId) until it's adopted by whichever account first
    // reads/saves OBS settings after this field was introduced.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    host: { type: String, default: 'localhost' },
    port: { type: Number, default: 4455 },
    password: { type: String, default: 'obs123' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OBSSettings', OBSSettingsSchema);

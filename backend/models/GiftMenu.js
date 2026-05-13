const mongoose = require('mongoose');

const GiftMenuSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: 'New Menu' },
    elements: { type: Array, default: [] }, // Array of Fabric.js objects (serialized)
    config: {
        width: { type: Number, default: 360 },
        height: { type: Number, default: 640 },
        backgroundColor: { type: String, default: 'transparent' }
    },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GiftMenu', GiftMenuSchema);

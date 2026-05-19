const mongoose = require('mongoose');

const GiftLogSchema = new mongoose.Schema({
    giftId: String,
    giftName: String,
    userId: String,
    userName: String,
    effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Effect' },
    triggeredAt: { type: Date, default: Date.now },
    sessionId: String,
    repeatCount: { type: Number, default: 1 }
});

module.exports = mongoose.model('GiftLog', GiftLogSchema);

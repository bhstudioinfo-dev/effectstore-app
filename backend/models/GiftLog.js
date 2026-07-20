const mongoose = require('mongoose');

const GiftLogSchema = new mongoose.Schema({
    giftId: String,
    giftName: String,
    userId: String,
    userName: String,
    effectId: String,
    triggeredAt: { type: Date, default: Date.now },
    sessionId: String,
    repeatCount: { type: Number, default: 1 }
});

GiftLogSchema.index({ userId: 1, triggeredAt: -1 });
GiftLogSchema.index({ sessionId: 1, triggeredAt: -1 });

module.exports = mongoose.model('GiftLog', GiftLogSchema);

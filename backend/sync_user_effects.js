const mongoose = require('mongoose');

async function syncEffects() {
    try {
        const conn = await mongoose.connect('mongodb://localhost:27017/effectstore');
        
        const UserSchema = new mongoose.Schema({
            purchasedEffects: [{
                effectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Effect' },
                purchasedAt: { type: Date, default: Date.now },
                licenseKey: { type: String }
            }]
        });
        
        const PaymentSchema = new mongoose.Schema({
            userId: String,
            effectIds: [String],
            status: String
        });
        
        const User = mongoose.model('User', UserSchema);
        const Payment = mongoose.model('Payment', PaymentSchema);
        
        const targetUserId = '69eef9db2411871446e2597f';
        const user = await User.findById(targetUserId);
        
        if (!user) {
            console.error('User not found');
            process.exit(1);
        }
        
        // Tìm tất cả payment đã approved của user này (bao gồm cả theo machineId cũ)
        const possibleUserIds = [targetUserId, 'user-1775554498162-rr50f5ug1'];
        const payments = await Payment.find({
            userId: { $in: possibleUserIds },
            status: 'approved'
        });
        
        console.log(`Found ${payments.length} approved payments.`);
        
        let fixedCount = 0;
        for (const payment of payments) {
            for (const eid of payment.effectIds) {
                // Chỉ xử lý effectId là MongoId (24 chars hex)
                if (eid.length === 24 && /^[0-9a-fA-F]{24}$/.test(eid)) {
                    const exists = user.purchasedEffects.find(pe => pe.effectId && pe.effectId.toString() === eid);
                    if (!exists) {
                        user.purchasedEffects.push({
                            effectId: new mongoose.Types.ObjectId(eid),
                            purchasedAt: new Date(),
                            licenseKey: 'RECOVERED-' + Math.random().toString(36).substr(2, 9).toUpperCase()
                        });
                        console.log(`✅ Fixed effect: ${eid}`);
                        fixedCount++;
                    }
                }
            }
        }
        
        if (fixedCount > 0) {
            await user.save();
            console.log(`Successfully synced ${fixedCount} effects!`);
        } else {
            console.log('No missing effects found.');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Sync error:', error);
        process.exit(1);
    }
}

syncEffects();

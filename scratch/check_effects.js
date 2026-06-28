const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/effectstore');
        console.log('Connected to MongoDB');
        
        const EffectSchema = new mongoose.Schema({}, { strict: false });
        const Effect = mongoose.model('Effect', EffectSchema, 'effects');
        
        const effects = await Effect.find({});
        console.log(JSON.stringify(effects, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();

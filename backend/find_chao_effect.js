const mongoose = require('mongoose');
require('dotenv').config();

const effectSchema = new mongoose.Schema({
    name: String,
    timeline: Array,
    isComposite: Boolean
}, { strict: false });

const Effect = mongoose.models.Effect || mongoose.model('Effect', effectSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/effectstore');
        const chao = await Effect.findOne({ name: /chảo/i });
        console.log('---CHAO---');
        console.log(JSON.stringify(chao, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();

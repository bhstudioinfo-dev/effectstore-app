const mongoose = require('mongoose');
require('dotenv').config();

const effectSchema = new mongoose.Schema({
    name: String,
    timeline: Object,
    isComposite: Boolean
}, { strict: false });

const Effect = mongoose.models.Effect || mongoose.model('Effect', effectSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/effectstore');
        
        const updatedTimeline = {
            config: {
                source: 'auto_webcam',
                duration: 2000,
                easing: 'easeInOut',
                start: {
                    positionX: 0,
                    positionY: 0,
                    scaleX: 1,
                    scaleY: 1,
                    rotation: 0
                },
                end: {
                    positionX: 404,
                    positionY: 826,
                    scaleX: 0.4069,
                    scaleY: 0.4070,
                    rotation: 0
                }
            }
        };

        const result = await Effect.findByIdAndUpdate('69e7ba09307f84bb3bd242e6', {
            timeline: updatedTimeline,
            isComposite: true
        }, { new: true });

        console.log('---UPDATED CHAO---');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();

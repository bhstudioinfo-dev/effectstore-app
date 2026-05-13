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
        
        const originalTimeline = [
            {
              "time": 0,
              "action": "layer",
              "source": "auto_webcam",
              "layer": "above",
              "transform": { "x": 0, "y": 0, "scale": 100 }
            },
            {
              "time": 1,
              "action": "scale",
              "source": "auto_webcam",
              "layer": "above",
              "transform": { "x": 0, "y": 0, "scale": 50 }
            },
            {
              "time": 5,
              "action": "move",
              "source": "auto_webcam",
              "layer": "above",
              "transform": { "x": 0, "y": 0, "scale": 100 },
              "isAutoReset": true
            },
            {
              "time": 5,
              "action": "move",
              "source": "auto_webcam",
              "layer": "above",
              "transform": { "x": 0, "y": 0, "scale": 100 },
              "isAutoReset": true
            }
        ];

        const result = await Effect.findByIdAndUpdate('69e7ba09307f84bb3bd242e6', {
            timeline: originalTimeline,
            isComposite: true
        }, { new: true });

        console.log('---RESTORED CHAO---');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();

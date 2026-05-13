const obsService = require('./obsService');

class EffectQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.broadcastFn = null;
    }

    setBroadcastFn(fn) {
        this.broadcastFn = fn;
    }

    async add(effectId, duration = 5000, giftData = null) {
        console.log(`📥 Adding to queue: ${effectId} (${duration}ms)`);
        this.queue.push({ effectId, duration, giftData });
        if (!this.isProcessing) {
            this.process();
        }
    }

    async process() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { effectId, duration, giftData } = this.queue.shift();

        console.log(`🎬 Processing queue: triggering ${effectId}`);

        if (giftData && this.broadcastFn) {
            this.broadcastFn('gift', giftData);
        }

        const durationMs = duration < 100 ? duration * 1000 : duration;

        await obsService.triggerOBSEffect(effectId, durationMs);

        setTimeout(() => {
            this.process();
        }, durationMs);
    }
}

module.exports = new EffectQueue();

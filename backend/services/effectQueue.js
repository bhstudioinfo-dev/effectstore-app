const obsService = require('./obsService');

class EffectQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.broadcastFn = null;
        this.current = null;
        this.currentStartedAt = null;
        this.currentEndsAt = null;
        this.currentTimer = null;
    }

    setBroadcastFn(fn) {
        this.broadcastFn = fn;
    }

    normalizeDurationMs(duration) {
        const value = Number(duration);
        if (!Number.isFinite(value) || value <= 0) return null;
        return value < 100 ? Math.round(value * 1000) : Math.round(value);
    }

    async add(effectId, duration, giftData = null, effectName = '') {
        const durationMs = this.normalizeDurationMs(duration);
        if (!durationMs) {
            console.warn(`Skipping effect ${effectId}: missing valid duration`);
            return false;
        }

        console.log(`Adding to queue: ${effectId} (${durationMs}ms)`);
        this.queue.push({ effectId, effectName: effectName || effectId, duration: durationMs, giftData });
        if (!this.isProcessing) {
            this.process();
        }
        return true;
    }

    getStatus() {
        const now = Date.now();
        const next = this.queue[0] || null;
        return {
            status: this.current ? 'playing' : (this.queue.length ? 'queued' : 'idle'),
            currentEffectId: this.current?.effectId || null,
            currentEffectName: this.current?.effectName || null,
            remainingMs: this.currentEndsAt ? Math.max(0, this.currentEndsAt - now) : 0,
            queueLength: this.queue.length,
            nextEffectName: next?.effectName || null
        };
    }

    async process() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            this.current = null;
            this.currentStartedAt = null;
            this.currentEndsAt = null;
            return;
        }

        this.isProcessing = true;
        const { effectId, effectName, duration, giftData } = this.queue.shift();
        this.current = { effectId, effectName: effectName || effectId, duration };
        this.currentStartedAt = Date.now();
        this.currentEndsAt = this.currentStartedAt + duration;

        console.log(`Processing queue: triggering ${effectId}`);

        if (giftData && this.broadcastFn) {
            this.broadcastFn('gift', giftData);
        }

        await obsService.triggerOBSEffect(effectId, duration);

        this.currentTimer = setTimeout(() => {
            this.current = null;
            this.currentStartedAt = null;
            this.currentEndsAt = null;
            this.currentTimer = null;
            this.process();
        }, duration);
    }
}

module.exports = new EffectQueue();

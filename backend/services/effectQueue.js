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
        this.pendingPlayerRequestId = null;
    }

    setBroadcastFn(fn) {
        this.broadcastFn = fn;
    }

    normalizeDurationMs(duration) {
        const value = Number(duration);
        if (!Number.isFinite(value) || value <= 0) return null;
        return value < 100 ? Math.round(value * 1000) : Math.round(value);
    }

    normalizeItem(effectOrItem, duration, giftData = null, effectName = '') {
        const input = effectOrItem && typeof effectOrItem === 'object'
            ? effectOrItem
            : {
                effectId: effectOrItem,
                effectName,
                duration,
                giftData,
                playbackType: 'live_mapping'
            };
        const durationMs = this.normalizeDurationMs(input.duration);
        const effectId = String(input.effectId || '').trim();
        if (!effectId || !durationMs) return null;

        return {
            effectId,
            effectName: input.effectName || effectId,
            effectUrl: input.effectUrl || null,
            duration: durationMs,
            playbackType: input.playbackType || 'live_mapping',
            priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
            createdAt: input.createdAt || Date.now(),
            giftData: input.giftData || null
        };
    }

    async add(effectOrItem, duration, giftData = null, effectName = '') {
        const item = this.normalizeItem(effectOrItem, duration, giftData, effectName);
        if (!item) {
            const effectId = typeof effectOrItem === 'object' ? effectOrItem?.effectId : effectOrItem;
            console.warn(`Skipping effect ${effectId}: missing id or valid duration`);
            return false;
        }
        if ((item.playbackType === 'test_mapping' || item.playbackType === 'preview_effect') && !item.effectUrl) {
            console.warn(`Skipping ${item.playbackType} ${item.effectId}: missing effect URL`);
            return false;
        }

        console.log(`Adding to queue: ${item.effectId} (${item.duration}ms, ${item.playbackType})`);
        this.queue.push(item);
        if (!this.isProcessing) this.process();
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

    clearCurrentAndContinue() {
        if (this.currentTimer) clearTimeout(this.currentTimer);
        this.currentTimer = null;
        this.pendingPlayerRequestId = null;
        this.current = null;
        this.currentStartedAt = null;
        this.currentEndsAt = null;
        this.process();
    }

    handleEffectPlayerEvent(event, data = {}) {
        if (!this.current || !['test_mapping', 'preview_effect'].includes(this.current.playbackType)) return false;
        if (!this.pendingPlayerRequestId || data.requestId !== this.pendingPlayerRequestId) return false;
        if (event !== 'effect_player_play_finished' && event !== 'effect_player_play_failed') return false;

        console.log(`[QUEUE] effect_player ${event === 'effect_player_play_finished' ? 'finished' : 'failed'}`);
        this.clearCurrentAndContinue();
        return true;
    }

    startEffectPlayerPlayback(item) {
        const requestId = `${item.playbackType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.pendingPlayerRequestId = requestId;
        console.log(`[QUEUE] playbackType=${item.playbackType} → effect_player`);
        console.log('[QUEUE] waiting for effect_player finish');

        this.broadcastFn('effect_player_play_request', {
            requestId,
            effectId: item.effectId,
            effectName: item.effectName,
            effectUrl: item.effectUrl,
            duration: item.duration,
            playbackType: item.playbackType,
            startedAt: Date.now()
        });

        // Actual completion comes from effect_player_play_finished. This timeout
        // is only a deadlock guard if the overlay disconnects or never responds.
        this.currentTimer = setTimeout(() => {
            if (this.pendingPlayerRequestId !== requestId) return;
            console.warn('[QUEUE] effect_player safety timeout; continuing queue');
            this.clearCurrentAndContinue();
        }, item.duration + 3000);
    }

    async process() {
        if (this.current) return;
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const item = this.queue.shift();
        this.current = item;
        this.currentStartedAt = Date.now();
        this.currentEndsAt = this.currentStartedAt + item.duration;

        if (item.giftData && this.broadcastFn) this.broadcastFn('gift', item.giftData);

        if (item.playbackType === 'test_mapping' || item.playbackType === 'preview_effect') {
            if (typeof this.broadcastFn !== 'function') {
                console.warn('[QUEUE] effect_player channel unavailable; skipping test mapping');
                this.clearCurrentAndContinue();
                return;
            }
            this.startEffectPlayerPlayback(item);
            return;
        }

        // Hybrid Phase 2C: real TikTok/simulated live mappings stay on the old
        // per-effect OBS source architecture until a later migration phase.
        console.log(`[QUEUE] playbackType=${item.playbackType} → legacy triggerOBSEffect`);
        await obsService.triggerOBSEffect(item.effectId, item.duration);
        this.currentTimer = setTimeout(() => this.clearCurrentAndContinue(), item.duration);
    }
}

module.exports = new EffectQueue();

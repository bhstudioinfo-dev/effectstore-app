const obsService = require('./obsService');
const playbackManager = require('./playbackManager');
const eventBus = require('./eventBus');

class EffectQueue {
    constructor() {
        this.queue = [];
        this.broadcastFn = null;
        this.recentEventKeys = new Map();
        
        // Listen to playback manager events to handle queue empty or queue updates
        eventBus.on('effect_playback_finished', () => {
            if (this.queue.length === 0) {
                eventBus.emit('effect_queue_empty', { emittedAt: Date.now() });
            }
            this.process();
        });
        eventBus.on('effect_playback_started', (item) => {
            this.recordUsage(item).catch((error) => {
                console.warn('Unable to record effect usage:', error.message);
            });
        });
    }

    setBroadcastFn(fn) {
        this.broadcastFn = fn;
        // Keep fallback broadcasting for backward compatibility with old listeners
        if (typeof fn === 'function') {
            eventBus.removeAllListeners('effect_playback_started_broadcast');
            eventBus.removeAllListeners('effect_playback_finished_broadcast');
            eventBus.removeAllListeners('effect_queue_empty_broadcast');
            eventBus.removeAllListeners('effect_player_play_request_broadcast');

            eventBus.on('effect_playback_started', (item) => {
                fn('effect_playback_started', {
                    effectId: item.effectId,
                    effectName: item.effectName,
                    playbackType: item.playbackType,
                    duration: item.duration,
                    startedAt: playbackManager.currentStartedAt || Date.now(),
                    giftData: item.giftData || null
                });
            });

            eventBus.on('effect_playback_finished', ({ item, reason }) => {
                fn('effect_playback_finished', {
                    effectId: item?.effectId,
                    effectName: item?.effectName,
                    playbackType: item?.playbackType,
                    duration: item?.duration,
                    startedAt: playbackManager.currentStartedAt,
                    finishedAt: Date.now(),
                    reason,
                    queueLength: this.queue.length,
                    nextEffectName: this.queue[0]?.effectName || null,
                    giftData: item?.giftData || null
                });
            });

            eventBus.on('effect_queue_empty', (data) => {
                fn('effect_queue_empty', data);
            });

            eventBus.on('effect_player_play_request', (data) => {
                fn('effect_player_play_request', data);
            });

            eventBus.on('queue_updated', (data) => {
                fn('queue_updated', data);
            });
        }
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
        if (!effectId && (!input.effects || input.effects.length === 0)) return null;
        if (effectId && !durationMs && (!input.effects || input.effects.length === 0)) return null;

        return {
            mappingId: input.mappingId || null,
            effectId,
            effectName: input.effectName || effectId,
            effectUrl: input.effectUrl || null,
            duration: durationMs || 3000,
            playbackType: input.playbackType || 'live_mapping',
            priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
            createdAt: input.createdAt || Date.now(),
            giftData: input.giftData || null,
            effects: input.effects || [],
            playbackMode: input.playbackMode || 'random',
            userId: input.userId || null,
            eventKey: String(input.eventKey || input.giftData?.eventId || input.giftData?.msgId || '').trim() || null
        };
    }

    async recordUsage(item) {
        const userId = String(item?.userId || '').trim();
        const effectId = String(item?.effectId || '').trim();
        if (!userId || !effectId || !/^[a-f\d]{24}$/i.test(userId) || !/^[a-f\d]{24}$/i.test(effectId)) return;

        const User = require('../models/User');
        const Effect = require('../models/Effect');
        const usedAt = new Date();
        await Promise.all([
            User.updateOne(
                { _id: userId, 'purchasedEffects.effectId': effectId },
                {
                    $inc: { totalUses: 1, 'purchasedEffects.$.useCount': 1 },
                    $set: { 'purchasedEffects.$.lastUsedAt': usedAt }
                }
            ),
            Effect.updateOne({ _id: effectId }, { $inc: { uses: 1 } })
        ]);
    }

    isDuplicateEvent(item) {
        if (!item.eventKey) return false;
        const now = Date.now();
        for (const [key, expiresAt] of this.recentEventKeys) {
            if (expiresAt <= now) this.recentEventKeys.delete(key);
        }
        if (this.recentEventKeys.has(item.eventKey)) return true;
        this.recentEventKeys.set(item.eventKey, now + 5 * 60 * 1000);
        return false;
    }

    async add(effectOrItem, duration, giftData = null, effectName = '') {
        const item = this.normalizeItem(effectOrItem, duration, giftData, effectName);
        if (!item) {
            const effectId = typeof effectOrItem === 'object' ? effectOrItem?.effectId : effectOrItem;
            console.warn(`Skipping effect ${effectId}: missing id or valid duration`);
            return false;
        }

        const maxQueueSize = Math.max(10, Math.min(2000, Number(process.env.MAX_EFFECT_QUEUE_SIZE) || 500));
        if (this.queue.length >= maxQueueSize) {
            console.warn(`Skipping effect ${item.effectId}: queue limit ${maxQueueSize} reached`);
            return false;
        }

        if (this.isDuplicateEvent(item)) {
            console.warn(`Skipping duplicate effect event: ${item.eventKey}`);
            return false;
        }

        // Validate URLs for test or live mapping
        const canResolveMediaBeforePlayback = Boolean(
            item.userId &&
            item.effectId &&
            (!item.effects || item.effects.length === 0)
        );
        if ((item.playbackType === 'test_mapping' || item.playbackType === 'preview_effect' || item.playbackType === 'live_mapping') &&
            !item.effectUrl &&
            (!item.effects || item.effects.length === 0) &&
            !canResolveMediaBeforePlayback) {
            console.warn(`Skipping ${item.playbackType} ${item.effectId}: missing effect URL/group`);
            return false;
        }

        console.log(`Adding to queue: ${item.effectId} (${item.duration}ms, ${item.playbackType})`);
        
        // High Traffic Extension Point
        this.onBeforeEnqueue(item);

        this.queue.push(item);
        
        // Sort queue by priority desc, then createdAt asc
        this.queue.sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt));

        eventBus.emit('queue_updated', this.getStatus());
        
        this.process();
        return true;
    }

    // Part 6 High Traffic Mode - Queue Extension Point
    onBeforeEnqueue(item) {
        // Placeholder for future aggregation logic:
        // e.g. merge multiple consecutive small gifts into a single combo item
    }

    getStatus() {
        const now = Date.now();
        const next = this.queue[0] || null;
        const currentPlayback = playbackManager.getCurrentPlayback();
        return {
            status: currentPlayback ? 'playing' : (this.queue.length ? 'queued' : 'idle'),
            currentPlaybackType: currentPlayback?.playbackType || null,
            currentEffectId: currentPlayback?.effectId || null,
            currentEffectName: currentPlayback?.effectName || null,
            currentGiftName: currentPlayback?.giftData?.giftName || null,
            currentSender: currentPlayback?.giftData?.nickname || currentPlayback?.giftData?.uniqueId || null,
            currentQuantity: currentPlayback?.giftData?.repeatCount || 1,
            remainingMs: playbackManager.getRemainingMs(),
            queueLength: this.queue.length,
            nextPlaybackType: next?.playbackType || null,
            nextEffectName: next?.effectName || null,
            queue: this.queue.map(q => ({
                effectId: q.effectId,
                effectName: q.effectName,
                playbackType: q.playbackType,
                priority: q.priority,
                createdAt: q.createdAt,
                sender: q.giftData?.nickname || q.giftData?.uniqueId || 'System',
                giftName: q.giftData?.giftName || null,
                quantity: q.giftData?.repeatCount || 1
            }))
        };
    }

    handleEffectPlayerEvent(event, data = {}) {
        const handled = playbackManager.handleEffectPlayerEvent(event, data, () => {
            this.process();
        });
        if (handled) {
            eventBus.emit('queue_updated', this.getStatus());
        }
        return handled;
    }

    async process() {
        if (playbackManager.isBusy()) return;
        if (this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        eventBus.emit('queue_updated', this.getStatus());

        if (item.giftData && this.broadcastFn) {
            this.broadcastFn('gift', item.giftData);
        }

        try {
            await playbackManager.play(item, () => {
                this.process();
            });
        } catch (error) {
            console.error(`Unable to play effect ${item.effectId}:`, error.message || error);
            if (this.broadcastFn) {
                this.broadcastFn('effect_warning', {
                    effectId: item.effectId,
                    effectName: item.effectName,
                    playbackType: item.playbackType,
                    message: error.message || 'Không thể phát hiệu ứng.'
                });
            }
            playbackManager.failCurrent('playback_error', () => this.process());
        }
    }
}

module.exports = new EffectQueue();

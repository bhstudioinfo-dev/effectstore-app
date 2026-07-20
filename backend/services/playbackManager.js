const obsService = require('./obsService');
const eventBus = require('./eventBus');
const { resolveEffectForUser, resolveEffectDurationForUser } = require('./effectLibraryService');
const { issueEffectAccessToken } = require('./effectAccessToken');

class PlaybackManager {
    constructor() {
        this.current = null;
        this.currentStartedAt = null;
        this.currentEndsAt = null;
        this.currentTimer = null;
        this.pendingPlayerRequestId = null;
        this.cooldowns = new Map(); // mappingId -> timestamp
        this.sequentialIndices = new Map(); // mappingId -> index
    }

    isBusy() {
        return this.current !== null;
    }

    getCurrentPlayback() {
        return this.current;
    }

    getRemainingMs() {
        if (!this.currentEndsAt) return 0;
        return Math.max(0, this.currentEndsAt - Date.now());
    }

    isMappingInCooldown(mappingId, cooldownSeconds) {
        if (!cooldownSeconds || cooldownSeconds <= 0) return false;
        const lastTriggered = this.cooldowns.get(String(mappingId));
        if (!lastTriggered) return false;
        const elapsed = (Date.now() - lastTriggered) / 1000;
        return elapsed < cooldownSeconds;
    }

    registerMappingTrigger(mappingId) {
        this.cooldowns.set(String(mappingId), Date.now());
    }

    async play(item, onFinishedCallback) {
        if (this.current) {
            console.warn('[PLAYBACK] Playback is already busy, skipping immediate play request');
            return;
        }

        this.current = item;
        this.currentStartedAt = Date.now();
        this.currentEndsAt = this.currentStartedAt + item.duration;

        // 1. Random/Sequential Group Selection
        if (item.effects && item.effects.length > 0) {
            let selectedEffect = null;
            const mappingIdStr = String(item.mappingId || '');
            
            if (item.playbackMode === 'sequential') {
                const idx = this.sequentialIndices.get(mappingIdStr) || 0;
                selectedEffect = item.effects[idx % item.effects.length];
                this.sequentialIndices.set(mappingIdStr, (idx + 1) % item.effects.length);
            } else {
                // Default: Random selection
                const randIndex = Math.floor(Math.random() * item.effects.length);
                selectedEffect = item.effects[randIndex];
            }

            if (selectedEffect) {
                item.effectId = selectedEffect.effectId;
                item.effectName = selectedEffect.effectName;
                
                // Re-resolve duration for user if needed
                if (item.userId) {
                    const dur = await resolveEffectDurationForUser(item.userId, item.effectId);
                    if (dur) {
                        item.duration = dur < 100 ? dur * 1000 : dur;
                        this.currentEndsAt = this.currentStartedAt + item.duration;
                    }
                    
                    // Resolve effect details for URL
                    const resolvedEffect = await resolveEffectForUser(item.userId, item.effectId);
                    if (resolvedEffect) {
                        item.effectUrl = this.buildEffectPlayerUrl(item.userId, item.effectId, resolvedEffect);
                    }
                }
            }
        }

        // Emit global playback started event
        eventBus.emit('effect_playback_started', item);

        // 2. Playback Mechanism
        if (item.playbackType === 'test_mapping' || item.playbackType === 'preview_effect' || item.playbackType === 'live_mapping') {
            this.startEffectPlayerPlayback(item, onFinishedCallback);
        } else {
            // Legacy OBS Trigger
            console.log(`[PLAYBACK] playbackType=${item.playbackType} → legacy triggerOBSEffect`);
            await obsService.triggerOBSEffect(item.effectId, item.duration);
            this.currentTimer = setTimeout(() => {
                this.clearCurrentAndFinished(onFinishedCallback, 'finished');
            }, item.duration);
        }
    }

    startEffectPlayerPlayback(item, onFinishedCallback) {
        const requestId = `${item.playbackType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.pendingPlayerRequestId = requestId;
        console.log(`[PLAYBACK] playbackType=${item.playbackType} → effect_player`);

        eventBus.emit('effect_player_play_request', {
            requestId,
            effectId: item.effectId,
            effectName: item.effectName,
            effectUrl: item.effectUrl,
            duration: item.duration,
            playbackType: item.playbackType,
            startedAt: Date.now()
        });

        // safety timeout
        this.currentTimer = setTimeout(() => {
            if (this.pendingPlayerRequestId !== requestId) return;
            console.warn('[PLAYBACK] effect_player safety timeout; continuing queue');
            this.clearCurrentAndFinished(onFinishedCallback, 'safety_timeout');
        }, item.duration + 3000);
    }

    handleEffectPlayerEvent(event, data = {}, onFinishedCallback) {
        if (!this.current || !['test_mapping', 'preview_effect', 'live_mapping'].includes(this.current.playbackType)) return false;
        if (!this.pendingPlayerRequestId || data.requestId !== this.pendingPlayerRequestId) return false;
        if (event !== 'effect_player_play_finished' && event !== 'effect_player_play_failed') return false;

        const reason = event === 'effect_player_play_finished' ? (data.reason || 'finished') : (data.message || 'failed');
        console.log(`[PLAYBACK] effect_player completed: ${reason}`);
        this.clearCurrentAndFinished(onFinishedCallback, reason);
        return true;
    }

    clearCurrentAndFinished(onFinishedCallback, reason = 'finished') {
        const finishedItem = this.current;
        if (this.currentTimer) clearTimeout(this.currentTimer);
        this.currentTimer = null;
        this.pendingPlayerRequestId = null;
        this.current = null;
        this.currentStartedAt = null;
        this.currentEndsAt = null;

        // Emit global finished event
        eventBus.emit('effect_playback_finished', {
            item: finishedItem,
            reason
        });

        if (typeof onFinishedCallback === 'function') {
            onFinishedCallback();
        }
    }

    failCurrent(reason = 'failed', onFinishedCallback) {
        if (!this.current) {
            if (typeof onFinishedCallback === 'function') onFinishedCallback();
            return false;
        }
        this.clearCurrentAndFinished(onFinishedCallback, reason);
        return true;
    }

    buildEffectPlayerUrl(userId, effectId, resolvedEffect) {
        if (resolvedEffect?.isCustom) return resolvedEffect.fileUrl;

        const PORT = process.env.PORT || 9000;
        const streamToken = issueEffectAccessToken({
            purpose: 'effect-player-live-mapping',
            effectId,
            userId: String(userId)
        });

        return `http://localhost:${PORT}/api/obs/effect-player-media/${encodeURIComponent(effectId)}?token=${encodeURIComponent(streamToken)}`;
    }
}

module.exports = new PlaybackManager();

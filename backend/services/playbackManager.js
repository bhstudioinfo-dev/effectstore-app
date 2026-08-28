const obsService = require('./obsService');
const eventBus = require('./eventBus');
const {
    resolveEffectForUser,
    resolveEffectDurationForUser,
    isCustomEffectMediaAvailable
} = require('./effectLibraryService');
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
                    if (resolvedEffect) item.effectUrl = this.buildEffectPlayerUrl(item.userId, item.effectId, resolvedEffect);
                }
            }
        }

        if (['test_mapping', 'preview_effect', 'live_mapping'].includes(item.playbackType) && item.userId && item.effectId) {
            if (!item.effectUrl || !item.duration) {
                const resolvedEffect = await resolveEffectForUser(item.userId, item.effectId);
                if (!resolvedEffect) {
                    throw new Error('Hiệu ứng không còn thuộc tài khoản hoặc đã bị xóa.');
                }

                const resolvedDuration = await resolveEffectDurationForUser(item.userId, item.effectId);
                if (!resolvedDuration) {
                    throw new Error('Hiệu ứng chưa có thời lượng hợp lệ.');
                }
                item.duration = resolvedDuration < 100 ? Math.round(resolvedDuration * 1000) : Math.round(resolvedDuration);
                this.currentEndsAt = this.currentStartedAt + item.duration;

                if (resolvedEffect.isCustom && !await isCustomEffectMediaAvailable(resolvedEffect)) {
                    throw new Error('Không tìm thấy file hiệu ứng cá nhân trên máy này. Hãy thêm lại hiệu ứng.');
                }

                if (!item.effectUrl) {
                    item.effectUrl = this.buildEffectPlayerUrl(item.userId, item.effectId, resolvedEffect);
                }
            } else {
                this.currentEndsAt = this.currentStartedAt + item.duration;
            }
        }

        if (['test_mapping', 'preview_effect', 'live_mapping'].includes(item.playbackType) && !item.effectUrl) {
            throw new Error('Không tìm thấy địa chỉ phát hiệu ứng.');
        }

        // Emit global playback started event
        eventBus.emit('effect_playback_started', item);

        // 2. Playback Mechanism
        if (item.playbackType === 'test_mapping' || item.playbackType === 'preview_effect' || item.playbackType === 'live_mapping') {
            this.startEffectPlayerPlayback(item, onFinishedCallback);
        } else {
            // Legacy OBS Trigger
            console.log(`[PLAYBACK] playbackType=${item.playbackType} → legacy triggerOBSEffect`);
            const triggered = await obsService.triggerOBSEffect(item.effectId, item.duration);
            if (!triggered) {
                // OBS wasn't connected or rejected the source update — the
                // effect never actually appeared on stream. Throwing here
                // (instead of arming a timer as if it played) routes back
                // through effectQueue's catch, which emits effect_warning
                // and frees the queue via failCurrent() instead of the
                // streamer silently seeing nothing happen.
                throw new Error('Không thể kích hoạt hiệu ứng trên OBS (OBS chưa kết nối hoặc từ chối yêu cầu).');
            }
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
            audioEnabled: item.audioEnabled !== false,
            audioVolume: Math.max(0, Math.min(1, Number.isFinite(Number(item.audioVolume)) ? Number(item.audioVolume) : 1)),
            startedAt: Date.now()
        });

        // 🎬 Tự động kích hoạt chuyển động Timeline trên OBS nếu hiệu ứng có Timeline
        this.triggerTimelineIfConfigured(item);

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

        if (event === 'effect_player_play_started') {
            this.currentStartedAt = data.startedAt || Date.now();
            this.currentEndsAt = this.currentStartedAt + (this.current?.duration || 3000);
            eventBus.emit('effect_playback_started', this.current);
            return true;
        }

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

    async triggerTimelineIfConfigured(item) {
        try {
            if (!item || !item.effectId) return;
            const Effect = require('../models/Effect');
            let effect = await Effect.findById(item.effectId).lean();
            if (!effect && item.userId) {
                effect = await resolveEffectForUser(item.userId, item.effectId);
            }
            if (!effect) return;

            let keyframes = [];
            if (Array.isArray(item.customTimeline) && item.customTimeline.length > 0) {
                keyframes = item.customTimeline;
            } else {
                let timeline = effect.timeline;
                if (typeof timeline === 'string') {
                    try { timeline = JSON.parse(timeline); } catch (_e) {}
                }
                if (Array.isArray(timeline)) {
                    keyframes = timeline;
                } else if (timeline && Array.isArray(timeline.config)) {
                    keyframes = timeline.config;
                } else if (timeline && Array.isArray(timeline.keyframes)) {
                    keyframes = timeline.keyframes;
                }
            }

            if (keyframes.length > 0 && obsService.isConnected()) {
                console.log(`[PLAYBACK] 🎬 Auto-triggering OBS Timeline for effect ${item.effectId} (${keyframes.length} keyframes)`);
                const OBSController = require('../obs-controller');
                const obsController = new OBSController(obsService.obs);
                obsController.isConnected = true;

                let sceneName = 'EffectStore';
                try {
                    const currentScene = await obsService.obs.call('GetCurrentProgramScene');
                    if (currentScene && currentScene.currentProgramSceneName) {
                        sceneName = currentScene.currentProgramSceneName;
                    }
                } catch (_e) {}

                obsController.runTimelineEffect(sceneName, item.effectId, keyframes);
            }
        } catch (err) {
            console.error('[PLAYBACK] Error triggering OBS timeline:', err);
        }
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

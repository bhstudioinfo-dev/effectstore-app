const { TikTokLiveConnection } = require('tiktok-live-connector');
const GiftMapping = require('../models/GiftMapping');
const ChallengeWheel = require('../models/ChallengeWheel');
const Effect = require('../models/Effect');
const GiftLog = require('../models/GiftLog');
const effectQueue = require('./effectQueue');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const User = require('../models/User');
const { getEntitlements, upgradePayload } = require('../config/planEntitlements');
const { resolveEffectForUser, resolveEffectDurationForUser } = require('./effectLibraryService');
const fs = require('fs');
const path = require('path');
const { paths: dataPaths } = require('../config/dataPaths');

const FALLBACK_GIFTS = [
    { giftId: '5655', giftName: 'Rose', diamondCount: 1, iconUrl: '/assets/gift-icons/Rose.png', source: 'fallback-preview' },
    { giftId: '5269', giftName: 'TikTok', diamondCount: 1, iconUrl: '/assets/gift-icons/TikTok.png', source: 'fallback-preview' },
    { giftId: 'corgi', giftName: 'Corgi', diamondCount: 50, iconUrl: '/assets/gift-icons/Corgi.png', source: 'fallback-preview' },
    { giftId: 'galaxy', giftName: 'Galaxy', diamondCount: 1000, iconUrl: '/assets/gift-icons/Rosa.png', source: 'fallback-preview' }
];

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function chooseWheelSegment(segments) {
    const usable = (Array.isArray(segments) ? segments : []).filter((segment) => segment && segment.label && Number(segment.weight) > 0);
    if (!usable.length) return null;
    const total = usable.reduce((sum, segment) => sum + Number(segment.weight || 1), 0);
    let cursor = Math.random() * total;
    for (const segment of usable) {
        cursor -= Number(segment.weight || 1);
        if (cursor <= 0) return segment;
    }
    return usable[usable.length - 1];
}

async function resolveWheelPresentation(userId, wheel) {
    let item = null;
    if (wheel?.sourceTemplateId) {
        const template = await GiftMenuLayout.findOne({ _id: wheel.sourceTemplateId, isTemplate: true }).select('items exportedItems').lean().catch(() => null);
        item = [...(template?.items || []), ...(template?.exportedItems || [])].find((entry) => entry?.type === 'challenge-wheel');
    }
    if (!item) return wheel?.presentation || {};
    const saved = wheel?.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {};
    const savedNumber = (key, fallback, allowZero = false) => {
        const value = Number(saved[key]);
        const backup = Number(fallback);
        // Older saves stored logical export dimensions (about 3x the
        // Designer canvas size). Reject that stale form when a canvas-size
        // fallback is available, so existing wheels migrate automatically.
        const isDimension = key === 'boardWidth' || key === 'boardHeight';
        const isExportLogical = saved.coordinateSpace === 'export-logical-v1';
        if (Number.isFinite(value) && (allowZero || value > 0)
            && (!isDimension || isExportLogical || !Number.isFinite(backup) || backup <= 0 || (value >= backup * 0.75 && value <= backup * 1.5))) return value;
        return Number.isFinite(backup) && (allowZero || backup > 0) ? backup : 0;
    };
    return {
        ...saved,
        hideBorder: Boolean(item.hideBorder), hideBg: Boolean(item.hideBg), ringEffect: item.ringEffect || 'gold',
        borderColor: item.borderColor || '#d6a84f', useCustomTextColor: Boolean(item.useCustomTextColor),
        textColor: item.textColor || '#ffffff', labelFontSize: Number(item.labelFontSize) || 16,
        boardWidth: savedNumber('boardWidth', item.w || item.width || item.lockedW),
        boardHeight: savedNumber('boardHeight', item.h || item.height || item.lockedH),
        boardX: savedNumber('boardX', item.x, true),
        boardY: savedNumber('boardY', item.y, true)
    };
}

async function resolveWheelConfig(userId, wheel) {
    // A Gift Mapping points to one immutable wheel record. Do not resolve
    // from the user's currently active menu, otherwise switching menus
    // silently changes the mapped wheel.
    let item = null;
    if (wheel?.sourceTemplateId) {
        const template = await GiftMenuLayout.findOne({ _id: wheel.sourceTemplateId, isTemplate: true }).select('items exportedItems').lean().catch(() => null);
        item = [...(template?.items || []), ...(template?.exportedItems || [])].find((entry) => entry?.type === 'challenge-wheel');
    }
    if (!item) return wheel;
    const saved = wheel.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {};
    const savedNumber = (key, fallback, allowZero = false) => {
        const value = Number(saved[key]);
        const backup = Number(fallback);
        const isDimension = key === 'boardWidth' || key === 'boardHeight';
        const isExportLogical = saved.coordinateSpace === 'export-logical-v1';
        if (Number.isFinite(value) && (allowZero || value > 0)
            && (!isDimension || isExportLogical || !Number.isFinite(backup) || backup <= 0 || (value >= backup * 0.75 && value <= backup * 1.5))) return value;
        return Number.isFinite(backup) && (allowZero || backup > 0) ? backup : 0;
    };
    return {
        ...wheel,
        title: wheel.title || item.title,
        segments: Array.isArray(wheel.segments) ? wheel.segments : [],
        presentation: {
            hideBorder: Boolean(item.hideBorder), hideBg: Boolean(item.hideBg), ringEffect: item.ringEffect || 'gold',
            borderColor: item.borderColor || '#d6a84f', useCustomTextColor: Boolean(item.useCustomTextColor),
            textColor: item.textColor || '#ffffff', labelFontSize: Number(item.labelFontSize) || 16,
            ...saved,
            boardWidth: savedNumber('boardWidth', item.w || item.width || item.lockedW),
            boardHeight: savedNumber('boardHeight', item.h || item.height || item.lockedH),
            boardX: savedNumber('boardX', item.x, true), boardY: savedNumber('boardY', item.y, true)
        }
    };
}

class TikTokService {
    constructor() {
        this.tiktokClient = null;
        this.lastRoomId = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.currentLiveUserId = null;
        this.broadcastFn = null;
        this.liveStats = { gifts: 0, likes: 0, chats: 0, viewers: 0, isLive: false };
        this.giftCatalogState = { gifts: [], lastSyncedAt: null, source: 'fallback-preview' };
        this.goalBoardLayout = null;
        this.liveEntitlements = getEntitlements(null);
        this.sessionUsage = { comments: 0, tts: 0, commentLimitNotified: false, ttsLimitNotified: false };
        this.sessionDonatorCoins = new Map();
    }

    init(broadcastFn) {
        this.broadcastFn = broadcastFn;
    }

    normalizeGiftId(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
    }

    getViewerKey(data = {}) {
        const userDetails = data.userDetails || data.user || {};
        const value = data.userId || userDetails.userId || data.uniqueId || userDetails.uniqueId || data.nickname || userDetails.nickname;
        return String(value || '').trim().toLowerCase();
    }

    recordSessionGift(data = {}) {
        const key = this.getViewerKey(data);
        if (!key) return 0;
        const giftCoins = Math.max(0, Number(data.diamondCount || data.diamond || data.coins || 0));
        const repeatCount = Math.max(1, Number(data.repeatCount || 1));
        const total = (this.sessionDonatorCoins.get(key) || 0) + (giftCoins * repeatCount);
        this.sessionDonatorCoins.set(key, total);
        return total;
    }

    getSessionDonatorCoins(data = {}) {
        const key = this.getViewerKey(data);
        return key ? Number(this.sessionDonatorCoins.get(key) || 0) : 0;
    }

    extractIconUrl(data = {}) {
        const image = data.image || data.iconUrl || data.giftPictureUrl || data.giftImage || data.profilePictureUrl || '';
        if (typeof image === 'string') return image;
        if (Array.isArray(image?.urlList)) return image.urlList[0] || '';
        if (Array.isArray(image?.url_list)) return image.url_list[0] || '';
        return '';
    }

    normalizeGiftFromEvent(data = {}) {
        const giftId = this.normalizeGiftId(data.giftId || data.id);
        if (!giftId) return null;
        const userDetails = data.userDetails || data.user || {};
        const profilePictureUrls = userDetails.profilePictureUrls || userDetails.profilePictureURL || userDetails.profilePictureUrlList || [];
        const profilePictureUrl = Array.isArray(profilePictureUrls) ? (profilePictureUrls[0] || '') : profilePictureUrls;
        return {
            giftId,
            giftName: data.giftName || data.name || data.label || data.gift?.name || `Gift ${giftId}`,
            diamondCount: Number(data.diamondCount || data.diamond || data.coins || 0),
            iconUrl: this.extractIconUrl(data),
            repeatCount: Number(data.repeatCount || 1),
            userId: data.userId || userDetails.userId || '',
            uniqueId: data.uniqueId || userDetails.uniqueId || '',
            nickname: data.nickname || userDetails.nickname || userDetails.displayName || '',
            avatarUrl: data.profilePictureUrl || userDetails.profilePictureUrl || profilePictureUrl || '',
            source: 'tiktok-live'
        };
    }

    shouldSkipIntermediateStreak(data = {}) {
        return Number(data.giftType) === 1 && data.repeatEnd === false;
    }

    getGiftCatalogState() {
        if (this.giftCatalogState.gifts.length) return this.giftCatalogState;
        return { gifts: FALLBACK_GIFTS, lastSyncedAt: null, source: 'fallback-preview' };
    }

    async handleGiftCatalogUpdate(giftData = {}) {
        const gift = this.normalizeGiftFromEvent(giftData);
        if (!gift) return;
        const gifts = [...this.giftCatalogState.gifts];
        const index = gifts.findIndex((item) => String(item.giftId) === String(gift.giftId));
        if (index >= 0) gifts[index] = { ...gifts[index], ...gift, source: 'tiktok-live' };
        else gifts.push(gift);
        this.giftCatalogState = { gifts, lastSyncedAt: new Date().toISOString(), source: 'tiktok-live' };
        this.broadcast('gift_catalog_update', { type: 'gift_catalog_update', gifts });

        try {
            const GiftConfig = require('../models/GiftConfig');
            await GiftConfig.findOneAndUpdate(
                { giftId: String(gift.giftId) },
                {
                    $set: {
                        giftId: String(gift.giftId),
                        giftName: gift.giftName,
                        coins: gift.diamondCount || 1,
                        iconUrl: gift.iconUrl || '',
                        isActive: true,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (_err) {}
    }

    async connect(roomId, userId = null, preserveSession = false, sessionId = null) {
        try {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.tiktokClient) {
                this.lastRoomId = null;
                this.lastSessionId = null;
                try {
                    if (typeof this.tiktokClient.disconnect === 'function') await this.tiktokClient.disconnect();
                    else if (typeof this.tiktokClient.stop === 'function') await this.tiktokClient.stop();
                } catch (_error) {}
                this.tiktokClient = null;
            }
            this.lastRoomId = roomId;
            this.lastSessionId = sessionId || null;
            this.currentLiveUserId = userId;
            const liveUser = userId ? await User.findById(userId).lean().catch(() => null) : null;
            this.liveEntitlements = getEntitlements(liveUser);
            if (!preserveSession) {
                this.sessionUsage = { comments: 0, tts: 0, commentLimitNotified: false, ttsLimitNotified: false };
                this.sessionDonatorCoins = new Map();
            }

            const clientOptions = {
                enableExtendedGiftInfo: true,
                processInitialData: false,
                fetchRoomInfoOnConnect: true,
                clientParams: {
                    app_language: 'vi-VN'
                }
            };
            if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
                clientOptions.sessionId = sessionId.trim();
                console.log(`[TikTok Service] Connecting with Authorized Session ID for room: ${roomId}`);
            }

            this.tiktokClient = new TikTokLiveConnection(roomId, clientOptions);

            this.tiktokClient.on('connected', () => {
                console.log(`Connected to TikTok Live: ${roomId} (Session ID VIP: ${Boolean(clientOptions.sessionId)})`);
                this.liveStats.isLive = true;
                this.reconnectAttempts = 0;
                this.broadcast('stats', this.liveStats);
                this.broadcast('gift_catalog_update', { type: 'gift_catalog_update', gifts: this.getGiftCatalogState().gifts });
            });

            this.tiktokClient.on('disconnected', () => {
                console.log('Disconnected from TikTok Live (Will auto-reconnect instantly)');
                this.liveStats.isLive = false;
                this.broadcast('stats', this.liveStats);
                if (this.lastRoomId) {
                    this.scheduleReconnect();
                }
            });

            this.tiktokClient.on('gift', async (data) => {
                // Snapshot once: this handler awaits several times (DB
                // lookups, effect resolution), and a disconnect/reconnect to
                // a different account can change this.currentLiveUserId
                // mid-flight. Using a stale mix of old/new userId across
                // those awaits could query one account's mappings but queue
                // playback/log usage under another. Every subsequent line
                // must use this local snapshot, never this.currentLiveUserId.
                const liveUserId = this.currentLiveUserId;
                const normalizedGift = this.normalizeGiftFromEvent(data);
                if (!normalizedGift) return;
                data = {
                    ...data,
                    ...normalizedGift,
                    giftId: normalizedGift.giftId,
                    repeatCount: Math.max(1, Number(normalizedGift.repeatCount) || 1),
                    eventId: String(data.msgId || data.eventId || data.groupId || '').trim() || undefined
                };
                this.handleGiftCatalogUpdate(data);

                // Update Real-time Goal Board progress (Phase 2)
                await this.processGoalBoardGift(data).catch(err => {
                    console.error('⚠️ Goal Board live progress sync error:', err.message);
                });
                await this.processGiftMenuGift(data).catch(err => {
                    console.error('⚠️ Gift Menu live progress sync error:', err.message);
                });

                // TikTok sends intermediate updates while a streak gift is still
                // repeating. Goal/menu counters already ignore these updates.
                // Media playback must also wait for the final repeatEnd event.
                if (this.shouldSkipIntermediateStreak(data)) return;

                this.recordSessionGift(data);

                this.liveStats.gifts += data.repeatCount;
                let mappings = [];
                if (liveUserId) {
                    const cleanSlug = String(data.giftName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
                    mappings = await GiftMapping.find({
                        userId: liveUserId,
                        $or: [
                            { giftId: String(data.giftId) },
                            { giftId: cleanSlug },
                            { giftName: new RegExp(`^${String(data.giftName || '').replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') }
                        ],
                        isActive: true
                    }).lean();
                }

                // The live session changed while the mapping lookup above was
                // in flight (account switch/reconnect) — this gift no longer
                // belongs to the now-active session, so it must not trigger
                // playback/logging attributed to either account.
                if (this.currentLiveUserId !== liveUserId) {
                    this.broadcast('stats', this.liveStats);
                    return;
                }

                const quantity = Number(data.repeatCount || 1);
                const matchingMappings = mappings.filter(m => {
                    if (m.exactQuantity !== undefined && m.exactQuantity !== null && m.exactQuantity > 0) {
                        return quantity === m.exactQuantity;
                    }
                    const minOk = quantity >= (m.minQuantity !== undefined ? m.minQuantity : 1);
                    const maxOk = (m.maxQuantity === undefined || m.maxQuantity === null || m.maxQuantity <= 0) || (quantity <= m.maxQuantity);
                    return minOk && maxOk;
                });

                if (matchingMappings.length > 0) {
                    const playbackManager = require('./playbackManager');
                    
                    for (const mapping of matchingMappings) {
                        // Cooldown logic
                        if (mapping.cooldown && mapping.cooldown > 0) {
                            const inCooldown = playbackManager.isMappingInCooldown(mapping._id, mapping.cooldown);
                            if (inCooldown) {
                                if (mapping.cooldownAction === 'ignore') {
                                    console.log(`[COOLDOWN] Mapping ${mapping._id} ignored during cooldown`);
                                    continue;
                                }
                            } else {
                                playbackManager.registerMappingTrigger(mapping._id);
                            }
                        }

                        let queued = false;
                        const wheelOnlyMapping = mapping.wheelId && (['wheel', 'effect_and_wheel'].includes(mapping.triggerType) || !mapping.effectId);
                        // Reuse the queue's own duplicate-event guard so a gift
                        // event TikTok replays around a reconnect can't spin
                        // the same wheel twice — mirrors the dedup that
                        // effect_id mappings already get via effectQueue.add().
                        const wheelEventKey = data.eventId ? `wheel-${data.eventId}-${mapping._id}` : null;
                        const isDuplicateWheelEvent = wheelEventKey && effectQueue.isDuplicateEvent({ eventKey: wheelEventKey });
                        if (wheelOnlyMapping && !isDuplicateWheelEvent) {
                            const wheel = await ChallengeWheel.findOne({ _id: mapping.wheelId, userId: liveUserId, isActive: true }).lean();
                            const resolvedWheel = wheel ? await resolveWheelConfig(liveUserId, wheel) : null;
                            const result = resolvedWheel && chooseWheelSegment(resolvedWheel.segments);
                            const presentation = resolvedWheel ? (resolvedWheel.presentation || {}) : {};
                            if (result && this.broadcast) {
                                this.broadcast('challenge_wheel_spin', {
                                    wheelId: String(resolvedWheel._id), title: resolvedWheel.title, segments: resolvedWheel.segments, presentation,
                                    resultId: result.id, resultLabel: result.label,
                                    resultImage: result.resultImage || '',
                                    durationMs: wheel.durationMs, autoHideMs: wheel.autoHideMs,
                                    giftId: data.giftId, giftName: data.giftName,
                                    nickname: data.nickname || data.uniqueId || 'TikTok user', triggeredAt: Date.now()
                                });
                                queued = true;
                            }
                        }
                        if (mapping.triggerType === 'wheel' || (wheelOnlyMapping && !mapping.effectId)) {
                            // Wheel-only mappings do not enqueue a media effect.
                        } else if (mapping.effects && mapping.effects.length > 0) {
                            // Multiple effects group mapping
                            queued = await effectQueue.add({
                                mappingId: mapping._id,
                                effects: mapping.effects,
                                playbackMode: mapping.playbackMode || 'random',
                                audioEnabled: mapping.audioEnabled !== false,
                                audioVolume: mapping.audioVolume,
                                playbackType: 'live_mapping',
                                priority: 100,
                                createdAt: Date.now(),
                                giftData: data,
                                userId: liveUserId
                            });
                        } else if (mapping.effectId) {
                            // Legacy single effect mapping
                            const effectId = String(mapping.effectId || '');
                            const resolvedEffect = await resolveEffectForUser(liveUserId, effectId);
                            const duration = await resolveEffectDurationForUser(liveUserId, effectId);
                            if (duration) {
                                queued = await effectQueue.add({
                                    mappingId: mapping._id,
                                    effectId,
                                    effectName: resolvedEffect?.name || mapping.effectName || effectId,
                                    audioEnabled: mapping.audioEnabled !== false,
                                    audioVolume: mapping.audioVolume,
                                    duration,
                                    playbackType: 'live_mapping',
                                    priority: 100,
                                    createdAt: Date.now(),
                                    giftData: data,
                                    userId: liveUserId
                                });
                            }
                        }

                        if (queued) {
                            const loggedEffectId = mapping.effects && mapping.effects.length > 0 ? 'group' : mapping.effectId;
                            await GiftLog.create({
                                giftId: data.giftId,
                                giftName: data.giftName,
                                effectId: loggedEffectId,
                                triggeredAt: new Date(),
                                sessionId: liveUserId,
                                userId: liveUserId,
                                userName: data.nickname || data.uniqueId || 'TikTok user',
                                repeatCount: data.repeatCount
                            }).catch(() => null);
                        }
                    }
                } else {
                    this.broadcast('gift', data);
                }
                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('like', (data) => { this.liveStats.likes += data.count || 1; this.broadcast('stats', this.liveStats); });
            this.tiktokClient.on('follow', (data) => this.broadcast('follow', data));
            this.tiktokClient.on('share', (data) => this.broadcast('share', data));
            this.tiktokClient.on('chat', (data) => {
                this.liveStats.chats++;
                // Every comment must continue reaching the app. Plan quotas
                // apply only when the renderer actually reads one aloud.
                this.broadcast('chat', data);
                this.broadcast('stats', this.liveStats);
                if (this.currentLiveUserId) {
                    // AI replies are intentionally independent from the system
                    // voice quotas used by read-comment/name TTS.
                    User.findById(this.currentLiveUserId).then((liveUser) => {
                        if (!liveUser) return null;
                        const aiAssistantService = require('./aiAssistantService');
                        return aiAssistantService.processChatMessage({
                            username: data.nickname || data.uniqueId || 'Khán giả',
                            comment: data.comment || '',
                            donatedCoins: this.getSessionDonatorCoins(data),
                            user: liveUser
                        });
                    }).catch((error) => console.error('AI assistant chat error:', error.message));
                }
            });
            this.tiktokClient.on('viewer', (data) => { this.liveStats.viewers = data.count || 0; this.broadcast('stats', this.liveStats); });
            this.tiktokClient.on('error', (err) => console.error('TikTok Error:', err));

            if (typeof this.tiktokClient.connect === 'function') {
                await this.tiktokClient.connect();
            } else if (typeof this.tiktokClient.start === 'function') {
                await this.tiktokClient.start();
            }
            return true;
        } catch (err) {
            console.error('Failed to start TikTok client:', err);
            return false;
        }
    }

    async disconnect() {
        this.lastRoomId = null;
        this.lastSessionId = null;
        this.currentLiveUserId = null;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.tiktokClient) {
            try {
                if (typeof this.tiktokClient.disconnect === 'function') await this.tiktokClient.disconnect();
                else if (typeof this.tiktokClient.stop === 'function') await this.tiktokClient.stop();
            } catch (_error) {}
            this.tiktokClient = null;
            this.liveStats.isLive = false;
            this.broadcast('stats', this.liveStats);
        }
    }

    scheduleReconnect() {
        if (!this.lastRoomId || this.reconnectTimer) return;
        const roomId = this.lastRoomId;
        const userId = this.currentLiveUserId;
        const sessionId = this.lastSessionId;
        
        // Fast instant reconnect for live streaming: 1.5s, 3s, 5s, max 10s
        const delay = Math.min(10000, 1500 * (1.5 ** Math.min(this.reconnectAttempts, 4)));
        this.reconnectAttempts += 1;
        console.log(`[TikTok Reconnect] Scheduling instant auto-reconnect #${this.reconnectAttempts} in ${Math.round(delay)}ms for ${roomId}...`);
        
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (!this.lastRoomId || this.lastRoomId !== roomId) return;
            const connected = await this.connect(roomId, userId, true, sessionId);
            if (!connected && this.lastRoomId === roomId) this.scheduleReconnect();
        }, delay);
    }

    isConnected() {
        return !!(this.tiktokClient && this.liveStats.isLive);
    }

    broadcast(event, data) {
        // Scope to whichever account currently owns the live TikTok session,
        // so a second logged-in account on the same backend doesn't receive
        // this session's gift/chat/stats/effect data. When no session is
        // live, currentLiveUserId is null and delivery falls back to
        // everyone (unchanged behavior for non-live-session broadcasts).
        if (this.broadcastFn) this.broadcastFn(event, data, this.currentLiveUserId);
    }

    setGoalBoardLayout(layout) {
        this.goalBoardLayout = layout;
    }

    async getGoalBoardLayout() {
        if (this.goalBoardLayout) return this.goalBoardLayout;

        const goalBoardLayoutPath = dataPaths.goalBoardLayoutPath;
        try {
            if (fs.existsSync(goalBoardLayoutPath)) {
                const raw = fs.readFileSync(goalBoardLayoutPath, 'utf8');
                this.goalBoardLayout = JSON.parse(raw || '{}');
            } else {
                this.goalBoardLayout = {
                    version: 1,
                    savedAt: new Date().toISOString(),
                    aspectRatio: '9:16',
                    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
                    layers: []
                };
            }
        } catch (err) {
            console.error('Failed to load goal board layout in tiktokService:', err);
            this.goalBoardLayout = { version: 1, layers: [] };
        }
        return this.goalBoardLayout;
    }

    async processGoalBoardGift(giftEvent) {
        if (giftEvent && giftEvent.giftType === 1 && giftEvent.repeatEnd === false) return;
        const layout = await this.getGoalBoardLayout();
        if (!layout || !Array.isArray(layout.layers) || !layout.layers.length) return;

        const gift = this.normalizeGiftFromEvent(giftEvent);
        if (!gift) return;

        const receivedGiftId = String(gift.giftId).toLowerCase();
        const receivedGiftName = String(gift.giftName || '').toLowerCase();
        const repeatCount = Number(gift.repeatCount || 1);
        const diamondCount = Number(gift.diamondCount || 0);
        const senderNickname = gift.nickname || gift.uniqueId || 'Streamer fan';
        const senderAvatar = gift.iconUrl || '';

        let hasUpdates = false;

        // 1. Update progress bars, boss HP bars & goal list arrays
        layout.layers.forEach(layer => {
            if (layer.visible === false) return;

            const layerGiftId = String(layer.giftId || '').toLowerCase();
            const layerGiftName = String(layer.giftName || '').toLowerCase();

            // Match by giftId (numeric or placeholder name) or by giftName case-insensitively
            const isMatch = (layerGiftId === receivedGiftId) || 
                            (layerGiftId === receivedGiftName) || 
                            (layerGiftName === receivedGiftName);

            if (layer.type === 'goal-bar' && layer.barStyle === 'pk') {
                if (Array.isArray(layer.pkPlayers)) {
                    let updated = false;
                    layer.pkPlayers.forEach(player => {
                        const pGiftId = String(player.giftId || '').toLowerCase();
                        const pGiftName = String(player.giftName || '').toLowerCase();
                        const isPlayerMatch = (pGiftId === receivedGiftId) || (pGiftId === receivedGiftName) || (pGiftName === receivedGiftName);
                        if (isPlayerMatch) {
                            const coinsSent = (diamondCount > 0 ? diamondCount : 1) * repeatCount;
                            player.score = (Number(player.score) || 0) + coinsSent;
                            updated = true;
                        }
                    });
                    if (updated) hasUpdates = true;
                } else {
                    // Fallback
                    const redGiftId = String(layer.giftId || '').toLowerCase();
                    const redGiftName = String(layer.giftName || '').toLowerCase();
                    const blueGiftId = String(layer.blueGiftId || 'coffee').toLowerCase();
                    const blueGiftName = String(layer.blueGiftName || 'coffee').toLowerCase();
                    const isRedMatch = (redGiftId === receivedGiftId) || (redGiftId === receivedGiftName) || (redGiftName === receivedGiftName);
                    const isBlueMatch = (blueGiftId === receivedGiftId) || (blueGiftId === receivedGiftName) || (blueGiftName === receivedGiftName);
                    if (isRedMatch) {
                        layer.currentCount = (Number(layer.currentCount) || 0) + repeatCount;
                        hasUpdates = true;
                    } else if (isBlueMatch) {
                        layer.targetCount = (Number(layer.targetCount) || 0) + repeatCount;
                        hasUpdates = true;
                    }
                }
            } else if (isMatch) {
                if (layer.type === 'goal-bar' || layer.type === 'boss-bar' || layer.type === 'mystery-chests') {
                    layer.currentCount = (Number(layer.currentCount) || 0) + repeatCount;
                    hasUpdates = true;
                }
            }

            // Update items inside goal-list widget
            if (layer.type === 'goal-list' && Array.isArray(layer.goals)) {
                layer.goals.forEach(goal => {
                    const goalGiftId = String(goal.giftId || '').toLowerCase();
                    const goalGiftName = String(goal.giftName || '').toLowerCase();
                    const isGoalMatch = (goalGiftId === receivedGiftId) || 
                                        (goalGiftId === receivedGiftName) || 
                                        (goalGiftName === receivedGiftName);
                    if (isGoalMatch) {
                        goal.current = (Number(goal.current) || 0) + repeatCount;
                        hasUpdates = true;
                    }
                });
            }
        });

        // 2. Update Top Contributors list
        const totalSessionDiamonds = diamondCount * repeatCount;
        if (totalSessionDiamonds > 0) {
            layout.layers.forEach(layer => {
                if ((layer.type === 'top-contributors' || layer.type === 'podium-contributors') && layer.visible !== false) {
                    if (!Array.isArray(layer.contributors)) {
                        layer.contributors = [];
                    }

                    const existingIdx = layer.contributors.findIndex(c => c.nickname === senderNickname);
                    if (existingIdx >= 0) {
                        layer.contributors[existingIdx].value = (Number(layer.contributors[existingIdx].value) || 0) + totalSessionDiamonds;
                        if (senderAvatar) layer.contributors[existingIdx].avatar = senderAvatar;
                    } else {
                        layer.contributors.push({
                            nickname: senderNickname,
                            value: totalSessionDiamonds,
                            avatar: senderAvatar
                        });
                    }

                    layer.contributors.sort((a, b) => (b.value || 0) - (a.value || 0));
                    layer.contributors = layer.contributors.slice(0, 20);
                    hasUpdates = true;
                }
            });
        }

        // 3. Update Combo widget
        layout.layers.forEach(layer => {
            if (layer.type === 'combo' && layer.visible !== false) {
                layer.comboCount = repeatCount;
                hasUpdates = true;
            }
        });

        // 4. Update Gift Jar widget
        layout.layers.forEach(layer => {
            if (layer.type === 'gift-jar' && layer.visible !== false) {
                const rawGiftId = String(gift.giftId || '').toLowerCase().trim();
                const rawGiftName = String(gift.giftName || '').toLowerCase().trim();

                const bombId = String(layer.bombGiftId || '').toLowerCase().trim();
                const bombName = String(layer.bombGiftName || '').toLowerCase().trim();
                const isBombMatch = Boolean(layer.bombGiftEnabled) && Boolean(
                    (bombId && (bombId === rawGiftId || bombId === rawGiftName)) ||
                    (bombName && (bombName === rawGiftName || bombName === rawGiftId))
                );

                const resetId = String(layer.resetGiftId || '').toLowerCase().trim();
                const resetName = String(layer.resetGiftName || '').toLowerCase().trim();
                const isResetMatch = Boolean(layer.resetGiftEnabled) && Boolean(
                    (resetId && (resetId === rawGiftId || resetId === rawGiftName)) ||
                    (resetName && (resetName === rawGiftName || resetName === rawGiftId))
                );

                if (isBombMatch) {
                    const oldCoins = Number(layer.currentCoins) || 0;
                    const deductedCoins = Math.max(0, Math.round(oldCoins * 0.55));
                    layer.currentCoins = deductedCoins;
                    hasUpdates = true;
                    this.broadcast('gift_jar_bomb_drop', {
                        giftName: receivedGiftName,
                        giftIcon: gift.iconUrl || '',
                        nickname: senderNickname,
                        currentCoins: layer.currentCoins,
                        theme: layer.theme || 'hu-thuong',
                        jarColor: layer.jarColor || '',
                        timestamp: Date.now()
                    });
                } else if (isResetMatch) {
                    layer.currentCoins = 0;
                    hasUpdates = true;
                    this.broadcast('gift_jar_reset', {
                        giftName: receivedGiftName,
                        giftIcon: gift.iconUrl || '',
                        nickname: senderNickname,
                        currentCoins: 0,
                        theme: layer.theme || 'hu-thuong',
                        jarColor: layer.jarColor || '',
                        timestamp: Date.now()
                    });
                } else {
                    const addedCoins = (diamondCount > 0 ? diamondCount : 1) * repeatCount;
                    layer.currentCoins = (Number(layer.currentCoins) || 0) + addedCoins;
                    hasUpdates = true;

                    this.broadcast('gift_jar_drop', {
                        coins: addedCoins,
                        giftName: gift.giftName || 'Quà TikTok',
                        giftIcon: gift.iconUrl || '',
                        nickname: senderNickname,
                        currentCoins: layer.currentCoins,
                        targetCoins: layer.targetCoins || 1000,
                        reachedTarget: layer.currentCoins >= (layer.targetCoins || 1000),
                        theme: layer.theme || 'hu-thuong',
                        jarColor: layer.jarColor || '',
                        dropItemType: layer.dropItemType || 'tiktok_gift',
                        timestamp: Date.now()
                    });
                }
            }
        });

        if (hasUpdates) {
            const goalBoardLayoutPath = dataPaths.goalBoardLayoutPath;
            try {
                fs.writeFileSync(goalBoardLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
            } catch (err) {
                console.error('Failed to save updated goal board layout file:', err);
            }

            this.broadcast('goal_board_progress_update', {
                type: 'goal_board_progress_update',
                layers: layout.layers
            });
        }
    }

    consumeTts(userId, isTest = false) {
        if (!isTest && (!this.currentLiveUserId || String(userId) !== String(this.currentLiveUserId))) {
            return { allowed: false, status: 409, payload: { success: false, message: 'Hãy kết nối TikTok Live trước khi sử dụng TTS.' } };
        }
        const limit = this.liveEntitlements.ttsPerSession;
        if (!isTest && Number.isFinite(limit) && this.sessionUsage.tts >= limit) {
            return {
                allowed: false,
                status: 403,
                payload: upgradePayload(
                    'tts',
                    `Gói ${this.liveEntitlements.label} đã dùng hết ${limit} lượt đọc tên và lời cảm ơn bằng giọng hệ thống trong phiên này.`,
                    this.liveEntitlements
                )
            };
        }
        if (!isTest) {
            this.sessionUsage.tts++;
        }
        return { allowed: true, status: 200, payload: { success: true, remaining: Number.isFinite(limit) && !isTest ? Math.max(0, limit - this.sessionUsage.tts) : null } };
    }

    consumeComment(userId, isTest = false) {
        if (!isTest && (!this.currentLiveUserId || String(userId) !== String(this.currentLiveUserId))) {
            return { allowed: false, status: 409, payload: { success: false, message: 'Hãy kết nối TikTok Live trước khi đọc bình luận.' } };
        }
        const limit = this.liveEntitlements.commentsPerSession;
        if (!isTest && Number.isFinite(limit) && this.sessionUsage.comments >= limit) {
            return {
                allowed: false,
                status: 403,
                payload: upgradePayload(
                    'comments',
                    `Gói ${this.liveEntitlements.label} đã dùng hết ${limit} lượt đọc bình luận bằng giọng hệ thống trong phiên này. Bình luận vẫn tiếp tục hiển thị bình thường.`,
                    this.liveEntitlements
                )
            };
        }
        if (!isTest) this.sessionUsage.comments++;
        return { allowed: true, status: 200, payload: { success: true, remaining: Number.isFinite(limit) && !isTest ? Math.max(0, limit - this.sessionUsage.comments) : null } };
    }

    async processGiftMenuGift(giftEvent) {
        if (giftEvent && giftEvent.giftType === 1 && giftEvent.repeatEnd === false) return;

        const gift = this.normalizeGiftFromEvent(giftEvent);
        if (!gift) return;

        const giftMenuLayoutPath = dataPaths.giftMenuLayoutPath;
        let layout = null;
        try {
            if (fs.existsSync(giftMenuLayoutPath)) {
                layout = JSON.parse(fs.readFileSync(giftMenuLayoutPath, 'utf8') || 'null');
            }
        } catch (_e) {
            layout = null;
        }

        const fileUserId = layout && layout.userId ? String(layout.userId) : '';
        if (this.currentLiveUserId && (!layout || fileUserId !== String(this.currentLiveUserId))) {
            const activeLayout = await GiftMenuLayout.findOne({ userId: this.currentLiveUserId, isActive: true, isTemplate: false }).lean();
            if (activeLayout) layout = activeLayout;
        }
        if (!layout) return;

        const receivedGiftId = String(gift.giftId || '').toLowerCase();
        const receivedGiftName = String(gift.giftName || '').toLowerCase();
        const repeatCount = Math.max(1, Number(gift.repeatCount) || 1);
        const totalDiamonds = Math.max(0, Number(gift.diamondCount) || 0) * repeatCount;
        const senderNickname = gift.nickname || gift.uniqueId || 'TikTok user';
        const senderAvatar = gift.avatarUrl || '';

        const isGiftMatch = (target = {}) => {
            const targetId = String(target.giftId || '').toLowerCase();
            const targetName = String(target.giftName || '').toLowerCase();
            return targetId === receivedGiftId || targetId === receivedGiftName || targetName === receivedGiftName;
        };

        const updateItems = (items) => {
            let changed = false;
            if (!Array.isArray(items)) return changed;
            items.forEach((item) => {
                if (!item || item.visible === false) return;
                if (['goal-bar', 'goal-circle', 'boss-bar', 'mystery-chests'].includes(item.type) && isGiftMatch(item)) {
                    item.currentCount = (Number(item.currentCount) || 0) + repeatCount;
                    changed = true;
                }
                if (item.type === 'goal-list' && Array.isArray(item.goals)) {
                    item.goals.forEach((goal) => {
                        if (!isGiftMatch(goal)) return;
                        goal.current = (Number(goal.current) || 0) + repeatCount;
                        changed = true;
                    });
                }
                if (totalDiamonds > 0 && ['top-contributors', 'podium-contributors'].includes(item.type)) {
                    if (!Array.isArray(item.contributors)) item.contributors = [];
                    const existing = item.contributors.find((entry) => entry.nickname === senderNickname);
                    if (existing) {
                        existing.value = (Number(existing.value) || 0) + totalDiamonds;
                        if (senderAvatar) existing.avatar = senderAvatar;
                    } else {
                        item.contributors.push({ nickname: senderNickname, value: totalDiamonds, avatar: senderAvatar });
                    }
                    item.contributors.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
                    item.contributors = item.contributors.slice(0, 20);
                    changed = true;
                }
                if (item.type === 'combo') {
                    item.comboCount = (Number(item.comboCount) || 0) + repeatCount;
                    changed = true;
                }
            });
            return changed;
        };

        const updateTalentCompetitions = (collections) => {
            const talentItems = collections
                .flatMap((items) => Array.isArray(items) ? items : [])
                .filter((item) => item && ['talent-live', 'talent-leaderboard'].includes(item.type) && item.visible !== false && item.talentCompetition);
            const groups = new Map();
            talentItems.forEach((item) => {
                const competitionId = String(item.talentCompetition.id || item.talentCompetitionId || 'default');
                if (!groups.has(competitionId)) groups.set(competitionId, []);
                groups.get(competitionId).push(item);
            });

            let changed = false;
            groups.forEach((items) => {
                const competition = items[0].talentCompetition;
                if (!competition || competition.status !== 'running' || !Array.isArray(competition.participants)) return;
                const durationSeconds = Math.max(0, Number(competition.durationSeconds) || 0);
                const startedAt = competition.startedAt ? new Date(competition.startedAt).getTime() : 0;
                if (durationSeconds > 0 && startedAt && Date.now() - startedAt >= durationSeconds * 1000) {
                    competition.status = 'finished';
                    competition.remainingSeconds = 0;
                    competition.startedAt = null;
                    items.forEach((item) => { item.talentCompetition = JSON.parse(JSON.stringify(competition)); });
                    changed = true;
                    return;
                }
                const activeTalent = competition.participants.find((person) => person && person.id === competition.activeTalentId);
                if (!activeTalent) return;

                const points = Math.max(0, totalDiamonds);
                if (points <= 0) return;
                activeTalent.score = (Number(activeTalent.score) || 0) + points;
                activeTalent.roundScore = (Number(activeTalent.roundScore) || 0) + points;
                competition.eventFeed = [{
                    nickname: senderNickname,
                    giftName: gift.giftName || 'quà tặng',
                    points,
                    at: new Date().toISOString()
                }, ...(Array.isArray(competition.eventFeed) ? competition.eventFeed : [])].slice(0, 5);

                items.forEach((item) => {
                    item.talentCompetition = JSON.parse(JSON.stringify(competition));
                });
                changed = true;
            });
            return changed;
        };

        const itemsChanged = updateItems(layout.items);
        const exportedChanged = updateItems(layout.exportedItems);
        const talentChanged = updateTalentCompetitions([layout.items, layout.exportedItems]);
        if (!itemsChanged && !exportedChanged && !talentChanged) return;

        layout.savedAt = new Date().toISOString();
        fs.writeFileSync(giftMenuLayoutPath, JSON.stringify(layout, null, 2), 'utf8');
        this.broadcast('gift_menu_progress_update', {
            type: 'gift_menu_progress_update',
            items: Array.isArray(layout.items) ? layout.items : []
        });
    }

    async shutdown() {
        this.lastRoomId = null;
        this.currentLiveUserId = null;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.tiktokClient) {
            try { await this.tiktokClient.stop(); } catch (_error) {}
            this.tiktokClient = null;
        }
        this.liveStats.isLive = false;
    }
}

module.exports = new TikTokService();

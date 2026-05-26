const { TikTokLiveClient } = require('tiktok-live-connector');
const GiftMapping = require('../models/GiftMapping');
const Effect = require('../models/Effect');
const GiftLog = require('../models/GiftLog');
const effectQueue = require('./effectQueue');
const fs = require('fs');
const path = require('path');

const FALLBACK_GIFTS = [
    { giftId: '5655', giftName: 'Rose', diamondCount: 1, iconUrl: '/assets/gift-icons/Rose.png', source: 'fallback-preview' },
    { giftId: '5269', giftName: 'TikTok', diamondCount: 1, iconUrl: '/assets/gift-icons/TikTok.png', source: 'fallback-preview' },
    { giftId: 'corgi', giftName: 'Corgi', diamondCount: 50, iconUrl: '/assets/gift-icons/Corgi.png', source: 'fallback-preview' },
    { giftId: 'galaxy', giftName: 'Galaxy', diamondCount: 1000, iconUrl: '/assets/gift-icons/Rosa.png', source: 'fallback-preview' }
];

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

class TikTokService {
    constructor() {
        this.tiktokClient = null;
        this.lastRoomId = null;
        this.reconnectTimer = null;
        this.currentLiveUserId = null;
        this.broadcastFn = null;
        this.liveStats = { gifts: 0, likes: 0, chats: 0, viewers: 0, isLive: false };
        this.giftCatalogState = { gifts: [], lastSyncedAt: null, source: 'fallback-preview' };
        this.goalBoardLayout = null;
    }

    init(broadcastFn) {
        this.broadcastFn = broadcastFn;
    }

    normalizeGiftId(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
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
        return {
            giftId,
            giftName: data.giftName || data.name || data.label || `Gift ${giftId}`,
            diamondCount: Number(data.diamondCount || data.diamond || data.coins || 0),
            iconUrl: this.extractIconUrl(data),
            repeatCount: Number(data.repeatCount || 1),
            userId: data.userId || data.user?.userId || '',
            uniqueId: data.uniqueId || data.user?.uniqueId || '',
            nickname: data.nickname || data.user?.nickname || '',
            source: 'tiktok-live'
        };
    }

    getGiftCatalogState() {
        if (this.giftCatalogState.gifts.length) return this.giftCatalogState;
        return { gifts: FALLBACK_GIFTS, lastSyncedAt: null, source: 'fallback-preview' };
    }

    handleGiftCatalogUpdate(giftData = {}) {
        const gift = this.normalizeGiftFromEvent(giftData);
        if (!gift) return;
        const gifts = [...this.giftCatalogState.gifts];
        const index = gifts.findIndex((item) => String(item.giftId) === String(gift.giftId));
        if (index >= 0) gifts[index] = { ...gifts[index], ...gift, source: 'tiktok-live' };
        else gifts.push(gift);
        this.giftCatalogState = { gifts, lastSyncedAt: new Date().toISOString(), source: 'tiktok-live' };
        this.broadcast('gift_catalog_update', { type: 'gift_catalog_update', gifts });
    }

    async connect(roomId, userId = null) {
        try {
            if (this.tiktokClient) this.tiktokClient.stop();
            this.lastRoomId = roomId;
            this.currentLiveUserId = userId;
            this.tiktokClient = new TikTokLiveClient({ uniqueId: roomId });

            this.tiktokClient.on('connected', () => {
                console.log(`Connected to TikTok Live: ${roomId}`);
                this.liveStats.isLive = true;
                this.broadcast('stats', this.liveStats);
                this.broadcast('gift_catalog_update', { type: 'gift_catalog_update', gifts: this.getGiftCatalogState().gifts });
            });

            this.tiktokClient.on('disconnected', () => {
                console.log('Disconnected from TikTok Live');
                this.liveStats.isLive = false;
                this.broadcast('stats', this.liveStats);
                if (this.lastRoomId) {
                    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(this.lastRoomId, this.currentLiveUserId), 15000);
                }
            });

            this.tiktokClient.on('gift', async (data) => {
                this.liveStats.gifts++;
                this.handleGiftCatalogUpdate(data);

                // Update Real-time Goal Board progress (Phase 2)
                await this.processGoalBoardGift(data).catch(err => {
                    console.error('⚠️ Goal Board live progress sync error:', err.message);
                });

                let mapping = null;
                if (this.currentLiveUserId) {
                    mapping = await GiftMapping.findOne({ userId: this.currentLiveUserId, giftId: data.giftId, isActive: true });
                }

                if (mapping && mapping.effectId) {
                    const effect = await Effect.findById(mapping.effectId).catch(() => null);
                    effectQueue.add(mapping.effectId, effect ? (effect.duration || 5) : 5, data);
                    await GiftLog.create({ giftId: data.giftId, giftName: data.giftName, effectId: mapping.effectId, triggeredAt: new Date(), sessionId: this.currentLiveUserId, userId: this.currentLiveUserId, userName: data.nickname || data.uniqueId || 'TikTok user' }).catch(() => null);
                } else {
                    this.broadcast('gift', data);
                }
                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('like', (data) => { this.liveStats.likes += data.count || 1; this.broadcast('stats', this.liveStats); });
            this.tiktokClient.on('follow', (data) => this.broadcast('follow', data));
            this.tiktokClient.on('share', (data) => this.broadcast('share', data));
            this.tiktokClient.on('chat', (data) => { this.liveStats.chats++; this.broadcast('chat', data); });
            this.tiktokClient.on('viewer', (data) => { this.liveStats.viewers = data.count || 0; this.broadcast('stats', this.liveStats); });
            this.tiktokClient.on('error', (err) => console.error('TikTok Error:', err));

            await this.tiktokClient.start();
            return true;
        } catch (err) {
            console.error('Failed to start TikTok client:', err);
            return false;
        }
    }

    async disconnect() {
        if (this.tiktokClient) {
            this.tiktokClient.stop();
            this.tiktokClient = null;
            this.liveStats.isLive = false;
            this.broadcast('stats', this.liveStats);
        }
    }

    isConnected() {
        return !!(this.tiktokClient && this.liveStats.isLive);
    }

    broadcast(event, data) {
        if (this.broadcastFn) this.broadcastFn(event, data);
    }

    setGoalBoardLayout(layout) {
        this.goalBoardLayout = layout;
    }

    async getGoalBoardLayout() {
        if (this.goalBoardLayout) return this.goalBoardLayout;

        const goalBoardLayoutPath = path.join(__dirname, '..', 'uploads', 'goal-board-layout.json');
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

            if (isMatch) {
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

        if (hasUpdates) {
            const goalBoardLayoutPath = path.join(__dirname, '..', 'uploads', 'goal-board-layout.json');
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
}


module.exports = new TikTokService();

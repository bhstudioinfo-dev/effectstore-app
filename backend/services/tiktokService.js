const { TikTokLiveClient } = require('tiktok-live-connector');
const GiftMapping = require('../models/GiftMapping');
const Effect = require('../models/Effect');
const GiftLog = require('../models/GiftLog');
const effectQueue = require('./effectQueue');

class TikTokService {
    constructor() {
        this.tiktokClient = null;
        this.lastRoomId = null;
        this.reconnectTimer = null;
        this.currentLiveUserId = null;
        this.liveStats = {
            gifts: 0,
            likes: 0,
            chats: 0,
            viewers: 0,
            isLive: false
        };
        this.broadcastFn = null;
        this.goalState = {
            title: 'Mục tiêu quà tặng',
            goals: [],
            layout: {
                canvasWidth: 720,
                canvasHeight: 1280,
                x: 80,
                y: 80,
                width: 560,
                height: 220
            },
            style: {
                preset: 'neon',
                glow: 1,
                accentColor: '#b287ff'
            }
        };
    }

    init(broadcastFn) {
        this.broadcastFn = broadcastFn;
    }

    normalizeGiftId(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim().toLowerCase();
    }

    setGoalConfig(config = {}) {
        const goals = Array.isArray(config.goals) ? config.goals : [];
        this.goalState = {
            title: config.title || 'Mục tiêu quà tặng',
            layout: {
                canvasWidth: Math.max(1, parseInt(config?.layout?.canvasWidth, 10) || 720),
                canvasHeight: Math.max(1, parseInt(config?.layout?.canvasHeight, 10) || 1280),
                x: Math.max(0, parseInt(config?.layout?.x, 10) || 80),
                y: Math.max(0, parseInt(config?.layout?.y, 10) || 80),
                width: Math.max(200, parseInt(config?.layout?.width, 10) || 560),
                height: Math.max(120, parseInt(config?.layout?.height, 10) || 220)
            },
            style: {
                preset: ['neon', 'aurora', 'holo', 'electric', 'plasma', 'sunset'].includes(config?.style?.preset)
                    ? config.style.preset
                    : 'neon',
                glow: Math.max(0.4, Math.min(2, parseFloat(config?.style?.glow) || 1)),
                accentColor: String(config?.style?.accentColor || '#b287ff')
            },
            goals: goals.map((goal) => ({
                id: goal.id || `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                giftId: this.normalizeGiftId(goal.giftId),
                giftName: goal.giftName || '',
                giftIcon: goal.giftIcon || '',
                target: Math.max(1, parseInt(goal.target, 10) || 1),
                current: Math.max(0, parseInt(goal.current, 10) || 0)
            }))
        };
        this.broadcast('goal_state', this.goalState);
    }

    getGoalState() {
        return this.goalState;
    }

    resetGoalProgress() {
        this.goalState.goals = this.goalState.goals.map((goal) => ({ ...goal, current: 0 }));
        this.broadcast('goal_state', this.goalState);
    }

    processGiftGoalUpdate(giftData = {}) {
        if (!this.goalState.goals.length) return;

        const incomingGiftId = this.normalizeGiftId(giftData.giftId);
        const incomingGiftName = this.normalizeGiftId(giftData.giftName);
        let hasUpdate = false;

        this.goalState.goals = this.goalState.goals.map((goal) => {
            const goalGiftId = this.normalizeGiftId(goal.giftId);
            const goalGiftName = this.normalizeGiftId(goal.giftName);

            const matched = (
                (goalGiftId && incomingGiftId && goalGiftId === incomingGiftId) ||
                (goalGiftName && incomingGiftName && goalGiftName === incomingGiftName)
            );

            if (!matched) return goal;

            hasUpdate = true;
            const nextCurrent = goal.current + 1;
            const updatedGoal = { ...goal, current: nextCurrent };

            // Payload quan trọng theo yêu cầu
            this.broadcast('goal_update', {
                type: 'goal_update',
                title: this.goalState.title,
                goalId: updatedGoal.id,
                giftId: updatedGoal.giftId,
                giftName: updatedGoal.giftName,
                progress: updatedGoal.current,
                total: updatedGoal.target,
                percent: Math.min(100, Math.round((updatedGoal.current / updatedGoal.target) * 100))
            });

            return updatedGoal;
        });

        if (hasUpdate) {
            this.broadcast('goal_state', this.goalState);
        }
    }

    async connect(roomId, userId = null) {
        try {
            if (this.tiktokClient) {
                this.tiktokClient.stop();
            }

            this.lastRoomId = roomId;
            this.currentLiveUserId = userId;
            this.tiktokClient = new TikTokLiveClient({ uniqueId: roomId });

            this.tiktokClient.on('connected', () => {
                console.log(`✅ Connected to TikTok Live: ${roomId}`);
                this.liveStats.isLive = true;
                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('disconnected', () => {
                console.log('❌ Disconnected from TikTok Live');
                this.liveStats.isLive = false;
                this.broadcast('stats', this.liveStats);

                if (this.lastRoomId) {
                    console.log(`⏳ Attempting reconnect to ${this.lastRoomId} in 15s...`);
                    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(this.lastRoomId, this.currentLiveUserId), 15000);
                }
            });

            this.tiktokClient.on('gift', async (data) => {
                console.log('🎁 Gift received:', data);
                this.liveStats.gifts++;
                this.processGiftGoalUpdate(data);

                let mapping = null;
                if (this.currentLiveUserId) {
                    mapping = await GiftMapping.findOne({ 
                        userId: this.currentLiveUserId, 
                        giftId: data.giftId,
                        isActive: true 
                    });
                }

                if (mapping && mapping.effectId) {
                    const effect = await Effect.findById(mapping.effectId).catch(() => null);
                    const duration = effect ? (effect.duration || 5) : 5;
                    effectQueue.add(mapping.effectId, duration, data);
                } else {
                    this.broadcast('gift', data);
                }

                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('like', (data) => {
                this.liveStats.likes += data.count || 1;
                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('follow', (data) => this.broadcast('follow', data));
            this.tiktokClient.on('share', (data) => this.broadcast('share', data));
            
            this.tiktokClient.on('chat', (data) => {
                this.liveStats.chats++;
                this.broadcast('chat', data);
            });

            this.tiktokClient.on('viewer', (data) => {
                this.liveStats.viewers = data.count || 0;
                this.broadcast('stats', this.liveStats);
            });

            this.tiktokClient.on('error', (err) => console.error('❌ TikTok Error:', err));

            await this.tiktokClient.start();
            return true;
        } catch (err) {
            console.error('❌ Failed to start TikTok client:', err);
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
}

module.exports = new TikTokService();

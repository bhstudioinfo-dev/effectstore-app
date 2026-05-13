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
    }

    init(broadcastFn) {
        this.broadcastFn = broadcastFn;
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

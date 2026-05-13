const OBSWebSocket = require('obs-websocket-js').default;
const path = require('path');

class OBSAutoSetup {
    constructor() {
        this.obs = new OBSWebSocket();
        this.isConnected = false;
        this.effectsDir = path.join(process.cwd(), 'effects'); // Sử dụng đường dẫn tương đối
    }

    async connect(password = 'obs123') {
        try {
            await this.obs.connect('ws://localhost:4455', password);
            this.isConnected = true;
            console.log('✅ Connected to OBS WebSocket');
            return true;
        } catch (error) {
            console.error('❌ OBS connection failed:', error.message);
            return false;
        }
    }

    // Tự động tạo Scene cho EffectStore
    async createEffectStoreScene() {
        try {
            // Check if scene exists
            const scenes = await this.obs.call('GetSceneList');
            const existingScene = scenes.scenes.find(s => s.sceneName === 'EffectStore');
            
            if (existingScene) {
                console.log('📺 Scene "EffectStore" already exists');
                return;
            }

            // Create new scene
            await this.obs.call('CreateScene', {
                sceneName: 'EffectStore'
            });
            
            console.log('✅ Created scene "EffectStore"');
        } catch (error) {
            console.error('❌ Failed to create scene:', error);
        }
    }

    // Tự động thêm Media Source khi có effect mới
    async addEffectSource(effectId, effectName, videoPath) {
        try {
            const sourceName = `effect_${effectId}`;
            
            // Check if source already exists
            const sources = await this.obs.call('GetSceneItemList', {
                sceneName: 'EffectStore'
            });
            
            const existingSource = sources.sceneItems.find(
                item => item.sourceName === sourceName
            );

            if (existingSource) {
                console.log(`🎬 Source "${sourceName}" already exists`);
                return;
            }

            // Create Media Source
            await this.obs.call('CreateInput', {
                sceneName: 'EffectStore',
                inputName: sourceName,
                inputKind: 'ffmpeg_source', // or 'vlc_source' for multiple files
                inputSettings: {
                    local_file: videoPath,
                    looping: false,
                    speed_percent: 100,
                    clear_on_media_end: true
                }
            });

            // Set position and size (center screen)
            await this.obs.call('SetSceneItemTransform', {
                sceneName: 'EffectStore',
                sceneItemId: existingSource?.sceneItemId || (await this.getSceneItemId(sourceName)),
                sceneItemTransform: {
                    alignment: 5, // Center
                    positionX: 540, // Center of 1080
                    positionY: 960, // Center of 1920
                    scaleX: 1.0,
                    scaleY: 1.0,
                    rotation: 0
                }
            });

            // Hide by default
            await this.obs.call('SetSceneItemEnabled', {
                sceneName: 'EffectStore',
                sceneItemId: await this.getSceneItemId(sourceName),
                sceneItemEnabled: false
            });

            console.log(`✅ Added effect source: ${sourceName}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to add effect source:', error);
            return false;
        }
    }

    // Trigger effect (show video)
    async triggerEffect(effectId, duration = 15000) {
        try {
            const sourceName = `effect_${effectId}`;
            const sceneItemId = await this.getSceneItemId(sourceName);

            if (!sceneItemId) {
                console.error(`❌ Effect ${effectId} not found in OBS`);
                return false;
            }

            // Show the effect
            await this.obs.call('SetSceneItemEnabled', {
                sceneName: 'EffectStore',
                sceneItemId: sceneItemId,
                sceneItemEnabled: true
            });

            console.log(`🎬 Triggered effect: ${sourceName}`);

            // Hide after duration
            setTimeout(async () => {
                await this.obs.call('SetSceneItemEnabled', {
                    sceneName: 'EffectStore',
                    sceneItemId: sceneItemId,
                    sceneItemEnabled: false
                });
                console.log(`✅ Effect ${sourceName} completed`);
            }, duration);

            return true;
        } catch (error) {
            console.error('❌ Failed to trigger effect:', error);
            return false;
        }
    }

    // Helper: Get scene item ID
    async getSceneItemId(sourceName) {
        try {
            const items = await this.obs.call('GetSceneItemList', {
                sceneName: 'EffectStore'
            });
            const item = items.sceneItems.find(i => i.sourceName === sourceName);
            return item?.sceneItemId;
        } catch (error) {
            console.error('Failed to get scene item ID:', error);
            return null;
        }
    }

    // Disconnect
    async disconnect() {
        await this.obs.disconnect();
        this.isConnected = false;
        console.log('🔌 Disconnected from OBS');
    }
}

module.exports = OBSAutoSetup;
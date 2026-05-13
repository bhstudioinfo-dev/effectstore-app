const OBSWebSocket = require('obs-websocket-js').default;

class OBSController {
    constructor() {
        this.obs = new OBSWebSocket();
        this.isConnected = false;
        this.host = 'localhost';
        this.port = 4455;
        this.password = 'obs123';
        this.originalPositions = {}; // Cache lưu vị trí gốc
        this.activeTimeouts = []; // Theo dõi timeouts timeline

        // Lắng nghe sự kiện ngắt kết nối
        this.obs.on('ConnectionClosed', () => {
            this.isConnected = false;
            console.log('⚠️ OBS Connection Closed');
        });

        this.obs.on('ConnectionError', (err) => {
            this.isConnected = false;
            console.error('❌ OBS Connection Error:', err);
        });
    }

    // Connect to OBS
    async connect(host = this.host, port = this.port, password = this.password) {
        if (this.isConnected) return true;
        
        this.host = host;
        this.port = port;
        this.password = password;

        try {
            await this.obs.connect(`ws://${host}:${port}`, password);
            this.isConnected = true;
            console.log(`✅ Connected to OBS WebSocket at ${host}:${port}`);
            return true;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    }

    // Trigger effect by showing/hiding source
    async triggerEffect(effectId, duration = 15000) {
        if (!this.isConnected) return false;

        try {
            const sourceName = `effect_${effectId}`;
            const sceneItems = await this.obs.call('GetSceneItemList', { sceneName: 'EffectStore' });
            const sceneItem = sceneItems.sceneItems.find(item => item.sourceName === sourceName);

            if (!sceneItem) return false;

            await this.obs.call('SetSceneItemEnabled', {
                sceneName: 'EffectStore',
                sceneItemId: sceneItem.sceneItemId,
                sceneItemEnabled: true
            });

            setTimeout(async () => {
                await this.obs.call('SetSceneItemEnabled', {
                    sceneName: 'EffectStore',
                    sceneItemId: sceneItem.sceneItemId,
                    sceneItemEnabled: false
                });
            }, duration);

            return true;
        } catch (error) {
            console.error('❌ Failed to trigger effect:', error);
            return false;
        }
    }

    // Add new effect source to OBS
    async addEffectSource(effectId, effectName, videoPath) {
        if (!this.isConnected) return false;

        try {
            const sourceName = `effect_${effectId}`;
            const sceneItems = await this.obs.call('GetSceneItemList', { sceneName: 'EffectStore' });
            const exists = sceneItems.sceneItems.find(item => item.sourceName === sourceName);

            if (exists) return true;

            await this.obs.call('CreateInput', {
                sceneName: 'EffectStore',
                inputName: sourceName,
                inputKind: 'ffmpeg_source',
                inputSettings: { local_file: videoPath, looping: false }
            });

            return true;
        } catch (error) {
            console.error('❌ Failed to add effect source:', error);
            return false;
        }
    }

    // ===== 🔍 AUTO WEBCAM DETECTION =====
    async findWebcamSource(sceneName) {
        try {
            const items = await this.obs.call('GetSceneItemList', { sceneName });
            const webcamItem = items.sceneItems.find(item => 
                item.inputKind === 'dshow_input' || 
                item.inputKind === 'vlc_source' ||
                item.inputKind === 'ffmpeg_source'
            );
            
            if (webcamItem) {
                console.log('✅ Tìm thấy webcam:', webcamItem.sourceName);
                return webcamItem;
            }
            
            console.warn('⚠️ Không tìm thấy webcam');
            return null;
        } catch (err) {
            console.error('❌ Lỗi tìm webcam:', err);
            return null;
        }
    }

    async findEffectSource(sceneName, effectId) {
        try {
            const sourceName = `effect_${effectId}`;
            const items = await this.obs.call('GetSceneItemList', { sceneName });
            return items.sceneItems.find(item => item.sourceName === sourceName) || null;
        } catch (err) {
            console.error('❌ Lỗi tìm effect source:', err);
            return null;
        }
    }

    // ===== 🔲 LAYER MANAGEMENT =====
    async setWebcamLayer(sceneName, webcamId, effectId, position = 'above') {
        try {
            const effectInfo = await this.obs.call('GetSceneItemIndex', { sceneName, sceneItemId: effectId });
            const newIndex = position === 'above' ? effectInfo.sceneItemIndex + 1 : Math.max(0, effectInfo.sceneItemIndex - 1);
            
            await this.obs.call('SetSceneItemIndex', {
                sceneName,
                sceneItemId: webcamId,
                sceneItemIndex: newIndex
            });
            
            console.log(`✅ Đã set webcam ${position === 'above' ? 'TRÊN' : 'DƯỚI'} effect`);
            return true;
        } catch (err) {
            console.error('❌ Lỗi set layer:', err);
            return false;
        }
    }

    // ===== 💾 SAVE & RESET POSITION =====
    async saveWebcamOriginalPosition(sceneName, webcamId) {
        try {
            const transform = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: webcamId });
            this.originalPositions[webcamId] = transform.sceneItemTransform;
            console.log('💾 Đã lưu vị trí gốc webcam');
            return transform.sceneItemTransform;
        } catch (err) {
            console.error('❌ Lỗi lưu vị trí gốc:', err);
            return null;
        }
    }

    async resetWebcamToOriginalPosition(sceneName, webcamId) {
        try {
            const originalPos = this.originalPositions[webcamId];
            if (!originalPos) {
                console.warn('⚠️ Không tìm thấy vị trí gốc');
                return false;
            }
            
            await this.obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId: webcamId,
                sceneItemTransform: originalPos
            });
            
            console.log('🔄 Đã reset webcam về vị trí gốc');
            return true;
        } catch (err) {
            console.error('❌ Lỗi reset webcam:', err);
            return false;
        }
    }

    // ===== 🎬 SMOOTH ANIMATION =====
    async moveWebcamSmooth(sceneName, webcamId, targetX, targetY, targetScale, duration = 1000) {
        return new Promise(async (resolve) => {
            try {
                const startPos = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: webcamId });
                
                const start = {
                    x: startPos.sceneItemTransform.positionX,
                    y: startPos.sceneItemTransform.positionY,
                    scaleX: startPos.sceneItemTransform.scaleX,
                    scaleY: startPos.sceneItemTransform.scaleY
                };
                
                const startTime = Date.now();
                
                const animate = async () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    const easeProgress = progress < 0.5 
                        ? 2 * progress * progress 
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    const currentX = start.x + (targetX - start.x) * easeProgress;
                    const currentY = start.y + (targetY - start.y) * easeProgress;
                    const currentScaleX = start.scaleX + (targetScale - start.scaleX) * easeProgress;
                    const currentScaleY = start.scaleY + (targetScale - start.scaleY) * easeProgress;
                    
                    await this.obs.call('SetSceneItemTransform', {
                        sceneName,
                        sceneItemId: webcamId,
                        sceneItemTransform: {
                            positionX: currentX,
                            positionY: currentY,
                            scaleX: currentScaleX,
                            scaleY: currentScaleY,
                            rotation: startPos.sceneItemTransform.rotation,
                            alignment: startPos.sceneItemTransform.alignment
                        }
                    });
                    
                    if (progress < 1) {
                        setTimeout(animate, 16);
                    } else {
                        resolve(true);
                    }
                };
                
                animate();
            } catch (err) {
                console.error('❌ Lỗi di chuyển mượt:', err);
                resolve(false);
            }
        });
    }

    // ===== 🎯 RUN TIMELINE EFFECT =====
    async runTimelineEffect(sceneName, effectId, timeline) {
        if (!this.isConnected) {
            console.error('❌ OBS not connected');
            return false;
        }

        try {
            console.log('🎬 Running timeline effect:', effectId);
            
            // Hủy toàn bộ timeout cũ đang chạy để tránh nhảy webcam loạn xạ
            if (this.activeTimeouts && this.activeTimeouts.length > 0) {
                console.log(`🧹 Clearing ${this.activeTimeouts.length} existing timeline timeouts.`);
                this.activeTimeouts.forEach(t => clearTimeout(t));
                this.activeTimeouts = [];
            }
            
            const webcamItem = await this.findWebcamSource(sceneName);
            if (!webcamItem) {
                console.error('❌ Không tìm thấy webcam');
                return false;
            }
            const webcamId = webcamItem.sceneItemId;
            
            const effectItem = await this.findEffectSource(sceneName, effectId);
            if (!effectItem) {
                console.error('❌ Không tìm thấy effect source');
                return false;
            }
            const effectSceneItemId = effectItem.sceneItemId;
            
            await this.saveWebcamOriginalPosition(sceneName, webcamId);
            
            await this.obs.call('SetSceneItemEnabled', {
                sceneName,
                sceneItemId: effectSceneItemId,
                sceneItemEnabled: true
            });
            
            const animations = timeline.map(async (keyframe) => {
                return new Promise(async (resolve) => {
                    const tId = setTimeout(async () => {
                        let targetSceneItemId = null;
                        let targetSourceName = null;

                        if (keyframe.source === 'auto_webcam') {
                            targetSceneItemId = webcamId;
                            targetSourceName = webcamItem.sourceName;
                        } else if (keyframe.source === 'auto_effect') {
                            targetSceneItemId = effectSceneItemId;
                            targetSourceName = effectItem.sourceName;
                        }

                        if (targetSceneItemId) {
                            // 1. Xử lý Lớp (Chỉ cho Webcam)
                            if (keyframe.layer && keyframe.source === 'auto_webcam') {
                                await this.setWebcamLayer(sceneName, webcamId, effectSceneItemId, keyframe.layer);
                            }
                            
                            // 2. Xử lý Di chuyển / Thu phóng
                            if (keyframe.transform && (keyframe.action === 'move' || keyframe.action === 'scale')) {
                                await this.moveWebcamSmooth(
                                    sceneName,
                                    targetSceneItemId,
                                    keyframe.transform.x || 0,
                                    keyframe.transform.y || 0,
                                    keyframe.transform.scale ? keyframe.transform.scale / 100 : 1,
                                    1000
                                );
                            }

                            // 3. Xử lý Ẩn/Hiện
                            if (keyframe.action === 'show') {
                                await this.obs.call('SetSceneItemEnabled', {
                                    sceneName,
                                    sceneItemId: targetSceneItemId,
                                    sceneItemEnabled: true
                                });
                            } else if (keyframe.action === 'hide') {
                                await this.obs.call('SetSceneItemEnabled', {
                                    sceneName,
                                    sceneItemId: targetSceneItemId,
                                    sceneItemEnabled: false
                                });
                            }

                            // 4. Xử lý Chạy lại video
                            if (keyframe.action === 'play') {
                                await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: targetSceneItemId, sceneItemEnabled: false });
                                await new Promise(r => setTimeout(r, 100));
                                await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: targetSceneItemId, sceneItemEnabled: true });
                            }
                        }
                        resolve();
                    }, keyframe.time * 1000);
                    this.activeTimeouts.push(tId);
                });
            });
            
            await Promise.all(animations);
            
            const lastKeyframe = timeline[timeline.length - 1];
            const effectDuration = lastKeyframe ? lastKeyframe.time * 1000 : 5000;
            
            setTimeout(async () => {
                await this.obs.call('SetSceneItemEnabled', {
                    sceneName,
                    sceneItemId: effectSceneItemId,
                    sceneItemEnabled: false
                });
                
                await this.resetWebcamToOriginalPosition(sceneName, webcamId);
                console.log('✅ Timeline effect completed & reset');
            }, effectDuration + 500);
            
            return true;
        } catch (err) {
            console.error('❌ Lỗi chạy timeline effect:', err);
            return false;
        }
    }

    // Disconnect
    async disconnect() {
        await this.obs.disconnect();
        this.isConnected = false;
        console.log('🔌 Disconnected from OBS');
    }

    getStatus() {
        return { connected: this.isConnected, obs: this.obs };
    }
}

module.exports = OBSController;
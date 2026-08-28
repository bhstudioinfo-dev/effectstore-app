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

    // ===== 🎨 FILTER & SPECIAL EFFECT MANAGEMENT =====
    async setWebcamFilter(sourceName, filterType, enabled) {
        if (!this.isConnected || !sourceName) return false;
        try {
            const filterList = await this.obs.call('GetSourceFilterList', { sourceName });
            const filters = filterList.filters || [];

            if (filterType === 'bg_removal' || filterType === 'background_removal') {
                const bgFilter = filters.find(f =>
                    f.filterKind === 'background_removal' ||
                    f.filterName.toLowerCase().includes('background') ||
                    f.filterName.toLowerCase().includes('tách nền') ||
                    f.filterName.toLowerCase().includes('xóa nền')
                );
                if (bgFilter) {
                    await this.obs.call('SetSourceFilterEnabled', {
                        sourceName,
                        filterName: bgFilter.filterName,
                        filterEnabled: Boolean(enabled)
                    });
                    console.log(`✂️ Background Removal ${enabled ? 'BẬT' : 'TẮT'} trên ${sourceName}`);
                }
            } else if (filterType === 'blackout' || filterType === 'silhouette') {
                let colorFilter = filters.find(f => f.filterKind === 'color_filter' || f.filterName === 'LiveFlow_Color_Correction');
                if (!colorFilter && enabled) {
                    try {
                        await this.obs.call('CreateSourceFilter', {
                            sourceName,
                            filterName: 'LiveFlow_Color_Correction',
                            filterKind: 'color_filter',
                            filterSettings: { brightness: -1.0, contrast: 2.0 }
                        });
                        colorFilter = { filterName: 'LiveFlow_Color_Correction' };
                    } catch (_e) { }
                }
                if (colorFilter) {
                    if (enabled) {
                        await this.obs.call('SetSourceFilterSettings', {
                            sourceName,
                            filterName: colorFilter.filterName,
                            filterSettings: { brightness: -1.0, contrast: 2.0 }
                        });
                        await this.obs.call('SetSourceFilterEnabled', {
                            sourceName,
                            filterName: colorFilter.filterName,
                            filterEnabled: true
                        });
                    } else {
                        await this.obs.call('SetSourceFilterSettings', {
                            sourceName,
                            filterName: colorFilter.filterName,
                            filterSettings: { brightness: 0.0, contrast: 0.0 }
                        });
                        await this.obs.call('SetSourceFilterEnabled', {
                            sourceName,
                            filterName: colorFilter.filterName,
                            filterEnabled: false
                        });
                    }
                    console.log(`🖤 Blackout Silhouette ${enabled ? 'BẬT' : 'TẮT'} trên ${sourceName}`);
                }
            }
            return true;
        } catch (err) {
            console.error('❌ Lỗi setWebcamFilter:', err.message);
            return false;
        }
    }

    async resetWebcamFilters(sourceName) {
        if (!this.isConnected || !sourceName) return;
        try {
            const filterList = await this.obs.call('GetSourceFilterList', { sourceName });
            const filters = filterList.filters || [];
            for (const f of filters) {
                if (f.filterName === 'LiveFlow_Color_Correction' || f.filterKind === 'color_filter') {
                    await this.obs.call('SetSourceFilterSettings', {
                        sourceName,
                        filterName: f.filterName,
                        filterSettings: { brightness: 0.0, contrast: 0.0 }
                    }).catch(() => {});
                    await this.obs.call('SetSourceFilterEnabled', {
                        sourceName,
                        filterName: f.filterName,
                        filterEnabled: false
                    }).catch(() => {});
                }
                if (f.filterKind === 'background_removal' || f.filterName.toLowerCase().includes('background')) {
                    await this.obs.call('SetSourceFilterEnabled', {
                        sourceName,
                        filterName: f.filterName,
                        filterEnabled: false
                    }).catch(() => {});
                }
            }
        } catch (_err) {}
    }

    // ===== 🎬 SMOOTH ANIMATION WITH INDEPENDENT SCALE X/Y & ROTATION =====
    async moveWebcamSmooth(sceneName, webcamId, targetX, targetY, targetScaleX, targetScaleY, targetRotation, duration = 500) {
        return new Promise(async (resolve) => {
            try {
                const startPos = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: webcamId });
                const st = startPos.sceneItemTransform;

                const start = {
                    x: st.positionX,
                    y: st.positionY,
                    scaleX: st.scaleX,
                    scaleY: st.scaleY,
                    rotation: typeof st.rotation === 'number' ? st.rotation : 0
                };

                const toX = typeof targetX === 'number' ? targetX : start.x;
                const toY = typeof targetY === 'number' ? targetY : start.y;
                const toScaleX = typeof targetScaleX === 'number' ? targetScaleX : start.scaleX;
                const toScaleY = typeof targetScaleY === 'number' ? targetScaleY : (typeof targetScaleX === 'number' ? targetScaleX : start.scaleY);
                const toRotation = typeof targetRotation === 'number' ? targetRotation : start.rotation;

                const animDuration = Math.max(50, duration || 500);
                const startTime = Date.now();

                const animate = async () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / animDuration, 1);

                    const easeProgress = progress < 0.5 
                        ? 2 * progress * progress 
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                    const currentX = start.x + (toX - start.x) * easeProgress;
                    const currentY = start.y + (toY - start.y) * easeProgress;
                    const currentScaleX = start.scaleX + (toScaleX - start.scaleX) * easeProgress;
                    const currentScaleY = start.scaleY + (toScaleY - start.scaleY) * easeProgress;
                    const currentRotation = start.rotation + (toRotation - start.rotation) * easeProgress;

                    await this.obs.call('SetSceneItemTransform', {
                        sceneName,
                        sceneItemId: webcamId,
                        sceneItemTransform: {
                            positionX: currentX,
                            positionY: currentY,
                            scaleX: currentScaleX,
                            scaleY: currentScaleY,
                            rotation: currentRotation,
                            alignment: st.alignment
                        }
                    }).catch(() => {});

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

    // ===== ⚡ CAMERA SHAKE EFFECT =====
    async shakeWebcam(sceneName, webcamId, duration = 600, intensity = 25) {
        try {
            const startPos = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: webcamId });
            const baseX = startPos.sceneItemTransform.positionX;
            const baseY = startPos.sceneItemTransform.positionY;
            const steps = Math.floor(duration / 35);

            for (let i = 0; i < steps; i++) {
                const offsetX = (Math.random() - 0.5) * intensity * 2;
                const offsetY = (Math.random() - 0.5) * intensity * 2;
                await this.obs.call('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId: webcamId,
                    sceneItemTransform: {
                        positionX: baseX + offsetX,
                        positionY: baseY + offsetY
                    }
                }).catch(() => {});
                await new Promise(r => setTimeout(r, 35));
            }
            // Trả về vị trí gốc trước khi rung
            await this.obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId: webcamId,
                sceneItemTransform: { positionX: baseX, positionY: baseY }
            }).catch(() => {});
        } catch (_err) {}
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
            const webcamSourceName = webcamItem.sourceName;
            
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
                            targetSourceName = webcamSourceName;
                        } else if (keyframe.source === 'auto_effect') {
                            targetSceneItemId = effectSceneItemId;
                            targetSourceName = effectItem.sourceName;
                        } else if (keyframe.source) {
                            targetSourceName = keyframe.source;
                        }

                        if (targetSceneItemId || targetSourceName) {
                            // 1. Xử lý Lớp (Layer)
                            if (keyframe.layer && keyframe.source === 'auto_webcam' && targetSceneItemId) {
                                await this.setWebcamLayer(sceneName, webcamId, effectSceneItemId, keyframe.layer);
                            }
                            
                            // 2. Xử lý Filter Tách Nền / Đen Mặt
                            if (keyframe.action === 'bg_removal') {
                                await this.setWebcamFilter(targetSourceName || webcamSourceName, 'bg_removal', keyframe.enabled !== false);
                            } else if (keyframe.action === 'blackout') {
                                await this.setWebcamFilter(targetSourceName || webcamSourceName, 'blackout', keyframe.enabled !== false);
                            }

                            // 3. Xử lý Rung lắc Camera Shake
                            if (keyframe.action === 'shake' && targetSceneItemId) {
                                this.shakeWebcam(sceneName, targetSceneItemId, (keyframe.duration || 0.6) * 1000, keyframe.intensity || 25);
                            }

                            // 4. Xử lý Di chuyển / Thu phóng / Squash Đập Dẹp / Xoay Góc
                            if (keyframe.transform && (keyframe.action === 'move' || keyframe.action === 'scale' || keyframe.action === 'squash' || keyframe.action === 'rotate') && targetSceneItemId) {
                                const tf = keyframe.transform;
                                const scaleX = typeof tf.scaleX === 'number' ? tf.scaleX / 100 : (typeof tf.scale === 'number' ? tf.scale / 100 : 1);
                                const scaleY = typeof tf.scaleY === 'number' ? tf.scaleY / 100 : (typeof tf.scale === 'number' ? tf.scale / 100 : 1);
                                const moveDuration = (keyframe.duration || 0.4) * 1000;

                                await this.moveWebcamSmooth(
                                    sceneName,
                                    targetSceneItemId,
                                    tf.x,
                                    tf.y,
                                    scaleX,
                                    scaleY,
                                    tf.rotation,
                                    moveDuration
                                );
                            }

                            // 5. Xử lý Ẩn/Hiện
                            if (keyframe.action === 'show' && targetSceneItemId) {
                                await this.obs.call('SetSceneItemEnabled', {
                                    sceneName,
                                    sceneItemId: targetSceneItemId,
                                    sceneItemEnabled: true
                                });
                            } else if (keyframe.action === 'hide' && targetSceneItemId) {
                                await this.obs.call('SetSceneItemEnabled', {
                                    sceneName,
                                    sceneItemId: targetSceneItemId,
                                    sceneItemEnabled: false
                                });
                            }

                            // 6. Xử lý Chạy lại video
                            if (keyframe.action === 'play' && targetSceneItemId) {
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
                }).catch(() => {});
                
                await this.resetWebcamToOriginalPosition(sceneName, webcamId);
                await this.resetWebcamFilters(webcamSourceName);
                console.log('✅ Timeline effect completed, restored & filters reset');
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
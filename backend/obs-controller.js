const { OBSWebSocket } = require('obs-websocket-js');

class OBSController {
    constructor(obsInstance) {
        this.obs = obsInstance || new OBSWebSocket();
        this.isConnected = !!obsInstance;
        this.host = 'localhost';
        this.port = 4455;
        this.password = 'obs123';
        this.originalPositions = {}; // Cache lưu vị trí gốc
        this.activeTimeouts = []; // Theo dõi timeouts timeline

        if (this.obs && typeof this.obs.on === 'function') {
            this.obs.on('ConnectionClosed', () => {
                this.isConnected = false;
                console.log('⚠️ OBS Connection Closed');
            });

            this.obs.on('ConnectionError', (err) => {
                this.isConnected = false;
                console.error('❌ OBS Connection Error:', err);
            });
        }
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
            const sceneItems = items.sceneItems || [];
            
            // 1. Check inputKind: DirectShow video capture, window capture, etc.
            let webcamItem = sceneItems.find(item => 
                item.inputKind === 'dshow_input' || 
                item.inputKind === 'vlc_source' ||
                item.inputKind === 'window_capture'
            );
            
            // 2. Check by source name keywords
            if (!webcamItem) {
                const keywords = ['cam', 'webcam', 'camera', 'video', 'quay', 'người', 'streamer', 'face', 'c922', 'c920', 'c930', 'sony'];
                webcamItem = sceneItems.find(item => {
                    const name = String(item.sourceName || '').toLowerCase();
                    return keywords.some(kw => name.includes(kw));
                });
            }

            // 3. Fallback to any active visual source (excluding overlays & browser sources)
            if (!webcamItem && sceneItems.length > 0) {
                webcamItem = sceneItems.find(item => 
                    item.inputKind !== 'browser_source' && 
                    !String(item.sourceName || '').toLowerCase().includes('effect') &&
                    !String(item.sourceName || '').toLowerCase().includes('overlay') &&
                    !String(item.sourceName || '').toLowerCase().includes('gift')
                ) || sceneItems[0];
            }
            
            if (webcamItem) {
                console.log('✅ Tìm thấy webcam / source mục tiêu:', webcamItem.sourceName, `(ID: ${webcamItem.sceneItemId})`);
                return webcamItem;
            }
            
            console.warn('⚠️ Không tìm thấy source phù hợp trong scene:', sceneName);
            return null;
        } catch (err) {
            console.error('❌ Lỗi tìm webcam:', err);
            return null;
        }
    }

    async findEffectSource(sceneName, effectId) {
        try {
            const items = await this.obs.call('GetSceneItemList', { sceneName });
            const sceneItems = items.sceneItems || [];
            let found = sceneItems.find(item => item.sourceName === `effect_${effectId}`);
            if (!found) {
                found = sceneItems.find(item => item.sourceName === 'effect_player' || item.sourceName.toLowerCase().includes('effect_player'));
            }
            return found || null;
        } catch (err) {
            console.error('❌ Lỗi tìm effect source:', err);
            return null;
        }
    }

    // ===== 🔲 LAYER MANAGEMENT =====
    async setWebcamLayer(sceneName, webcamId, effectId, position = 'above') {
        try {
            if (!webcamId) return false;
            if (!effectId) {
                const eff = await this.findEffectSource(sceneName, 'preview');
                if (eff) effectId = eff.sceneItemId;
            }
            if (!effectId) {
                console.warn('⚠️ Không tìm thấy effect source để so sánh layer');
                return false;
            }
            const effectInfo = await this.obs.call('GetSceneItemIndex', { sceneName, sceneItemId: effectId });
            const webcamInfo = await this.obs.call('GetSceneItemIndex', { sceneName, sceneItemId: webcamId });
            
            // Trong OBS: index lớn hơn = nằm TRÊN, index nhỏ hơn = nằm DƯỚI
            let newIndex = effectInfo.sceneItemIndex;
            if (position === 'above') {
                newIndex = Math.max(effectInfo.sceneItemIndex, webcamInfo.sceneItemIndex) + 1;
            } else {
                newIndex = Math.max(0, Math.min(effectInfo.sceneItemIndex, webcamInfo.sceneItemIndex) - 1);
            }
            
            await this.obs.call('SetSceneItemIndex', {
                sceneName,
                sceneItemId: webcamId,
                sceneItemIndex: newIndex
            });
            
            console.log(`✅ Đã set webcam ${position === 'above' ? 'TRÊN' : 'DƯỚI'} effect (Index mới: ${newIndex})`);
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
            const st = transform.sceneItemTransform;
            // Bảo vệ không ghi đè vị trí gốc nếu webcam đang bị đè bẹp dí (scaleY < 0.25)
            if (!this.originalPositions[webcamId] || (st.scaleY >= 0.25 && Math.abs(st.scaleX - st.scaleY) < 0.6)) {
                this.originalPositions[webcamId] = { ...st };
                console.log('💾 Đã lưu vị trí gốc webcam');
            }
            return this.originalPositions[webcamId];
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
                let bgFilter = filters.find(f =>
                    f.filterKind === 'background_removal' ||
                    f.filterKind === 'obs_backgroundremoval' ||
                    f.filterKind === 'background-removal' ||
                    f.filterKind?.toLowerCase().includes('background') ||
                    f.filterName.toLowerCase().includes('background') ||
                    f.filterName.toLowerCase().includes('removal') ||
                    f.filterName.toLowerCase().includes('tách nền') ||
                    f.filterName.toLowerCase().includes('xóa nền') ||
                    f.filterName.toLowerCase().includes('xoa phong')
                );

                // Tự động tạo Filter Tách Nền nếu chưa có trên source
                if (!bgFilter && enabled) {
                    try {
                        await this.obs.call('CreateSourceFilter', {
                            sourceName,
                            filterName: 'Background Removal',
                            filterKind: 'background_removal',
                            filterSettings: {}
                        });
                        bgFilter = { filterName: 'Background Removal' };
                    } catch (_e1) {
                        try {
                            await this.obs.call('CreateSourceFilter', {
                                sourceName,
                                filterName: 'Background Removal',
                                filterKind: 'obs_backgroundremoval',
                                filterSettings: {}
                            });
                            bgFilter = { filterName: 'Background Removal' };
                        } catch (_e2) {}
                    }
                }

                if (bgFilter) {
                    await this.obs.call('SetSourceFilterEnabled', {
                        sourceName,
                        filterName: bgFilter.filterName,
                        filterEnabled: Boolean(enabled)
                    });
                    console.log(`✂️ Background Removal ${enabled ? 'BẬT' : 'TẮT'} trên ${sourceName} (Filter: ${bgFilter.filterName})`);
                } else {
                    console.warn(`⚠️ Chưa tìm thấy hoặc chưa cài plugin Background Removal trên source: ${sourceName}`);
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

                    const transformObj = {
                        positionX: currentX,
                        positionY: currentY,
                        scaleX: currentScaleX,
                        scaleY: currentScaleY,
                        rotation: currentRotation,
                        alignment: st.alignment
                    };
                    if (st.boundsType && st.boundsType !== 'OBS_BOUNDS_NONE' && typeof st.boundsWidth === 'number' && st.boundsWidth > 0) {
                        transformObj.boundsWidth = (st.sourceWidth || 1080) * currentScaleX;
                        transformObj.boundsHeight = (st.sourceHeight || 1920) * currentScaleY;
                    }

                    await this.obs.call('SetSceneItemTransform', {
                        sceneName,
                        sceneItemId: webcamId,
                        sceneItemTransform: transformObj
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
    async shakeWebcam(sceneName, webcamId, duration = 600, intensity = 15) {
        try {
            const steps = Math.floor(duration / 35);

            for (let i = 0; i < steps; i++) {
                const currentPos = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: webcamId });
                const st = currentPos.sceneItemTransform;
                const offsetX = (Math.random() - 0.5) * intensity * 2;
                const offsetY = (Math.random() - 0.5) * intensity * 2;

                await this.obs.call('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId: webcamId,
                    sceneItemTransform: {
                        positionX: st.positionX + offsetX,
                        positionY: st.positionY + offsetY
                    }
                }).catch(() => {});

                await new Promise(r => setTimeout(r, 35));

                await this.obs.call('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId: webcamId,
                    sceneItemTransform: {
                        positionX: st.positionX,
                        positionY: st.positionY
                    }
                }).catch(() => {});
            }
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
            const webcamId = webcamItem ? webcamItem.sceneItemId : null;
            const webcamSourceName = webcamItem ? webcamItem.sourceName : null;
            
            const effectItem = await this.findEffectSource(sceneName, effectId);
            const effectSceneItemId = effectItem ? effectItem.sceneItemId : null;
            
            if (webcamId) {
                const orig = await this.saveWebcamOriginalPosition(sceneName, webcamId);
                if (orig) {
                    await this.obs.call('SetSceneItemTransform', {
                        sceneName,
                        sceneItemId: webcamId,
                        sceneItemTransform: {
                            scaleX: orig.scaleX || 1.0,
                            scaleY: orig.scaleY || 1.0,
                            positionX: orig.positionX || 0,
                            positionY: orig.positionY || 0,
                            rotation: orig.rotation || 0
                        }
                    }).catch(() => {});
                }
            }
            
            if (effectSceneItemId) {
                await this.obs.call('SetSceneItemEnabled', {
                    sceneName,
                    sceneItemId: effectSceneItemId,
                    sceneItemEnabled: true
                }).catch(() => {});
            }
            
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
                            targetSourceName = effectItem ? effectItem.sourceName : null;
                        } else if (keyframe.source) {
                            targetSourceName = keyframe.source;
                        }

                        if (targetSceneItemId || targetSourceName) {
                            // 1. Xử lý Lớp (Layer)
                            if ((keyframe.action === 'layer' || keyframe.layer) && (keyframe.source === 'auto_webcam' || !keyframe.source) && webcamId) {
                                await this.setWebcamLayer(sceneName, webcamId, effectSceneItemId, keyframe.layer || (keyframe.enabled === false ? 'below' : 'above'));
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
                                const orig = this.originalPositions[targetSceneItemId] || {};
                                const baseScaleX = typeof orig.scaleX === 'number' ? orig.scaleX : 1.0;
                                const baseScaleY = typeof orig.scaleY === 'number' ? orig.scaleY : 1.0;
                                const baseX = typeof orig.positionX === 'number' ? orig.positionX : 0;
                                const baseY = typeof orig.positionY === 'number' ? orig.positionY : 0;

                                let targetX, targetY, targetScaleX, targetScaleY;
                                
                                // Nếu toạ độ là toạ độ tuyệt đối (nhập thẳng từ OBS hoặc Lấy từ OBS)
                                if (tf.isAbsolute || (typeof tf.x === 'number' && tf.x > 100) || (typeof tf.y === 'number' && tf.y > 100)) {
                                    targetX = typeof tf.x === 'number' ? tf.x : baseX;
                                    targetY = typeof tf.y === 'number' ? tf.y : baseY;
                                    targetScaleX = typeof tf.scaleX === 'number' ? (tf.scaleX / 100) : baseScaleX;
                                    targetScaleY = typeof tf.scaleY === 'number' ? (tf.scaleY / 100) : (typeof tf.scaleX === 'number' ? tf.scaleX / 100 : baseScaleY);
                                } else {
                                    const multScaleX = typeof tf.scaleX === 'number' ? tf.scaleX / 100 : (typeof tf.scale === 'number' ? tf.scale / 100 : 1);
                                    const multScaleY = typeof tf.scaleY === 'number' ? tf.scaleY / 100 : (typeof tf.scale === 'number' ? tf.scale / 100 : 1);
                                    targetScaleX = baseScaleX * multScaleX;
                                    targetScaleY = baseScaleY * multScaleY;
                                    targetX = (typeof tf.x === 'number' && tf.x !== 0) ? (baseX + tf.x) : (tf.x === 0 ? baseX : undefined);
                                    targetY = (typeof tf.y === 'number' && tf.y !== 0) ? (baseY + tf.y) : (tf.y === 0 ? baseY : undefined);
                                }

                                const targetRotation = typeof tf.rotation === 'number' ? tf.rotation : 0;
                                const moveDuration = Math.max(50, (keyframe.duration || 0.4) * 1000);

                                await this.moveWebcamSmooth(
                                    sceneName,
                                    targetSceneItemId,
                                    targetX,
                                    targetY,
                                    targetScaleX,
                                    targetScaleY,
                                    targetRotation,
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
                if (effectItem && effectItem.sourceName && !effectItem.sourceName.toLowerCase().includes('effect_player')) {
                    await this.obs.call('SetSceneItemEnabled', {
                        sceneName,
                        sceneItemId: effectSceneItemId,
                        sceneItemEnabled: false
                    }).catch(() => {});
                }
                
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
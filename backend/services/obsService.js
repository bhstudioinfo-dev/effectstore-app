const { OBSWebSocket } = require('obs-websocket-js');

class OBSService {
    constructor() {
        this.obs = new OBSWebSocket();
        this._isConnected = false;
        this._reconnectTimer = null;
        this._lastConfig = null;
        this._triggerTokens = new Map();

        // Add event listeners for connection status
        this.obs.on('Identified', () => {
            this._isConnected = true;
            console.log('✅ OBS WebSocket Connected & Identified');
            if (this._reconnectTimer) {
                clearInterval(this._reconnectTimer);
                this._reconnectTimer = null;
            }
            // Phase 2A foundation only. Existing playback is not routed here.
            this.ensureEffectPlayerSource().catch((error) => {
                console.warn('Unable to prepare effect_player source:', error.message || error);
            });
            this.ensureGiftMenuOverlaySourceUrl().catch((error) => {
                console.warn('Unable to refresh gift_menu overlay URL:', error.message || error);
            });
        });

        this.obs.on('ConnectionClosed', () => {
            this._isConnected = false;
            console.log('❌ OBS WebSocket Connection Closed. Retrying in 5s...');
            this.startReconnect();
        });

        this.obs.on('ConnectionError', (err) => {
            this._isConnected = false;
            console.error('❌ OBS WebSocket Connection Error:', err.message || err);
        });
    }

    createTriggerToken(effectId, durationMs) {
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        this._triggerTokens.set(token, {
            effectId: String(effectId || ''),
            durationMs,
            expiresAt: Date.now() + Math.max(durationMs, 1000) + 30000,
            used: false
        });
        return token;
    }

    consumeTriggerToken(token, effectId) {
        const entry = this._triggerTokens.get(String(token || ''));
        if (!entry || entry.used || entry.effectId !== String(effectId || '') || entry.expiresAt < Date.now()) {
            return null;
        }
        entry.used = true;
        this._triggerTokens.set(token, entry);
        return entry;
    }

    cleanupTriggerTokens() {
        const now = Date.now();
        for (const [token, entry] of this._triggerTokens.entries()) {
            if (entry.used || entry.expiresAt < now) this._triggerTokens.delete(token);
        }
    }

    async connect(host = '127.0.0.1', port = 4455, password = 'obs123') {
        this._lastConfig = { host, port, password };
        try {
            await this.obs.connect(`ws://${host}:${port}`, password);
            return true;
        } catch (err) {
            console.error(`❌ OBS Connection failed (${host}:${port}):`, err.message || 'Check if OBS is running and WebSocket is enabled');
            this._isConnected = false;
            this.startReconnect();
            return false;
        }
    }

    async ensureConnected() {
        if (this._isConnected) return true;

        const fallbackHost = process.env.OBS_HOST || '127.0.0.1';
        const fallbackPort = process.env.OBS_PORT || 4455;
        const fallbackPassword = process.env.OBS_PASSWORD || 'obs123';
        const config = this._lastConfig || {
            host: fallbackHost,
            port: fallbackPort,
            password: fallbackPassword
        };

        return this.connect(config.host, config.port, config.password);
    }

    startReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setInterval(() => {
            if (!this._isConnected && this._lastConfig) {
                console.log('🔄 Attempting to reconnect to OBS...');
                this.connect(this._lastConfig.host, this._lastConfig.port, this._lastConfig.password)
                    .catch(() => {});
            }
        }, 5000);
    }

    async ensureEffectPlayerSource() {
        if (!this._isConnected) return false;

        const sceneName = 'EffectStore';
        const sourceName = 'effect_player';
        const sourceUrl = 'http://localhost:9000/effect-player-overlay.html';
        const { scenes } = await this.obs.call('GetSceneList');

        if (!scenes.some((scene) => scene.sceneName === sceneName)) {
            await this.obs.call('CreateScene', { sceneName });
        }

        const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
        if (sceneItems.some((item) => item.sourceName === sourceName)) return true;

        await this.obs.call('CreateInput', {
            sceneName,
            inputName: sourceName,
            inputKind: 'browser_source',
            inputSettings: {
                url: sourceUrl,
                width: 1080,
                height: 1920,
                fps: 30,
                css: '',
                shutdown: false,
                restart_when_active: false,
                reroute_audio: true
            }
        });
        console.log('Prepared future OBS browser source: effect_player');
        return true;
    }

    async ensureGiftMenuOverlaySourceUrl() {
        if (!this._isConnected) return false;

        const PORT = process.env.PORT || 9000;
        const sourceUrl = `http://localhost:${PORT}/gift-menu-overlay.html`;
        const candidateSources = ['gift_menu_overlay', 'gift_menu'];

        try {
            const { inputs } = await this.obs.call('GetInputList');
            const names = new Set(inputs.map((input) => input.inputName));
            const sourceName = candidateSources.find((name) => names.has(name));
            if (!sourceName) return false;

            await this.obs.call('SetInputSettings', {
                inputName: sourceName,
                inputSettings: {
                    url: `${sourceUrl}?t=${Date.now()}`,
                    shutdown: false,
                    restart_when_active: true
                },
                overlay: true
            });

            try {
                await this.obs.call('PressInputPropertiesButton', {
                    inputName: sourceName,
                    propertyName: 'refreshnocache'
                });
            } catch (_e) {}

            console.log(`Refreshed OBS browser source URL: ${sourceName} -> gift-menu-overlay.html`);
            return true;
        } catch (error) {
            console.warn('Unable to ensure gift menu overlay source URL:', error.message || error);
            return false;
        }
    }

    async getFoundationSourceStatus() {
        const status = { gift_menu: false, effect_player: false };
        if (!this._isConnected) return status;

        try {
            const { inputs } = await this.obs.call('GetInputList');
            const names = new Set(inputs.map((input) => input.inputName));
            status.gift_menu = names.has('gift_menu_overlay') || names.has('gift_menu');
            status.effect_player = names.has('effect_player');
        } catch (error) {
            console.warn('Unable to inspect OBS foundation sources:', error.message || error);
        }
        return status;
    }

    async triggerOBSEffect(effectId, duration) {
        if (!this._isConnected) {
            console.error('OBS not connected');
            return false;
        }

        const durationValue = Number(duration);
        if (!Number.isFinite(durationValue) || durationValue <= 0) {
            console.warn(`Skipping OBS effect ${effectId}: missing valid duration`);
            return false;
        }

        try {
            // 1. Ensure 'EffectStore' scene exists
            const { scenes } = await this.obs.call('GetSceneList');
            const sceneExists = scenes.find(s => s.sceneName === 'EffectStore');
            if (!sceneExists) {
                await this.obs.call('CreateScene', { sceneName: 'EffectStore' });
                console.log('✅ Created missing scene: EffectStore');
            }

            // 2. Prepare Source Info
            const sourceName = `effect_${effectId}`;
            const PORT = process.env.PORT || 9000;
            const finalDuration = durationValue < 100 ? durationValue * 1000 : durationValue;
            const triggerToken = this.createTriggerToken(effectId, finalDuration);
            // Add timestamp to force reload every time
            const url = `http://localhost:${PORT}/api/obs/effect/${effectId}?t=${Date.now()}&duration=${encodeURIComponent(finalDuration)}&trigger=${encodeURIComponent(triggerToken)}`;
            const blankUrl = `http://localhost:${PORT}/api/obs/effect/${effectId}?idle=1&t=${Date.now()}`;
            
            const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: 'EffectStore' });
            let item = sceneItems.find(i => i.sourceName === sourceName);
            
            if (item) {
                // Force update settings to trigger reload
                await this.obs.call('SetInputSettings', {
                    inputName: sourceName,
                    inputSettings: { 
                        url,
                        restart_when_active: false,
                        reroute_audio: true
                    }
                });
            } else {
                console.log(`🏗️ Setting up browser source: ${sourceName}`);
                await this.obs.call('CreateInput', {
                    sceneName: 'EffectStore',
                    inputName: sourceName,
                    inputKind: 'browser_source',
                    inputSettings: { 
                        url, width: 1080, height: 1920, fps: 30, css: '',
                        restart_when_active: false,
                        reroute_audio: true
                    }
                });
                
                // Get the new item ID
                const { sceneItems: newItems } = await this.obs.call('GetSceneItemList', { sceneName: 'EffectStore' });
                item = newItems.find(i => i.sourceName === sourceName);
            }

            if (!item) return false;

            const sceneItemId = item.sceneItemId;
            // 3. Trigger Visibility & Force Refresh
            await this.obs.call('SetSceneItemEnabled', {
                sceneName: 'EffectStore', sceneItemId, sceneItemEnabled: true
            });

            // Force Refresh (like clicking the Refresh button manually)
            try {
                await this.obs.call('PressInputPropertiesButton', {
                    inputName: sourceName,
                    propertyName: 'refreshnocache'
                });
            } catch (e) {
                // If the button name is different in some OBS versions, 
                // SetInputSettings already did its job with the timestamp
            }

            console.log(`🎬 Triggered & Refreshed: ${sourceName} (Duration: ${finalDuration}ms)`);

            setTimeout(async () => {
                try {
                    await this.obs.call('SetSceneItemEnabled', {
                        sceneName: 'EffectStore', sceneItemId, sceneItemEnabled: false
                    });
                    await this.obs.call('SetInputSettings', {
                        inputName: sourceName,
                        inputSettings: {
                            url: blankUrl,
                            restart_when_active: false,
                            reroute_audio: true
                        }
                    });
                    this.cleanupTriggerTokens();
                } catch (e) { console.error('Error disabling effect:', e); }
            }, finalDuration);

            return true;
        } catch (err) {
            console.error('Trigger effect error:', err);
            return false;
        }
    }

    // Animation Engine
    lerp(start, end, t) { return start + (end - start) * t; }

    easingFunctions = {
        linear: t => t,
        easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
        easeOut: t => 1 - Math.pow(1 - t, 3),
        easeIn: t => t * t * t,
        bounce: t => {
            const n1 = 7.5625, d1 = 2.75;
            if (t < 1 / d1) return n1 * t * t;
            else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
            else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
            else return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    };

    async smoothAnimateSource(sceneName, sourceName, startTransform, endTransform, durationMs, easingName = 'easeInOut') {
        try {
            const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
            const item = sceneItems.find(i => i.sourceName === sourceName);
            if (!item) return console.warn(`Source "${sourceName}" not found`);

            const startTime = Date.now();
            const easingFn = this.easingFunctions[easingName] || this.easingFunctions.easeInOut;
            const fps = 30;
            const interval = 1000 / fps;

            return new Promise((resolve) => {
                const animationInterval = setInterval(async () => {
                    try {
                        const elapsed = Date.now() - startTime;
                        const progress = Math.min(elapsed / durationMs, 1);
                        const easedProgress = easingFn(progress);

                        const currentTransform = {
                            positionX: this.lerp(startTransform.positionX, endTransform.positionX, easedProgress),
                            positionY: this.lerp(startTransform.positionY, endTransform.positionY, easedProgress),
                            scaleX: this.lerp(startTransform.scaleX, endTransform.scaleX, easedProgress),
                            scaleY: this.lerp(startTransform.scaleY, endTransform.scaleY, easedProgress),
                            rotation: this.lerp(startTransform.rotation || 0, endTransform.rotation || 0, easedProgress)
                        };

                        await this.obs.call('SetSceneItemTransform', {
                            sceneName, sceneItemId: item.sceneItemId, sceneItemTransform: currentTransform
                        });

                        if (progress >= 1) {
                            clearInterval(animationInterval);
                            resolve();
                        }
                    } catch (err) { console.warn('Frame update failed:', err.message); }
                }, interval);
            });
        } catch (error) { console.error('Animation engine error:', error); }
    }
    isConnected() {
        return this._isConnected;
    }
}

module.exports = new OBSService();

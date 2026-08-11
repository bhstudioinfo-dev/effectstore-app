console.log("JS LOADED OK 🔥");

// Global Navigation Function
function navigateTo(url) {
    window.location.href = url;
}

// Global Banner Manager Helper
function openBannerManager() {
    navigateTo('admin-banner.html');
}

// Single source of truth for how a raw user.subscription value maps to a
// display badge. Keys/labels must stay in sync with
// backend/config/planEntitlements.js (free/basic/pro/business/studio/admin,
// where legacy 'business' is a functional duplicate of 'pro').
const PLAN_DISPLAY = Object.freeze({
    admin: { label: '👑 Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.3)', avatarBg: 'linear-gradient(135deg,#ff6b35,#ff9a3c)', avatarColor: '#fff' },
    studio: { label: '💎 Studio', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.3)', avatarBg: 'linear-gradient(135deg,#10b981,#34d399)', avatarColor: '#fff' },
    pro: { label: '⭐ Pro', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)', avatarBg: 'linear-gradient(135deg,#a78bfa,#7c3aed)', avatarColor: '#fff' },
    basic: { label: '⚡ Basic', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', avatarBg: 'linear-gradient(135deg,#fbbf24,#d97706)', avatarColor: '#000' },
    free: { label: '🆓 Miễn phí', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.2)', avatarBg: 'linear-gradient(135deg,#374151,#4b5563)', avatarColor: '#fff' }
});

// Normalizes a user object's raw subscription/plan string (including the
// legacy 'business' alias for 'pro') into a PLAN_DISPLAY key. Mirrors
// backend/config/planEntitlements.js normalizePlan(), including the
// expiry check, so a stale/expired paid plan never displays as active.
function resolvePlanKey(user) {
    if (!user) return 'free';
    if (user.isAdmin === true || user.role === 'admin' || user.email === 'admin@effectstore.vn') return 'admin';
    if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now()) return 'free';
    const raw = String(user.subscription || user.plan || 'free').toLowerCase();
    if (raw === 'basic') return 'basic';
    if (raw === 'pro' || raw === 'business') return 'pro';
    if (raw === 'studio') return 'studio';
    if (raw === 'admin') return 'admin';
    return 'free';
}

function resolvePlanDisplay(user) {
    return PLAN_DISPLAY[resolvePlanKey(user)] || PLAN_DISPLAY.free;
}

// ===== APP CLASS =====
class EffectStoreApp {
    constructor() {
        let cachedStore = [];
        try {
            cachedStore = JSON.parse(localStorage.getItem('es_cache_store_effects') || '[]');
        } catch (_e) {}
        this.effects = cachedStore;
        this.storeEffects = cachedStore;
        this.mappingEffects = [];
        this.ownedEffects = [];
        this.personalEffects = [];
        this.pendingPersonalEffectFiles = null;
        this.cart = [];
        this.machineId = null;
        this.currentView = 'store';
        this.currentUser = null;
        this.authToken = null;
        this.pendingEffects = null;
        this.pendingPaymentEffects = [];
        this.logsInterval = null;

        // TikTok Live variables
        this.ws = null;
        this.WS_URL = 'ws://127.0.0.1:9001';
        this.API_URL = 'http://127.0.0.1:9000';
        // Public, non-secret central origin. Catalog JSON is requested through
        // the local backend, but media paths returned by that cloud response
        // live on the central host rather than on each customer's machine.
        this.CLOUD_API_URL = 'https://liveflow-backend-iafw.onrender.com';
        this.selectedGift = null;
        this.selectedEffect = null;
        this.giftMappings = [];
        this.controlDeckTab = 'effect';
        this.controlDeck = this.loadControlDeckState();
        this.controlDeckAudios = [];
        this.controlDeckSoundQueue = [];

        // Cài đặt TTS (Text to Speech)
        this.isTTSGiftEnabled = localStorage.getItem('es_tts_gift_enabled') !== 'false';
        this.isTTSFollowEnabled = localStorage.getItem('es_tts_follow_enabled') !== 'false';
        this.ttsThreshold = parseInt(localStorage.getItem('es_tts_threshold') || '10');
        this.ttsVoice = localStorage.getItem('es_tts_voice') || 'default';
        this.ttsSpeed = parseFloat(localStorage.getItem('es_tts_speed') || '1.0');
        this.ttsPitch = parseFloat(localStorage.getItem('es_tts_pitch') || '1.0');
        this.ttsTemplate = localStorage.getItem('es_tts_template') || 'Cảm ơn {username} đã tặng {quantity} {giftName} ❤️';
        this.ttsFollowTemplate = localStorage.getItem('es_tts_follow_template') || 'Cảm ơn {username} đã follow kênh nhé! ❤️';
        this.pendingDonors = new Map(); // userId -> {nickname, giftName, timestamp}
        this.ttsVolume = parseFloat(localStorage.getItem('es_tts_volume') || '1.0');

        // Hàng đợi giọng nói (TTS Queue)
        this.ttsQueue = [];
        this.isProcessingTTS = false;
        this.currentAudio = null;

        // Load danh sách giọng khi thay đổi
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();

                // Thêm lắng nghe phím Enter để mapping
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.currentView === 'gift-mapping') {
                if (this.selectedGift && this.selectedEffects && this.selectedEffects.length > 0) {
                    this.createMapping();
                }
            }
        });


        // Close dropdowns on document click
        document.addEventListener('click', () => {
            const varMenu = document.getElementById('variable-menu-dropdown');
            if (varMenu) varMenu.style.display = 'none';
            const tempMenu = document.getElementById('template-menu-dropdown');
            if (tempMenu) tempMenu.style.display = 'none';
            const followVarMenu = document.getElementById('follow-variable-menu-dropdown');
            if (followVarMenu) followVarMenu.style.display = 'none';
            const followTempMenu = document.getElementById('follow-template-menu-dropdown');
            if (followTempMenu) followTempMenu.style.display = 'none';
        });

        this.init();
    }

    showAppLoadingOverlay(statusText = 'Đang chuẩn bị hệ thống...', percent = 15) {
        const overlay = document.getElementById('app-loading-overlay');
        const status = document.getElementById('app-loading-status');
        const progress = document.getElementById('app-loading-progress-fill');
        const percentEl = document.getElementById('app-loading-percent');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
        }
        if (status) status.textContent = statusText;
        if (progress) progress.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${percent}%`;
        const retry = document.getElementById('app-loading-retry');
        if (retry) retry.style.display = 'none';
    }

    updateAppLoadingProgress(statusText, percent) {
        const status = document.getElementById('app-loading-status');
        const progress = document.getElementById('app-loading-progress-fill');
        const percentEl = document.getElementById('app-loading-percent');
        if (status) status.textContent = statusText;
        if (progress) progress.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${percent}%`;
    }

    hideAppLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (!overlay) return;
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }

    showBootstrapFailure(message = 'Không thể đồng bộ dữ liệu. Vui lòng kiểm tra mạng và thử lại.') {
        this.showAppLoadingOverlay(message, 65);
        const retry = document.getElementById('app-loading-retry');
        if (retry) retry.style.display = 'block';
    }

    async retryBootstrap() {
        const retry = document.getElementById('app-loading-retry');
        if (retry) retry.disabled = true;
        try {
            this.updateAppLoadingProgress('📦 Đang đồng bộ lại dữ liệu tài khoản...', 65);
            await this.preloadAllAppData({ requireCore: Boolean(this.currentUser && this.authToken) });
            this.renderEffects();
            this.renderControlDeck();
            this.updateAppLoadingProgress('✨ Dữ liệu đã sẵn sàng!', 100);
            setTimeout(() => this.hideAppLoadingOverlay(), 250);
        } catch (error) {
            this.showBootstrapFailure(error.message);
        } finally {
            if (retry) retry.disabled = false;
        }
    }

    async verifyCloudCompatibility() {
        const response = await fetch(`${this.API_URL}/api/cloud/status`);
        const data = await response.json().catch(() => ({}));
        const cloudDatabaseConnected = data.database?.connected === true;
        if (response.status === 426 && cloudDatabaseConnected) {
            console.warn('Cloud backend is still deploying the required API version.', data);
            setTimeout(() => this.showNotification(
                'warning',
                'Cloud đang cập nhật phiên bản mới. Bạn vẫn có thể dùng các tính năng trên máy; Trợ lý AI sẽ sẵn sàng sau khi cập nhật xong.'
            ), 300);
            return true;
        }
        if (!response.ok || data.compatible !== true || !cloudDatabaseConnected) {
            throw new Error(data.error || 'Backend cloud chưa sẵn sàng cho phiên bản LiveFlow này.');
        }
        return true;
    }

    accountStorageKey(base, user = this.currentUser) {
        const userId = String(user?._id || user?.id || user?.email || '').trim();
        return userId ? `${base}:${userId}` : '';
    }

    hydrateAccountCaches() {
        const ownedKey = this.accountStorageKey('es_cache_owned_effects');
        const pendingKey = this.accountStorageKey('es_pending_payments');
        try {
            this.ownedEffects = ownedKey ? JSON.parse(localStorage.getItem(ownedKey) || '[]') : [];
            this.pendingPaymentEffects = pendingKey ? JSON.parse(localStorage.getItem(pendingKey) || '[]') : [];
        } catch (_error) {
            this.ownedEffects = [];
            this.pendingPaymentEffects = [];
        }
        // Retired global keys could expose the previous account's state on a
        // shared PC. Never migrate ambiguous ownership/payment data.
        localStorage.removeItem('es_cache_owned_effects');
        localStorage.removeItem('es_pending_payments');
    }

    savePendingPaymentEffects() {
        const key = this.accountStorageKey('es_pending_payments');
        if (key) localStorage.setItem(key, JSON.stringify(this.pendingPaymentEffects || []));
    }

    async preloadAllAppData({ requireCore = true } = {}) {
        const isAdminUser = Boolean(
            this.currentUser?.isAdmin ||
            this.currentUser?.role === 'admin' ||
            this.currentUser?.email === 'admin@effectstore.vn' ||
            document.querySelector('.user-card .plan')?.textContent?.trim() === 'ADMIN'
        );
        const coreTasks = [
            this.verifyCloudCompatibility(),
            this.loadBanner(),
            this.loadEffects()
        ];
        if (this.authToken) coreTasks.push(this.loadOwnedEffects());
        const tasks = [];
        if (typeof this.loadPersonalEffects === 'function') {
            tasks.push(this.loadPersonalEffects());
        }
        if (typeof this.loadGifts === 'function') {
            tasks.push(this.loadGifts());
        }
        if (typeof this.loadMappings === 'function') {
            tasks.push(this.loadMappings());
        }
        if (typeof this.loadSoundLibrary === 'function') {
            tasks.push(this.loadSoundLibrary());
        }
        if (typeof this.loadAiAssistantConfig === 'function') {
            tasks.push(this.loadAiAssistantConfig());
        }
        if (typeof this.loadSettings === 'function') {
            // Populates #settings-* fields (account info, OBS, TikTok, sound/TTS
            // prefs) up front so the Settings view never shows a loading flash
            // (or stale data left in the static HTML) the first time it's opened.
            tasks.push(this.loadSettings());
        }
        if (window.giftMenuDesigner && typeof window.giftMenuDesigner.loadDataIfNeeded === 'function') {
            // Same idea for the Gift Menu Designer: load its gift library, goal
            // assets/templates, saved-layouts list and active canvas now, so
            // switching into "Thiết kế bảng quà" is instant instead of loading
            // on first visit.
            tasks.push(window.giftMenuDesigner.loadDataIfNeeded());
        }
        if (isAdminUser) {
            if (typeof this.loadAdminDashboard === 'function') tasks.push(this.loadAdminDashboard());
            if (typeof this.loadAdminEffectAcquisitions === 'function') tasks.push(this.loadAdminEffectAcquisitions());
        }
        const [coreResults] = await Promise.all([
            Promise.allSettled(coreTasks),
            Promise.allSettled(tasks)
        ]);
        const failedCore = coreResults.find((result) =>
            result.status === 'rejected' || result.value === false
        );
        if (requireCore && failedCore) {
            throw failedCore.status === 'rejected'
                ? failedCore.reason
                : new Error('Chưa thể tải đủ Cửa hàng và dữ liệu tài khoản. Vui lòng thử lại.');
        }
        this.renderEffects();
        this.renderControlDeck();
        this.syncControlDeckToRemote();
    }
    async init() {
        try {
            this.showAppLoadingOverlay('🚀 Đang khởi động hệ thống...', 25);

            let savedMachineId = localStorage.getItem('es_machine_id');
            if (!savedMachineId) {
                savedMachineId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('es_machine_id', savedMachineId);
            }
            this.machineId = savedMachineId;

            // Load cached user immediately for instant profile display
            let cachedUser = null;
            try {
                cachedUser = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
            } catch (_e) {}
            this.currentUser = cachedUser;
            this.hydrateAccountCaches();

            this.updateUserUI();
            this.loadCart();
            this.updateUI();

            // Render instantly from local cache / presets without blocking
            const cachedBanner = localStorage.getItem('es_cached_banner_url');
            if (cachedBanner) {
                this.bannerUrl = cachedBanner;
                const heroBanner = document.querySelector('.hero-banner-new');
                if (heroBanner) {
                    heroBanner.style.backgroundImage = `url('${cachedBanner}')`;
                    heroBanner.style.backgroundSize = 'cover';
                    heroBanner.style.backgroundPosition = 'center';
                }
            }
            this.renderEffects();
            this.renderControlDeck();
            this.syncControlDeckToRemote();
            this.syncControlDeckHotkeys();
            window.electronAPI?.onControlDeckTrigger?.((slotId) => this.triggerControlDeckSlot(slotId));

            // Wait for the backend (which now also cold-starts the bundled
            // MongoDB first) to actually respond before checking auth —
            // otherwise checkAuth() can hit its own timeout before the
            // backend is even listening and wrongly fall back to trusting
            // an unverified cached session.
            await this.waitForBackendReady().catch(() => {});
            this.updateAppLoadingProgress('🔐 Đang xác minh phiên đăng nhập...', 45);

            // Validate authentication token first to cleanly purge expired credentials
            await this.checkAuth().catch(() => {});

            // Keep the shell covered until the verified account's required
            // data is hydrated. This prevents blank Store/Designer panels and
            // prevents one account's cached library flashing for another.
            this.updateAppLoadingProgress('📦 Đang đồng bộ dữ liệu tài khoản...', 65);
            if (this.currentUser && this.authToken) {
                this.hydrateAccountCaches();
                await this.preloadAllAppData();
                this.loadCart();
            } else {
                await Promise.allSettled([this.loadBanner(), this.loadEffects(), this.loadTrending()]);
            }
            this.renderEffects();
            this.renderControlDeck();
            this.syncControlDeckToRemote();
            this.updateAppLoadingProgress('✨ Dữ liệu đã sẵn sàng!', 100);
            setTimeout(() => this.hideAppLoadingOverlay(), 250);
            
            this.loadAiAssistantConfig();
            this.connectWebSocket();

            this.startSystemStatusPoll();
            this.checkRemoteConnectionStatus();
            setInterval(() => this.checkRemoteConnectionStatus(), 4000);
            this.setupUpdateListeners();
        } catch (err) {
            console.error('Init error:', err);
            if (this.currentUser && this.authToken) {
                this.showBootstrapFailure(err.message || 'Không thể đồng bộ dữ liệu tài khoản.');
            } else {
                this.hideAppLoadingOverlay();
                this.openAuthModal();
            }
        }
    }

    async checkDatabaseSetup() {
        if (!window.electronAPI?.invoke) return true;
        try {
            const status = await window.electronAPI.invoke('database-config:status');
            const modal = document.getElementById('database-setup-modal');
            if (status?.needsSetup) {
                if (modal) modal.style.display = 'flex';
                return false;
            }
            if (modal) modal.style.display = 'none';
            return true;
        } catch (error) {
            console.error('Database setup status failed:', error);
            return true;
        }
    }

    async saveDatabaseSetup() {
        const input = document.getElementById('database-setup-uri');
        const errorElement = document.getElementById('database-setup-error');
        const button = document.getElementById('database-setup-save');
        const mongoUri = String(input?.value || '').trim();
        if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
            if (errorElement) errorElement.textContent = 'URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://';
            return;
        }
        if (button) {
            button.disabled = true;
            button.textContent = 'Đang kiểm tra kết nối...';
        }
        if (errorElement) errorElement.textContent = '';
        try {
            const result = await window.electronAPI.invoke('database-config:save', mongoUri);
            if (!result?.success) throw new Error(result?.error || 'Không thể kết nối MongoDB.');
            if (input) input.value = '';
            location.reload();
        } catch (error) {
            if (errorElement) errorElement.textContent = error.message;
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Lưu và kiểm tra kết nối';
            }
        }
    }

    async checkInitialAdminSetup() {
        if (!window.electronAPI?.invoke) return true;
        try {
            const status = await window.electronAPI.invoke('admin-setup:status');
            const modal = document.getElementById('admin-setup-modal');
            if (status?.success && status.needsAdminSetup) {
                if (modal) modal.style.display = 'flex';
                return false;
            }
            if (modal) modal.style.display = 'none';
            return true;
        } catch (_error) {
            return true;
        }
    }

    async createInitialAdmin() {
        const errorElement = document.getElementById('admin-setup-error');
        const button = document.getElementById('admin-setup-save');
        const payload = {
            name: document.getElementById('admin-setup-name')?.value || '',
            phone: document.getElementById('admin-setup-phone')?.value || '',
            email: document.getElementById('admin-setup-email')?.value || '',
            password: document.getElementById('admin-setup-password')?.value || ''
        };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
            if (errorElement) errorElement.textContent = 'Email admin không hợp lệ.';
            return;
        }
        if (payload.password.length < 12) {
            if (errorElement) errorElement.textContent = 'Mật khẩu phải có ít nhất 12 ký tự.';
            return;
        }
        if (button) { button.disabled = true; button.textContent = 'Đang tạo admin...'; }
        if (errorElement) errorElement.textContent = '';
        try {
            const result = await window.electronAPI.invoke('admin-setup:create', payload);
            if (!result?.success) throw new Error(result?.error || 'Không thể tạo admin.');
            payload.password = '';
            location.reload();
        } catch (error) {
            if (errorElement) errorElement.textContent = error.message;
        } finally {
            if (button) { button.disabled = false; button.textContent = 'Tạo tài khoản admin'; }
        }
    }

    async waitForBackendReady(maxRetries = 40, intervalMs = 500) {
        // The managed backend now starts the bundled MongoDB first (see
        // desktop/backend-manager.js startBundledMongo), which can push a
        // cold start past checkAuth()'s old fixed 4s timeout — that used to
        // make checkAuth() treat a perfectly valid session as unreachable
        // and fall back to trusting an unverified cached token. 40*500ms=20s
        // comfortably covers a cold start without hanging forever if the
        // backend is genuinely down.
        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 1200);
                const res = await fetch(this.API_URL + '/api/system/status', { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) return true;
            } catch (_e) { /* fall through to the shared retry delay below */ }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return false;
    }

    async checkAuth() {
        const token = localStorage.getItem('token');

        if (!token) {
            this.authToken = null;
            this.currentUser = null;
            this.updateUserUI();
            this.openAuthModal();
            return;
        }

        try {
            // A single transient blip (cold-starting backend, brief network
            // hiccup) used to fall straight through to trusting the cached
            // user below with zero verification. Retry a couple of times
            // first so a real 401/valid response wins over a guess whenever
            // possible.
            let res = null;
            let lastError = null;
            for (let attempt = 0; attempt < 3 && !res; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 4000);
                    res = await fetch(this.API_URL + '/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` },
                        signal: controller.signal
                    });
                    clearTimeout(timeout);
                } catch (attemptError) {
                    lastError = attemptError;
                    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 800));
                }
            }
            if (!res) throw lastError || new Error('auth check failed');
            const data = await res.json().catch(() => ({}));
            if (data.success && data.user) {
                this.currentUser = data.user;
                this.authToken = token;
                this.closeAuthModal();
                this.updateUserUI();
                this.loadAiAssistantConfig();
                if (this.currentView === 'admin' || data.user.isAdmin || data.user.email === 'admin@effectstore.vn') {
                    this.loadAdminDashboard();
                }
                this.startAdminPendingPaymentsPoll();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('user');
                this.authToken = null;
                this.currentUser = null;
                this.updateUserUI();
                this.openAuthModal();
            }
        } catch (e) {
            console.warn('Auth check offline:', e.message);
            let cachedUser = null;
            try {
                cachedUser = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
            } catch (_e) {}
            if (cachedUser && token) {
                this.currentUser = cachedUser;
                this.authToken = token;
                this.closeAuthModal();
                this.updateUserUI();
                // All 3 attempts above failed to even get a response — trust
                // the cache for now (don't punish a real user for a brief
                // backend hiccup) but don't trust it forever. Re-check once
                // the dust settles; if the backend turns out to have a
                // definitive answer (account gone, token invalid), correct
                // course instead of leaving the UI silently "logged in" to a
                // session that can't actually do anything.
                this._verifyAuthInBackground(token);
            } else {
                this.authToken = null;
                this.currentUser = null;
                this.updateUserUI();
                this.openAuthModal();
            }
        }
    }

    async _verifyAuthInBackground(token) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(this.API_URL + '/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
            });
            clearTimeout(timeout);
            const data = await res.json().catch(() => ({}));
            if (data.success && data.user) {
                this.currentUser = data.user;
                this.authToken = token;
                this.updateUserUI();
                return;
            }
            // The backend is definitively reachable now and says this session
            // isn't valid (account gone/deleted, token rejected) — the earlier
            // cache-trust was wrong. Force a real re-login instead of leaving
            // the user stuck looking logged in while every real action 401s.
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('user');
            this.authToken = null;
            this.currentUser = null;
            this.updateUserUI();
            this.openAuthModal();
            this.showNotification('error', 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
        } catch (_e) {
            // Still unreachable — leave the provisional cache-trust in place;
            // whatever next calls checkAuth() (app restart, manual retry) will
            // get another chance to resolve this properly.
        }
    }

    ensureActiveUser() {
        if (!this.currentUser) {
            let cachedUser = null;
            try {
                cachedUser = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
            } catch (_e) {}
            this.currentUser = cachedUser || null;
        }
        document.getElementById('auth-modal')?.classList.remove('show');
        this.updateUserUI();
    }

    openCustomEffectModal() {
        const title = document.getElementById('custom-request-title');
        const subtitle = document.getElementById('custom-request-subtitle');
        const descLabel = document.getElementById('custom-request-description-label');
        const desc = document.getElementById('custom-req-desc');
        if (title) title.textContent = 'Tạo Hiệu Ứng Riêng';
        if (subtitle) subtitle.textContent = 'Hãy gửi yêu cầu thiết kế của bạn, chúng tôi sẽ liên hệ lại sớm nhất!';
        if (descLabel) descLabel.textContent = 'Mô tả ý tưởng hiệu ứng *';
        if (desc) desc.placeholder = 'Mô tả ngắn gọn kịch bản, quà tặng tương ứng...';
        const modal = document.getElementById('custom-effect-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
            // Điền sẵn thông tin nếu user đã đăng nhập
            if (this.currentUser) {
                document.getElementById('custom-req-name').value = this.currentUser.name || '';
                document.getElementById('custom-req-phone').value = this.currentUser.phone || '';
            }
        }
    }

    closeCustomEffectModal() {
        const modal = document.getElementById('custom-effect-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hidden');
        }
    }

    setupUpdateListeners() {
        if (!window.electronAPI?.on) return;

        this._manualUpdateCheck = false;

        const updateVersionModal = (messageHtml, buttonsHtml) => {
            if (!this._manualUpdateCheck) return;
            this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;">${messageHtml}</div>`);
            const actions = document.getElementById('modal-actions');
            if (actions) {
                actions.innerHTML = buttonsHtml || '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>';
            }
        };

        const notifyUpdate = (message, type = 'success') => {
            this.showNotification(type, message);
        };

        window.electronAPI.on('app-update:available', (info) => {
            if (this._manualUpdateCheck) {
                updateVersionModal(
                    `<p>Đã có phiên bản mới: <strong>${info.version}</strong>.</p><p>Nhấn <strong>Cập nhật</strong> để tải phiên bản mới về và cài đặt.</p>`,
                    '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button><button class="pro-btn" style="min-width:140px;" onclick="app.downloadAppUpdate()">Cập nhật</button>'
                );
            } else {
                notifyUpdate(`Đã có bản cập nhật mới: ${info.version}.`);
            }
        });

        window.electronAPI.on('app-update:download-progress', (progress) => {
            const percent = Math.round(progress?.percent || 0);
            if (this._manualUpdateCheck) {
                updateVersionModal(
                    `<p>Đang tải cập nhật... <strong>${percent}%</strong></p>`,
                    '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>'
                );
            } else {
                notifyUpdate(`Đang tải cập nhật... ${percent}%`);
            }
        });

        window.electronAPI.on('app-update:downloaded', () => {
            if (this._manualUpdateCheck) {
                updateVersionModal(
                    '<p>Cập nhật đã tải xong. Nhấn khởi động lại để áp dụng phiên bản mới.</p>',
                    '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button><button class="pro-btn" style="min-width:140px;" onclick="app._confirmUpdateRestart()">Khởi động lại</button>'
                );
            } else {
                notifyUpdate('Cập nhật đã tải xong. Khởi động lại app để áp dụng.', 'success');
            }
        });

        window.electronAPI.on('app-update:error', (message) => {
            if (this._manualUpdateCheck) {
                updateVersionModal(
                    `<p>Lỗi khi kiểm tra/cập nhật: ${message}</p>`,
                    '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>'
                );
            } else {
                notifyUpdate(`Lỗi cập nhật: ${message}`, 'warning');
            }
        });

        window.electronAPI.on('app-update:checking', () => {
            if (this._manualUpdateCheck) {
                updateVersionModal('<p>Đang kiểm tra phiên bản mới...</p>', '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>');
            } else {
                notifyUpdate('Đang kiểm tra phiên bản mới...');
            }
        });

        window.electronAPI.on('app-update:not-available', () => {
            if (this._manualUpdateCheck) {
                updateVersionModal('<p>Bạn đang dùng phiên bản mới nhất.</p>', '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>');
                this._manualUpdateCheck = false;
            } else {
                notifyUpdate('Bạn đang dùng phiên bản mới nhất.', 'success');
            }
        });
    }

    async checkAppVersion() {
        if (!window.electronAPI?.invoke) return;
        this._manualUpdateCheck = true;
        this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Đang kiểm tra phiên bản mới. Vui lòng chờ...</p></div>`);
        const actions = document.getElementById('modal-actions');
        if (actions) {
            actions.innerHTML = '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>';
        }
        try {
            const result = await window.electronAPI.invoke('app-update:check');
            if (result?.dev) {
                this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Phiên bản hiện tại: <strong>${result.version || 'n/a'}</strong></p><p>Ứng dụng đang chạy trong môi trường phát triển. Auto-update chỉ có hiệu lực khi chạy bản đóng gói.</p></div>`);
                this._manualUpdateCheck = false;
                return;
            }
            if (!result?.success) {
                this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Lỗi khi kiểm tra phiên bản:</p><p>${result.message || 'Không thể kiểm tra cập nhật.'}</p></div>`);
                this._manualUpdateCheck = false;
                return;
            }
            if (result.version) {
                this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Đang kiểm tra phiên bản mới cho phiên bản hiện tại: <strong>${result.version}</strong>.</p><p>Nếu không có bản mới, bạn sẽ nhận thông báo ngay sau.</p></div>`);
            }
        } catch (err) {
            this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Lỗi khi kiểm tra phiên bản:</p><p>${err?.message || err}</p></div>`);
            this._manualUpdateCheck = false;
        }
    }

    async downloadAppUpdate() {
        const actions = document.getElementById('modal-actions');
        if (actions) {
            actions.innerHTML = '<button class="btn-cancel" onclick="app.closeModal()">Đóng</button>';
        }

        const result = await window.electronAPI?.invoke('app-update:download-update');
        if (!result?.success) {
            this.showModal('Phiên bản', `<div style="display:flex;flex-direction:column;gap:14px;color:var(--text-secondary);line-height:1.6;"><p>Không thể tải bản cập nhật:</p><p>${result?.message || 'Đã xảy ra lỗi khi tải cập nhật.'}</p></div>`);
            this._manualUpdateCheck = false;
        }
    }

    _confirmUpdateRestart() {
        window.electronAPI?.invoke('app-update:restart-to-update');
    }

    async submitCustomEffectReq() {
        const name = document.getElementById('custom-req-name').value.trim();
        const phone = document.getElementById('custom-req-phone').value.trim();
        const description = document.getElementById('custom-req-desc').value.trim();

        if (!name || !phone || !description) {
            const notifMessage = document.getElementById('notification-message');
            const notifIcon = document.getElementById('notification-icon');
            const notif = document.getElementById('notification');
            if (notifMessage && notifIcon && notif) {
                notifIcon.textContent = '⚠️';
                notifMessage.textContent = 'Vui lòng điền đầy đủ thông tin!';
                notif.className = 'notification warning show';
                setTimeout(() => notif.classList.remove('show'), 3000);
            }
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }

            const res = await fetch(`${this.API_URL}/api/effect-requests`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ name, phone, description })
            });

            const data = await res.json();
            const notifMessage = document.getElementById('notification-message');
            const notifIcon = document.getElementById('notification-icon');
            const notif = document.getElementById('notification');

            if (data.success) {
                if (notifMessage && notifIcon && notif) {
                    notifIcon.textContent = '✅';
                    notifMessage.textContent = 'Gửi yêu cầu thành công! Chúng tôi sẽ liên hệ lại sớm.';
                    notif.className = 'notification success show';
                    setTimeout(() => notif.classList.remove('show'), 3000);
                }
                this.closeCustomEffectModal();
                // Reset form
                document.getElementById('custom-req-name').value = '';
                document.getElementById('custom-req-phone').value = '';
                document.getElementById('custom-req-desc').value = '';
            } else {
                if (notifMessage && notifIcon && notif) {
                    notifIcon.textContent = '❌';
                    notifMessage.textContent = data.error || 'Có lỗi xảy ra';
                    notif.className = 'notification error show';
                    setTimeout(() => notif.classList.remove('show'), 3000);
                }
            }
        } catch (error) {
            console.error('Error submitting effect req:', error);
            const notifMessage = document.getElementById('notification-message');
            const notifIcon = document.getElementById('notification-icon');
            const notif = document.getElementById('notification');
            if (notifMessage && notifIcon && notif) {
                notifIcon.textContent = '❌';
                notifMessage.textContent = 'Lỗi kết nối máy chủ';
                notif.className = 'notification error show';
                setTimeout(() => notif.classList.remove('show'), 3000);
            }
        }
    }

    updateSidebarPromo(planKey) {
        const card = document.getElementById('sidebar-promo-card');
        if (!card) return;
        const content = {
            free: {
                icon: '✨',
                badge: 'TỪ 6.600Đ/NGÀY',
                title: 'Nâng tầm livestream',
                description: 'Mở thêm hiệu ứng, TTS và thiết kế chuyên nghiệp.',
                button: 'XEM GÓI BASIC',
                action: 'pricing'
            },
            pro: {
                icon: '⚡',
                badge: 'KHI BẠN CẦN THÊM',
                title: 'Tự động hóa mạnh hơn',
                description: 'Gộp nhiều effect, cooldown nâng cao và thêm không gian sáng tạo.',
                button: 'KHÁM PHÁ GÓI PRO',
                action: 'pricing'
            },
            business: {
                icon: '🚀',
                badge: 'DÀNH CHO TEAM',
                title: 'Mở rộng quy mô vận hành',
                description: 'Khám phá giải pháp tùy chỉnh cho team và nhiều thiết bị.',
                button: 'TÌM HIỂU STUDIO',
                action: 'pricing'
            },
            studio: {
                icon: '🎨',
                badge: 'LỐI TẮT',
                title: 'Tạo trải nghiệm mới',
                description: 'Mở trình thiết kế để tiếp tục xây dựng bảng quà của bạn.',
                button: 'MỞ TRÌNH THIẾT KẾ',
                action: 'designer'
            },
            admin: {
                icon: '🛠️',
                badge: 'QUẢN TRỊ',
                title: 'Tạo trải nghiệm mới',
                description: 'Mở nhanh trình thiết kế bảng quà và nội dung cửa hàng.',
                button: 'MỞ TRÌNH THIẾT KẾ',
                action: 'designer'
            }
        };
        const selected = content[planKey] || content.free;
        card.dataset.plan = planKey || 'free';
        card.dataset.action = selected.action;
        const icon = document.getElementById('sidebar-promo-icon');
        const badge = document.getElementById('sidebar-promo-badge');
        const title = document.getElementById('sidebar-promo-title');
        const description = document.getElementById('sidebar-promo-description');
        const button = document.getElementById('sidebar-promo-button');
        if (icon) icon.textContent = selected.icon;
        if (badge) badge.textContent = selected.badge;
        if (title) title.textContent = selected.title;
        if (description) description.textContent = selected.description;
        if (button) button.innerHTML = `${selected.button} <span>→</span>`;
    }

    handleSidebarPromo() {
        const action = document.getElementById('sidebar-promo-card')?.dataset.action;
        if (action === 'designer') {
            if (typeof window.switchView === 'function') window.switchView('gift-menu-designer');
            return;
        }
        this.showPricing();
    }

    updateUserUI() {
        if (!this.currentUser) {
            const avatarEl = document.getElementById('user-avatar-small');
            if (avatarEl) {
                avatarEl.textContent = '👤';
                const parentAvatar = avatarEl.parentElement;
                if (parentAvatar) {
                    parentAvatar.style.background = 'linear-gradient(135deg,#374151,#4b5563)';
                    parentAvatar.style.color = '#fff';
                }
            }
            const nameEl = document.getElementById('user-name-display');
            if (nameEl) nameEl.textContent = 'Chưa đăng nhập';
            const rankBadge = document.getElementById('user-rank-badge');
            if (rankBadge) {
                rankBadge.textContent = 'ĐĂNG NHẬP';
                rankBadge.style.background = 'rgba(139,92,246,0.2)';
                rankBadge.style.color = '#c084fc';
                rankBadge.style.border = '1px solid rgba(139,92,246,0.4)';
                rankBadge.style.display = 'inline-flex';
                rankBadge.style.cursor = 'pointer';
            }
            const emailEl = document.getElementById('user-email-display');
            if (emailEl) {
                emailEl.innerHTML = '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(139,92,246,0.15);color:#a78bfa;font-weight:700;cursor:pointer;">Đăng nhập / Đăng ký</span>';
            }
            const adminNavItem = document.getElementById('admin-nav-item');
            if (adminNavItem) adminNavItem.style.display = 'none';
            return;
        }
        const u = this.currentUser;
        const nameChar = (u.name && u.name.length > 0) ? u.name[0].toUpperCase() : 'U';

        // Badge + màu theo cấp độ
        const planKey = resolvePlanKey(u);
        const plan = resolvePlanDisplay(u);
        this.updateSidebarPromo(planKey);

        // Cập nhật avatar chữ
        const avatarEl = document.getElementById('user-avatar-small');
        if (avatarEl) {
            avatarEl.textContent = nameChar;
            const parentAvatar = avatarEl.parentElement;
            if (parentAvatar) {
                parentAvatar.style.background = plan.avatarBg;
                parentAvatar.style.color = plan.avatarColor;
            }
            avatarEl.style.background = 'transparent';
        }

        // Cập nhật tên
        const nameEl = document.getElementById('user-name-display');
        if (nameEl) nameEl.textContent = u.name || u.email;

        // Cập nhật Rank Badge
        const rankBadge = document.getElementById('user-rank-badge');
        if (rankBadge) {
            rankBadge.textContent = plan.label.replace(/^[^\s]+\s/, '').toUpperCase();
            rankBadge.style.background = plan.bg;
            rankBadge.style.color = plan.color;
            rankBadge.style.border = `1px solid ${plan.border}`;
            rankBadge.style.display = 'inline-flex';
            rankBadge.style.padding = '2px 8px';
            rankBadge.style.borderRadius = '6px';
            rankBadge.style.fontSize = '10px';
            rankBadge.style.fontWeight = '800';
        }

        // Cập nhật email → thay bằng badge gói
        const emailEl = document.getElementById('user-email-display');
        if (emailEl) {
            emailEl.innerHTML = `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</span>`;
        }

        // Hiện/ẩn Admin Dashboard
        const adminNavItem = document.getElementById('admin-nav-item');
        if (adminNavItem) {
            adminNavItem.style.display = u.isAdmin ? '' : 'none';
        }

        this.controlDeck = this.loadControlDeckState();
        this.renderControlDeck();
        this.syncControlDeckToRemote();
    }


    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        if (tab === 'login') {
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('register-form').style.display = 'none';
        } else {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('register-form').style.display = 'block';
        }
    }

    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        if (!email || !password) {
            this.showNotification('error', 'Vui lòng nhập email và mật khẩu!');
            return;
        }
        try {
            const res = await fetch(this.API_URL + '/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, machineId: this.machineId })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.currentUser = data.user;
                this.authToken = data.token;
                this.hydrateAccountCaches();
                this.closeAuthModal();
                this.showAppLoadingOverlay('🔓 Đăng nhập thành công! Đang đồng bộ hệ thống...', 25);
                await this.resetRemoteControlSession();
                await this.syncGiftMenuOverlayToActiveAccount();
                await this.resetGiftMenuDesignerSession();
                this.updateUserUI();

                this.updateAppLoadingProgress('📦 Đang tải Cửa hàng, Hiệu ứng cá nhân & Trang quản trị...', 65);
                await this.preloadAllAppData();
                this.loadCart();
                this.updateUI();
                this.startSystemStatusPoll();
                this.startAdminPendingPaymentsPoll();
                
                this.updateAppLoadingProgress('✨ Đã sẵn sàng!', 100);
                setTimeout(() => this.hideAppLoadingOverlay(), 300);
                this.showNotification('success', `✅ Chào mừng ${data.user.name || data.user.email}!`);
            } else {
                this.showNotification('error', data.error || data.message || 'Đăng nhập thất bại');
            }
        } catch (e) {
            console.error('Login exception:', e);
            if (this.currentUser && this.authToken) {
                this.showBootstrapFailure(e.message || 'Đăng nhập thành công nhưng chưa thể đồng bộ dữ liệu.');
            } else {
                this.showNotification('error', 'Lỗi kết nối server');
            }
        }
    }

    async register() {
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const phone = document.getElementById('register-phone').value.trim();
        const termsAccepted = document.getElementById('register-terms').checked;
        if (!name || !email || password.length < 8 || !phone) {
            this.showNotification('error', 'Vui lòng điền tên, email, mật khẩu và số điện thoại/Zalo.');
            return;
        }
        if (!termsAccepted) {
            this.showNotification('error', 'Bạn cần đồng ý với điều khoản và chính sách bảo mật.');
            return;
        }
        const supportProfile = {
            tiktokUsername: document.getElementById('register-tiktok').value.trim(),
            birthday: document.getElementById('register-birthday').value,
            region: document.getElementById('register-region').value.trim(),
            userType: document.getElementById('register-user-type').value,
            primaryNeed: document.getElementById('register-primary-need').value,
            preferredContact: document.getElementById('register-preferred-contact').value,
            contactTime: document.getElementById('register-contact-time').value.trim()
        };
        try {
            const res = await fetch(this.API_URL + '/api/auth/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, email, password, phone, supportProfile, termsAccepted,
                    marketingConsent: document.getElementById('register-marketing').checked,
                    machineId: this.machineId
                })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.token);
                if (data.user) {
                    localStorage.setItem('currentUser', JSON.stringify(data.user));
                    this.currentUser = data.user;
                }
                this.authToken = data.token;
                this.hydrateAccountCaches();
                this.closeAuthModal();
                this.showAppLoadingOverlay('🔓 Đăng ký thành công! Đang đồng bộ hệ thống...', 25);
                await this.resetRemoteControlSession();
                await this.syncGiftMenuOverlayToActiveAccount();
                await this.resetGiftMenuDesignerSession();
                this.updateUserUI();
                this.updateAppLoadingProgress('📦 Đang tải dữ liệu tài khoản...', 65);
                await this.preloadAllAppData();
                this.loadCart();
                this.updateUI();
                this.updateAppLoadingProgress('✨ Đã sẵn sàng!', 100);
                setTimeout(() => this.hideAppLoadingOverlay(), 300);
                this.showNotification('success', 'Đăng ký thành công!');
            } else {
                this.showNotification('error', data.error || data.message || 'Đăng ký thất bại');
            }
        } catch (e) {
            if (this.currentUser && this.authToken) {
                this.showBootstrapFailure(e.message || 'Đăng ký thành công nhưng chưa thể đồng bộ dữ liệu.');
            } else {
                this.showNotification('error', 'Lỗi kết nối server');
            }
        }
    }

    openCustomerProfileEditor() {
        const user = this.currentUser || {};
        const profile = user.supportProfile || {};
        const safe = (value) => this.adminPaymentText(value || '');
        const option = (value, current, label) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
        this.showModal('Cập nhật thông tin cá nhân', `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <label style="font-size:11px;color:#94a3b8;">Tên hiển thị<input id="profile-name" value="${safe(user.name)}" style="width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
                <label style="font-size:11px;color:#94a3b8;">Số điện thoại/Zalo<input id="profile-phone" value="${safe(user.phone)}" style="width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
                <label style="font-size:11px;color:#94a3b8;">TikTok username<input id="profile-tiktok" value="${safe(profile.tiktokUsername)}" placeholder="@username" style="width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
                <label style="font-size:11px;color:#94a3b8;">Ngày sinh<input id="profile-birthday" type="date" value="${safe(profile.birthday)}" style="width:100%;box-sizing:border-box;margin-top:6px;padding:9px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
                <label style="font-size:11px;color:#94a3b8;">Tỉnh/thành phố<input id="profile-region" value="${safe(profile.region)}" style="width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
                <label style="font-size:11px;color:#94a3b8;">Loại người dùng<select id="profile-user-type" style="width:100%;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;">${option('', profile.userType, 'Chọn loại')}${option('streamer', profile.userType, 'Streamer cá nhân')}${option('agency', profile.userType, 'Agency/Team')}${option('shop', profile.userType, 'Shop bán hàng')}${option('studio', profile.userType, 'Studio')}</select></label>
                <label style="font-size:11px;color:#94a3b8;">Nhu cầu chính<select id="profile-primary-need" style="width:100%;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;">${option('', profile.primaryNeed, 'Chọn nhu cầu')}${option('gift-effects', profile.primaryNeed, 'Hiệu ứng quà tặng')}${option('tts', profile.primaryNeed, 'TTS')}${option('gift-menu', profile.primaryNeed, 'Bảng quà')}${option('pk-game', profile.primaryNeed, 'PK/Mini game')}</select></label>
                <label style="font-size:11px;color:#94a3b8;">Kênh liên hệ<select id="profile-preferred-contact" style="width:100%;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;">${option('zalo', profile.preferredContact || 'zalo', 'Zalo')}${option('phone', profile.preferredContact, 'Điện thoại')}${option('email', profile.preferredContact, 'Email')}</select></label>
                <label style="font-size:11px;color:#94a3b8;grid-column:1/-1;">Khung giờ thuận tiện<input id="profile-contact-time" value="${safe(profile.contactTime)}" placeholder="Ví dụ: 18:00–21:00" style="width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:9px;background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#fff;"></label>
            </div>
            <label style="display:flex;gap:8px;align-items:flex-start;margin:14px 0;color:#94a3b8;font-size:11px;"><input id="profile-marketing" type="checkbox" ${user.marketingConsent ? 'checked' : ''} style="accent-color:#8b5cf6;"> Đồng ý nhận hướng dẫn và ưu đãi phù hợp.</label>
            <button onclick="app.saveCustomerProfile()" style="width:100%;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;font-weight:800;cursor:pointer;">Lưu thông tin</button>
        `);
    }

    async saveCustomerProfile() {
        const payload = {
            name: document.getElementById('profile-name')?.value?.trim() || '',
            phone: document.getElementById('profile-phone')?.value?.trim() || '',
            marketingConsent: document.getElementById('profile-marketing')?.checked === true,
            supportProfile: {
                tiktokUsername: document.getElementById('profile-tiktok')?.value?.trim() || '',
                birthday: document.getElementById('profile-birthday')?.value || '',
                region: document.getElementById('profile-region')?.value?.trim() || '',
                userType: document.getElementById('profile-user-type')?.value || '',
                primaryNeed: document.getElementById('profile-primary-need')?.value || '',
                preferredContact: document.getElementById('profile-preferred-contact')?.value || 'zalo',
                contactTime: document.getElementById('profile-contact-time')?.value?.trim() || ''
            }
        };
        try {
            const response = await fetch(`${this.API_URL}/api/auth/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Không thể cập nhật hồ sơ.');
            this.currentUser = { ...this.currentUser, ...data.user };
            this.updateUserUI();
            this.closeModal();
            this.showNotification('success', 'Đã cập nhật thông tin hỗ trợ.');
        } catch (error) {
            this.showNotification('error', error.message);
        }
    }

    async logout() {
        try {
            if (this.authToken) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                await fetch(`${this.API_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.authToken}` },
                    signal: controller.signal
                });
                clearTimeout(timeout);
            }
        } catch (_error) { }
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('user');
        this.authToken = null;
        this.currentUser = null;
        if (this._adminPollInterval) {
            clearInterval(this._adminPollInterval);
            this._adminPollInterval = null;
        }
        this._prevPendingCount = 0;
        this.adminPendingPayments = [];
        this.selectedAdminPaymentId = null;
        this.effects = [];
        this.ownedEffects = [];
        this.pendingPaymentEffects = [];
        this.cart = [];
        this.personalEffects = [];
        this.giftMappings = [];
        this.controlDeckSlots = [];
        this.updateAdminBadges(0);
        await this.resetRemoteControlSession();
        await this.resetGiftMenuDesignerSession();
        this.updateUserUI();
        this.openAuthModal();
        this.showNotification('info', '👋 Đã đăng xuất thành công!');
    }

    openAuthModal() {
        this.closeModal();
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
            const emailInput = document.getElementById('login-email');
            if (emailInput) {
                emailInput.value = '';
                emailInput.focus();
            }
            const passwordInput = document.getElementById('login-password');
            if (passwordInput) passwordInput.value = '';
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hidden');
        }
    }

    openStudioContact() {
        this.closePricing();
        this.openCustomEffectModal();
        const title = document.getElementById('custom-request-title');
        const subtitle = document.getElementById('custom-request-subtitle');
        const descLabel = document.getElementById('custom-request-description-label');
        const desc = document.getElementById('custom-req-desc');
        if (title) title.textContent = 'Tư vấn gói Studio';
        if (subtitle) subtitle.textContent = 'BH Studio sẽ tư vấn giải pháp phù hợp cho team và doanh nghiệp của bạn.';
        if (descLabel) descLabel.textContent = 'Nhu cầu vận hành *';
        if (desc) desc.placeholder = 'Số máy, số phòng Live, quy mô team và nhu cầu tích hợp...';
    }

    startSystemStatusPoll() {
        if (this.systemStatusInterval) clearInterval(this.systemStatusInterval);
        this.pollSystemStatus();
        this.systemStatusInterval = setInterval(() => this.pollSystemStatus(), 5000);
    }

    async pollSystemStatus() {
        try {
            const res = await fetch(`${this.API_URL}/api/system/status`);
            if (!res.ok) throw new Error('Dịch vụ ứng dụng chưa hoạt động');
            const data = await res.json();
            this.updateSystemStatusUI(data);
        } catch (err) {
            // Nếu lỗi (không gọi được API), mặc định Launcher là offline, còn lại offline
            this.updateSystemStatusUI({
                tiktok: { connected: false },
                obs: { connected: false },
                launcher: { connected: false }
            });
        }
    }

    updateSystemStatusUI(data) {
        // TIKTOK
        const tiktokCard = document.getElementById('status-card-tiktok');
        if (data.tiktok?.connected) {
            tiktokCard.className = 'status-card-horizontal status-connected';
            document.getElementById('status-badge-tiktok').textContent = 'ĐANG LIVE';
            document.getElementById('status-sub-tiktok').textContent = 'Đang nhận dữ liệu trực tiếp';
        } else {
            tiktokCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-tiktok').textContent = 'NGẮT KẾT NỐI';
            document.getElementById('status-sub-tiktok').textContent = 'Vui lòng kết nối tài khoản';
        }

        // OBS
        const obsCard = document.getElementById('status-card-obs');
        if (data.obs?.connected) {
            obsCard.className = 'status-card-horizontal status-connected';
            document.getElementById('status-badge-obs').textContent = 'ĐÃ KẾT NỐI';
            document.getElementById('status-sub-obs').textContent = 'Sẵn sàng kích hoạt hiệu ứng';
        } else {
            obsCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-obs').textContent = 'OFFLINE';
            document.getElementById('status-sub-obs').textContent = 'Đang dò tìm... Vui lòng mở OBS';
        }

        const obsDiagnostic = document.getElementById('obs-source-diagnostic');
        const giftMenuStatus = document.getElementById('obs-source-gift-menu');
        const effectPlayerStatus = document.getElementById('obs-source-effect-player');
        if (obsDiagnostic) obsDiagnostic.style.display = data.obs?.connected ? 'block' : 'none';
        if (giftMenuStatus) giftMenuStatus.textContent = data.obs?.sources?.gift_menu ? 'READY' : 'MISSING';
        if (effectPlayerStatus) effectPlayerStatus.textContent = data.obs?.sources?.effect_player ? 'READY' : 'MISSING';

        // LAUNCHER
        const launcherCard = document.getElementById('status-card-launcher');
        if (data.launcher?.connected) {
            launcherCard.className = 'status-card-horizontal status-connected';
            document.getElementById('status-badge-launcher').textContent = 'ĐANG CHẠY';
            document.getElementById('status-sub-launcher').textContent = 'Hệ thống hoạt động bình thường';
        } else {
            launcherCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-launcher').textContent = 'MẤT KẾT NỐI';
            document.getElementById('status-sub-launcher').textContent = 'Không thể kết nối đến máy chủ';
        }
    }
    async loadBanner() {
        try {
            const res = await fetch(`${this.API_URL}/api/banner`);
            if (!res.ok) return false;
            const data = await res.json();

            const heroBanner = document.querySelector('.hero-banner-new');

            if (data.success && data.banner && heroBanner) {
                const normalizeBannerUrl = (base, path) => {
                    const safePath = String(path || '').trim();
                    if (!safePath) return '';
                    try {
                        return new URL(safePath, base).toString();
                    } catch (_error) {
                        return `${base}${safePath.startsWith('/') ? '' : '/'}${safePath}`;
                    }
                };

                const bannerVersion = encodeURIComponent(
                    String(data.banner.updatedAt || data.banner.filename || data.banner.id || '1')
                );
                const primaryUrl = normalizeBannerUrl(this.CLOUD_API_URL, data.banner.url);
                const fallbackUrl = normalizeBannerUrl(this.API_URL, data.banner.url);
                const bannerUrl = `${encodeURI(primaryUrl)}?v=${bannerVersion}`;
                this.bannerUrl = bannerUrl;
                try {
                    localStorage.setItem('es_cached_banner_url', bannerUrl);
                } catch (_e) {}
                // Use backgroundImage to preserve existing background settings like gradient overlays
                heroBanner.style.backgroundImage = `url('${bannerUrl}')`;
                heroBanner.style.backgroundSize = 'cover';
                heroBanner.style.backgroundPosition = 'center';
                heroBanner.style.backgroundRepeat = 'no-repeat';

                if (fallbackUrl && fallbackUrl !== primaryUrl) {
                    const preloadImg = new Image();
                    preloadImg.onerror = () => {
                        heroBanner.style.backgroundImage = `url('${encodeURI(fallbackUrl)}?v=${bannerVersion}')`;
                    };
                    preloadImg.src = bannerUrl;
                }

                console.log('✅ Banner loaded:', data.banner.url);
            } else if (!heroBanner) {
                console.warn('⚠️ .hero-banner-new not found in DOM');
            }
            return data.success === true;

        } catch (err) {
            console.error('Load banner lỗi:', err);
            return false;
        }
    }
    async loadEffects() {
        try {
            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            let response = await fetch(this.API_URL + '/api/effects', { headers });
            if (response.status === 401 && this.authToken) {
                response = await this.retryUnauthorized(
                    response,
                    (token) => fetch(this.API_URL + '/api/effects', { headers: { Authorization: `Bearer ${token}` } }),
                    () => fetch(this.API_URL + '/api/effects')
                );
            }
            let data = await response.json().catch(() => ({}));
            if (!response.ok || !Array.isArray(data.effects)) {
                // The deployed central server may temporarily expose its
                // public catalog under /trending while /effects is being
                // updated. Showing that verified subset is better than an
                // empty storefront and preserves cached full-catalog data.
                const fallbackResponse = await fetch(this.API_URL + '/api/effects/trending');
                const fallbackData = await fallbackResponse.json().catch(() => ({}));
                if (fallbackResponse.ok && Array.isArray(fallbackData.effects)) data = fallbackData;
                else throw new Error(data.error || 'Không thể tải danh mục sản phẩm.');
            }
            if (data.success !== false && Array.isArray(data.effects)) {
                this.storeEffects = data.effects;
                this.effects = this.storeEffects;
                try {
                    localStorage.setItem('es_cache_store_effects', JSON.stringify(this.storeEffects));
                } catch (_e) {}
            }
            this.menuTemplateUsage = new Map();
            this.menuTemplateLayoutIds = new Map();
            try {
                const headers = {};
                if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
                let templateResponse = await fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`, { headers });
                if (templateResponse.status === 401 && this.authToken) {
                    templateResponse = await this.retryUnauthorized(
                        templateResponse,
                        (token) => fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`, { headers: { Authorization: `Bearer ${token}` } }),
                        () => fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`)
                    );
                }
                const templateData = await templateResponse.json().catch(() => ({}));
                if (templateData.success && Array.isArray(templateData.templates)) {
                    templateData.templates.forEach(template => {
                        this.menuTemplateUsage.set(String(template._id), Boolean(template.isUsed));
                        if (template.usedLayoutId) {
                            this.menuTemplateLayoutIds.set(String(template._id), String(template.usedLayoutId));
                        }
                    });
                }
            } catch (templateError) {
                console.warn('Could not load menu template usage:', templateError);
            }
            if (this.currentView === 'store') this.renderEffects();
            return true;
        } catch (error) {
            console.error('Error loading effects:', error);
            if (this.effects.length === 0) {
                try {
                    this.effects = JSON.parse(localStorage.getItem('es_cache_store_effects') || '[]');
                    this.storeEffects = this.effects;
                } catch (_e) {}
                if (this.effects.length === 0) {
                    this.storeEffects = [];
                    this.effects = [];
                }
            }
            if (this.currentView === 'store') this.renderEffects();
            return false;
        }
    }
    async loadTrending() {
        try {
            const res = await fetch(`${this.API_URL}/api/effects/trending`);
            const data = await res.json();
            const container = document.getElementById('trending-effects-list');
            if (!container) return;

            if (data.success && Array.isArray(data.effects) && data.effects.length > 0) {
                const safe = (value) => this.adminPaymentText(value == null ? '' : value);
                const resolveMediaUrl = (value) => this.resolveCatalogMediaUrl(value);
                container.innerHTML = data.effects.map((e, index) => {
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                    const displayUses = (e.fakeUses && e.fakeUses > 0) ? e.fakeUses : (e.uses || 0);
                    const formattedUses = displayUses >= 1000 ? (displayUses / 1000).toFixed(1) + 'K' : displayUses;
                    const isNew = displayUses <= 0;
                    const thumbUrl = resolveMediaUrl(e.thumbUrl);
                    const fallbackIcon = safe(e.icon || '🎬');
                    const preview = thumbUrl
                        ? `<img src="${safe(thumbUrl)}" alt="" onerror="this.style.display='none'">`
                        : fallbackIcon;
                    const activity = isNew
                        ? '<span class="ranking-trend-label">✨ Mới nổi</span>'
                        : `<span>👁 ${safe(formattedUses)} lượt dùng</span>`;

                    return `
                                <div class="ranking-item ${index === 0 ? 'is-top' : ''}" onclick="app.showEffectDetail('${safe(e._id)}')">
                                    <div class="ranking-num ${rankClass}">${index + 1}</div>
                                    <div class="ranking-thumb">${preview}</div>
                                    <div class="ranking-info">
                                        ${index === 0 ? '<span class="ranking-top-label">🔥 ĐƯỢC QUAN TÂM NHẤT</span>' : ''}
                                        <div class="name">${safe(e.name || 'Hiệu ứng')}</div>
                                        <div class="uses">${activity}</div>
                                    </div>
                                    <span class="ranking-open-arrow">›</span>
                                </div>
                            `;
                }).join('');
            } else {
                container.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px;">Chưa có hiệu ứng hot</div>';
            }
        } catch (error) { console.error('Load trending error:', error); }
    }
    async loadOwnedEffects() {
        localStorage.removeItem('es_owned_effects');

        if (!this.authToken) {
            this.ownedEffects = [];
            if (this.currentView === 'library') this.renderEffects();
            return true;
        }
        try {
            const response = await fetch(this.API_URL + '/api/user/effects', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            if (data.success) {
                if (data.libraryType === 'all_with_ownership') {
                    // API mới: tất cả effects có flag isOwned
                    this.ownedEffects = (data.effects || []).filter(e => e.isOwned);
                } else if (data.libraryType === 'admin_all') {
                    // Admin: thấy tất cả
                    this.ownedEffects = data.effects || []; // admin "sở hữu" tất cả
                } else {
                    // Fallback cÅ©
                    this.ownedEffects = data.effects || [];
                }
                try {
                    const ownedKey = this.accountStorageKey('es_cache_owned_effects');
                    if (ownedKey) localStorage.setItem(ownedKey, JSON.stringify(this.ownedEffects));
                } catch (_e) {}

                // TỰ ĐỘNG DỌN DẸP: Nếu đã sở hữu thì xóa khỏi danh sách chờ duyệt
                const ownedIds = this.ownedEffects.map(e => (e.id || e._id));
                const oldPendingCount = (this.pendingPaymentEffects || []).length;
                this.pendingPaymentEffects = (this.pendingPaymentEffects || []).filter(id => !ownedIds.includes(id));

                if (this.pendingPaymentEffects.length !== oldPendingCount) {
                    const pendingKey = this.accountStorageKey('es_pending_payments');
                    if (pendingKey) localStorage.setItem(pendingKey, JSON.stringify(this.pendingPaymentEffects));
                }

                await this.loadPersonalEffects();
                this.renderEffects();
                return true;
            } else {
                this.ownedEffects = [];
                return false;
            }
        } catch (error) {
            console.error('Load owned effects error:', error);
            this.ownedEffects = [];
            return false;
        }
    } // ✅ Đóng loadOwnedEffects ở đây

    async loadPersonalEffects() {
        try {
            if (!window.electronAPI?.invoke) {
                this.personalEffects = [];
                return;
            }
            const result = await window.electronAPI.invoke('custom-effects:list');
            const localEffects = result?.success ? (result.effects || []) : [];
            const registeredEffects = this.currentUser?.customEffects || [];
            const registeredIds = new Set(registeredEffects.map(effect => String(effect.localId || effect._id || effect.id || '')));
            const repairs = localEffects.filter((localEffect) => {
                const id = String(localEffect._id || localEffect.id || localEffect.localId || '');
                const localDuration = Number(localEffect.duration);
                const registered = registeredEffects.find(effect => String(effect.localId || effect._id || effect.id || '') === id);
                const serverDuration = Number(registered?.duration);
                return registered && Number.isFinite(localDuration) && localDuration > 0
                    && (!Number.isFinite(serverDuration) || serverDuration <= 0);
            });
            for (const effect of repairs) {
                const id = String(effect._id || effect.id || effect.localId || '');
                try {
                    const response = await fetch(`${this.API_URL}/api/user/custom-effects/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                        body: JSON.stringify({
                            localId: id,
                            name: effect.name || 'Hiệu ứng cá nhân',
                            machineId: this.machineId,
                            duration: Number(effect.duration)
                        })
                    });
                    if (response.ok) {
                        const registered = registeredEffects.find(item => String(item.localId || item._id || item.id || '') === id);
                        if (registered) registered.duration = Number(effect.duration);
                    } else {
                        console.warn(`Không thể đồng bộ thời lượng cho hiệu ứng cá nhân ${id}`);
                    }
                } catch (_error) {
                    console.warn(`Không thể đồng bộ thời lượng cho hiệu ứng cá nhân ${id}`);
                }
            }
            this.personalEffects = localEffects.filter(effect => registeredIds.has(String(effect._id || effect.id || effect.localId || '')));
            this.ownedEffects = [...this.personalEffects, ...this.ownedEffects.filter(effect => !effect?.isCustom)];
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return;
            console.error('Load personal effects error:', error);
        }
    }

    isCustomEffectBridgeMissing(error) {
        const message = String(error?.message || error || '');
        return message.includes('No handler registered for') && message.includes('custom-effects:');
    }

    showCustomEffectRestartNotice() {
        this.showNotification('warning', 'Vui lòng tắt mở lại app để kích hoạt upload hiệu ứng cá nhân.');
    }

    openPersonalEffectUpload(assignToControlDeck = false) {
        this.pendingPersonalEffectDeckIndex = assignToControlDeck ? this.pendingControlDeckIndex : null;
        this.pendingPersonalEffectFiles = null;
        this.showModal('Tải hiệu ứng cá nhân', `<div style="display:grid;gap:14px;color:#cbd5e1;">
            <div style="padding:12px;border-radius:10px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);font-size:12px;line-height:1.6;"><b style="color:#93c5fd;">ℹ️ Lưu ý về hiệu ứng cá nhân</b><br>File được lưu trực tiếp trên máy tính này và không tải lên máy chủ LiveFlow.<br>• Chỉ nhận video MP4, MOV, AVI hoặc WebM dưới 500MB.<br>• File trên 200MB có thể mất vài phút để tối ưu, nên làm trước khi livestream.<br>• App sẽ tối ưu thành WebM VP9 dọc 9:16, tối đa 15 giây để chạy mượt hơn.<br>• App không tự xóa nền; nền trong suốt chỉ có nếu video gốc có alpha.<br>• Đổi máy hoặc cài lại ứng dụng sẽ không tự khôi phục.</div>
            <label style="display:grid;gap:6px;font-size:12px;">Tên hiệu ứng<input id="personal-effect-name" maxlength="80" class="upload-form-input" placeholder="Ví dụ: Pháo hoa cảm ơn"></label>
            <button onclick="app.choosePersonalEffectFiles()" style="padding:12px;border:1px dashed rgba(167,139,250,.55);border-radius:10px;background:rgba(124,58,237,.1);color:#ddd6fe;cursor:pointer;font-weight:700;">Chọn video hiệu ứng</button>
            <div id="personal-effect-file-status" style="font-size:12px;color:#94a3b8;">Chưa chọn video</div>
            <button id="personal-effect-save-btn" onclick="app.savePersonalEffect()" class="pro-btn" style="padding:12px;">Tối ưu & lưu hiệu ứng</button></div>`);
    }

    async choosePersonalEffectFiles() {
        try {
        if (!window.electronAPI?.invoke) return this.showCustomEffectRestartNotice();
        const result = await window.electronAPI.invoke('custom-effects:choose-files');
        if (!result?.success) {
            if (result?.error) this.showNotification('warning', result.error);
            return;
        }
        this.pendingPersonalEffectFiles = result;
        const status = document.getElementById('personal-effect-file-status');
        if (status) status.textContent = `✓ Đã chọn ${result.videoName || 'video'} • sẽ tối ưu thành ${result.outputLabel || 'WebM VP9'} • tối đa ${result.maxDurationSeconds || 15}s${result.warning ? ` • ${result.warning}` : ''}`;
        if (result.warning) this.showNotification('warning', result.warning);
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Choose personal effect files error:', error);
            this.showNotification('error', 'Không thể mở cửa sổ chọn file.');
        }
    }

    async savePersonalEffect() {
        const name = document.getElementById('personal-effect-name')?.value.trim();
        if (!name || !this.pendingPersonalEffectFiles?.videoPath) return this.showNotification('warning', 'Vui lòng nhập tên và chọn video hiệu ứng.');
        const registerId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const saveBtn = document.getElementById('personal-effect-save-btn');
        const status = document.getElementById('personal-effect-file-status');
        try {
            if (!window.electronAPI?.invoke) return this.showCustomEffectRestartNotice();
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Đang tối ưu video...';
                saveBtn.style.opacity = '0.7';
                saveBtn.style.cursor = 'wait';
            }
            if (status) status.textContent = 'Đang chuyển video sang WebM VP9, vui lòng chờ...';
            const saved = await window.electronAPI.invoke('custom-effects:save', { id: registerId, name, ...this.pendingPersonalEffectFiles });
            if (!saved?.success) {
                throw new Error(saved?.error || 'Không thể lưu file.');
            }
            const savedEffect = saved.effect || {};
            const duration = Number(savedEffect.duration || savedEffect.maxDurationSeconds);
            if (!Number.isFinite(duration) || duration <= 0) {
                await window.electronAPI.invoke('custom-effects:delete', registerId);
                throw new Error('Không đọc được thời lượng video sau khi chuyển đổi.');
            }
            const response = await fetch(`${this.API_URL}/api/user/custom-effects/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ localId: registerId, name, machineId: this.machineId, duration })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                await window.electronAPI.invoke('custom-effects:delete', registerId);
                if (response.status === 404) throw new Error('Dịch vụ ứng dụng chưa hỗ trợ tải hiệu ứng cá nhân. Hãy đóng, mở lại ứng dụng rồi thử lại.');
                if (this.handlePlanLimit(data, 'customEffects')) {
                    if (status) status.textContent = 'Gói hiện tại đã đạt giới hạn hiệu ứng cá nhân.';
                    return;
                }
                throw new Error(data.message || data.error || `Không thể đăng ký hiệu ứng. HTTP ${response.status}`);
            }
            if (this.currentUser) {
                this.currentUser.customEffects = [
                    ...(this.currentUser.customEffects || []).filter(effect => effect?.localId !== registerId),
                    { localId: registerId, name, machineId: this.machineId, duration, createdAt: new Date().toISOString() }
                ];
            }
            const controlDeckIndex = Number.isInteger(this.pendingPersonalEffectDeckIndex)
                ? this.pendingPersonalEffectDeckIndex
                : null;
            this.pendingPersonalEffectDeckIndex = null;
            this.closeModal();
            await this.loadOwnedEffects();
            if (this.currentView === 'gift-mapping') await this.loadEffectsForMapping();
            if (controlDeckIndex !== null) {
                const uploadedEffect = (this.personalEffects || []).find((effect) => String(effect._id || effect.id) === registerId);
                if (uploadedEffect) {
                    this.addControlDeckEffectToSlot(uploadedEffect, controlDeckIndex);
                    this.showNotification('success', 'Đã tải hiệu ứng lên máy và thêm vào Live Control.');
                } else {
                    this.showNotification('warning', 'Đã lưu hiệu ứng nhưng chưa thể gán vào Live Control. Hãy chọn lại trong thư viện.');
                }
            } else {
                this.showNotification('success', 'Đã thêm hiệu ứng cá nhân vào mục Gán quà với hiệu ứng.');
            }
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Save personal effect error:', error);
            this.showNotification('error', error.message || 'Không thể lưu hiệu ứng cá nhân.');
            if (status) status.textContent = 'Lưu thất bại. Vui lòng kiểm tra lỗi và thử lại.';
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Tối ưu & lưu hiệu ứng';
                saveBtn.style.opacity = '';
                saveBtn.style.cursor = '';
            }
        }
    }

    async deletePersonalEffect(effectId) {
        if (!confirm('Hiệu ứng sẽ bị xóa vĩnh viễn khỏi máy tính này. Các mapping đang sử dụng hiệu ứng cũng sẽ bị ảnh hưởng. Bạn có chắc muốn xóa?')) return;
        try {
            if (!window.electronAPI?.invoke) return this.showCustomEffectRestartNotice();
            const result = await window.electronAPI.invoke('custom-effects:delete', effectId);
            if (!result?.success) return this.showNotification('error', result?.error || 'Không thể xóa hiệu ứng.');
            await fetch(`${this.API_URL}/api/user/custom-effects/${effectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}` } });
            if (this.currentUser) {
                this.currentUser.customEffects = (this.currentUser.customEffects || []).filter(effect => effect?.localId !== effectId);
            }
            await this.loadOwnedEffects();
            if (this.currentView === 'gift-mapping') await this.loadEffectsForMapping();
            this.showNotification('success', 'Đã xóa hiệu ứng cá nhân khỏi máy.');
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Delete personal effect error:', error);
            this.showNotification('error', 'Không thể xóa hiệu ứng cá nhân.');
        }
    }

    updateUI() {
        this.updateUserUI();
        this.loadTrending();

        const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);

        // Nếu là admin, số lượng sở hữu thực tế có thể khác với danh sách hiển thị (vì admin thấy tất cả)
        // Tuy nhiên để đẹp thì admin vẫn hiện số lượng toàn bộ kho
        document.getElementById('owned-count').textContent = this.ownedEffects.length;

        // Sử dụng giá trị thực tế từ DB thay vì cộng dồn giá tiền (đặc biệt quan trọng với Admin)
        const displaySpent = this.currentUser ? (this.currentUser.totalSpent || 0) : 0;
        document.getElementById('total-spent').textContent = this.formatPrice(displaySpent);

        const displayUses = this.currentUser ? (this.currentUser.totalUses || 0) : 0;
        document.getElementById('total-uses').textContent = displayUses;

        const totalSavings = this.ownedEffects.reduce((sum, e) => {
            const orig = e.originalPrice || e.price || 0;
            const current = e.price || 0;
            return sum + (orig - current);
        }, 0);
        document.getElementById('savings').textContent = this.formatPrice(totalSavings);
        this.renderEffects();
    } // ✅ Đóng updateUI ở đây

    addOwnedEffect(effect) {
        const owned = { ...effect, purchasedAt: new Date().toISOString(), machineId: this.machineId, useCount: 0 };
        this.ownedEffects.push(owned);
        const ownedKey = this.accountStorageKey('es_cache_owned_effects');
        if (ownedKey) localStorage.setItem(ownedKey, JSON.stringify(this.ownedEffects));
    }

    async retryUnauthorized(response, authenticatedRequest, anonymousRequest = null) {
        if (!response || response.status !== 401) return response;
        await this.checkAuth().catch(() => {});
        if (this.authToken && typeof authenticatedRequest === 'function') {
            return authenticatedRequest(this.authToken);
        }
        if (typeof anonymousRequest === 'function') return anonymousRequest();
        return response;
    }
    loadCart() {
        if (this.currentUser) {
            const userId = this.currentUser._id || this.currentUser.id || this.currentUser.email;
            this.cart = JSON.parse(localStorage.getItem(`es_cart_${userId}`) || '[]');
        } else {
            this.cart = [];
        }
        this.updateCartUI();
    }
    saveCart() {
        if (this.currentUser) {
            const userId = this.currentUser._id || this.currentUser.id || this.currentUser.email;
            localStorage.setItem(`es_cart_${userId}`, JSON.stringify(this.cart));
        }
        this.updateCartUI();
    }
    openCart() {
        const sidebar = document.getElementById('cart-sidebar');
        const overlay = document.getElementById('cart-overlay');
        if (sidebar) sidebar.style.right = '0px';
        if (overlay) overlay.style.display = 'block';
    }
    updateCartUI() {
        const count = this.cart.length;
        // Badge trên icon giỏ hàng
        const badge = document.getElementById('cart-count');
        if (badge) badge.textContent = count;
        // Text trong sidebar
        const countText = document.getElementById('cart-count-text');
        if (countText) countText.textContent = `${count} sản phẩm`;
        // Danh sách items
        const list = document.getElementById('cart-items-list');
        const empty = document.getElementById('cart-empty');
        const footer = document.getElementById('cart-footer');
        if (!list) return;
        if (count === 0) {
            if (empty) empty.style.display = 'block';
            if (footer) footer.style.display = 'none';
            // Xóa items cũ (giữ empty state)
            Array.from(list.children).forEach(c => { if (c.id !== 'cart-empty') c.remove(); });
            return;
        }
        if (empty) empty.style.display = 'none';
        if (footer) footer.style.display = 'block';
        // Render items
        const total = this.cart.reduce((s, e) => {
            const actualPrice = (e.isFlashSale && e.flashSalePrice > 0) ? e.flashSalePrice : (e.price || 0);
            return s + actualPrice;
        }, 0);
        const totalEl = document.getElementById('cart-total-price');
        if (totalEl) totalEl.textContent = this.formatPrice(total);
        // Xóa items cũ
        Array.from(list.children).forEach(c => { if (c.id !== 'cart-empty') c.remove(); });
        this.cart.forEach(effect => {
            const id = effect._id || effect.id;
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;';

            const cartItemPrice = (effect.isFlashSale && effect.flashSalePrice > 0) ? effect.flashSalePrice : effect.price;
            const priceColor = effect.isFlashSale ? '#ef4444' : '#d4af37';

            item.innerHTML = `
                        <div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${effect.icon || '🎬'}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${effect.name}</div>
                            <div style="font-size:12px;color:${priceColor};font-weight:700;margin-top:2px;">${this.formatPrice(cartItemPrice)}</div>
                        </div>
                        <button onclick="app.removeFromCart('${id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#ef4444;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
                    `;
            list.appendChild(item);
        });
    }
    addToCart(effectId) {
        const effect = this.effects.find(e => (e.id || e._id) === effectId);
        if (!effect) return;
        if (this.ownedEffects.find(e => (e.id || e._id) === effectId)) { this.showNotification('warning', '⚠️ Bạn đã sở hữu effect này!'); return; }
        if (this.pendingPaymentEffects && this.pendingPaymentEffects.includes(effectId)) { this.showNotification('warning', '⏳ Đang chờ admin duyệt thanh toán!'); return; }
        if (this.cart.find(e => (e.id || e._id) === effectId)) { this.showNotification('warning', '⚠️ Đã có trong giỏ!'); return; }
        this.cart.push(effect);
        this.saveCart();
        this.showNotification('success', `✅ Đã thêm "${effect.name}" vào giỏ!`);
        this.renderEffects();
    }


    // ===== TEXT TO SPEECH (TTS) =====
    loadVoices() {
        // No-op: voice selection has been dropped. Standard Google TTS is used.
    }

    // ===== TEXT TO SPEECH (TTS) =====
    async speakText(text, isTest = false, usageKind = 'tts') {
        if (!text) return;

        let voiceId = 'pNInz6obpgDQGcFmaJgB';
        const voiceSelect = document.querySelector('.ai-assistant-eleven-voice-input');
        if (voiceSelect && voiceSelect.value) {
            voiceId = voiceSelect.value;
        }
        if (voiceId === 'custom') {
            voiceId = document.getElementById('admin-eleven-custom-voice')?.value?.trim() || document.querySelector('.ai-assistant-custom-voice-input')?.value?.trim() || 'pNInz6obpgDQGcFmaJgB';
        }

        const cacheKey = voiceId + '_' + text;
        const persistentAudio = localStorage.getItem('es_voice_cache_' + cacheKey);

        // If audio is cached in localStorage, bypass usage limit checks completely (0 Credit deduction!)
        if (isTest && persistentAudio) {
            this.ttsQueue.push(text);
            if (!this.isProcessingTTS) {
                this.processTTSQueue();
            }
            return;
        }

        try {
            const response = await fetch(`${this.API_URL}/api/tiktok/usage/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ isTest, kind: usageKind === 'comment' ? 'comment' : 'tts' })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                if (isTest) {
                    if (response.status === 409) {
                        this.showNotification('error', 'Giọng đọc đang bận, thử lại sau vài giây.');
                    } else {
                        this.showNotification('error', 'Không thể phát thử giọng đọc.');
                    }
                } else {
                    if (data?.upgradeRequired === true && ['comments', 'tts'].includes(data.feature)) {
                        this._systemVoiceLimitNotified = this._systemVoiceLimitNotified || new Set();
                        if (!this._systemVoiceLimitNotified.has(data.feature)) {
                            this._systemVoiceLimitNotified.add(data.feature);
                            const friendlyMessage = data.feature === 'comments'
                                ? 'Bạn vẫn nhận và xem bình luận bình thường. Gói Free đã dùng hết lượt đọc bình luận bằng giọng hệ thống trong phiên này; Basic sẽ mở đọc không giới hạn.'
                                : 'Gói Free đã dùng hết lượt đọc tên và lời cảm ơn bằng giọng hệ thống trong phiên này. Basic sẽ mở đọc không giới hạn.';
                            this.showNotification('info', friendlyMessage);
                        }
                    } else if (!this.handlePlanLimit(data, usageKind === 'comment' ? 'comments' : 'tts') && response.status !== 409) {
                        this.showNotification('error', data.message || 'Không thể sử dụng TTS lúc này');
                    }
                }
                return;
            }
        } catch (_error) {
            if (isTest) {
                this.showNotification('error', 'Không thể phát thử giọng đọc.');
            } else {
                this.showNotification('error', 'Không thể kiểm tra lượt TTS');
            }
            return;
        }
        this.ttsQueue.push(text);
        if (!this.isProcessingTTS) {
            this.processTTSQueue();
        }
    }

    toggleVariableMenu(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('variable-menu-dropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            const templateDropdown = document.getElementById('template-menu-dropdown');
            if (templateDropdown) templateDropdown.style.display = 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    insertVariable(variable) {
        const textarea = document.getElementById('settings-tts-template');
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + variable + text.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
            this.savePreferences();
        }
        const dropdown = document.getElementById('variable-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    toggleTemplateMenu(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('template-menu-dropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            const variableDropdown = document.getElementById('variable-menu-dropdown');
            if (variableDropdown) variableDropdown.style.display = 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    applyVoiceTemplate(id) {
        let templateText = "";
        switch (id) {
            case 1:
                templateText = "Cảm ơn {username} đã tặng {giftName} ❤️";
                break;
            case 2:
                templateText = "Wow, cảm ơn {username} đã tặng {quantity} {giftName}, tuyệt vời quá!";
                break;
            case 3:
                templateText = "Cảm ơn {username} nha, chúc bạn một ngày thật nhiều niềm vui.";
                break;
            case 4:
                templateText = "Yêu quá, cảm ơn {username} đã tặng quà cho mình nha.";
                break;
            default:
                templateText = "Cảm ơn {username} đã tặng {quantity} {giftName} ❤️";
        }
        const textarea = document.getElementById('settings-tts-template');
        if (textarea) {
            textarea.value = templateText;
            this.savePreferences();
        }
        const dropdown = document.getElementById('template-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    testVoicePreview() {
        this.savePreferences();
        
        const templateText = this.ttsTemplate || 'Cảm ơn {username} đã tặng {quantity} {giftName} ❤️';
        if (!templateText.trim()) {
            this.showNotification('error', 'Vui lòng kiểm tra lại nội dung mẫu thoại.');
            return;
        }

        const processedText = templateText
            .replace(/{username}/g, "Nguyễn Văn A")
            .replace(/{giftName}/g, "Hoa Hồng")
            .replace(/{quantity}/g, "10")
            .replace(/{coin}/g, "10");

        this.speakText(processedText, true);
    }

    toggleFollowVariableMenu(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('follow-variable-menu-dropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            const templateDropdown = document.getElementById('follow-template-menu-dropdown');
            if (templateDropdown) templateDropdown.style.display = 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    insertFollowVariable(variable) {
        const textarea = document.getElementById('settings-tts-follow-template');
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + variable + text.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
            this.savePreferences();
        }
        const dropdown = document.getElementById('follow-variable-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    toggleFollowTemplateMenu(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('follow-template-menu-dropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            const variableDropdown = document.getElementById('follow-variable-menu-dropdown');
            if (variableDropdown) variableDropdown.style.display = 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    applyFollowVoiceTemplate(id) {
        let templateText = "";
        switch (id) {
            case 1:
                templateText = "Cảm ơn {username} đã follow kênh nhé! ❤️";
                break;
            case 2:
                templateText = "Chào mừng {username} đã ghé thăm phòng live của mình!";
                break;
            case 3:
                templateText = "Welcome {username}! Chúc bạn xem live vui vẻ nhé!";
                break;
            default:
                templateText = "Cảm ơn {username} đã follow kênh nhé! ❤️";
        }
        const textarea = document.getElementById('settings-tts-follow-template');
        if (textarea) {
            textarea.value = templateText;
            this.savePreferences();
        }
        const dropdown = document.getElementById('follow-template-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    testFollowVoicePreview() {
        this.savePreferences();
        
        const templateText = this.ttsFollowTemplate || 'Cảm ơn {username} đã follow kênh nhé! ❤️';
        if (!templateText.trim()) {
            this.showNotification('error', 'Vui lòng kiểm tra lại nội dung mẫu thoại.');
            return;
        }

        const processedText = templateText.replace(/{username}/g, "Nguyễn Văn A");

        this.speakText(processedText, true);
    }

    async processTTSQueue() {
        if (this.ttsQueue.length === 0) {
            this.isProcessingTTS = false;
            return;
        }

        this.isProcessingTTS = true;
        const text = this.ttsQueue.shift();

        let voiceId = 'pNInz6obpgDQGcFmaJgB';
        const voiceSelect = document.querySelector('.ai-assistant-eleven-voice-input');
        if (voiceSelect && voiceSelect.value) {
            voiceId = voiceSelect.value;
        }
        if (voiceId === 'custom') {
            voiceId = document.getElementById('admin-eleven-custom-voice')?.value?.trim() || document.querySelector('.ai-assistant-custom-voice-input')?.value?.trim() || 'pNInz6obpgDQGcFmaJgB';
        }

        const cacheKey = voiceId + '_' + text;
        const persistentAudio = localStorage.getItem('es_voice_cache_' + cacheKey);

        if (persistentAudio) {
            console.log('⚡ Phát ngay từ Persistent Audio Cache Local (0đ Credit, 0đ Token):', text);
            try {
                this.currentAudio = new Audio(persistentAudio);
                this.currentAudio.volume = this.ttsVolume;
                this.currentAudio.playbackRate = this.ttsSpeed || 1.0;
                this.currentAudio.onended = () => { this.processTTSQueue(); };
                this.currentAudio.onerror = () => { this.processTTSQueue(); };
                await this.currentAudio.play();
                return;
            } catch (_cacheErr) {
                console.warn('Audio cache playback failed, generating new:', _cacheErr);
            }
        }

        try {
            const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;

            fetch(googleTTSUrl)
                .then(r => r.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = () => {
                        const dataUrl = reader.result;
                        try {
                            localStorage.setItem('es_voice_cache_' + cacheKey, dataUrl);
                        } catch (_e) {}

                    };
                }).catch(() => {});

            this.currentAudio = new Audio(googleTTSUrl);
            this.currentAudio.volume = this.ttsVolume;
            this.currentAudio.playbackRate = this.ttsSpeed || 1.0;

            this.currentAudio.onended = () => {
                this.processTTSQueue();
            };

            this.currentAudio.onerror = () => {
                this.speakWebSpeech(text);
            };

            await this.currentAudio.play().catch(_e => {
                this.speakWebSpeech(text);
            });
            console.log('🗣️ Đang phát Google TTS:', text);
        } catch (error) {
            this.speakWebSpeech(text);
        }
    }

    speakWebSpeech(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.volume = this.ttsVolume || 1.0;
            utterance.rate = this.ttsSpeed || 1.0;
            utterance.onend = () => { this.processTTSQueue(); };
            utterance.onerror = () => { this.processTTSQueue(); };
            window.speechSynthesis.speak(utterance);
            console.log('🗣️ Đang phát Web Speech API (Giọng máy mặc định):', text);
        } else {
            this.processTTSQueue();
        }
    }

    removeFromCart(effectId) { this.cart = this.cart.filter(e => (e.id || e._id) !== effectId); this.saveCart(); this.renderEffects(); this.showNotification('success', '✅ Đã xóa khỏi giỏ!'); }
    async checkout() {
        if (this.cart.length === 0) { this.showNotification('warning', '⚠️ Giỏ trống!'); return; }
        const itemPrice = (effect) => (effect.isFlashSale && Number(effect.flashSalePrice) >= 0)
            ? Number(effect.flashSalePrice)
            : Number(effect.price || 0);
        const freeItems = this.cart.filter(effect => itemPrice(effect) === 0);
        const paidItems = this.cart.filter(effect => itemPrice(effect) > 0);
        const total = paidItems.reduce((sum, effect) => sum + itemPrice(effect), 0);

        try {
            if (freeItems.length) {
                this.showNotification('info', '⏳ Đang thêm hiệu ứng miễn phí vào thư viện...');
                const freeResponse = await fetch(this.API_URL + '/api/payment/claim-free', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.authToken}`
                    },
                    body: JSON.stringify({ effectIds: freeItems.map(effect => effect._id || effect.id) })
                });
                const freeData = await freeResponse.json().catch(() => ({}));
                if (!freeResponse.ok || !freeData.success) {
                    throw new Error(freeData.message || freeData.error || 'Không thể nhận hiệu ứng miễn phí.');
                }
                const freeIds = new Set(freeItems.map(effect => String(effect._id || effect.id)));
                this.cart = this.cart.filter(effect => !freeIds.has(String(effect._id || effect.id)));
                this.saveCart();
                await this.loadOwnedEffects();
                await this.loadEffects();
                this.updateUI();
            }

            if (!paidItems.length) {
                toggleCart();
                this.showNotification('success', '✅ Đã thêm hiệu ứng miễn phí vào thư viện!');
                return;
            }

            const effectIds = paidItems.map(effect => effect._id || effect.id);
            this.pendingEffects = paidItems.map(effect => ({ effectId: effect._id || effect.id, effectName: effect.name, videoPath: `${effect.id}.webm` }));
            this.showNotification('info', '⏳ Đang tạo mã QR...');
            const response = await fetch(this.API_URL + '/api/payment/create-qr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    effectIds
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || data.error || 'Không thể tạo mã QR thanh toán.');
            }

            // Fix: đảm bảo orderId luôn có giá trị
            const orderId = data.orderId || `DH${Date.now()}`;
            const bank = data.bankInfo || {};
            const orderTotal = Number(data.amount ?? bank.amount ?? total);
            const formattedTotal = this.formatPrice(orderTotal);

            this.showModal('Thanh toán', `
                        <div style="font-family:inherit;max-width:480px;margin:0 auto;">

                            <!-- QR Block -->
                            <div style="text-align:center;margin-bottom:20px;">
                                <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:6px 14px;margin-bottom:14px;">
                                    <span style="font-size:14px;">📲</span>
                                    <span style="font-size:13px;color:#10b981;font-weight:600;">Quét QR để thanh toán</span>
                                </div>
                                <div style="background:#fff;border-radius:16px;padding:12px;display:inline-block;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                                    <img src="${data.qrCode}" alt="QR Code" style="width:200px;height:200px;display:block;border-radius:8px;">
                                    <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
                                        <span style="color:#d4145a;font-size:11px;font-weight:800;letter-spacing:0.5px;">VIET</span><span style="color:#00b14f;font-size:11px;font-weight:800;letter-spacing:0.5px;">QR</span>
                                        <span style="color:#bbb;font-size:11px;">•</span>
                                        <span style="color:#555;font-size:12px;font-weight:700;">${bank.bank || 'Techcombank'}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Bank Info -->
                            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);">
                                    <span style="font-size:14px;">🏦</span>
                                    <span style="font-size:13px;font-weight:700;color:#fff;">Thông tin chuyển khoản</span>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:10px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Ngân hàng</span>
                                        <span style="color:#60a5fa;font-weight:700;font-size:13px;">${bank.bank || 'MBBank'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Số TK</span>
                                        <span style="color:#fff;font-weight:700;font-size:14px;letter-spacing:1px;">${bank.accountNumber || '123456789'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Chủ TK</span>
                                        <span style="color:#a78bfa;font-weight:700;font-size:13px;">${bank.accountName || 'NGUYEN VAN A'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                                        <span style="color:#6b7280;font-size:13px;">Số tiền</span>
                                        <span style="color:#d4af37;font-weight:800;font-size:18px;">${formattedTotal}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Nội dung CK</span>
                                        <span style="color:#10b981;font-weight:700;font-size:13px;background:rgba(16,185,129,0.1);padding:3px 10px;border-radius:6px;border:1px solid rgba(16,185,129,0.2);">${bank.description || orderId}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Hướng dẫn -->
                            <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:14px;margin-bottom:16px;">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                                    <span>⚡</span>
                                    <span style="font-size:13px;font-weight:700;color:#fbbf24;">Hướng dẫn:</span>
                                </div>
                                <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                                    <li style="font-size:12px;color:#9ca3af;">Quét QR code bằng app ngân hàng</li>
                                    <li style="font-size:12px;color:#9ca3af;">Kiểm tra số tiền và nội dung chuyển khoản</li>
                                    <li style="font-size:12px;color:#9ca3af;">Chuyển khoản thành công</li>
                                    <li style="font-size:12px;color:#9ca3af;">Nhấn <strong style="color:#fff;">"Xác nhận đã chuyển khoản"</strong> bên dưới</li>
                                    <li style="font-size:12px;color:#a78bfa;">(Không bắt buộc) Gửi ảnh chuyển khoản để được kiểm tra nhanh hơn</li>
                                </ol>
                            </div>

                            <!-- Upload ảnh (tùy chọn) -->
                            <div style="margin-bottom:16px;">
                                <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                    📎 Chọn ảnh chuyển khoản
                                    <span style="font-size:10px;background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);padding:2px 7px;border-radius:20px;font-weight:600;">Không bắt buộc</span>
                                </label>
                                <div style="border:2px dashed rgba(255,255,255,0.10);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;transition:border-color 0.2s;"
                                    onmouseover="this.style.borderColor='rgba(167,139,250,0.35)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.10)'">
                                    <input type="file" id="payment-proof-input" accept="image/*" style="display:none;" onchange="app.previewPaymentProof(this)">
                                    <button onclick="document.getElementById('payment-proof-input').click()" style="padding:8px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#9ca3af;cursor:pointer;font-size:12px;white-space:nowrap;">Chọn ảnh</button>
                                    <span id="payment-proof-name" style="font-size:12px;color:#6b7280;">Chưa chọn file</span>
                                </div>
                                <div id="payment-proof-preview" style="display:none;margin-top:10px;text-align:center;">
                                    <img id="payment-proof-img" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
                                </div>
                                <p style="font-size:11px;color:#4b5563;margin-top:6px;">Ảnh giúp admin xác thực nhanh hơn (10-30 phút)</p>
                            </div>

                            <!-- Auto status -->
                            <div id="payment-status-indicator" style="padding:10px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);color:#10b981;font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
                                <span>⏳</span> Đang chờ xác nhận thanh toán...
                            </div>

                            <!-- Buttons -->
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${orderTotal})" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:all 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(124,58,237,0.5)'"
                                    onmouseout="this.style.transform='';this.style.boxShadow=''">
                                    ✅ Xác nhận đã chuyển khoản
                                </button>
                                <button onclick="app.closeModal()" style="width:100%;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#6b7280;font-size:13px;cursor:pointer;">Đóng</button>
                            </div>
                        </div>
                    `);

            // Bắt đầu Polling trạng thái đơn hàng
            this.startPaymentPolling(orderId, effectIds, orderTotal);

        } catch (error) {
            console.error('Checkout error:', error);
            this.showNotification('error', '❌ Lỗi thanh toán: ' + error.message);
        }
    }
    previewPaymentProof(input) {
        const file = input.files[0];
        if (!file) return;
        const nameEl = document.getElementById('payment-proof-name');
        const preview = document.getElementById('payment-proof-preview');
        const img = document.getElementById('payment-proof-img');
        if (nameEl) nameEl.textContent = file.name;
        if (preview && img) {
            const reader = new FileReader();
            reader.onload = e => { img.src = e.target.result; preview.style.display = 'block'; };
            reader.readAsDataURL(file);
        }
    }
    async confirmPaymentWithProof(orderId, total) {
        const input = document.getElementById('payment-proof-input');
        const hasProof = input && input.files && input.files[0];
        try {
            const btn = event.target;
            btn.textContent = '⏳ Đang gửi...'; btn.disabled = true;
            const formData = new FormData();
            if (hasProof) formData.append('proof', input.files[0]);
            formData.append('orderId', orderId);
            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            const res = await fetch(this.API_URL + '/api/payment/confirm', {
                method: 'POST', body: formData, headers
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Không thể xác nhận thanh toán.');
            const indicator = document.getElementById('payment-status-indicator');
            if (indicator) {
                indicator.style.background = 'rgba(16,185,129,0.15)';
                indicator.style.borderColor = 'rgba(16,185,129,0.4)';
                indicator.innerHTML = hasProof
                    ? '✅ Đã gửi kèm ảnh! Admin sẽ duyệt trong 5-30 phút.'
                    : '✅ Đã gửi yêu cầu! Admin sẽ kiểm tra sao kê trong 1-24h.';
            }
            btn.textContent = '✅ Đã gửi thành công!';
            const msg = hasProof
                ? '✅ Gửi kèm ảnh! Admin duyệt trong 5-30 phút.'
                : '✅ Đã gửi! Admin kiểm tra sao kê trong 1-24h.';
            this.showNotification('success', msg);

            // Thêm vào danh sách chờ duyệt
            const cartIds = this.cart.map(e => e._id || e.id);
            this.pendingPaymentEffects.push(...cartIds);
            this.pendingPaymentEffects = [...new Set(this.pendingPaymentEffects)];
            this.savePendingPaymentEffects();

            // Xóa giỏ hàng
            this.cart = [];
            this.saveCart();
            this.updateCartUI();
            this.renderEffects(); // Cập nhật nút thành Đang chờ duyệt

            // Tự động đóng form sau 2.5 giây
            setTimeout(() => {
                this.closeModal();
            }, 2500);

        } catch (err) {
            this.showNotification('error', '❌ Lỗi gửi: ' + err.message);
        }
    }

    startPaymentPolling(orderId, effectIds, amount) {
        if (this.paymentInterval) clearInterval(this.paymentInterval);
        let attempts = 0;

        this.paymentInterval = setInterval(async () => {
            attempts++;
            // Dừng sau 10 phút (200 lần)
            if (attempts > 200 || !document.getElementById('modal-overlay').classList.contains('show')) {
                clearInterval(this.paymentInterval);
                return;
            }

            try {
                const res = await fetch(`${this.API_URL}/api/payment/status/${orderId}`, {
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                });
                const data = await res.json();
                if (data.success && data.status === 'approved') {
                    clearInterval(this.paymentInterval);
                    const indicator = document.getElementById('payment-status-indicator');
                    if (indicator) {
                        indicator.style.background = '#10b981';
                        indicator.style.color = '#000';
                        indicator.innerHTML = '🎉 Thanh toán thành công!';
                    }
                    setTimeout(() => {
                        this.completePurchase(effectIds, amount);
                    }, 1500);
                }
            } catch (e) { console.error('Polling error:', e); }
        }, 3000);
    }

    async simulatePayment(orderId, amount) {
        try {
            await fetch(this.API_URL + '/api/payment/sepay-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: orderId, transferAmount: amount })
            });
            this.showNotification('info', 'Đã bắn webhook giả lập!');
        } catch (e) {
            console.error('Simulate err:', e);
        }
    }
    async completePurchase(effectIds, amount) {
        // Xóa khỏi danh sách chờ duyệt
        this.pendingPaymentEffects = this.pendingPaymentEffects.filter(id => !effectIds.includes(id));
        this.savePendingPaymentEffects();

        // Thêm vào ownedEffects từ danh sách tổng (vì cart đã bị xóa trước đó)
        effectIds.forEach(id => {
            const effect = this.effects.find(e => (e._id || e.id) === id);
            if (effect) this.addOwnedEffect(effect);
        });

        // Xử lý Setup OBS nếu có
        if (this.pendingEffects && this.pendingEffects.length > 0) {
            for (const effect of this.pendingEffects) {
                try {
                    await fetch(this.API_URL + '/api/obs/setup-effect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(effect)
                    });
                } catch (error) { console.error(`Setup error: ${effect.effectName}`, error); }
            }
            this.pendingEffects = null;
        }

        // Lưu lịch sử
        const history = JSON.parse(localStorage.getItem('es_purchase_history') || '[]');
        history.push({ date: new Date().toISOString(), items: effectIds, total: amount });
        localStorage.setItem('es_purchase_history', JSON.stringify(history));

        // Quan trọng: Tải lại dữ liệu từ server để cập nhật Rank Pro/Business
        await this.checkAuth();
        await this.loadOwnedEffects();

        this.cart = [];
        this.saveCart();
        this.closeModal();
        this.updateUI();
        this.showNotification('success', '🎉 Chúc mừng! Đơn hàng đã được kích hoạt thành công.');
    }
    async previewEffectOnOBS(effectId, playbackOptions = {}) {
        const button = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : null;
        const originalText = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.textContent = 'Đang chuẩn bị...';
        }

        try {
            const response = await fetch(this.API_URL + '/api/obs/preview-effect-player', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ effectId, ...playbackOptions })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || data.error || 'OBS hoặc trình phát hiệu ứng chưa sẵn sàng. Hãy kiểm tra kết nối rồi thử lại.');
            }
            this.showNotification('success', Number(data.queueLength) > 0
                ? `Đã thêm vào hàng chờ (${data.queueLength} hiệu ứng đang chờ)`
                : 'Đang phát hiệu ứng trên OBS');
            return true;
        } catch (error) {
            console.error('Effect player preview error:', error);
            this.showNotification('error', error.message || 'Không thể xem thử trên OBS.');
            return false;
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
    }

    async triggerEffect(effectId) {
        return this.previewEffectOnOBS(effectId);
    }

    // Retained temporarily for rollback/reference only. No Store or My Effects UI calls it.
    async _legacyPreviewTriggerDoNotUse(effectId) {
        console.log('🎬 Trigger:', effectId);
        this.showNotification('info', '🎬 Đang kích hoạt effect...');

        try {
            // Personal/custom effects (uploaded from the app or via the
            // phone Live Control remote) only ever live in personalEffects —
            // skipping it here meant this fallback could never find a
            // custom effect's real duration and always showed "Hiệu ứng
            // chưa có thời lượng hợp lệ" instead of the actual failure.
            const effect = this.ownedEffects.find(e => (e.id || e._id) === effectId) ||
                this.effects.find(e => (e.id || e._id) === effectId) ||
                this.personalEffects.find(e => (e.id || e._id) === effectId);

            if (effect?.isCustom) {
                this.showModal(`Xem thử: ${effect.name}`, `<div style="display:flex;justify-content:center;min-height:420px;"><video src="${effect.previewUrl}" autoplay controls playsinline style="width:100%;max-height:70vh;object-fit:contain;background:transparent;"></video></div>`);
                this.showNotification('success', 'Đang xem thử trên app. OBS không được kích hoạt.');
                return;
            }

            let webcamSourceName = null;
            if (effect && effect.isComposite && this.authToken) {
                try {
                    const sourcesRes = await fetch(this.API_URL + '/api/obs/sources', {
                        headers: { 'Authorization': `Bearer ${this.authToken}` }
                    });
                    if (sourcesRes.ok) {
                        const sourcesData = await sourcesRes.json();
                        if (sourcesData.success && sourcesData.sources.length > 0) {
                            const webcams = sourcesData.sources.filter(s => s.isWebcam);
                            if (webcams.length > 0) {
                                webcamSourceName = webcams[0].name;
                                console.log(`📹 Auto-selected webcam: ${webcamSourceName}`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Cannot fetch OBS sources without auth or error', e);
                }
            }

            const endpoint = (effect && effect.isComposite && webcamSourceName)
                ? this.API_URL + '/api/obs/trigger-with-duplicate'
                : this.API_URL + '/api/obs/trigger';
            const duration = Number(effect?.duration);
            if (!Number.isFinite(duration) || duration <= 0) {
                this.showNotification('warning', 'Hiệu ứng chưa có thời lượng hợp lệ nên không thể chạy thử.');
                return;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    effectId,
                    duration,
                    effectName: effect?.name || effectId,
                    webcamSourceName: webcamSourceName
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('success', '✅ Effect đã được kích hoạt!');
                const ownedEffect = this.ownedEffects.find(e => (e.id || e._id) === effectId);
                if (ownedEffect) {
                    ownedEffect.useCount = (ownedEffect.useCount || 0) + 1;
                    const ownedKey = this.accountStorageKey('es_cache_owned_effects');
                    if (ownedKey) localStorage.setItem(ownedKey, JSON.stringify(this.ownedEffects));
                }
            } else {
                this.showNotification('error', '❌ ' + (data.error || data.message));
            }
        } catch (error) {
            console.error('Trigger error:', error);
            this.showNotification('error', '❌ Lỗi: ' + error.message);
        }
    }
    handleThumbError(imgEl) {
        if (!imgEl) return;
        imgEl.style.display = 'none';
        const parent = imgEl.parentElement;
        if (parent) {
            const video = parent.querySelector('.effect-video');
            if (video) video.style.opacity = '1';
        }
    }
    handlePreviewError(videoEl) {
        if (!videoEl) return;
        videoEl.style.display = 'none';
        videoEl.setAttribute('data-error', 'true');
        const parent = videoEl.parentElement;
        if (parent) {
            const img = parent.querySelector('.effect-thumb-img');
            if (img && img.style.display !== 'none') img.style.opacity = '1';
        }
    }
    renderEffects(filter = null, search = '') {
        if (!filter) {
            if (this.currentView === 'library') {
                filter = 'all';
            } else {
                const active = document.querySelector('.filter-btn-new.active');
                if (active) {
                    const match = active.getAttribute('onclick')?.match(/'([^']+)'/);
                    filter = match ? match[1] : 'all';
                } else {
                    filter = 'all';
                }
            }
        }
        const storeGrid = document.getElementById('effects-grid');
        const libraryGrid = document.getElementById('library-grid');
        const flashSaleGrid = document.getElementById('flash-sale-effects');

        if (this.currentView === 'store') {
            // Packaged goal-board combos are sold only from the Gift Menu Designer's
            // own "Mục tiêu" tab, never browsable in the Store grid. Filter only the
            // display list here — this.storeEffects/this.effects must keep the full
            // data, since addToCart()/showEffectDetail() still look items up there
            // when the Designer's own buy button adds one to the cart.
            const isHiddenFromStore = (e) => e.category === 'menu_template' && e.isWidgetTemplate;
            if (storeGrid) {
                const visibleStoreEffects = this.storeEffects.filter(e => !isHiddenFromStore(e));
                this._renderGrid(storeGrid, visibleStoreEffects, filter, search, 'store');
            }
            if (flashSaleGrid) {
                const flashEffects = this.storeEffects.filter(e => {
                    const now = new Date();
                    const endsAt = e.flashSaleEndsAt ? new Date(e.flashSaleEndsAt) : null;
                    return e.isFlashSale && endsAt && endsAt > now;
                }).filter(e => !isHiddenFromStore(e));
                this._renderGrid(flashSaleGrid, flashEffects, 'all', '', 'store');
            }
            this.startMiniFlashSaleTimers();
        }
        if (this.currentView === 'library' && libraryGrid) {
            console.log('📚 Rendering Library:', this.ownedEffects);
            this._renderGrid(libraryGrid, this.ownedEffects, filter, search, 'library');
        }
    }

    startMiniFlashSaleTimers() {
        if (this.miniFSTimersInterval) clearInterval(this.miniFSTimersInterval);

        const updateTimers = () => {
            const timers = document.querySelectorAll('.fs-mini-timer');
            if (timers.length === 0 && this.miniFSTimersInterval) {
                clearInterval(this.miniFSTimersInterval);
                return;
            }

            const now = new Date().getTime();
            timers.forEach(timer => {
                const endsAtStr = timer.getAttribute('data-ends');
                if (!endsAtStr) return;

                const endsAt = new Date(endsAtStr).getTime();
                const distance = endsAt - now;
                const textSpan = timer.querySelector('.fs-time-text');
                const hBlock = timer.querySelector('.time-h');
                const mBlock = timer.querySelector('.time-m');
                const sBlock = timer.querySelector('.time-s');

                if (distance < 0) {
                    if (textSpan && textSpan.innerText !== 'HẾT HẠN') {
                        textSpan.innerText = 'HẾT HẠN';
                        if (hBlock) { hBlock.innerText = '00'; mBlock.innerText = '00'; sBlock.innerText = '00'; }
                        // Tự động render lại để ẩn khung Flash Sale
                        console.log('⚡ Flash Sale expired, re-rendering...');
                        this.renderEffects();
                    }
                    return;
                }

                const hours = Math.floor(distance / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);

                const hStr = String(hours).padStart(2, '0');
                const mStr = String(minutes).padStart(2, '0');
                const sStr = String(seconds).padStart(2, '0');

                if (textSpan) {
                    textSpan.innerText = `${hStr}:${mStr}:${sStr}`;
                }
                if (hBlock && mBlock && sBlock) {
                    hBlock.innerText = hStr;
                    mBlock.innerText = mStr;
                    sBlock.innerText = sStr;
                }
            });
        };

        updateTimers();
        this.miniFSTimersInterval = setInterval(updateTimers, 1000);
    }

    _renderGrid(grid, effects, filter, search, viewName) {
        const usageSignature = this.menuTemplateUsage
            ? Array.from(this.menuTemplateUsage.entries()).filter(([, used]) => used).map(([id]) => id).sort().join(',')
            : '';
        const contentSignature = (effects || []).map(effect => {
            if (!effect || typeof effect !== 'object') return String(effect || '');
            return [effect._id || effect.id, effect.category, effect.price, effect.previewUrl, effect.thumbUrl, effect.fileUrl, effect.isOwned === true ? 'owned' : 'available'].join(':');
        }).join('|');
        const ownershipSignature = (this.ownedEffects || [])
            .map(effect => String(effect?._id || effect?.id || ''))
            .filter(Boolean)
            .sort()
            .join(',');
        const cartSignature = (this.cart || [])
            .map(effect => String(effect?._id || effect?.id || ''))
            .filter(Boolean)
            .sort()
            .join(',');
        const pendingSignature = (this.pendingPaymentEffects || [])
            .map(String)
            .sort()
            .join(',');
        const cacheKey = `_hasRendered_${viewName}_${contentSignature}_${usageSignature}_${ownershipSignature}_${cartSignature}_${pendingSignature}`;
        
        if (!grid[cacheKey]) {
            grid[cacheKey] = true;
            // Clear other cache keys
            Object.keys(grid).forEach(k => {
                if (k.startsWith('_hasRendered_') && k !== cacheKey) {
                    delete grid[k];
                }
            });

            grid.innerHTML = (effects || []).map(effect => {
                if (!effect) return '';
                const effectId = effect._id || effect.id || effect;
                if (typeof effect !== 'object') {
                    return `<div class="effect-card pending" style="padding:20px; text-align:center; color:var(--text-muted);">
                                <div style="font-size:24px; margin-bottom:10px;">⏳</div>
                                <div style="font-size:12px;">Đang tải dữ liệu hiệu ứng...</div>
                                <div style="font-size:10px; opacity:0.5; margin-top:5px;">ID: ${effect}</div>
                            </div>`;
                }

                const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
                const isBusiness = this.currentUser && ['pro', 'studio'].includes(resolvePlanKey(this.currentUser));
                const hasPurchased = effect.isOwned === true ||
                    this.ownedEffects.some(e => String(e.id || e._id) === String(effectId));

                const isOwned = isAdmin || isBusiness || hasPurchased;
                const isPending = this.pendingPaymentEffects.includes(effectId);

                let previewHTML = '';
                const resolveMediaUrl = value => this.resolveCatalogMediaUrl(value);
                const thumbUrl = effect.thumbUrl ? resolveMediaUrl(effect.thumbUrl) : '';
                const videoUrl = resolveMediaUrl(effect.previewUrl || effect.fileUrl);
                const fallbackIcon = effect.icon || '🎬';
                const effectiveVideo = videoUrl || (effectId ? resolveMediaUrl(`/api/stream/effect/${effectId}`) : '');

                if (effect.category === 'menu_template') {
                    previewHTML = `
                                <div id="store-template-preview-${effect.fileUrl}" class="store-template-preview-card" onclick="app.showEffectDetail('${effectId}')" style="position: absolute; inset: 0; background:#090d16; display:flex; align-items:center; justify-content:center; overflow: hidden; cursor: pointer; border-radius: 12px 12px 0 0;">
                                    <div style="font-size:12px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i></div>
                                </div>
                            `;
                } else if (thumbUrl) {
                    previewHTML = `
                                <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')"
                                    onmouseenter="const v=this.querySelector('video'); if(v && v.getAttribute('data-error')!=='true') { v.play().catch(e=>{}); }" 
                                    onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                                    <img src="${thumbUrl}" class="effect-thumb-img" onerror="app.handleThumbError(this)">
                                    ${effectiveVideo ? `<video src="${effectiveVideo}" class="effect-video" muted loop playsinline preload="metadata" onerror="app.handlePreviewError(this)"></video>` : ''}
                                </div>
                            `;
                } else if (effectiveVideo) {
                    previewHTML = `
                                <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')"
                                    onmouseenter="const v=this.querySelector('video'); if(v && v.getAttribute('data-error')!=='true') { v.play().catch(e=>{}); }" 
                                    onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                                    <video src="${effectiveVideo}" class="effect-video" style="opacity:1;" muted loop playsinline preload="metadata" onerror="app.handlePreviewError(this)"></video>
                                </div>
                            `;
                } else {
                    previewHTML = `
                                <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')" style="background:#0b1220;"></div>
                            `;
                }

                let btnClass = 'btn-add-cart';
                let btnAction = `app.addToCart('${effectId}')`;
                let btnText = '🛒 Thêm vào giỏ';
                let borderCol = 'transparent';

                const isInCart = this.cart.some(item => (item.id || item._id) === effectId);

                let isFlashSaleActive = false;
                if (effect.isFlashSale && viewName === 'store') {
                    const now = new Date();
                    const endsAt = effect.flashSaleEndsAt ? new Date(effect.flashSaleEndsAt) : null;
                    if (endsAt && endsAt > now) {
                        isFlashSaleActive = true;
                    }
                }

                if (isOwned) {
                    btnClass += ' btn-owned';
                    if (effect.category === 'menu_template') {
                        btnAction = `app.useMenuTemplateFromStore('${effect.fileUrl}')`;
                        btnText = '🛠️ Mở thiết kế';
                    } else {
                        btnAction = `app.triggerEffect('${effectId}')`;
                        btnText = '▶ Xem thử trên OBS';
                    }
                    borderCol = isFlashSaleActive ? '#ef4444' : 'var(--success)';
                } else if (isPending) {
                    btnClass += ' btn-pending';
                    btnAction = 'void(0)';
                    btnText = '⏳ Đang chờ duyệt';
                    borderCol = 'rgba(212, 175, 55, 0.5)';
                } else if (isInCart) {
                    btnClass += ' btn-in-cart';
                    btnAction = 'app.openCart()';
                    btnText = '🛒 Đã thêm vào giỏ';
                    borderCol = '#ec4899';
                } else if (isFlashSaleActive) {
                    borderCol = '#ef4444';
                    btnClass = 'btn-flash-sale';
                    btnText = '⚡ MUA NGAY (GIÁ SỐC)';
                }

                if (effect.isCustom) {
                    btnAction = `app.triggerEffect('${effectId}')`;
                    btnText = '▶ Xem thử trên OBS';
                }

                let originalPriceHTML = '';
                let currentPrice = effect.price;
                let origPrice = effect.originalPrice || effect.price;

                if (isFlashSaleActive) {
                    if (effect.flashSalePrice > 0) {
                        currentPrice = effect.flashSalePrice;
                        origPrice = effect.price;
                    }
                    const discount = Math.round((1 - currentPrice / origPrice) * 100);
                    const endsAt = effect.flashSaleEndsAt;

                    let countdownHTML = '';
                    if (endsAt) {
                        countdownHTML = `<div class="fs-card-timer fs-mini-timer" data-ends="${endsAt}">
                                    <span class="fs-time-block time-h">00</span>
                                    <span class="fs-time-sep">:</span>
                                    <span class="fs-time-block time-m">00</span>
                                    <span class="fs-time-sep">:</span>
                                    <span class="fs-time-block time-s">00</span>
                                    <span class="fs-time-text" style="display: none;">--:--:--</span>
                                </div>`;
                    }

                    let activeBtnClass = 'btn-fs-buy';
                    let activeBtnAction = `app.addToCart('${effectId}')`;
                    let activeBtnText = '<i class="fas fa-shopping-cart"></i> MUA NGAY';

                    if (isInCart) {
                        activeBtnClass = 'btn-add-cart btn-in-cart';
                        activeBtnAction = 'app.openCart()';
                        activeBtnText = '🛒 Đã thêm vào giỏ';
                    } else if (isOwned) {
                        activeBtnClass = 'btn-add-cart btn-owned';
                        activeBtnAction = `app.triggerEffect('${effectId}')`;
                        activeBtnText = '▶ Xem thử trên OBS';
                    } else if (isPending) {
                        activeBtnClass = 'btn-add-cart btn-pending';
                        activeBtnAction = 'void(0)';
                        activeBtnText = '⏳ Đang chờ duyệt';
                    }

                    return `<div class="effect-card flash-sale-card" style="position: relative; border: 2px solid #ff3e3e; box-shadow: 0 0 20px rgba(255,62,62,0.35); animation: borderPulse 2s infinite;" data-cat="${effect.category}" data-price="${currentPrice}" data-name="${effect.name}">
                                <div style="position: absolute; top: -12px; left: 0; right: 0; display: flex; justify-content: center; z-index: 11;">
                                    <div style="background: linear-gradient(90deg, #ff3e3e, #ff8c00); box-shadow: 0 4px 12px rgba(255,62,62,0.5); border-radius: 8px; padding: 4px 12px; color: white; font-weight: 900; font-size: 11px; display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.2);">
                                        <i class="fas fa-bolt"></i> FLASH SALE <span style="background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 4px; margin-left: 4px;">-${discount}%</span>
                                    </div>
                                </div>
                                ${effect.isTrending ? `<div class="hot-badge" style="position:absolute; top:10px; right:10px; background:linear-gradient(45deg, #f093fb 0%, #f5576c 100%); color:white; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; z-index:10; box-shadow:0 4px 15px rgba(245,87,108,0.4);"><i class="fas fa-fire"></i> HOT</div>` : ''}
                                
                                <div class="effect-thumbnail">
                                    ${previewHTML}
                                </div>

                                <div class="effect-info">
                                    <div class="effect-name" style="font-weight: 700; color: white;">${effect.name}</div>
                                    <div class="effect-price-row" style="margin-bottom: 5px;">
                                        <div style="display: flex; align-items: baseline; gap: 8px;">
                                            <span class="price-current" style="color: #ffcc00; font-weight: 900; font-size: 26px; text-shadow: 0 0 20px rgba(255,204,0,0.6); letter-spacing: -0.5px;">${this.formatPrice(currentPrice)}</span>
                                            <span class="price-original" style="text-decoration: line-through; color: rgba(255,255,255,0.3); font-size: 13px; font-weight: 500;">${this.formatPrice(origPrice)}</span>
                                        </div>
                                        <span class="duration-badge">${Number(effect.duration || 0).toFixed(1)}s</span>
                                    </div>
                                    ${countdownHTML}
                                    <button class="${activeBtnClass}" onclick="${activeBtnAction}">${activeBtnText}</button>
                                </div>
                            </div>`;
                }

                if (effect.originalPrice && effect.originalPrice > effect.price) {
                    originalPriceHTML = `<span class="price-original" style="text-decoration: line-through; color: #9ca3af; font-size: 11px; margin-left: 6px; font-weight: 500; opacity: 0.6;">${this.formatPrice(effect.originalPrice)}</span>`;
                }

                const cardClass = `effect-card ${isOwned ? 'owned' : ''} ${isPending ? 'pending' : ''}`;
                const priceColor = 'var(--accent)';
                const templateKindBadge = effect.category === 'menu_template'
                    ? (effect.isWidgetTemplate
                        ? `<div class="template-kind-badge" title="Chỉ thêm vào thiết kế hiện tại, không thay cả bảng" style="position:absolute; top:10px; left:10px; background:rgba(8,145,178,0.85); color:white; padding:3px 7px; border-radius:6px; font-size:9px; font-weight:800; z-index:10;">🧩 Mảnh ghép</div>`
                        : `<div class="template-kind-badge" title="Thay thế toàn bộ bảng đang thiết kế" style="position:absolute; top:10px; left:10px; background:rgba(124,58,237,0.85); color:white; padding:3px 7px; border-radius:6px; font-size:9px; font-weight:800; z-index:10;">📦 Mẫu đầy đủ</div>`)
                    : '';

                return `<div class="${cardClass}" style="position: relative;" data-cat="${effect.category}" data-price="${currentPrice}" data-name="${effect.name}">
                            ${templateKindBadge}
                            ${effect.isTrending ? `<div class="hot-badge" style="position:absolute; top:10px; right:10px; background:linear-gradient(45deg, #f093fb 0%, #f5576c 100%); color:white; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; z-index:10; box-shadow:0 4px 15px rgba(245,87,108,0.4);"><i class="fas fa-fire"></i> HOT</div>` : ''}
                            <div class="effect-thumbnail">
                                ${previewHTML}
                            </div>
                            <div class="effect-info">
                                <div class="effect-name">${effect.name || 'Hiệu ứng không tên'}</div>
                                ${viewName === 'library' ? `
                                <div class="effect-price-row" style="margin-bottom: 5px;">
                                    <div style="display: flex; align-items: baseline;">
                                        <span class="price-current" style="color: var(--success); font-weight: 600; font-size: 13px;"><i class="fas fa-check-circle" style="margin-right: 4px;"></i> Đã sở hữu</span>
                                    </div>
                                    <span class="duration-badge">${Number(effect.duration || 0).toFixed(1)}s</span>
                                </div>
                                ` : `
                                <div class="effect-price-row" style="margin-bottom: 5px;">
                                    <div style="display: flex; align-items: baseline;">
                                        <span class="price-current" style="color: ${priceColor}; font-weight: 800; font-size: 15px;">${this.formatPrice(currentPrice)}</span>
                                        ${originalPriceHTML}
                                    </div>
                                    <span class="duration-badge">${Number(effect.duration || 0).toFixed(1)}s</span>
                                </div>
                                `}
                                <button class="${btnClass}" onclick="${btnAction}">${btnText}</button>
                                ${effect.isCustom && viewName === 'library' ? `<button onclick="app.deletePersonalEffect('${effectId}')" style="margin-top:7px;width:100%;padding:7px;border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#fca5a5;cursor:pointer;">Xóa khỏi máy</button>` : ''}
                            </div>
                        </div>`;
            }).join('');

            // Hover handles
            const containers = grid.querySelectorAll('.effect-thumb-container');
            containers.forEach(container => {
                const video = container.querySelector('video');
                if (video) {
                    container.addEventListener('mouseenter', () => {
                        video.currentTime = 0;
                        video.play().catch(err => {
                            if (err.name !== 'AbortError') console.error('Video play error:', err);
                        });
                    });
                    container.addEventListener('mouseleave', () => {
                        video.pause();
                        video.currentTime = 0;
                    });
                }
            });

            // Card template previews rendering
            const cardPreviews = grid.querySelectorAll('.store-template-preview-card');
            cardPreviews.forEach(container => {
                const templateId = container.id.replace('store-template-preview-', '');
                this.renderTemplatePreviewInCard(container, templateId);
            });
        }

        // Apply DOM visibility filtering based on filter & search query
        const cards = grid.querySelectorAll('.effect-card');
        let visibleCount = 0;
        cards.forEach(card => {
            const cat = card.getAttribute('data-cat');
            const price = Number(card.getAttribute('data-price')) || 0;
            const name = (card.getAttribute('data-name') || '').toLowerCase();

            let match = true;
            if (filter && filter !== 'all') {
                if (filter === 'free') {
                    match = (price === 0);
                } else {
                    match = (cat === filter);
                }
            }
            if (match && search) {
                match = name.includes(search.toLowerCase());
            }

            card.style.display = match ? 'flex' : 'none';
            if (match) visibleCount++;
        });

        // Toggle Empty state view
        let emptyState = grid.querySelector('.empty-state');
        if (visibleCount === 0) {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.style.cssText = 'grid-column:1/-1;text-align:center;padding:80px 20px;';
                emptyState.innerHTML = `<div class="empty-icon" style="font-size:64px;margin-bottom:20px;">${viewName === 'library' ? '📚' : '🔍'}</div><h3 style="color:var(--text-secondary);font-size:18px;margin-bottom:10px;">${viewName === 'library' ? 'Chưa có hiệu ứng nào' : 'Không tìm thấy hiệu ứng'}</h3><p style="color:var(--text-muted);">${viewName === 'library' ? 'Hãy mua hiệu ứng từ cửa hàng để sở hữu' : 'Thử tìm với từ khóa khác'}</p>`;
                grid.appendChild(emptyState);
            } else {
                emptyState.style.display = 'block';
            }
        } else {
            if (emptyState) emptyState.style.display = 'none';
        }
    }
    getCategoryName(cat) {
        return {
            transformation: 'Biến hình', gift: 'Quà tặng',
            background: 'Phông nền', animation: 'Hoạt ảnh',
            pk: 'PK', meme: 'Meme', team_heart: 'Tym đội',
            menu_template: 'Mẫu Menu Quà'
        }[cat] || cat;
    }
    formatPrice(price) { return new Intl.NumberFormat('vi-VN').format(price) + '₫'; }
    resolveCatalogMediaUrl(value) {
        const raw = String(value || '').trim();
        if (!raw || /^data:|^blob:/i.test(raw)) return raw;
        if (/^https?:\/\//i.test(raw)) return raw;
        // Protected playback routes read media from the desktop backend's local
        // library. Render's ephemeral filesystem does not contain these files,
        // so resolving them against CLOUD_API_URL produces a 404.
        const isLocalPlaybackRoute = /^\/api\/(?:stream\/effect\/|obs\/effect-player-media\/)/i.test(raw);
        const baseUrl = isLocalPlaybackRoute ? this.API_URL : this.CLOUD_API_URL;
        try {
            return new URL(raw, baseUrl).toString();
        } catch (_error) {
            return `${String(baseUrl || '').replace(/\/+$/, '')}${raw.startsWith('/') ? '' : '/'}${raw}`;
        }
    }
    showNotification(type, message) { const n = document.getElementById('notification'); document.getElementById('notification-icon').textContent = type === 'warning' ? '⚠️' : type === 'error' ? '❌' : '✅'; document.getElementById('notification-message').textContent = message; n.className = 'notification show ' + type; setTimeout(() => n.classList.remove('show'), 4000); }
    showModal(title, content) {
        // Đóng cart sidebar nếu đang mở
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartSidebar) cartSidebar.style.right = '-420px';
        if (cartOverlay) cartOverlay.style.display = 'none';
        // Hiện modal
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal-actions').innerHTML = '';
        document.getElementById('modal-overlay').classList.add('show');
    }
    closeModal() {
        document.getElementById('modal-overlay').classList.remove('show');
        if (this.paymentInterval) { clearInterval(this.paymentInterval); this.paymentInterval = null; }
        this._manualUpdateCheck = false;
    }

    showEffectDetail(effectId) {
        const effect = this.ownedEffects.find(e => String(e.id || e._id) === String(effectId)) ||
            this.effects.find(e => String(e.id || e._id) === String(effectId));
        if (!effect) return;

        const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
        const isBusiness = this.currentUser && this.currentUser.subscription === 'business';
        const hasPurchased = effect.isOwned === true ||
            this.ownedEffects.some(e => String(e.id || e._id) === String(effectId));
        const isOwned = isAdmin || isBusiness || hasPurchased;
        const videoUrl = this.resolveCatalogMediaUrl(effect.previewUrl);

        document.getElementById('detail-name').textContent = `${effect.icon || '🎬'} ${effect.name}`;
        const templateKindSuffix = effect.category === 'menu_template'
            ? (effect.isWidgetTemplate ? ' · 🧩 Mảnh ghép (thêm vào thiết kế hiện tại)' : ' · 📦 Mẫu đầy đủ (thay cả bảng)')
            : '';
        document.getElementById('detail-category').textContent = this.getCategoryName(effect.category) + templateKindSuffix;
        document.getElementById('detail-price').textContent = isOwned ? 'Đã Sở Hữu' : this.formatPrice(effect.price);
        document.getElementById('detail-original-price').textContent = effect.originalPrice > effect.price ? this.formatPrice(effect.originalPrice) : '';
        document.getElementById('detail-desc-text').textContent = effect.description || 'Không có mô tả chi tiết.';

        const videoEl = document.getElementById('detail-video-player');
        let previewContainer = document.getElementById('detail-template-preview');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'detail-template-preview';
            previewContainer.className = 'detail-template-preview';
            previewContainer.setAttribute('style', `
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #090d16;
                border-radius: 12px;
                overflow: hidden;
            `);
            videoEl.parentElement.appendChild(previewContainer);
        }

        if (effect.category === 'menu_template') {
            videoEl.style.display = 'none';
            previewContainer.style.display = 'flex';
            this.renderTemplatePreviewInModal(previewContainer, effect.fileUrl);
        } else {
            previewContainer.style.display = 'none';
            if (videoUrl) {
                videoEl.src = videoUrl;
                videoEl.style.display = 'block';
                videoEl.play().catch(e => console.warn('Autoplay prevented', e));
            } else {
                videoEl.style.display = 'none';
            }
        }

        const btnTestTry = document.getElementById('btn-test-try');
        btnTestTry.onclick = () => this.testTryEffect(effectId);

        const isPending = (this.pendingPaymentEffects || []).includes(effectId);
        const isInCart = this.cart.some(item => (item.id || item._id) === effectId);

        const btnAddCart = document.getElementById('btn-detail-add-cart');
        if (isOwned) {
            if (effect.category === 'menu_template') {
                btnAddCart.innerHTML = '🛠️ Mở thiết kế';
                btnAddCart.className = 'btn-add-cart btn-owned';
                btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.useMenuTemplateFromStore(effect.fileUrl); };
            } else {
                btnAddCart.innerHTML = '▶ Xem thử trên OBS';
                btnAddCart.className = 'btn-add-cart btn-owned';
                btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.triggerEffect(effectId); };
            }
        } else if (isPending) {
            btnAddCart.innerHTML = '⏳ Đang chờ duyệt';
            btnAddCart.className = 'btn-add-cart btn-pending';
            btnAddCart.onclick = null;
        } else if (isInCart) {
            btnAddCart.innerHTML = '🛒 Đã Trong Giỏ';
            btnAddCart.className = 'btn-add-cart btn-in-cart';
            btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.openCart(); };
        } else {
            btnAddCart.innerHTML = '🛒 Thêm Vào Giỏ Hàng';
            btnAddCart.className = 'btn-add-cart';
            btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.addToCart(effectId); };
        }

        document.getElementById('effect-detail-modal').classList.add('show');
    }

    closeEffectDetailModal() {
        document.getElementById('effect-detail-modal').classList.remove('show');
        const videoEl = document.getElementById('detail-video-player');
        if (videoEl) {
            videoEl.pause();
            videoEl.currentTime = 0;
        }
        const previewContainer = document.getElementById('detail-template-preview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
        }
    }

    async useMenuTemplateFromStore(templateId) {
        try {
            this.switchView('gift-menu-designer');
            if (window.giftMenuDesigner) {
                const usedLayoutId = this.menuTemplateLayoutIds?.get(String(templateId));
                const result = usedLayoutId
                    ? await window.giftMenuDesigner.openLibraryLayout(usedLayoutId)
                    : await window.giftMenuDesigner.buyOrUseTemplateFromSidebar(templateId);
                if (result && result.success) {
                    if (!this.menuTemplateUsage) this.menuTemplateUsage = new Map();
                    this.menuTemplateUsage.set(String(templateId), true);
                    if (result.layout?._id) {
                        if (!this.menuTemplateLayoutIds) this.menuTemplateLayoutIds = new Map();
                        this.menuTemplateLayoutIds.set(String(templateId), String(result.layout._id));
                    }
                }
            } else {
                setTimeout(async () => {
                    if (window.giftMenuDesigner) {
                        const usedLayoutId = this.menuTemplateLayoutIds?.get(String(templateId));
                        const result = usedLayoutId
                            ? await window.giftMenuDesigner.openLibraryLayout(usedLayoutId)
                            : await window.giftMenuDesigner.buyOrUseTemplateFromSidebar(templateId);
                        if (result && result.success) {
                            if (!this.menuTemplateUsage) this.menuTemplateUsage = new Map();
                            this.menuTemplateUsage.set(String(templateId), true);
                            if (result.layout?._id) {
                                if (!this.menuTemplateLayoutIds) this.menuTemplateLayoutIds = new Map();
                                this.menuTemplateLayoutIds.set(String(templateId), String(result.layout._id));
                            }
                        }
                    }
                }, 500);
            }
        } catch (error) {
            this.showNotification('error', 'Lỗi: ' + error.message);
        }
    }

    async buyMenuTemplate(templateId) {
        try {
            this.showNotification('info', '⏳ Đang tìm sản phẩm trên Cửa hàng...');
            const res = await fetch(`${this.API_URL}/api/tiktok/gift-menu-templates/${templateId}/effect`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success && data.effect) {
                this.switchView('store');
                // Select category 'menu_template' filter button
                const activeFilterBtn = document.querySelector(`.filter-btn-new[onclick="filterCategory('menu_template')"]`);
                if (activeFilterBtn) {
                    document.querySelectorAll('.filter-btn-new').forEach(btn => btn.classList.remove('active'));
                    activeFilterBtn.classList.add('active');
                }
                this.renderEffects('menu_template');
                this.showEffectDetail(data.effect._id || data.effect.id);
            } else {
                this.showNotification('error', 'Không tìm thấy sản phẩm này trên Cửa hàng.');
            }
        } catch (error) {
            this.showNotification('error', 'Lỗi kết nối: ' + error.message);
        }
    }

    async getTemplateLayout(templateId) {
        try {
            if (this._templatesCache && this._templatesCache.length > 0) {
                const cached = this._templatesCache.find(t => String(t._id || t.id) === String(templateId));
                if (cached) return cached;
                // A newly published product may not exist in the list cache yet.
                // Fall through to the direct lookup below.
            }
            if (this._fetchingTemplatesPromise) {
                const templates = await this._fetchingTemplatesPromise;
                return templates ? templates.find(t => String(t._id || t.id) === String(templateId)) : null;
            }
            this._fetchingTemplatesPromise = (async () => {
                try {
                    const headers = this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
                    const res = await fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`, { headers });
                    const data = await res.json();
                    if (data.success && Array.isArray(data.templates)) {
                        this._templatesCache = data.templates;
                        if (window.giftMenuDesigner) window.giftMenuDesigner.serverTemplates = data.templates;
                        return data.templates;
                    }
                } catch (e) {
                    console.error('Failed to fetch templates:', e);
                } finally {
                    this._fetchingTemplatesPromise = null;
                }
                return null;
            })();
            const templates = await this._fetchingTemplatesPromise;
            const listed = templates ? templates.find(t => String(t._id || t.id) === String(templateId)) : null;
            if (listed) return listed;

            const headers = this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
            const direct = await fetch(`${this.API_URL}/api/tiktok/gift-menu-templates/${encodeURIComponent(templateId)}`, { headers });
            const directData = await direct.json();
            return direct.ok && directData.success ? directData.template : null;
        } catch (e) {
            console.error('Failed to fetch template layout:', e);
        }
        return null;
    }

    async renderTemplatePreviewInModal(container, templateId) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải bản xem trước...</div>';
        try {
            const template = await this.getTemplateLayout(templateId);
            if (!template) {
                container.innerHTML = '<div style="color:#ef4444; font-size:12px; text-align:center;">Không thể tải bản xem trước</div>';
                return;
            }

            let canvasW = template.canvasSize?.width || 720;
            let canvasH = template.canvasSize?.height || 960;
            const useExported = Array.isArray(template.exportedItems) && template.exportedItems.length > 0;
            if (useExported && template.exportSize) {
                canvasW = template.exportSize.width || 1080;
                canvasH = template.exportSize.height || 1920;
            } else {
                const ratio = template.aspectRatio || '9:16';
                if (ratio === '9:16') {
                    canvasH = Math.round(canvasW * 16 / 9);
                } else if (ratio === '16:9') {
                    canvasH = Math.round(canvasW * 9 / 16);
                } else if (ratio === '1:1') {
                    canvasH = canvasW;
                }
            }
            let containerW = container.clientWidth;
            let containerH = container.clientHeight;
            if (containerW < 20) containerW = 300;
            if (containerH < 20) {
                const ratio = template.aspectRatio || '9:16';
                if (ratio === '16:9') {
                    containerH = Math.round(containerW * 9 / 16);
                } else if (ratio === '1:1') {
                    containerH = containerW;
                } else {
                    containerH = Math.round(containerW * 16 / 9);
                }
            }

            const scale = Math.min(containerW / canvasW, containerH / canvasH) * 0.9;

            const checkerboardStyle = `
                background-color: #0b0f1a;
                background-image: 
                    linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%, #111827),
                    linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%, #111827);
                background-size: 20px 20px;
                background-position: 0 0, 10px 10px;
            `;

            const items = Array.isArray(template.exportedItems) && template.exportedItems.length > 0 ? template.exportedItems : (template.items || []);
            if ((template.productType === 'challenge-wheel' || items.some(item => item && item.type === 'challenge-wheel')) && !document.getElementById('gift-menu-renderer-css')) {
                const rendererCss = document.createElement('link');
                rendererCss.id = 'gift-menu-renderer-css';
                rendererCss.rel = 'stylesheet';
                rendererCss.href = `${this.API_URL}/gift-menu-renderer.css?v=11`;
                document.head.appendChild(rendererCss);
            }
            const itemsHtmlList = items.map(item => {
                try {
                    const itemW = item.width || 120;
                    const itemH = item.height || 180;

                    if (item.type === 'gift-stack-group') {
                        const itemHtml = window.MenuDesignerSharedRenderEngine.renderGiftStackGroup(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });
                        return `
                            <div style="
                                position: absolute;
                                left: ${item.x}px;
                                top: ${item.y}px;
                                width: ${itemW}px;
                                height: ${itemH}px;
                                z-index: ${item.zIndex || 1};
                                overflow: hidden;
                                pointer-events: none;
                            ">
                                ${itemHtml}
                            </div>
                        `;
                    }

                    // template-bundle deliberately excluded: it positions every child
                    // as a percentage of its OWN width/height (like a plain gift item),
                    // so it must use the simple 1:1 wrapper below, not the fixed
                    // reference-box + transform:scale wrapper meant for widgets with a
                    // hand-authored fixed design size.
                    const customWidgetTypes = ['goal-bar', 'goal-circle', 'boss-bar', 'top-contributors', 'podium-contributors', 'talent-live', 'talent-leaderboard', 'mystery-chests', 'combo', 'media-asset', 'goal-list', 'text', 'challenge-wheel'];
                    if (customWidgetTypes.includes(item.type)) {
                        const refW = item.lockedW || item.w || 900;
                        const refH = item.lockedH || item.h || 160;
                        const w = item.width || (refW / 3);
                        const h = item.height || (refH / 3);

                        const scaleX = w / refW;
                        const scaleY = h / refH;

                        const widgetHTML = window.MenuDesignerSharedRenderEngine.renderByType(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });

                        return `
                            <div style="
                                position: absolute;
                                left: ${item.x}px;
                                top: ${item.y}px;
                                width: ${w}px;
                                height: ${h}px;
                                z-index: ${item.zIndex || 1};
                                pointer-events: none;
                            ">
                                <div class="gmd-visual-scaled-wrapper" style="
                                    width: ${refW}px;
                                    height: ${refH}px;
                                    transform: scale(${scaleX}, ${scaleY});
                                    transform-origin: top left;
                                    position: absolute;
                                    top: 0;
                                    left: 0;
                                    pointer-events: none;
                                ">
                                    ${widgetHTML}
                                </div>
                            </div>
                        `;
                    } else {
                        const left = Number(item.x) || 0;
                        const top = Number(item.y) || 0;
                        const width = Number(item.width) || 84;
                        const height = Number(item.height) || 84;

                        const giftHTML = window.MenuDesignerSharedRenderEngine.renderByType(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });

                        return `
                            <div style="
                                position: absolute;
                                left: ${left}px;
                                top: ${top}px;
                                width: ${width}px;
                                height: ${height}px;
                                transform: rotate(${Number(item.rotation) || 0}deg);
                                z-index: ${Number(item.zIndex) || 1};
                                pointer-events: none;
                            ">
                                ${giftHTML}
                            </div>
                        `;
                    }
                } catch (innerErr) {
                    console.error('Failed to render modal item:', item, innerErr);
                    return `<!-- Error rendering item ${item.id}: ${innerErr.message} -->`;
                }
            });

            container.innerHTML = `
                <div class="gmd-preview-canvas" style="
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%) scale(${scale});
                    transform-origin: center;
                    width: ${canvasW}px;
                    height: ${canvasH}px;
                    flex-shrink: 0;
                    max-width: none;
                    max-height: none;
                    ${checkerboardStyle}
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
                ">
                    ${itemsHtmlList.join('')}
                </div>
            `;
        } catch (err) {
            console.error('Error in renderTemplatePreviewInModal:', err);
            container.innerHTML = '<div style="color:#ef4444; font-size:12px; text-align:center;">Lỗi: ' + err.message + '</div>';
        }
    }

    async renderTemplatePreviewInCard(container, templateId) {
        if (container._resizeObserver) {
            container._resizeObserver.disconnect();
        }

        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const width = Math.round(entry.contentRect.width || container.clientWidth);
                const height = Math.round(entry.contentRect.height || container.clientHeight);
                if (width < 30) continue;

                if (container._lastW === width && container._lastH === height) {
                    continue;
                }
                container._lastW = width;
                container._lastH = height;

                requestAnimationFrame(async () => {
                    await this.drawTemplatePreview(container, templateId, width, height);
                });
            }
        });

        container._resizeObserver = observer;
        observer.observe(container);
    }

    async drawTemplatePreview(container, templateId, containerW, containerH) {
        try {
            const template = await this.getTemplateLayout(templateId);
            if (!template) {
                container.innerHTML = `<span style="font-size:32px;">📋</span>`;
                return;
            }

            let canvasW = template.canvasSize?.width || 720;
            let canvasH = template.canvasSize?.height || 960;
            const useExported = Array.isArray(template.exportedItems) && template.exportedItems.length > 0;
            if (useExported && template.exportSize) {
                canvasW = template.exportSize.width || 1080;
                canvasH = template.exportSize.height || 1920;
            } else {
                const ratio = template.aspectRatio || '9:16';
                if (ratio === '9:16') {
                    canvasH = Math.round(canvasW * 16 / 9);
                } else if (ratio === '16:9') {
                    canvasH = Math.round(canvasW * 9 / 16);
                } else if (ratio === '1:1') {
                    canvasH = canvasW;
                }
            }

            const scale = Math.max(containerW / canvasW, containerH / canvasH);

            const checkerboardStyle = `
                background-color: #0b0f1a;
                background-image: 
                    linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%, #111827),
                    linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%, #111827);
                background-size: 20px 20px;
                background-position: 0 0, 10px 10px;
            `;

            const items = Array.isArray(template.exportedItems) && template.exportedItems.length > 0 ? template.exportedItems : (template.items || []);
            const itemsHtmlList = items.map(item => {
                try {
                    const itemW = item.width || 120;
                    const itemH = item.height || 180;

                    if (item.type === 'gift-stack-group') {
                        const itemHtml = window.MenuDesignerSharedRenderEngine.renderGiftStackGroup(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });
                        return `
                            <div style="
                                position: absolute;
                                left: ${item.x}px;
                                top: ${item.y}px;
                                width: ${itemW}px;
                                height: ${itemH}px;
                                z-index: ${item.zIndex || 1};
                                overflow: hidden;
                                pointer-events: none;
                            ">
                                ${itemHtml}
                            </div>
                        `;
                    }

                    // template-bundle deliberately excluded: it positions every child
                    // as a percentage of its OWN width/height (like a plain gift item),
                    // so it must use the simple 1:1 wrapper below, not the fixed
                    // reference-box + transform:scale wrapper meant for widgets with a
                    // hand-authored fixed design size.
                    const customWidgetTypes = ['goal-bar', 'goal-circle', 'boss-bar', 'top-contributors', 'podium-contributors', 'talent-live', 'talent-leaderboard', 'mystery-chests', 'combo', 'media-asset', 'goal-list', 'text', 'challenge-wheel'];
                    if (customWidgetTypes.includes(item.type)) {
                        const refW = item.lockedW || item.w || 900;
                        const refH = item.lockedH || item.h || 160;
                        const w = item.width || (refW / 3);
                        const h = item.height || (refH / 3);

                        const scaleX = w / refW;
                        const scaleY = h / refH;

                        const widgetHTML = window.MenuDesignerSharedRenderEngine.renderByType(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });

                        return `
                            <div style="
                                position: absolute;
                                left: ${item.x}px;
                                top: ${item.y}px;
                                width: ${w}px;
                                height: ${h}px;
                                z-index: ${item.zIndex || 1};
                                pointer-events: none;
                            ">
                                <div class="gmd-visual-scaled-wrapper" style="
                                    width: ${refW}px;
                                    height: ${refH}px;
                                    transform: scale(${scaleX}, ${scaleY});
                                    transform-origin: top left;
                                    position: absolute;
                                    top: 0;
                                    left: 0;
                                    pointer-events: none;
                                ">
                                    ${widgetHTML}
                                </div>
                            </div>
                        `;
                    } else {
                        const left = Number(item.x) || 0;
                        const top = Number(item.y) || 0;
                        const width = Number(item.width) || 84;
                        const height = Number(item.height) || 84;

                        const giftHTML = window.MenuDesignerSharedRenderEngine.renderByType(item, {
                            mode: 'overlay',
                            scale: 1,
                            apiBase: this.API_URL,
                            escapeText: true
                        });

                        return `
                            <div style="
                                position: absolute;
                                left: ${left}px;
                                top: ${top}px;
                                width: ${width}px;
                                height: ${height}px;
                                transform: rotate(${Number(item.rotation) || 0}deg);
                                z-index: ${Number(item.zIndex) || 1};
                                pointer-events: none;
                            ">
                                ${giftHTML}
                            </div>
                        `;
                    }
                } catch (innerErr) {
                    console.error('Failed to render card item:', item, innerErr);
                    return `<!-- Error rendering item ${item.id}: ${innerErr.message} -->`;
                }
            });

            container.innerHTML = `
                <div class="gmd-preview-canvas-card" style="
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%) scale(${scale});
                    transform-origin: center;
                    width: ${canvasW}px;
                    height: ${canvasH}px;
                    flex-shrink: 0;
                    max-width: none;
                    max-height: none;
                    ${checkerboardStyle}
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 6px;
                    overflow: hidden;
                ">
                    ${itemsHtmlList.join('')}
                </div>
            `;
        } catch (err) {
            console.error('Error in drawTemplatePreview:', err);
            container.innerHTML = `<div style="font-size:10px; color:#ef4444; padding:5px; text-align:center;">Lỗi: ${err.message}</div>`;
        }
    }

    saveGlobalFlashSaleTime() {
        const val = document.getElementById('global-flash-sale-ends').value;
        localStorage.setItem('es_global_flash_sale_ends', val);
        this.showNotification('success', '💾 Đã cập nhật thời gian Flash Sale dùng chung!');
        this.renderEffects();
    }

    async testTryEffect(effectId) {
        return this.previewEffectOnOBS(effectId);
    }

    // Retained temporarily for rollback/reference only. No preview UI calls it.
    async _legacyTestTryEffectDoNotUse(effectId) {
        this.showNotification('info', '⏳ Đang phát lên OBS (8s)...');
        try {
            const response = await fetch(this.API_URL + '/api/obs/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ effectId, duration: 8 }) // Dùng thử 8s
            });
            const data = await response.json();
            if (data.success) {
                this.showNotification('success', '✅ Đã kích hoạt dùng thử!');
            } else {
                this.showNotification('error', '❌ Lỗi: ' + (data.error || 'Không thể test'));
            }
        } catch (error) {
            this.showNotification('error', '❌ Lỗi kết nối OBS');
        }
    }

    switchView(view) {
        this.currentView = view;
        document.body.dataset.currentView = view;
        document.querySelectorAll('.menu-item-new').forEach(i => i.classList.remove('active'));
        const activeNav = Array.from(document.querySelectorAll('.menu-item-new')).find(el =>
            el.getAttribute('onclick')?.includes(`'${view}'`)
        );
        if (activeNav) activeNav.classList.add('active');
        const viewsToHide = ['store', 'library', 'admin', 'settings', 'gift-mapping', 'gift-menu-designer'];
        viewsToHide.forEach(v => {
            const el = document.getElementById(`${v}-view`);
            if (el) {
                el.classList.add('hidden');
                el.classList.remove('active');
            }
        });

        // Xử lý ẩn/hiện các layout chung
        const rightSidebar = document.querySelector('.sidebar-right');
        const mainContent = document.querySelector('.main-content-new');
        const mainLayout = document.querySelector('.main-layout-new');

        if (rightSidebar) rightSidebar.style.display = '';
        if (mainLayout) {
            mainLayout.style.height = '';
            mainLayout.style.overflow = '';
        }
        if (mainContent) {
            mainContent.style.display = '';
            mainContent.style.flexDirection = '';
            mainContent.style.height = '';
            mainContent.style.overflow = '';
        }

        const targetView = document.getElementById(`${view}-view`);
        if (targetView) {
            targetView.classList.remove('hidden');

            if (view === 'admin') {
                document.getElementById('page-title').textContent = '👨‍💼 Trang quản trị';
                this.loadAdminDashboard();
            } else if (view === 'store') {
                document.getElementById('page-title').textContent = '🛒 Cửa Hàng';
                const heroBanner = document.querySelector('.hero-banner-new');
                if (heroBanner && this.bannerUrl) {
                    heroBanner.style.backgroundImage = `url('${this.bannerUrl}')`;
                    heroBanner.style.backgroundSize = 'cover';
                    heroBanner.style.backgroundPosition = 'center';
                }
                this.renderEffects();
            } else if (view === 'library') {
                document.getElementById('page-title').textContent = '📚 Thư Viện';
                this.renderEffects();
                this.loadOwnedEffects();
            } else if (view === 'gift-mapping') {
                document.getElementById('page-title').textContent = '🎁 Gán quà với hiệu ứng';
                this.initGiftMapping(); // Khởi tạo Gift Mapping khi vào view
            } else if (view === 'settings') {
                document.getElementById('page-title').textContent = '⚙️ Cài Đặt';
                this.loadSettings();
            } else if (view === 'gift-menu-designer') {
                document.getElementById('page-title').textContent = '🎨 Thiết kế bảng quà';
                if (rightSidebar) rightSidebar.style.display = 'none';
                if (window.giftMenuDesigner) {
                    window.giftMenuDesigner.onViewSwitch();
                }
            } else {
                document.getElementById('page-title').textContent = 'LiveFlow';
            }
        }

        if (view === 'obs') {
            this.loadGiftMappings();
            this.loadGiftLogs();
            if (this.logsInterval) clearInterval(this.logsInterval);
            this.logsInterval = setInterval(() => this.loadGiftLogs(), 10000);
        } else {
            if (this.logsInterval) clearInterval(this.logsInterval);
        }
    }

    getControlDeckStorageKey() {
        const userKey = String(this.currentUser?._id || this.currentUser?.id || this.currentUser?.email || 'guest');
        return `liveflow_control_deck_${userKey}`;
    }

    loadControlDeckState() {
        const fallback = { effect: { visible: 10, slots: [] }, sound: { visible: 10, slots: [] } };
        try {
            const key = this.getControlDeckStorageKey();
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved) {
                for (const type of ['effect', 'sound']) {
                    fallback[type].visible = Math.max(10, Math.min(20, Number(saved?.[type]?.visible) || 10));
                    fallback[type].slots = Array.isArray(saved?.[type]?.slots) ? saved[type].slots.slice(0, 20) : [];
                }
            }
        } catch (_error) {}
        return fallback;
    }

    saveControlDeckState() {
        const key = this.getControlDeckStorageKey();
        localStorage.setItem(key, JSON.stringify(this.controlDeck));
        this.syncControlDeckHotkeys();
        this.syncControlDeckToRemote();
    }

    async resetGiftMenuDesignerSession() {
        // GiftMenuDesigner keeps its own in-memory "Thư viện của tôi" list and
        // canvas that only ever refresh on an explicit view-switch — logging
        // out/in as a different account without leaving the Designer view left
        // the previous account's saved menus visible. Clear local state first
        // so nothing lingers even if the reload below fails.
        if (window.giftMenuDesigner && typeof window.giftMenuDesigner.resetDesignerSession === 'function') {
            try { window.giftMenuDesigner.resetDesignerSession(); } catch (_e) {}
        }
        if (window.giftMenuDesigner && typeof window.giftMenuDesigner.loadLayoutsList === 'function') {
            try { await window.giftMenuDesigner.loadLayoutsList(); } catch (_e) {}
        }
    }

    async resetRemoteControlSession() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch(`${this.API_URL}/api/remote/reset-session`, {
                method: 'POST',
                signal: controller.signal
            });
            clearTimeout(timeout);
        } catch (_e) {}
    }

    async syncGiftMenuOverlayToActiveAccount() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch(`${this.API_URL}/api/tiktok/gift-menu-overlay-sync-active`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                signal: controller.signal
            });
            clearTimeout(timeout);
        } catch (_e) {}
    }

    async syncControlDeckToRemote() {
        try {
            const formatThumb = (url) => {
                if (!url) return '';
                let clean = url.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i, '');
                if (!/^https?:/i.test(clean) && !clean.startsWith('/')) {
                    clean = `/${clean}`;
                }
                return clean;
            };

            const isRemoteVideoEffect = (effect) => {
                if (!effect || effect.isWheel || effect.isWidget || effect.isTemplate) return false;
                const type = String(effect.type || '').toLowerCase();
                const category = String(effect.category || '').toLowerCase();
                if (['wheel', 'widget', 'template', 'challenge-wheel', 'menu_template'].includes(type)) return false;
                if (['wheel', 'widget', 'template', 'challenge-wheel', 'menu_template'].includes(category)) return false;
                const id = String(effect._id || effect.id || '').toLowerCase();
                if (id.startsWith('wheel-') || id.startsWith('challenge-') || id.includes('wheel')) return false;
                const name = String(effect.name || effect.effectName || '').toLowerCase();
                return !name.includes('vòng quay') && !name.includes('wheel') && !name.includes('thử thách');
            };

            const availableEffects = [...(this.ownedEffects || []), ...(this.mappingEffects || []), ...(this.personalEffects || [])]
                .filter(isRemoteVideoEffect)
                .filter((effect, index, items) => items.findIndex((candidate) => String(candidate._id || candidate.id) === String(effect._id || effect.id)) === index)
                .map(effect => {
                    const id = String(effect._id || effect.id);
                    return {
                        id,
                        _id: id,
                        name: effect.name || effect.effectName || 'Hiệu ứng',
                        thumbUrl: formatThumb(effect.thumbUrl),
                        icon: effect.icon || '🎬'
                    };
                });

            const availableSounds = (this.controlDeckSoundLibrary || []).map(sound => ({
                id: String(sound.id),
                name: sound.name || 'Sound',
                url: sound.url,
                icon: '🎵'
            }));

            const cleanSlots = (type) => (this.controlDeck[type]?.slots || []).map(slot => ({
                ...slot,
                thumbUrl: formatThumb(slot.thumbUrl)
            }));

            const fullDeckState = {
                effect: { ...this.controlDeck.effect, slots: cleanSlots('effect') },
                sound: { ...this.controlDeck.sound, slots: cleanSlots('sound') },
                availableEffects,
                availableSounds
            };

            const response = await fetch(`${this.API_URL}/api/remote/sync-deck`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deck: fullDeckState })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && Number.isFinite(Number(result.revision))) {
                this.lastRemoteDeckRevision = Number(result.revision);
            }
        } catch (_e) {}
    }

    async showRemoteConnectModal() {
        try {
            // The backend may have restarted since the renderer loaded. Wait
            // until the full deck/library is restored before exposing the QR,
            // otherwise the phone can see stale or empty slots and report a
            // successful assignment that the PC cannot resolve.
            await this.syncControlDeckToRemote();
            const localBase = 'http://127.0.0.1:9000';
            const res = await fetch(`${localBase}/api/remote/lan-info`).catch(() => fetch(`${this.API_URL}/api/remote/lan-info`));
            const data = await res.json().catch(() => ({ success: false, error: 'Tiến trình Backend vừa khởi động lại. Vui lòng thử lại sau 2 giây.' }));
            if (!res.ok || !data.success) throw new Error(data.error || 'Không thể lấy địa chỉ IP LAN');

            const remoteUrl = data.remoteUrl;
            let qrDataUrl = '';
            if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
                qrDataUrl = await window.QRCode.toDataURL(remoteUrl, { margin: 2, width: 220 });
            } else {
                qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(remoteUrl)}`;
            }

            const modalHtml = `
                <div class="modal-overlay show" id="remote-modal-overlay" onclick="if(event.target===this) app.closeRemoteModal()" style="position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; z-index:999999; opacity:1 !important; visibility:visible !important; pointer-events:auto !important;">
                    <div class="modal-content" style="max-width: 440px; width:90%; text-align: center; padding: 28px; border-radius: 20px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 20px 50px rgba(0,0,0,0.8); transform: scale(1) !important; opacity: 1 !important;">
                        <div style="font-size: 42px; margin-bottom: 8px;">📱</div>
                        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">Kết Nối Điện Thoại Từ Xa</h3>
                        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Dùng camera điện thoại (cùng mạng Wi-Fi) quét mã QR để điều khiển nút Live Control & Soundboard từ xa!</p>
                        
                        <div style="background: #ffffff; padding: 14px; border-radius: 16px; display: inline-block; box-shadow: 0 8px 24px rgba(0,0,0,0.5); margin-bottom: 18px;">
                            <img src="${qrDataUrl}" style="width: 200px; height: 200px; display: block;" alt="QR Code Remote">
                        </div>

                        <div style="background: rgba(30,41,59,0.8); padding: 10px 14px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #38bdf8; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 20px; border: 1px solid rgba(56,189,248,0.2);">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">${remoteUrl}</span>
                            <button onclick="navigator.clipboard.writeText('${remoteUrl}'); app.showNotification('success', 'Đã chép link remote!');" style="background: #38bdf8; color: #0f172a; border: none; padding: 6px 12px; border-radius: 8px; font-weight: 700; cursor: pointer; white-space: nowrap;">Chép link</button>
                        </div>

                        <button onclick="app.closeRemoteModal()" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 12px; font-weight: 700; cursor: pointer;">Đóng cửa sổ</button>
                    </div>
                </div>
            `;

            let container = document.getElementById('remote-modal-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'remote-modal-container';
                document.body.appendChild(container);
            }
            container.innerHTML = modalHtml;
            this.startRemoteModalConnectionPolling();
        } catch (e) {
            this.showNotification('error', 'Lỗi mở kết nối điện thoại: ' + e.message);
        }
    }

    startRemoteModalConnectionPolling() {
        if (this.remoteModalStatusTimer) clearInterval(this.remoteModalStatusTimer);
        let checking = false;
        const check = async () => {
            if (checking || !document.getElementById('remote-modal-overlay')) return;
            checking = true;
            try {
                const response = await fetch(`${this.API_URL}/api/remote/connection-status`, { cache: 'no-store' });
                const data = await response.json().catch(() => ({}));
                if (response.ok && Number(data.connectedClients || 0) > 0) {
                    this.handleRemoteDeviceConnected({ count: Number(data.connectedClients) });
                }
            } catch (_error) {
                // The WebSocket event remains the fallback while the backend restarts.
            } finally {
                checking = false;
            }
        };
        this.remoteModalStatusTimer = setInterval(check, 500);
        check();
    }

    closeRemoteModal() {
        if (this.remoteModalStatusTimer) {
            clearInterval(this.remoteModalStatusTimer);
            this.remoteModalStatusTimer = null;
        }
        const el = document.getElementById('remote-modal-overlay');
        if (el) el.remove();
    }

    handleRemoteButtonClick() {
        if (this.isRemoteConnected) {
            this.showRemoteStatusModal();
        } else {
            this.showRemoteConnectModal();
        }
    }

    updateRemoteButtonState(connected, count = 1) {
        this.isRemoteConnected = connected;
        const btn = document.querySelector('.btn-remote-connect');
        if (!btn) return;

        if (connected) {
            btn.classList.add('connected');
            btn.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(5,150,105,0.35))';
            btn.style.border = '1px solid #10b981';
            btn.style.color = '#34d399';
            btn.style.boxShadow = '0 0 14px rgba(16, 185, 129, 0.6)';
            btn.innerHTML = `<i class="fas fa-mobile-screen-button"></i> 🟢 Đã kết nối ĐT`;
        } else {
            btn.classList.remove('connected');
            btn.style.background = 'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(139,92,246,0.25))';
            btn.style.border = '1px solid rgba(236,72,153,0.45)';
            btn.style.color = '#f472b6';
            btn.style.boxShadow = 'none';
            btn.innerHTML = `<i class="fas fa-mobile-alt"></i> 📱 Remote`;
        }
    }

    handleRemoteDeviceConnected(info = {}) {
        this.updateRemoteButtonState(true, info.count || 1);
        if (this.remoteModalStatusTimer) {
            clearInterval(this.remoteModalStatusTimer);
            this.remoteModalStatusTimer = null;
        }
        const overlay = document.getElementById('remote-modal-overlay');
        const content = overlay?.querySelector('.modal-content');
        if (content) {
            content.innerHTML = `
                <div style="font-size:52px;margin-bottom:10px;">✅</div>
                <h3 style="font-size:21px;font-weight:900;color:#34d399;margin-bottom:7px;">Kết nối thành công!</h3>
                <p style="font-size:13px;color:#94a3b8;margin:0;">Điện thoại đã sẵn sàng điều khiển Live Control và Soundboard.</p>
            `;
            setTimeout(() => this.closeRemoteModal(), 1100);
        } else {
            this.showNotification('success', '📱 Đã kết nối điện thoại điều khiển từ xa!');
        }
    }

    showRemoteStatusModal() {
        const modalHtml = `
            <div class="modal-overlay show" id="remote-modal-overlay" onclick="if(event.target===this) app.closeRemoteModal()" style="position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; z-index:999999;">
                <div class="modal-content" style="max-width: 420px; width:90%; text-align: center; padding: 26px; border-radius: 20px; background: #0f172a; border: 1px solid rgba(16,185,129,0.4); box-shadow: 0 0 40px rgba(16,185,129,0.3);">
                    <div style="font-size: 42px; margin-bottom: 8px;">🟢</div>
                    <h3 style="font-size: 20px; font-weight: 800; color: #34d399; margin-bottom: 6px;">Đã Kết Nối Điện Thoại</h3>
                    <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Điện thoại của bạn đang kết nối sẵn sàng điều khiển từ xa Live Control & Soundboard.</p>
                    
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button onclick="app.showRemoteConnectModal();" style="width: 100%; padding: 12px; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.4); color: #38bdf8; border-radius: 12px; font-weight: 700; cursor: pointer;">Hiện mã QR cho thiết bị khác</button>
                        <button onclick="app.closeRemoteModal()" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 12px; font-weight: 700; cursor: pointer;">Đóng cửa sổ</button>
                    </div>
                </div>
            </div>
        `;
        let container = document.getElementById('remote-modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'remote-modal-container';
            document.body.appendChild(container);
        }
        container.innerHTML = modalHtml;
    }

    getControlDeckSlotThumbUrl(slot) {
        if (!slot) return '';
        let url = slot.thumbUrl || '';
        if (url) {
            url = url.replace(/^http:\/\/(127\.0\.0\.1|localhost):8080/i, this.API_URL);
            if (/^https?:\/\//i.test(url)) return url;
            const clean = url.startsWith('/') ? url : `/${url}`;
            return `${this.API_URL}${clean}`;
        }
        const effectId = slot.effectId || slot.id;
        if (!effectId) return '';
        if (String(effectId).startsWith('custom-')) {
            return `${this.API_URL}/custom-effects/${effectId}/thumbnail.png`;
        }
        return `${this.API_URL}/uploads/thumbs/${effectId}.png`;
    }

    async checkRemoteConnectionStatus() {
        try {
            const res = await fetch(`${this.API_URL}/api/remote/connection-status`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) {
                const count = Number(data.connectedClients || 0);
                if (count > 0 && !this.isRemoteConnected) {
                    this.updateRemoteButtonState(true, count);
                } else if (count === 0 && this.isRemoteConnected) {
                    this.updateRemoteButtonState(false);
                }
                const revision = Number(data.revision);
                if (Number.isFinite(this.lastRemoteDeckRevision) &&
                    Number.isFinite(revision) &&
                    revision > this.lastRemoteDeckRevision &&
                    data.deck) {
                    this.applyRemoteDeckState(data.deck, revision);
                }
            }
        } catch (_e) {}
    }

    applyRemoteDeckState(remoteDeck, revision) {
        for (const type of ['effect', 'sound']) {
            const incoming = remoteDeck?.[type];
            if (!incoming || !Array.isArray(incoming.slots)) continue;
            this.controlDeck[type] = {
                ...this.controlDeck[type],
                visible: Math.max(10, Math.min(20, Number(incoming.visible) || 10)),
                slots: incoming.slots.filter(Boolean).slice(0, 20)
            };
        }
        this.lastRemoteDeckRevision = revision;
        this.saveControlDeckState();
        this.renderControlDeck();
    }

    switchControlDeckTab(type) {
        if (!['effect', 'sound'].includes(type)) return;
        this.controlDeckTab = type;
        document.querySelectorAll('[data-lcd-tab]').forEach((button) => button.classList.toggle('active', button.dataset.lcdTab === type));
        this.renderControlDeck();
    }

    renderControlDeck() {
        const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        const btnColors = ['red', 'purple', 'blue', 'green', 'gold', 'pink'];

        for (const type of ['effect', 'sound']) {
            const grid = document.getElementById(`lcd-${type}-grid`);
            if (!grid) continue;
            const state = this.controlDeck[type];
            const slotsByIndex = new Map(state.slots.map((slot) => [Number(slot.index), slot]));
            const cards = [];
            for (let index = 0; index < state.visible; index += 1) {
                const slot = slotsByIndex.get(index);
                const colorClass = btnColors[index % btnColors.length];

                if (type === 'sound') {
                    if (!slot) {
                        cards.push(`
                            <div class="lcd-slot sound-3d-slot empty" onclick="app.addControlDeckSlot(${index},'sound')" title="Thêm âm thanh">
                                <div class="push-btn-3d color-empty">
                                    <div class="push-btn-3d-core">
                                        <i class="fas fa-plus"></i>
                                    </div>
                                </div>
                                <span class="lcd-slot-name" style="color:#38bdf8; margin-top:2px;">+ Thêm sound</span>
                            </div>
                        `);
                        continue;
                    }
                    cards.push(`
                        <div class="lcd-slot sound-3d-slot" role="button" tabindex="0" id="lcd-slot-${escapeHtml(slot.id)}" onclick="app.triggerControlDeckSlot('${escapeHtml(slot.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.triggerControlDeckSlot('${escapeHtml(slot.id)}')}">
                            <button class="lcd-slot-remove" onclick="event.stopPropagation();app.removeControlDeckSlot('${escapeHtml(slot.id)}')" title="Xóa nút">×</button>
                            <div class="push-btn-3d color-${colorClass}">
                                <div class="push-btn-3d-core">
                                    <i class="fas fa-volume-high"></i>
                                </div>
                            </div>
                            <span class="lcd-slot-name">${escapeHtml(slot.name)}</span>
                            <span class="lcd-slot-key" onclick="event.stopPropagation();app.beginControlDeckHotkey('${escapeHtml(slot.id)}')">⌨ ${escapeHtml(slot.hotkey || 'Gán phím')}</span>
                            <input class="lcd-slot-volume" aria-label="Âm lượng" type="range" min="0" max="100" value="${Math.round((Number.isFinite(Number(slot.volume)) ? Number(slot.volume) : 1) * 100)}" onclick="event.stopPropagation()" oninput="event.stopPropagation();app.updateControlDeckVolume('${escapeHtml(slot.id)}',this.value)">
                        </div>
                    `);
                    continue;
                }

                if (!slot) {
                    cards.push(`<div class="lcd-slot effect-3d-slot empty" onclick="app.addControlDeckSlot(${index},'effect')" title="Thêm hiệu ứng"><i class="fas fa-plus" style="font-size:18px;margin-bottom:4px;"></i><span style="font-size:11px;font-weight:700;">+ Thêm nút</span></div>`);
                    continue;
                }
                const thumbUrl = this.getControlDeckSlotThumbUrl(slot);
                const image = thumbUrl
                    ? `<img class="lcd-slot-icon" src="${escapeHtml(thumbUrl)}" alt="" onerror="this.style.display='none'">`
                    : `<span class="lcd-slot-icon"><i class="fas fa-wand-magic-sparkles"></i></span>`;
                cards.push(`<div class="lcd-slot effect-3d-slot" role="button" tabindex="0" id="lcd-slot-${escapeHtml(slot.id)}" onclick="app.triggerControlDeckSlot('${escapeHtml(slot.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.triggerControlDeckSlot('${escapeHtml(slot.id)}')}">
                    <button class="lcd-slot-remove" onclick="event.stopPropagation();app.removeControlDeckSlot('${escapeHtml(slot.id)}')" title="Xóa nút">×</button>
                    ${image}<span class="lcd-slot-name">${escapeHtml(slot.name)}</span>
                    <span class="lcd-slot-key" onclick="event.stopPropagation();app.beginControlDeckHotkey('${escapeHtml(slot.id)}')">⌨ ${escapeHtml(slot.hotkey || 'Gán phím')}</span>
                    <span class="lcd-slot-status"></span>
                    <input class="lcd-slot-volume" aria-label="Âm lượng" type="range" min="0" max="100" value="${Math.round((Number.isFinite(Number(slot.volume)) ? Number(slot.volume) : 1) * 100)}" onclick="event.stopPropagation()" oninput="event.stopPropagation();app.updateControlDeckVolume('${escapeHtml(slot.id)}',this.value)">
                </div>`);
            }
            grid.innerHTML = cards.join('');
            const limit = document.getElementById(`lcd-${type}-limit`);
            if (limit) limit.textContent = `${state.slots.length}/${state.visible} · tối đa 20`;
        }
    }

    async addControlDeckSlot(preferredIndex, requestedType = this.controlDeckTab) {
        const type = ['effect', 'sound'].includes(requestedType) ? requestedType : 'effect';
        const state = this.controlDeck[type];
        const occupied = new Set(state.slots.map((slot) => Number(slot.index)));
        let index = Number.isInteger(preferredIndex) ? preferredIndex : -1;
        if (index < 0 || occupied.has(index)) index = Array.from({ length: state.visible }, (_, i) => i).find((i) => !occupied.has(i));
        if (index === undefined || index < 0) {
            if (state.visible >= 20) return this.showNotification('info', 'Live Control đã đạt giới hạn 20 nút cho tab này.');
            index = state.visible;
            state.visible += 1;
        }
        this.pendingControlDeckIndex = index;
        if (type === 'sound') {
            return this.openControlDeckSoundPicker();
        }
        this.openControlDeckEffectPicker();
    }

    async openControlDeckSoundPicker() {
        const modal = document.getElementById('lcd-sound-picker');
        const list = document.getElementById('lcd-sound-list');
        if (!modal || !list) return;
        list.innerHTML = '<div style="color:#94a3b8;padding:24px;text-align:center;grid-column:1/-1">Đang tải thư viện sound...</div>';
        modal.classList.add('open');
        let result;
        try {
            if (!window.electronAPI?.invoke) throw new Error('Cầu nối Electron chưa sẵn sàng.');
            result = await Promise.race([
                window.electronAPI.invoke('control-deck:list-sounds'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tiến trình LiveFlow chưa nạp mô-đun Soundboard.')), 5000))
            ]);
        } catch (error) {
            console.error('Load Soundboard library error:', error);
            list.innerHTML = `<div style="color:#fca5a5;padding:24px;text-align:center;grid-column:1/-1;line-height:1.55">${String(error?.message || '').includes('No handler registered') || String(error?.message || '').includes('chưa nạp')
                ? 'Soundboard chưa được nạp ở tiến trình chính.<br><strong>Hãy thoát hoàn toàn LiveFlow rồi mở lại ứng dụng.</strong>'
                : 'Không thể đọc thư viện sound trên máy.<br>Hãy khởi động lại LiveFlow và thử lại.'}</div>`;
            return;
        }
        if (!result?.success) {
            list.innerHTML = '<div style="color:#f87171;padding:24px;text-align:center;grid-column:1/-1">Không thể đọc thư viện sound trên máy.</div>';
            return;
        }
        const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        list.innerHTML = result.sounds?.length ? result.sounds.map((sound) => `
            <button class="lcd-effect-option lcd-sound-option" onclick="app.selectControlDeckSound('${escapeHtml(sound.id)}')">
                <span class="lcd-slot-icon"><i class="fas fa-music"></i></span><strong>${escapeHtml(sound.name || 'Sound')}</strong>
            </button>`).join('') : '<div style="color:#94a3b8;padding:24px;text-align:center;grid-column:1/-1">Chưa có sound đã lưu. Hãy tải sound đầu tiên từ máy tính.</div>';
        this.controlDeckSoundLibrary = result.sounds || [];
    }

    closeControlDeckSoundPicker() { document.getElementById('lcd-sound-picker')?.classList.remove('open'); }

    addSoundLibraryItemToDeck(sound) {
        if (!sound) return;
        this.controlDeck.sound.slots.push({
            ...sound,
            id: `deck-sound-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            soundId: sound.id,
            index: this.pendingControlDeckIndex,
            type: 'sound',
            volume: 1,
            hotkey: ''
        });
        this.closeControlDeckSoundPicker();
        this.saveControlDeckState();
        this.renderControlDeck();
    }

    selectControlDeckSound(soundId) {
        this.addSoundLibraryItemToDeck((this.controlDeckSoundLibrary || []).find((sound) => String(sound.id) === String(soundId)));
    }

    async uploadControlDeckSound() {
        let result;
        try {
            if (!window.electronAPI?.invoke) throw new Error('Cầu nối Electron chưa sẵn sàng.');
            result = await window.electronAPI.invoke('control-deck:choose-sound');
        } catch (error) {
            console.error('Upload Soundboard file error:', error);
            this.showNotification('error', String(error?.message || '').includes('No handler registered')
                ? 'Soundboard chưa được nạp. Hãy thoát hoàn toàn rồi mở lại LiveFlow.'
                : 'Không mở được trình chọn file. Hãy khởi động lại LiveFlow.');
            return;
        }
        if (!result?.success) {
            if (!result?.canceled) this.showNotification('error', result?.error || 'Không thể thêm âm thanh.');
            return;
        }
        this.addSoundLibraryItemToDeck(result.sound);
        this.showNotification('success', 'Đã lưu sound vào máy và thêm vào Soundboard.');
    }

    openControlDeckEffectPicker() {
        const modal = document.getElementById('lcd-effect-picker');
        const list = document.getElementById('lcd-effect-list');
        if (!modal || !list) return;
        const isVideoEffect = (effect) => {
            if (!effect) return false;
            if (effect.isWheel || effect.isWidget || effect.isTemplate) return false;
            if (['wheel', 'widget', 'template'].includes(effect.type) || ['wheel', 'widget', 'template'].includes(effect.category)) return false;
            const id = String(effect._id || effect.id || '').toLowerCase();
            if (id.startsWith('wheel-') || id.startsWith('challenge-') || id.includes('wheel')) return false;
            const name = String(effect.name || effect.effectName || '').toLowerCase();
            if (name.includes('vòng quay') || name.includes('wheel') || name.includes('thử thách')) return false;
            return true;
        };
        const effects = [...(this.ownedEffects || []), ...(this.mappingEffects || []), ...(this.personalEffects || [])]
            .filter(isVideoEffect)
            .filter((effect, index, items) => items.findIndex((candidate) => String(candidate._id || candidate.id) === String(effect._id || effect.id)) === index);
        const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        list.innerHTML = effects.length ? effects.map((effect) => {
            const id = effect._id || effect.id;
            const thumb = effect.thumbUrl ? (/^https?:/i.test(effect.thumbUrl) ? effect.thumbUrl : `${this.API_URL}${effect.thumbUrl}`) : '';
            return `<button class="lcd-effect-option" onclick="app.selectControlDeckEffect('${escapeHtml(id)}')">${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : '<div class="lcd-slot-icon"><i class="fas fa-wand-magic-sparkles"></i></div>'}<strong>${escapeHtml(effect.name || effect.effectName || 'Hiệu ứng')}</strong></button>`;
        }).join('') : '<div style="color:#94a3b8;padding:30px;text-align:center;grid-column:1/-1">Bạn chưa có hiệu ứng. Hãy thêm hoặc mua hiệu ứng trước.</div>';
        modal.classList.add('open');
    }

    uploadControlDeckEffect() {
        this.closeControlDeckPicker();
        this.openPersonalEffectUpload(true);
    }

    closeControlDeckPicker() { document.getElementById('lcd-effect-picker')?.classList.remove('open'); }

    addControlDeckEffectToSlot(effect, index = this.pendingControlDeckIndex) {
        if (!effect || !Number.isInteger(index)) return false;
        const effectId = effect._id || effect.id;
        if (!effectId) return false;
        const thumbUrl = effect.thumbUrl ? (/^https?:/i.test(effect.thumbUrl) ? effect.thumbUrl : `${this.API_URL}${effect.thumbUrl}`) : '';
        this.controlDeck.effect.slots = this.controlDeck.effect.slots.filter((slot) => Number(slot.index) !== index);
        this.controlDeck.effect.slots.push({
            id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            effectId: String(effectId),
            index,
            type: 'effect',
            name: effect.name || effect.effectName || 'Hiệu ứng',
            thumbUrl,
            hotkey: '',
            volume: 1
        });
        this.closeControlDeckPicker();
        this.saveControlDeckState();
        this.renderControlDeck();
        return true;
    }

    selectControlDeckEffect(effectId) {
        const effects = [...(this.ownedEffects || []), ...(this.mappingEffects || []), ...(this.personalEffects || [])];
        const effect = effects.find((item) => String(item._id || item.id) === String(effectId));
        if (!effect) return;
        this.addControlDeckEffectToSlot(effect);
    }

    findControlDeckSlot(slotId, deckType = null) {
        const types = deckType && ['effect', 'sound'].includes(deckType) ? [deckType] : ['effect', 'sound'];
        for (const type of types) {
            const slot = this.controlDeck[type].slots.find(item => 
                String(item.id) === String(slotId) || 
                String(item.effectId) === String(slotId) || 
                String(item.soundId) === String(slotId) ||
                String(item.index) === String(slotId)
            );
            if (slot) return slot;
        }
        return null;
    }

    async triggerControlDeckSlot(slotId) {
        const slot = this.findControlDeckSlot(slotId);
        if (!slot) return;
        const element = document.getElementById(`lcd-slot-${slot.id}`);
        element?.classList.add('running');
        if (slot.type === 'effect') {
            try {
                const ok = await this.previewEffectOnOBS(slot.effectId, { audioEnabled: Number(slot.volume) > 0, audioVolume: Number(slot.volume) || 0 });
                if (!ok) {
                    await this._legacyPreviewTriggerDoNotUse(slot.effectId);
                }
            } catch (e) {
                console.error('Trigger effect error:', e);
                await this._legacyPreviewTriggerDoNotUse(slot.effectId).catch(() => {});
            }
            setTimeout(() => element?.classList.remove('running'), 900);
            return;
        }
        // Any number of sound slots can be clicked — at most 3 play at once;
        // the rest wait in this.controlDeckSoundQueue and start, in the order
        // they were clicked, as playing sounds finish and free up a slot.
        this.controlDeckSoundQueue.push({ slot, element });
        this._processControlDeckSoundQueue();
    }

    _processControlDeckSoundQueue() {
        while (this.controlDeckAudios.length < 3 && this.controlDeckSoundQueue.length > 0) {
            const { slot, element } = this.controlDeckSoundQueue.shift();
            this._playControlDeckSound(slot, element);
        }
    }

    async _playControlDeckSound(slot, element) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = slot.url;
        audio.volume = Math.max(0, Math.min(1, Number.isFinite(Number(slot.volume)) ? Number(slot.volume) : 1));
        this.controlDeckAudios.push(audio);
        const release = () => {
            element?.classList.remove('running');
            this.controlDeckAudios = this.controlDeckAudios.filter((item) => item !== audio);
            this._processControlDeckSoundQueue();
        };
        audio.onended = release;
        audio.onerror = () => {
            this.showNotification('error', 'Không thể phát file âm thanh này.');
            release();
        };
        try {
            const mediaResponse = await fetch(slot.url, { method: 'HEAD', cache: 'no-store' });
            if (!mediaResponse.ok) throw new Error(`Không tìm thấy sound đã lưu trên máy (${mediaResponse.status}).`);
            await audio.play();
        } catch (error) {
            this.showNotification('error', error.message || 'Không thể phát sound. Hãy thêm lại file âm thanh.');
            release();
        }
    }

    stopControlDeckSounds() {
        this.controlDeckSoundQueue = [];
        this.controlDeckAudios.forEach((audio) => { audio.pause(); audio.currentTime = 0; });
        this.controlDeckAudios = [];
        document.querySelectorAll('.lcd-slot.running').forEach((element) => element.classList.remove('running'));
    }

    updateControlDeckVolume(slotId, percent) {
        const slot = this.findControlDeckSlot(slotId);
        if (!slot) return;
        slot.volume = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
        this.saveControlDeckState();
    }

    updateControlDeckQueueStatus(status = {}) {
        const currentId = String(status.currentEffectId || '');
        const queuedIds = new Set((status.queue || []).map((item) => String(item.effectId || '')));
        for (const slot of this.controlDeck?.effect?.slots || []) {
            const element = document.getElementById(`lcd-slot-${slot.id}`);
            const badge = element?.querySelector('.lcd-slot-status');
            if (!element || !badge) continue;
            const isRunning = status.status === 'playing' && currentId === String(slot.effectId);
            const isQueued = !isRunning && queuedIds.has(String(slot.effectId));
            element.classList.toggle('running', isRunning);
            element.classList.toggle('queued', isQueued);
            badge.textContent = isRunning
                ? `${(Math.max(0, Number(status.remainingMs) || 0) / 1000).toFixed(1)}s`
                : (isQueued ? 'Đang chờ' : '');
        }
    }

    removeControlDeckSlot(slotId) {
        for (const type of ['effect', 'sound']) this.controlDeck[type].slots = this.controlDeck[type].slots.filter((slot) => slot.id !== slotId);
        this.saveControlDeckState();
        this.renderControlDeck();
    }

    beginControlDeckHotkey(slotId) {
        this.showNotification('info', 'Nhấn tổ hợp phím muốn gán (Esc để hủy, Backspace để xóa).');
        const handler = (event) => {
            event.preventDefault(); event.stopPropagation();
            if (event.key === 'Escape') return window.removeEventListener('keydown', handler, true);
            const slot = this.findControlDeckSlot(slotId);
            if (!slot) return window.removeEventListener('keydown', handler, true);
            if (event.key === 'Backspace') slot.hotkey = '';
            else {
                const modifiers = [];
                if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
                if (event.altKey) modifiers.push('Alt');
                if (event.shiftKey) modifiers.push('Shift');
                const ignored = new Set(['Control', 'Meta', 'Alt', 'Shift']);
                if (ignored.has(event.key) || !modifiers.length) return;
                const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
                slot.hotkey = [...modifiers, key].join('+');
            }
            window.removeEventListener('keydown', handler, true);
            this.saveControlDeckState(); this.renderControlDeck();
        };
        window.addEventListener('keydown', handler, true);
    }

    async syncControlDeckHotkeys() {
        const bindings = ['effect', 'sound'].flatMap((type) => this.controlDeck[type].slots)
            .filter((slot) => slot.hotkey).map((slot) => ({ slotId: slot.id, accelerator: slot.hotkey }));
        await window.electronAPI?.invoke('control-deck:set-hotkeys', bindings).catch(() => null);
    }

    async uploadEffect() {
        const name = document.getElementById('upload-name').value;
        const category = document.getElementById('upload-category').value;
        const price = document.getElementById('upload-price').value;
        const originalPrice = document.getElementById('upload-original-price').value;
        const description = document.getElementById('upload-description').value;
        const icon = document.getElementById('upload-icon').value || '🎬';
        const fileInput = document.getElementById('upload-file');
        const thumbInput = document.getElementById('upload-thumb'); // ✅ Lấy thumb input

        if (!name || !price || !fileInput.files[0]) {
            this.showNotification('warning', '⚠️ Điền đủ thông tin!');
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        formData.append('category', category);
        formData.append('price', price);
        formData.append('originalPrice', originalPrice || '0');
        formData.append('description', description);
        formData.append('icon', icon);

        // ✅ Thêm thumb vào formData nếu có
        if (thumbInput && thumbInput.files[0]) {
            formData.append('thumb', thumbInput.files[0]);
        }

        formData.append('effectFile', fileInput.files[0]);

        const isComposite = document.getElementById('upload-composite').checked;
        formData.append('isComposite', isComposite);

        const isFlashSale = document.getElementById('upload-flash-sale') ? document.getElementById('upload-flash-sale').checked : false;
        formData.append('isFlashSale', isFlashSale);

        const fsPrice = document.getElementById('upload-flash-sale-price') ? document.getElementById('upload-flash-sale-price').value : '';
        const fsEnds = document.getElementById('upload-flash-sale-ends') ? document.getElementById('upload-flash-sale-ends').value : '';

        formData.append('flashSalePrice', fsPrice || '0');
        formData.append('flashSaleEndsAt', fsEnds || '');

        try {
            this.showNotification('info', '⏳ Đang upload...');
            const response = await fetch(this.API_URL + '/api/effects', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification('success', '✅ Đã tải lên thành công!');
                document.getElementById('upload-name').value = '';
                document.getElementById('upload-price').value = '';
                document.getElementById('upload-original-price').value = '';
                if (document.getElementById('upload-flash-sale-price')) document.getElementById('upload-flash-sale-price').value = '';
                if (document.getElementById('upload-flash-sale-ends')) document.getElementById('upload-flash-sale-ends').value = '';
                document.getElementById('upload-description').value = '';
                document.getElementById('upload-icon').value = '';
                fileInput.value = '';
                if (thumbInput) thumbInput.value = ''; // ✅ Reset thumb input
                this.loadAdminDashboard();
                this.loadEffects();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showNotification('error', '❌ ' + error.message);
        }
    }

    async prepareEditEffect(id) {
        try {
            const res = await fetch(`${this.API_URL}/api/effects/item/${id}`);
            const data = await res.json();
            if (data.success) {
                const e = data.effect;
                document.getElementById('edit-effect-id').value = e._id;
                document.getElementById('edit-name').value = e.name;
                document.getElementById('edit-category').value = e.category;
                document.getElementById('edit-price').value = e.price;
                document.getElementById('edit-original-price').value = e.originalPrice || 0;
                document.getElementById('edit-description').value = e.description || '';
                document.getElementById('edit-icon').value = e.icon || '';
                const editTrendingEl = document.getElementById('edit-is-trending');
                if (editTrendingEl) editTrendingEl.checked = !!e.isTrending;
                const editFlashSaleEl = document.getElementById('edit-is-flash-sale');
                if (editFlashSaleEl) editFlashSaleEl.checked = !!e.isFlashSale;

                if (document.getElementById('edit-flash-sale-price')) {
                    document.getElementById('edit-flash-sale-price').value = e.flashSalePrice || 0;
                }
                if (document.getElementById('edit-flash-sale-ends')) {
                    if (e.flashSaleEndsAt) {
                        try {
                            const date = new Date(e.flashSaleEndsAt);
                            const offset = date.getTimezoneOffset();
                            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                            document.getElementById('edit-flash-sale-ends').value = localDate.toISOString().slice(0, 16);
                        } catch (err) {
                            document.getElementById('edit-flash-sale-ends').value = '';
                        }
                    } else {
                        document.getElementById('edit-flash-sale-ends').value = '';
                    }
                }
                document.getElementById('edit-effect-modal').classList.add('show');
            }
        } catch (e) { this.showNotification('error', 'Lỗi tải dữ liệu: ' + e.message); }
    }

    async updateEffect() {
        const id = document.getElementById('edit-effect-id').value;
        const name = document.getElementById('edit-name').value;
        const category = document.getElementById('edit-category').value;
        const price = document.getElementById('edit-price').value;
        const originalPrice = document.getElementById('edit-original-price').value;
        const fakeUses = document.getElementById('edit-fake-uses').value;
        const isTrending = document.getElementById('edit-is-trending').checked;
        const isFlashSale = document.getElementById('edit-is-flash-sale') ? document.getElementById('edit-is-flash-sale').checked : false;
        const fsPrice = document.getElementById('edit-flash-sale-price') ? document.getElementById('edit-flash-sale-price').value : '';
        const fsEnds = document.getElementById('edit-flash-sale-ends') ? document.getElementById('edit-flash-sale-ends').value : '';
        const description = document.getElementById('edit-description').value;
        const icon = document.getElementById('edit-icon').value;
        const thumbInput = document.getElementById('edit-thumb');

        const formData = new FormData();
        formData.append('name', name);
        formData.append('category', category);
        formData.append('price', price);
        formData.append('originalPrice', originalPrice);
        formData.append('fakeUses', fakeUses);
        formData.append('isTrending', isTrending);
        formData.append('isFlashSale', isFlashSale);
        formData.append('isComposite', document.getElementById('edit-composite') ? document.getElementById('edit-composite').checked : false);
        formData.append('flashSalePrice', fsPrice || '0');
        formData.append('flashSaleEndsAt', fsEnds);
        formData.append('description', description);
        formData.append('icon', icon);
        if (thumbInput.files[0]) formData.append('thumb', thumbInput.files[0]);

        try {
            this.showNotification('info', '⏳ Đang cập nhật...');
            const res = await fetch(`${this.API_URL}/api/effects/${id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', '✅ Cập nhật thành công!');
                this.closeEditModal();
                this.loadAdminDashboard();
                this.loadEffects();
            } else {
                this.showNotification('error', 'Lỗi: ' + (data.error || data.message));
            }
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }

    closeEditModal() {
        document.getElementById('edit-effect-modal').classList.remove('show');
    }

    adminPaymentText(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    closePendingPaymentsModal() {
        const modal = document.getElementById('admin-alert-modal');
        if (modal) modal.style.display = 'none';
        if (this.adminProofObjectUrl) {
            URL.revokeObjectURL(this.adminProofObjectUrl);
            this.adminProofObjectUrl = null;
        }
    }

    async openPendingPaymentsModal(preferredPaymentId = null) {
        const modal = document.getElementById('admin-alert-modal');
        const list = document.getElementById('admin-payment-review-list');
        const detail = document.getElementById('admin-payment-review-detail');
        if (!modal || !list || !detail) return;
        modal.style.display = 'flex';
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">Đang tải yêu cầu...</div>';
        detail.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#64748b;">Chọn một yêu cầu để kiểm tra</div>';
        try {
            const response = await fetch(`${this.API_URL}/api/payment/admin/payments`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Không thể tải yêu cầu');
            let payments = data.payments || [];
            if (payments.some((payment) => !payment.user)) {
                try {
                    const usersResponse = await fetch(`${this.API_URL}/api/admin/users`, {
                        headers: { 'Authorization': `Bearer ${this.authToken}` }
                    });
                    const usersData = await usersResponse.json();
                    if (usersResponse.ok && usersData.success && Array.isArray(usersData.users)) {
                        const usersById = new Map(usersData.users.map((user) => [String(user._id || user.id), user]));
                        payments = payments.map((payment) => ({
                            ...payment,
                            user: payment.user || usersById.get(String(payment.userId)) || null
                        }));
                    }
                } catch (userLookupError) {
                    console.warn('Unable to enrich pending payment users:', userLookupError);
                }
            }
            payments = payments.map((payment) => ({
                ...payment,
                products: Array.isArray(payment.products) && payment.products.length
                    ? payment.products
                    : (payment.effectIds || []).map((id) => ({
                        id: String(id),
                        name: String(id) === 'SUBSCRIPTION_BASIC'
                            ? 'Gói Basic · 30 ngày'
                            : (['SUBSCRIPTION_PRO', 'SUBSCRIPTION_BUSINESS'].includes(String(id)) ? 'Gói Pro · 30 ngày' : `Sản phẩm ${String(id).slice(-6)}`)
                    }))
            }));
            this.adminPendingPayments = payments
                .filter((payment) => payment.status === 'pending' || payment.status === 'processing')
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const count = this.adminPendingPayments.length;
            const countEl = document.getElementById('admin-modal-pending-count');
            if (countEl) countEl.textContent = count;
            this.renderPendingPaymentList();
            if (count) {
                const preferred = this.adminPendingPayments.find((payment) => String(payment._id) === String(preferredPaymentId));
                this.selectPendingPayment((preferred || this.adminPendingPayments[0])._id);
            } else {
                detail.innerHTML = '<div style="height:100%;display:grid;place-items:center;text-align:center;color:#94a3b8;"><div><div style="font-size:42px;margin-bottom:10px;">✅</div>Không còn yêu cầu nào đang chờ.</div></div>';
            }
        } catch (error) {
            list.innerHTML = `<div style="padding:18px;color:#fca5a5;">${this.adminPaymentText(error.message)}</div>`;
        }
    }

    renderPendingPaymentList() {
        const list = document.getElementById('admin-payment-review-list');
        if (!list) return;
        const payments = this.adminPendingPayments || [];
        if (!payments.length) {
            list.innerHTML = '<div style="padding:18px;text-align:center;color:#64748b;">Không có yêu cầu chờ duyệt</div>';
            return;
        }
        list.innerHTML = payments.map((payment, index) => {
            const userName = payment.user?.name || payment.user?.email || 'Không tìm thấy tài khoản';
            const product = payment.products?.map((item) => item.name).join(', ') || 'Chưa xác định';
            const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(payment.createdAt).getTime()) / 60000));
            return `
                <button type="button" onclick="app.selectPendingPayment('${payment._id}')" data-admin-payment-id="${payment._id}" style="text-align:left;padding:12px;border-radius:12px;border:1px solid ${index === 0 ? 'rgba(251,191,36,.28)' : 'rgba(255,255,255,.08)'};background:rgba(255,255,255,.035);color:#fff;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                        <strong style="font-size:12px;overflow:hidden;text-overflow:ellipsis;">${this.adminPaymentText(userName)}</strong>
                        <span style="color:#fbbf24;font-weight:800;font-size:12px;white-space:nowrap;">${this.formatPrice(payment.amount)}</span>
                    </div>
                    <div style="font-size:11px;color:#c4b5fd;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.adminPaymentText(product)}</div>
                    <div style="font-size:10px;color:${ageMinutes >= 60 ? '#fb923c' : '#64748b'};margin-top:6px;">Chờ ${ageMinutes < 60 ? `${ageMinutes} phút` : `${Math.floor(ageMinutes / 60)} giờ ${ageMinutes % 60} phút`} · ${this.adminPaymentText(payment.orderId || '')}</div>
                </button>
            `;
        }).join('');
    }

    async selectPendingPayment(paymentId) {
        const payment = (this.adminPendingPayments || []).find((item) => String(item._id) === String(paymentId));
        const detail = document.getElementById('admin-payment-review-detail');
        if (!payment || !detail) return;
        this.selectedAdminPaymentId = payment._id;
        document.querySelectorAll('[data-admin-payment-id]').forEach((button) => {
            const active = button.dataset.adminPaymentId === String(payment._id);
            button.style.borderColor = active ? '#fbbf24' : 'rgba(255,255,255,.08)';
            button.style.background = active ? 'rgba(251,191,36,.08)' : 'rgba(255,255,255,.035)';
        });
        const user = payment.user || {};
        const products = payment.products || [];
        const currentExpiry = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
        const baseExpiry = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const expectedExpiry = new Date(baseExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
        const isSubscription = (payment.effectIds || []).some((id) => String(id).startsWith('SUBSCRIPTION_'));
        detail.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px;">
                <div><div style="font-size:11px;color:#94a3b8;">MÃ ĐƠN</div><div style="font-size:18px;font-weight:900;margin-top:3px;">${this.adminPaymentText(payment.orderId || payment._id)}</div></div>
                <span style="padding:6px 10px;border-radius:999px;background:rgba(245,158,11,.12);color:#fbbf24;font-size:11px;font-weight:800;">CHỜ XÁC NHẬN</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                <div style="padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025);">
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:9px;">TÊN ĐĂNG NHẬP</div>
                    <div style="font-weight:800;">${this.adminPaymentText(user.name || user.email || 'Không tìm thấy tài khoản')}</div>
                    <div style="font-size:12px;color:#cbd5e1;margin-top:5px;">${this.adminPaymentText(user.email || payment.userId)}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:4px;">SĐT: ${this.adminPaymentText(user.phone || 'Chưa có')} · Gói hiện tại: ${this.adminPaymentText(user.subscription || 'free')}</div>
                </div>
                <div style="padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025);">
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:9px;">YÊU CẦU MUA</div>
                    ${products.map((item) => `<div style="font-weight:800;color:#c4b5fd;margin-bottom:4px;">${this.adminPaymentText(item.name)}</div>`).join('')}
                    <div style="font-size:20px;color:#fbbf24;font-weight:900;margin-top:7px;">${this.formatPrice(payment.amount)}</div>
                    ${isSubscription ? `<div style="font-size:11px;color:#94a3b8;margin-top:5px;">Thời hạn dự kiến sau duyệt: ${expectedExpiry.toLocaleDateString('vi-VN')}</div>` : ''}
                </div>
            </div>
            <div style="padding:12px 14px;border-radius:12px;background:rgba(59,130,246,.07);border:1px solid rgba(59,130,246,.18);font-size:11px;color:#bfdbfe;margin-bottom:14px;">
                Gửi lúc ${new Date(payment.createdAt).toLocaleString('vi-VN')} · ID tài khoản ${this.adminPaymentText(payment.userId)}
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">MINH CHỨNG CHUYỂN KHOẢN</div>
                <div id="admin-payment-proof" style="height:210px;border-radius:14px;border:1px dashed rgba(255,255,255,.14);display:grid;place-items:center;overflow:hidden;background:#050914;color:#64748b;">${payment.proofImage ? 'Đang tải biên lai...' : 'Không có ảnh biên lai'}</div>
            </div>
            <div style="padding:14px;border-top:1px solid rgba(255,255,255,.08);background:rgba(2,6,23,.45);border-radius:14px;">
                <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:7px;">Lý do nếu từ chối</label>
                <select id="admin-payment-reject-reason" style="width:100%;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px;margin-bottom:10px;">
                    <option value="">-- Chọn lý do --</option><option>Chưa nhận được tiền</option><option>Sai số tiền</option><option>Biên lai không hợp lệ</option><option>Giao dịch trùng</option><option>Sai nội dung chuyển khoản</option><option value="Lý do khác">Lý do khác</option>
                </select>
                <div style="display:flex;gap:10px;">
                    <button data-payment-id="${payment._id}" onclick="app.rejectPendingPayment('${payment._id}')" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fca5a5;font-weight:800;cursor:pointer;">Từ chối</button>
                    <button data-payment-id="${payment._id}" onclick="app.confirmPendingPayment('${payment._id}')" style="flex:2;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:900;cursor:pointer;">Xác nhận thanh toán</button>
                </div>
            </div>
        `;
        if (payment.proofImage) this.loadAdminPaymentProof(payment.proofImage);
    }

    async loadAdminPaymentProof(path) {
        const holder = document.getElementById('admin-payment-proof');
        if (!holder) return;
        try {
            const response = await fetch(`${this.API_URL}${path}`, { headers: { 'Authorization': `Bearer ${this.authToken}` } });
            if (!response.ok) throw new Error('Không tải được biên lai');
            const blob = await response.blob();
            if (this.adminProofObjectUrl) URL.revokeObjectURL(this.adminProofObjectUrl);
            this.adminProofObjectUrl = URL.createObjectURL(blob);
            holder.innerHTML = `<img src="${this.adminProofObjectUrl}" onclick="window.open(this.src)" style="width:100%;height:100%;object-fit:contain;cursor:zoom-in;" alt="Biên lai chuyển khoản">`;
        } catch (error) {
            holder.textContent = error.message;
            holder.style.color = '#fca5a5';
        }
    }

    async approvePayment(paymentId, closeModal = false) {
        this._paymentApprovals = this._paymentApprovals || new Set();
        if (this._paymentApprovals.has(String(paymentId))) {
            this.showNotification('info', 'Đơn này đang được xử lý, vui lòng chờ một chút.');
            return;
        }
        this._paymentApprovals.add(String(paymentId));
        document.querySelectorAll('[data-payment-id]').forEach((button) => {
            if (button.dataset.paymentId === String(paymentId)) button.disabled = true;
        });
        try {
            this.showAppLoadingOverlay('⏳ Đang duyệt đơn và kích hoạt dịch vụ...', 30);
            const res = await fetch(`${this.API_URL}/api/payment/admin/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ paymentId })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.processing) {
                    this.showNotification('info', 'Đơn đang được máy chủ xử lý. Danh sách sẽ tự cập nhật.');
                    setTimeout(() => this.loadAdminDashboard(), 1200);
                    return;
                }
                this.showNotification('success', data.duplicate
                    ? '✅ Đơn này đã được duyệt trước đó; quyền lợi không bị cộng trùng.'
                    : '✅ Đã duyệt đơn và kích hoạt dịch vụ thành công!');
                if (closeModal) this.closePendingPaymentsModal();
                await this.loadAdminDashboard();
            } else {
                this.showNotification('error', '❌ ' + (data.message || data.error || 'Không thể duyệt đơn.'));
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi kết nối máy chủ: ' + e.message);
        } finally {
            this.hideAppLoadingOverlay();
            this._paymentApprovals.delete(String(paymentId));
            document.querySelectorAll('[data-payment-id]').forEach((button) => {
                if (button.dataset.paymentId === String(paymentId)) button.disabled = false;
            });
        }
    }

    async confirmPendingPayment(paymentId) {
        const payment = (this.adminPendingPayments || []).find((item) => String(item._id) === String(paymentId));
        if (!payment) {
            await this.approvePayment(paymentId, true);
            return;
        }
        const account = payment.user?.email || payment.user?.name || payment.userId;
        const products = payment.products?.map((item) => item.name).join(', ') || 'sản phẩm đã chọn';
        if (!confirm(`Xác nhận đã nhận ${this.formatPrice(payment.amount)} và kích hoạt ${products} cho ${account}?`)) return;
        await this.approvePayment(paymentId, true);
    }

    async rejectPendingPayment(paymentId) {
        const reason = document.getElementById('admin-payment-reject-reason')?.value?.trim();
        if (!reason) {
            this.showNotification('warning', 'Vui lòng chọn lý do từ chối.');
            return;
        }
        if (!confirm(`Từ chối yêu cầu với lý do: ${reason}?`)) return;
        await this.rejectPayment(paymentId, reason, true);
    }

    async loadAdminEffectAcquisitions() {
        const container = document.getElementById('admin-acquisitions-list');
        if (!container) return;
        try {
            const response = await fetch(`${this.API_URL}/api/admin/effect-acquisitions`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Không thể tải thống kê hiệu ứng.');
            this.adminEffectAcquisitions = data.records || [];

            const summary = data.summary || {};
            const summaryEl = document.getElementById('admin-acquisition-summary');
            if (summaryEl) {
                const cards = [
                    ['Tổng lượt sở hữu', summary.totalAcquisitions || 0, '#a78bfa'],
                    ['Miễn phí', summary.freeAcquisitions || 0, '#34d399'],
                    ['Trả phí', summary.paidAcquisitions || 0, '#fbbf24'],
                    ['Lượt sử dụng', summary.totalUses || 0, '#22d3ee']
                ];
                summaryEl.innerHTML = cards.map(([label, value, color]) => `
                    <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);">
                        <div style="font-size:18px;font-weight:800;color:${color};">${value}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${label}</div>
                    </div>
                `).join('');
            }
            this.renderAdminEffectAcquisitions();
        } catch (error) {
            container.innerHTML = `<div class="empty-state" style="color:#fca5a5;">${this.adminPaymentText(error.message)}</div>`;
        }
    }

    renderAdminEffectAcquisitions() {
        const container = document.getElementById('admin-acquisitions-list');
        if (!container) return;
        const safe = (value) => this.adminPaymentText(value == null ? '' : value);
        const query = String(document.getElementById('admin-acquisition-search')?.value || '').trim().toLowerCase();
        const filter = document.getElementById('admin-acquisition-filter')?.value || 'all';
        const records = (this.adminEffectAcquisitions || []).filter((record) => {
            if (filter !== 'all' && record.acquisitionType !== filter) return false;
            if (!query) return true;
            return [record.user?.name, record.user?.email, record.user?.phone, record.effect?.name]
                .some((value) => String(value || '').toLowerCase().includes(query));
        });

        if (!records.length) {
            container.innerHTML = '<div class="empty-state">Không tìm thấy lượt sở hữu phù hợp.</div>';
            return;
        }
        const typeLabel = {
            free: ['MIỄN PHÍ', '#34d399', 'rgba(52,211,153,.1)'],
            paid: ['TRẢ PHÍ', '#fbbf24', 'rgba(251,191,36,.1)'],
            legacy: ['DỮ LIỆU CŨ', '#94a3b8', 'rgba(148,163,184,.1)']
        };
        container.innerHTML = `
            <table style="width:100%;border-collapse:collapse;min-width:900px;font-size:12px;">
                <thead style="position:sticky;top:0;background:#151b26;z-index:1;">
                    <tr style="color:#94a3b8;text-align:left;">
                        <th style="padding:10px;">Khách hàng</th><th style="padding:10px;">Hiệu ứng</th>
                        <th style="padding:10px;">Hình thức</th><th style="padding:10px;">Giá trị</th>
                        <th style="padding:10px;">Ngày sở hữu</th><th style="padding:10px;text-align:center;">Lượt dùng</th>
                        <th style="padding:10px;">Dùng gần nhất</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map((record) => {
                        const type = typeLabel[record.acquisitionType] || typeLabel.legacy;
                        const acquiredAt = record.acquiredAt ? new Date(record.acquiredAt).toLocaleString('vi-VN') : '—';
                        const lastUsedAt = record.lastUsedAt ? new Date(record.lastUsedAt).toLocaleString('vi-VN') : 'Chưa sử dụng';
                        const price = record.acquisitionPrice == null ? 'Chưa ghi nhận' : this.formatPrice(record.acquisitionPrice);
                        return `<tr style="border-top:1px solid rgba(255,255,255,.055);">
                            <td style="padding:11px 10px;"><div style="font-weight:700;color:#fff;">${safe(record.user?.name || 'Chưa đặt tên')}</div><div style="font-size:10px;color:#94a3b8;margin-top:3px;">${safe(record.user?.email)}</div><div style="font-size:10px;color:#64748b;">${safe(record.user?.phone || 'Chưa có SĐT')}</div></td>
                            <td style="padding:11px 10px;font-weight:650;color:#e2e8f0;">${safe(record.effect?.icon)} ${safe(record.effect?.name)}</td>
                            <td style="padding:11px 10px;"><span style="padding:4px 8px;border-radius:999px;color:${type[1]};background:${type[2]};font-size:9px;font-weight:800;">${type[0]}</span></td>
                            <td style="padding:11px 10px;color:#f8fafc;">${safe(price)}</td>
                            <td style="padding:11px 10px;color:#cbd5e1;">${safe(acquiredAt)}</td>
                            <td style="padding:11px 10px;text-align:center;font-weight:800;color:#22d3ee;">${Number(record.useCount || 0)}</td>
                            <td style="padding:11px 10px;color:#94a3b8;">${safe(lastUsedAt)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    async loadAdminDashboard() {
        console.log('Loading Admin Dashboard...');
        try {
            // Fetch stats
            const statsRes = await fetch(`${this.API_URL}/api/admin/stats`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const stats = await statsRes.json();
            console.log('Stats loaded:', stats);

            // ✅ KIỂM TRA NULL TRƯỚC KHI SET
            if (stats.success) {
                const totalEffectsEl = document.getElementById('admin-total-effects');
                const totalUsersEl = document.getElementById('admin-total-users');
                const totalRevenueEl = document.getElementById('admin-total-revenue');
                const pendingPaymentsEl = document.getElementById('admin-pending-payments');

                if (totalEffectsEl) totalEffectsEl.textContent = stats.stats.totalEffects || 0;
                if (totalUsersEl) totalUsersEl.textContent = stats.stats.totalUsers || 0;
                if (totalRevenueEl) totalRevenueEl.textContent = this.formatPrice(stats.stats.totalRevenue || 0);
                if (pendingPaymentsEl) pendingPaymentsEl.textContent = stats.stats.pendingPayments || 0;
            }

            const globalEndsEl = document.getElementById('global-flash-sale-ends');
            if (globalEndsEl) {
                const savedEnds = localStorage.getItem('es_global_flash_sale_ends');
                if (savedEnds) globalEndsEl.value = savedEnds;
            }

            // Fetch effects list
            const effectsRes = await fetch(`${this.API_URL}/api/admin/effects`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const effectsData = await effectsRes.json();
            console.log('Effects loaded:', effectsData);

            if (effectsData.success) {
                // Populate Trending select
                const trendingSelect = document.getElementById('admin-trending-select');
                if (trendingSelect) {
                    trendingSelect.innerHTML = '<option value="">-- Chọn Effect --</option>' +
                        effectsData.effects.map(e => `<option value="${e._id}">${e.icon || '🎬'} ${e.name}</option>`).join('');
                }

                // Render Trending list
                const trendingList = document.getElementById('admin-trending-list');
                if (trendingList) {
                    const trendingEffects = effectsData.effects.filter(e => e.isTrending);
                    if (trendingEffects.length === 0) {
                        trendingList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">🔥 Chưa có hiệu ứng xu hướng</div>';
                    } else {
                        trendingList.innerHTML = trendingEffects.map(e => `
                                    <div class="effect-item-row" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239,68,68,0.1); border-radius: 12px; padding: 12px; display:flex; align-items:center; gap:12px;">
                                        <div style="font-size:24px;">${e.icon || '🎬'}</div>
                                        <div style="flex:1; overflow:hidden;">
                                            <h4 style="font-size:13px; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.name}</h4>
                                            <div style="display:flex; align-items:center; gap:5px; margin-top:4px;">
                                                <span style="font-size:10px; color:var(--text-muted);">Mắt:</span>
                                                <input type="number" value="${e.fakeUses || 0}" 
                                                    onchange="app.quickUpdateFakeUses('${e._id}', this.value)"
                                                    style="width:60px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; font-size:10px; padding:2px 5px; border-radius:4px;">
                                            </div>
                                        </div>
                                        <button onclick="app.toggleTrendingItem('${e._id}', false)" 
                                            style="background:rgba(239,68,68,0.1); color:#ef4444; border:none; width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </div>
                                `).join('');
                    }
                }

                const container = document.getElementById('admin-effects-list');
                if (container) {
                    if (effectsData.effects.length === 0) {
                        container.innerHTML = '<div class="empty-state">📦 Chưa có effects nào</div>';
                    } else {
                        container.innerHTML = effectsData.effects.map(effect => `
                                    <div class="effect-item-row">
                                        <div class="effect-info-row">
                                            ${effect.icon ? `<span>${effect.icon}</span>` : ''}
                                            <div>
                                                <h4 style="display:flex; align-items:center; gap:8px;">
                                                    ${effect.name}
                                                    ${effect.isTrending ? '<span style="font-size:12px;" title="Hiệu ứng Hot">🔥</span>' : ''}
                                                    ${effect.isFlashSale ? '<span style="font-size:12px;" title="Đang Flash Sale">⚡</span>' : ''}
                                                </h4>
                                                <span>${this.getCategoryName(effect.category)} • ${this.formatPrice(effect.price)}</span>
                                            </div>
                                        </div>
                                        <div class="effect-actions">
                                            <button class="btn-sm-edit" onclick="app.prepareEditEffect('${effect._id}')">⚙️ Sửa</button>
                                            <button class="btn-sm-timeline" onclick="openTimelineEditor('${effect._id}', '${effect.name}')">🎬 Timeline</button>
                                            <button class="btn-sm-delete" onclick="app.deleteEffect('${effect._id}')">Xóa</button>
                                        </div>
                                    </div>
                                `).join('');
                    }
                }
            }

            // Fetch pending payments
            const token = this.authToken || localStorage.getItem('token') || '';
            const paymentsRes = await fetch(`${this.API_URL}/api/payment/admin/payments`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const paymentsData = await paymentsRes.json().catch(() => ({}));
            console.log('Payments loaded:', paymentsData);

            if (paymentsData.success) {
                const container = document.getElementById('admin-payments-list');
                if (container) {
                    const pending = (paymentsData.payments || []).filter(p => p.status === 'pending' || p.status === 'processing');
                    if (pending.length === 0) {
                        container.innerHTML = '<div class="empty-state">💳 Không có payment chờ</div>';
                    } else {
                        container.innerHTML = pending.map(p => {
                            const userName = p.user?.name || p.user?.email || p.userId || 'Khách hàng';
                            const productName = (p.products || []).map(pr => pr.name).join(', ') || `${p.effectIds?.length || 1} sản phẩm`;
                            return `
                                <div class="effect-item-row" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(251,191,36,0.25); border-radius: 12px; padding: 12px; display:flex; flex-direction:column; gap:8px;">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                        <div style="overflow:hidden;">
                                            <h4 style="font-size:13px; margin:0; color:#fbbf24; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">👤 ${this.adminPaymentText(userName)}</h4>
                                            <span style="font-size:10px; color:var(--text-muted);">🕒 ${new Date(p.createdAt).toLocaleString('vi-VN')}</span>
                                        </div>
                                        <div style="color: #4ade80; font-weight: 800; font-size: 14px;">${this.formatPrice(p.amount)}</div>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid rgba(255,255,255,0.08); padding-top:8px;">
                                        <span style="font-size:11px; color:#c4b5fd; font-weight:600;">📦 ${this.adminPaymentText(productName)}</span>
                                        <div style="display:flex; gap:6px;">
                                            <button data-payment-id="${p._id}" onclick="app.approvePendingPayment('${p._id}')" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">✅ Duyệt đơn</button>
                                            <button onclick="app.openPendingPaymentsModal('${p._id}')" style="background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,.3); padding:5px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">👁️ Xem</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }
            }

            // Fetch custom requests
            try {
                const requestsRes = await fetch(`${this.API_URL}/api/admin/effect-requests`, {
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                });
                const reqData = await requestsRes.json();
                if (reqData.success) {
                    const reqContainer = document.getElementById('admin-requests-list');
                    if (reqContainer) {
                        if (reqData.requests.length === 0) {
                            reqContainer.innerHTML = '<div class="empty-state">🎨 Không có yêu cầu thiết kế</div>';
                        } else {
                            reqContainer.innerHTML = reqData.requests.map(r => `
                                        <div class="effect-item-row">
                                            <div class="effect-info-row">
                                                <div>
                                                    <h4 style="margin-bottom:5px;">Khách hàng: ${r.name}</h4>
                                                    <span style="font-size:12px;color:var(--text-muted);">📞 Zalo/SĐT: ${r.phone}</span>
                                                    <div style="margin-top:6px; font-size:13px; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; color: #d1d5db;">
                                                        ${r.description}
                                                    </div>
                                                    <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
                                                        🕒 Gửi lúc: ${new Date(r.createdAt).toLocaleString('vi-VN')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="effect-actions">
                                                <button class="btn-sm-delete" onclick="app.deleteEffectRequest('${r._id}')">Xóa</button>
                                            </div>
                                        </div>
                                    `).join('');
                        }
                    }
                }
            } catch (err) {
                console.error('Load custom requests error:', err);
            }

            console.log('Admin Dashboard loaded successfully!');
            // Load danh sách users
            this.loadAdminUsers();
            this.loadAdminEffectAcquisitions();
            this.loadAiAssistantConfig();
        } catch (error) {
            console.error('Dashboard error:', error);
            this.showNotification('error', 'Lỗi load dashboard: ' + error.message);
        }
    }
    async deleteEffectRequest(id) {
        if (!confirm('⚠️ Bạn có chắc chắn muốn xóa yêu cầu thiết kế này?')) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/effect-requests/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', '✅ Đã xóa yêu cầu thành công!');
                this.loadAdminDashboard();
            } else {
                this.showNotification('error', 'Lỗi: ' + data.error);
            }
        } catch (e) {
            this.showNotification('error', 'Lỗi: ' + e.message);
        }
    }
    async deleteEffect(effectId) { if (!confirm('⚠️ Xóa effect?')) return; try { const res = await fetch(`${this.API_URL}/api/effects/${effectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}` } }); const data = await res.json(); if (data.success) { this.showNotification('success', '✅ Đã xóa'); this.loadAdminDashboard(); this.loadEffects(); } } catch (error) { this.showNotification('error', '❌ ' + error.message); } }
    async approvePendingPayment(paymentId, fromReviewModal = false) {
        if (!fromReviewModal && !confirm('Xác nhận đã nhận được tiền và duyệt đơn nạp này?')) return;
        await this.approvePayment(paymentId, fromReviewModal);
        this.loadAiAssistantConfig();
    }

    async rejectPayment(paymentId, reason = '', fromReviewModal = false) {
        if (!fromReviewModal) {
            await this.openPendingPaymentsModal(paymentId);
            return;
        }
        this._paymentRejections = this._paymentRejections || new Set();
        if (this._paymentRejections.has(String(paymentId))) return;
        this._paymentRejections.add(String(paymentId));
        document.querySelectorAll('[data-payment-id]').forEach((button) => {
            if (button.dataset.paymentId === String(paymentId)) button.disabled = true;
        });
        try {
            const res = await fetch(`${this.API_URL}/api/payment/admin/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ paymentId, reason })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Không thể từ chối yêu cầu');
            this.showNotification('success', 'Đã từ chối yêu cầu và lưu lý do.');
            await this.openPendingPaymentsModal();
            this.loadAdminDashboard();
        } catch (error) {
            this.showNotification('error', error.message);
        } finally {
            this._paymentRejections.delete(String(paymentId));
            document.querySelectorAll('[data-payment-id]').forEach((button) => {
                if (button.dataset.paymentId === String(paymentId)) button.disabled = false;
            });
        }
    }

    playNotificationChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.2, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12);
            gain2.gain.setValueAtTime(0.25, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.55);
        } catch (_e) {}
    }

    updateAdminBadges(count) {
        const headerBadge = document.getElementById('admin-notification-badge');
        const sidebarBadge = document.getElementById('admin-sidebar-pending-badge');
        if (headerBadge) {
            if (count > 0) {
                headerBadge.textContent = count;
                headerBadge.style.display = 'inline-block';
            } else {
                headerBadge.style.display = 'none';
            }
        }
        if (sidebarBadge) {
            if (count > 0) {
                sidebarBadge.textContent = count;
                sidebarBadge.style.display = 'inline-block';
            } else {
                sidebarBadge.style.display = 'none';
            }
        }
    }

    startAdminPendingPaymentsPoll() {
        if (this._adminPollInterval) clearInterval(this._adminPollInterval);
        const poll = async () => {
            const isAdmin = Boolean(
                this.currentUser?.isAdmin ||
                this.currentUser?.role === 'admin' ||
                this.currentUser?.email === 'admin@effectstore.vn' ||
                document.querySelector('.user-card .plan')?.textContent?.trim() === 'ADMIN'
            );
            if (!isAdmin) return;
            const token = this.authToken || localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch(`${this.API_URL}/api/payment/admin/payments`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json().catch(() => ({}));
                if (data.success && Array.isArray(data.payments)) {
                    const pendingList = data.payments.filter(p => p.status === 'pending' || p.status === 'processing');
                    const count = pendingList.length;
                    this.updateAdminBadges(count);
                    
                    const prevCount = this._prevPendingCount;
                    if (prevCount !== undefined && count > prevCount) {
                        this.playNotificationChime();
                        const newest = pendingList[0];
                        const userName = newest?.user?.name || newest?.user?.email || newest?.userId || 'Khách hàng';
                        const amountStr = newest ? this.formatPrice(newest.amount) : '';
                        this.showNotification('success', `🔔 [Admin]: Có ${count} đơn thanh toán mới (${userName} - ${amountStr}) đang chờ duyệt!`);
                    }
                    this._prevPendingCount = count;
                }
            } catch (_e) {}
        };
        poll();
        this._adminPollInterval = setInterval(poll, 8000);
    }

    async addToTrending() {
        const select = document.getElementById('admin-trending-select');
        const effectId = select.value;
        if (!effectId) return;
        await this.toggleTrendingItem(effectId, true);
        select.value = '';
    }

    async toggleTrendingItem(effectId, isTrending) {
        try {
            const formData = new FormData();
            formData.append('isTrending', isTrending);

            const res = await fetch(`${this.API_URL}/api/effects/${effectId}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', isTrending ? '🔥 Đã thêm vào xu hướng' : '✅ Đã gỡ khỏi xu hướng');
                this.loadAdminDashboard();
                this.loadTrending();
            }
        } catch (e) { this.showNotification('error', e.message); }
    }

    async quickUpdateFakeUses(effectId, value) {
        try {
            const formData = new FormData();
            formData.append('fakeUses', value);

            const res = await fetch(`${this.API_URL}/api/effects/${effectId}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', '👁 Đã cập nhật mắt xem');
                this.loadTrending();
            }
        } catch (e) { this.showNotification('error', e.message); }
    }

    async loadAdminUsers() {
        const container = document.getElementById('admin-users-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><br>Đang tải...</div>';
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

                        const planBadge = (u) => {
                const plan = resolvePlanDisplay(u);
                return `<span style="padding:2px 10px;border-radius:12px;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-size:11px;font-weight:700;">${plan.label}</span>`;
            };

            const formatTimeAgo = (date) => {
                if (!date) return 'Chưa rõ';
                const now = new Date();
                const past = new Date(date);
                const diffMs = now - past;
                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);
                const diffDay = Math.floor(diffHour / 24);

                if (diffSec < 60) return 'Vừa xong';
                if (diffMin < 60) return `${diffMin} phút trước`;
                if (diffHour < 24) return `${diffHour} giờ trước`;
                if (diffDay < 30) return `${diffDay} ngày trước`;
                return past.toLocaleDateString('vi-VN');
            };

            container.innerHTML = `
                        <div style="overflow-x:auto;">
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead>
                                    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">Người dùng</th>
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">Gói</th>
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">Hoạt động</th>
                                        <th style="padding:12px 16px;text-align:center;color:#6b7280;font-weight:600;">Gia hạn nhanh</th>
                                        <th style="padding:12px 16px;text-align:center;color:#6b7280;font-weight:600;">Xóa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.users.map(u => `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
                                            <td style="padding:12px 16px;">
                                                <div style="display:flex;align-items:center;gap:10px;">
                                                    <div style="width:36px;height:36px;border-radius:50%;background:${resolvePlanDisplay(u).avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:${resolvePlanDisplay(u).avatarColor};flex-shrink:0;">
                                                        ${(u.name || u.email || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style="font-weight:600;color:#fff;">${u.name || '(chưa đặt tên)'}</div>
                                                        <div style="font-size:11px;color:#6b7280;">${u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="padding:12px 16px;">${planBadge(u)}</td>
                                            <td style="padding:12px 16px;">
                                                <div style="color:${(new Date() - new Date(u.lastActive)) > 86400000 * 7 ? '#ef4444' : '#6b7280'}; font-size:12px;">
                                                    ${formatTimeAgo(u.lastActive)}
                                                </div>
                                                <div style="font-size:10px;color:#4b5563;">Ngày đk: ${new Date(u.createdAt).toLocaleDateString('vi-VN')}</div>
                                            </td>
                                            <td style="padding:12px 16px;text-align:center;">
                                                 ${u.isAdmin ? '<span style="color:#6b7280;font-size:12px;">—</span>' : `
                                                 <div style="display:flex;gap:6px;justify-content:center;align-items:center;">
                                                     <button onclick="app.upgradeSubscription('${u._id}','basic',30)" style="padding:5px 10px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;color:#f59e0b;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Cấp gói Basic 30 ngày</button>
                                                     <button onclick="app.upgradeSubscription('${u._id}','pro',30)" style="padding:5px 10px;background:rgba(236,72,153,0.1);border:1px solid rgba(236,72,153,0.3);border-radius:6px;color:#ec4899;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Set Pro 30 ngày</button>
                                                     <button onclick="app.upgradeSubscription('${u._id}','studio',3650)" style="padding:5px 10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10b981;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Set Studio</button>
                                                     ${u.subscription && u.subscription !== 'free' ? `<button onclick="app.upgradeSubscription('${u._id}','${u.subscription}',30,true)" style="padding:5px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:6px;color:#3b82f6;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Gia hạn 30 ngày</button>` : ''}
                                                     <button onclick="app.upgradeSubscription('${u._id}','free',0)" style="padding:5px 10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#ef4444;cursor:pointer;font-size:11px;font-weight:600;">Chuyển về gói miễn phí</button>
                                                 </div>`}
                                             </td>
                                            <td style="padding:12px 16px;text-align:center;">
                                                ${u.isAdmin ? '' : `<button onclick="app.deleteUser('${u._id}','${u.email}')" style="background:none;border:none;color:#4b5563;cursor:pointer;transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#4b5563'"><i class="fas fa-trash-alt"></i></button>`}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div style="padding:12px 16px;color:#6b7280;font-size:12px;border-top:1px solid rgba(255,255,255,0.04);margin-top:4px;">
                            Tổng: <strong style="color:#fff;">${data.users.length}</strong> người dùng
                        </div>
                    `;
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">❌ Lỗi tải danh sách: ${err.message}</div>`;
        }
    }

        async upgradeSubscription(userId, plan, durationDays, extend = false) {
        const planLabel = { basic: 'Basic', pro: 'Pro', business: 'Pro', studio: 'Studio', free: 'Miễn phí' }[plan] || plan;
        const msg = plan === 'free'
            ? `Chuyển tài khoản về gói miễn phí?`
            : (extend ? `Gia hạn thêm gói ${planLabel} thêm ${durationDays} ngày?` : `Đặt gói ${planLabel} trong ${durationDays} ngày?`);
        if (!confirm(msg)) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users/${userId}/subscription`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ plan, durationDays, extend })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', extend ? `✅ Đã gia hạn thành công!` : `✅ Đã đặt gói ${planLabel}!`);
                this.loadAdminUsers();
            } else {
                this.showNotification('error', '❌ Lỗi: ' + data.error);
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi kết nối: ' + e.message);
        }
    }
    async deleteUser(userId, email) {
        if (!confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA tài khoản ${email}?\nHành động này không thể hoàn tác!`)) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', '🗑️ Đã xóa người dùng');
                this.loadAdminDashboard();
            } else {
                this.showNotification('error', 'Lỗi: ' + data.error);
            }
        } catch (error) { this.showNotification('error', '❌ ' + error.message); }
    }
    // ===== PRICING MODAL FUNCTIONS =====
    showUpgradePopup(feature = 'general', message = '', recommendedPlan = null) {
        const now = Date.now();
        if (this._lastUpgradePopupAt && now - this._lastUpgradePopupAt < 1200) return;
        this._lastUpgradePopupAt = now;
        const featureCopy = {
            mappings: '30 hiệu ứng gắn quà',
            layouts: '10 thiết kế menu đã lưu',
            menuAssets: 'Tải ảnh/video riêng vào menu',
            templates: 'Nhiều mẫu menu chuyên nghiệp',
            menuAdvanced: 'Hiệu ứng động đẹp mắt',
            comments: 'Không giới hạn bình luận',
            tts: 'Không giới hạn đọc tên/TTS',
            goalTrackers: '10 bảng mục tiêu livestream',
            devices: 'Sử dụng gói phù hợp trên nhiều thiết bị',
            customEffects: 'Thêm nhiều hiệu ứng cá nhân để gán với quà tặng',
            automationAdvanced: 'Gộp nhiều hiệu ứng, chạy tuần tự và cooldown nâng cao'
        };
        const primaryBenefit = featureCopy[feature] || 'Menu quà tặng chuyên nghiệp';
        const currentPlan = resolvePlanKey(this.currentUser);
        const targetPlan = recommendedPlan || (currentPlan === 'free' ? 'basic' : (currentPlan === 'basic' ? 'pro' : 'studio'));
        const targetLabel = targetPlan === 'basic' ? 'Basic' : ((targetPlan === 'pro' || targetPlan === 'business') ? 'Pro' : 'Studio');
        const isBasicOffer = targetPlan === 'basic';
        const designerTrialFeatures = new Set(['templates', 'menuAdvanced', 'goalTrackers', 'talentParticipants', 'export']);
        const isFreeDesignerTrial = currentPlan === 'free' && designerTrialFeatures.has(feature);
        const modalTitle = isFreeDesignerTrial ? 'Thiết kế của bạn đã sẵn sàng ✨' : 'Bạn đã dùng hết giới hạn hiện tại';
        this.showModal(modalTitle, `
            <div style="color:#cbd5e1;font-size:14px;line-height:1.6;">
                ${message ? `<div style="padding:10px 12px;margin-bottom:14px;border-radius:10px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22);color:#fbbf24;">${this.escapeHtml ? this.escapeHtml(message) : message}</div>` : ''}
                ${isFreeDesignerTrial ? '<div style="padding:10px 12px;margin-bottom:14px;border-radius:10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:#a7f3d0;">Bạn vẫn có thể tiếp tục chỉnh sửa, lưu bản nháp và xem thử miễn phí ngay trên ứng dụng. Khi muốn đưa thiết kế này lên OBS, gói Basic sẽ mở khóa cho bạn.</div>' : ''}
                <div style="color:#fff;font-weight:800;margin-bottom:10px;">${isFreeDesignerTrial ? 'Với Basic, thiết kế này có thể hoạt động trực tiếp trên OBS:' : `Nếu cần thêm, gói ${targetLabel} sẽ giúp bạn mở rộng:`}</div>
                <div style="display:grid;gap:8px;margin-bottom:18px;">
                    <div>✓ ${primaryBenefit}</div>
                    ${isBasicOffer ? '<div>✓ 30 hiệu ứng gắn quà</div><div>✓ Menu quà tặng chuyên nghiệp</div><div>✓ Không giới hạn bình luận</div><div>✓ Không giới hạn đọc tên/TTS</div><div>✓ Tải ảnh/video riêng vào menu</div>' : '<div>✓ Không giới hạn hiệu ứng và layout</div><div>✓ Hiệu ứng chuyển động cao cấp</div><div>✓ Tùy chỉnh lớp nâng cao</div><div>✓ Tự động hóa livestream nâng cao</div><div>✓ Hỗ trợ ưu tiên</div>'}
                </div>
                <button onclick="app.closeModal();app.showPricing();" style="width:100%;padding:13px;border:0;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(249,115,22,.28);">${isFreeDesignerTrial ? 'XEM QUYỀN LỢI BASIC' : 'XEM GÓI PHÙ HỢP'}</button>
                <button onclick="app.closeModal();" style="width:100%;padding:11px;margin-top:8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:transparent;color:#94a3b8;font-weight:700;cursor:pointer;">${isFreeDesignerTrial ? 'Tiếp tục chỉnh sửa miễn phí' : 'Để sau, tiếp tục dùng gói hiện tại'}</button>
            </div>
        `);
    }

    handlePlanLimit(data, fallbackFeature = 'general') {
        if (!data || data.upgradeRequired !== true) return false;
        this.showUpgradePopup(data.feature || fallbackFeature, data.message || 'Tính năng này cần gói cao hơn.', data.recommendedPlan);
        return true;
    }

    showPricing() {
        console.log('💎 Opening Pricing Modal...');
        const modal = document.getElementById('pricing-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('show');

        const u = this.currentUser;
        const isAdmin = u && (u.isAdmin || u.hasAdminUI || u.role === 'admin' || u.email === 'admin@effectstore.vn');
        const rawSub = (u && (u.subscription || u.plan)) ? String(u.subscription || u.plan).toLowerCase() : 'free';
        const currentPlan = isAdmin ? 'admin' : (rawSub === 'basic' ? 'basic' : ((rawSub === 'pro' || rawSub === 'business') ? 'pro' : (rawSub === 'studio' ? 'studio' : 'free')));

        // Reset buttons
        const btnFree = document.getElementById('plan-btn-free');
        const btnPro = document.getElementById('plan-btn-pro');
        const btnBusiness = document.getElementById('plan-btn-business');
        const btnStudio = document.getElementById('plan-btn-studio');
        const rank = { free: 0, basic: 1, pro: 2, studio: 3, admin: 4 };
        const currentRank = isAdmin ? 4 : (rank[currentPlan] ?? 0);

        if (isAdmin) {
            if (btnFree) { btnFree.innerText = 'Đã bao gồm'; btnFree.classList.add('disabled'); }
            if (btnPro) { btnPro.innerText = 'Đã bao gồm'; btnPro.classList.add('disabled'); btnPro.onclick = null; }
            if (btnBusiness) { btnBusiness.innerText = 'Đã bao gồm'; btnBusiness.classList.add('disabled'); btnBusiness.onclick = null; }
            if (btnStudio) { btnStudio.innerText = 'Tài khoản quản trị'; btnStudio.classList.add('disabled'); btnStudio.onclick = null; }
        } else {
            if (btnFree) {
                btnFree.innerText = currentPlan === 'free' ? 'TIẾP TỤC DÙNG MIỄN PHÍ' : 'ĐÃ BAO GỒM';
                btnFree.className = 'plan-btn';
                btnFree.onclick = currentPlan === 'free' ? () => this.closePricing() : null;
                if (currentPlan !== 'free') btnFree.classList.add('disabled');
            }
            if (btnPro) {
                btnPro.innerText = currentPlan === 'basic' ? 'GÓI HIỆN TẠI' : (currentRank > 1 ? 'ĐÃ BAO GỒM' : 'NÂNG CẤP BASIC');
                btnPro.className = currentRank >= 1 ? 'plan-btn disabled' : 'plan-btn active';
                btnPro.onclick = currentRank >= 1 ? null : () => this.buySubscription('basic');
            }
            if (btnBusiness) {
                btnBusiness.innerText = currentPlan === 'pro' ? 'GÓI HIỆN TẠI' : (currentRank > 2 ? 'ĐÃ BAO GỒM' : 'NÂNG CẤP PRO');
                btnBusiness.className = currentRank >= 2 ? 'plan-btn disabled' : 'plan-btn';
                btnBusiness.onclick = currentRank >= 2 ? null : () => this.buySubscription('pro');
            }
            if (btnStudio && currentPlan === 'studio') {
                btnStudio.innerText = 'GÓI HIỆN TẠI';
                btnStudio.classList.add('disabled');
                btnStudio.onclick = null;
            }
        }

        console.log('✅ Pricing Modal updated for', isAdmin ? 'Admin' : currentPlan);
    }

    closePricing() {
        const modal = document.getElementById('pricing-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hidden');
        }
    }

    async buySubscription(plan) {
        const isBasic = plan === 'basic';
        const price = isBasic ? 199000 : 399000;
        const subCode = isBasic ? 'SUBSCRIPTION_BASIC' : 'SUBSCRIPTION_PRO';
        const planName = isBasic ? 'Basic' : 'Pro';

        // CRITICAL FIX: Set pendingEffects so confirmPaymentWithProof sends the correct code
        this.pendingEffects = [{ effectId: subCode, effectName: `Gói ${planName}` }];

        this.closePricing();

        try {
            this.showNotification('info', '⏳ Đang tạo mã QR thanh toán...');
            const response = await fetch(`${this.API_URL}/api/payment/create-qr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    effectIds: [subCode]
                })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Không thể tạo mã QR thanh toán.');

            const orderId = data.orderId || `SUB${Date.now()}`;
            const bank = data.bankInfo || {};
            const orderPrice = Number(data.amount ?? bank.amount ?? price);
            const formattedPrice = this.formatPrice(orderPrice);

            this.showModal(`Thanh toán nâng cấp ${planName}`, `
                        <div style="font-family: 'Inter', sans-serif; max-width: 650px; margin: 0 auto; color: #fff;">
                            <div style="display: flex; gap: 30px; align-items: flex-start;">
                                <!-- Left side: QR -->
                                <div style="flex: 1; text-align: center;">
                                    <div style="background: #fff; border-radius: 20px; padding: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 5px; background: linear-gradient(to right, var(--primary), var(--secondary));"></div>
                                        <img src="${data.qrCode}" alt="QR Code" style="width: 100%; height: auto; display: block; border-radius: 10px;">
                                        <div style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                            <img src="https://img.vietqr.io/image/MB-123456789-compact2.png" style="height: 14px; opacity: 0.5; display: none;"> <!-- Hidden helper -->
                                            <span style="color: #d4145a; font-size: 11px; font-weight: 800;">VIET</span><span style="color: #00b14f; font-size: 11px; font-weight: 800;">QR</span>
                                            <span style="color: #555; font-size: 12px; font-weight: 700;">${bank.bank}</span>
                                        </div>
                                    </div>
                                    <p style="margin-top: 15px; font-size: 12px; color: var(--text-secondary);">Quét mã bằng ứng dụng Ngân hàng hoặc Ví điện tử để thanh toán nhanh.</p>
                                </div>

                                <!-- Right side: Info -->
                                <div style="flex: 1.2;">
                                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px;">
                                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;">Gói dịch vụ</div>
                                            <div style="font-size: 18px; font-weight: 800; color: var(--primary);">${planName} (1 Tháng)</div>
                                        </div>

                                        <div style="display: flex; flex-direction: column; gap: 15px;">
                                            <div>
                                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Số tiền thanh toán</div>
                                                <div style="font-size: 22px; font-weight: 900; color: #fbbf24;">${formattedPrice}</div>
                                            </div>

                                            <div>
                                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Nội dung chuyển khoản</div>
                                                <div style="display: flex; gap: 8px;">
                                                    <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 8px 12px; border-radius: 8px; color: #10b981; font-weight: 700; font-family: monospace; font-size: 14px;">${bank.description || data.orderId}</div>
                                                    <button onclick="navigator.clipboard.writeText('${bank.description || data.orderId}'); app.showNotification('info', '📋 Đã sao chép nội dung')" style="padding: 0 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; cursor: pointer;"><i class="fas fa-copy"></i></button>
                                                </div>
                                            </div>

                                            <div style="font-size: 11px; color: rgba(239, 68, 68, 0.8); background: rgba(239, 68, 68, 0.05); padding: 10px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.1);">
                                                ⚠️ Lưu ý: Chuyển đúng nội dung để hệ thống tự động kích hoạt gói ngay lập tức.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 15px;">
                                <div style="display: flex; gap: 15px; align-items: center; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="flex: 1;">
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Minh chứng thanh toán (Duyệt nhanh hơn)</div>
                                        <div id="payment-proof-name" style="font-size: 11px; color: var(--primary);">Chưa chọn ảnh...</div>
                                    </div>
                                    <input type="file" id="payment-proof-input" accept="image/*" style="display:none;" onchange="app.previewPaymentProof(this)">
                                    <button onclick="document.getElementById('payment-proof-input').click()" style="padding: 10px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;">Chọn ảnh</button>
                                </div>

                                <div id="payment-status-indicator" style="text-align: center; color: var(--secondary); font-size: 12px; font-weight: 600; padding: 10px; background: rgba(236, 72, 153, 0.05); border-radius: 10px;">
                                    <i class="fas fa-spinner fa-spin"></i> Đang kết nối với cổng thanh toán...
                                </div>

                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${orderPrice})" style="width: 100%; padding: 18px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none; border-radius: 16px; color: #fff; font-weight: 800; font-size: 16px; cursor: pointer; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.3); transition: 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.filter='brightness(1.1)';" onmouseout="this.style.transform=''; this.style.filter='';">
                                    XÁC NHẬN ĐÃ CHUYỂN KHOẢN
                                </button>
                            </div>
                        </div>
                    `);

            this.startPaymentPolling(orderId, [subCode], orderPrice);

        } catch (error) {
            console.error('Buy Subscription error:', error);
            this.showNotification('error', '❌ Lỗi: ' + error.message);
        }
    }

    // ===== GIFT MAPPING FUNCTIONS =====
        initGiftMapping() {
        this.connectWebSocket();
        this.loadGifts();
        this.loadAiAssistantConfig();
        // Load wheels first so purchased Challenge Wheel products can appear
        // in the mapping library.
        this.loadChallengeWheels().then(() => this.loadEffectsForMapping());
        this.loadMappings();
        this.startEffectQueueStatusPolling();
        const triggerSelect = document.getElementById('mapping-trigger-type');
        if (triggerSelect) triggerSelect.onchange = () => this.updateMappingConfigPanel();
        const audioVolume = document.getElementById('mapping-audio-volume');
        if (audioVolume) audioVolume.oninput = () => {
            const output = document.getElementById('mapping-audio-volume-value');
            if (output) output.textContent = `${audioVolume.value}%`;
        };
    }

    startEffectQueueStatusPolling() {
        this.stopEffectQueueStatusPolling();
        this.refreshEffectQueueStatus();
        this.effectQueueStatusInterval = setInterval(() => {
            if (this.currentView !== 'gift-mapping') {
                this.stopEffectQueueStatusPolling();
                return;
            }
            this.refreshEffectQueueStatus();
        }, 500);
    }

    stopEffectQueueStatusPolling() {
        if (this.effectQueueStatusInterval) {
            clearInterval(this.effectQueueStatusInterval);
            this.effectQueueStatusInterval = null;
        }
    }

    isEffectQueueBusy() {
        return this.effectQueueStatus?.status && this.effectQueueStatus.status !== 'idle';
    }

    async refreshEffectQueueStatus() {
        try {
            const res = await fetch(`${this.API_URL}/api/queue/status`);
            if (!res.ok) return;
            const status = await res.json();
            this.effectQueueStatus = status;
            this.updateControlDeckQueueStatus(status);
            const hasLocalTestTimer = this.testMappingTimer && this.testMappingTimer.until > Date.now();
            if (!this.isEffectQueueBusy() && !hasLocalTestTimer) {
                this.activeTestMappingId = null;
            }
            this.updateMappingTestButtons();

            // Update Queue Status Panel UI
            const panel = document.getElementById('queue-status-panel');
            if (panel) {
                const isBusy = status && status.status !== 'idle';
                const currentEffect = document.getElementById('queue-current-effect');
                const currentDetails = document.getElementById('queue-current-details');
                const currentTime = document.getElementById('queue-current-time');
                const currentType = document.getElementById('queue-current-type');
                const lengthInfo = document.getElementById('queue-length-info');
                const nextEffect = document.getElementById('queue-next-effect');

                if (isBusy) {
                    if (currentEffect) currentEffect.textContent = status.currentEffectName || '--';
                    if (currentDetails) {
                        const sender = status.currentSender || 'System';
                        const gift = status.currentGiftName ? `${status.currentGiftName} (x${status.currentQuantity})` : '--';
                        currentDetails.textContent = `Người gửi: ${sender} | Quà: ${gift}`;
                    }
                    if (currentTime) {
                        const remSec = (Math.max(0, status.remainingMs || 0) / 1000).toFixed(1);
                        currentTime.textContent = `${remSec}s`;
                    }
                    if (currentType) {
                        const typeText = status.currentPlaybackType === 'live_mapping' ? 'TikTok Live' : 
                                         status.currentPlaybackType === 'test_mapping' ? 'Phát thử cách gán' :
                                         status.currentPlaybackType === 'preview_effect' ? 'Xem thử' : 'OBS Layer';
                        currentType.textContent = `Loại: ${typeText}`;
                    }
                    if (lengthInfo) {
                        lengthInfo.textContent = `${status.queueLength || 0} đang chờ`;
                    }
                    if (nextEffect) {
                        nextEffect.textContent = status.nextEffectName ? `Tiếp theo: ${status.nextEffectName}` : 'Tiếp theo: --';
                    }
                } else {
                    if (currentEffect) currentEffect.textContent = 'Nhàn rỗi';
                    if (currentDetails) currentDetails.textContent = 'Hàng đợi đang rảnh, sẵn sàng chạy hiệu ứng.';
                    if (currentTime) currentTime.textContent = '0.0s';
                    if (currentType) currentType.textContent = 'Loại: --';
                    if (lengthInfo) lengthInfo.textContent = '0 đang chờ';
                    if (nextEffect) nextEffect.textContent = 'Tiếp theo: --';
                }
            }
        } catch (error) {
            console.warn('Queue status check failed:', error);
        }
    }

    updateMappingTestButtons() {
        const buttons = document.querySelectorAll('.btn-test[data-mapping-id]');
        if (!buttons.length) return;

        const localTestBusy = this.testMappingTimer && this.testMappingTimer.until > Date.now();
        const busy = this.isEffectQueueBusy() || localTestBusy;
        const remainingSeconds = localTestBusy
            ? Math.max(0, (this.testMappingTimer.until - Date.now()) / 1000).toFixed(1)
            : Math.max(0, Number(this.effectQueueStatus?.remainingMs || 0) / 1000).toFixed(1);
        const queueLength = Number(this.effectQueueStatus?.queueLength || 0);
        const busyLabel = queueLength > 0 ? `⏳ Đang chạy (${queueLength} chờ)` : `⏳ ${remainingSeconds}s`;

        buttons.forEach((btn) => {
            const defaultLabel = btn.dataset.defaultLabel || '▶ Test';
            const mappingId = btn.dataset.mappingId;
            const hasLocalTestTimer = localTestBusy;
            const isActiveTest = (this.activeTestMappingId && mappingId === this.activeTestMappingId)
                || (hasLocalTestTimer && mappingId === this.testMappingTimer.mappingId);

            if (isActiveTest) return;

            btn.disabled = busy;
            btn.style.cursor = busy ? 'not-allowed' : 'pointer';
            btn.style.opacity = busy && !isActiveTest ? '0.55' : '';

            if (busy) {
                btn.innerHTML = isActiveTest ? busyLabel : '⏸ Đang bận';
            } else {
                btn.innerHTML = defaultLabel;
                btn.style.background = '';
                btn.style.transition = '0.3s';
            }
        });
    }


    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(`${this.WS_URL}?token=${encodeURIComponent(this.authToken || '')}`);
        this.ws.onopen = () => console.log('✅ WebSocket connected');
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketEvent(data);
            } catch (e) { console.error('Parse error:', e); }
        };
        this.ws.onerror = (error) => console.error('WebSocket error:', error);
        this.ws.onclose = () => setTimeout(() => this.connectWebSocket(), 3000);
    }

    handleWebSocketEvent(data) {
        switch (data.event) {
            case 'stats': this.updateStats(data.data); break;
            case 'gift': this.handleGift(data.data); break;
            case 'follow': this.handleFollow(data.data); break;
            case 'share': this.handleShare(data.data); break;
            case 'chat': this.handleChat(data.data); break;
            case 'remote_device_connected':
                this.handleRemoteDeviceConnected(data.data);
                break;
            case 'control_deck_trigger':
                if (data.data?.action === 'stop_all_sounds') {
                    this.stopControlDeckSounds();
                } else if (data.data?.slotId) {
                    this.triggerControlDeckSlot(data.data.slotId);
                }
                break;
            case 'control_deck_assign':
                if (data.data?.deckType === 'effect') {
                    const effect = data.data.item;
                    if (effect) this.addControlDeckEffectToSlot(effect, Number(data.data.index));
                } else if (data.data?.deckType === 'sound') {
                    const sound = data.data.item;
                    if (sound) {
                        this.pendingControlDeckIndex = Number(data.data.index);
                        this.addSoundLibraryItemToDeck(sound);
                    }
                }
                break;
            case 'control_deck_media_uploaded':
                this.handleRemoteMediaUploaded(data.data);
                break;
            case 'control_deck_remove':
                if (data.data?.slotId) this.removeControlDeckSlot(String(data.data.slotId));
                break;
            case 'effect_warning':
                this.showNotification('warning', data.data?.message || 'Hiệu ứng đã bị bỏ qua vì thiếu thời lượng.');
                break;
            case 'plan_limit_reached': this.handlePlanLimit(data.data, data.data?.feature); break;
            case 'ai_quota_exhausted':
                this.showNotification('info', 'Trợ lý AI đã dùng hết hạn mức phản hồi tháng này. Bình luận vẫn được nhận bình thường; bạn có thể nạp thêm ký tự khi cần.');
                break;
        }
    }

    async handleRemoteMediaUploaded(payload = {}) {
        const index = Number(payload.index);
        if (!Number.isInteger(index)) return;
        if (payload.deckType === 'sound' && payload.item) {
            this.controlDeckSoundLibrary = [
                ...(this.controlDeckSoundLibrary || []).filter((item) => String(item.id) !== String(payload.item.id)),
                payload.item
            ];
            this.pendingControlDeckIndex = index;
            this.addSoundLibraryItemToDeck(payload.item);
            this.showNotification('success', 'Điện thoại đã upload và thêm sound vào Soundboard.');
            return;
        }
        if (payload.deckType === 'effect' && payload.item) {
            await this.loadPersonalEffects();
            await this.loadOwnedEffects();
            const effectId = String(payload.item.id || payload.item._id || '');
            const effect = (this.personalEffects || []).find((item) => String(item.id || item._id) === effectId) || payload.item;
            this.addControlDeckEffectToSlot(effect, index);
            this.showNotification('success', 'Điện thoại đã upload và thêm effect vào Live Control.');
        }
    }

    updateStats(stats) {
        const el = (id) => document.getElementById(id);
        if (el('stat-gifts')) el('stat-gifts').textContent = stats.gifts || 0;
        if (el('stat-likes')) el('stat-likes').textContent = stats.likes || 0;
        if (el('stat-chats')) el('stat-chats').textContent = stats.chats || 0;
        if (el('stat-viewers')) el('stat-viewers').textContent = stats.viewers || 0;

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            if (stats.isLive) {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;"></span>Đang live';
                statusEl.style.background = 'rgba(16,185,129,0.2)';
            } else {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;display:inline-block;"></span>Chưa kết nối';
                statusEl.style.background = 'rgba(239,68,68,0.2)';
            }
        }
    }
    async prepareTikTok() {
        const roomId = document.getElementById('room-id')?.value.trim();
        if (!roomId) return this.showNotification('error', 'Vui lòng nhập Room ID!');
        try {
            this.showNotification('info', '🎬 Đang ở chế độ chuẩn bị. Hệ thống sẽ tự động kết nối khi bạn bắt đầu Live.');
            const res = await fetch(`${this.API_URL}/api/tiktok/prepare`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ roomId })
            });
            const data = await res.json();
            if (data.success) {
                this.setConnectBtnState('prepare');
            }
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }

    async connectTikTok() {
        const roomId = document.getElementById('room-id')?.value.trim();
        if (!roomId) return this.showNotification('error', 'Vui lòng nhập Room ID!');
        try {
            this.showNotification('info', 'Đang kết nối...');
            const res = await fetch(`${this.API_URL}/api/tiktok/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ roomId })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', '✅ Đã kết nối TikTok Live!');
                this.setConnectBtnState('connect');
                this.connectWebSocket();
            }
        } catch (e) {
            this.showNotification('error', 'Không thể kết nối. Có thể bạn chưa Live hoặc sai ID.');
        }
    }

    async disconnectTikTok() {
        try {
            await fetch(`${this.API_URL}/api/tiktok/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            this.showNotification('success', '✅ Đã ngắt kết nối!');
            this.setConnectBtnState('disconnect');
            this.updateStats({ isLive: false, gifts: 0, likes: 0, chats: 0, viewers: 0 });
            if (this.ws) this.ws.close();
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }

    setConnectBtnState(state) {
        const btnPrep = document.getElementById('btn-prepare');
        const btnConn = document.getElementById('btn-connect');
        const btnDisc = document.getElementById('btn-disconnect');
        if (!btnPrep || !btnConn || !btnDisc) return;

        // Reset
        [btnPrep, btnConn, btnDisc].forEach(b => {
            b.style.opacity = "0.4";
            b.style.transform = "scale(1)";
            b.style.boxShadow = "none";
        });

        if (state === 'prepare') {
            btnPrep.style.opacity = "1";
            btnPrep.style.transform = "scale(1.05)";
            btnPrep.style.boxShadow = "0 0 15px rgba(245, 158, 11, 0.4)";
        } else if (state === 'connect') {
            btnConn.style.opacity = "1";
            btnConn.style.transform = "scale(1.05)";
            btnConn.style.boxShadow = "0 0 15px rgba(16, 185, 129, 0.4)";
        } else if (state === 'disconnect') {
            btnDisc.style.opacity = "1";
        }
    }

    async loadGifts() {
        try {
            console.log('🎁 Loading gifts...');
            const res = await fetch(`${this.API_URL}/api/tiktok/gifts-library`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            console.log('Gifts data:', data);

            if (data.success && data.gifts) {
                this.allGiftsLibrary = data.gifts || [];
                const searchInput = document.getElementById('gift-search-input');
                this.filterGiftsForMapping(searchInput ? searchInput.value : '');
            } else {
                console.error('❌ No gifts data or load error');
            }
        } catch (e) {
            console.error('❌ Load gifts error:', e);
        }
    }

    setGiftCoinFilter(range, btnEl) {
        this.giftCoinFilterRange = range || 'all';
        const pills = document.querySelectorAll('.coin-filter-pill');
        pills.forEach(p => {
            p.classList.remove('active');
            p.style.background = 'rgba(255,255,255,0.04)';
            p.style.borderColor = 'rgba(255,255,255,0.1)';
            p.style.color = '#9ca3af';
        });

        if (btnEl) {
            btnEl.classList.add('active');
            btnEl.style.background = 'rgba(167,139,250,0.2)';
            btnEl.style.borderColor = 'rgba(167,139,250,0.4)';
            btnEl.style.color = '#c084fc';
        }

        this.filterGiftsForMapping();
    }

    toggleGiftSortOrder() {
        this.giftSortAscending = this.giftSortAscending === undefined ? false : !this.giftSortAscending;
        const btn = document.getElementById('btn-gift-sort');
        if (btn) {
            btn.innerHTML = this.giftSortAscending ? '🪙 ⬆️' : '🪙 ⬇️';
            btn.title = this.giftSortAscending ? 'Sắp xếp xu tăng dần' : 'Sắp xếp xu giảm dần';
        }
        this.filterGiftsForMapping();
    }

    filterGiftsForMapping(query = '') {
        const grid = document.getElementById('gifts-grid');
        if (!grid) return;

        const gifts = Array.isArray(this.allGiftsLibrary) ? [...this.allGiftsLibrary] : [];
        const searchInput = document.getElementById('gift-search-input');
        const searchTerm = query !== '' ? String(query).trim().toLowerCase() : (searchInput ? String(searchInput.value || '').trim().toLowerCase() : '');

        const range = this.giftCoinFilterRange || 'all';

        let giftsToDisplay = gifts.filter(g => {
            const coins = Number(g.coins || 1);
            let matchesRange = true;

            if (range === '1-10') matchesRange = coins >= 1 && coins <= 10;
            else if (range === '11-99') matchesRange = coins >= 11 && coins <= 99;
            else if (range === '100-500') matchesRange = coins >= 100 && coins <= 500;
            else if (range === '501-999') matchesRange = coins >= 501 && coins <= 999;
            else if (range === '1000+') matchesRange = coins >= 1000;

            let matchesSearch = true;
            if (searchTerm) {
                matchesSearch = (g.name && String(g.name).toLowerCase().includes(searchTerm)) ||
                                (g.id && String(g.id).toLowerCase().includes(searchTerm));
            }

            return matchesRange && matchesSearch;
        });

        // Apply Coin Sorting
        const isAscending = this.giftSortAscending !== false;
        giftsToDisplay.sort((a, b) => {
            const coinA = Number(a.coins || 1);
            const coinB = Number(b.coins || 1);
            return isAscending ? coinA - coinB : coinB - coinA;
        });

        if (giftsToDisplay && giftsToDisplay.length > 0) {
            grid.innerHTML = giftsToDisplay.map(g => {
                const isImage = g.icon && (g.icon.includes('/') || g.icon.includes('.'));
                const iconHtml = isImage
                    ? `<img src="${this.API_URL}${g.icon}" style="width:40px;height:40px;object-fit:contain;margin-bottom:5px;display:block;margin:0 auto;">`
                    : `<div style="font-size:32px;margin-bottom:5px;">${g.icon || '🎁'}</div>`;
                return `
                    <div class="gift-item" onclick="app.selectGift('${g.id}','${g.name}','${g.icon}')">
                        ${iconHtml}
                        <div class="gift-name">${g.name}</div>
                        <div class="gift-coins">${g.coins} xu</div>
                    </div>
                `;
            }).join('');
            console.log('✅ Filtered and rendered', giftsToDisplay.length, 'gifts');
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:30px;font-size:13px;">🔍 Không tìm thấy quà tặng phù hợp trong phân khúc này</div>';
        }
    }
    async loadEffectsForMapping() {
        try {
            console.log('🎬 Loading mapping effects...');
            const grid = document.getElementById('effects-mapping-grid');
            if (!grid) return;

            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            let res = await fetch(`${this.API_URL}/api/tiktok/available-effects`, { headers });
            if (res.status === 401 && this.authToken) {
                res = await this.retryUnauthorized(
                    res,
                    (token) => fetch(`${this.API_URL}/api/tiktok/available-effects`, { headers: { Authorization: `Bearer ${token}` } }),
                    () => fetch(`${this.API_URL}/api/tiktok/available-effects`)
                );
            }
            const data = await res.json().catch(() => ({ success: true, effects: this.storeEffects || [] }));
            const displayEffects = (data && data.success !== false && Array.isArray(data.effects))
                ? [...data.effects]
                : (this.storeEffects || []);
            // Gộp bản sao theo template hoặc nội dung. Các vòng quay cũ có thể
            // chưa có sourceTemplateId nên không được lọc mất khỏi thư viện.
            const seenWheelKeys = new Set();
            const uniqueWheels = (this.challengeWheels || []).filter((wheel) => {
                const contentKey = (wheel.segments || []).map((segment) => segment.label).join('|');
                const key = wheel.sourceTemplateId ? `source:${wheel.sourceTemplateId}` : `content:${wheel.name}|${contentKey}`;
                if (seenWheelKeys.has(key)) return false;
                seenWheelKeys.add(key);
                return true;
            });
            const catalogWheelIds = this.challengeWheelTemplateIds instanceof Set
                ? this.challengeWheelTemplateIds
                : new Set();
            const catalogWheels = catalogWheelIds.size
                ? uniqueWheels.filter((wheel) => wheel.sourceTemplateId && catalogWheelIds.has(String(wheel.sourceTemplateId)))
                : uniqueWheels;
            const visibleWheels = catalogWheels.length
                ? catalogWheels
                : (this.challengeWheelTemplateCount > 0 ? uniqueWheels.slice(0, this.challengeWheelTemplateCount) : uniqueWheels);
            const wheelEffects = visibleWheels.map((wheel) => ({
                _id: `challenge-wheel:${wheel._id}`,
                name: wheel.displayName || wheel.name || 'Vòng quay thử thách',
                icon: '🎡',
                isChallengeWheel: true,
                challengeWheelId: String(wheel._id),
                segments: Array.isArray(wheel.segments) ? wheel.segments : [],
                presentation: wheel.presentation && typeof wheel.presentation === 'object' ? wheel.presentation : {}
            }));
            displayEffects.push(...wheelEffects);
            if (wheelEffects.length && !document.getElementById('gift-menu-renderer-css')) {
                const rendererCss = document.createElement('link');
                rendererCss.id = 'gift-menu-renderer-css';
                rendererCss.rel = 'stylesheet';
                rendererCss.href = `${this.API_URL}/gift-menu-renderer.css?v=11`;
                document.head.appendChild(rendererCss);
            }
            const customEffects = displayEffects.filter(effect => effect?.isCustom);
            const purchasedEffects = displayEffects.filter(effect => !effect?.isCustom);

            this.personalEffects = customEffects;
            if (this.currentUser?.isAdmin) {
                this.mappingEffects = purchasedEffects;
            } else {
                this.ownedEffects = [...purchasedEffects, ...customEffects];
            }

            if (displayEffects && displayEffects.length > 0) {
                const resolveMediaUrl = (url) => {
                    if (!url) return '';
                    if (/^(https?|atom|file|data|blob):/i.test(url)) return url;
                    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
                    return `${this.API_URL}${cleanUrl}`;
                };

                grid.innerHTML = displayEffects.map(e => {
                    const effectId = e._id || e.id;
                    const thumbUrl = resolveMediaUrl(e.thumbUrl);
                    const videoUrl = resolveMediaUrl(e.previewUrl || e.fileUrl);
                    let previewHTML = '';

                    if (e.isChallengeWheel) {
                        const segments = (e.segments || []).filter(segment => segment && segment.label).slice(0, 8);
                        const presentation = e.presentation || {};
                        const savedRenderItem = presentation.renderItem && typeof presentation.renderItem === 'object'
                            ? presentation.renderItem
                            : null;
                        const sharedRenderer = window.MenuDesignerSharedRenderEngine;
                        if (savedRenderItem && sharedRenderer && typeof sharedRenderer.renderByType === 'function') {
                            const renderItem = {
                                ...savedRenderItem,
                                type: 'challenge-wheel',
                                segments: segments.length ? segments : savedRenderItem.segments
                            };
                            const refW = Math.max(1, Number(renderItem.lockedW || renderItem.w || renderItem.width || presentation.boardWidth) || 720);
                            const refH = Math.max(1, Number(renderItem.lockedH || renderItem.h || renderItem.height || presentation.boardHeight) || 760);
                            const previewSize = 128;
                            const previewScale = Math.min(previewSize / refW, previewSize / refH);
                            const renderedWheel = sharedRenderer.renderByType(renderItem, {
                                mode: 'overlay',
                                scale: 1,
                                apiBase: this.API_URL,
                                escapeText: true
                            });
                            previewHTML = `<div style="width:${previewSize}px;height:${previewSize}px;position:relative;overflow:hidden;"><div style="position:absolute;left:50%;top:50%;width:${refW}px;height:${refH}px;transform:translate(-50%,-50%) scale(${previewScale});transform-origin:center;pointer-events:none;">${renderedWheel}</div></div>`;
                        } else {
                        const colors = segments.map((segment, index) => segment.color || ['#4c00ff','#ec4899','#f59e0b','#06b6d4','#22c55e'][index % 5]);
                        const borderColor = presentation.borderColor || '#d6a84f';
                        const ringEffect = presentation.ringEffect || 'gold';
                        const ringShadow = ringEffect === 'fire'
                            ? '0 0 0 6px #ef2029,0 0 18px #f97316,0 0 28px #ef4444aa'
                            : ringEffect === 'electric'
                                ? '0 0 0 6px #22d3ee,0 0 18px #3b82f6,0 0 28px #22d3eeaa'
                                : ringEffect === 'neon'
                                    ? '0 0 0 6px #ec4899,0 0 18px #8b5cf6,0 0 28px #ec4899aa'
                                    : '0 0 0 6px #ef4444,0 0 18px #fbbf24';
                        const gradient = colors.length > 1
                            ? `conic-gradient(${colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`).join(',')})`
                            : 'conic-gradient(#8b5cf6 0 25%,#ec4899 25% 50%,#f59e0b 50% 75%,#06b6d4 75% 100%)';
                        const labels = segments.map((segment, index) => {
                            const angle = index * (360 / Math.max(segments.length, 1)) + (180 / Math.max(segments.length, 1));
                            const radians = (angle - 90) * Math.PI / 180;
                            return `<span style="position:absolute;left:${50 + Math.cos(radians) * 29}%;top:${50 + Math.sin(radians) * 29}%;width:28%;transform:translate(-50%,-50%) rotate(${angle + 90 > 180 && angle + 90 < 360 ? angle + 270 : angle + 90}deg);font-size:6px;line-height:1;color:#fff;text-shadow:0 1px 2px #000;text-align:center;white-space:normal;">${String(segment.label).replace(/[&<>"']/g, '')}</span>`;
                        }).join('');
                        previewHTML = `<div style="width:128px;height:128px;position:relative;display:grid;place-items:center;"><div style="position:absolute;inset:12px;border-radius:50%;background:${gradient};border:5px solid ${borderColor};box-shadow:${ringShadow};">${labels}<span style="position:absolute;inset:35%;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#60a5fa,#1d4ed8);border:4px solid #fbbf24;color:#fff;font-size:9px;font-weight:900;">QUAY</span></div><span style="position:absolute;top:0;left:50%;transform:translateX(-50%);color:#fef3c7;font-size:14px;text-shadow:0 0 6px #fbbf24;">▼</span></div>`;
                        }
                    } else {
                        const effectiveThumb = thumbUrl || (effectId ? resolveMediaUrl(`/uploads/thumbs/${effectId}.png`) : '');
                        const videoWithFrame = videoUrl ? (videoUrl.includes('#') ? videoUrl : `${videoUrl}#t=0.001`) : '';
                        
                        if (effectiveThumb && videoWithFrame) {
                            previewHTML = `
                                <img src="${effectiveThumb}" class="mapping-thumb-img" onerror="this.style.display='none'; const v=this.nextElementSibling; if(v && v.tagName==='VIDEO') { v.style.opacity='1'; v.play().catch(e=>{}); }">
                                <video src="${videoWithFrame}" class="mapping-video" muted loop playsinline preload="metadata"></video>
                            `;
                        } else if (effectiveThumb) {
                            previewHTML = `<img src="${effectiveThumb}" class="mapping-thumb-img" style="opacity:1;" onerror="this.style.display='none';">`;
                        } else if (videoWithFrame) {
                            previewHTML = `<video src="${videoWithFrame}" class="mapping-video" style="opacity:1;" muted loop playsinline preload="metadata"></video>`;
                        } else {
                            previewHTML = `<span style="font-size:32px;">🎬</span>`;
                        }
                    }

                    return `
                <div class="effect-mapping-item" data-effect-id="${effectId}" data-effect-name="${e.name || ''}" ${e.isChallengeWheel ? `data-wheel-id="${e.challengeWheelId}"` : ''} style="${e.isCustom ? 'border-color:rgba(34,197,94,.35);' : e.isChallengeWheel ? 'border-color:rgba(245,158,11,.55);' : ''}">
                    <div class="effect-mapping-thumb" 
                        onmouseenter="const v=this.querySelector('video'); if(v) { v.muted=true; const p=v.play(); if(p!==undefined) p.catch(()=>{}); }" 
                        onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                        ${previewHTML}
                    </div>
                    <div class="effect-mapping-info">
                        <div class="effect-mapping-name">${e.icon || '🎬'} ${e.name}</div>
                        ${e.isCustom ? '<div style="margin-top:3px;color:#34d399;font-size:10px;font-weight:800;">Hiệu ứng cá nhân</div>' : ''}
                    </div>
                </div>
            `}).join('');
                console.log('✅ Rendered', displayEffects.length, 'mapping effects');

                setTimeout(() => {
                    const effectItems = grid.querySelectorAll('.effect-mapping-item');
                    effectItems.forEach(item => {
                        const video = item.querySelector('video');

                        if (video) {
                            item.addEventListener('mouseenter', () => {
                                video.style.opacity = '1';
                                video.currentTime = 0;
                                video.play().catch(() => { });
                            });
                            item.addEventListener('mouseleave', () => {
                                video.style.opacity = '0';
                                video.pause();
                            });
                        }

                                                item.addEventListener('click', () => {
                            const wheelId = item.getAttribute('data-wheel-id');
                            if (wheelId) {
                                this.selectChallengeWheel(wheelId, item.getAttribute('data-effect-name') || 'Vòng quay thử thách', item);
                                return;
                            }
                            const effectId = item.getAttribute('data-effect-id');
                            const effectName = item.getAttribute('data-effect-name') || item.querySelector('.effect-mapping-name').textContent.trim();
                            this.selectEffect(effectId, effectName, item);
                        });

                    });
                }, 100);
            } else {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">Không có effect nào khả dụng cho tài khoản này.</div>';
            }
        } catch (e) {
            console.error('❌ Load effects mapping error:', e);
        }
    }
        selectGift(id, name, icon) {
        this.selectedGift = { id, name, icon };
        document.querySelectorAll('.gift-item').forEach(el => el.classList.remove('selected'));
        if (event && event.currentTarget) {
            event.currentTarget.classList.add('selected');
        }
        this.updateMappingConfigPanel();
    }

        selectChallengeWheel(wheelId, name, element) {
        const trigger = document.getElementById('mapping-trigger-type');
        const wheelSelect = document.getElementById('mapping-wheel-id');
        if (trigger) trigger.value = 'wheel';
        if (wheelSelect) wheelSelect.value = String(wheelId);
        this.selectedEffects = [];
        this.selectedEffect = null;
        document.querySelectorAll('.effect-mapping-item').forEach(el => {
            el.classList.remove('selected');
            el.style.border = '';
        });
        if (element) {
            element.classList.add('selected');
            element.style.border = '1px solid #f59e0b';
        }
        this.updateMappingConfigPanel();
        this.showNotification('success', `Đã chọn vòng quay: ${name}`);
    }

        selectEffect(id, name, element) {
        if (!this.selectedEffects) this.selectedEffects = [];
        const idx = this.selectedEffects.findIndex(x => x.id === id);
        const itemEl = element || (event && event.currentTarget);
        
        if (idx >= 0) {
            this.selectedEffects.splice(idx, 1);
            if (itemEl) {
                itemEl.classList.remove('selected');
                itemEl.style.border = '';
            }
        } else {
            this.selectedEffects.push({ id, name });
            if (itemEl) {
                itemEl.classList.add('selected');
                itemEl.style.border = '1px solid var(--primary)';
            }
        }
        this.selectedEffect = this.selectedEffects[0] || null;
        this.updateMappingConfigPanel();
    }

    updateMappingConfigPanel() {
        const panel = document.getElementById('mapping-config-panel');
        if (!panel) return;
        const triggerValue = document.getElementById('mapping-trigger-type')?.value || 'effect';
        const wheelId = document.getElementById('mapping-wheel-id')?.value || '';
        const hasWheelSelection = ['wheel', 'effect_and_wheel'].includes(triggerValue) && Boolean(wheelId);

        // Vòng quay không dùng selectedEffects, nhưng vẫn phải mở panel để lưu mapping.
        if (this.selectedGift && ((this.selectedEffects && this.selectedEffects.length > 0) || hasWheelSelection)) {
            panel.style.display = 'block';
            
            const giftEl = document.getElementById('config-selected-gift');
            const effectEl = document.getElementById('config-selected-effects');
            if (giftEl) {
                const isImg = this.selectedGift.icon && (
                    this.selectedGift.icon.includes('/') ||
                    this.selectedGift.icon.includes('.') ||
                    this.selectedGift.icon.startsWith('http')
                );
                const iconHtml = isImg
                    ? `<img src="${this.selectedGift.icon.startsWith('http') ? this.selectedGift.icon : this.API_URL + this.selectedGift.icon}" style="width:24px;height:24px;object-fit:contain;border-radius:4px;vertical-align:middle;margin-right:6px;">`
                    : `<span style="font-size:20px;vertical-align:middle;margin-right:6px;">${this.selectedGift.icon || '🎁'}</span>`;
                
                giftEl.innerHTML = `${iconHtml}<span style="vertical-align:middle;font-weight:700;">${this.selectedGift.name}</span>`;
            }
            if (effectEl) {
                const names = hasWheelSelection && (!this.selectedEffects || !this.selectedEffects.length)
                    ? '🎡 Vòng quay thử thách'
                    : this.selectedEffects.map(x => x.name).join(', ');
                effectEl.textContent = names;
                effectEl.title = names;
            }
            
            const modeField = document.getElementById('config-playback-mode-field');
            if (modeField) {
                modeField.style.display = this.selectedEffects.length > 1 ? 'block' : 'none';
            }
            const trigger = document.getElementById('mapping-trigger-type');
            const wheelField = document.getElementById('mapping-wheel-field');
            const wheelMode = trigger && ['wheel', 'effect_and_wheel'].includes(trigger.value);
            if (wheelField) wheelField.style.display = wheelMode ? 'block' : 'none';
        } else {
            panel.style.display = 'none';
        }
    }
    
    clearSelection() {
        this.selectedGift = null;
        this.selectedEffect = null;
        this.selectedEffects = [];
        document.querySelectorAll('.gift-item.selected, .effect-mapping-item.selected').forEach(el => {
            el.classList.remove('selected');
            if (el.classList.contains('effect-mapping-item')) {
                el.style.border = '';
            }
        });
        this.updateMappingConfigPanel();
    }


    async createMapping() {
        const triggerType = document.getElementById('mapping-trigger-type')?.value || 'effect';
        const wheelId = document.getElementById('mapping-wheel-id')?.value || '';
        if (!this.selectedGift) return;
        if (triggerType === 'effect' && (!this.selectedEffects || this.selectedEffects.length === 0)) return;
        if (['wheel', 'effect_and_wheel'].includes(triggerType) && !wheelId) {
            return this.showNotification('error', 'Hãy chọn hoặc tạo một vòng quay thử thách.');
        }
        try {
            const cooldownVal = document.getElementById('mapping-cooldown')?.value || 0;
            const cooldownActionVal = document.getElementById('mapping-cooldown-action')?.value || 'queue';
            const minQtyVal = document.getElementById('mapping-min-qty')?.value || 1;
            const maxQtyVal = document.getElementById('mapping-max-qty')?.value || '';
            const exactQtyVal = document.getElementById('mapping-exact-qty')?.value || '';
            const modeVal = document.getElementById('mapping-playback-mode')?.value || 'random';
            const audioEnabledVal = document.getElementById('mapping-audio-enabled')?.checked !== false;
            const audioVolumeVal = Number(document.getElementById('mapping-audio-volume')?.value ?? 100);

            const payload = {
                giftId: this.selectedGift.id, 
                giftName: this.selectedGift.name, 
                giftIcon: this.selectedGift.icon,
                effectId: this.selectedEffects[0]?.id || null,
                effectName: this.selectedEffects[0]?.name || '',
                effects: (this.selectedEffects || []).map(x => ({ effectId: x.id, effectName: x.name })),
                triggerType,
                wheelId: wheelId || null,
                playbackMode: modeVal,
                minQuantity: minQtyVal ? Number(minQtyVal) : 1,
                maxQuantity: maxQtyVal ? Number(maxQtyVal) : null,
                exactQuantity: exactQtyVal ? Number(exactQtyVal) : null,
                cooldown: cooldownVal ? Number(cooldownVal) : 0,
                cooldownAction: cooldownActionVal,
                audioEnabled: audioEnabledVal,
                audioVolume: Math.max(0, Math.min(100, audioVolumeVal)) / 100
            };

            const res = await fetch(`${this.API_URL}/api/tiktok/map-gift`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                const names = triggerType === 'wheel' ? 'Vòng quay thử thách' : triggerType === 'effect_and_wheel' ? `${this.selectedEffects.map(x => x.name).join(', ')} + vòng quay` : this.selectedEffects.map(x => x.name).join(', ');
                this.showNotification('success', `✅ Đã gán quà ${this.selectedGift.name} với: ${names}`);
                this.clearSelection();
                this.loadMappings();
            } else if (!this.handlePlanLimit(data, 'mappings')) {
                this.showNotification('error', data.message || data.error || 'Không thể tạo hiệu ứng gắn quà');
            }
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }


    async loadMappings() {
        try {
            console.log('📋 Loading mappings...');
            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            let res = await fetch(`${this.API_URL}/api/tiktok/mappings`, { headers });
            if (res.status === 401 && this.authToken) {
                res = await this.retryUnauthorized(
                    res,
                    (token) => fetch(`${this.API_URL}/api/tiktok/mappings`, { headers: { Authorization: `Bearer ${token}` } }),
                    () => fetch(`${this.API_URL}/api/tiktok/mappings`)
                );
            }
            const data = await res.json().catch(() => ({ success: true, mappings: [] }));
            const list = document.getElementById('mappings-list');
            console.log('Mappings list element:', list);

            if (data.success && list) {
                this.giftMappings = data.mappings || [];
                if (data.mappings && data.mappings.length > 0) {
                    list.innerHTML = data.mappings.map(m => {
                        const giftIconUrl = m.giftIcon && (m.giftIcon.startsWith('http') || m.giftIcon.startsWith('data:'))
                            ? m.giftIcon
                            : `${this.API_URL}${m.giftIcon}`;

                        // Kiểm tra xem có phải là ảnh không (dựa vào đuôi file hoặc bắt đầu bằng http)
                        const isImageIcon = m.giftIcon && (
                            m.giftIcon.includes('.') ||
                            m.giftIcon.includes('/') ||
                            m.giftIcon.startsWith('http') ||
                            m.giftIcon.length > 10 // Chuỗi dài thường là URL
                        );

                        const giftIconHtml = isImageIcon
                            ? `<img src="${giftIconUrl}" style="width:32px;height:32px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,0.05);padding:2px;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/679/679821.png'">`
                            : `<span style="font-size:24px;">${m.giftIcon || '🎁'}</span>`;

                                                let detailBadges = '';
                        let badges = [];
                        if (m.effects && m.effects.length > 1) {
                            const modeText = m.playbackMode === 'sequential' ? 'Tuần tự' : 'Ngẫu nhiên';
                            badges.push(`<span style="font-size:11px;color:#a78bfa;background:rgba(167,139,250,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(167,139,250,0.2);margin-left:6px;">Group: ${m.effects.length} effect (${modeText})</span>`);
                        }
                        
                        // Quantity triggers
                        if (m.exactQuantity !== undefined && m.exactQuantity !== null && m.exactQuantity > 0) {
                            badges.push(`<span style="font-size:11px;color:#fbbf24;background:rgba(251,191,36,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(251,191,36,0.2);margin-left:6px;">SL: chính xác ${m.exactQuantity}</span>`);
                        } else if ((m.minQuantity && m.minQuantity > 1) || (m.maxQuantity !== undefined && m.maxQuantity !== null && m.maxQuantity > 0)) {
                            let qtyText = '';
                            if (m.minQuantity && m.maxQuantity) qtyText = `SL: ${m.minQuantity} - ${m.maxQuantity}`;
                            else if (m.minQuantity) qtyText = `SL: >= ${m.minQuantity}`;
                            else if (m.maxQuantity) qtyText = `SL: <= ${m.maxQuantity}`;
                            badges.push(`<span style="font-size:11px;color:#fbbf24;background:rgba(251,191,36,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(251,191,36,0.2);margin-left:6px;">${qtyText}</span>`);
                        }
                        
                        // Cooldown
                        if (m.cooldown && m.cooldown > 0) {
                            const actionText = m.cooldownAction === 'ignore' ? 'Bỏ qua' : 'Vẫn xếp hàng';
                            badges.push(`<span style="font-size:11px;color:#ef4444;background:rgba(239,68,68,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(239,68,68,0.2);margin-left:6px;">Chờ: ${m.cooldown}s (${actionText})</span>`);
                        }
                        
                        if (badges.length > 0) {
                            detailBadges = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;width:100%;">${badges.join('')}</div>`;
                        }
                        const mappingAudioEnabled = m.audioEnabled !== false;
                        const mappingAudioPercent = Math.round(Math.max(0, Math.min(1,
                            Number.isFinite(Number(m.audioVolume)) ? Number(m.audioVolume) : 1
                        )) * 100);

                        return `
                                <div class="mapping-list-item" style="flex-wrap:wrap;height:auto;padding:12px 16px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                                        <div class="mapping-info">
                                            <div class="mapping-badge">
                                                ${giftIconHtml}
                                                <span style="font-size:14px;font-weight:600;">${m.giftName}</span>
                                            </div>
                                            <span style="color:var(--text-muted);font-size:16px;">▶</span>
                                            <div class="mapping-badge" style="background:rgba(240,147,251,0.1);border-color:rgba(240,147,251,0.2);">
                                                <span style="font-size:14px;font-weight:600;color:#f093fb;">${m.wheelId && (m.triggerType === 'wheel' || !m.effectId) ? `🎡 ${this.getChallengeWheelDisplayName(m.wheelId)}` : m.triggerType === 'effect_and_wheel' ? `${m.effects && m.effects.length > 0 ? m.effects.map(x => x.effectName).join(', ') : 'Hiệu ứng'} + 🎡 ${this.getChallengeWheelDisplayName(m.wheelId)}` : (m.effects && m.effects.length > 0 ? m.effects.map(x => x.effectName).join(', ') : (m.effectName || 'Không rõ'))}</span>
                                            </div>
                                        </div>
                                        <div class="mapping-actions">
                                            <button class="btn-sm btn-test" data-mapping-id="${m._id}" data-default-label="▶ Test" onclick="app.testMapping(event, '${m._id}')">▶ Test</button>
                                            <button class="btn-sm btn-delete" onclick="app.deleteMapping('${m._id}')">🗑️ Xóa</button>
                                        </div>
                                    </div>
                                    ${detailBadges}
                                    <div style="display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.06);">
                                        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#fff;white-space:nowrap;cursor:pointer;">
                                            <input type="checkbox" ${mappingAudioEnabled ? 'checked' : ''} onchange="app.updateMappingAudio('${m._id}', this.checked, document.getElementById('mapping-volume-${m._id}').value)">
                                            🔊 Âm thanh
                                        </label>
                                        <input id="mapping-volume-${m._id}" type="range" min="0" max="100" value="${mappingAudioPercent}" style="flex:1;max-width:220px;" oninput="document.getElementById('mapping-volume-value-${m._id}').textContent=this.value+'%'" onchange="app.updateMappingAudio('${m._id}', this.closest('.mapping-list-item').querySelector('input[type=checkbox]').checked, this.value)">
                                        <span id="mapping-volume-value-${m._id}" style="font-size:11px;color:#fbbf24;font-weight:700;min-width:34px;text-align:right;">${mappingAudioPercent}%</span>
                                    </div>
                                </div>
                            `
}).join('');
                    console.log('✅ Rendered', data.mappings.length, 'mappings');
                } else {
                    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Chưa có mapping nào. Chọn gift và effect để tạo mapping!</p>';
                }
                        } else {
                console.error('❌ No mappings data or list element not found');
            }
        } catch (e) {
            console.error('❌ Load mappings error:', e);
        }
    }

    async repairOBSSources() {
        const btn = document.getElementById('btn-repair-obs');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⚙️ Đang sửa...';
        }
        try {
            const res = await fetch(`${this.API_URL}/api/obs/repair-sources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            const data = await res.json();
            if (data.success) {
                const rep = data.report;
                const effectRep = rep.effect_player.repaired ? 'Đã sửa effect_player' : 'effect_player sẵn sàng';
                const overlayRep = rep.gift_menu_overlay.repaired ? 'Đã sửa gift_menu_overlay' : 'gift_menu_overlay sẵn sàng';
                this.showNotification('success', `🛠️ OBS Diagnostics: ${effectRep}, ${overlayRep}`);
            } else {
                this.showNotification('error', '❌ Lỗi sửa nguồn OBS: ' + (data.message || data.error));
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi kết nối sửa OBS: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🛠️ Sửa lỗi OBS';
            }
        }
    }


    async updateMappingAudio(id, audioEnabled, percent) {
        const audioVolume = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
        try {
            const response = await fetch(`${this.API_URL}/api/tiktok/mappings/${id}/audio`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ audioEnabled: Boolean(audioEnabled), audioVolume })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Không thể lưu âm lượng');
            const mapping = (this.giftMappings || []).find((entry) => String(entry._id) === String(id));
            if (mapping) {
                mapping.audioEnabled = Boolean(audioEnabled);
                mapping.audioVolume = audioVolume;
            }
            this.showNotification('success', audioEnabled ? `🔊 Âm lượng effect: ${Math.round(audioVolume * 100)}%` : '🔇 Đã tắt âm thanh effect');
        } catch (error) {
            this.showNotification('error', `Không thể lưu âm thanh: ${error.message}`);
            await this.loadMappings();
        }
    }

    async testMapping(event, id) {
        const btn = event.currentTarget;
        if (btn.disabled) return;

        if (this.testMappingTimer?.raf) cancelAnimationFrame(this.testMappingTimer.raf);
        this.testMappingTimer = null;

        btn.blur();

        const originalContent = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.position = 'relative';
            btn.style.overflow = 'hidden';
            btn.style.transition = 'none';
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            const token = localStorage.getItem('token');
            const mapping = (this.giftMappings || []).find((entry) => String(entry._id) === String(id));
            const wheelOnly = mapping?.wheelId && (mapping.triggerType === 'wheel' || !mapping.effectId);
            const testUrl = wheelOnly
                ? `${this.API_URL}/api/tiktok/challenge-wheels/${encodeURIComponent(mapping.wheelId)}/test`
                : `${this.API_URL}/api/tiktok/test-trigger`;
            const testBody = wheelOnly ? {} : { mappingId: id };
            const res = await fetch(testUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(testBody)
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                throw new Error(data.message || data.error || `Dịch vụ ứng dụng gặp lỗi ${res.status}.`);
            }

            this.showNotification('success', '🎬 Đã chạy thử hiệu ứng trên OBS!');

            this.activeTestMappingId = id;

            const resolvedDuration = Number(data.duration) || (wheelOnly ? 6.5 : 0);
            if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
                throw new Error('Không đọc được thời lượng hiệu ứng. Hãy kiểm tra tệp rồi thử lại.');
            }
            const totalDuration = Math.max(resolvedDuration * 1000, 1000);
            const finishAt = Date.now() + totalDuration;
            this.testMappingTimer = { mappingId: String(id), until: finishAt, raf: null };
            let lastShown = null;
            btn.style.background = `linear-gradient(90deg, #10b981 100%, rgba(0,0,0,0.3) 100%)`;
            this.updateMappingTestButtons();

            const tick = () => {
                const timeLeft = Math.max(0, finishAt - Date.now());
                const seconds = (timeLeft / 1000).toFixed(1);
                if (seconds !== lastShown) {
                    lastShown = seconds;
                    const percent = Math.max(0, (timeLeft / totalDuration) * 100);
                    btn.innerHTML = `<i class="fas fa-hourglass-half"></i> ${seconds}s`;
                    btn.style.background = `linear-gradient(90deg, #10b981 ${percent}%, rgba(0,0,0,0.3) ${percent}%)`;
                }
                if (timeLeft <= 0) {
                    this.activeTestMappingId = null;
                    this.testMappingTimer = null;
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                    btn.style.background = '';
                    btn.style.cursor = 'pointer';
                    btn.style.transition = '0.3s';
                    this.updateMappingTestButtons();
                    this.loadLogs?.();
                    return;
                }
                if (this.testMappingTimer) {
                    this.testMappingTimer.raf = requestAnimationFrame(tick);
                }
            };
            tick();
        } catch (e) {
            this.showNotification('error', 'Lỗi test OBS: ' + e.message);
            this.activeTestMappingId = null;
            this.testMappingTimer = null;
            this.updateMappingTestButtons();
            btn.disabled = false;
            btn.innerHTML = originalContent;
            btn.style.background = '';
            btn.style.cursor = 'pointer';
        }
    }
    async deleteMapping(id) {
        if (!confirm('Xóa mapping này?')) return;
        try {
            await fetch(`${this.API_URL}/api/tiktok/mappings/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            this.showNotification('success', 'Đã xóa mapping');
            this.loadMappings();
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(`${this.WS_URL}?token=${encodeURIComponent(this.authToken || '')}`);
        this.ws.onopen = () => console.log('✅ WebSocket connected');
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketEvent(data);
            } catch (e) { console.error('Parse error:', e); }
        };
        this.ws.onerror = (error) => console.error('WebSocket error:', error);
        this.ws.onclose = () => setTimeout(() => this.connectWebSocket(), 3000);
    }

    handleWebSocketEvent(data) {
        switch (data.event) {
            case 'stats': this.updateStats(data.data); break;
            case 'gift': this.handleGift(data.data); break;
            case 'follow': this.handleFollow(data.data); break;
            case 'share': this.handleShare(data.data); break;
            case 'chat': this.handleChat(data.data); break;
            case 'plan_limit_reached': this.handlePlanLimit(data.data, data.data?.feature); break;
            case 'ai_quota_exhausted':
                this.showNotification('info', 'Trợ lý AI đã dùng hết hạn mức phản hồi tháng này. Bình luận vẫn được nhận bình thường; bạn có thể nạp thêm ký tự khi cần.');
                break;
            case 'control_deck_trigger': this.handleControlDeckRemoteTrigger(data.data); break;
            case 'remote_device_connected':
                this.handleRemoteDeviceConnected(data.data);
                break;
            case 'control_deck_assign':
                if (data.data?.deckType === 'effect') {
                    const effect = data.data.item;
                    if (effect) this.addControlDeckEffectToSlot(effect, Number(data.data.index));
                } else if (data.data?.deckType === 'sound') {
                    const sound = data.data.item;
                    if (sound) {
                        this.pendingControlDeckIndex = Number(data.data.index);
                        this.addSoundLibraryItemToDeck(sound);
                    }
                }
                break;
            case 'control_deck_media_uploaded':
                this.handleRemoteMediaUploaded(data.data);
                break;
            case 'control_deck_remove':
                if (data.data?.slotId) this.removeControlDeckSlot(String(data.data.slotId));
                break;
            case 'effect_warning':
                this.showNotification('warning', data.data?.message || 'Hiệu ứng đã bị bỏ qua vì thiếu thời lượng.');
                break;
        }
    }

    handleControlDeckRemoteTrigger(data) {
        if (!data) return;
        if (data.action === 'stop_all_sounds') {
            this.stopControlDeckSounds();
            this.showNotification('info', '📱 Đã dừng tất cả âm thanh từ điện thoại từ xa.');
            return;
        }
        if (data.slotId) {
            this.triggerControlDeckSlot(data.slotId);
            this.showNotification('info', '📱 Đã kích hoạt nút từ điện thoại từ xa.');
        }
    }

    updateStats(stats) {
        const el = (id) => document.getElementById(id);
        if (el('stat-gifts')) el('stat-gifts').textContent = stats.gifts || 0;
        if (el('stat-likes')) el('stat-likes').textContent = stats.likes || 0;
        if (el('stat-chats')) el('stat-chats').textContent = stats.chats || 0;
        if (el('stat-viewers')) el('stat-viewers').textContent = stats.viewers || 0;

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            if (stats.isLive) {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;"></span>Đang live';
                statusEl.style.background = 'rgba(16,185,129,0.2)';
            } else {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;display:inline-block;"></span>Chưa kết nối';
                statusEl.style.background = 'rgba(239,68,68,0.2)';
            }
        }
    }

    async handleGift(giftData) {
        console.log('🎁 Gift received:', giftData);
        this.showNotification('info', `🎁 ${giftData.userName} tặng ${giftData.giftName}!`);

        // Phát giọng nói cảm ơn (nếu bật) - Đợi 800ms sau tiếng Ping cho rõ ràng
        if (this.isTTSGiftEnabled) {
            setTimeout(() => {
                const nickname = giftData.nickname || giftData.uniqueId || 'bạn';
                const giftName = giftData.giftName || 'quà';
                const quantity = giftData.repeatCount || giftData.quantity || 1;
                const coin = (giftData.diamondCount || 0) * quantity;

                let textToSpeak = this.ttsTemplate || 'Cảm ơn {username} đã tặng {quantity} {giftName} ❤️';
                textToSpeak = textToSpeak
                    .replace(/{username}/g, nickname)
                    .replace(/{giftName}/g, giftName)
                    .replace(/{quantity}/g, quantity)
                    .replace(/{coin}/g, coin);

                this.speakText(textToSpeak);

                // Nếu đủ ngưỡng xu, đưa vào danh sách chờ đọc comment
                if ((giftData.diamondCount || 0) >= this.ttsThreshold) {
                    this.pendingDonors.set(giftData.userId, {
                        nickname: nickname,
                        timestamp: Date.now()
                    });
                    // Xóa sau 60 giây nếu họ không comment
                    setTimeout(() => this.pendingDonors.delete(giftData.userId), 60000);
                }
            }, 800);
        }

        // OBS is triggered once by the backend queue for a real TikTok gift.
    }

    async handleFollow(data) {
        const nickname = data.nickname || data.uniqueId || 'bạn mới';
        this.showNotification('success', `👤 ${nickname} vừa Follow!`);
        if (this.isTTSFollowEnabled) {
            let textToSpeak = this.ttsFollowTemplate || 'Cảm ơn {username} đã follow kênh nhé! ❤️';
            textToSpeak = textToSpeak.replace(/{username}/g, nickname);
            this.speakText(textToSpeak);
        }
    }

    async handleShare(data) {
        const nickname = data.nickname || data.uniqueId || 'bạn mới';
        this.showNotification('info', `📢 ${nickname} vừa Share!`);
        this.speakText(`Cảm ơn ${nickname} đã chia sẻ livestream nhé!`);
    }

    handleChat(data) {
        const donor = this.pendingDonors.get(data.userId);
        if (donor) {
            // Nếu là người vừa donate khủng, đọc comment của họ
            this.speakText(`${donor.nickname} nhắn là: ${data.comment}`, false, 'comment');
            this.pendingDonors.delete(data.userId); // Chỉ đọc 1 lần duy nhất
        }
    }

    // Redundant TikTok connection methods removed to prevent UI state conflicts.
    // These methods were previously defined above and are already handled.
    async loadLogs() {
        try {
            console.log('📜 Loading logs...');
            const res = await fetch(`${this.API_URL}/api/tiktok/logs`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            const tbody = document.getElementById('logsTable');
            if (tbody) {
                if (data.success && data.logs && data.logs.length > 0) {
                    tbody.innerHTML = data.logs.map(log => `
                                <tr>
                                    <td>${new Date(log.triggeredAt).toLocaleString('vi-VN')}</td>
                                    <td>🎁 ${log.giftName}</td>
                                    <td>🎬 ${log.effectName || 'Không rõ'}</td>
                                    <td>${log.userName || 'N/A'}</td>
                                    <td style="color:#00ff88;">✅</td>
                                </tr>
                            `).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#666;">Chưa có log nào</td></tr>';
                }
            }
        } catch (e) {
            console.error('Lỗi load logs:', e);
        }
    }

    // ===== SETTINGS CONTROLLER =====
    async loadSettings() {
        // Fetch freshest user data
        try {
            if (this.authToken) {
                const res = await fetch(`${this.API_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.currentUser = data.user;
                }
            }
        } catch (e) { console.error('Error fetching user for settings:', e); }

        const u = this.currentUser;
        if (!u) return;

        const operationsCard = document.getElementById('admin-operations-card');
        if (operationsCard) operationsCard.style.display = u.isAdmin === true ? 'block' : 'none';
        if (u.isAdmin === true) this.loadDatabaseBackups();

        // 1. Load Account
        const nameEl = document.getElementById('settings-name');
        const emailEl = document.getElementById('settings-email');
        const avatarEl = document.getElementById('settings-avatar');
        const badgeEl = document.getElementById('settings-plan-badge');
        const expiryEl = document.getElementById('settings-plan-expiry');

        if (nameEl) nameEl.textContent = u.name || u.email;
        if (emailEl) emailEl.textContent = u.email;
        if (avatarEl) {
            avatarEl.textContent = (u.name || 'U')[0].toUpperCase();
            const avatarPlan = resolvePlanDisplay(u);
            avatarEl.style.background = avatarPlan.avatarBg;
            avatarEl.style.color = avatarPlan.avatarColor;
        }

        if (badgeEl) {
            const plan = resolvePlanDisplay(u);
            badgeEl.innerHTML = `<span style="font-size:11px;padding:4px 12px;border-radius:12px;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</span>`;
        }

        if (expiryEl) {
            if (u.isAdmin) {
                expiryEl.textContent = 'Vĩnh viễn';
            } else if (u.subscriptionExpiresAt) {
                const expiry = new Date(u.subscriptionExpiresAt);
                const now = new Date();
                const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
                expiryEl.textContent = diff > 0 ? `Còn ${diff} ngày (${expiry.toLocaleDateString('vi-VN')})` : 'Đã hết hạn';
            } else {
                expiryEl.textContent = 'Không khả dụng';
            }
        }

        // 2. Load OBS Settings from Backend
        try {
            const res = await fetch(`${this.API_URL}/api/settings/obs`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('settings-obs-host').value = data.host || 'localhost';
                document.getElementById('settings-obs-port').value = data.port || 4455;
                document.getElementById('settings-obs-password').value = data.password || '';
            }
        } catch (e) { console.error('Error loading OBS settings:', e); }

        // 3. Load TikTok Settings & Preferences from LocalStorage
        const tkUserEl = document.getElementById('settings-tiktok-username');
        if (tkUserEl) tkUserEl.value = localStorage.getItem('tiktok_username') || '';

        const tkAutoEl = document.getElementById('settings-tiktok-auto');
        if (tkAutoEl) tkAutoEl.checked = localStorage.getItem('tiktok_auto_reconnect') === 'true';

        const soundAlertValue = localStorage.getItem('sound_alert') !== 'false';
        const soundEl = document.getElementById('settings-sound-alert');
        if (soundEl) soundEl.checked = soundAlertValue;

        const soundQuickEl = document.getElementById('settings-sound-alert-quick');
        if (soundQuickEl) soundQuickEl.checked = soundAlertValue;

        const ttsGiftEl = document.getElementById('settings-tts-gift');
        if (ttsGiftEl) ttsGiftEl.checked = localStorage.getItem('es_tts_gift_enabled') !== 'false';

        const ttsFollowEl = document.getElementById('settings-tts-follow');
        if (ttsFollowEl) ttsFollowEl.checked = localStorage.getItem('es_tts_follow_enabled') !== 'false';

        const ttsThresholdEl = document.getElementById('settings-tts-threshold');
        if (ttsThresholdEl) ttsThresholdEl.value = localStorage.getItem('es_tts_threshold') || '10';

        const ttsSpeedEl = document.getElementById('settings-tts-speed');
        if (ttsSpeedEl) ttsSpeedEl.value = localStorage.getItem('es_tts_speed') || '1.0';

        const ttsTemplateEl = document.getElementById('settings-tts-template');
        if (ttsTemplateEl) ttsTemplateEl.value = localStorage.getItem('es_tts_template') || 'Cảm ơn {username} đã tặng {quantity} {giftName} ❤️';

        const ttsFollowTemplateEl = document.getElementById('settings-tts-follow-template');
        if (ttsFollowTemplateEl) ttsFollowTemplateEl.value = localStorage.getItem('es_tts_follow_template') || 'Cảm ơn {username} đã follow kênh nhé! ❤️';

        const startupEl = document.getElementById('settings-run-startup');
        if (startupEl) startupEl.checked = localStorage.getItem('run_startup') === 'true';

        // Load danh sách giọng đọc
        this.loadVoices();
        this.loadAiAssistantConfig();

        // Populate the connection username input automatically if default exists
        const defaultUser = localStorage.getItem('tiktok_username');
        const liveUserInput = document.getElementById('room-id');
        if (defaultUser && liveUserInput && !liveUserInput.value) {
            liveUserInput.value = defaultUser;
        }
    }

    labelChallengeWheelCopies(wheels) {
        const list = Array.isArray(wheels) ? wheels : [];
        const groups = new Map();
        list.forEach((wheel) => {
            const baseName = String(wheel?.name || 'Vòng quay thử thách').trim();
            const key = baseName.toLocaleLowerCase('vi');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(wheel);
        });
        groups.forEach((group) => {
            group.sort((a, b) => new Date(b?.updatedAt || 0) - new Date(a?.updatedAt || 0));
            group.forEach((wheel, index) => {
                const baseName = String(wheel?.name || 'Vòng quay thử thách').trim();
                wheel.displayName = group.length === 1
                    ? baseName
                    : `${baseName} — ${index === 0 ? 'bản mới nhất' : `bản cũ ${index}`}`;
            });
        });
        return list;
    }

    getChallengeWheelDisplayName(wheelId) {
        const wheel = (this.challengeWheels || []).find((entry) => String(entry?._id) === String(wheelId || ''));
        return wheel?.displayName || wheel?.name || 'Vòng quay thử thách';
    }

    async loadChallengeWheels() {
        try {
            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            let res = await fetch(`${this.API_URL}/api/tiktok/challenge-wheels`, { headers });
            if (res.status === 401 && this.authToken) {
                res = await this.retryUnauthorized(
                    res,
                    (token) => fetch(`${this.API_URL}/api/tiktok/challenge-wheels`, { headers: { Authorization: `Bearer ${token}` } }),
                    () => fetch(`${this.API_URL}/api/tiktok/challenge-wheels`)
                );
            }
            const data = await res.json().catch(() => ({ success: true, wheels: [] }));
            this.challengeWheels = this.labelChallengeWheelCopies(Array.isArray(data.wheels) ? data.wheels : []);
            {
                let templateRes = await fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`, { headers });
                if (templateRes.status === 401) {
                    templateRes = await this.retryUnauthorized(
                        templateRes,
                        (token) => fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`, { headers: { Authorization: `Bearer ${token}` } }),
                        () => fetch(`${this.API_URL}/api/tiktok/gift-menu-templates`)
                    );
                }
                const templateData = await templateRes.json().catch(() => ({}));
                const templates = Array.isArray(templateData.templates) ? templateData.templates : [];
                // Chỉ đưa vào Gán hiệu ứng các vòng quay đang có sản phẩm
                // challenge-wheel hoạt động trong Cửa hàng. Các bản ghi cũ
                // còn sót lại trong ChallengeWheel không được coi là sản phẩm.
                let catalogEffects = Array.isArray(this.storeEffects) ? this.storeEffects : [];
                if (!catalogEffects.length) {
                    const catalogRes = await fetch(`${this.API_URL}/api/effects`, { headers: { 'Authorization': `Bearer ${this.authToken}` } }).catch(() => null);
                    const catalogData = catalogRes ? await catalogRes.json().catch(() => ({})) : {};
                    catalogEffects = Array.isArray(catalogData.effects) ? catalogData.effects : [];
                }
                const catalogTemplateIds = new Set(catalogEffects
                    .filter((effect) => effect?.category === 'menu_template' && effect.fileUrl)
                    .map((effect) => String(effect.fileUrl)));
                const catalogWheelTemplates = templates.filter((template) => {
                    const templateItems = [...(template.items || []), ...(template.exportedItems || [])];
                    const isWheel = template.productType === 'challenge-wheel' || templateItems.some((item) => item?.type === 'challenge-wheel');
                    return isWheel && catalogTemplateIds.has(String(template._id));
                });
                this.challengeWheelTemplateIds = catalogTemplateIds.size
                    ? new Set(catalogWheelTemplates.map((template) => String(template._id)))
                    : new Set();
                this.challengeWheelTemplateCount = catalogWheelTemplates.length;
                const existingSourceIds = new Set((this.challengeWheels || []).map((wheel) => String(wheel.sourceTemplateId || '')));
                const eligible = templates.filter((template) => {
                    const templateItems = [...(template.items || []), ...(template.exportedItems || [])];
                    const isWheel = template.productType === 'challenge-wheel' || templateItems.some((item) => item?.type === 'challenge-wheel');
                    return isWheel && !existingSourceIds.has(String(template._id)) && (template.isPurchased || this.currentUser?.isAdmin || ['pro', 'studio'].includes(resolvePlanKey(this.currentUser)));
                });
                for (const template of eligible) {
                    const item = [...(template.items || []), ...(template.exportedItems || [])].find((entry) => entry?.type === 'challenge-wheel');
                    if (!item) continue;
                    await fetch(`${this.API_URL}/api/tiktok/challenge-wheels`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                        body: JSON.stringify({
                            sourceTemplateId: template._id,
                            name: template.name,
                            title: item.title,
                            segments: item.segments || [],
                            durationMs: item.durationMs,
                            autoHideMs: item.autoHideMs
                        })
                    }).catch(() => {});
                }
                if (eligible.length) {
                    const refreshed = await fetch(`${this.API_URL}/api/tiktok/challenge-wheels`, { headers: { 'Authorization': `Bearer ${this.authToken}` } });
                    const refreshedData = await refreshed.json().catch(() => ({}));
                    this.challengeWheels = this.labelChallengeWheelCopies(
                        Array.isArray(refreshedData.wheels) ? refreshedData.wheels : this.challengeWheels
                    );
                }
            }
            const seenWheelKeys = new Set();
            const uniqueMappingWheels = this.challengeWheels.filter((wheel) => {
                const contentKey = (wheel.segments || []).map((segment) => segment.label).join('|');
                const key = wheel.sourceTemplateId ? `source:${wheel.sourceTemplateId}` : `content:${wheel.name}|${contentKey}`;
                if (seenWheelKeys.has(key)) return false;
                seenWheelKeys.add(key);
                return true;
            });
            const catalogWheelIds = this.challengeWheelTemplateIds instanceof Set
                ? this.challengeWheelTemplateIds
                : new Set();
            const catalogMappingWheels = catalogWheelIds.size
                ? uniqueMappingWheels.filter((wheel) => wheel.sourceTemplateId && catalogWheelIds.has(String(wheel.sourceTemplateId)))
                : uniqueMappingWheels;
            const mappingWheels = catalogMappingWheels.length
                ? catalogMappingWheels
                : (this.challengeWheelTemplateCount > 0 ? uniqueMappingWheels.slice(0, this.challengeWheelTemplateCount) : uniqueMappingWheels);
            const select = document.getElementById('mapping-wheel-id');
            if (select) select.innerHTML = mappingWheels.length
                ? mappingWheels.map((wheel) => `<option value="${wheel._id}">${wheel.displayName || wheel.name} (${(wheel.segments || []).length} thử thách)</option>`).join('')
                : '<option value="">Chưa có vòng quay</option>';
        } catch (error) { console.warn('Không tải được vòng quay thử thách:', error.message); }
    }

    async createChallengeWheelPrompt() {
        const name = window.prompt('Tên vòng quay:', 'Vòng quay thử thách');
        if (!name) return;
        const raw = window.prompt('Nhập các thử thách, ngăn cách bằng dấu phẩy:', 'Hát một đoạn,Nhảy 10 giây,Kể một câu chuyện vui');
        const labels = String(raw || '').split(',').map((label) => label.trim()).filter(Boolean);
        if (labels.length < 2) return this.showNotification('error', 'Cần ít nhất 2 thử thách.');
        try {
            const res = await fetch(`${this.API_URL}/api/tiktok/challenge-wheels`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ name, segments: labels.map((label, index) => ({ id: `challenge-${Date.now()}-${index}`, label })) })
            });
            const data = await res.json();
            if (!data.success) return this.showNotification('error', data.error || 'Không tạo được vòng quay.');
            await this.loadChallengeWheels();
            const select = document.getElementById('mapping-wheel-id');
            if (select) select.value = data.wheel._id;
            this.showNotification('success', 'Đã tạo vòng quay thử thách.');
        } catch (error) { this.showNotification('error', error.message); }
    }

    async loadDatabaseBackups() {
        if (this.currentUser?.isAdmin !== true) return;
        const list = document.getElementById('database-backups-list');
        if (!list) return;
        list.textContent = 'Đang tải danh sách backup...';
        try {
            const response = await fetch(`${this.API_URL}/api/admin/database/backups`, { headers: { 'Authorization': `Bearer ${this.authToken}` } });
            const data = await response.json();
            if (!response.ok || data.success !== true) throw new Error(data.error || 'Không thể tải danh sách sao lưu.');
            list.replaceChildren();
            if (!data.backups.length) { list.textContent = 'Chưa có bản sao lưu nào.'; return; }
            data.backups.forEach((backup) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;background:rgba(255,255,255,.03);border-radius:10px;flex-wrap:wrap;';
                const info = document.createElement('div');
                const name = document.createElement('div');
                name.style.cssText = 'color:#fff;font-size:12px;font-weight:700;word-break:break-all;';
                name.textContent = backup.filename;
                const meta = document.createElement('div');
                meta.style.cssText = 'color:var(--text-muted);font-size:11px;margin-top:3px;';
                meta.textContent = `${new Date(backup.createdAt).toLocaleString('vi-VN')} · ${(backup.size / 1024).toFixed(1)} KB`;
                info.append(name, meta);
                const restore = document.createElement('button');
                restore.type = 'button';
                restore.textContent = 'Khôi phục và cập nhật dữ liệu';
                restore.style.cssText = 'padding:8px 11px;border:1px solid rgba(245,158,11,.35);border-radius:8px;background:rgba(245,158,11,.08);color:#fbbf24;cursor:pointer;font-weight:700;';
                restore.addEventListener('click', () => this.restoreDatabaseBackup(backup.filename));
                row.append(info, restore);
                list.append(row);
            });
        } catch (error) {
            list.textContent = error.message;
            this.showNotification('error', error.message);
        }
    }

    async createDatabaseBackup() {
        if (this.currentUser?.isAdmin !== true) return;
        const button = document.getElementById('create-database-backup-btn');
        if (button) button.disabled = true;
        try {
            const response = await fetch(`${this.API_URL}/api/admin/database/backup`, { method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}` } });
            const data = await response.json();
            if (!response.ok || data.success !== true) throw new Error(data.error || 'Không thể tạo bản sao lưu.');
            this.showNotification('success', `Đã tạo bản sao lưu ${data.backup.filename}`);
            await this.loadDatabaseBackups();
        } catch (error) {
            this.showNotification('error', error.message);
        } finally {
            if (button) button.disabled = false;
        }
    }
    async restoreDatabaseBackup(filename) {
        if (this.currentUser?.isAdmin !== true) return;
        const confirmation = window.prompt(`Hệ thống sẽ cập nhật dữ liệu từ ${filename} và tự tạo một bản sao lưu an toàn trước khi thực hiện.\nNhập RESTORE_MERGE để tiếp tục:`);
        if (confirmation !== 'RESTORE_MERGE') {
            if (confirmation !== null) this.showNotification('warning', 'Chuỗi xác nhận không đúng.');
            return;
        }
        try {
            const response = await fetch(`${this.API_URL}/api/admin/database/restore/${encodeURIComponent(filename)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmation })
            });
            const data = await response.json();
            if (!response.ok || data.success !== true) throw new Error(data.error || 'Không thể khôi phục dữ liệu từ bản sao lưu.');
            this.showNotification('success', `Đã cập nhật ${data.restored.restoredDocuments} bản ghi. Bản sao lưu an toàn: ${data.safetyBackup.filename}`);
            await this.loadDatabaseBackups();
        } catch (error) {
            this.showNotification('error', error.message);
        }
    }

    async openOperationDirectory(key) {
        const result = await window.electronAPI?.invoke('operations:open-directory', key);
        if (!result?.success) this.showNotification('error', result?.error || 'Không thể mở thư mục.');
    }

    async createDiagnosticReport() {
        const result = await window.electronAPI?.invoke('operations:create-diagnostics');
        if (result?.success) this.showNotification('success', `Đã tạo báo cáo: ${result.path}`);
        else this.showNotification('error', result?.error || 'Không thể tạo báo cáo chẩn đoán.');
    }

    async saveOBSSettings() {
        const host = document.getElementById('settings-obs-host').value.trim();
        const port = document.getElementById('settings-obs-port').value.trim();
        const password = document.getElementById('settings-obs-password').value;

        if (!host || !port) return this.showNotification('error', 'Thiếu thông tin Host hoặc Port!');

        try {
            this.showNotification('info', '⏳ Đang lưu cấu hình OBS...');
            const res = await fetch(`${this.API_URL}/api/settings/obs`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ host, port, password })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', data.message);
            } else {
                this.showNotification('error', data.message);
            }
        } catch (e) {
            this.showNotification('error', 'Lỗi lưu cài đặt: ' + e.message);
        }
    }

    saveTikTokSettings() {
        const user = document.getElementById('settings-tiktok-username').value.trim();
        const auto = document.getElementById('settings-tiktok-auto').checked;

        localStorage.setItem('tiktok_username', user);
        localStorage.setItem('tiktok_auto_reconnect', auto);

        const liveUserInput = document.getElementById('room-id');
        if (user && liveUserInput) liveUserInput.value = user;

        this.showNotification('success', '✅ Lưu cài đặt TikTok Live thành công!');
    }

    savePreferences() {
        const soundEl = document.getElementById('settings-sound-alert') || document.getElementById('settings-sound-alert-quick');
        const ttsGiftEl = document.getElementById('settings-tts-gift');
        const ttsFollowEl = document.getElementById('settings-tts-follow');
        const ttsThresholdEl = document.getElementById('settings-tts-threshold');
        const ttsSpeedEl = document.getElementById('settings-tts-speed');
        const ttsTemplateEl = document.getElementById('settings-tts-template');
        const ttsFollowTemplateEl = document.getElementById('settings-tts-follow-template');
        const startupEl = document.getElementById('settings-run-startup');

        const sound = soundEl ? soundEl.checked : (localStorage.getItem('sound_alert') !== 'false');
        const ttsGift = ttsGiftEl ? ttsGiftEl.checked : (localStorage.getItem('es_tts_gift_enabled') !== 'false');
        const ttsFollow = ttsFollowEl ? ttsFollowEl.checked : (localStorage.getItem('es_tts_follow_enabled') !== 'false');
        const ttsThreshold = ttsThresholdEl ? ttsThresholdEl.value : (localStorage.getItem('es_tts_threshold') || '10');
        const ttsSpeed = ttsSpeedEl ? ttsSpeedEl.value : (localStorage.getItem('es_tts_speed') || '1.0');
        const ttsTemplate = ttsTemplateEl ? ttsTemplateEl.value : (localStorage.getItem('es_tts_template') || 'Cảm ơn {username} đã tặng {quantity} {giftName} ❤️');
        const ttsFollowTemplate = ttsFollowTemplateEl ? ttsFollowTemplateEl.value : (localStorage.getItem('es_tts_follow_template') || 'Cảm ơn {username} đã follow kênh nhé! ❤️');
        const startup = startupEl ? startupEl.checked : (localStorage.getItem('run_startup') === 'true');

        localStorage.setItem('sound_alert', sound);
        localStorage.setItem('es_tts_gift_enabled', ttsGift);
        localStorage.setItem('es_tts_follow_enabled', ttsFollow);
        localStorage.setItem('es_tts_threshold', ttsThreshold);
        localStorage.setItem('es_tts_voice', 'default');
        localStorage.setItem('es_tts_speed', ttsSpeed);
        localStorage.setItem('es_tts_pitch', '1.0');
        localStorage.setItem('es_tts_template', ttsTemplate);
        localStorage.setItem('es_tts_follow_template', ttsFollowTemplate);
        localStorage.setItem('run_startup', startup);

        this.isTTSGiftEnabled = ttsGift;
        this.isTTSFollowEnabled = ttsFollow;
        this.ttsThreshold = parseInt(ttsThreshold);
        this.ttsVoice = 'default';
        this.ttsSpeed = parseFloat(ttsSpeed);
        this.ttsPitch = 1.0;
        this.ttsTemplate = ttsTemplate;
        this.ttsFollowTemplate = ttsFollowTemplate;

        this.showNotification('success', '✅ Lưu tùy chọn thành công!');
    }

    async loadAiAssistantConfig() {
        try {
            const token = this.authToken || localStorage.getItem('token') || '';
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (!token) return;
            let res = await fetch(`${this.API_URL}/api/tiktok/ai-config`, { headers });
            if (res.status === 401 && token) {
                res = await this.retryUnauthorized(
                    res,
                    (activeToken) => fetch(`${this.API_URL}/api/tiktok/ai-config`, { headers: { Authorization: `Bearer ${activeToken}` } }),
                    () => fetch(`${this.API_URL}/api/tiktok/ai-config`)
                );
            }
            const data = await res.json().catch(() => ({}));
            if (data.success && data.config) {
                const c = data.config;
                this.aiAssistantConfig = c;
                const presetVoices = ['21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL', 'AZnzlk1XvdvUeBnXmlld', 'pNInz6obpgDQGcFmaJgB', 'ErXwobaYiN019PkySvjV', 'MF3mGyEYCl7XYWbV9V6O'];
                const savedVoice = c.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB';

                document.querySelectorAll('.ai-assistant-enabled-input').forEach(el => el.checked = Boolean(c.enabled));
                document.querySelectorAll('.ai-assistant-persona-input').forEach(el => el.value = c.persona || 'sassy');
                document.querySelectorAll('.ai-assistant-cooldown-input').forEach(el => el.value = String(c.cooldownSeconds || 20));
                document.querySelectorAll('.ai-assistant-donator-only-input').forEach(el => el.value = String(c.donatorOnly || false));
                document.querySelectorAll('.ai-assistant-min-donator-coins-input').forEach(el => el.value = String(c.minimumDonatorCoins || 10));
                document.querySelectorAll('.ai-assistant-eleven-voice-input').forEach(el => el.value = presetVoices.includes(savedVoice) ? savedVoice : 'custom');
                document.querySelectorAll('.ai-assistant-custom-voice-input').forEach(el => {
                    if (!presetVoices.includes(savedVoice)) {
                        el.style.display = 'block';
                        el.value = savedVoice;
                    } else {
                        el.style.display = 'none';
                        el.value = '';
                    }
                });

                if (document.getElementById('ai-assistant-enabled')) document.getElementById('ai-assistant-enabled').checked = Boolean(c.enabled);
                if (document.getElementById('ai-assistant-persona')) document.getElementById('ai-assistant-persona').value = c.persona || 'sassy';
                if (document.getElementById('ai-assistant-cooldown')) document.getElementById('ai-assistant-cooldown').value = String(c.cooldownSeconds || 20);
                if (document.getElementById('ai-assistant-donator-only')) document.getElementById('ai-assistant-donator-only').value = String(c.donatorOnly || false);
                const geminiStatus = document.getElementById('admin-gemini-status');
                const elevenStatus = document.getElementById('admin-eleven-status');
                if (geminiStatus) {
                    geminiStatus.textContent = c.geminiConfigured ? '✅ Gemini đã cấu hình' : '⚠️ Gemini chưa cấu hình';
                    geminiStatus.style.color = c.geminiConfigured ? '#86efac' : '#fbbf24';
                }
                if (elevenStatus) {
                    elevenStatus.textContent = c.elevenLabsConfigured ? '✅ ElevenLabs đã cấu hình' : '⚠️ ElevenLabs chưa cấu hình';
                    elevenStatus.style.color = c.elevenLabsConfigured ? '#86efac' : '#fbbf24';
                }
            }
            if (data.success && data.usage) {
                this.renderAiUsageUI(data.usage);
            }
            if (this.currentUser?.isAdmin === true || this.currentUser?.email === 'admin@effectstore.vn') {
                this.loadSystemAiSecretStatus();
            }
        } catch (_e) {}
    }

    renderSystemAiSecretStatus(status = {}) {
        const geminiStatus = document.getElementById('admin-gemini-status');
        const elevenStatus = document.getElementById('admin-eleven-status');
        if (geminiStatus) {
            geminiStatus.textContent = status.gemini?.configured ? '✅ Gemini đã cấu hình' : '⚠️ Gemini chưa cấu hình';
            geminiStatus.style.color = status.gemini?.configured ? '#86efac' : '#fbbf24';
        }
        if (elevenStatus) {
            elevenStatus.textContent = status.elevenlabs?.configured ? '✅ ElevenLabs đã cấu hình' : '⚠️ ElevenLabs chưa cấu hình';
            elevenStatus.style.color = status.elevenlabs?.configured ? '#86efac' : '#fbbf24';
        }
    }

    async loadSystemAiSecretStatus() {
        try {
            const response = await fetch(`${this.API_URL}/api/ai/admin/status`, {
                headers: { Authorization: `Bearer ${this.authToken}` }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) this.renderSystemAiSecretStatus(data.status);
        } catch (_error) {}
    }

    async saveSystemAiSecrets() {
        const geminiInput = document.getElementById('admin-gemini-secret-input');
        const elevenInput = document.getElementById('admin-eleven-secret-input');
        const geminiKey = geminiInput?.value?.trim() || '';
        const elevenLabsKey = elevenInput?.value?.trim() || '';
        if (!geminiKey && !elevenLabsKey) {
            this.showNotification('info', 'Nhập ít nhất một key mới để cập nhật.');
            return;
        }
        try {
            const response = await fetch(`${this.API_URL}/api/ai/admin/secrets`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ geminiKey, elevenLabsKey })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Không thể cập nhật key.');
            if (geminiInput) geminiInput.value = '';
            if (elevenInput) elevenInput.value = '';
            this.renderSystemAiSecretStatus(data.status);
            this.showNotification('success', '🔐 Đã cập nhật API key an toàn trên cloud.');
        } catch (error) {
            this.showNotification('error', error.message || 'Không thể cập nhật API key.');
        }
    }

    renderAiUsageUI(usage) {
        if (!usage) return;
        const meterText = document.getElementById('ai-usage-meter-text');
        const systemGiftMeterText = document.getElementById('ai-system-gift-meter-text');
        const planBadge = document.getElementById('ai-usage-plan-badge');
        const isUserCardAdmin = document.querySelector('.user-card .plan')?.textContent?.trim() === 'ADMIN';
        const isAdmin = Boolean(
            (this.currentUser && (this.currentUser.isAdmin === true || this.currentUser.role === 'admin' || this.currentUser.email === 'admin@effectstore.vn')) ||
            usage.isAdmin === true ||
            usage.totalLimit >= 999000000 ||
            isUserCardAdmin
        );
        const hasQuota = isAdmin || usage.hasQuota || usage.hasSystemVoiceGift || (usage.remaining > 0) || (usage.systemVoiceGiftRemaining > 0);

        if (meterText) {
            if (isAdmin) {
                meterText.textContent = `${(usage.used || 0).toLocaleString()} ký tự (Không giới hạn ♾️)`;
            } else {
                meterText.textContent = `${(usage.used || 0).toLocaleString()} / ${(usage.totalLimit || 1000).toLocaleString()} ký tự giọng tùy chỉnh`;
            }
        }
        if (systemGiftMeterText) {
            systemGiftMeterText.style.display = isAdmin ? 'none' : '';
            if (!isAdmin) {
                systemGiftMeterText.textContent = `🎁 Quà tặng kèm: ${(usage.systemVoiceGiftUsed || 0).toLocaleString()} / ${(usage.systemVoiceGiftLimit || 5000).toLocaleString()} ký tự giọng hệ thống`;
            }
        }
        if (planBadge) {
            if (isAdmin) {
                planBadge.textContent = 'Gói ADMIN (Vĩnh Viễn)';
                planBadge.style.background = 'linear-gradient(135deg, #ef4444, #f59e0b)';
                planBadge.style.color = '#fff';
            } else {
                const rawSub = typeof this.currentUser?.subscription === 'object'
                    ? (this.currentUser?.subscription?.plan || 'free')
                    : (this.currentUser?.subscription || this.currentUser?.plan || document.querySelector('.user-card .plan')?.textContent?.trim() || 'FREE');
                const sub = String(rawSub).toLowerCase();
                const planName = (sub === 'basic' || sub.includes('basic')) ? 'Basic' : ((sub === 'pro' || sub.includes('business')) ? 'Pro' : 'Free');
                planBadge.textContent = `Gói ${planName}`;
                planBadge.style.background = planName === 'Pro'
                    ? 'rgba(167,139,250,0.15)'
                    : (planName === 'Basic' ? 'rgba(212,175,55,0.15)' : 'rgba(107,114,128,0.15)');
                planBadge.style.color = planName === 'Pro' ? '#a78bfa' : (planName === 'Basic' ? '#fbbf24' : '#9ca3af');
            }
        }

        // Lock 15s, 20s, 30s options when character quota runs out, leaving only 60s free option
        document.querySelectorAll('.ai-assistant-cooldown-input').forEach(selectEl => {
            Array.from(selectEl.options).forEach(opt => {
                if (opt.value === '15') {
                    opt.disabled = !hasQuota;
                    opt.textContent = hasQuota ? '15 giây' : '15 giây (🔒 Hết ký tự)';
                } else if (opt.value === '20') {
                    opt.disabled = !hasQuota;
                    opt.textContent = hasQuota ? '20 giây' : '20 giây (🔒 Hết ký tự)';
                } else if (opt.value === '30') {
                    opt.disabled = !hasQuota;
                    opt.textContent = hasQuota ? '30 giây' : '30 giây (🔒 Hết ký tự)';
                } else if (opt.value === '60') {
                    opt.disabled = false;
                    opt.textContent = hasQuota ? '60 giây' : '60 giây (Miễn phí)';
                }
            });

            if (!hasQuota && selectEl.value !== '60') {
                selectEl.value = '60';
            }
        });
    }

    showBuyAiAddonModal() {
        this.showModal('⚡ Nạp Ký Tự AI Cà Khịa (Gói VIP Tiết Kiệm)', `
            <div style="text-align:center; padding: 4px 0 10px;">
                <p style="margin:0 0 18px; color:var(--text-muted); font-size:13px; line-height:1.5;">
                    Hết ký tự giọng AI cao cấp? Nạp gói lẻ siêu tiết kiệm để tiếp tục đọc giọng AI mượt mà trên LiveStream!
                </p>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:20px;">
                    <!-- Gói Nhỏ -->
                    <div onclick="app.showAiPaymentQR('10k')" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:16px 12px; text-align:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='#f59e0b';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)';this.style.transform='translateY(0)'">
                        <div style="font-size:11px; color:#f59e0b; font-weight:800;">GÓI NHỎ</div>
                        <div style="font-size:18px; font-weight:800; color:#fff; margin:6px 0;">10.000₫</div>
                        <div style="font-size:12px; color:#a78bfa; font-weight:700;">+1,000 ký tự</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">~10-15 câu thoại</div>
                        <button style="margin-top:12px; width:100%; padding:6px; background:rgba(245,158,11,0.2); border:1px solid #f59e0b; color:#fef08a; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">Nạp Ngay ➔</button>
                    </div>
                    <!-- Gói Bán Chạy -->
                    <div onclick="app.showAiPaymentQR('50k')" style="background:linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.15)); border:1px solid #8b5cf6; border-radius:14px; padding:16px 12px; text-align:center; cursor:pointer; transition:all 0.2s; position:relative;" onmouseover="this.style.borderColor='#ec4899';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#8b5cf6';this.style.transform='translateY(0)'">
                        <div style="position:absolute; top:-10px; right:10px; background:#ec4899; color:#fff; font-size:9px; font-weight:800; padding:2px 8px; border-radius:10px;">⭐ BÁN CHẠY</div>
                        <div style="font-size:11px; color:#ec4899; font-weight:800;">TIẾT KIỆM</div>
                        <div style="font-size:18px; font-weight:800; color:#fff; margin:6px 0;">50.000₫</div>
                        <div style="font-size:12px; color:#ec4899; font-weight:700;">+5,500 ký tự</div>
                        <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">Thưởng thêm 10%</div>
                        <button style="margin-top:12px; width:100%; padding:6px; background:linear-gradient(135deg, #8b5cf6, #ec4899); border:none; color:#fff; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">Nạp Ngay ➔</button>
                    </div>
                    <!-- Gói Siêu Hời -->
                    <div onclick="app.showAiPaymentQR('100k')" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:16px 12px; text-align:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='#10b981';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)';this.style.transform='translateY(0)'">
                        <div style="font-size:11px; color:#10b981; font-weight:800;">SIÊU HỜI</div>
                        <div style="font-size:18px; font-weight:800; color:#fff; margin:6px 0;">100.000₫</div>
                        <div style="font-size:12px; color:#10b981; font-weight:700;">+12,000 ký tự</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Thưởng thêm 20%</div>
                        <button style="margin-top:12px; width:100%; padding:6px; background:rgba(16,185,129,0.2); border:1px solid #10b981; color:#a7f3d0; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">Nạp Ngay ➔</button>
                    </div>
                </div>
                <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(139,92,246,0.2); border-radius:10px; padding:12px; text-align:left; font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">💡</span>
                    <span>Ký tự nạp lẻ được cộng dồn vĩnh viễn vào tài khoản, không giới hạn thời gian sử dụng và tự động ưu tiên đọc giọng VIP khi livestream!</span>
                </div>
            </div>
        `);
    }

    showAiPaymentQR(pack) {
        let amount = 10000;
        let packTitle = 'Gói Nhỏ (+1,000 ký tự)';
        let syntax = 'LF AI 10K';

        if (pack === '50k') {
            amount = 50000;
            packTitle = 'Gói Tiết Kiệm (+5,500 ký tự)';
            syntax = 'LF AI 50K';
        } else if (pack === '100k') {
            amount = 100000;
            packTitle = 'Gói Siêu Hời (+12,000 ký tự)';
            syntax = 'LF AI 100K';
        }

        const bankCode = 'TCB';
        const bankName = 'Techcombank (Ngân Hàng Kỹ Thương Việt Nam)';
        const accountNumber = '7698689999';
        const accountName = 'HUYNH BAO HUNG';
        const formattedAmount = this.formatPrice(amount);
        const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(syntax)}&accountName=${encodeURIComponent(accountName)}`;

        this.showModal(`Thanh toán ${packTitle}`, `
            <div style="font-family:inherit;max-width:480px;margin:0 auto;">
                <!-- QR Block -->
                <div style="text-align:center;margin-bottom:18px;">
                    <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:6px 14px;margin-bottom:14px;">
                        <span style="font-size:14px;">📲</span>
                        <span style="font-size:13px;color:#10b981;font-weight:600;">Quét QR để nạp ký tự AI</span>
                    </div>
                    <div style="background:#fff;border-radius:16px;padding:12px;display:inline-block;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                        <img src="${qrUrl}" alt="QR Code" style="width:200px;height:200px;display:block;border-radius:8px;">
                        <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
                            <span style="color:#d4145a;font-size:11px;font-weight:800;letter-spacing:0.5px;">VIET</span><span style="color:#00b14f;font-size:11px;font-weight:800;letter-spacing:0.5px;">QR</span>
                            <span style="color:#bbb;font-size:11px;">•</span>
                            <span style="color:#555;font-size:12px;font-weight:700;">Techcombank</span>
                        </div>
                    </div>
                </div>

                <!-- Bank Info -->
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);">
                        <span style="font-size:14px;">🏦</span>
                        <span style="font-size:13px;font-weight:700;color:#fff;">Thông tin chuyển khoản</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#6b7280;font-size:13px;">Ngân hàng</span>
                            <span style="color:#60a5fa;font-weight:700;font-size:13px;">${bankName}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#6b7280;font-size:13px;">Số tài khoản</span>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="color:#fff;font-weight:700;font-size:14px;letter-spacing:1px;">${accountNumber}</span>
                                <button onclick="navigator.clipboard.writeText('${accountNumber}');app.showNotification('success','Đã sao chép STK!');" style="padding:2px 8px;font-size:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;cursor:pointer;">📋 Copy</button>
                            </div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#6b7280;font-size:13px;">Chủ tài khoản</span>
                            <span style="color:#a78bfa;font-weight:700;font-size:13px;">${accountName}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                            <span style="color:#6b7280;font-size:13px;">Số tiền nạp</span>
                            <span style="color:#d4af37;font-weight:800;font-size:18px;">${formattedAmount}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#6b7280;font-size:13px;">Nội dung CK</span>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="color:#10b981;font-weight:700;font-size:13px;background:rgba(16,185,129,0.1);padding:3px 10px;border-radius:6px;border:1px solid rgba(16,185,129,0.2);">${syntax}</span>
                                <button onclick="navigator.clipboard.writeText('${syntax}');app.showNotification('success','Đã sao chép cú pháp!');" style="padding:2px 8px;font-size:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;cursor:pointer;">📋 Copy</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Hướng dẫn -->
                <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:14px;margin-bottom:16px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <span>⚡</span>
                        <span style="font-size:13px;font-weight:700;color:#fbbf24;">Hướng dẫn nạp ký tự:</span>
                    </div>
                    <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                        <li style="font-size:12px;color:#9ca3af;">Mở App Ngân hàng hoặc Ví MoMo quét mã QR</li>
                        <li style="font-size:12px;color:#9ca3af;">Kiểm tra số tiền <strong style="color:#d4af37;">${formattedAmount}</strong> và nội dung <strong style="color:#10b981;">${syntax}</strong></li>
                        <li style="font-size:12px;color:#9ca3af;">Hoàn tất chuyển khoản</li>
                        <li style="font-size:12px;color:#9ca3af;">Bấm nút <strong style="color:#fff;">"✅ Xác nhận đã chuyển khoản"</strong> bên dưới để cộng ký tự ngay!</li>
                    </ol>
                </div>

                <!-- Buttons -->
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <button onclick="app.confirmAiAddonPayment('${pack}')" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(124,58,237,0.5)'"
                        onmouseout="this.style.transform='';this.style.boxShadow=''">
                        ✅ Xác nhận đã chuyển khoản (${formattedAmount})
                    </button>
                    <button onclick="app.showBuyAiAddonModal()" style="width:100%;padding:10px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#9ca3af;font-size:13px;cursor:pointer;">
                        ⬅️ Quay lại chọn gói khác
                    </button>
                </div>
            </div>
        `);
    }

    async confirmAiAddonPayment(pack) {
        try {
            this.showNotification('info', '⏳ Đang gửi xác nhận chuyển khoản...');
            const headers = { 'Content-Type': 'application/json' };
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            let res = await fetch(`${this.API_URL}/api/tiktok/ai-buy-addon`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ pack })
            });
            if (res.status === 401 && this.authToken) {
                res = await this.retryUnauthorized(res, (token) => fetch(`${this.API_URL}/api/tiktok/ai-buy-addon`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ pack })
                }));
            }
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', data.message || '✅ Đã gửi yêu cầu nạp! Quản trị viên (Admin) đang duyệt đơn.');
                this.closeModal();
            } else {
                this.showNotification('error', data.error || 'Nạp gói lẻ không thành công.');
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi kết nối nạp gói: ' + e.message);
        }
    }

    async buyAiAddon(pack) {
        this.showAiPaymentQR(pack);
    }

    onElevenVoiceSelectChange(el) {
        const val = el ? el.value : 'pNInz6obpgDQGcFmaJgB';
        document.querySelectorAll('.ai-assistant-eleven-voice-input').forEach(s => s.value = val);
        document.querySelectorAll('.ai-assistant-custom-voice-input').forEach(inp => {
            if (val === 'custom') {
                inp.style.display = 'block';
                inp.focus();
            } else {
                inp.style.display = 'none';
                inp.value = '';
            }
        });
        this.saveAiAssistantConfig(el);
    }

    getActiveVoiceId() {
        const visibleSelect = Array.from(document.querySelectorAll('.ai-assistant-eleven-voice-input')).find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        let voiceId = visibleSelect ? visibleSelect.value : (document.querySelector('.ai-assistant-eleven-voice-input')?.value || 'pNInz6obpgDQGcFmaJgB');
        if (voiceId === 'custom') {
            const visibleCustom = Array.from(document.querySelectorAll('.ai-assistant-custom-voice-input')).find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            voiceId = visibleCustom?.value?.trim() || document.querySelector('.ai-assistant-custom-voice-input')?.value?.trim() || 'pNInz6obpgDQGcFmaJgB';
        }
        return voiceId || 'pNInz6obpgDQGcFmaJgB';
    }

    async saveAiAssistantConfig(sourceEl) {
        try {
            const enabled = (sourceEl && sourceEl.classList.contains('ai-assistant-enabled-input')) ? sourceEl.checked : (document.querySelector('.ai-assistant-enabled-input')?.checked || document.getElementById('ai-assistant-enabled')?.checked || false);
            const persona = (sourceEl && sourceEl.classList.contains('ai-assistant-persona-input')) ? sourceEl.value : (document.querySelector('.ai-assistant-persona-input')?.value || document.getElementById('ai-assistant-persona')?.value || 'sassy');
            const cooldownSeconds = parseInt((sourceEl && sourceEl.classList.contains('ai-assistant-cooldown-input')) ? sourceEl.value : (document.querySelector('.ai-assistant-cooldown-input')?.value || document.getElementById('ai-assistant-cooldown')?.value || '20'), 10);
            const donatorOnly = ((sourceEl && sourceEl.classList.contains('ai-assistant-donator-only-input')) ? sourceEl.value : (document.querySelector('.ai-assistant-donator-only-input')?.value || document.getElementById('ai-assistant-donator-only')?.value)) === 'true';
            const minimumDonatorCoins = Math.max(1, parseInt((sourceEl && sourceEl.classList.contains('ai-assistant-min-donator-coins-input')) ? sourceEl.value : (document.querySelector('.ai-assistant-min-donator-coins-input')?.value || '10'), 10) || 10);
            let elevenLabsVoiceId = (sourceEl && sourceEl.classList.contains('ai-assistant-eleven-voice-input')) ? sourceEl.value : this.getActiveVoiceId();
            if (elevenLabsVoiceId === 'custom') {
                const customInput = Array.from(document.querySelectorAll('.ai-assistant-custom-voice-input')).find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector('.ai-assistant-custom-voice-input');
                elevenLabsVoiceId = customInput?.value?.trim() || 'pNInz6obpgDQGcFmaJgB';
            }

            const presetVoices = ['pNInz6obpgDQGcFmaJgB', 'N2lVS1w4EtoT3dr4eOWO', 'google_female_vi'];

            document.querySelectorAll('.ai-assistant-enabled-input').forEach(el => el.checked = enabled);
            document.querySelectorAll('.ai-assistant-persona-input').forEach(el => el.value = persona);
            document.querySelectorAll('.ai-assistant-cooldown-input').forEach(el => el.value = String(cooldownSeconds));
            document.querySelectorAll('.ai-assistant-donator-only-input').forEach(el => el.value = String(donatorOnly));
            document.querySelectorAll('.ai-assistant-min-donator-coins-input').forEach(el => el.value = String(minimumDonatorCoins));
            document.querySelectorAll('.ai-assistant-eleven-voice-input').forEach(el => el.value = presetVoices.includes(elevenLabsVoiceId) ? elevenLabsVoiceId : 'custom');

            if (document.getElementById('ai-assistant-enabled')) document.getElementById('ai-assistant-enabled').checked = enabled;
            if (document.getElementById('ai-assistant-persona')) document.getElementById('ai-assistant-persona').value = persona;
            if (document.getElementById('ai-assistant-cooldown')) document.getElementById('ai-assistant-cooldown').value = String(cooldownSeconds);
            if (document.getElementById('ai-assistant-donator-only')) document.getElementById('ai-assistant-donator-only').value = String(donatorOnly);
            const payload = { enabled, persona, cooldownSeconds, donatorOnly, minimumDonatorCoins, elevenLabsVoiceId };
            const res = await fetch(`${this.API_URL}/api/tiktok/ai-config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                this.aiAssistantConfig = data.config || this.aiAssistantConfig;
                if (data.usage) this.renderAiUsageUI(data.usage);
                this.showNotification('success', '💾 Đã lưu cấu hình Trợ lý AI!');
            }
        } catch (_e) {}
    }

    async testAiAssistantSpeech() {
        try {
            const voiceId = this.getActiveVoiceId();
            const personaSelect = document.querySelector('.ai-assistant-persona-input');
            const persona = personaSelect ? personaSelect.value : (this.aiAssistantConfig?.persona || 'sassy');
            await this.saveAiAssistantConfig();

            const matrix = {
                sassy: {
                    'pNInz6obpgDQGcFmaJgB': 'Hello các vợ, lại là anh đây hihi! Nhìn Idol live chùa hoài không mỏi tay hả, thả cho quả tym xem nào!',
                    'N2lVS1w4EtoT3dr4eOWO': 'Xem live mà lặng thinh như tờ giấy vậy anh em, gõ chữ chat ủng hộ Idol đi chứ!',
                    'google_female_vi': 'Dạ em chào anh nha, anh xem live từ nãy giờ rồi đó, thả tý tym cho em ấm lòng đi ạ!'
                },
                funny: {
                    'pNInz6obpgDQGcFmaJgB': 'Ủa alo các vợ ơi? Mấy ông xem live mà giấu giếm cái tym ở đâu vậy, lôi ra thả cho Idol coi nào!',
                    'N2lVS1w4EtoT3dr4eOWO': 'Cảnh báo: Xem live này quá 180 giây có nguy cơ gây nghiện cực cao, thả tym ngay để giải độc!',
                    'google_female_vi': 'Ủa alo người đẹp ơi, tay đang bận ăn vặt hay sao mà chưa bấm thả tym cho tui dị?'
                },
                sweet: {
                    'pNInz6obpgDQGcFmaJgB': 'Hello các vợ yêu, đường vào tim em có khó không mà anh lướt live gặp em là tim đập thình thịch rồi nè!',
                    'N2lVS1w4EtoT3dr4eOWO': 'Thấy em vào live cái là khung chat sáng bừng luôn, ở lại trò chuyện với anh lâu lâu nha!',
                    'google_female_vi': 'Anh ơi, người ta thả tym cho live, còn em chỉ muốn thả nụ cười này cho riêng anh thôi đó!'
                },
                smart: {
                    'pNInz6obpgDQGcFmaJgB': 'Chào mừng cả nhà đã đến với phòng livestream. Chúc mọi người có những phút giây thư giãn thật tuyệt vời nhé.',
                    'N2lVS1w4EtoT3dr4eOWO': 'Xin chào mọi người. Rất vui được gặp lại cả nhà trong buổi phát sóng hôm nay.',
                    'google_female_vi': 'Dạ em xin kính chào quý anh chị. Chúc cả nhà một buổi tối xem live vui vẻ và nhiều may mắn ạ.'
                }
            };

            const personaSentences = matrix[persona] || matrix['sassy'];
            const testSentence = personaSentences[voiceId] || 'Xin chào! Giọng đọc AI đã sẵn sàng phục vụ bạn!';

            this.showNotification('success', `🤖 AI (${persona}): "${testSentence}"`);
            this.speakText(testSentence, true);
        } catch (e) {
            this.showNotification('error', '❌ Lỗi: ' + e.message);
        }
    }

    clearVoiceCache() {
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('es_voice_cache_')) {
                localStorage.removeItem(k);
            }
        });
        this.showNotification('success', '🧹 Đã xóa toàn bộ bộ nhớ tạm âm thanh AI!');
    }

    clearAppData() {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu tạm của ứng dụng? Hành động này không thể hoàn tác.')) {
            localStorage.clear();
            this.showNotification('success', '🧹 Đã xóa dữ liệu! Ứng dụng sẽ tải lại...');
            setTimeout(() => location.reload(), 1500);
        }
    }

    startFlashSaleTimer() {
        const hourEl = document.getElementById('fs-hour');
        const minEl = document.getElementById('fs-min');
        const secEl = document.getElementById('fs-sec');

        if (!hourEl || !minEl || !secEl) return;

        let totalSeconds = 3 * 60 * 60 + 45 * 60 + 12;

        setInterval(() => {
            if (totalSeconds <= 0) {
                totalSeconds = 4 * 60 * 60;
            }
            totalSeconds--;

            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            hourEl.textContent = hours.toString().padStart(2, '0');
            minEl.textContent = minutes.toString().padStart(2, '0');
            secEl.textContent = seconds.toString().padStart(2, '0');
        }, 1000);
    }

}

// ===== INITIALIZE APP =====
function bootstrapApp() {
    window.app = new EffectStoreApp();
    globalThis.app = window.app;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}

// ===== HELPER FUNCTIONS =====
function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.style.right === '0px';
    sidebar.style.right = isOpen ? '-420px' : '0px';
    if (overlay) overlay.style.display = isOpen ? 'none' : 'block';
}
function filterCategory(cat) {
    document.querySelectorAll('.filter-btn-new').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    app.renderEffects(cat, document.getElementById('search-input').value);
}
function filterEffects() { const active = document.querySelector('.filter-btn-new.active'); const cat = active?.dataset?.cat || 'all'; app.renderEffects(cat, document.getElementById('search-input').value); }
function switchView(view) { app.switchView(view); }
function showAccount() {
    let u = app.currentUser;
    if (!u) {
        try {
            u = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
        } catch (_e) {}
    }
    if (!u) {
        const nameEl = document.querySelector('.user-card .name')?.textContent?.trim() || 'teest';
        const planEl = document.querySelector('.user-card .plan')?.textContent?.trim() || 'BASIC';
        const planElLower = planEl.toLowerCase();
        u = {
            name: nameEl,
            email: `${nameEl}@liveflow.app`,
            subscription: planElLower.includes('basic') ? 'basic' : (planElLower.includes('pro') ? 'pro' : 'free')
        };
    }
    app.currentUser = u;
    const plan = resolvePlanDisplay(u);
    const avatarBg = plan.avatarBg;
    const avatarColor = plan.avatarColor;

    app.showModal('Tài khoản của tôi', `
                <div style="text-align:center; padding: 12px 0;">
                    <div style="width:72px;height:72px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:${avatarColor};margin:0 auto 14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);">${(u.name || 'U')[0].toUpperCase()}</div>
                    <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${u.name || 'Người dùng'}</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${u.email || 'test@liveflow.app'}</div>
                    <div style="font-size:12px;padding:5px 16px;border-radius:20px;display:inline-block;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</div>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
                    <button onclick="app.openCustomerProfileEditor()" style="width:100%;padding:12px;margin-bottom:10px;background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(236,72,153,.14));border:1px solid rgba(192,132,252,.3);border-radius:10px;color:#e9d5ff;font-weight:700;cursor:pointer;font-size:14px;">✏️ Cập nhật thông tin</button>
                    <button onclick="app.logout()" style="width:100%;padding:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:#ef4444;font-weight:600;cursor:pointer;font-size:14px;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">🚪 Đăng xuất</button>
                </div>
            `);
}
function navigateTo(page) {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = `${page}?token=${token}`;
    } else {
        window.location.href = page;
    }
}
function openBannerManager() {
    const token = localStorage.getItem('token');
    window.location.href = `admin-banner.html?token=${token}`;
}
function openGiftMapping() { switchView('gift-mapping'); }


// ===== TIMELINE EDITOR FUNCTIONS (BƯỚC 1: FIX LOGIC THÊM KEYFRAME) =====

let currentTimelineEffectId = null;
let currentTimeline = []; // Mảng chứa danh sách keyframe đang chỉnh sửa

// 1. Hàm mở Modal Timeline
function openTimelineEditor(effectId, effectName) {
    console.log('🎬 Opening Timeline Editor for:', effectId, effectName);
    currentTimelineEffectId = effectId;

    // Đặt tên hiệu ứng lên tiêu đề modal
    const nameEl = document.getElementById('tl-effect-name');
    if (nameEl) nameEl.textContent = effectName || 'Effect';

    // Mở modal
    const modal = document.getElementById('timeline-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    // Reset form
    const timeInput = document.getElementById('kf-time');
    if (timeInput) timeInput.value = '0';

    // Tải danh sách OBS Sources
    if (typeof loadOBSSources === 'function') {
        loadOBSSources();
    }

    // Tải timeline cũ từ server (nếu có)
    fetch(`http://127.0.0.1:9000/api/effects/${effectId}/timeline`, {
        headers: { 'Authorization': `Bearer ${app.authToken}` }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && Array.isArray(data.timeline)) {
                currentTimeline = data.timeline;
            } else {
                currentTimeline = [];
            }
            renderKeyframes(); // Vẽ lại giao diện
        })
        .catch(err => console.error('Load timeline error:', err));
}

// 2. Hàm đóng Modal
function closeTimelineEditor() {
    const modal = document.getElementById('timeline-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            currentTimelineEffectId = null;
        }, 300);
    }
}

// ✅ HÀM THÊM KEYFRAME MỚI (Đã có X, Y, Scale, Layer)
function addKeyframe() {
    const time = parseFloat(document.getElementById('kf-time').value);
    const action = document.getElementById('kf-action').value;
    const source = document.getElementById('kf-source').value;

    // ✅ Lấy thêm X, Y, Scale, Layer
    const x = parseFloat(document.getElementById('kf-x').value) || 0;
    const y = parseFloat(document.getElementById('kf-y').value) || 0;
    const scale = parseFloat(document.getElementById('kf-scale').value) || 100;
    const layer = document.getElementById('kf-layer').value;

    // Validate
    if (!source || source === '-- Chọn Source --') {
        return app.showNotification('warning', '⚠️ Vui lòng chọn Source!');
    }

    // Thêm vào mảng timeline
    currentTimeline.push({
        time,
        action,
        source,
        layer,
        transform: { x, y, scale }
    });

    // Sắp xếp theo thời gian
    currentTimeline.sort((a, b) => a.time - b.time);

    // Vẽ lại danh sách
    renderKeyframes();

    // Reset ô thời gian
    document.getElementById('kf-time').value = '0';

    app.showNotification('success', `✅ Đã thêm keyframe tại ${time}s`);
}

// ✅ HÀM VẼ LẠI DANH SÁCH KEYFRAME (Hiển thị rõ thông số)
function renderKeyframes() {
    const list = document.getElementById('keyframes-list');
    if (!list) return;
    list.innerHTML = '';

    if (currentTimeline.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">📭 Chưa có keyframe nào.</div>';
        return;
    }

    currentTimeline.forEach((kf, index) => {
        const item = document.createElement('div');
        item.className = 'keyframe-item';

        // Dịch action & layer sang tiếng Việt
        const actionMap = { move: '📍 Di chuyển', scale: '📏 Scale', layer: '🔲 Đổi Lớp', show: '👁️ Hiện', hide: '🕶️ Ẩn', play: '▶️ Chạy lại' };
        const layerMap = { above: 'Trên', below: 'Dưới' };

        let detailText = '';
        if (kf.action === 'move') detailText = `X:${kf.transform.x} Y:${kf.transform.y}`;
        else if (kf.action === 'scale') detailText = `Scale: ${kf.transform.scale}%`;
        else if (kf.action === 'layer') detailText = `Lớp: ${layerMap[kf.layer] || kf.layer}`;
        else if (kf.action === 'show' || kf.action === 'hide') detailText = `Thay đổi hiển thị`;
        else if (kf.action === 'play') detailText = `Kích hoạt phát video`;

        item.innerHTML = `
                    <div class="keyframe-info" style="display:flex; align-items:center; gap:12px; flex:1;">
                        <span class="keyframe-time">${kf.time}s</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:600; font-size:13px;">${actionMap[kf.action] || kf.action}</span>
                            <span style="font-size:11px; color:#888;">${kf.source} • ${detailText}</span>
                        </div>
                    </div>
                    <button class="btn-delete-kf" onclick="deleteKeyframe(${index})">🗑️</button>
                `;
        list.appendChild(item);
    });
}

// ✅ HÀM XÓA KEYFRAME
function deleteKeyframe(index) {
    if (index > -1 && index < currentTimeline.length) {
        currentTimeline.splice(index, 1);
        renderKeyframes();
        app.showNotification('success', `🗑️ Đã xóa keyframe!`);
    }
}

// ✅ HÀM LƯU TIMELINE (TỰ ĐỘNG THÊM KEYFRAME QUAY VỀ GỐC Ở CUỐI)
// ✅ HÀM LƯU TIMELINE (SỬA LỖI TỰ ĐỘNG THÊM RESET TRÁNH LỖI undefined VÀ DỒN KEYFRAME)
function saveTimeline() {
    if (!currentTimelineEffectId) return;

    // Tạo bản sao sạch không chứa các auto-reset cũ nếu có
    const cleanTimeline = currentTimeline.filter(kf => !kf.isAutoReset);

    if (cleanTimeline.length === 0) {
        if (!confirm('Timeline đang trống. Bạn có chắc chắn muốn lưu không?')) return;
    } else {
        // Tự động thêm 1 keyframe Reset an toàn ở cuối
        const firstKf = cleanTimeline[0];
        const lastKfTime = cleanTimeline[cleanTimeline.length - 1].time;
        const effectDuration = Math.max(10.0, lastKfTime + 2.0); // Tối thiểu 10s hoặc sau frame cuối 2s

        cleanTimeline.push({
            time: effectDuration,
            action: 'move',
            source: firstKf.source || 'auto_webcam',
            layer: firstKf.layer || 'above',
            transform: { x: 0, y: 0, scale: 100 },
            isAutoReset: true
        });
    }

    // Sắp xếp lại
    cleanTimeline.sort((a, b) => a.time - b.time);

    fetch(`http://127.0.0.1:9000/api/effects/${currentTimelineEffectId}/timeline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${app.authToken}` },
        body: JSON.stringify({ timeline: cleanTimeline, isComposite: true })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                app.showNotification('success', '💾 Lưu timeline thành công!');
                // Cập nhật lại dữ liệu giao diện từ backend trả về hoặc bản clean
                currentTimeline = data.timeline || cleanTimeline;
                renderKeyframes();
                closeTimelineEditor();
                if (app.loadAdminDashboard) app.loadAdminDashboard();
            } else {
                app.showNotification('error', '❌ Lưu thất bại: ' + (data.error || 'Lỗi máy chủ'));
            }
        })
        .catch(err => {
            console.error('Save timeline error:', err);
            app.showNotification('error', '❌ Lỗi kết nối API lưu timeline!');
        });
}
// ===== HÀM TẢI DANH SÁCH OBS SOURCES =====
async function loadOBSSources() {
    const select = document.getElementById('kf-source');
    if (!select) return;

    // ✅ Thêm option tự động nhận diện lên đầu
    select.innerHTML = `<option value="auto_webcam" style="color:#10b981; font-weight:bold;">📷 Webcam (Tự động nhận diện)</option>
                        <option value="">-- Hoặc chọn Source cụ thể --</option>`;

    try {
        const res = await fetch(this.API_URL + '/api/obs/sources', {
            headers: { 'Authorization': `Bearer ${app.authToken}` }
        });
        const data = await res.json();

        if (data.success && data.sources) {
            // Phân loại webcam và source khác
            const webcams = data.sources.filter(s => s.isWebcam);
            const others = data.sources.filter(s => !s.isWebcam);

            // Thêm nhóm webcam
            if (webcams.length > 0) {
                const grp = document.createElement('optgroup');
                grp.label = '📹 Webcam / Thiết bị ghi hình';
                webcams.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    grp.appendChild(opt);
                });
                select.appendChild(grp);
            }

            // Thêm nhóm source khác
            if (others.length > 0) {
                const grp = document.createElement('optgroup');
                grp.label = '📦 Nguồn khác (âm thanh, chữ, trình duyệt...)';
                others.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    grp.appendChild(opt);
                });
                select.appendChild(grp);
            }
        }
    } catch (err) {
        console.error('Lỗi load OBS sources:', err);
        select.innerHTML += '<option value="">❌ Lỗi kết nối</option>';
    }
}


// ===== DEBUG GIFT MAPPING =====
window.testGiftMapping = function () {
    console.log('🔍 Testing Gift Mapping...');
    console.log('API_URL:', app.API_URL);
    console.log('WS_URL:', app.WS_URL);
    console.log('App object:', app);

    // Test load functions
    app.loadGifts().then(() => console.log('✅ Gifts loaded'));
    app.loadEffectsForMapping().then(() => console.log('✅ Effects loaded'));
    app.loadMappings().then(() => console.log('✅ Mappings loaded'));
};

window.openTimelineEditor = openTimelineEditor;
window.closeTimelineEditor = closeTimelineEditor;
window.addKeyframe = addKeyframe;
window.deleteKeyframe = deleteKeyframe;
window.saveTimeline = saveTimeline;

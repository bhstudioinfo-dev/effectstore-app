console.log("JS LOADED OK ðŸ”¥");

// Global Navigation Function
function navigateTo(url) {
    window.location.href = url;
}

// Global Banner Manager Helper
function openBannerManager() {
    navigateTo('admin-banner.html');
}

// ===== APP CLASS =====
class EffectStoreApp {
    constructor() {
        this.effects = [];
        this.ownedEffects = [];
        this.personalEffects = [];
        this.pendingPersonalEffectFiles = null;
        this.cart = [];
        this.machineId = null;
        this.currentView = 'store';
        this.currentUser = null;
        this.authToken = null;
        this.pendingEffects = null;
        this.pendingPaymentEffects = JSON.parse(localStorage.getItem('es_pending_payments') || '[]');
        this.logsInterval = null;

        // TikTok Live variables
        this.ws = null;
        this.WS_URL = 'ws://127.0.0.1:9001';
        this.API_URL = 'http://127.0.0.1:9000';
        this.selectedGift = null;
        this.selectedEffect = null;
        this.giftMappings = [];

        // CÃ i Ä‘áº·t TTS (Text to Speech)
        this.isTTSGiftEnabled = localStorage.getItem('es_tts_gift_enabled') !== 'false';
        this.isTTSFollowEnabled = localStorage.getItem('es_tts_follow_enabled') !== 'false';
        this.ttsThreshold = parseInt(localStorage.getItem('es_tts_threshold') || '10');
        this.pendingDonors = new Map(); // userId -> {nickname, giftName, timestamp}
        this.ttsVolume = parseFloat(localStorage.getItem('es_tts_volume') || '1.0');

        // HÃ ng Ä‘á»£i giá»ng nÃ³i (TTS Queue)
        this.ttsQueue = [];
        this.isProcessingTTS = false;
        this.currentAudio = null;

        // Load danh sÃ¡ch giá»ng khi thay Ä‘á»•i
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();

        // ThÃªm láº¯ng nghe phÃ­m Enter Ä‘á»ƒ mapping
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.currentView === 'gift-mapping') {
                if (this.selectedGift && this.selectedEffect) {
                    this.createMapping();
                }
            }
        });

        this.init();
    }
    async init() {
        try {
            // Dá»n dáº¹p localStorage cÅ© tá»« phiÃªn báº£n trÆ°á»›c
            // Cleanup logic removed to prevent data loss on refresh

            let savedMachineId = localStorage.getItem('es_machine_id');
            if (!savedMachineId) {
                savedMachineId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('es_machine_id', savedMachineId);
            }
            this.machineId = savedMachineId;

            await this.checkAuth();

            if (this.currentUser) {
                await this.loadBanner();
                await this.loadOwnedEffects();
                await this.loadEffects();
                this.loadCart();
                this.updateUI();

                this.pollSystemStatus();
                setInterval(() => this.pollSystemStatus(), 5000);
                this.startFlashSaleTimer();
                if (new URLSearchParams(window.location.search).get('pricing') === '1') {
                    setTimeout(() => this.showPricing(), 150);
                }
            }
        } catch (err) {
            console.error('Init error:', err);
        }
    }

    async checkAuth() {
        const token = localStorage.getItem('token');

        if (!token) {
            document.getElementById('auth-modal')?.classList.add('show');
            return;
        }

        try {
            const res = await fetch(this.API_URL + '/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                this.currentUser = data.user;
                this.authToken = token;
                // DO NOT overwrite this.machineId here! It should be the device ID from localStorage.
                document.getElementById('auth-modal')?.classList.remove('show');
                this.updateUserUI();
                await this.loadBanner();
                await this.loadOwnedEffects();
                await this.loadEffects();
                this.loadCart();
                this.updateUI();
                this.pollSystemStatus();
            } else {
                localStorage.removeItem('token');
                document.getElementById('auth-modal')?.classList.add('show');
            }
        } catch (e) {
            console.error('Auth error', e);
            localStorage.removeItem('token');
            document.getElementById('auth-modal')?.classList.add('show');
        }
    }

    openCustomEffectModal() {
        const title = document.getElementById('custom-request-title');
        const subtitle = document.getElementById('custom-request-subtitle');
        const descLabel = document.getElementById('custom-request-description-label');
        const desc = document.getElementById('custom-req-desc');
        if (title) title.textContent = 'Táº¡o Hiá»‡u á»¨ng RiÃªng';
        if (subtitle) subtitle.textContent = 'HÃ£y gá»­i yÃªu cáº§u thiáº¿t káº¿ cá»§a báº¡n, chÃºng tÃ´i sáº½ liÃªn há»‡ láº¡i sá»›m nháº¥t!';
        if (descLabel) descLabel.textContent = 'MÃ´ táº£ Ã½ tÆ°á»Ÿng hiá»‡u á»©ng *';
        if (desc) desc.placeholder = 'MÃ´ táº£ ngáº¯n gá»n ká»‹ch báº£n, quÃ  táº·ng tÆ°Æ¡ng á»©ng...';
        const modal = document.getElementById('custom-effect-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
            // Äiá»n sáºµn thÃ´ng tin náº¿u user Ä‘Ã£ Ä‘Äƒng nháº­p
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

    async submitCustomEffectReq() {
        const name = document.getElementById('custom-req-name').value.trim();
        const phone = document.getElementById('custom-req-phone').value.trim();
        const description = document.getElementById('custom-req-desc').value.trim();

        if (!name || !phone || !description) {
            const notifMessage = document.getElementById('notification-message');
            const notifIcon = document.getElementById('notification-icon');
            const notif = document.getElementById('notification');
            if (notifMessage && notifIcon && notif) {
                notifIcon.textContent = 'âš ï¸';
                notifMessage.textContent = 'Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§ thÃ´ng tin!';
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
                    notifIcon.textContent = 'âœ…';
                    notifMessage.textContent = 'Gá»­i yÃªu cáº§u thÃ nh cÃ´ng! ChÃºng tÃ´i sáº½ liÃªn há»‡ láº¡i sá»›m.';
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
                    notifIcon.textContent = 'âŒ';
                    notifMessage.textContent = data.error || 'CÃ³ lá»—i xáº£y ra';
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
                notifIcon.textContent = 'âŒ';
                notifMessage.textContent = 'Lá»—i káº¿t ná»‘i mÃ¡y chá»§';
                notif.className = 'notification error show';
                setTimeout(() => notif.classList.remove('show'), 3000);
            }
        }
    }

    updateUserUI() {
        if (!this.currentUser) return;
        const u = this.currentUser;
        const nameChar = (u.name && u.name.length > 0) ? u.name[0].toUpperCase() : 'U';

        // Badge + mÃ u theo cáº¥p Ä‘á»™
        const planInfo = {
            admin: { label: 'ðŸ‘‘ Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.3)' },
            business: { label: 'â­ Pro', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)' },
            pro: { label: 'âš¡ Basic', color: '#d4af37', bg: 'rgba(212,175,55,0.15)', border: 'rgba(212,175,55,0.3)' },
            free: { label: 'ðŸ†“ Free', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.2)' }
        };
        const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
        const plan = planInfo[planKey] || planInfo.free;

        // Cáº­p nháº­t avatar chá»¯
        const avatarEl = document.getElementById('user-avatar-small');
        if (avatarEl) {
            avatarEl.textContent = nameChar;
            const parentAvatar = avatarEl.parentElement;
            if (parentAvatar) {
                parentAvatar.style.background = u.isAdmin
                    ? 'linear-gradient(135deg,#ff6b35,#ff9a3c)'
                    : (u.subscription === 'business' ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
                        : (u.subscription === 'pro' ? 'linear-gradient(135deg,#d4af37,#f4e4ba)'
                            : 'linear-gradient(135deg,#374151,#4b5563)'));
                parentAvatar.style.color = u.isAdmin ? '#fff' : (u.subscription === 'pro' ? '#000' : '#fff');
            }
            avatarEl.style.background = 'transparent';
        }

        // Cáº­p nháº­t tÃªn
        const nameEl = document.getElementById('user-name-display');
        if (nameEl) nameEl.textContent = u.name || u.email;

        // Cáº­p nháº­t Rank Badge
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

        // Cáº­p nháº­t email â†’ thay báº±ng badge gÃ³i
        const emailEl = document.getElementById('user-email-display');
        if (emailEl) {
            emailEl.innerHTML = `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</span>`;
        }

        // Hiá»‡n/áº©n Admin Dashboard
        const adminNavItem = document.getElementById('admin-nav-item');
        if (adminNavItem) {
            adminNavItem.style.display = u.isAdmin ? '' : 'none';
        }
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
            this.showNotification('error', 'Vui lÃ²ng nháº­p email vÃ  máº­t kháº©u!');
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
                this.currentUser = data.user;
                this.authToken = data.token;
                document.getElementById('auth-modal')?.classList.remove('show');
                this.updateUserUI();
                this.showNotification('success', `âœ… ChÃ o má»«ng ${data.user.name || data.user.email}!`);
                await this.loadBanner();
                await this.loadOwnedEffects();
                await this.loadEffects();
                this.loadCart();
                this.updateUI();
                this.pollSystemStatus();
                setInterval(() => this.pollSystemStatus(), 5000);
            } else {
                this.showNotification('error', data.error || data.message || 'ÄÄƒng nháº­p tháº¥t báº¡i');
            }
        } catch (e) {
            console.error('Login exception:', e);
            this.showNotification('error', 'Lá»—i káº¿t ná»‘i server');
        }
    }

    async register() {
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const res = await fetch(this.API_URL + '/api/auth/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, machineId: this.machineId })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.token);
                this.showNotification('success', 'ÄÄƒng kÃ½ thÃ nh cÃ´ng!');
                location.reload();
            } else {
                this.showNotification('error', data.error || data.message || 'ÄÄƒng kÃ½ tháº¥t báº¡i');
            }
        } catch (e) { this.showNotification('error', 'Lá»—i káº¿t ná»‘i server'); }
    }

    async logout() {
        try {
            if (this.authToken) {
                await fetch(`${this.API_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                });
            }
        } catch (_error) { }
        localStorage.removeItem('token');
        location.reload();
    }

    openStudioContact() {
        this.closePricing();
        this.openCustomEffectModal();
        const title = document.getElementById('custom-request-title');
        const subtitle = document.getElementById('custom-request-subtitle');
        const descLabel = document.getElementById('custom-request-description-label');
        const desc = document.getElementById('custom-req-desc');
        if (title) title.textContent = 'TÆ° váº¥n gÃ³i Studio';
        if (subtitle) subtitle.textContent = 'BH Studio sáº½ tÆ° váº¥n giáº£i phÃ¡p phÃ¹ há»£p cho team vÃ  doanh nghiá»‡p cá»§a báº¡n.';
        if (descLabel) descLabel.textContent = 'Nhu cáº§u váº­n hÃ nh *';
        if (desc) desc.placeholder = 'Sá»‘ mÃ¡y, sá»‘ phÃ²ng Live, quy mÃ´ team vÃ  nhu cáº§u tÃ­ch há»£p...';
    }

    async pollSystemStatus() {
        try {
            const res = await fetch(`${this.API_URL}/api/system/status`);
            if (!res.ok) throw new Error('API Offline');
            const data = await res.json();
            this.updateSystemStatusUI(data);
        } catch (err) {
            // Náº¿u lá»—i (khÃ´ng gá»i Ä‘Æ°á»£c API), máº·c Ä‘á»‹nh Launcher lÃ  offline, cÃ²n láº¡i offline
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
            document.getElementById('status-badge-tiktok').textContent = 'ÄANG LIVE';
            document.getElementById('status-sub-tiktok').textContent = 'Äang nháº­n dá»¯ liá»‡u trá»±c tiáº¿p';
        } else {
            tiktokCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-tiktok').textContent = 'NGáº®T Káº¾T Ná»I';
            document.getElementById('status-sub-tiktok').textContent = 'Vui lÃ²ng káº¿t ná»‘i tÃ i khoáº£n';
        }

        // OBS
        const obsCard = document.getElementById('status-card-obs');
        if (data.obs?.connected) {
            obsCard.className = 'status-card-horizontal status-connected';
            document.getElementById('status-badge-obs').textContent = 'ÄÃƒ Káº¾T Ná»I';
            document.getElementById('status-sub-obs').textContent = 'Sáºµn sÃ ng kÃ­ch hoáº¡t hiá»‡u á»©ng';
        } else {
            obsCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-obs').textContent = 'OFFLINE';
            document.getElementById('status-sub-obs').textContent = 'Äang dÃ² tÃ¬m... Vui lÃ²ng má»Ÿ OBS';
        }

        // LAUNCHER
        const launcherCard = document.getElementById('status-card-launcher');
        if (data.launcher?.connected) {
            launcherCard.className = 'status-card-horizontal status-connected';
            document.getElementById('status-badge-launcher').textContent = 'ÄANG CHáº Y';
            document.getElementById('status-sub-launcher').textContent = 'Há»‡ thá»‘ng hoáº¡t Ä‘á»™ng bÃ¬nh thÆ°á»ng';
        } else {
            launcherCard.className = 'status-card-horizontal status-disconnected';
            document.getElementById('status-badge-launcher').textContent = 'Máº¤T Káº¾T Ná»I';
            document.getElementById('status-sub-launcher').textContent = 'KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§';
        }
    }
    async loadBanner() {
        try {
            const res = await fetch(`${this.API_URL}/api/banner`);
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
                const primaryUrl = normalizeBannerUrl(this.API_URL, data.banner.url);
                const fallbackBase = this.API_URL.includes('127.0.0.1')
                    ? this.API_URL.replace('127.0.0.1', 'localhost')
                    : this.API_URL.replace('localhost', '127.0.0.1');
                const fallbackUrl = normalizeBannerUrl(fallbackBase, data.banner.url);
                const bannerUrl = `${encodeURI(primaryUrl)}?v=${bannerVersion}`;
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

                console.log('âœ… Banner loaded:', data.banner.url);
            } else if (!heroBanner) {
                console.warn('âš ï¸ .hero-banner-new not found in DOM');
            }

        } catch (err) {
            console.error('Load banner lá»—i:', err);
        }
    }
    async loadEffects() {
        try {
            const response = await fetch(this.API_URL + '/api/effects');
            const data = await response.json();
            this.effects = data.effects || [];
            if (this.currentView === 'store') this.renderEffects();
        } catch (error) { console.error('Error loading effects:', error); this.effects = []; if (this.currentView === 'store') this.renderEffects(); }
    }
    async loadTrending() {
        try {
            const res = await fetch(`${this.API_URL}/api/effects/trending`);
            const data = await res.json();
            const container = document.getElementById('trending-effects-list');
            if (!container) return;

            if (data.success && data.effects.length > 0) {
                container.innerHTML = data.effects.map((e, index) => {
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                    const displayUses = (e.fakeUses && e.fakeUses > 0) ? e.fakeUses : (e.uses || 0);
                    const formattedUses = displayUses >= 1000 ? (displayUses / 1000).toFixed(1) + 'K' : displayUses;

                    return `
                                <div class="ranking-item" onclick="app.showEffectDetail('${e._id}')" style="cursor:pointer;">
                                    <div class="ranking-num ${rankClass}">${index + 1}</div>
                                    <div class="ranking-thumb">${e.icon || 'ðŸŽ¬'}</div>
                                    <div class="ranking-info">
                                        <div class="name">${e.name}</div>
                                        <div class="uses">ðŸ‘ ${formattedUses} lÆ°á»£t dÃ¹ng</div>
                                    </div>
                                </div>
                            `;
                }).join('');
            } else {
                container.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px;">ChÆ°a cÃ³ hiá»‡u á»©ng hot</div>';
            }
        } catch (error) { console.error('Load trending error:', error); }
    }
    async loadOwnedEffects() {
        localStorage.removeItem('es_owned_effects');

        if (!this.authToken) {
            this.ownedEffects = [];
            if (this.currentView === 'library') this.renderEffects();
            return;
        }
        try {
            const response = await fetch(this.API_URL + '/api/user/effects', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            if (data.success) {
                if (data.libraryType === 'all_with_ownership') {
                    // API má»›i: táº¥t cáº£ effects cÃ³ flag isOwned
                    this.effects = data.effects || [];
                    this.ownedEffects = this.effects.filter(e => e.isOwned);
                } else if (data.libraryType === 'admin_all') {
                    // Admin: tháº¥y táº¥t cáº£
                    this.effects = data.effects || [];
                    this.ownedEffects = this.effects; // admin "sá»Ÿ há»¯u" táº¥t cáº£
                } else {
                    // Fallback cÅ©
                    this.ownedEffects = data.effects || [];
                }

                // Tá»° Äá»˜NG Dá»ŒN Dáº¸P: Náº¿u Ä‘Ã£ sá»Ÿ há»¯u thÃ¬ xÃ³a khá»i danh sÃ¡ch chá» duyá»‡t
                const ownedIds = this.ownedEffects.map(e => (e.id || e._id));
                const oldPendingCount = (this.pendingPaymentEffects || []).length;
                this.pendingPaymentEffects = (this.pendingPaymentEffects || []).filter(id => !ownedIds.includes(id));

                if (this.pendingPaymentEffects.length !== oldPendingCount) {
                    localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));
                }

                await this.loadPersonalEffects();
                this.renderEffects();
            } else {
                this.ownedEffects = [];
            }
        } catch (error) {
            console.error('Load owned effects error:', error);
            this.ownedEffects = [];
        }
    } // âœ… ÄÃ³ng loadOwnedEffects á»Ÿ Ä‘Ã¢y

    async loadPersonalEffects() {
        try {
            if (!window.electronAPI?.invoke) {
                this.personalEffects = [];
                return;
            }
            const result = await window.electronAPI.invoke('custom-effects:list');
            const localEffects = result?.success ? (result.effects || []) : [];
            const registeredIds = new Set((this.currentUser?.customEffects || []).map(effect => String(effect.localId || effect._id || effect.id || '')));
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
        this.showNotification('warning', 'Vui lÃ²ng táº¯t má»Ÿ láº¡i app Ä‘á»ƒ kÃ­ch hoáº¡t upload hiá»‡u á»©ng cÃ¡ nhÃ¢n.');
    }

    openPersonalEffectUpload() {
        this.pendingPersonalEffectFiles = null;
        this.showModal('Táº£i hiá»‡u á»©ng cÃ¡ nhÃ¢n', `<div style="display:grid;gap:14px;color:#cbd5e1;">
            <div style="padding:12px;border-radius:10px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);font-size:12px;line-height:1.6;"><b style="color:#93c5fd;">â„¹ï¸ LÆ°u Ã½ vá» hiá»‡u á»©ng cÃ¡ nhÃ¢n</b><br>File Ä‘Æ°á»£c lÆ°u trá»±c tiáº¿p trÃªn mÃ¡y tÃ­nh nÃ y vÃ  khÃ´ng táº£i lÃªn mÃ¡y chá»§ BH Studio.<br>â€¢ Chá»‰ nháº­n video MP4, MOV, AVI hoáº·c WebM dÆ°á»›i 500MB.<br>â€¢ File trÃªn 200MB cÃ³ thá»ƒ máº¥t vÃ i phÃºt Ä‘á»ƒ tá»‘i Æ°u, nÃªn lÃ m trÆ°á»›c khi livestream.<br>â€¢ App sáº½ tá»‘i Æ°u thÃ nh WebM VP9 dá»c 9:16, tá»‘i Ä‘a 15 giÃ¢y Ä‘á»ƒ cháº¡y mÆ°á»£t hÆ¡n.<br>â€¢ App khÃ´ng tá»± xÃ³a ná»n; ná»n trong suá»‘t chá»‰ cÃ³ náº¿u video gá»‘c cÃ³ alpha.<br>â€¢ Äá»•i mÃ¡y hoáº·c cÃ i láº¡i á»©ng dá»¥ng sáº½ khÃ´ng tá»± khÃ´i phá»¥c.</div>
            <label style="display:grid;gap:6px;font-size:12px;">TÃªn hiá»‡u á»©ng<input id="personal-effect-name" maxlength="80" class="upload-form-input" placeholder="VÃ­ dá»¥: PhÃ¡o hoa cáº£m Æ¡n"></label>
            <button onclick="app.choosePersonalEffectFiles()" style="padding:12px;border:1px dashed rgba(167,139,250,.55);border-radius:10px;background:rgba(124,58,237,.1);color:#ddd6fe;cursor:pointer;font-weight:700;">Chá»n video hiá»‡u á»©ng</button>
            <div id="personal-effect-file-status" style="font-size:12px;color:#94a3b8;">ChÆ°a chá»n video</div>
            <button id="personal-effect-save-btn" onclick="app.savePersonalEffect()" class="pro-btn" style="padding:12px;">Tá»‘i Æ°u & lÆ°u hiá»‡u á»©ng</button></div>`);
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
        if (status) status.textContent = `âœ“ ÄÃ£ chá»n ${result.videoName || 'video'} â€¢ sáº½ tá»‘i Æ°u thÃ nh ${result.outputLabel || 'WebM VP9'} â€¢ tá»‘i Ä‘a ${result.maxDurationSeconds || 15}s${result.warning ? ` â€¢ ${result.warning}` : ''}`;
        if (result.warning) this.showNotification('warning', result.warning);
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Choose personal effect files error:', error);
            this.showNotification('error', 'KhÃ´ng thá»ƒ má»Ÿ cá»­a sá»• chá»n file.');
        }
    }

    async savePersonalEffect() {
        const name = document.getElementById('personal-effect-name')?.value.trim();
        if (!name || !this.pendingPersonalEffectFiles?.videoPath) return this.showNotification('warning', 'Vui lÃ²ng nháº­p tÃªn vÃ  chá»n video hiá»‡u á»©ng.');
        const registerId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const saveBtn = document.getElementById('personal-effect-save-btn');
        const status = document.getElementById('personal-effect-file-status');
        try {
            if (!window.electronAPI?.invoke) return this.showCustomEffectRestartNotice();
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Äang tá»‘i Æ°u video...';
                saveBtn.style.opacity = '0.7';
                saveBtn.style.cursor = 'wait';
            }
            if (status) status.textContent = 'Äang chuyá»ƒn video sang WebM VP9, vui lÃ²ng chá»...';
            const saved = await window.electronAPI.invoke('custom-effects:save', { id: registerId, name, ...this.pendingPersonalEffectFiles });
            if (!saved?.success) {
                throw new Error(saved?.error || 'KhÃ´ng thá»ƒ lÆ°u file.');
            }
            const savedEffect = saved.effect || {};
            const duration = Number(savedEffect.duration || savedEffect.maxDurationSeconds);
            if (!Number.isFinite(duration) || duration <= 0) {
                await window.electronAPI.invoke('custom-effects:delete', registerId);
                throw new Error('KhÃ´ng Ä‘á»c Ä‘Æ°á»£c thá»i lÆ°á»£ng video sau khi chuyá»ƒn Ä‘á»•i.');
            }
            const response = await fetch(`${this.API_URL}/api/user/custom-effects/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ localId: registerId, name, machineId: this.machineId, duration })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                await window.electronAPI.invoke('custom-effects:delete', registerId);
                if (response.status === 404) throw new Error('Backend chÆ°a náº¡p API upload hiá»‡u á»©ng cÃ¡ nhÃ¢n. Vui lÃ²ng táº¯t má»Ÿ láº¡i backend/app rá»“i thá»­ láº¡i.');
                if (this.handlePlanLimit(data, 'customEffects')) {
                    if (status) status.textContent = 'GÃ³i hiá»‡n táº¡i Ä‘Ã£ Ä‘áº¡t giá»›i háº¡n hiá»‡u á»©ng cÃ¡ nhÃ¢n.';
                    return;
                }
                throw new Error(data.message || data.error || `KhÃ´ng thá»ƒ Ä‘Äƒng kÃ½ hiá»‡u á»©ng. HTTP ${response.status}`);
            }
            if (this.currentUser) {
                this.currentUser.customEffects = [
                    ...(this.currentUser.customEffects || []).filter(effect => effect?.localId !== registerId),
                    { localId: registerId, name, machineId: this.machineId, duration, createdAt: new Date().toISOString() }
                ];
            }
            this.closeModal();
            await this.loadOwnedEffects();
            if (this.currentView === 'gift-mapping') await this.loadEffectsForMapping();
            this.showNotification('success', 'ÄÃ£ thÃªm hiá»‡u á»©ng cÃ¡ nhÃ¢n vÃ o Gift Mapping.');
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Save personal effect error:', error);
            this.showNotification('error', error.message || 'KhÃ´ng thá»ƒ lÆ°u hiá»‡u á»©ng cÃ¡ nhÃ¢n.');
            if (status) status.textContent = 'LÆ°u tháº¥t báº¡i. Vui lÃ²ng kiá»ƒm tra lá»—i vÃ  thá»­ láº¡i.';
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Tá»‘i Æ°u & lÆ°u hiá»‡u á»©ng';
                saveBtn.style.opacity = '';
                saveBtn.style.cursor = '';
            }
        }
    }

    async deletePersonalEffect(effectId) {
        if (!confirm('Hiá»‡u á»©ng sáº½ bá»‹ xÃ³a vÄ©nh viá»…n khá»i mÃ¡y tÃ­nh nÃ y. CÃ¡c mapping Ä‘ang sá»­ dá»¥ng hiá»‡u á»©ng cÅ©ng sáº½ bá»‹ áº£nh hÆ°á»Ÿng. Báº¡n cÃ³ cháº¯c muá»‘n xÃ³a?')) return;
        try {
            if (!window.electronAPI?.invoke) return this.showCustomEffectRestartNotice();
            const result = await window.electronAPI.invoke('custom-effects:delete', effectId);
            if (!result?.success) return this.showNotification('error', result?.error || 'KhÃ´ng thá»ƒ xÃ³a hiá»‡u á»©ng.');
            await fetch(`${this.API_URL}/api/user/custom-effects/${effectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}` } });
            if (this.currentUser) {
                this.currentUser.customEffects = (this.currentUser.customEffects || []).filter(effect => effect?.localId !== effectId);
            }
            await this.loadOwnedEffects();
            if (this.currentView === 'gift-mapping') await this.loadEffectsForMapping();
            this.showNotification('success', 'ÄÃ£ xÃ³a hiá»‡u á»©ng cÃ¡ nhÃ¢n khá»i mÃ¡y.');
        } catch (error) {
            if (this.isCustomEffectBridgeMissing(error)) return this.showCustomEffectRestartNotice();
            console.error('Delete personal effect error:', error);
            this.showNotification('error', 'KhÃ´ng thá»ƒ xÃ³a hiá»‡u á»©ng cÃ¡ nhÃ¢n.');
        }
    }

    updateUI() {
        this.updateUserUI();
        this.loadTrending();

        const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);

        // Náº¿u lÃ  admin, sá»‘ lÆ°á»£ng sá»Ÿ há»¯u thá»±c táº¿ cÃ³ thá»ƒ khÃ¡c vá»›i danh sÃ¡ch hiá»ƒn thá»‹ (vÃ¬ admin tháº¥y táº¥t cáº£)
        // Tuy nhiÃªn Ä‘á»ƒ Ä‘áº¹p thÃ¬ admin váº«n hiá»‡n sá»‘ lÆ°á»£ng toÃ n bá»™ kho
        document.getElementById('owned-count').textContent = this.ownedEffects.length;

        // Sá»­ dá»¥ng giÃ¡ trá»‹ thá»±c táº¿ tá»« DB thay vÃ¬ cá»™ng dá»“n giÃ¡ tiá»n (Ä‘áº·c biá»‡t quan trá»ng vá»›i Admin)
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
    } // âœ… ÄÃ³ng updateUI á»Ÿ Ä‘Ã¢y

    addOwnedEffect(effect) {
        const owned = { ...effect, purchasedAt: new Date().toISOString(), machineId: this.machineId, useCount: 0 };
        this.ownedEffects.push(owned);
        localStorage.setItem('es_owned_effects', JSON.stringify(this.ownedEffects));
    }
    loadCart() {
        if (this.currentUser) {
            this.cart = JSON.parse(localStorage.getItem(`es_cart_${this.currentUser.id}`) || '[]');
        } else {
            this.cart = [];
        }
        this.updateCartUI();
    }
    saveCart() {
        if (this.currentUser) {
            localStorage.setItem(`es_cart_${this.currentUser.id}`, JSON.stringify(this.cart));
        }
        this.updateCartUI();
    }
    updateCartUI() {
        const count = this.cart.length;
        // Badge trÃªn icon giá» hÃ ng
        const badge = document.getElementById('cart-count');
        if (badge) badge.textContent = count;
        // Text trong sidebar
        const countText = document.getElementById('cart-count-text');
        if (countText) countText.textContent = `${count} sáº£n pháº©m`;
        // Danh sÃ¡ch items
        const list = document.getElementById('cart-items-list');
        const empty = document.getElementById('cart-empty');
        const footer = document.getElementById('cart-footer');
        if (!list) return;
        if (count === 0) {
            if (empty) empty.style.display = 'block';
            if (footer) footer.style.display = 'none';
            // XÃ³a items cÅ© (giá»¯ empty state)
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
        // XÃ³a items cÅ©
        Array.from(list.children).forEach(c => { if (c.id !== 'cart-empty') c.remove(); });
        this.cart.forEach(effect => {
            const id = effect._id || effect.id;
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;';

            const cartItemPrice = (effect.isFlashSale && effect.flashSalePrice > 0) ? effect.flashSalePrice : effect.price;
            const priceColor = effect.isFlashSale ? '#ef4444' : '#d4af37';

            item.innerHTML = `
                        <div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${effect.icon || 'ðŸŽ¬'}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${effect.name}</div>
                            <div style="font-size:12px;color:${priceColor};font-weight:700;margin-top:2px;">${this.formatPrice(cartItemPrice)}</div>
                        </div>
                        <button onclick="app.removeFromCart('${id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#ef4444;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">Ã—</button>
                    `;
            list.appendChild(item);
        });
    }
    addToCart(effectId) {
        const effect = this.effects.find(e => (e.id || e._id) === effectId);
        if (!effect) return;
        if (this.ownedEffects.find(e => (e.id || e._id) === effectId)) { this.showNotification('warning', 'âš ï¸ Báº¡n Ä‘Ã£ sá»Ÿ há»¯u effect nÃ y!'); return; }
        if (this.pendingPaymentEffects && this.pendingPaymentEffects.includes(effectId)) { this.showNotification('warning', 'â³ Äang chá» admin duyá»‡t thanh toÃ¡n!'); return; }
        if (this.cart.find(e => (e.id || e._id) === effectId)) { this.showNotification('warning', 'âš ï¸ ÄÃ£ cÃ³ trong giá»!'); return; }
        this.cart.push(effect);
        this.saveCart();
        this.showNotification('success', `âœ… ÄÃ£ thÃªm "${effect.name}" vÃ o giá»!`);
        this.renderEffects();
    }


    // ===== TEXT TO SPEECH (TTS) =====
    loadVoices() {
        const voiceSelect = document.getElementById('settings-tts-voice');
        if (!voiceSelect) return;

        const voices = window.speechSynthesis.getVoices();
        const viVoices = voices.filter(v => v.lang.includes('vi'));

        voiceSelect.innerHTML = viVoices.map(v =>
            `<option value="${v.name}" ${v.name === this.selectedVoiceName ? 'selected' : ''}>${v.name}</option>`
        ).join('');

        if (viVoices.length > 0 && !this.selectedVoiceName) {
            this.selectedVoiceName = viVoices[0].name;
        }
    }

    // ===== TEXT TO SPEECH (TTS) =====
    async speakText(text) {
        if (!text) return;
        try {
            const response = await fetch(`${this.API_URL}/api/tiktok/usage/tts`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                if (!this.handlePlanLimit(data, 'tts') && response.status !== 409) {
                    this.showNotification('error', data.message || 'KhÃ´ng thá»ƒ sá»­ dá»¥ng TTS lÃºc nÃ y');
                }
                return;
            }
        } catch (_error) {
            this.showNotification('error', 'KhÃ´ng thá»ƒ kiá»ƒm tra lÆ°á»£t TTS');
            return;
        }
        this.ttsQueue.push(text);
        if (!this.isProcessingTTS) {
            this.processTTSQueue();
        }
    }

    async processTTSQueue() {
        if (this.ttsQueue.length === 0) {
            this.isProcessingTTS = false;
            return;
        }

        this.isProcessingTTS = true;
        const text = this.ttsQueue.shift();

        try {
            const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;

            this.currentAudio = new Audio(googleTTSUrl);
            this.currentAudio.volume = this.ttsVolume;

            // Chá» Ã¢m thanh phÃ¡t xong má»›i chuyá»ƒn sang cÃ¢u tiáº¿p theo
            this.currentAudio.onended = () => {
                this.processTTSQueue();
            };

            this.currentAudio.onerror = () => {
                console.error('TTS Error, skipping...');
                this.processTTSQueue();
            };

            await this.currentAudio.play().catch(e => {
                if (e.name !== 'AbortError') console.error('TTS Play Error:', e);
            });
            console.log('ðŸ—£ï¸ Äang phÃ¡t TTS:', text);
        } catch (error) {
            console.error('TTS Play Error:', error);
            this.processTTSQueue();
        }
    }

    removeFromCart(effectId) { this.cart = this.cart.filter(e => (e.id || e._id) !== effectId); this.saveCart(); this.renderEffects(); this.showNotification('success', 'âœ… ÄÃ£ xÃ³a khá»i giá»!'); }
    async checkout() {
        if (this.cart.length === 0) { this.showNotification('warning', 'âš ï¸ Giá» trá»‘ng!'); return; }
        const total = this.cart.reduce((sum, e) => {
            const actualPrice = (e.isFlashSale && e.flashSalePrice > 0) ? e.flashSalePrice : (e.price || 0);
            return sum + actualPrice;
        }, 0);
        const effectIds = this.cart.map(e => e._id || e.id);
        this.pendingEffects = this.cart.map(effect => ({ effectId: effect._id || effect.id, effectName: effect.name, videoPath: `${effect.id}.webm` }));

        try {
            this.showNotification('info', 'â³ Äang táº¡o mÃ£ QR...');
            const response = await fetch(this.API_URL + '/api/payment/create-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: total,
                    effectIds,
                    userId: this.machineId,
                    userName: this.currentUser ? this.currentUser.name : 'Khach'
                })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Failed to create QR');

            // Fix: Ä‘áº£m báº£o orderId luÃ´n cÃ³ giÃ¡ trá»‹
            const orderId = data.orderId || `DH${Date.now()}`;
            const bank = data.bankInfo || {};
            const formattedTotal = this.formatPrice(total);

            this.showModal('Thanh toÃ¡n', `
                        <div style="font-family:inherit;max-width:480px;margin:0 auto;">

                            <!-- QR Block -->
                            <div style="text-align:center;margin-bottom:20px;">
                                <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:6px 14px;margin-bottom:14px;">
                                    <span style="font-size:14px;">ðŸ“²</span>
                                    <span style="font-size:13px;color:#10b981;font-weight:600;">QuÃ©t QR Ä‘á»ƒ thanh toÃ¡n</span>
                                </div>
                                <div style="background:#fff;border-radius:16px;padding:12px;display:inline-block;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
                                    <img src="${data.qrCode}" alt="QR Code" style="width:200px;height:200px;display:block;border-radius:8px;">
                                    <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
                                        <span style="color:#d4145a;font-size:11px;font-weight:800;letter-spacing:0.5px;">VIET</span><span style="color:#00b14f;font-size:11px;font-weight:800;letter-spacing:0.5px;">QR</span>
                                        <span style="color:#bbb;font-size:11px;">â€¢</span>
                                        <span style="color:#555;font-size:12px;font-weight:700;">${bank.bank || 'Techcombank'}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Bank Info -->
                            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);">
                                    <span style="font-size:14px;">ðŸ¦</span>
                                    <span style="font-size:13px;font-weight:700;color:#fff;">ThÃ´ng tin chuyá»ƒn khoáº£n</span>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:10px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">NgÃ¢n hÃ ng</span>
                                        <span style="color:#60a5fa;font-weight:700;font-size:13px;">${bank.bank || 'MBBank'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Sá»‘ TK</span>
                                        <span style="color:#fff;font-weight:700;font-size:14px;letter-spacing:1px;">${bank.accountNumber || '123456789'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Chá»§ TK</span>
                                        <span style="color:#a78bfa;font-weight:700;font-size:13px;">${bank.accountName || 'NGUYEN VAN A'}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                                        <span style="color:#6b7280;font-size:13px;">Sá»‘ tiá»n</span>
                                        <span style="color:#d4af37;font-weight:800;font-size:18px;">${formattedTotal}</span>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="color:#6b7280;font-size:13px;">Ná»™i dung CK</span>
                                        <span style="color:#10b981;font-weight:700;font-size:13px;background:rgba(16,185,129,0.1);padding:3px 10px;border-radius:6px;border:1px solid rgba(16,185,129,0.2);">${bank.description || orderId}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- HÆ°á»›ng dáº«n -->
                            <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:14px;margin-bottom:16px;">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                                    <span>âš¡</span>
                                    <span style="font-size:13px;font-weight:700;color:#fbbf24;">HÆ°á»›ng dáº«n:</span>
                                </div>
                                <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
                                    <li style="font-size:12px;color:#9ca3af;">QuÃ©t QR code báº±ng app ngÃ¢n hÃ ng</li>
                                    <li style="font-size:12px;color:#9ca3af;">Kiá»ƒm tra sá»‘ tiá»n vÃ  ná»™i dung chuyá»ƒn khoáº£n</li>
                                    <li style="font-size:12px;color:#9ca3af;">Chuyá»ƒn khoáº£n thÃ nh cÃ´ng</li>
                                    <li style="font-size:12px;color:#9ca3af;">Nháº¥n <strong style="color:#fff;">"XÃ¡c nháº­n Ä‘Ã£ chuyá»ƒn khoáº£n"</strong> bÃªn dÆ°á»›i</li>
                                    <li style="font-size:12px;color:#a78bfa;">(TÃ¹y chá»n) Upload áº£nh Ä‘á»ƒ Ä‘Æ°á»£c duyá»‡t nhanh hÆ¡n</li>
                                </ol>
                            </div>

                            <!-- Upload áº£nh (tÃ¹y chá»n) -->
                            <div style="margin-bottom:16px;">
                                <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                    ðŸ“Ž Upload áº£nh chuyá»ƒn khoáº£n
                                    <span style="font-size:10px;background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);padding:2px 7px;border-radius:20px;font-weight:600;">KhÃ´ng báº¯t buá»™c</span>
                                </label>
                                <div style="border:2px dashed rgba(255,255,255,0.10);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;transition:border-color 0.2s;"
                                    onmouseover="this.style.borderColor='rgba(167,139,250,0.35)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.10)'">
                                    <input type="file" id="payment-proof-input" accept="image/*" style="display:none;" onchange="app.previewPaymentProof(this)">
                                    <button onclick="document.getElementById('payment-proof-input').click()" style="padding:8px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#9ca3af;cursor:pointer;font-size:12px;white-space:nowrap;">Chá»n áº£nh</button>
                                    <span id="payment-proof-name" style="font-size:12px;color:#6b7280;">ChÆ°a chá»n file</span>
                                </div>
                                <div id="payment-proof-preview" style="display:none;margin-top:10px;text-align:center;">
                                    <img id="payment-proof-img" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
                                </div>
                                <p style="font-size:11px;color:#4b5563;margin-top:6px;">áº¢nh giÃºp admin xÃ¡c thá»±c nhanh hÆ¡n (10-30 phÃºt)</p>
                            </div>

                            <!-- Auto status -->
                            <div id="payment-status-indicator" style="padding:10px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);color:#10b981;font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
                                <span>â³</span> Äang chá» xÃ¡c nháº­n thanh toÃ¡n...
                            </div>

                            <!-- Buttons -->
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${total})" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:all 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(124,58,237,0.5)'"
                                    onmouseout="this.style.transform='';this.style.boxShadow=''">
                                    âœ… XÃ¡c nháº­n Ä‘Ã£ chuyá»ƒn khoáº£n
                                </button>
                                <button onclick="app.closeModal()" style="width:100%;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#6b7280;font-size:13px;cursor:pointer;">ÄÃ³ng</button>
                            </div>
                        </div>
                    `);

            // Báº¯t Ä‘áº§u Polling tráº¡ng thÃ¡i Ä‘Æ¡n hÃ ng
            this.startPaymentPolling(orderId, effectIds, total);

        } catch (error) {
            console.error('Checkout error:', error);
            this.showNotification('error', 'âŒ Lá»—i thanh toÃ¡n: ' + error.message);
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
            btn.textContent = 'â³ Äang gá»­i...'; btn.disabled = true;
            const formData = new FormData();
            if (hasProof) formData.append('proof', input.files[0]);
            formData.append('noProof', hasProof ? 'false' : 'true');
            formData.append('orderId', orderId);
            formData.append('userId', this.currentUser ? this.currentUser.id : this.machineId);
            formData.append('effectIds', JSON.stringify(this.pendingEffects.map(e => e.effectId)));
            formData.append('amount', total);
            const headers = {};
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            const res = await fetch(this.API_URL + '/api/payment/confirm', {
                method: 'POST', body: formData, headers
            });
            const data = await res.json();
            const indicator = document.getElementById('payment-status-indicator');
            if (indicator) {
                indicator.style.background = 'rgba(16,185,129,0.15)';
                indicator.style.borderColor = 'rgba(16,185,129,0.4)';
                indicator.innerHTML = hasProof
                    ? 'âœ… ÄÃ£ gá»­i kÃ¨m áº£nh! Admin sáº½ duyá»‡t trong 5-30 phÃºt.'
                    : 'âœ… ÄÃ£ gá»­i yÃªu cáº§u! Admin sáº½ kiá»ƒm tra sao kÃª trong 1-24h.';
            }
            btn.textContent = 'âœ… ÄÃ£ gá»­i thÃ nh cÃ´ng!';
            const msg = hasProof
                ? 'âœ… Gá»­i kÃ¨m áº£nh! Admin duyá»‡t trong 5-30 phÃºt.'
                : 'âœ… ÄÃ£ gá»­i! Admin kiá»ƒm tra sao kÃª trong 1-24h.';
            this.showNotification('success', msg);

            // ThÃªm vÃ o danh sÃ¡ch chá» duyá»‡t
            const cartIds = this.cart.map(e => e._id || e.id);
            this.pendingPaymentEffects.push(...cartIds);
            this.pendingPaymentEffects = [...new Set(this.pendingPaymentEffects)];
            localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));

            // XÃ³a giá» hÃ ng
            this.cart = [];
            this.saveCart();
            this.updateCartUI();
            this.renderEffects(); // Cáº­p nháº­t nÃºt thÃ nh Äang chá» duyá»‡t

            // Tá»± Ä‘á»™ng Ä‘Ã³ng form sau 2.5 giÃ¢y
            setTimeout(() => {
                this.closeModal();
            }, 2500);

        } catch (err) {
            this.showNotification('error', 'âŒ Lá»—i gá»­i: ' + err.message);
        }
    }

    startPaymentPolling(orderId, effectIds, amount) {
        if (this.paymentInterval) clearInterval(this.paymentInterval);
        let attempts = 0;

        this.paymentInterval = setInterval(async () => {
            attempts++;
            // Dá»«ng sau 10 phÃºt (200 láº§n)
            if (attempts > 200 || !document.getElementById('modal-overlay').classList.contains('show')) {
                clearInterval(this.paymentInterval);
                return;
            }

            try {
                const res = await fetch(`http://127.0.0.1:9000/api/payment/status/${orderId}`);
                const data = await res.json();
                if (data.success && data.status === 'approved') {
                    clearInterval(this.paymentInterval);
                    const indicator = document.getElementById('payment-status-indicator');
                    if (indicator) {
                        indicator.style.background = '#10b981';
                        indicator.style.color = '#000';
                        indicator.innerHTML = 'ðŸŽ‰ Thanh toÃ¡n thÃ nh cÃ´ng!';
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
            this.showNotification('info', 'ÄÃ£ báº¯n webhook giáº£ láº­p!');
        } catch (e) {
            console.error('Simulate err:', e);
        }
    }
    async completePurchase(effectIds, amount) {
        // XÃ³a khá»i danh sÃ¡ch chá» duyá»‡t
        this.pendingPaymentEffects = this.pendingPaymentEffects.filter(id => !effectIds.includes(id));
        localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));

        // ThÃªm vÃ o ownedEffects tá»« danh sÃ¡ch tá»•ng (vÃ¬ cart Ä‘Ã£ bá»‹ xÃ³a trÆ°á»›c Ä‘Ã³)
        effectIds.forEach(id => {
            const effect = this.effects.find(e => (e._id || e.id) === id);
            if (effect) this.addOwnedEffect(effect);
        });

        // Xá»­ lÃ½ Setup OBS náº¿u cÃ³
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

        // LÆ°u lá»‹ch sá»­
        const history = JSON.parse(localStorage.getItem('es_purchase_history') || '[]');
        history.push({ date: new Date().toISOString(), items: effectIds, total: amount });
        localStorage.setItem('es_purchase_history', JSON.stringify(history));

        // Quan trá»ng: Táº£i láº¡i dá»¯ liá»‡u tá»« server Ä‘á»ƒ cáº­p nháº­t Rank Pro/Business
        await this.checkAuth();
        await this.loadOwnedEffects();

        this.cart = [];
        this.saveCart();
        this.closeModal();
        this.updateUI();
        this.showNotification('success', 'ðŸŽ‰ ChÃºc má»«ng! ÄÆ¡n hÃ ng Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t thÃ nh cÃ´ng.');
    }
    async triggerEffect(effectId) {
        console.log('ðŸŽ¬ Trigger:', effectId);
        this.showNotification('info', 'ðŸŽ¬ Äang kÃ­ch hoáº¡t effect...');

        try {
            const effect = this.ownedEffects.find(e => (e.id || e._id) === effectId) ||
                this.effects.find(e => (e.id || e._id) === effectId);

            if (effect?.isCustom) {
                this.showModal(`Xem thá»­: ${effect.name}`, `<div style="display:flex;justify-content:center;min-height:420px;"><video src="${effect.previewUrl}" autoplay controls playsinline style="width:100%;max-height:70vh;object-fit:contain;background:transparent;"></video></div>`);
                this.showNotification('success', 'Äang xem thá»­ trÃªn app. OBS khÃ´ng Ä‘Æ°á»£c kÃ­ch hoáº¡t.');
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
                                console.log(`ðŸ“¹ Auto-selected webcam: ${webcamSourceName}`);
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
                this.showNotification('success', 'âœ… Effect Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t!');
                const ownedEffect = this.ownedEffects.find(e => (e.id || e._id) === effectId);
                if (ownedEffect) {
                    ownedEffect.useCount = (ownedEffect.useCount || 0) + 1;
                    localStorage.setItem('es_owned_effects', JSON.stringify(this.ownedEffects));
                }
            } else {
                this.showNotification('error', 'âŒ ' + (data.error || data.message));
            }
        } catch (error) {
            console.error('Trigger error:', error);
            this.showNotification('error', 'âŒ Lá»—i: ' + error.message);
        }
    }
    handleThumbError(imgEl) {
        imgEl.style.display = 'none';
        const video = imgEl.nextElementSibling;
        if (video) {
            video.style.opacity = '1';
            video.play().catch(e => {});
        }
    }
    handlePreviewError(videoEl, fallbackIcon) {
        videoEl.style.display = 'none';
        const parent = videoEl.parentElement;
        if (parent) {
            parent.style.display = 'flex';
            parent.style.alignItems = 'center';
            parent.style.justifyContent = 'center';
            parent.style.height = '100%';
            parent.style.fontSize = '64px';
            parent.style.cursor = 'pointer';
            parent.innerHTML = fallbackIcon;
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
                    filter = match ? match[1] : 'free';
                } else {
                    filter = 'free';
                }
            }
        }
        const storeGrid = document.getElementById('effects-grid');
        const libraryGrid = document.getElementById('library-grid');
        const flashSaleGrid = document.getElementById('flash-sale-effects');

        if (this.currentView === 'store') {
            if (storeGrid) {
                this._renderGrid(storeGrid, this.effects, filter, search, 'store');
            }
            if (flashSaleGrid) {
                const flashEffects = this.effects.filter(e => {
                    const now = new Date();
                    const endsAt = e.flashSaleEndsAt ? new Date(e.flashSaleEndsAt) : null;
                    return e.isFlashSale && endsAt && endsAt > now;
                });
                this._renderGrid(flashSaleGrid, flashEffects, 'all', '', 'store');
            }
            this.startMiniFlashSaleTimers();
        }
        if (this.currentView === 'library' && libraryGrid) {
            console.log('ðŸ“š Rendering Library:', this.ownedEffects);
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
                    if (textSpan && textSpan.innerText !== 'Háº¾T Háº N') {
                        textSpan.innerText = 'Háº¾T Háº N';
                        if (hBlock) { hBlock.innerText = '00'; mBlock.innerText = '00'; sBlock.innerText = '00'; }
                        // Tá»± Ä‘á»™ng render láº¡i Ä‘á»ƒ áº©n khung Flash Sale
                        console.log('âš¡ Flash Sale expired, re-rendering...');
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
        let filtered = effects || [];
        if (filter && filter !== 'all') {
            if (filter === 'free') {
                filtered = filtered.filter(e => Number(e.price) === 0);
            } else {
                filtered = filtered.filter(e => e.category === filter);
            }
        }
        if (search) {
            filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
        }

        grid.innerHTML = '';
        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:80px 20px;"><div class="empty-icon" style="font-size:64px;margin-bottom:20px;">${viewName === 'library' ? 'ðŸ“š' : 'ðŸ”'}</div><h3 style="color:var(--text-secondary);font-size:18px;margin-bottom:10px;">${viewName === 'library' ? 'ChÆ°a cÃ³ hiá»‡u á»©ng nÃ o' : 'KhÃ´ng tÃ¬m tháº¥y hiá»‡u á»©ng'}</h3><p style="color:var(--text-muted);">${viewName === 'library' ? 'HÃ£y mua hiá»‡u á»©ng tá»« cá»­a hÃ ng Ä‘á»ƒ sá»Ÿ há»¯u' : 'Thá»­ tÃ¬m vá»›i tá»« khÃ³a khÃ¡c'}</p></div>`;
            return;
        }

        grid.innerHTML = filtered.map(effect => {
            if (!effect) return '';
            const effectId = effect._id || effect.id || effect;
            if (typeof effect !== 'object') {
                // TrÆ°á»ng há»£p dá»¯ liá»‡u thÃ´ chÆ°a Ä‘Æ°á»£c populate
                return `<div class="effect-card pending" style="padding:20px; text-align:center; color:var(--text-muted);">
                            <div style="font-size:24px; margin-bottom:10px;">â³</div>
                            <div style="font-size:12px;">Äang táº£i dá»¯ liá»‡u hiá»‡u á»©ng...</div>
                            <div style="font-size:10px; opacity:0.5; margin-top:5px;">ID: ${effect}</div>
                        </div>`;
            }

            // Logic sá»Ÿ há»¯u:
            // 1. Admin sá»Ÿ há»¯u táº¥t cáº£
            // 2. GÃ³i Business sá»Ÿ há»¯u táº¥t cáº£
            // 3. User Ä‘Ã£ mua láº» (cÃ³ trong ownedEffects)
            const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
            const isBusiness = this.currentUser && this.currentUser.subscription === 'business';
            const hasPurchased = this.ownedEffects.some(e => (e.id || e._id) === effectId);

            const isOwned = isAdmin || isBusiness || hasPurchased;
            const isPending = this.pendingPaymentEffects.includes(effectId);

            // âœ… Xá»¬ LÃ PREVIEW: Thumb -> Video on Hover
            let previewHTML = '';
            const resolveMediaUrl = value => !value ? '' : (/^https?:\/\//i.test(value) ? value : `${this.API_URL}${value}`);
            const thumbUrl = resolveMediaUrl(effect.thumbUrl);
            const videoUrl = resolveMediaUrl(effect.previewUrl);
            const fallbackIcon = effect.icon || 'ðŸŽ¬';

            if (thumbUrl && videoUrl) {
                previewHTML = `
                            <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')"
                                onmouseenter="const v=this.querySelector('video'); if(v) { v.play().catch(e=>{}); }" 
                                onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                                <img src="${thumbUrl}" class="effect-thumb-img" onerror="app.handleThumbError(this)">
                                <video src="${videoUrl}" class="effect-video" muted loop playsinline onerror="app.handlePreviewError(this, '${fallbackIcon}')"></video>
                            </div>
                        `;
            } else if (videoUrl) {
                previewHTML = `
                            <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')">
                                <video src="${videoUrl}" class="effect-video" style="opacity:1;" muted loop autoplay playsinline onerror="app.handlePreviewError(this, '${fallbackIcon}')"></video>
                            </div>
                        `;
            } else {
                previewHTML = `<div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:64px;cursor:pointer;">${fallbackIcon}</div>`;
            }

            // XÃ¡c Ä‘á»‹nh tráº¡ng thÃ¡i vÃ  ná»™i dung nÃºt
            let btnClass = 'btn-add-cart';
            let btnAction = `app.addToCart('${effectId}')`;
            let btnText = 'ðŸ›’ ThÃªm vÃ o giá»';
            let borderCol = 'transparent';

            const isInCart = this.cart.some(item => (item.id || item._id) === effectId);

            // Kiá»ƒm tra Flash Sale cÃ²n hiá»‡u lá»±c khÃ´ng
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
                btnAction = `app.triggerEffect('${effectId}')`;
                btnText = 'â–¶ KÃ­ch Hoáº¡t (ÄÃ£ Sá»Ÿ Há»¯u)';
                borderCol = isFlashSaleActive ? '#ef4444' : 'var(--success)';
            } else if (isPending) {
                btnClass += ' btn-pending';
                btnAction = 'void(0)';
                btnText = 'â³ Äang chá» duyá»‡t';
                borderCol = 'rgba(212, 175, 55, 0.5)';
            } else if (isInCart) {
                btnClass += ' btn-in-cart';
                btnAction = 'app.openCart()';
                btnText = 'ðŸ›’ ÄÃ£ trong giá»';
                borderCol = '#ec4899';
            } else if (isFlashSaleActive) {
                borderCol = '#ef4444';
                btnClass = 'btn-flash-sale';
                btnText = 'âš¡ MUA NGAY (GIÃ Sá»C)';
            }

            if (effect.isCustom) {
                btnAction = `app.triggerEffect('${effectId}')`;
                btnText = 'â–¶ Xem thá»­ trÃªn app';
            }

            let flashSaleBadge = '';
            let originalPriceHTML = '';
            let countdownHTML = '';

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

                // NÃºt thanh toÃ¡n
                let activeBtnClass = 'btn-fs-buy';
                let activeBtnAction = `app.addToCart('${effectId}')`;
                let activeBtnText = '<i class="fas fa-shopping-cart"></i> MUA NGAY';

                if (isInCart) {
                    activeBtnClass = 'btn-add-cart btn-in-cart';
                    activeBtnAction = 'app.openCart()';
                    activeBtnText = 'ðŸ›’ ÄÃ£ trong giá»';
                } else if (isOwned) {
                    activeBtnClass = 'btn-add-cart btn-owned';
                    activeBtnAction = `app.triggerEffect('${effectId}')`;
                    activeBtnText = 'â–¶ KÃ­ch Hoáº¡t (ÄÃ£ Sá»Ÿ Há»¯u)';
                } else if (isPending) {
                    activeBtnClass = 'btn-add-cart btn-pending';
                    activeBtnAction = 'void(0)';
                    activeBtnText = 'â³ Äang chá» duyá»‡t';
                }

                return `<div class="effect-card flash-sale-card" style="position: relative; border: 2px solid #ff3e3e; box-shadow: 0 0 20px rgba(255,62,62,0.3); animation: borderPulse 2s infinite;">
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

            return `<div class="${cardClass}" style="position: relative;">
                        ${effect.isTrending ? `<div class="hot-badge" style="position:absolute; top:10px; right:10px; background:linear-gradient(45deg, #f093fb 0%, #f5576c 100%); color:white; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; z-index:10; box-shadow:0 4px 15px rgba(245,87,108,0.4);"><i class="fas fa-fire"></i> HOT</div>` : ''}
                        <div class="effect-thumbnail">
                            ${previewHTML}
                        </div>
                        <div class="effect-info">
                            <div class="effect-name">${effect.name || 'Hiá»‡u á»©ng khÃ´ng tÃªn'}</div>
                            ${viewName === 'library' ? `
                            <div class="effect-price-row" style="margin-bottom: 5px;">
                                <div style="display: flex; align-items: baseline;">
                                    <span class="price-current" style="color: var(--success); font-weight: 600; font-size: 13px;"><i class="fas fa-check-circle" style="margin-right: 4px;"></i> ÄÃ£ sá»Ÿ há»¯u</span>
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
                            ${effect.isCustom && viewName === 'library' ? `<button onclick="app.deletePersonalEffect('${effectId}')" style="margin-top:7px;width:100%;padding:7px;border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#fca5a5;cursor:pointer;">XÃ³a khá»i mÃ¡y</button>` : ''}
                        </div>
                    </div>`;
        }).join('');
        // Xá»­ lÃ½ hover cho videos - Fix lá»—i AbortError
        setTimeout(() => {
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
        }, 100);
        console.log(`âœ… Rendered ${filtered.length} effects to ${viewName}`);
    }
    getCategoryName(cat) {
        return {
            transformation: 'Biáº¿n hÃ¬nh', gift: 'QuÃ  táº·ng',
            background: 'Background', animation: 'Animation',
            pk: 'PK', meme: 'Meme', team_heart: 'Tym Ä‘á»™i'
        }[cat] || cat;
    }
    formatPrice(price) { return new Intl.NumberFormat('vi-VN').format(price) + 'â‚«'; }
    showNotification(type, message) { const n = document.getElementById('notification'); document.getElementById('notification-icon').textContent = type === 'warning' ? 'âš ï¸' : type === 'error' ? 'âŒ' : 'âœ…'; document.getElementById('notification-message').textContent = message; n.className = 'notification show ' + type; setTimeout(() => n.classList.remove('show'), 4000); }
    showModal(title, content) {
        // ÄÃ³ng cart sidebar náº¿u Ä‘ang má»Ÿ
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartSidebar) cartSidebar.style.right = '-420px';
        if (cartOverlay) cartOverlay.style.display = 'none';
        // Hiá»‡n modal
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal-actions').innerHTML = '';
        document.getElementById('modal-overlay').classList.add('show');
    }
    closeModal() {
        document.getElementById('modal-overlay').classList.remove('show');
        if (this.paymentInterval) { clearInterval(this.paymentInterval); this.paymentInterval = null; }
    }

    showEffectDetail(effectId) {
        const effect = this.effects.find(e => (e.id || e._id) === effectId) || this.ownedEffects.find(e => (e.id || e._id) === effectId);
        if (!effect) return;

        const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
        const isBusiness = this.currentUser && this.currentUser.subscription === 'business';
        const hasPurchased = this.ownedEffects.some(e => (e.id || e._id) === effectId);
        const isOwned = isAdmin || isBusiness || hasPurchased;
        const videoUrl = effect.previewUrl ? `http://127.0.0.1:9000${effect.previewUrl}` : '';

        document.getElementById('detail-name').textContent = `${effect.icon || 'ðŸŽ¬'} ${effect.name}`;
        document.getElementById('detail-category').textContent = this.getCategoryName(effect.category);
        document.getElementById('detail-price').textContent = isOwned ? 'ÄÃ£ Sá»Ÿ Há»¯u' : this.formatPrice(effect.price);
        document.getElementById('detail-original-price').textContent = effect.originalPrice > effect.price ? this.formatPrice(effect.originalPrice) : '';
        document.getElementById('detail-desc-text').textContent = effect.description || 'KhÃ´ng cÃ³ mÃ´ táº£ chi tiáº¿t.';

        const videoEl = document.getElementById('detail-video-player');
        if (videoUrl) {
            videoEl.src = videoUrl;
            videoEl.style.display = 'block';
            videoEl.play().catch(e => console.warn('Autoplay prevented', e));
        } else {
            videoEl.style.display = 'none';
        }

        const btnTestTry = document.getElementById('btn-test-try');
        btnTestTry.onclick = () => this.testTryEffect(effectId);

        const isPending = (this.pendingPaymentEffects || []).includes(effectId);
        const isInCart = this.cart.some(item => (item.id || item._id) === effectId);

        const btnAddCart = document.getElementById('btn-detail-add-cart');
        if (isOwned) {
            btnAddCart.innerHTML = 'â–¶ KÃ­ch Hoáº¡t LÃªn OBS';
            btnAddCart.className = 'btn-add-cart btn-owned';
            btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.triggerEffect(effectId); };
        } else if (isPending) {
            btnAddCart.innerHTML = 'â³ Äang chá» duyá»‡t';
            btnAddCart.className = 'btn-add-cart btn-pending';
            btnAddCart.onclick = null;
        } else if (isInCart) {
            btnAddCart.innerHTML = 'ðŸ›’ ÄÃ£ Trong Giá»';
            btnAddCart.className = 'btn-add-cart btn-in-cart';
            btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.openCart(); };
        } else {
            btnAddCart.innerHTML = 'ðŸ›’ ThÃªm VÃ o Giá» HÃ ng';
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
    }

    saveGlobalFlashSaleTime() {
        const val = document.getElementById('global-flash-sale-ends').value;
        localStorage.setItem('es_global_flash_sale_ends', val);
        this.showNotification('success', 'ðŸ’¾ ÄÃ£ cáº­p nháº­t thá»i gian Flash Sale dÃ¹ng chung!');
        this.renderEffects();
    }

    async testTryEffect(effectId) {
        this.showNotification('info', 'â³ Äang phÃ¡t lÃªn OBS (8s)...');
        try {
            const response = await fetch(this.API_URL + '/api/obs/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ effectId, duration: 8 }) // DÃ¹ng thá»­ 8s
            });
            const data = await response.json();
            if (data.success) {
                this.showNotification('success', 'âœ… ÄÃ£ kÃ­ch hoáº¡t dÃ¹ng thá»­!');
            } else {
                this.showNotification('error', 'âŒ Lá»—i: ' + (data.error || 'KhÃ´ng thá»ƒ test'));
            }
        } catch (error) {
            this.showNotification('error', 'âŒ Lá»—i káº¿t ná»‘i OBS');
        }
    }

    switchView(view) {
        this.currentView = view;
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

        // Xá»­ lÃ½ áº©n/hiá»‡n cÃ¡c layout chung
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
                document.getElementById('page-title').textContent = 'ðŸ‘¨â€ðŸ’¼ Admin Dashboard';
                this.loadAdminDashboard();
            } else if (view === 'store') {
                document.getElementById('page-title').textContent = 'ðŸ›’ Cá»­a HÃ ng';
                this.renderEffects();
            } else if (view === 'library') {
                document.getElementById('page-title').textContent = 'ðŸ“š ThÆ° Viá»‡n';
                this.loadOwnedEffects();
            } else if (view === 'gift-mapping') {
                document.getElementById('page-title').textContent = 'ðŸŽ Gift Mapping';
                this.initGiftMapping(); // Khá»Ÿi táº¡o Gift Mapping khi vÃ o view
            } else if (view === 'settings') {
                document.getElementById('page-title').textContent = 'âš™ï¸ CÃ i Äáº·t';
                this.loadSettings();
            } else if (view === 'gift-menu-designer') {
                document.getElementById('page-title').textContent = 'ðŸŽ¨ Gift Menu Designer';
                if (rightSidebar) rightSidebar.style.display = 'none';
            } else {
                document.getElementById('page-title').textContent = 'EffectStore';
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

    async uploadEffect() {
        const name = document.getElementById('upload-name').value;
        const category = document.getElementById('upload-category').value;
        const price = document.getElementById('upload-price').value;
        const originalPrice = document.getElementById('upload-original-price').value;
        const description = document.getElementById('upload-description').value;
        const icon = document.getElementById('upload-icon').value || 'ðŸŽ¬';
        const fileInput = document.getElementById('upload-file');
        const thumbInput = document.getElementById('upload-thumb'); // âœ… Láº¥y thumb input

        if (!name || !price || !fileInput.files[0]) {
            this.showNotification('warning', 'âš ï¸ Äiá»n Ä‘á»§ thÃ´ng tin!');
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        formData.append('category', category);
        formData.append('price', price);
        formData.append('originalPrice', originalPrice || '0');
        formData.append('description', description);
        formData.append('icon', icon);

        // âœ… ThÃªm thumb vÃ o formData náº¿u cÃ³
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
            this.showNotification('info', 'â³ Äang upload...');
            const response = await fetch(this.API_URL + '/api/effects', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification('success', 'âœ… Upload thÃ nh cÃ´ng!');
                document.getElementById('upload-name').value = '';
                document.getElementById('upload-price').value = '';
                document.getElementById('upload-original-price').value = '';
                if (document.getElementById('upload-flash-sale-price')) document.getElementById('upload-flash-sale-price').value = '';
                if (document.getElementById('upload-flash-sale-ends')) document.getElementById('upload-flash-sale-ends').value = '';
                document.getElementById('upload-description').value = '';
                document.getElementById('upload-icon').value = '';
                fileInput.value = '';
                if (thumbInput) thumbInput.value = ''; // âœ… Reset thumb input
                this.loadAdminDashboard();
                this.loadEffects();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showNotification('error', 'âŒ ' + error.message);
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
        } catch (e) { this.showNotification('error', 'Lá»—i táº£i dá»¯ liá»‡u: ' + e.message); }
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
            this.showNotification('info', 'â³ Äang cáº­p nháº­t...');
            const res = await fetch(`${this.API_URL}/api/effects/${id}/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', 'âœ… Cáº­p nháº­t thÃ nh cÃ´ng!');
                this.closeEditModal();
                this.loadAdminDashboard();
                this.loadEffects();
            } else {
                this.showNotification('error', 'Lá»—i: ' + (data.error || data.message));
            }
        } catch (e) { this.showNotification('error', 'Lá»—i: ' + e.message); }
    }

    closeEditModal() {
        document.getElementById('edit-effect-modal').classList.remove('show');
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

            // âœ… KIá»‚M TRA NULL TRÆ¯á»šC KHI SET
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
                    trendingSelect.innerHTML = '<option value="">-- Chá»n Effect --</option>' +
                        effectsData.effects.map(e => `<option value="${e._id}">${e.icon || 'ðŸŽ¬'} ${e.name}</option>`).join('');
                }

                // Render Trending list
                const trendingList = document.getElementById('admin-trending-list');
                if (trendingList) {
                    const trendingEffects = effectsData.effects.filter(e => e.isTrending);
                    if (trendingEffects.length === 0) {
                        trendingList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">ðŸ”¥ ChÆ°a cÃ³ hiá»‡u á»©ng xu hÆ°á»›ng</div>';
                    } else {
                        trendingList.innerHTML = trendingEffects.map(e => `
                                    <div class="effect-item-row" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239,68,68,0.1); border-radius: 12px; padding: 12px; display:flex; align-items:center; gap:12px;">
                                        <div style="font-size:24px;">${e.icon || 'ðŸŽ¬'}</div>
                                        <div style="flex:1; overflow:hidden;">
                                            <h4 style="font-size:13px; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.name}</h4>
                                            <div style="display:flex; align-items:center; gap:5px; margin-top:4px;">
                                                <span style="font-size:10px; color:var(--text-muted);">Máº¯t:</span>
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
                        container.innerHTML = '<div class="empty-state">ðŸ“¦ ChÆ°a cÃ³ effects nÃ o</div>';
                    } else {
                        container.innerHTML = effectsData.effects.map(effect => `
                                    <div class="effect-item-row">
                                        <div class="effect-info-row">
                                            ${effect.icon ? `<span>${effect.icon}</span>` : ''}
                                            <div>
                                                <h4 style="display:flex; align-items:center; gap:8px;">
                                                    ${effect.name}
                                                    ${effect.isTrending ? '<span style="font-size:12px;" title="Hiá»‡u á»©ng Hot">ðŸ”¥</span>' : ''}
                                                    ${effect.isFlashSale ? '<span style="font-size:12px;" title="Äang Flash Sale">âš¡</span>' : ''}
                                                </h4>
                                                <span>${this.getCategoryName(effect.category)} â€¢ ${this.formatPrice(effect.price)}</span>
                                            </div>
                                        </div>
                                        <div class="effect-actions">
                                            <button class="btn-sm-edit" onclick="app.prepareEditEffect('${effect._id}')">âš™ï¸ Sá»­a</button>
                                            <button class="btn-sm-timeline" onclick="openTimelineEditor('${effect._id}', '${effect.name}')">ðŸŽ¬ Timeline</button>
                                            <button class="btn-sm-delete" onclick="app.deleteEffect('${effect._id}')">XÃ³a</button>
                                        </div>
                                    </div>
                                `).join('');
                    }
                }
            }

            // Fetch pending payments
            const paymentsRes = await fetch(`${this.API_URL}/api/payment/admin/payments`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const paymentsData = await paymentsRes.json();
            console.log('Payments loaded:', paymentsData);

            if (paymentsData.success) {
                const container = document.getElementById('admin-payments-list');
                if (container) {
                    const pending = paymentsData.payments.filter(p => p.status === 'pending');
                    if (pending.length === 0) {
                        container.innerHTML = '<div class="empty-state">ðŸ’³ KhÃ´ng cÃ³ payment chá»</div>';
                    } else {
                        container.innerHTML = pending.map(p => `
                                    <div class="effect-item-row" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                            <div style="overflow:hidden;">
                                                <h4 style="font-size:12px; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">User: ${p.userId}</h4>
                                                <span style="font-size:10px; color:var(--text-muted);">${new Date(p.createdAt).toLocaleString('vi-VN')}</span>
                                            </div>
                                            <div style="color: #fbbf24; font-weight: 700; font-size: 13px;">${this.formatPrice(p.amount)}</div>
                                        </div>
                                        <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid rgba(255,255,255,0.05); padding-top:8px;">
                                            <span style="font-size:11px; color:#a78bfa;">${p.effectIds.length} hiá»‡u á»©ng</span>
                                            <div style="display:flex; gap:5px;">
                                                <button onclick="app.approvePayment('${p._id}')" style="background:rgba(16,185,129,0.1); color:#10b981; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Duyá»‡t</button>
                                                <button onclick="app.rejectPayment('${p._id}')" style="background:rgba(239,68,68,0.1); color:#ef4444; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Há»§y</button>
                                            </div>
                                        </div>
                                    </div>
                                `).join('');
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
                            reqContainer.innerHTML = '<div class="empty-state">ðŸŽ¨ KhÃ´ng cÃ³ yÃªu cáº§u thiáº¿t káº¿</div>';
                        } else {
                            reqContainer.innerHTML = reqData.requests.map(r => `
                                        <div class="effect-item-row">
                                            <div class="effect-info-row">
                                                <div>
                                                    <h4 style="margin-bottom:5px;">KhÃ¡ch hÃ ng: ${r.name}</h4>
                                                    <span style="font-size:12px;color:var(--text-muted);">ðŸ“ž Zalo/SÄT: ${r.phone}</span>
                                                    <div style="margin-top:6px; font-size:13px; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; color: #d1d5db;">
                                                        ${r.description}
                                                    </div>
                                                    <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
                                                        ðŸ•’ Gá»­i lÃºc: ${new Date(r.createdAt).toLocaleString('vi-VN')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="effect-actions">
                                                <button class="btn-sm-delete" onclick="app.deleteEffectRequest('${r._id}')">XÃ³a</button>
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
            // Load danh sÃ¡ch users
            this.loadAdminUsers();
        } catch (error) {
            console.error('Dashboard error:', error);
            this.showNotification('error', 'Lá»—i load dashboard: ' + error.message);
        }
    }
    async deleteEffectRequest(id) {
        if (!confirm('âš ï¸ Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a yÃªu cáº§u thiáº¿t káº¿ nÃ y?')) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/effect-requests/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', 'âœ… ÄÃ£ xÃ³a yÃªu cáº§u thÃ nh cÃ´ng!');
                this.loadAdminDashboard();
            } else {
                this.showNotification('error', 'Lá»—i: ' + data.error);
            }
        } catch (e) {
            this.showNotification('error', 'Lá»—i: ' + e.message);
        }
    }
    async deleteEffect(effectId) { if (!confirm('âš ï¸ XÃ³a effect?')) return; try { const res = await fetch(`${this.API_URL}/api/effects/${effectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}` } }); const data = await res.json(); if (data.success) { this.showNotification('success', 'âœ… ÄÃ£ xÃ³a'); this.loadAdminDashboard(); this.loadEffects(); } } catch (error) { this.showNotification('error', 'âŒ ' + error.message); } }
    async approvePayment(paymentId) { if (!confirm('âœ… Duyá»‡t payment?')) return; try { const res = await fetch(`${this.API_URL}/api/payment/admin/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` }, body: JSON.stringify({ paymentId }) }); const data = await res.json(); if (data.success) { this.showNotification('success', 'âœ… ÄÃ£ duyá»‡t!'); this.loadAdminDashboard(); } } catch (error) { this.showNotification('error', 'âŒ ' + error.message); } }
    async rejectPayment(paymentId) { if (!confirm('âŒ Tá»« chá»‘i payment nÃ y?')) return; const reason = 'KhÃ´ng xÃ¡c Ä‘á»‹nh'; try { const res = await fetch(`${this.API_URL}/api/payment/admin/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` }, body: JSON.stringify({ paymentId, reason }) }); const data = await res.json(); if (data.success) { this.showNotification('success', 'âœ… ÄÃ£ tá»« chá»‘i'); this.loadAdminDashboard(); } } catch (error) { this.showNotification('error', 'âŒ ' + error.message); } }

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
                this.showNotification('success', isTrending ? 'ðŸ”¥ ÄÃ£ thÃªm vÃ o xu hÆ°á»›ng' : 'âœ… ÄÃ£ gá»¡ khá»i xu hÆ°á»›ng');
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
                this.showNotification('success', 'ðŸ‘ ÄÃ£ cáº­p nháº­t máº¯t xem');
                this.loadTrending();
            }
        } catch (e) { this.showNotification('error', e.message); }
    }

    async loadAdminUsers() {
        const container = document.getElementById('admin-users-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><br>Äang táº£i...</div>';
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

                        const planBadge = (sub, isAdmin) => {
                if (isAdmin || sub === 'admin') return '<span style="padding:2px 10px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-size:11px;font-weight:700;">ðŸ‘‘ Admin</span>';
                const map = {
                    studio: '<span style="padding:2px 10px;border-radius:12px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-size:11px;font-weight:700;">ðŸ’Ž Studio</span>',
                    business: '<span style="padding:2px 10px;border-radius:12px;background:rgba(236,72,153,0.15);color:#ec4899;border:1px solid rgba(236,72,153,0.3);font-size:11px;font-weight:700;">â­ Pro</span>',
                    pro: '<span style="padding:2px 10px;border-radius:12px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);font-size:11px;font-weight:700;">âš¡ Basic</span>',
                    free: '<span style="padding:2px 10px;border-radius:12px;background:rgba(107,114,128,0.12);color:#9ca3af;border:1px solid rgba(107,114,128,0.2);font-size:11px;font-weight:700;">ðŸ†“ Miá»…n phÃ­</span>'
                };
                return map[sub] || map.free;
            };

            const formatTimeAgo = (date) => {
                if (!date) return 'ChÆ°a rÃµ';
                const now = new Date();
                const past = new Date(date);
                const diffMs = now - past;
                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);
                const diffDay = Math.floor(diffHour / 24);

                if (diffSec < 60) return 'Vá»«a xong';
                if (diffMin < 60) return `${diffMin} phÃºt trÆ°á»›c`;
                if (diffHour < 24) return `${diffHour} giá» trÆ°á»›c`;
                if (diffDay < 30) return `${diffDay} ngÃ y trÆ°á»›c`;
                return past.toLocaleDateString('vi-VN');
            };

            container.innerHTML = `
                        <div style="overflow-x:auto;">
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead>
                                    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">NgÆ°á»i dÃ¹ng</th>
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">GÃ³i</th>
                                        <th style="padding:12px 16px;text-align:left;color:#6b7280;font-weight:600;">Hoáº¡t Ä‘á»™ng</th>
                                        <th style="padding:12px 16px;text-align:center;color:#6b7280;font-weight:600;">Gia háº¡n nhanh</th>
                                        <th style="padding:12px 16px;text-align:center;color:#6b7280;font-weight:600;">XÃ³a</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.users.map(u => `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
                                            <td style="padding:12px 16px;">
                                                <div style="display:flex;align-items:center;gap:10px;">
                                                    <div style="width:36px;height:36px;border-radius:50%;background:${u.isAdmin || u.subscription === 'admin' ? 'linear-gradient(135deg,#ef4444,#ff6b6b)' : (u.subscription === 'studio' ? 'linear-gradient(135deg,#10b981,#34d399)' : (u.subscription === 'business' ? 'linear-gradient(135deg,#ec4899,#f472b6)' : (u.subscription === 'pro' ? 'linear-gradient(135deg,#f59e0b,#fbbf24)' : 'linear-gradient(135deg,#374151,#4b5563)')))};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:${u.subscription === 'pro' && !u.isAdmin ? '#000' : '#fff'};flex-shrink:0;">
                                                        ${(u.name || u.email || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style="font-weight:600;color:#fff;">${u.name || '(chÆ°a Ä‘áº·t tÃªn)'}</div>
                                                        <div style="font-size:11px;color:#6b7280;">${u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="padding:12px 16px;">${planBadge(u.subscription, u.isAdmin)}</td>
                                            <td style="padding:12px 16px;">
                                                <div style="color:${(new Date() - new Date(u.lastActive)) > 86400000 * 7 ? '#ef4444' : '#6b7280'}; font-size:12px;">
                                                    ${formatTimeAgo(u.lastActive)}
                                                </div>
                                                <div style="font-size:10px;color:#4b5563;">NgÃ y Ä‘k: ${new Date(u.createdAt).toLocaleDateString('vi-VN')}</div>
                                            </td>
                                            <td style="padding:12px 16px;text-align:center;">
                                                 ${u.isAdmin ? '<span style="color:#6b7280;font-size:12px;">â€”</span>' : `
                                                 <div style="display:flex;gap:6px;justify-content:center;align-items:center;">
                                                     <button onclick="app.upgradeSubscription('${u._id}','pro',30)" style="padding:5px 10px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;color:#f59e0b;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Set Basic 30 ngÃ y</button>
                                                     <button onclick="app.upgradeSubscription('${u._id}','business',30)" style="padding:5px 10px;background:rgba(236,72,153,0.1);border:1px solid rgba(236,72,153,0.3);border-radius:6px;color:#ec4899;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Set Pro 30 ngÃ y</button>
                                                     <button onclick="app.upgradeSubscription('${u._id}','studio',3650)" style="padding:5px 10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10b981;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Set Studio</button>
                                                     ${u.subscription && u.subscription !== 'free' ? `<button onclick="app.upgradeSubscription('${u._id}','${u.subscription}',30,true)" style="padding:5px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:6px;color:#3b82f6;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">Gia háº¡n 30 ngÃ y</button>` : ''}
                                                     <button onclick="app.upgradeSubscription('${u._id}','free',0)" style="padding:5px 10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#ef4444;cursor:pointer;font-size:11px;font-weight:600;">Háº¡ Free</button>
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
                            Tá»•ng: <strong style="color:#fff;">${data.users.length}</strong> ngÆ°á»i dÃ¹ng
                        </div>
                    `;
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">âŒ Lá»—i táº£i danh sÃ¡ch: ${err.message}</div>`;
        }
    }

        async upgradeSubscription(userId, plan, durationDays, extend = false) {
        const planLabel = { pro: 'Basic', business: 'Pro', studio: 'Studio', free: 'Miá»…n phÃ­' }[plan] || plan;
        const msg = plan === 'free'
            ? `Háº¡ tÃ i khoáº£n vá» Free?`
            : (extend ? `Gia háº¡n thÃªm gÃ³i ${planLabel} thÃªm ${durationDays} ngÃ y?` : `Äáº·t gÃ³i ${planLabel} trong ${durationDays} ngÃ y?`);
        if (!confirm(msg)) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users/${userId}/subscription`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ plan, durationDays, extend })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', extend ? `âœ… ÄÃ£ gia háº¡n thÃ nh cÃ´ng!` : `âœ… ÄÃ£ Ä‘áº·t gÃ³i ${planLabel}!`);
                this.loadAdminUsers();
            } else {
                this.showNotification('error', 'âŒ Lá»—i: ' + data.error);
            }
        } catch (e) {
            this.showNotification('error', 'âŒ Lá»—i káº¿t ná»‘i: ' + e.message);
        }
    }
    async deleteUser(userId, email) {
        if (!confirm(`âš ï¸ Cáº¢NH BÃO: Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n XÃ“A tÃ i khoáº£n ${email}?\nHÃ nh Ä‘á»™ng nÃ y khÃ´ng thá»ƒ hoÃ n tÃ¡c!`)) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', 'ðŸ—‘ï¸ ÄÃ£ xÃ³a ngÆ°á»i dÃ¹ng');
                this.loadAdminDashboard();
            } else {
                this.showNotification('error', 'Lá»—i: ' + data.error);
            }
        } catch (error) { this.showNotification('error', 'âŒ ' + error.message); }
    }
    // ===== PRICING MODAL FUNCTIONS =====
    showUpgradePopup(feature = 'general', message = '', recommendedPlan = null) {
        const now = Date.now();
        if (this._lastUpgradePopupAt && now - this._lastUpgradePopupAt < 1200) return;
        this._lastUpgradePopupAt = now;
        const featureCopy = {
            mappings: '30 hiá»‡u á»©ng gáº¯n quÃ ',
            layouts: '10 thiáº¿t káº¿ menu Ä‘Ã£ lÆ°u',
            menuAssets: 'Táº£i áº£nh/video riÃªng vÃ o menu',
            templates: 'Nhiá»u máº«u menu chuyÃªn nghiá»‡p',
            menuAdvanced: 'Hiá»‡u á»©ng Ä‘á»™ng Ä‘áº¹p máº¯t',
            comments: 'KhÃ´ng giá»›i háº¡n bÃ¬nh luáº­n',
            tts: 'KhÃ´ng giá»›i háº¡n Ä‘á»c tÃªn/TTS',
            goalTrackers: '10 báº£ng má»¥c tiÃªu livestream',
            devices: 'Sá»­ dá»¥ng gÃ³i phÃ¹ há»£p trÃªn nhiá»u thiáº¿t bá»‹',
            customEffects: 'ThÃªm nhiá»u hiá»‡u á»©ng cÃ¡ nhÃ¢n cho Gift Mapping'
        };
        const primaryBenefit = featureCopy[feature] || 'Menu quÃ  táº·ng chuyÃªn nghiá»‡p';
        const currentPlan = String(this.currentUser?.subscription || 'free').toLowerCase();
        const targetPlan = recommendedPlan || (currentPlan === 'free' ? 'pro' : (currentPlan === 'pro' ? 'business' : 'studio'));
        const targetLabel = targetPlan === 'pro' ? 'Basic' : (targetPlan === 'business' ? 'Pro' : 'Studio');
        const isBasicOffer = targetPlan === 'pro';
        this.showModal('ðŸš€ Báº¡n Ä‘Ã£ Ä‘áº¡t giá»›i háº¡n gÃ³i hiá»‡n táº¡i', `
            <div style="color:#cbd5e1;font-size:14px;line-height:1.6;">
                ${message ? `<div style="padding:10px 12px;margin-bottom:14px;border-radius:10px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22);color:#fbbf24;">${this.escapeHtml ? this.escapeHtml(message) : message}</div>` : ''}
                <div style="color:#fff;font-weight:800;margin-bottom:10px;">NÃ¢ng cáº¥p ${targetLabel} Ä‘á»ƒ má»Ÿ khÃ³a:</div>
                <div style="display:grid;gap:8px;margin-bottom:18px;">
                    <div>âœ“ ${primaryBenefit}</div>
                    ${isBasicOffer ? '<div>âœ“ 30 hiá»‡u á»©ng gáº¯n quÃ </div><div>âœ“ Menu quÃ  táº·ng chuyÃªn nghiá»‡p</div><div>âœ“ KhÃ´ng giá»›i háº¡n bÃ¬nh luáº­n</div><div>âœ“ KhÃ´ng giá»›i háº¡n Ä‘á»c tÃªn/TTS</div><div>âœ“ Táº£i áº£nh/video riÃªng vÃ o menu</div>' : '<div>âœ“ KhÃ´ng giá»›i háº¡n hiá»‡u á»©ng vÃ  layout</div><div>âœ“ Hiá»‡u á»©ng chuyá»ƒn Ä‘á»™ng cao cáº¥p</div><div>âœ“ TÃ¹y chá»‰nh lá»›p nÃ¢ng cao</div><div>âœ“ Tá»± Ä‘á»™ng hÃ³a livestream nÃ¢ng cao</div><div>âœ“ Há»— trá»£ Æ°u tiÃªn</div>'}
                </div>
                <button onclick="app.closeModal();app.showPricing();" style="width:100%;padding:13px;border:0;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(249,115,22,.28);">NÃ‚NG Cáº¤P NGAY</button>
            </div>
        `);
    }

    handlePlanLimit(data, fallbackFeature = 'general') {
        if (!data || data.upgradeRequired !== true) return false;
        this.showUpgradePopup(data.feature || fallbackFeature, data.message || 'TÃ­nh nÄƒng nÃ y cáº§n gÃ³i cao hÆ¡n.', data.recommendedPlan);
        return true;
    }

    showPricing() {
        console.log('ðŸ’Ž Opening Pricing Modal...');
        const modal = document.getElementById('pricing-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('show');

        const u = this.currentUser;
        const isAdmin = u && (u.isAdmin || u.hasAdminUI);
        const currentPlan = (u && u.subscription) ? u.subscription.toLowerCase() : 'free';

        // Reset buttons
        const btnFree = document.getElementById('plan-btn-free');
        const btnPro = document.getElementById('plan-btn-pro');
        const btnBusiness = document.getElementById('plan-btn-business');
        const btnStudio = document.getElementById('plan-btn-studio');
        const rank = { free: 0, pro: 1, business: 2, studio: 3, admin: 4 };
        const currentRank = isAdmin ? 4 : (rank[currentPlan] ?? 0);

        if (isAdmin) {
            if (btnFree) { btnFree.innerText = 'ÄÃ£ sá»Ÿ há»¯u'; btnFree.classList.add('disabled'); }
            if (btnPro) { btnPro.innerText = 'ÄÃ£ sá»Ÿ há»¯u'; btnPro.classList.add('disabled'); btnPro.onclick = null; }
            if (btnBusiness) { btnBusiness.innerText = 'ÄÃ£ sá»Ÿ há»¯u'; btnBusiness.classList.add('disabled'); btnBusiness.onclick = null; }
            if (btnStudio) { btnStudio.innerText = 'ÄÃ£ sá»Ÿ há»¯u'; btnStudio.classList.add('disabled'); btnStudio.onclick = null; }
        } else {
            if (btnFree) {
                btnFree.innerText = currentPlan === 'free' ? 'GÃ³i hiá»‡n táº¡i' : 'GÃ³i miá»…n phÃ­';
                btnFree.className = currentPlan === 'free' ? 'plan-btn disabled' : 'plan-btn';
            }
            if (btnPro) {
                btnPro.innerText = currentPlan === 'pro' ? 'GÃ³i hiá»‡n táº¡i' : (currentRank > 1 ? 'ÄÃ£ bao gá»“m' : 'ðŸš€ NÃ‚NG Cáº¤P BASIC');
                btnPro.className = currentRank >= 1 ? 'plan-btn disabled' : 'plan-btn active';
                btnPro.onclick = currentRank >= 1 ? null : () => this.buySubscription('pro');
            }
            if (btnBusiness) {
                btnBusiness.innerText = currentPlan === 'business' ? 'GÃ³i hiá»‡n táº¡i' : (currentRank > 2 ? 'ÄÃ£ bao gá»“m' : 'ðŸ’Ž NÃ‚NG Cáº¤P PRO');
                btnBusiness.className = currentRank >= 2 ? 'plan-btn disabled' : 'plan-btn';
                btnBusiness.onclick = currentRank >= 2 ? null : () => this.buySubscription('business');
            }
            if (btnStudio && currentPlan === 'studio') {
                btnStudio.innerText = 'GÃ³i hiá»‡n táº¡i';
                btnStudio.classList.add('disabled');
                btnStudio.onclick = null;
            }
        }

        console.log('âœ… Pricing Modal updated for', isAdmin ? 'Admin' : currentPlan);
    }

    closePricing() {
        const modal = document.getElementById('pricing-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hidden');
        }
    }

    async buySubscription(plan) {
        const price = plan === 'pro' ? 199000 : 399000;
        const subCode = plan === 'pro' ? 'SUBSCRIPTION_PRO' : 'SUBSCRIPTION_BUSINESS';
        const planName = plan === 'pro' ? 'Basic' : 'Pro';

        // CRITICAL FIX: Set pendingEffects so confirmPaymentWithProof sends the correct code
        this.pendingEffects = [{ effectId: subCode, effectName: `GÃ³i ${planName}` }];

        this.closePricing();

        try {
            this.showNotification('info', 'â³ Äang táº¡o mÃ£ QR thanh toÃ¡n...');
            const response = await fetch(`${this.API_URL}/api/payment/create-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: price,
                    effectIds: [subCode],
                    userId: this.machineId,
                    userName: this.currentUser ? this.currentUser.name : 'Khach'
                })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Failed to create QR');

            const orderId = data.orderId || `SUB${Date.now()}`;
            const bank = data.bankInfo || {};
            const formattedPrice = this.formatPrice(price);

            this.showModal(`Thanh toÃ¡n nÃ¢ng cáº¥p ${planName}`, `
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
                                    <p style="margin-top: 15px; font-size: 12px; color: var(--text-secondary);">QuÃ©t mÃ£ báº±ng á»©ng dá»¥ng NgÃ¢n hÃ ng hoáº·c VÃ­ Ä‘iá»‡n tá»­ Ä‘á»ƒ thanh toÃ¡n nhanh.</p>
                                </div>

                                <!-- Right side: Info -->
                                <div style="flex: 1.2;">
                                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px;">
                                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;">GÃ³i dá»‹ch vá»¥</div>
                                            <div style="font-size: 18px; font-weight: 800; color: var(--primary);">${planName} (1 ThÃ¡ng)</div>
                                        </div>

                                        <div style="display: flex; flex-direction: column; gap: 15px;">
                                            <div>
                                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Sá»‘ tiá»n thanh toÃ¡n</div>
                                                <div style="font-size: 22px; font-weight: 900; color: #fbbf24;">${formattedPrice}</div>
                                            </div>

                                            <div>
                                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Ná»™i dung chuyá»ƒn khoáº£n</div>
                                                <div style="display: flex; gap: 8px;">
                                                    <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 8px 12px; border-radius: 8px; color: #10b981; font-weight: 700; font-family: monospace; font-size: 14px;">${bank.description || data.orderId}</div>
                                                    <button onclick="navigator.clipboard.writeText('${bank.description || data.orderId}'); app.showNotification('info', 'ðŸ“‹ ÄÃ£ sao chÃ©p ná»™i dung')" style="padding: 0 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; cursor: pointer;"><i class="fas fa-copy"></i></button>
                                                </div>
                                            </div>

                                            <div style="font-size: 11px; color: rgba(239, 68, 68, 0.8); background: rgba(239, 68, 68, 0.05); padding: 10px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.1);">
                                                âš ï¸ LÆ°u Ã½: Chuyá»ƒn Ä‘Ãºng ná»™i dung Ä‘á»ƒ há»‡ thá»‘ng tá»± Ä‘á»™ng kÃ­ch hoáº¡t gÃ³i ngay láº­p tá»©c.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 15px;">
                                <div style="display: flex; gap: 15px; align-items: center; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="flex: 1;">
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Minh chá»©ng thanh toÃ¡n (Duyá»‡t nhanh hÆ¡n)</div>
                                        <div id="payment-proof-name" style="font-size: 11px; color: var(--primary);">ChÆ°a chá»n áº£nh...</div>
                                    </div>
                                    <input type="file" id="payment-proof-input" accept="image/*" style="display:none;" onchange="app.previewPaymentProof(this)">
                                    <button onclick="document.getElementById('payment-proof-input').click()" style="padding: 10px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;">Chá»n áº£nh</button>
                                </div>

                                <div id="payment-status-indicator" style="text-align: center; color: var(--secondary); font-size: 12px; font-weight: 600; padding: 10px; background: rgba(236, 72, 153, 0.05); border-radius: 10px;">
                                    <i class="fas fa-spinner fa-spin"></i> Äang káº¿t ná»‘i vá»›i cá»•ng thanh toÃ¡n...
                                </div>

                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${price})" style="width: 100%; padding: 18px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none; border-radius: 16px; color: #fff; font-weight: 800; font-size: 16px; cursor: pointer; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.3); transition: 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.filter='brightness(1.1)';" onmouseout="this.style.transform=''; this.style.filter='';">
                                    XÃC NHáº¬N ÄÃƒ CHUYá»‚N KHOáº¢N
                                </button>
                            </div>
                        </div>
                    `);

            this.startPaymentPolling(orderId, [subCode], price);

        } catch (error) {
            console.error('Buy Subscription error:', error);
            this.showNotification('error', 'âŒ Lá»—i: ' + error.message);
        }
    }

    // ===== GIFT MAPPING FUNCTIONS =====
    initGiftMapping() {
        this.connectWebSocket();
        this.loadGifts();
        this.loadEffectsForMapping();
        this.loadMappings();
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(this.WS_URL);
        this.ws.onopen = () => console.log('âœ… WebSocket connected');
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
            case 'effect_warning':
                this.showNotification('warning', data.data?.message || 'Hiệu ứng đã bị bỏ qua vì thiếu thời lượng.');
                break;
            case 'plan_limit_reached': this.handlePlanLimit(data.data, data.data?.feature); break;
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
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;"></span>Äang live';
                statusEl.style.background = 'rgba(16,185,129,0.2)';
            } else {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;display:inline-block;"></span>ChÆ°a káº¿t ná»‘i';
                statusEl.style.background = 'rgba(239,68,68,0.2)';
            }
        }
    }
    async prepareTikTok() {
        const roomId = document.getElementById('room-id')?.value.trim();
        if (!roomId) return this.showNotification('error', 'Vui lÃ²ng nháº­p Room ID!');
        try {
            this.showNotification('info', 'ðŸŽ¬ Äang á»Ÿ cháº¿ Ä‘á»™ chuáº©n bá»‹. Há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng káº¿t ná»‘i khi báº¡n báº¯t Ä‘áº§u Live.');
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
        } catch (e) { this.showNotification('error', 'Lá»—i: ' + e.message); }
    }

    async connectTikTok() {
        const roomId = document.getElementById('room-id')?.value.trim();
        if (!roomId) return this.showNotification('error', 'Vui lÃ²ng nháº­p Room ID!');
        try {
            this.showNotification('info', 'Äang káº¿t ná»‘i...');
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
                this.showNotification('success', 'âœ… ÄÃ£ káº¿t ná»‘i TikTok Live!');
                this.setConnectBtnState('connect');
                this.connectWebSocket();
            }
        } catch (e) {
            this.showNotification('error', 'KhÃ´ng thá»ƒ káº¿t ná»‘i. CÃ³ thá»ƒ báº¡n chÆ°a Live hoáº·c sai ID.');
        }
    }

    async disconnectTikTok() {
        try {
            await fetch(`${this.API_URL}/api/tiktok/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            this.showNotification('success', 'âœ… ÄÃ£ ngáº¯t káº¿t ná»‘i!');
            this.setConnectBtnState('disconnect');
            this.updateStats({ isLive: false, gifts: 0, likes: 0, chats: 0, viewers: 0 });
            if (this.ws) this.ws.close();
        } catch (e) { this.showNotification('error', 'Lá»—i: ' + e.message); }
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
            console.log('ðŸŽ Loading gifts...');
            const res = await fetch(`${this.API_URL}/api/tiktok/gifts-library`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            console.log('Gifts data:', data);

            const grid = document.getElementById('gifts-grid');
            console.log('Gifts grid element:', grid);

            if (data.success && grid) {
                if (data.gifts && data.gifts.length > 0) {
                    grid.innerHTML = data.gifts.map(g => {
                        const isImage = g.icon && (g.icon.includes('/') || g.icon.includes('.'));
                        const iconHtml = isImage
                            ? `<img src="${this.API_URL}${g.icon}" style="width:40px;height:40px;object-fit:contain;margin-bottom:5px;display:block;margin:0 auto;">`
                            : `<div style="font-size:32px;margin-bottom:5px;">${g.icon || 'ðŸŽ'}</div>`;
                        return `
                                    <div class="gift-item" onclick="app.selectGift('${g.id}','${g.name}','${g.icon}')">
                                        ${iconHtml}
                                        <div class="gift-name">${g.name}</div>
                                        <div class="gift-coins">${g.coins} coins</div>
                                    </div>
                                `;
                    }).join('');
                    console.log('âœ… Rendered', data.gifts.length, 'gifts');
                } else {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">KhÃ´ng cÃ³ gifts</div>';
                }
            } else {
                console.error('âŒ No gifts data or grid element not found');
            }
        } catch (e) {
            console.error('âŒ Load gifts error:', e);
        }
    }
    async loadEffectsForMapping() {
        try {
            console.log('🎬 Loading mapping effects...');
            const grid = document.getElementById('effects-mapping-grid');
            if (!grid) return;

            const res = await fetch(`${this.API_URL}/api/tiktok/available-effects`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                throw new Error(data.message || data.error || `Lỗi tải thư viện effect ${res.status}`);
            }

            const displayEffects = Array.isArray(data.effects) ? data.effects : [];
            const customEffects = displayEffects.filter(effect => effect?.isCustom);
            const purchasedEffects = displayEffects.filter(effect => !effect?.isCustom);

            this.personalEffects = customEffects;
            if (this.currentUser?.isAdmin) {
                this.effects = purchasedEffects;
            } else {
                this.ownedEffects = [...purchasedEffects, ...customEffects];
            }

            if (displayEffects && displayEffects.length > 0) {
                grid.innerHTML = displayEffects.map(e => {
                    const effectId = e._id || e.id;
                    const thumbUrl = e.thumbUrl ? (/^https?:\/\//i.test(e.thumbUrl) ? e.thumbUrl : `${this.API_URL}${e.thumbUrl}`) : '';
                    const videoUrl = e.previewUrl ? (/^https?:\/\//i.test(e.previewUrl) ? e.previewUrl : `${this.API_URL}${e.previewUrl}`) : '';
                    let previewHTML = '';

                    if (thumbUrl && videoUrl) {
                        previewHTML = `
                        <img src="${thumbUrl}" class="mapping-thumb-img">
                        <video src="${videoUrl}" class="mapping-video" muted loop playsinline></video>
                    `;
                    } else if (videoUrl) {
                        previewHTML = `<video src="${videoUrl}" class="mapping-video" style="opacity:1;" muted loop playsinline></video>`;
                    } else {
                        previewHTML = `<span style="font-size:32px;">🎬</span>`;
                    }

                    return `
                <div class="effect-mapping-item" data-effect-id="${effectId}" data-effect-name="${e.name || ''}" style="${e.isCustom ? 'border-color:rgba(34,197,94,.35);' : ''}">
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
                            const effectId = item.getAttribute('data-effect-id');
                            const effectName = item.getAttribute('data-effect-name') || item.querySelector('.effect-mapping-name').textContent.trim();
                            this.selectEffect(effectId, effectName);

                            effectItems.forEach(i => i.style.border = '1px solid rgba(255,255,255,0.1)');
                            item.style.border = '1px solid var(--primary)';
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
        event.currentTarget.classList.add('selected');

        if (this.selectedEffect) {
            this.showNotification('info', 'âŒ¨ï¸ Nháº¥n ENTER Ä‘á»ƒ xÃ¡c nháº­n Mapping');
        }
    }

    selectEffect(id, name) {
        this.selectedEffect = { id, name };
        document.querySelectorAll('.effect-mapping-item').forEach(el => el.classList.remove('selected'));
        event.currentTarget.classList.add('selected');

        if (this.selectedGift) {
            this.showNotification('info', 'âŒ¨ï¸ Nháº¥n ENTER Ä‘á»ƒ xÃ¡c nháº­n Mapping');
        }
    }

    async createMapping() {
        if (!this.selectedGift || !this.selectedEffect) return;
        try {
            const res = await fetch(`${this.API_URL}/api/tiktok/map-gift`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    giftId: this.selectedGift.id, giftName: this.selectedGift.name, giftIcon: this.selectedGift.icon,
                    effectId: this.selectedEffect.id, effectName: this.selectedEffect.name
                })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', `âœ… Mapping: ${this.selectedGift.name} â†’ ${this.selectedEffect.name}`);
                this.selectedGift = null; this.selectedEffect = null;
                document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                this.loadMappings();
            } else if (!this.handlePlanLimit(data, 'mappings')) {
                this.showNotification('error', data.message || data.error || 'KhÃ´ng thá»ƒ táº¡o hiá»‡u á»©ng gáº¯n quÃ ');
            }
        } catch (e) { this.showNotification('error', 'Lá»—i: ' + e.message); }
    }

    async loadMappings() {
        try {
            console.log('ðŸ“‹ Loading mappings...');
            const res = await fetch(`${this.API_URL}/api/tiktok/mappings`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();
            console.log('Mappings data:', data);

            const list = document.getElementById('mappings-list');
            console.log('Mappings list element:', list);

            if (data.success && list) {
                this.giftMappings = data.mappings || [];
                if (data.mappings && data.mappings.length > 0) {
                    list.innerHTML = data.mappings.map(m => {
                        const giftIconUrl = m.giftIcon && (m.giftIcon.startsWith('http') || m.giftIcon.startsWith('data:'))
                            ? m.giftIcon
                            : `${this.API_URL}${m.giftIcon}`;

                        // Kiá»ƒm tra xem cÃ³ pháº£i lÃ  áº£nh khÃ´ng (dá»±a vÃ o Ä‘uÃ´i file hoáº·c báº¯t Ä‘áº§u báº±ng http)
                        const isImageIcon = m.giftIcon && (
                            m.giftIcon.includes('.') ||
                            m.giftIcon.includes('/') ||
                            m.giftIcon.startsWith('http') ||
                            m.giftIcon.length > 10 // Chuá»—i dÃ i thÆ°á»ng lÃ  URL
                        );

                        const giftIconHtml = isImageIcon
                            ? `<img src="${giftIconUrl}" style="width:32px;height:32px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,0.05);padding:2px;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/679/679821.png'">`
                            : `<span style="font-size:24px;">${m.giftIcon || 'ðŸŽ'}</span>`;

                        return `
                                <div class="mapping-list-item">
                                    <div class="mapping-info">
                                        <div class="mapping-badge">
                                            ${giftIconHtml}
                                            <span style="font-size:14px;font-weight:600;">${m.giftName}</span>
                                        </div>
                                        <span style="color:var(--text-muted);font-size:16px;">â–¶</span>
                                        <div class="mapping-badge" style="background:rgba(240,147,251,0.1);border-color:rgba(240,147,251,0.2);">
                                            <span style="font-size:14px;font-weight:600;color:#f093fb;">${m.effectName || 'Unknown'}</span>
                                        </div>
                                    </div>
                                    <div class="mapping-actions">
                                        <button class="btn-sm btn-test" onclick="app.testMapping(event, '${m._id}')">â–¶ Test</button>
                                        <button class="btn-sm btn-delete" onclick="app.deleteMapping('${m._id}')">ðŸ—‘ï¸ XÃ³a</button>
                                    </div>
                                </div>
                            `}).join('');
                    console.log('âœ… Rendered', data.mappings.length, 'mappings');
                } else {
                    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">ChÆ°a cÃ³ mapping nÃ o. Chá»n gift vÃ  effect Ä‘á»ƒ táº¡o mapping!</p>';
                }
            } else {
                console.error('âŒ No mappings data or list element not found');
            }
        } catch (e) {
            console.error('âŒ Load mappings error:', e);
        }
    }

    async testMapping(event, id) {
        const btn = event.currentTarget;
        if (btn.disabled) return;

        const originalContent = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.position = 'relative';
            btn.style.overflow = 'hidden';
            btn.style.transition = 'none';
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            const token = localStorage.getItem('token');
            const res = await fetch(`${this.API_URL}/api/tiktok/test-trigger`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ mappingId: id })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                throw new Error(data.message || data.error || `Lỗi server ${res.status}`);
            }

            this.showNotification('success', '🎬 Đã chạy thử hiệu ứng trên OBS!');

            const resolvedDuration = Number(data.duration);
            if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
                throw new Error('Server không trả về thời lượng hiệu ứng hợp lệ.');
            }
            const totalDuration = Math.max(resolvedDuration * 1000, 1000);
            let timeLeft = totalDuration;
            const step = 50;
            btn.innerHTML = `<i class="fas fa-hourglass-half"></i> ${(timeLeft / 1000).toFixed(1)}s`;
            btn.style.background = `linear-gradient(90deg, #10b981 100%, rgba(0,0,0,0.3) 100%)`;

            const interval = setInterval(() => {
                timeLeft -= step;
                const percent = Math.max(0, (timeLeft / totalDuration) * 100);
                const seconds = Math.max(0, (timeLeft / 1000)).toFixed(1);

                btn.innerHTML = `<i class="fas fa-hourglass-half"></i> ${seconds}s`;
                btn.style.background = `linear-gradient(90deg, #10b981 ${percent}%, rgba(0,0,0,0.3) ${percent}%)`;

                if (timeLeft <= 0) {
                    clearInterval(interval);
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                    btn.style.background = '';
                    btn.style.cursor = 'pointer';
                    btn.style.transition = '0.3s';
                    this.loadLogs?.();
                }
            }, step);
        } catch (e) {
            this.showNotification('error', 'Lỗi test OBS: ' + e.message);
            btn.disabled = false;
            btn.innerHTML = originalContent;
            btn.style.background = '';
            btn.style.cursor = 'pointer';
        }
    }
    async deleteMapping(id) {
        if (!confirm('XÃ³a mapping nÃ y?')) return;
        try {
            await fetch(`${this.API_URL}/api/tiktok/mappings/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            this.showNotification('success', 'ÄÃ£ xÃ³a mapping');
            this.loadMappings();
        } catch (e) { this.showNotification('error', 'Lá»—i: ' + e.message); }
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(this.WS_URL);
        this.ws.onopen = () => console.log('âœ… WebSocket connected');
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
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;"></span>Äang live';
                statusEl.style.background = 'rgba(16,185,129,0.2)';
            } else {
                statusEl.innerHTML = '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;display:inline-block;"></span>ChÆ°a káº¿t ná»‘i';
                statusEl.style.background = 'rgba(239,68,68,0.2)';
            }
        }
    }

    async handleGift(giftData) {
        console.log('ðŸŽ Gift received:', giftData);
        this.showNotification('info', `ðŸŽ ${giftData.userName} táº·ng ${giftData.giftName}!`);

        // PhÃ¡t giá»ng nÃ³i cáº£m Æ¡n (náº¿u báº­t) - Äá»£i 800ms sau tiáº¿ng Ping cho rÃµ rÃ ng
        if (this.isTTSGiftEnabled) {
            setTimeout(() => {
                const nickname = giftData.nickname || giftData.uniqueId || 'báº¡n';
                this.speakText(`Cáº£m Æ¡n ${nickname} Ä‘Ã£ táº·ng ${giftData.giftName}`);

                // Náº¿u Ä‘á»§ ngÆ°á»¡ng xu, Ä‘Æ°a vÃ o danh sÃ¡ch chá» Ä‘á»c comment
                if (giftData.diamondCount >= this.ttsThreshold) {
                    this.pendingDonors.set(giftData.userId, {
                        nickname: nickname,
                        timestamp: Date.now()
                    });
                    // XÃ³a sau 60 giÃ¢y náº¿u há» khÃ´ng comment
                    setTimeout(() => this.pendingDonors.delete(giftData.userId), 60000);
                }
            }, 800);
        }

        // OBS is triggered once by the backend queue for a real TikTok gift.
    }

    async handleFollow(data) {
        const nickname = data.nickname || data.uniqueId || 'báº¡n má»›i';
        this.showNotification('success', `ðŸ‘¤ ${nickname} vá»«a Follow!`);
        if (this.isTTSFollowEnabled) {
            this.speakText(`Cáº£m Æ¡n ${nickname} Ä‘Ã£ follow kÃªnh nhÃ©!`);
        }
    }

    async handleShare(data) {
        const nickname = data.nickname || data.uniqueId || 'báº¡n má»›i';
        this.showNotification('info', `ðŸ“¢ ${nickname} vá»«a Share!`);
        this.speakText(`Cáº£m Æ¡n ${nickname} Ä‘Ã£ chia sáº» livestream nhÃ©!`);
    }

    handleChat(data) {
        const donor = this.pendingDonors.get(data.userId);
        if (donor) {
            // Náº¿u lÃ  ngÆ°á»i vá»«a donate khá»§ng, Ä‘á»c comment cá»§a há»
            this.speakText(`${donor.nickname} nháº¯n lÃ : ${data.comment}`);
            this.pendingDonors.delete(data.userId); // Chá»‰ Ä‘á»c 1 láº§n duy nháº¥t
        }
    }

    // Redundant TikTok connection methods removed to prevent UI state conflicts.
    // These methods were previously defined above and are already handled.
    async loadLogs() {
        try {
            console.log('ðŸ“œ Loading logs...');
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
                                    <td>ðŸŽ ${log.giftName}</td>
                                    <td>ðŸŽ¬ ${log.effectName || 'Unknown'}</td>
                                    <td>${log.userName || 'N/A'}</td>
                                    <td style="color:#00ff88;">âœ…</td>
                                </tr>
                            `).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#666;">ChÆ°a cÃ³ log nÃ o</td></tr>';
                }
            }
        } catch (e) {
            console.error('Lá»—i load logs:', e);
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
            avatarEl.style.background = u.isAdmin
                ? 'linear-gradient(135deg,#ff6b35,#ff9a3c)'
                : (u.subscription === 'business' ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
                    : (u.subscription === 'pro' ? 'linear-gradient(135deg,#d4af37,#f4e4ba)'
                        : 'linear-gradient(135deg,#374151,#4b5563)'));
            avatarEl.style.color = (u.subscription === 'pro' && !u.isAdmin) ? '#000' : '#fff';
        }

        if (badgeEl) {
            const planInfo = {
                admin: { label: 'ðŸ‘‘ Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.3)' },
                business: { label: 'â­ Pro', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)' },
                pro: { label: 'âš¡ Basic', color: '#d4af37', bg: 'rgba(212,175,55,0.15)', border: 'rgba(212,175,55,0.3)' },
                free: { label: 'ðŸ†“ Free', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.2)' }
            };
            const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
            const plan = planInfo[planKey] || planInfo.free;
            badgeEl.innerHTML = `<span style="font-size:11px;padding:4px 12px;border-radius:12px;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</span>`;
        }

        if (expiryEl) {
            if (u.isAdmin) {
                expiryEl.textContent = 'VÄ©nh viá»…n';
            } else if (u.subscriptionExpiresAt) {
                const expiry = new Date(u.subscriptionExpiresAt);
                const now = new Date();
                const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
                expiryEl.textContent = diff > 0 ? `CÃ²n ${diff} ngÃ y (${expiry.toLocaleDateString('vi-VN')})` : 'ÄÃ£ háº¿t háº¡n';
            } else {
                expiryEl.textContent = 'KhÃ´ng kháº£ dá»¥ng';
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

        const startupEl = document.getElementById('settings-run-startup');
        if (startupEl) startupEl.checked = localStorage.getItem('run_startup') === 'true';

        // Load danh sÃ¡ch giá»ng Ä‘á»c
        this.loadVoices();

        // Populate the connection username input automatically if default exists
        const defaultUser = localStorage.getItem('tiktok_username');
        const liveUserInput = document.getElementById('room-id');
        if (defaultUser && liveUserInput && !liveUserInput.value) {
            liveUserInput.value = defaultUser;
        }
    }

    async saveOBSSettings() {
        const host = document.getElementById('settings-obs-host').value.trim();
        const port = document.getElementById('settings-obs-port').value.trim();
        const password = document.getElementById('settings-obs-password').value;

        if (!host || !port) return this.showNotification('error', 'Thiáº¿u thÃ´ng tin Host hoáº·c Port!');

        try {
            this.showNotification('info', 'â³ Äang lÆ°u cáº¥u hÃ¬nh OBS...');
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
            this.showNotification('error', 'Lá»—i lÆ°u cÃ i Ä‘áº·t: ' + e.message);
        }
    }

    saveTikTokSettings() {
        const user = document.getElementById('settings-tiktok-username').value.trim();
        const auto = document.getElementById('settings-tiktok-auto').checked;

        localStorage.setItem('tiktok_username', user);
        localStorage.setItem('tiktok_auto_reconnect', auto);

        const liveUserInput = document.getElementById('room-id');
        if (user && liveUserInput) liveUserInput.value = user;

        this.showNotification('success', 'âœ… LÆ°u cÃ i Ä‘áº·t TikTok Live thÃ nh cÃ´ng!');
    }

    savePreferences() {
        const soundEl = document.getElementById('settings-sound-alert') || document.getElementById('settings-sound-alert-quick');
        const ttsGiftEl = document.getElementById('settings-tts-gift');
        const ttsFollowEl = document.getElementById('settings-tts-follow');
        const ttsThresholdEl = document.getElementById('settings-tts-threshold');
        const startupEl = document.getElementById('settings-run-startup');

        const sound = soundEl ? soundEl.checked : (localStorage.getItem('sound_alert') !== 'false');
        const ttsGift = ttsGiftEl ? ttsGiftEl.checked : (localStorage.getItem('es_tts_gift_enabled') !== 'false');
        const ttsFollow = ttsFollowEl ? ttsFollowEl.checked : (localStorage.getItem('es_tts_follow_enabled') !== 'false');
        const ttsThreshold = ttsThresholdEl ? ttsThresholdEl.value : (localStorage.getItem('es_tts_threshold') || '10');
        const startup = startupEl ? startupEl.checked : (localStorage.getItem('run_startup') === 'true');

        localStorage.setItem('sound_alert', sound);
        localStorage.setItem('es_tts_gift_enabled', ttsGift);
        localStorage.setItem('es_tts_follow_enabled', ttsFollow);
        localStorage.setItem('es_tts_threshold', ttsThreshold);
        localStorage.setItem('run_startup', startup);

        this.isTTSGiftEnabled = ttsGift;
        this.isTTSFollowEnabled = ttsFollow;
        this.ttsThreshold = parseInt(ttsThreshold);

        this.showNotification('success', 'âœ… LÆ°u tÃ¹y chá»n thÃ nh cÃ´ng!');
    }

    clearAppData() {
        if (confirm('Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a toÃ n bá»™ dá»¯ liá»‡u táº¡m cá»§a á»©ng dá»¥ng? HÃ nh Ä‘á»™ng nÃ y khÃ´ng thá»ƒ hoÃ n tÃ¡c.')) {
            localStorage.clear();
            this.showNotification('success', 'ðŸ§¹ ÄÃ£ xÃ³a dá»¯ liá»‡u! á»¨ng dá»¥ng sáº½ táº£i láº¡i...');
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
    if (!app.currentUser) return;
    const u = app.currentUser;
    const planInfo = {
        admin: { label: 'ðŸ‘‘ Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.25)' },
        business: { label: 'â­ Pro', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
        pro: { label: 'âš¡ Basic', color: '#d4af37', bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.25)' },
        free: { label: 'ðŸ†“ Free', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.18)' }
    };
    const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
    const plan = planInfo[planKey] || planInfo.free;
    const avatarBg = u.isAdmin ? 'linear-gradient(135deg,#ff6b35,#ff9a3c)'
        : (u.subscription === 'business' ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
            : (u.subscription === 'pro' ? 'linear-gradient(135deg,#d4af37,#f4e4ba)'
                : 'linear-gradient(135deg,#374151,#4b5563)'));
    const avatarColor = (u.subscription === 'pro' && !u.isAdmin) ? '#000' : '#fff';

    app.showModal('TÃ i khoáº£n cá»§a tÃ´i', `
                <div style="text-align:center; padding: 12px 0;">
                    <div style="width:72px;height:72px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:${avatarColor};margin:0 auto 14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);">${(u.name || 'U')[0].toUpperCase()}</div>
                    <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${u.name || 'NgÆ°á»i dÃ¹ng'}</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${u.email}</div>
                    <div style="font-size:12px;padding:5px 16px;border-radius:20px;display:inline-block;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</div>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
                    <button onclick="app.logout()" style="width:100%;padding:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:#ef4444;font-weight:600;cursor:pointer;font-size:14px;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">ðŸšª ÄÄƒng xuáº¥t</button>
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


// ===== TIMELINE EDITOR FUNCTIONS (BÆ¯á»šC 1: FIX LOGIC THÃŠM KEYFRAME) =====

let currentTimelineEffectId = null;
let currentTimeline = []; // Máº£ng chá»©a danh sÃ¡ch keyframe Ä‘ang chá»‰nh sá»­a

// 1. HÃ m má»Ÿ Modal Timeline
function openTimelineEditor(effectId, effectName) {
    console.log('ðŸŽ¬ Opening Timeline Editor for:', effectId, effectName);
    currentTimelineEffectId = effectId;

    // Äáº·t tÃªn hiá»‡u á»©ng lÃªn tiÃªu Ä‘á» modal
    const nameEl = document.getElementById('tl-effect-name');
    if (nameEl) nameEl.textContent = effectName || 'Effect';

    // Má»Ÿ modal
    const modal = document.getElementById('timeline-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    // Reset form
    const timeInput = document.getElementById('kf-time');
    if (timeInput) timeInput.value = '0';

    // Táº£i danh sÃ¡ch OBS Sources
    if (typeof loadOBSSources === 'function') {
        loadOBSSources();
    }

    // Táº£i timeline cÅ© tá»« server (náº¿u cÃ³)
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
            renderKeyframes(); // Váº½ láº¡i giao diá»‡n
        })
        .catch(err => console.error('Load timeline error:', err));
}

// 2. HÃ m Ä‘Ã³ng Modal
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

// âœ… HÃ€M THÃŠM KEYFRAME Má»šI (ÄÃ£ cÃ³ X, Y, Scale, Layer)
function addKeyframe() {
    const time = parseFloat(document.getElementById('kf-time').value);
    const action = document.getElementById('kf-action').value;
    const source = document.getElementById('kf-source').value;

    // âœ… Láº¥y thÃªm X, Y, Scale, Layer
    const x = parseFloat(document.getElementById('kf-x').value) || 0;
    const y = parseFloat(document.getElementById('kf-y').value) || 0;
    const scale = parseFloat(document.getElementById('kf-scale').value) || 100;
    const layer = document.getElementById('kf-layer').value;

    // Validate
    if (!source || source === '-- Chá»n Source --') {
        return app.showNotification('warning', 'âš ï¸ Vui lÃ²ng chá»n Source!');
    }

    // ThÃªm vÃ o máº£ng timeline
    currentTimeline.push({
        time,
        action,
        source,
        layer,
        transform: { x, y, scale }
    });

    // Sáº¯p xáº¿p theo thá»i gian
    currentTimeline.sort((a, b) => a.time - b.time);

    // Váº½ láº¡i danh sÃ¡ch
    renderKeyframes();

    // Reset Ã´ thá»i gian
    document.getElementById('kf-time').value = '0';

    app.showNotification('success', `âœ… ÄÃ£ thÃªm keyframe táº¡i ${time}s`);
}

// âœ… HÃ€M Váº¼ Láº I DANH SÃCH KEYFRAME (Hiá»ƒn thá»‹ rÃµ thÃ´ng sá»‘)
function renderKeyframes() {
    const list = document.getElementById('keyframes-list');
    if (!list) return;
    list.innerHTML = '';

    if (currentTimeline.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">ðŸ“­ ChÆ°a cÃ³ keyframe nÃ o.</div>';
        return;
    }

    currentTimeline.forEach((kf, index) => {
        const item = document.createElement('div');
        item.className = 'keyframe-item';

        // Dá»‹ch action & layer sang tiáº¿ng Viá»‡t
        const actionMap = { move: 'ðŸ“ Di chuyá»ƒn', scale: 'ðŸ“ Scale', layer: 'ðŸ”² Äá»•i Lá»›p', show: 'ðŸ‘ï¸ Hiá»‡n', hide: 'ðŸ•¶ï¸ áº¨n', play: 'â–¶ï¸ Cháº¡y láº¡i' };
        const layerMap = { above: 'TrÃªn', below: 'DÆ°á»›i' };

        let detailText = '';
        if (kf.action === 'move') detailText = `X:${kf.transform.x} Y:${kf.transform.y}`;
        else if (kf.action === 'scale') detailText = `Scale: ${kf.transform.scale}%`;
        else if (kf.action === 'layer') detailText = `Lá»›p: ${layerMap[kf.layer] || kf.layer}`;
        else if (kf.action === 'show' || kf.action === 'hide') detailText = `Thay Ä‘á»•i hiá»ƒn thá»‹`;
        else if (kf.action === 'play') detailText = `KÃ­ch hoáº¡t phÃ¡t video`;

        item.innerHTML = `
                    <div class="keyframe-info" style="display:flex; align-items:center; gap:12px; flex:1;">
                        <span class="keyframe-time">${kf.time}s</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:600; font-size:13px;">${actionMap[kf.action] || kf.action}</span>
                            <span style="font-size:11px; color:#888;">${kf.source} â€¢ ${detailText}</span>
                        </div>
                    </div>
                    <button class="btn-delete-kf" onclick="deleteKeyframe(${index})">ðŸ—‘ï¸</button>
                `;
        list.appendChild(item);
    });
}

// âœ… HÃ€M XÃ“A KEYFRAME
function deleteKeyframe(index) {
    if (index > -1 && index < currentTimeline.length) {
        currentTimeline.splice(index, 1);
        renderKeyframes();
        app.showNotification('success', `ðŸ—‘ï¸ ÄÃ£ xÃ³a keyframe!`);
    }
}

// âœ… HÃ€M LÆ¯U TIMELINE (Tá»° Äá»˜NG THÃŠM KEYFRAME QUAY Vá»€ Gá»C á»ž CUá»I)
// âœ… HÃ€M LÆ¯U TIMELINE (Sá»¬A Lá»–I Tá»° Äá»˜NG THÃŠM RESET TRÃNH Lá»–I undefined VÃ€ Dá»’N KEYFRAME)
function saveTimeline() {
    if (!currentTimelineEffectId) return;

    // Táº¡o báº£n sao sáº¡ch khÃ´ng chá»©a cÃ¡c auto-reset cÅ© náº¿u cÃ³
    const cleanTimeline = currentTimeline.filter(kf => !kf.isAutoReset);

    if (cleanTimeline.length === 0) {
        if (!confirm('Timeline Ä‘ang trá»‘ng. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n lÆ°u khÃ´ng?')) return;
    } else {
        // Tá»± Ä‘á»™ng thÃªm 1 keyframe Reset an toÃ n á»Ÿ cuá»‘i
        const firstKf = cleanTimeline[0];
        const lastKfTime = cleanTimeline[cleanTimeline.length - 1].time;
        const effectDuration = Math.max(10.0, lastKfTime + 2.0); // Tá»‘i thiá»ƒu 10s hoáº·c sau frame cuá»‘i 2s

        cleanTimeline.push({
            time: effectDuration,
            action: 'move',
            source: firstKf.source || 'auto_webcam',
            layer: firstKf.layer || 'above',
            transform: { x: 0, y: 0, scale: 100 },
            isAutoReset: true
        });
    }

    // Sáº¯p xáº¿p láº¡i
    cleanTimeline.sort((a, b) => a.time - b.time);

    fetch(`http://127.0.0.1:9000/api/effects/${currentTimelineEffectId}/timeline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${app.authToken}` },
        body: JSON.stringify({ timeline: cleanTimeline, isComposite: true })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                app.showNotification('success', 'ðŸ’¾ LÆ°u timeline thÃ nh cÃ´ng!');
                // Cáº­p nháº­t láº¡i dá»¯ liá»‡u giao diá»‡n tá»« backend tráº£ vá» hoáº·c báº£n clean
                currentTimeline = data.timeline || cleanTimeline;
                renderKeyframes();
                closeTimelineEditor();
                if (app.loadAdminDashboard) app.loadAdminDashboard();
            } else {
                app.showNotification('error', 'âŒ LÆ°u tháº¥t báº¡i: ' + (data.error || 'Lá»—i mÃ¡y chá»§'));
            }
        })
        .catch(err => {
            console.error('Save timeline error:', err);
            app.showNotification('error', 'âŒ Lá»—i káº¿t ná»‘i API lÆ°u timeline!');
        });
}
// ===== HÃ€M Táº¢I DANH SÃCH OBS SOURCES =====
async function loadOBSSources() {
    const select = document.getElementById('kf-source');
    if (!select) return;

    // âœ… ThÃªm option tá»± Ä‘á»™ng nháº­n diá»‡n lÃªn Ä‘áº§u
    select.innerHTML = `<option value="auto_webcam" style="color:#10b981; font-weight:bold;">ðŸ“· Webcam (Tá»± Ä‘á»™ng nháº­n diá»‡n)</option>
                        <option value="">-- Hoáº·c chá»n Source cá»¥ thá»ƒ --</option>`;

    try {
        const res = await fetch(this.API_URL + '/api/obs/sources', {
            headers: { 'Authorization': `Bearer ${app.authToken}` }
        });
        const data = await res.json();

        if (data.success && data.sources) {
            // PhÃ¢n loáº¡i webcam vÃ  source khÃ¡c
            const webcams = data.sources.filter(s => s.isWebcam);
            const others = data.sources.filter(s => !s.isWebcam);

            // ThÃªm nhÃ³m webcam
            if (webcams.length > 0) {
                const grp = document.createElement('optgroup');
                grp.label = 'ðŸ“¹ Webcam / Video Capture';
                webcams.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    grp.appendChild(opt);
                });
                select.appendChild(grp);
            }

            // ThÃªm nhÃ³m source khÃ¡c
            if (others.length > 0) {
                const grp = document.createElement('optgroup');
                grp.label = 'ðŸ“¦ Source khÃ¡c (Audio, Text, Browser...)';
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
        console.error('Lá»—i load OBS sources:', err);
        select.innerHTML += '<option value="">âŒ Lá»—i káº¿t ná»‘i</option>';
    }
}


// ===== DEBUG GIFT MAPPING =====
window.testGiftMapping = function () {
    console.log('ðŸ” Testing Gift Mapping...');
    console.log('API_URL:', app.API_URL);
    console.log('WS_URL:', app.WS_URL);
    console.log('App object:', app);

    // Test load functions
    app.loadGifts().then(() => console.log('âœ… Gifts loaded'));
    app.loadEffectsForMapping().then(() => console.log('âœ… Effects loaded'));
    app.loadMappings().then(() => console.log('âœ… Mappings loaded'));
};

window.openTimelineEditor = openTimelineEditor;
window.closeTimelineEditor = closeTimelineEditor;
window.addKeyframe = addKeyframe;
window.deleteKeyframe = deleteKeyframe;
window.saveTimeline = saveTimeline;



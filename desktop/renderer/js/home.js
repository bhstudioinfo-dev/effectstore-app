console.log("JS LOADED OK 🔥");

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
        this.cart = [];
        this.machineId = null;
        this.currentView = 'store';
        this.currentUser = null;
        this.authToken = null;
        this.pendingEffects = null;
        this.pendingPaymentEffects = JSON.parse(localStorage.getItem('es_pending_payments') || '[]');
        this.logsInterval = null;
        this.currentMenuId = null; // Track current designer menu

        // TikTok Live variables
        this.ws = null;
        this.WS_URL = 'ws://127.0.0.1:9001';
        this.API_URL = 'http://127.0.0.1:9000';
        this.selectedGift = null;
        this.selectedEffect = null;
        this.giftMappings = [];

        // Cài đặt TTS (Text to Speech)
        this.isTTSGiftEnabled = localStorage.getItem('es_tts_gift_enabled') !== 'false';
        this.isTTSFollowEnabled = localStorage.getItem('es_tts_follow_enabled') !== 'false';
        this.ttsThreshold = parseInt(localStorage.getItem('es_tts_threshold') || '10');
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
                if (this.selectedGift && this.selectedEffect) {
                    this.createMapping();
                }
            }
        });

        this.init();
    }
    async init() {
        try {
            // Dọn dẹp localStorage cũ từ phiên bản trước
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

    updateUserUI() {
        if (!this.currentUser) return;
        const u = this.currentUser;
        const nameChar = (u.name && u.name.length > 0) ? u.name[0].toUpperCase() : 'U';

        // Badge + màu theo cấp độ
        const planInfo = {
            admin: { label: '👑 Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.3)' },
            business: { label: '💼 Business', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)' },
            pro: { label: '⭐ Pro', color: '#d4af37', bg: 'rgba(212,175,55,0.15)', border: 'rgba(212,175,55,0.3)' },
            free: { label: '🆓 Free', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.2)' }
        };
        const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
        const plan = planInfo[planKey] || planInfo.free;

        // Cập nhật avatar chữ
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
                this.currentUser = data.user;
                this.authToken = data.token;
                document.getElementById('auth-modal')?.classList.remove('show');
                this.updateUserUI();
                this.showNotification('success', `✅ Chào mừng ${data.user.name || data.user.email}!`);
                await this.loadBanner();
                await this.loadOwnedEffects();
                await this.loadEffects();
                this.loadCart();
                this.updateUI();
                this.pollSystemStatus();
                setInterval(() => this.pollSystemStatus(), 5000);
            } else {
                this.showNotification('error', data.error || data.message || 'Đăng nhập thất bại');
            }
        } catch (e) {
            console.error('Login exception:', e);
            this.showNotification('error', 'Lỗi kết nối server');
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
                this.showNotification('success', 'Đăng ký thành công!');
                location.reload();
            } else {
                this.showNotification('error', data.error || data.message || 'Đăng ký thất bại');
            }
        } catch (e) { this.showNotification('error', 'Lỗi kết nối server'); }
    }

    logout() {
        localStorage.removeItem('token');
        location.reload();
    }

    async pollSystemStatus() {
        try {
            const res = await fetch(`${this.API_URL}/api/system/status`);
            if (!res.ok) throw new Error('API Offline');
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
            const data = await res.json();

            const heroBanner = document.querySelector('.hero-banner-new');

            if (data.success && data.banner && heroBanner) {
                const bannerUrl = `${this.API_URL}${data.banner.url}`;
                // Use backgroundImage to preserve existing background settings like gradient overlays
                heroBanner.style.backgroundImage = `url('${bannerUrl}')`;
                heroBanner.style.backgroundSize = 'cover';
                heroBanner.style.backgroundPosition = 'center';
                heroBanner.style.backgroundRepeat = 'no-repeat';

                console.log('✅ Banner loaded:', data.banner.url);
            } else if (!heroBanner) {
                console.warn('⚠️ .hero-banner-new not found in DOM');
            }

        } catch (err) {
            console.error('Load banner lỗi:', err);
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
                                    <div class="ranking-thumb">${e.icon || '🎬'}</div>
                                    <div class="ranking-info">
                                        <div class="name">${e.name}</div>
                                        <div class="uses">👁 ${formattedUses} lượt dùng</div>
                                    </div>
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
            return;
        }
        try {
            const response = await fetch(this.API_URL + '/api/user/effects', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            if (data.success) {
                if (data.libraryType === 'all_with_ownership') {
                    // API mới: tất cả effects có flag isOwned
                    this.effects = data.effects || [];
                    this.ownedEffects = this.effects.filter(e => e.isOwned);
                } else if (data.libraryType === 'admin_all') {
                    // Admin: thấy tất cả
                    this.effects = data.effects || [];
                    this.ownedEffects = this.effects; // admin "sở hữu" tất cả
                } else {
                    // Fallback cũ
                    this.ownedEffects = data.effects || [];
                }

                // TỰ ĐỘNG DỌN DẸP: Nếu đã sở hữu thì xóa khỏi danh sách chờ duyệt
                const ownedIds = this.ownedEffects.map(e => (e.id || e._id));
                const oldPendingCount = (this.pendingPaymentEffects || []).length;
                this.pendingPaymentEffects = (this.pendingPaymentEffects || []).filter(id => !ownedIds.includes(id));

                if (this.pendingPaymentEffects.length !== oldPendingCount) {
                    localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));
                }

                this.renderEffects();
            } else {
                this.ownedEffects = [];
            }
        } catch (error) {
            console.error('Load owned effects error:', error);
            this.ownedEffects = [];
        }
    } // ✅ Đóng loadOwnedEffects ở đây

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
    speakText(text) {
        if (!text) return;
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

            // Chờ âm thanh phát xong mới chuyển sang câu tiếp theo
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
            console.log('🗣️ Đang phát TTS:', text);
        } catch (error) {
            console.error('TTS Play Error:', error);
            this.processTTSQueue();
        }
    }

    removeFromCart(effectId) { this.cart = this.cart.filter(e => (e.id || e._id) !== effectId); this.saveCart(); this.renderEffects(); this.showNotification('success', '✅ Đã xóa khỏi giỏ!'); }
    async checkout() {
        if (this.cart.length === 0) { this.showNotification('warning', '⚠️ Giỏ trống!'); return; }
        const total = this.cart.reduce((sum, e) => {
            const actualPrice = (e.isFlashSale && e.flashSalePrice > 0) ? e.flashSalePrice : (e.price || 0);
            return sum + actualPrice;
        }, 0);
        const effectIds = this.cart.map(e => e._id || e.id);
        this.pendingEffects = this.cart.map(effect => ({ effectId: effect._id || effect.id, effectName: effect.name, videoPath: `${effect.id}.webm` }));

        try {
            this.showNotification('info', '⏳ Đang tạo mã QR...');
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

            // Fix: đảm bảo orderId luôn có giá trị
            const orderId = data.orderId || `DH${Date.now()}`;
            const bank = data.bankInfo || {};
            const formattedTotal = this.formatPrice(total);

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
                                    <li style="font-size:12px;color:#a78bfa;">(Tùy chọn) Upload ảnh để được duyệt nhanh hơn</li>
                                </ol>
                            </div>

                            <!-- Upload ảnh (tùy chọn) -->
                            <div style="margin-bottom:16px;">
                                <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                    📎 Upload ảnh chuyển khoản
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
                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${total})" style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:all 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(124,58,237,0.5)'"
                                    onmouseout="this.style.transform='';this.style.boxShadow=''">
                                    ✅ Xác nhận đã chuyển khoản
                                </button>
                                <button onclick="app.closeModal()" style="width:100%;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#6b7280;font-size:13px;cursor:pointer;">Đóng</button>
                            </div>
                        </div>
                    `);

            // Bắt đầu Polling trạng thái đơn hàng
            this.startPaymentPolling(orderId, effectIds, total);

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
            localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));

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
                const res = await fetch(`http://127.0.0.1:9000/api/payment/status/${orderId}`);
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
        localStorage.setItem('es_pending_payments', JSON.stringify(this.pendingPaymentEffects));

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
    async triggerEffect(effectId) {
        console.log('🎬 Trigger:', effectId);
        this.showNotification('info', '🎬 Đang kích hoạt effect...');

        try {
            const effect = this.ownedEffects.find(e => (e.id || e._id) === effectId) ||
                this.effects.find(e => (e.id || e._id) === effectId);

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

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    effectId,
                    duration: effect ? (effect.duration || 15) : 15,
                    webcamSourceName: webcamSourceName
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('success', '✅ Effect đã được kích hoạt!');
                const ownedEffect = this.ownedEffects.find(e => (e.id || e._id) === effectId);
                if (ownedEffect) {
                    ownedEffect.useCount = (ownedEffect.useCount || 0) + 1;
                    localStorage.setItem('es_owned_effects', JSON.stringify(this.ownedEffects));
                }
            } else {
                this.showNotification('error', '❌ ' + (data.error || data.message));
            }
        } catch (error) {
            console.error('Trigger error:', error);
            this.showNotification('error', '❌ Lỗi: ' + error.message);
        }
    }
    renderEffects(filter = 'all', search = '') {
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
        let filtered = effects || [];
        if (filter && filter !== 'all') {
            filtered = filtered.filter(e => e.category === filter);
        }
        if (search) {
            filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
        }

        grid.innerHTML = '';
        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:80px 20px;"><div class="empty-icon" style="font-size:64px;margin-bottom:20px;">${viewName === 'library' ? '📚' : '🔍'}</div><h3 style="color:var(--text-secondary);font-size:18px;margin-bottom:10px;">${viewName === 'library' ? 'Chưa có hiệu ứng nào' : 'Không tìm thấy hiệu ứng'}</h3><p style="color:var(--text-muted);">${viewName === 'library' ? 'Hãy mua hiệu ứng từ cửa hàng để sở hữu' : 'Thử tìm với từ khóa khác'}</p></div>`;
            return;
        }

        grid.innerHTML = filtered.map(effect => {
            if (!effect) return '';
            const effectId = effect._id || effect.id || effect;
            if (typeof effect !== 'object') {
                // Trường hợp dữ liệu thô chưa được populate
                return `<div class="effect-card pending" style="padding:20px; text-align:center; color:var(--text-muted);">
                            <div style="font-size:24px; margin-bottom:10px;">⏳</div>
                            <div style="font-size:12px;">Đang tải dữ liệu hiệu ứng...</div>
                            <div style="font-size:10px; opacity:0.5; margin-top:5px;">ID: ${effect}</div>
                        </div>`;
            }

            // Logic sở hữu:
            // 1. Admin sở hữu tất cả
            // 2. Gói Business sở hữu tất cả
            // 3. User đã mua lẻ (có trong ownedEffects)
            const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
            const isBusiness = this.currentUser && this.currentUser.subscription === 'business';
            const hasPurchased = this.ownedEffects.some(e => (e.id || e._id) === effectId);

            const isOwned = isAdmin || isBusiness || hasPurchased;
            const isPending = this.pendingPaymentEffects.includes(effectId);

            // ✅ XỬ LÝ PREVIEW: Thumb -> Video on Hover
            let previewHTML = '';
            const thumbUrl = effect.thumbUrl ? `${this.API_URL}${effect.thumbUrl}` : '';
            const videoUrl = effect.previewUrl ? `${this.API_URL}${effect.previewUrl}` : '';

            if (thumbUrl && videoUrl) {
                // Có cả Thumb và Video
                previewHTML = `
                            <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')"
                                onmouseenter="const v=this.querySelector('video'); if(v) { v.play().catch(e=>{}); }" 
                                onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                                <img src="${thumbUrl}" class="effect-thumb-img">
                                <video src="${videoUrl}" class="effect-video" muted loop playsinline></video>
                            </div>
                        `;
            } else if (videoUrl) {
                // Chỉ có Video (Hiện ngay vì ko có Thumb)
                previewHTML = `
                            <div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')">
                                <video src="${videoUrl}" class="effect-video" style="opacity:1;" muted loop autoplay playsinline></video>
                            </div>
                        `;
            } else {
                // Chỉ có Icon
                previewHTML = `<div class="effect-thumb-container" onclick="app.showEffectDetail('${effectId}')" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:64px;cursor:pointer;">${effect.icon || '🎬'}</div>`;
            }

            // Xác định trạng thái và nội dung nút
            let btnClass = 'btn-add-cart';
            let btnAction = `app.addToCart('${effectId}')`;
            let btnText = '🛒 Thêm vào giỏ';
            let borderCol = 'transparent';

            const isInCart = this.cart.some(item => (item.id || item._id) === effectId);

            // Kiểm tra Flash Sale còn hiệu lực không
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
                btnText = '▶ Kích Hoạt (Đã Sở Hữu)';
                borderCol = isFlashSaleActive ? '#ef4444' : 'var(--success)';
            } else if (isPending) {
                btnClass += ' btn-pending';
                btnAction = 'void(0)';
                btnText = '⏳ Đang chờ duyệt';
                borderCol = 'rgba(212, 175, 55, 0.5)';
            } else if (isInCart) {
                btnClass += ' btn-in-cart';
                btnAction = 'app.openCart()';
                btnText = '🛒 Đã trong giỏ';
                borderCol = '#ec4899';
            } else if (isFlashSaleActive) {
                borderCol = '#ef4444';
                btnClass = 'btn-flash-sale';
                btnText = '⚡ MUA NGAY (GIÁ SỐC)';
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

                // Nút thanh toán
                let activeBtnClass = 'btn-fs-buy';
                let activeBtnAction = `app.addToCart('${effectId}')`;
                let activeBtnText = '<i class="fas fa-shopping-cart"></i> MUA NGAY';

                if (isInCart) {
                    activeBtnClass = 'btn-add-cart btn-in-cart';
                    activeBtnAction = 'app.openCart()';
                    activeBtnText = '🛒 Đã trong giỏ';
                } else if (isOwned) {
                    activeBtnClass = 'btn-add-cart btn-owned';
                    activeBtnAction = `app.triggerEffect('${effectId}')`;
                    activeBtnText = '▶ Kích Hoạt (Đã Sở Hữu)';
                } else if (isPending) {
                    activeBtnClass = 'btn-add-cart btn-pending';
                    activeBtnAction = 'void(0)';
                    activeBtnText = '⏳ Đang chờ duyệt';
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
                                    <span class="duration-badge">${(effect.duration || 15).toFixed(1)}s</span>
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
                            <div class="effect-name">${effect.name || 'Hiệu ứng không tên'}</div>
                            ${viewName === 'library' ? `
                            <div class="effect-price-row" style="margin-bottom: 5px;">
                                <div style="display: flex; align-items: baseline;">
                                    <span class="price-current" style="color: var(--success); font-weight: 600; font-size: 13px;"><i class="fas fa-check-circle" style="margin-right: 4px;"></i> Đã sở hữu</span>
                                </div>
                                <span class="duration-badge">${(effect.duration || 15).toFixed(1)}s</span>
                            </div>
                            ` : `
                            <div class="effect-price-row" style="margin-bottom: 5px;">
                                <div style="display: flex; align-items: baseline;">
                                    <span class="price-current" style="color: ${priceColor}; font-weight: 800; font-size: 15px;">${this.formatPrice(currentPrice)}</span>
                                    ${originalPriceHTML}
                                </div>
                                <span class="duration-badge">${(effect.duration || 15).toFixed(1)}s</span>
                            </div>
                            `}
                            <button class="${btnClass}" onclick="${btnAction}">${btnText}</button>
                        </div>
                    </div>`;
        }).join('');
        // Xử lý hover cho videos - Fix lỗi AbortError
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
        console.log(`✅ Rendered ${filtered.length} effects to ${viewName}`);
    }
    getCategoryName(cat) {
        return {
            transformation: 'Biến hình', gift: 'Quà tặng',
            background: 'Background', animation: 'Animation',
            pk: 'PK', meme: 'Meme', team_heart: 'Tym đội'
        }[cat] || cat;
    }
    formatPrice(price) { return new Intl.NumberFormat('vi-VN').format(price) + '₫'; }
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
    }

    showEffectDetail(effectId) {
        const effect = this.effects.find(e => (e.id || e._id) === effectId) || this.ownedEffects.find(e => (e.id || e._id) === effectId);
        if (!effect) return;

        const isAdmin = this.currentUser && (this.currentUser.isAdmin || this.currentUser.hasAdminUI);
        const isBusiness = this.currentUser && this.currentUser.subscription === 'business';
        const hasPurchased = this.ownedEffects.some(e => (e.id || e._id) === effectId);
        const isOwned = isAdmin || isBusiness || hasPurchased;
        const videoUrl = effect.previewUrl ? `http://127.0.0.1:9000${effect.previewUrl}` : '';

        document.getElementById('detail-name').textContent = `${effect.icon || '🎬'} ${effect.name}`;
        document.getElementById('detail-category').textContent = this.getCategoryName(effect.category);
        document.getElementById('detail-price').textContent = isOwned ? 'Đã Sở Hữu' : this.formatPrice(effect.price);
        document.getElementById('detail-original-price').textContent = effect.originalPrice > effect.price ? this.formatPrice(effect.originalPrice) : '';
        document.getElementById('detail-desc-text').textContent = effect.description || 'Không có mô tả chi tiết.';

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
            btnAddCart.innerHTML = '▶ Kích Hoạt Lên OBS';
            btnAddCart.className = 'btn-add-cart btn-owned';
            btnAddCart.onclick = () => { this.closeEffectDetailModal(); this.triggerEffect(effectId); };
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
    }

    saveGlobalFlashSaleTime() {
        const val = document.getElementById('global-flash-sale-ends').value;
        localStorage.setItem('es_global_flash_sale_ends', val);
        this.showNotification('success', '💾 Đã cập nhật thời gian Flash Sale dùng chung!');
        this.renderEffects();
    }

    async testTryEffect(effectId) {
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
        document.querySelectorAll('.menu-item-new').forEach(i => i.classList.remove('active'));
        const activeNav = Array.from(document.querySelectorAll('.menu-item-new')).find(el =>
            el.getAttribute('onclick')?.includes(`'${view}'`)
        );
        if (activeNav) activeNav.classList.add('active');

        const viewsToHide = ['store', 'library', 'admin', 'settings', 'gift-mapping'];
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
                document.getElementById('page-title').textContent = '👨‍💼 Admin Dashboard';
                this.loadAdminDashboard();
            } else if (view === 'store') {
                document.getElementById('page-title').textContent = '🛒 Cửa Hàng';
                this.renderEffects();
            } else if (view === 'library') {
                document.getElementById('page-title').textContent = '📚 Thư Viện';
                this.loadOwnedEffects();
            } else if (view === 'gift-mapping') {
                document.getElementById('page-title').textContent = '🎁 Gift Mapping';
                this.initGiftMapping(); // Khởi tạo Gift Mapping khi vào view
            } else if (view === 'settings') {
                document.getElementById('page-title').textContent = '⚙️ Cài Đặt';
                this.loadSettings();
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
                this.showNotification('success', '✅ Upload thành công!');
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
                        container.innerHTML = '<div class="empty-state">💳 Không có payment chờ</div>';
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
                                            <span style="font-size:11px; color:#a78bfa;">${p.effectIds.length} hiệu ứng</span>
                                            <div style="display:flex; gap:5px;">
                                                <button onclick="app.approvePayment('${p._id}')" style="background:rgba(16,185,129,0.1); color:#10b981; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Duyệt</button>
                                                <button onclick="app.rejectPayment('${p._id}')" style="background:rgba(239,68,68,0.1); color:#ef4444; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">Hủy</button>
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
    async approvePayment(paymentId) { if (!confirm('✅ Duyệt payment?')) return; try { const res = await fetch(`${this.API_URL}/api/payment/admin/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` }, body: JSON.stringify({ paymentId }) }); const data = await res.json(); if (data.success) { this.showNotification('success', '✅ Đã duyệt!'); this.loadAdminDashboard(); } } catch (error) { this.showNotification('error', '❌ ' + error.message); } }
    async rejectPayment(paymentId) { if (!confirm('❌ Từ chối payment này?')) return; const reason = 'Không xác định'; try { const res = await fetch(`${this.API_URL}/api/payment/admin/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` }, body: JSON.stringify({ paymentId, reason }) }); const data = await res.json(); if (data.success) { this.showNotification('success', '✅ Đã từ chối'); this.loadAdminDashboard(); } } catch (error) { this.showNotification('error', '❌ ' + error.message); } }

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

            const planBadge = (sub, isAdmin) => {
                if (isAdmin) return '<span style="padding:2px 10px;border-radius:12px;background:rgba(255,107,53,0.15);color:#ff6b35;border:1px solid rgba(255,107,53,0.3);font-size:11px;font-weight:700;">👑 Admin</span>';
                const map = {
                    business: '<span style="padding:2px 10px;border-radius:12px;background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);font-size:11px;font-weight:700;">💼 Business</span>',
                    pro: '<span style="padding:2px 10px;border-radius:12px;background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3);font-size:11px;font-weight:700;">⭐ Pro</span>',
                    free: '<span style="padding:2px 10px;border-radius:12px;background:rgba(107,114,128,0.12);color:#6b7280;border:1px solid rgba(107,114,128,0.2);font-size:11px;font-weight:700;">🆓 Free</span>'
                };
                return map[sub] || map.free;
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
                                                    <div style="width:36px;height:36px;border-radius:50%;background:${u.isAdmin ? 'linear-gradient(135deg,#ff6b35,#ff9a3c)' : (u.subscription === 'business' ? 'linear-gradient(135deg,#a78bfa,#7c3aed)' : (u.subscription === 'pro' ? 'linear-gradient(135deg,#d4af37,#f4e4ba)' : 'linear-gradient(135deg,#374151,#4b5563)'))};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:${u.subscription === 'pro' && !u.isAdmin ? '#000' : '#fff'};flex-shrink:0;">
                                                        ${(u.name || u.email || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style="font-weight:600;color:#fff;">${u.name || '(chưa đặt tên)'}</div>
                                                        <div style="font-size:11px;color:#6b7280;">${u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="padding:12px 16px;">${planBadge(u.subscription, u.isAdmin)}</td>
                                            <td style="padding:12px 16px;">
                                                <div style="color:${(new Date() - new Date(u.lastActive)) > 86400000 * 7 ? '#ef4444' : '#6b7280'}; font-size:12px;">
                                                    ${formatTimeAgo(u.lastActive)}
                                                </div>
                                                <div style="font-size:10px;color:#4b5563;">Ngày đk: ${new Date(u.createdAt).toLocaleDateString('vi-VN')}</div>
                                            </td>
                                            <td style="padding:12px 16px;text-align:center;">
                                                ${u.isAdmin ? '<span style="color:#6b7280;font-size:12px;">—</span>' : `
                                                <div style="display:flex;gap:6px;justify-content:center;">
                                                    <button onclick="app.upgradeSubscription('${u._id}','pro',30)" style="padding:5px 10px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:6px;color:#d4af37;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">⭐ 30 ngày</button>
                                                    <button onclick="app.upgradeSubscription('${u._id}','business',30)" style="padding:5px 10px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);border-radius:6px;color:#a78bfa;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">💼 30 ngày</button>
                                                    <button onclick="app.upgradeSubscription('${u._id}','free',0)" style="padding:5px 10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:#ef4444;cursor:pointer;font-size:11px;font-weight:600;">Hạ Free</button>
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

    async upgradeSubscription(userId, plan, durationDays) {
        const planLabel = { pro: '⭐ Pro', business: '💼 Business', free: '🆓 Free' }[plan];
        const msg = plan === 'free'
            ? `Hạ tài khoản về Free?`
            : `Nâng cấp lên ${planLabel} trong ${durationDays} ngày?`;
        if (!confirm(msg)) return;
        try {
            const res = await fetch(`${this.API_URL}/api/admin/users/${userId}/subscription`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.authToken}` },
                body: JSON.stringify({ plan, durationDays })
            });
            const data = await res.json();
            if (data.success) {
                this.showNotification('success', `✅ Đã cập nhật gói ${planLabel}!`);
                this.loadAdminUsers();
            } else {
                this.showNotification('error', '❌ ' + data.error);
            }
        } catch (err) {
            this.showNotification('error', '❌ Lỗi kết nối: ' + err.message);
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
    showPricing() {
        console.log('💎 Opening Pricing Modal...');
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

        if (isAdmin) {
            if (btnFree) { btnFree.innerText = 'Đã sở hữu'; btnFree.classList.add('disabled'); }
            if (btnPro) { btnPro.innerText = 'Đã sở hữu'; btnPro.classList.add('disabled'); btnPro.onclick = null; }
            if (btnBusiness) { btnBusiness.innerText = 'Đã sở hữu'; btnBusiness.classList.add('disabled'); btnBusiness.onclick = null; }
        } else {
            if (btnFree) {
                btnFree.innerText = currentPlan === 'free' ? 'Gói hiện tại' : 'Gói miễn phí';
                btnFree.className = currentPlan === 'free' ? 'plan-btn disabled' : 'plan-btn';
            }
            if (btnPro) {
                btnPro.innerText = currentPlan === 'pro' ? 'Gói hiện tại' : '🚀 NÂNG CẤP PRO';
                btnPro.className = currentPlan === 'pro' ? 'plan-btn disabled' : 'plan-btn active';
                btnPro.onclick = currentPlan === 'pro' ? null : () => this.buySubscription('pro');
            }
            if (btnBusiness) {
                btnBusiness.innerText = currentPlan === 'business' ? 'Gói hiện tại' : '💎 ĐỐI TÁC';
                btnBusiness.className = currentPlan === 'business' ? 'plan-btn disabled' : 'plan-btn';
                btnBusiness.onclick = currentPlan === 'business' ? null : () => this.buySubscription('business');
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
        const price = plan === 'pro' ? 99000 : 249000;
        const subCode = plan === 'pro' ? 'SUBSCRIPTION_PRO' : 'SUBSCRIPTION_BUSINESS';
        const planName = plan === 'pro' ? 'Pro' : 'Business';

        // CRITICAL FIX: Set pendingEffects so confirmPaymentWithProof sends the correct code
        this.pendingEffects = [{ effectId: subCode, effectName: `Gói ${planName}` }];

        this.closePricing();

        try {
            this.showNotification('info', '⏳ Đang tạo mã QR thanh toán...');
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

                                <button onclick="app.confirmPaymentWithProof('${orderId}', ${price})" style="width: 100%; padding: 18px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none; border-radius: 16px; color: #fff; font-weight: 800; font-size: 16px; cursor: pointer; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.3); transition: 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.filter='brightness(1.1)';" onmouseout="this.style.transform=''; this.style.filter='';">
                                    XÁC NHẬN ĐÃ CHUYỂN KHOẢN
                                </button>
                            </div>
                        </div>
                    `);

            this.startPaymentPolling(orderId, [subCode], price);

        } catch (error) {
            console.error('Buy Subscription error:', error);
            this.showNotification('error', '❌ Lỗi: ' + error.message);
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

            const grid = document.getElementById('gifts-grid');
            console.log('Gifts grid element:', grid);

            if (data.success && grid) {
                if (data.gifts && data.gifts.length > 0) {
                    grid.innerHTML = data.gifts.map(g => {
                        const isImage = g.icon && (g.icon.includes('/') || g.icon.includes('.'));
                        const iconHtml = isImage
                            ? `<img src="${this.API_URL}${g.icon}" style="width:40px;height:40px;object-fit:contain;margin-bottom:5px;display:block;margin:0 auto;">`
                            : `<div style="font-size:32px;margin-bottom:5px;">${g.icon || '🎁'}</div>`;
                        return `
                                    <div class="gift-item" onclick="app.selectGift('${g.id}','${g.name}','${g.icon}')">
                                        ${iconHtml}
                                        <div class="gift-name">${g.name}</div>
                                        <div class="gift-coins">${g.coins} coins</div>
                                    </div>
                                `;
                    }).join('');
                    console.log('✅ Rendered', data.gifts.length, 'gifts');
                } else {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">Không có gifts</div>';
                }
            } else {
                console.error('❌ No gifts data or grid element not found');
            }
        } catch (e) {
            console.error('❌ Load gifts error:', e);
        }
    }
    async loadEffectsForMapping() {
        try {
            console.log('🎬 Loading mapping effects...');
            const grid = document.getElementById('effects-mapping-grid');
            if (!grid) return;

            // Nếu là admin dùng toàn bộ effect, nếu là user chỉ dùng effect đã mua
            const displayEffects = (this.currentUser && this.currentUser.isAdmin) ? this.effects : this.ownedEffects;

            if (displayEffects && displayEffects.length > 0) {
                grid.innerHTML = displayEffects.map(e => {
                    const thumbUrl = e.thumbUrl ? `${this.API_URL}${e.thumbUrl}` : '';
                    const videoUrl = e.previewUrl ? `${this.API_URL}${e.previewUrl}` : '';
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
                <div class="effect-mapping-item" data-effect-id="${e._id || e.id}">
                    <div class="effect-mapping-thumb" 
                        onmouseenter="const v=this.querySelector('video'); if(v) { v.muted=true; const p=v.play(); if(p!==undefined) p.catch(()=>{}); }" 
                        onmouseleave="const v=this.querySelector('video'); if(v) { v.pause(); v.currentTime=0; }">
                        ${previewHTML}
                    </div>
                    <div class="effect-mapping-info">
                        <div class="effect-mapping-name">${e.icon || '🎬'} ${e.name}</div>
                    </div>
                </div>
            `}).join('');
                console.log('✅ Rendered', displayEffects.length, 'mapping effects');

                // Xử lý sự kiện click & hover cho danh sách effect
                setTimeout(() => {
                    const effectItems = grid.querySelectorAll('.effect-mapping-item');
                    effectItems.forEach(item => {
                        const video = item.querySelector('video');

                        // Xử lý Play/Pause video khi hover
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

                        // Xử lý Click để chọn effect
                        item.addEventListener('click', () => {
                            const effectId = item.getAttribute('data-effect-id');
                            const effectName = item.querySelector('.effect-mapping-name').textContent.trim();
                            this.selectEffect(effectId, effectName);

                            // Highlight thẻ được chọn
                            effectItems.forEach(i => i.style.border = '1px solid rgba(255,255,255,0.1)');
                            item.style.border = '1px solid var(--primary)';
                        });
                    });
                }, 100);
            } else {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">Không có effects nào. Hãy mua hiệu ứng trong cửa hàng!</div>';
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
            this.showNotification('info', '⌨️ Nhấn ENTER để xác nhận Mapping');
        }
    }

    selectEffect(id, name) {
        this.selectedEffect = { id, name };
        document.querySelectorAll('.effect-mapping-item').forEach(el => el.classList.remove('selected'));
        event.currentTarget.classList.add('selected');

        if (this.selectedGift) {
            this.showNotification('info', '⌨️ Nhấn ENTER để xác nhận Mapping');
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
                this.showNotification('success', `✅ Mapping: ${this.selectedGift.name} → ${this.selectedEffect.name}`);
                this.selectedGift = null; this.selectedEffect = null;
                document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                this.loadMappings();
            }
        } catch (e) { this.showNotification('error', 'Lỗi: ' + e.message); }
    }

    async loadMappings() {
        try {
            console.log('📋 Loading mappings...');
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

                        return `
                                <div class="mapping-list-item">
                                    <div class="mapping-info">
                                        <div class="mapping-badge">
                                            ${giftIconHtml}
                                            <span style="font-size:14px;font-weight:600;">${m.giftName}</span>
                                        </div>
                                        <span style="color:var(--text-muted);font-size:16px;">▶</span>
                                        <div class="mapping-badge" style="background:rgba(240,147,251,0.1);border-color:rgba(240,147,251,0.2);">
                                            <span style="font-size:14px;font-weight:600;color:#f093fb;">${m.effectName || 'Unknown'}</span>
                                        </div>
                                    </div>
                                    <div class="mapping-actions">
                                        <button class="btn-sm btn-test" onclick="app.testMapping(event, '${m._id}')">▶ Test</button>
                                        <button class="btn-sm btn-delete" onclick="app.deleteMapping('${m._id}')">🗑️ Xóa</button>
                                    </div>
                                </div>
                            `}).join('');
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

            const token = localStorage.getItem('token');
            const res = await fetch(`${this.API_URL}/api/tiktok/test-trigger`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ mappingId: id })
            });
            const data = await res.json();

            if (data.success) {
                this.showNotification('success', '🎬 Đã kích hoạt hiệu ứng!');

                const totalDuration = Math.max(((data.duration || 5) * 1000) - 1000, 1000);
                let timeLeft = totalDuration;
                const step = 50;

                const interval = setInterval(() => {
                    timeLeft -= step;
                    const percent = (timeLeft / totalDuration) * 100;
                    const seconds = Math.max(0, (timeLeft / 1000)).toFixed(1);

                    btn.innerHTML = `<i class="fas fa-hourglass-half"></i> ${seconds}s`;
                    // Hiệu ứng thanh thời gian chạy lùi
                    btn.style.background = `linear-gradient(90deg, #10b981 ${percent}%, rgba(0,0,0,0.3) ${percent}%)`;

                    if (timeLeft <= 0) {
                        clearInterval(interval);
                        btn.disabled = false;
                        btn.innerHTML = originalContent;
                        btn.style.background = '';
                        btn.style.cursor = 'pointer';
                        btn.style.transition = '0.3s';
                    }
                }, step);
            } else {
                throw new Error(data.message || 'Lỗi server');
            }
        } catch (e) {
            this.showNotification('error', 'Lỗi: ' + e.message);
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

    async triggerOBSEffect(effectId) {
        try {
            await fetch(`${this.API_URL}/api/obs/trigger`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectId })
            });
        } catch (e) { console.error('OBS trigger error:', e); }
    }
    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(this.WS_URL);
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
            case 'chat': console.log('💬 Chat:', data.data); break;
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
                this.speakText(`Cảm ơn ${nickname} đã tặng ${giftData.giftName}`);

                // Nếu đủ ngưỡng xu, đưa vào danh sách chờ đọc comment
                if (giftData.diamondCount >= this.ttsThreshold) {
                    this.pendingDonors.set(giftData.userId, {
                        nickname: nickname,
                        timestamp: Date.now()
                    });
                    // Xóa sau 60 giây nếu họ không comment
                    setTimeout(() => this.pendingDonors.delete(giftData.userId), 60000);
                }
            }, 800);
        }

        const mapping = this.giftMappings?.find(m => m.giftId === giftData.giftId && m.isActive);
        if (mapping) {
            this.triggerOBSEffect(mapping.effectId);
        }
    }

    async handleFollow(data) {
        const nickname = data.nickname || data.uniqueId || 'bạn mới';
        this.showNotification('success', `👤 ${nickname} vừa Follow!`);
        if (this.isTTSFollowEnabled) {
            this.speakText(`Cảm ơn ${nickname} đã follow kênh nhé!`);
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
            this.speakText(`${donor.nickname} nhắn là: ${data.comment}`);
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
                                    <td>🎬 ${log.effectName || 'Unknown'}</td>
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
                admin: { label: '👑 Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.3)' },
                business: { label: '💼 Business', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)' },
                pro: { label: '⭐ Pro', color: '#d4af37', bg: 'rgba(212,175,55,0.15)', border: 'rgba(212,175,55,0.3)' },
                free: { label: '🆓 Free', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.2)' }
            };
            const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
            const plan = planInfo[planKey] || planInfo.free;
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

        const startupEl = document.getElementById('settings-run-startup');
        if (startupEl) startupEl.checked = localStorage.getItem('run_startup') === 'true';

        // Load danh sách giọng đọc
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

        this.showNotification('success', '✅ Lưu tùy chọn thành công!');
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

    // ===== GIFT MENU DESIGNER LOGIC =====
    async initGiftMenuDesigner() {
        try {
            // Khởi tạo Designer Canvas
            if (window.giftMenuDesigner) {
                window.giftMenuDesigner.init();
            }

            const giftList = document.getElementById('designer-library-grid');
            if (!giftList) return;

            giftList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Đang tải quà tặng...</div>';

            const res = await fetch(`${this.API_URL}/api/tiktok/gifts-library`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();

            if (data.success) {
                giftList.innerHTML = '';
                data.gifts.forEach(g => {
                    const isImage = g.icon && (g.icon.includes('/') || g.icon.includes('.'));
                    const iconHtml = isImage
                        ? `<img src="${this.API_URL}${g.icon}" alt="${g.name}">`
                        : `<div style="font-size:24px;">${g.icon || '🎁'}</div>`;

                    const item = document.createElement('div');
                    item.className = 'mini-gift-item';
                    item.draggable = true;
                    item.innerHTML = `
                                ${iconHtml}
                                <div class="name">${g.name}</div>
                            `;

                    // Support both Click and Drag
                    item.onclick = () => {
                        if (window.designer) window.designer.addGiftToCanvas(g);
                    };

                    item.ondragstart = (e) => {
                        e.dataTransfer.setData('gift', JSON.stringify(g));
                    };

                    giftList.appendChild(item);
                });
            }
        } catch (e) {
            console.error('Error init designer:', e);
        }

        // Tải danh sách menu đã lưu
        this.loadSavedMenus();
    }

    async loadSavedMenus() {
        try {
            const listEl = document.getElementById('designer-saved-menus');
            if (!listEl) return;

            const res = await fetch(`${this.API_URL}/api/menu/list`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await res.json();

            if (data.success) {
                if (data.menus.length === 0) {
                    listEl.innerHTML = '<div class="loading-state" style="padding:10px; font-size:11px;">Chưa có mẫu thiết kế nào</div>';
                    return;
                }

                listEl.innerHTML = '';
                data.menus.forEach(m => {
                    const item = document.createElement('div');
                    item.className = `saved-menu-item ${this.currentMenuId === m._id ? 'active' : ''}`;
                    item.innerHTML = `
                                <div class="menu-info">
                                    <div class="name">${m.name}</div>
                                    <div class="meta">${m.elements.length} phần quà</div>
                                </div>
                                ${this.currentMenuId === m._id ? '<i class="fas fa-check-circle"></i>' : ''}
                            `;
                    item.onclick = () => this.selectMenu(m);
                    listEl.appendChild(item);
                });
            }
        } catch (e) {
            console.error('Error load menus:', e);
        }
    }

    async saveMenu(isExport = false) {
        if (!window.designer) return;
        const canvasData = window.designer.getData();
        if (!canvasData) return;

        try {
            const res = await fetch(`${this.API_URL}/api/menu/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    id: this.currentMenuId,
                    name: this.currentMenuId ? undefined : 'Menu mới ' + new Date().toLocaleTimeString(),
                    elements: canvasData.elements,
                    config: canvasData.config
                })
            });
            const data = await res.json();
            if (data.success) {
                this.currentMenuId = data.menu._id;
                this.showNotification('success', isExport ? '🚀 Lưu & Xuất thành công!' : '✅ Đã lưu thiết kế!');
                this.loadSavedMenus();

                // Update Export UI
                const exportId = document.getElementById('export-menu-id');
                if (exportId) exportId.textContent = data.menu._id;
            }
        } catch (e) {
            this.showNotification('error', '❌ Lỗi khi lưu thiết kế');
        }
    }

    async selectMenu(menu) {
        this.currentMenuId = menu._id;
        if (window.designer) {
            window.designer.loadData({
                elements: menu.elements,
                config: menu.config
            });
        }
        this.loadSavedMenus();

        const exportId = document.getElementById('export-menu-id');
        if (exportId) exportId.textContent = menu._id;
    }

    createNewMenu() {
        this.currentMenuId = null;
        if (window.designer && window.designer.canvas) {
            window.designer.canvas.clear();
            window.designer.drawGrid();
        }
        this.loadSavedMenus();
        const exportId = document.getElementById('export-menu-id');
        if (exportId) exportId.textContent = '...';
    }
}

// ===== EXPOSE GLOBAL FUNCTIONS =====
window.saveMenu = (isExport) => window.app.saveMenu(isExport);
window.createNewMenu = () => window.app.createNewMenu();
window.copyExportUrl = () => {
    const url = document.querySelector('.export-url-box').textContent.trim();
    navigator.clipboard.writeText(url);
    window.app.showNotification('success', '📋 Đã sao chép link OBS!');
};

// ===== INITIALIZE APP =====
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { window.app = new EffectStoreApp(); }); } else { window.app = new EffectStoreApp(); }

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
        admin: { label: '👑 Admin', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.25)' },
        business: { label: '💼 Business', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
        pro: { label: '⭐ Pro', color: '#d4af37', bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.25)' },
        free: { label: '🆓 Free', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.18)' }
    };
    const planKey = u.isAdmin ? 'admin' : (u.subscription || 'free');
    const plan = planInfo[planKey] || planInfo.free;
    const avatarBg = u.isAdmin ? 'linear-gradient(135deg,#ff6b35,#ff9a3c)'
        : (u.subscription === 'business' ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
            : (u.subscription === 'pro' ? 'linear-gradient(135deg,#d4af37,#f4e4ba)'
                : 'linear-gradient(135deg,#374151,#4b5563)'));
    const avatarColor = (u.subscription === 'pro' && !u.isAdmin) ? '#000' : '#fff';

    app.showModal('Tài khoản của tôi', `
                <div style="text-align:center; padding: 12px 0;">
                    <div style="width:72px;height:72px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:${avatarColor};margin:0 auto 14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);">${(u.name || 'U')[0].toUpperCase()}</div>
                    <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${u.name || 'Người dùng'}</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${u.email}</div>
                    <div style="font-size:12px;padding:5px 16px;border-radius:20px;display:inline-block;background:${plan.bg};color:${plan.color};border:1px solid ${plan.border};font-weight:700;">${plan.label}</div>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
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
function openGiftMapping() { navigateTo('gift-mapping.html'); }


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
                grp.label = '📹 Webcam / Video Capture';
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
                grp.label = '📦 Source khác (Audio, Text, Browser...)';
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
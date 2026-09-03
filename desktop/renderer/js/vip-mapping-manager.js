/**
 * LiveFlow - VIP Mapping Manager (Hiệu Ứng Vinh Danh User VIP)
 * Handles VIP User configurations with Owned Effects & Custom Uploaded Effects,
 * SVGA Avatar Frames, and Real-time Live Stream Preview.
 */
(function() {
    'use strict';

    class VipMappingManager {
        constructor() {
            this.storageKey = 'liveflow_vip_mappings';
            this.mappings = [];
            this.editingId = null;
            this.tempSvgaData = null;
            this.tempAvatarData = null;

            this.presetFrames = [
                { id: 'frame_ho_trang', name: '🐅 Khung Hổ Trắng Hoàng Kim (Chuyển Động WebM)', url: 'assets/frames/khung_ho_trang.webm', color: '#fbbf24', icon: '🐅', isVideo: true },
                { id: 'frame_rong_lua', name: '🔥 Khung Rồng Lửa Hỏa Long', url: 'assets/frames/khung_rong_lua.png', color: '#ef4444', icon: '🔥' },
                { id: 'frame_rong_bang', name: '❄️ Khung Rồng Băng Hàn Khí', url: 'assets/frames/khung_rong_bang.png', color: '#38bdf8', icon: '❄️' },
                { id: 'frame_love', name: '💖 Khung Love Cánh Thiên Thần', url: 'assets/frames/khung_love.png', color: '#f472b6', icon: '💖' }
            ];
        }

        init() {
            this.load();
            this.renderList();
            this.bindGlobalEvents();
        }

        load() {
            try {
                const data = localStorage.getItem(this.storageKey);
                this.mappings = data ? JSON.parse(data) : [];
            } catch (e) {
                console.error('[VIP Manager] Failed to load mappings:', e);
                this.mappings = [];
            }
            this.updateBadge();
        }

        save() {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.mappings));
            } catch (e) {
                console.error('[VIP Manager] Failed to save mappings:', e);
            }
            this.updateBadge();
            this.renderList();
        }

        updateBadge() {
            const badge = document.getElementById('summary-vip-mapping-status');
            if (badge) {
                const count = this.mappings.length;
                badge.textContent = `👑 ${count} VIP đã gán`;
                badge.style.color = count > 0 ? '#fbbf24' : '#9ca3af';
            }
        }

        // Retrieve all available owned and custom effects from LiveFlow
        getAvailableEffects() {
            let effects = [];
            
            // 1. From window.app memory
            if (window.app) {
                if (Array.isArray(window.app.mappingEffects) && window.app.mappingEffects.length > 0) {
                    effects = window.app.mappingEffects;
                } else if (Array.isArray(window.app.ownedEffects) && window.app.ownedEffects.length > 0) {
                    effects = window.app.ownedEffects;
                }
            }

            // 2. From localStorage cache
            if (effects.length === 0) {
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.includes('es_cache_owned_effects')) {
                            const data = JSON.parse(localStorage.getItem(k) || '[]');
                            if (Array.isArray(data) && data.length > 0) {
                                effects = data;
                                break;
                            }
                        }
                    }
                } catch(e) {}
            }

            // Filter out wheels & templates
            const filtered = (effects || []).filter(e => e && e.category !== 'menu_template' && e.isChallengeWheel !== true);
            
            // Fallback default list if app is initializing or offline
            if (filtered.length === 0) {
                return [
                    { _id: 'eff_ton_ngo_khong', name: '🐵 Tôn Ngộ Không Biến Hình', icon: '🐵', category: 'owned' },
                    { _id: 'eff_loi_than_raiden', name: '⚡ Lôi Thần Biến Hình (Raiden)', icon: '⚡', category: 'owned' },
                    { _id: 'eff_sieu_xe_cyber', name: '🏎️ Siêu Xe Cyberpunk Vàng', icon: '🏎️', category: 'owned' },
                    { _id: 'eff_rong_than_hoang_kim', name: '🐉 Hào Quang Rồng Thần', icon: '🐉', category: 'owned' }
                ];
            }

            return filtered;
        }

        renderList() {
            const container = document.getElementById('vip-mappings-list');
            if (!container) return;

            if (this.mappings.length === 0) {
                container.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:36px 16px; background:rgba(255,255,255,0.02); border:1px dashed rgba(251,191,36,0.25); border-radius:16px; color:var(--text-muted); font-size:13px; backdrop-filter:blur(6px);">
                        <div style="font-size:36px; margin-bottom:8px; filter:drop-shadow(0 4px 10px rgba(251,191,36,0.3));">👑</div>
                        <div style="font-weight:800; color:#fff; font-size:15px; margin-bottom:4px;">Chưa có User VIP nào được gán</div>
                        <p style="margin:0; font-size:12px; color:#9ca3af;">Bấm nút <strong>"+ Thêm User Vinh Danh"</strong> ở trên để tạo hiệu ứng biến hình riêng cho Đại gia / Top Fan!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = this.mappings.map(vip => {
                const avatar = vip.customAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(vip.username || 'VIP')}&background=f59e0b&color=fff`;
                const effectName = vip.effectName || 'Hiệu Ứng Vinh Danh';
                const frameName = vip.frameName || 'Viền Neon';

                return `
                    <div class="vip-item-card" style="background:linear-gradient(145deg, rgba(17,24,39,0.85) 0%, rgba(15,23,42,0.95) 100%); border:1px solid rgba(251,191,36,0.25); border-radius:16px; padding:15px; display:flex; flex-direction:column; gap:12px; position:relative; box-shadow:0 8px 24px rgba(0,0,0,0.35); transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1);"
                        onmouseover="this.style.borderColor='rgba(251,191,36,0.6)';this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 30px rgba(251,191,36,0.15)'"
                        onmouseout="this.style.borderColor='rgba(251,191,36,0.25)';this.style.transform='translateY(0)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.35)'">
                        
                        <!-- Top Row: Avatar & Username -->
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="position:relative; width:48px; height:48px; flex-shrink:0;">
                                <img src="${avatar}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(vip.username || 'VIP')}&background=f59e0b&color=fff'" 
                                    style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid #fbbf24; box-shadow:0 0 14px rgba(251,191,36,0.45);">
                                <span style="position:absolute; -top:6px; right:-4px; font-size:14px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">👑</span>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#fff; font-size:14px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>${vip.displayName || vip.username}</span>
                                </div>
                                <div style="font-size:11px; color:#fbbf24; font-weight:700; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; margin-top:1px;">
                                    ${vip.username}
                                </div>
                            </div>
                            <div style="display:flex; gap:5px;">
                                <button onclick="VipManager.openModal('${vip.id}')" title="Chỉnh sửa"
                                    style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#cbd5e1; width:30px; height:30px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:12px; transition:background 0.15s;"
                                    onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button onclick="VipManager.deleteVip('${vip.id}')" title="Xóa"
                                    style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.25); border-radius:8px; color:#f87171; width:30px; height:30px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:12px; transition:background 0.15s;"
                                    onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Info Pills -->
                        <div style="display:flex; flex-direction:column; gap:6px; font-size:11px; background:rgba(0,0,0,0.35); padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.04);">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <span style="color:#a78bfa; font-weight:600; display:flex; align-items:center; gap:4px;"><i class="fas fa-wand-magic-sparkles"></i> Hiệu ứng:</span>
                                <span style="font-weight:700; color:#fff; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:150px;">${effectName}</span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <span style="color:#fbbf24; font-weight:600; display:flex; align-items:center; gap:4px;"><i class="fas fa-gem"></i> Khung:</span>
                                <span style="font-weight:700; color:#fff; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:150px;">${frameName}</span>
                            </div>
                        </div>

                        <!-- Actions & Triggers -->
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:2px;">
                            <div style="font-size:10px; color:var(--text-muted); display:flex; gap:6px;">
                                ${vip.triggerOnJoin ? '<span style="background:rgba(59,130,246,0.15); color:#60a5fa; padding:2px 6px; border-radius:4px; font-weight:600;">🚪 Vào live</span>' : ''}
                                ${vip.triggerOnGift ? '<span style="background:rgba(236,72,153,0.15); color:#f472b6; padding:2px 6px; border-radius:4px; font-weight:600;">🎁 Tặng quà</span>' : ''}
                            </div>
                            <button onclick="VipManager.testPlay('${vip.id}', event)" class="btn-sm"
                                style="background:linear-gradient(135deg,#f59e0b,#ec4899); border:none; color:#fff; border-radius:8px; padding:6px 14px; font-size:11px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 3px 10px rgba(245,158,11,0.3); transition:transform 0.15s;"
                                onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fas fa-play"></i> Phát thử
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        bindGlobalEvents() {
            window.VipManager = this;
        }

        openModal(vipId = null) {
            this.editingId = vipId;
            this.tempSvgaData = null;
            this.tempAvatarData = null;

            const modal = document.getElementById('vip-mapping-modal');
            if (!modal) {
                console.error('[VIP Manager] Modal #vip-mapping-modal not found!');
                return;
            }

            const titleEl = document.getElementById('vip-modal-title');
            if (titleEl) {
                titleEl.innerHTML = vipId 
                    ? '✏️ Chỉnh Sửa User VIP Vinh Danh' 
                    : '👑 Thêm User VIP Vinh Danh Mới';
            }

            // Populate Owned / Custom Effects Selector
            const effectSelect = document.getElementById('vip-form-effect-select');
            if (effectSelect) {
                const effects = this.getAvailableEffects();
                effectSelect.innerHTML = effects.map(e => {
                    const id = e._id || e.id;
                    const icon = e.icon || '🎬';
                    return `<option value="${id}">${icon} ${e.name}</option>`;
                }).join('');
            }

            // Populate Frame Selector
            const frameSelect = document.getElementById('vip-form-frame-preset');
            if (frameSelect) {
                frameSelect.innerHTML = `
                    ${this.presetFrames.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                    <option value="custom_svga">📁 Tải file khung .svga từ máy tính...</option>
                `;
            }

            if (vipId) {
                const item = this.mappings.find(m => m.id === vipId);
                if (item) {
                    this.fillForm(item);
                }
            } else {
                this.resetForm();
            }

            const searchInput = document.getElementById('vip-user-search-input');
            if (searchInput) searchInput.value = '';
            this.searchTikTokUsers('');

            this.updatePreview();
            modal.style.setProperty('display', 'flex', 'important');
        }

        closeModal() {
            const modal = document.getElementById('vip-mapping-modal');
            if (modal) modal.style.setProperty('display', 'none', 'important');
            this.editingId = null;
            this.tempSvgaData = null;
            this.tempAvatarData = null;
        }

        setVal(id, val) {
            const el = document.getElementById(id);
            if (el) el.value = (val !== undefined && val !== null) ? val : '';
        }

        setChecked(id, checked) {
            const el = document.getElementById(id);
            if (el) el.checked = !!checked;
        }

        setGlowColor(color) {
            this.setVal('vip-form-glow-color', color);
            this.updatePreview();
        }

        resetCustomCoords() {
            const frameVal = document.getElementById('vip-form-frame-preset')?.value || 'frame_ho_trang';
            let avatarTop = 48.5;
            let ribbonTop = 80;
            let avatarSize = 58;

            if (frameVal === 'frame_love') {
                avatarTop = 47.5;
                ribbonTop = 78;
                avatarSize = 58;
            } else if (frameVal === 'frame_rong_bang') {
                avatarTop = 48.5;
                ribbonTop = 79.5;
                avatarSize = 58;
            } else if (frameVal === 'frame_rong_lua') {
                avatarTop = 49;
                ribbonTop = 80;
                avatarSize = 58;
            }

            this.setVal('vip-form-pos-x', 50);
            this.setVal('vip-form-avatar-x', 50);
            this.setVal('vip-form-avatar-y', avatarTop);
            this.setVal('vip-form-avatar-size', avatarSize);
            this.setVal('vip-form-name-x', 50);
            this.setVal('vip-form-name-y', ribbonTop);
            this.setVal('vip-form-name-size', 8);
            this.updatePreview();
        }

        fillForm(item) {
            this.setVal('vip-form-username', item.username || '');
            this.setVal('vip-form-display-name', item.displayName || '');
            this.setVal('vip-form-effect-select', item.effectId || '');
            this.setVal('vip-form-pos-x', item.positionX !== undefined ? item.positionX : 50);
            this.setVal('vip-form-pos-y', item.positionY !== undefined ? item.positionY : 50);
            this.setVal('vip-form-scale', item.scale !== undefined ? item.scale : 144);
            this.setVal('vip-form-avatar-x', item.avatarCustomX !== undefined ? item.avatarCustomX : 50);
            this.setVal('vip-form-avatar-y', item.avatarCustomY !== undefined ? item.avatarCustomY : 48.5);
            this.setVal('vip-form-avatar-size', item.avatarCustomSize !== undefined ? item.avatarCustomSize : 58);
            this.setVal('vip-form-name-x', item.nameCustomX !== undefined ? item.nameCustomX : 50);
            this.setVal('vip-form-name-y', item.nameCustomY !== undefined ? item.nameCustomY : 80);
            this.setVal('vip-form-name-size', item.nameCustomSize !== undefined ? item.nameCustomSize : 8);
            this.setVal('vip-form-glow-color', item.glowColor || '#fbbf24');
            this.setVal('vip-form-glow-blur', item.glowBlur !== undefined ? item.glowBlur : 30);
            this.setVal('vip-form-animation', item.animationStyle || 'royal_pop');
            this.setVal('vip-form-appear-lead-time', item.appearLeadTimeSec !== undefined ? item.appearLeadTimeSec : 2.0);
            this.setVal('vip-form-display-duration', item.displayDurationSec || 4);
            this.setChecked('vip-form-trigger-join', item.triggerOnJoin !== false);
            this.setChecked('vip-form-trigger-gift', item.triggerOnGift !== false);
            this.setVal('vip-form-cooldown', item.cooldownMinutes || 5);

            // Frame
            if (item.frameSourceType === 'custom_svga' && item.frameUrl) {
                this.setVal('vip-form-frame-preset', 'custom_svga');
                this.toggleFrameSource('custom_svga');
                this.tempSvgaData = { url: item.frameUrl, name: item.frameName };
                const label = document.getElementById('vip-custom-svga-name');
                if (label) label.textContent = item.frameName || 'File .svga tùy chỉnh';
            } else {
                this.setVal('vip-form-frame-preset', item.frameUrl || 'frame_ho_trang');
                this.toggleFrameSource(item.frameUrl || 'frame_ho_trang');
            }

            if (item.customAvatar) {
                this.tempAvatarData = item.customAvatar;
                const urlInput = document.getElementById('vip-form-avatar-url');
                if (urlInput) urlInput.value = item.customAvatar.startsWith('http') ? item.customAvatar : '';
            }

            this.updateRangeLabels();
        }

        resetForm() {
            this.setVal('vip-form-username', '');
            this.setVal('vip-form-display-name', '');
            this.setVal('vip-form-pos-x', 50);
            this.setVal('vip-form-pos-y', 50);
            this.setVal('vip-form-scale', 144);
            this.setVal('vip-form-avatar-x', 50);
            this.setVal('vip-form-avatar-y', 48.5);
            this.setVal('vip-form-avatar-size', 58);
            this.setVal('vip-form-name-x', 50);
            this.setVal('vip-form-name-y', 80);
            this.setVal('vip-form-name-size', 8);
            this.setVal('vip-form-glow-color', '#fbbf24');
            this.setVal('vip-form-glow-blur', 30);
            this.setVal('vip-form-animation', 'royal_pop');
            this.setVal('vip-form-appear-lead-time', 2.0);
            this.setVal('vip-form-display-duration', 4);
            this.setChecked('vip-form-trigger-join', true);
            this.setChecked('vip-form-trigger-gift', true);
            this.setVal('vip-form-cooldown', 5);
            this.setVal('vip-form-frame-preset', 'frame_ho_trang');
            this.toggleFrameSource('frame_ho_trang');
            this.tempAvatarData = null;
            const urlInput = document.getElementById('vip-form-avatar-url');
            if (urlInput) urlInput.value = '';
            const fileInput = document.getElementById('vip-form-avatar-file');
            if (fileInput) fileInput.value = '';
            this.updateRangeLabels();
        }

        toggleFrameSource(val) {
            const customBox = document.getElementById('vip-frame-custom-box');
            if (val === 'custom_svga') {
                if (customBox) customBox.style.display = 'block';
            } else {
                if (customBox) customBox.style.display = 'none';
            }
            this.updatePreview();
        }

        handleSvgaFileSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            this.tempSvgaData = { url, name: file.name };
            const label = document.getElementById('vip-custom-svga-name');
            if (label) label.textContent = `✅ ${file.name}`;
            this.updatePreview();
        }

        handleAvatarFileSelect(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.tempAvatarData = ev.target.result;
                const urlInput = document.getElementById('vip-form-avatar-url');
                if (urlInput) urlInput.value = '';
                this.updatePreview();
            };
            reader.readAsDataURL(file);
        }

        onAvatarUrlInput(val) {
            const url = (val || '').trim();
            this.tempAvatarData = url || null;
            this.updatePreview();
        }

        updateRangeLabels() {
            const posX = document.getElementById('vip-form-pos-x')?.value || 50;
            const posY = document.getElementById('vip-form-pos-y')?.value || 50;
            const scale = document.getElementById('vip-form-scale')?.value || 144;
            const avatarX = document.getElementById('vip-form-avatar-x')?.value || 50;
            const avatarY = document.getElementById('vip-form-avatar-y')?.value || 48.5;
            const avatarSize = document.getElementById('vip-form-avatar-size')?.value || 58;
            const nameX = document.getElementById('vip-form-name-x')?.value || 50;
            const nameY = document.getElementById('vip-form-name-y')?.value || 80;
            const nameSize = document.getElementById('vip-form-name-size')?.value || 8;
            const glowBlur = document.getElementById('vip-form-glow-blur')?.value || 30;

            const posXLabel = document.getElementById('vip-pos-x-val');
            const posYLabel = document.getElementById('vip-pos-y-val');
            const scaleLabel = document.getElementById('vip-scale-val');
            const avatarXLabel = document.getElementById('vip-avatar-x-val');
            const avatarYLabel = document.getElementById('vip-avatar-y-val');
            const avatarSizeLabel = document.getElementById('vip-avatar-size-val');
            const nameXLabel = document.getElementById('vip-name-x-val');
            const nameYLabel = document.getElementById('vip-name-y-val');
            const nameSizeLabel = document.getElementById('vip-name-size-val');
            const glowBlurLabel = document.getElementById('vip-glow-blur-val');

            if (posXLabel) posXLabel.textContent = `${posX}%`;
            if (posYLabel) posYLabel.textContent = `${posY}%`;
            if (scaleLabel) scaleLabel.textContent = `${scale}%`;
            if (avatarXLabel) avatarXLabel.textContent = `${avatarX}%`;
            if (avatarYLabel) avatarYLabel.textContent = `${avatarY}%`;
            if (avatarSizeLabel) avatarSizeLabel.textContent = `${avatarSize}px`;
            if (nameXLabel) nameXLabel.textContent = `${nameX}%`;
            if (nameYLabel) nameYLabel.textContent = `${nameY}%`;
            if (nameSizeLabel) nameSizeLabel.textContent = `${nameSize}px`;
            if (glowBlurLabel) glowBlurLabel.textContent = `${glowBlur}px`;
        }

        onUsernameInput(val) {
            const clean = (val || '').trim().replace(/^@+/, '');
            const nameInput = document.getElementById('vip-form-display-name');
            if (nameInput) {
                if (!nameInput.value || nameInput.dataset.autoFilled === 'true') {
                    nameInput.value = clean ? clean : '';
                    nameInput.dataset.autoFilled = 'true';
                }
            }

            this.tryResolveTikTokProfile(clean);
            this.updatePreview();
        }

        async fetchTikTokProfileDirectly() {
            const usernameInput = document.getElementById('vip-form-username');
            const clean = (usernameInput?.value || '').trim().replace(/^@+/, '');
            if (!clean) {
                if (window.app?.showNotification) window.app.showNotification('Vui lòng nhập ID TikTok trước!', 'warning');
                return;
            }

            if (window.app?.showNotification) window.app.showNotification(`🔍 Đang tải thông tin @${clean} từ TikTok...`, 'info');
            await this.tryResolveTikTokProfile(clean, true);
        }

        async tryResolveTikTokProfile(clean, forceLiveFetch = false) {
            if (!clean) return;
            const key = clean.toLowerCase();

            // 1. Check local cache first unless forced
            if (!forceLiveFetch) {
                try {
                    const cachedUsers = JSON.parse(localStorage.getItem('liveflow_seen_tiktok_users') || '{}');
                    if (cachedUsers[key] && cachedUsers[key].avatar && !cachedUsers[key].avatar.includes('ui-avatars.com')) {
                        const info = cachedUsers[key];
                        if (info.avatar && !this.tempAvatarData) {
                            this.tempAvatarData = info.avatar;
                        }
                        const nameInput = document.getElementById('vip-form-display-name');
                        if (nameInput && (nameInput.dataset.autoFilled === 'true' || !nameInput.value) && info.nickname) {
                            nameInput.value = info.nickname;
                        }
                        this.updatePreview();
                        return;
                    }
                } catch (_e) {}
            }

            // 2. Fetch live TikTok profile using Electron Chromium Engine
            if (this._fetchDebounceTimer) clearTimeout(this._fetchDebounceTimer);
            const delay = forceLiveFetch ? 0 : 600;

            this._fetchDebounceTimer = setTimeout(async () => {
                let foundAvatar = '';
                let foundNickname = '';

                try {
                    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
                        const res = await window.electronAPI.invoke('tiktok:fetch-profile', clean);
                        if (res && res.success && res.user) {
                            foundAvatar = res.user.avatar || '';
                            foundNickname = res.user.nickname || '';
                        }
                    }
                } catch (e) {
                    console.warn('Electron IPC TikTok fetch error:', e);
                }

                // Web fallback
                if (!foundAvatar) {
                    try {
                        const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                            }
                        });
                        if (res.ok) {
                            const html = await res.text();
                            const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
                            if (match) {
                                const data = JSON.parse(match[1]);
                                const user = data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo?.user;
                                if (user) {
                                    foundAvatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || '';
                                    foundNickname = user.nickname || user.uniqueId || '';
                                }
                            }
                            if (!foundAvatar) {
                                const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/);
                                if (ogImg) foundAvatar = ogImg[1];
                                const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
                                if (ogTitle) foundNickname = ogTitle[1].replace(/\s*\(@[^\)]+\).*$/, '').trim();
                            }
                        }
                    } catch (_err) {}
                }

                if (foundAvatar) {
                    this.tempAvatarData = foundAvatar;
                    const nameInput = document.getElementById('vip-form-display-name');
                    if (nameInput && (nameInput.dataset.autoFilled === 'true' || !nameInput.value) && foundNickname) {
                        nameInput.value = foundNickname;
                    }

                    // Save to cache for instant future lookup
                    try {
                        const cachedUsers = JSON.parse(localStorage.getItem('liveflow_seen_tiktok_users') || '{}');
                        cachedUsers[key] = { nickname: foundNickname || clean, avatar: foundAvatar };
                        localStorage.setItem('liveflow_seen_tiktok_users', JSON.stringify(cachedUsers));
                    } catch (_e) {}

                    this.updatePreview();
                    if (window.app?.showNotification) {
                        window.app.showNotification(`✅ Đã kết nối TikTok & nạp thành công Avatar của ${foundNickname || clean}!`, 'success');
                    }
                } else if (forceLiveFetch && window.app?.showNotification) {
                    window.app.showNotification(`Không thể tự động tải tài khoản @${clean} từ TikTok. Bạn có thể chọn file ảnh hoặc dán link ảnh!`, 'warning');
                }
            }, delay);
        }

        onFrameChange(val) {
            this.toggleFrameSource(val);
            const found = this.presetFrames.find(f => f.id === val);
            if (found && found.color) {
                this.setVal('vip-form-glow-color', found.color);
            }
            this.resetCustomCoords();
        }

        updatePreview() {
            this.updateRangeLabels();
            const username = document.getElementById('vip-form-username')?.value.trim() || '@dai_gia_vip';
            const cleanUser = username.replace(/^@+/, '') || 'VIP';
            const displayName = document.getElementById('vip-form-display-name')?.value.trim() || cleanUser;
            const posX = parseInt(document.getElementById('vip-form-pos-x')?.value || 50);
            const posY = parseInt(document.getElementById('vip-form-pos-y')?.value || 50);
            const scale = parseInt(document.getElementById('vip-form-scale')?.value || 144) / 100;
            const avatarX = parseFloat(document.getElementById('vip-form-avatar-x')?.value || 50);
            const avatarY = parseFloat(document.getElementById('vip-form-avatar-y')?.value || 48.5);
            const avatarSize = parseInt(document.getElementById('vip-form-avatar-size')?.value || 58);
            const nameX = parseFloat(document.getElementById('vip-form-name-x')?.value || 50);
            const nameY = parseFloat(document.getElementById('vip-form-name-y')?.value || 80);
            const nameSize = parseInt(document.getElementById('vip-form-name-size')?.value || 8);
            const glowColor = document.getElementById('vip-form-glow-color')?.value || '#fbbf24';
            const glowBlur = parseInt(document.getElementById('vip-form-glow-blur')?.value || 30);

            const previewTarget = document.getElementById('vip-preview-avatar-target');
            const previewName = document.getElementById('vip-preview-name');
            const previewImg = document.getElementById('vip-preview-img');
            const previewFrameImg = document.getElementById('vip-preview-frame-img');
            const previewBackdropGlow = document.getElementById('vip-preview-backdrop-aura');

            // Name sits directly on the frame's ribbon banner
            if (previewName) {
                previewName.textContent = displayName;
                previewName.style.left = `${nameX}%`;
                previewName.style.top = `${nameY}%`;
                previewName.style.fontSize = `${nameSize}px`;
                previewName.style.bottom = 'auto';
            }

            if (previewImg) {
                previewImg.src = this.tempAvatarData || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanUser)}&background=1e293b&color=fbbf24&bold=true&font-size=0.42`;
                previewImg.style.left = `${avatarX}%`;
                previewImg.style.top = `${avatarY}%`;
                previewImg.style.width = `${avatarSize}px`;
                previewImg.style.height = `${avatarSize}px`;
            }

            // Real VIP Frame overlay (Supports WebM animated frame video and PNG static frame)
            const frameVal = document.getElementById('vip-form-frame-preset')?.value || 'frame_ho_trang';
            const foundPreset = this.presetFrames.find(f => f.id === frameVal);
            const frameVideo = document.getElementById('vip-preview-frame-video');
            const targetUrl = foundPreset?.url || (frameVal === 'custom_svga' && this.tempSvgaData?.url) || '';

            if (targetUrl.endsWith('.webm') || targetUrl.endsWith('.mp4')) {
                if (frameVideo) {
                    if (!frameVideo.src.includes(targetUrl)) {
                        frameVideo.src = targetUrl;
                    }
                    frameVideo.style.display = 'block';
                    frameVideo.play().catch(() => {});
                }
                if (previewFrameImg) previewFrameImg.style.display = 'none';
            } else if (targetUrl) {
                if (previewFrameImg) {
                    previewFrameImg.src = targetUrl;
                    previewFrameImg.style.display = 'block';
                }
                if (frameVideo) {
                    frameVideo.style.display = 'none';
                    frameVideo.pause();
                }
            } else {
                if (previewFrameImg) previewFrameImg.style.display = 'none';
                if (frameVideo) {
                    frameVideo.style.display = 'none';
                    frameVideo.pause();
                }
            }

            // Vibrant, snug ambient backdrop halo & shadow (Rõ ràng, đẹp mắt, ôm sát khung)
            if (previewBackdropGlow) {
                const blurPx = Math.max(6, Math.min(22, Math.round(glowBlur * 0.45)));
                previewBackdropGlow.style.background = `radial-gradient(circle at 50% 50%, ${glowColor}ee 0%, ${glowColor}77 42%, ${glowColor}22 62%, transparent 74%)`;
                previewBackdropGlow.style.filter = `blur(${blurPx}px)`;
                previewBackdropGlow.style.transform = `scale(1.02)`;
                previewBackdropGlow.style.opacity = '0.95';
            }

            if (previewTarget) {
                previewTarget.style.left = `${posX}%`;
                previewTarget.style.top = `${posY}%`;
                previewTarget.style.transform = `translate(-50%, -50%) scale(${scale})`;

                const motionBox = document.getElementById('vip-preview-motion-box') || previewTarget;
                const anim = document.getElementById('vip-form-animation')?.value || 'royal_pop';
                const animClass = `preview-anim-${anim}`;

                // Trigger or replay animation on preview
                if (this._lastPreviewAnim !== anim) {
                    this._lastPreviewAnim = anim;
                    motionBox.className = '';
                    void motionBox.offsetWidth;
                    motionBox.className = animClass;
                } else if (!motionBox.className) {
                    motionBox.className = animClass;
                }
            }

            // Update effect info badge in modal
            const effectSelect = document.getElementById('vip-form-effect-select');
            const effectBadge = document.getElementById('vip-selected-effect-badge');
            if (effectSelect && effectBadge) {
                const opt = effectSelect.options[effectSelect.selectedIndex];
                effectBadge.textContent = opt ? opt.text : 'Chưa chọn hiệu ứng';
            }
        }

        replayPreviewAnimation() {
            const motionBox = document.getElementById('vip-preview-motion-box') || document.getElementById('vip-preview-avatar-target');
            if (motionBox) {
                const anim = document.getElementById('vip-form-animation')?.value || 'royal_pop';
                const animClass = `preview-anim-${anim}`;
                motionBox.className = '';
                void motionBox.offsetWidth;
                motionBox.className = animClass;
            }
        }

        saveVip() {
            const username = document.getElementById('vip-form-username')?.value.trim();
            if (!username) {
                alert('Vui lòng nhập ID TikTok (@username) của người dùng!');
                return;
            }

            const displayName = document.getElementById('vip-form-display-name')?.value.trim() || username;
            
            // Get selected Effect
            const effectSelect = document.getElementById('vip-form-effect-select');
            const effectId = effectSelect ? effectSelect.value : '';
            const effectOpt = effectSelect && effectSelect.selectedIndex >= 0 ? effectSelect.options[effectSelect.selectedIndex] : null;
            const effectName = effectOpt ? effectOpt.text : 'Hiệu Ứng Vinh Danh';

            if (!effectId) {
                alert('Vui lòng chọn 1 hiệu ứng vinh danh từ danh sách đã sở hữu / tự upload!');
                return;
            }

            // Frame & Glow
            const frameVal = document.getElementById('vip-form-frame-preset')?.value || 'frame_ho_trang';
            let frameSourceType = 'preset';
            let frameUrl = frameVal;
            let frameName = 'Khung Viền Sáng';

            if (frameVal === 'custom_svga') {
                frameSourceType = 'custom_svga';
                frameUrl = this.tempSvgaData ? this.tempSvgaData.url : '';
                frameName = this.tempSvgaData ? this.tempSvgaData.name : 'Khung SVGA Tùy Chỉnh';
            } else {
                const found = this.presetFrames.find(f => f.id === frameVal);
                if (found) frameName = found.name;
            }

            const posX = parseInt(document.getElementById('vip-form-pos-x')?.value || 50);
            const posY = parseInt(document.getElementById('vip-form-pos-y')?.value || 50);
            const scale = parseInt(document.getElementById('vip-form-scale')?.value || 144);
            const avatarCustomX = parseFloat(document.getElementById('vip-form-avatar-x')?.value || 50);
            const avatarCustomY = parseFloat(document.getElementById('vip-form-avatar-y')?.value || 48.5);
            const avatarCustomSize = parseInt(document.getElementById('vip-form-avatar-size')?.value || 58);
            const nameCustomX = parseFloat(document.getElementById('vip-form-name-x')?.value || 50);
            const nameCustomY = parseFloat(document.getElementById('vip-form-name-y')?.value || 80);
            const nameCustomSize = parseInt(document.getElementById('vip-form-name-size')?.value || 8);
            const glowColor = document.getElementById('vip-form-glow-color')?.value || '#fbbf24';
            const glowBlur = parseInt(document.getElementById('vip-form-glow-blur')?.value || 30);
            const animationStyle = document.getElementById('vip-form-animation')?.value || 'royal_pop';
            const appearLeadTimeSec = parseFloat(document.getElementById('vip-form-appear-lead-time')?.value ?? 2.0);
            const displayDurationSec = parseInt(document.getElementById('vip-form-display-duration')?.value || 4);
            const triggerOnJoin = document.getElementById('vip-form-trigger-join')?.checked !== false;
            const triggerOnGift = document.getElementById('vip-form-trigger-gift')?.checked !== false;
            const cooldownMinutes = parseInt(document.getElementById('vip-form-cooldown')?.value || 5);

            const vipData = {
                id: this.editingId || `vip_${Date.now()}`,
                username: username.startsWith('@') ? username : `@${username}`,
                displayName,
                customAvatar: this.tempAvatarData || '',
                effectId,
                effectName,
                frameSourceType,
                frameUrl,
                frameName,
                glowColor,
                glowBlur,
                animationStyle,
                appearLeadTimeSec,
                displayDurationSec,
                positionX: posX,
                positionY: posY,
                scale,
                avatarCustomX,
                avatarCustomY,
                avatarCustomSize,
                nameCustomX,
                nameCustomY,
                nameCustomSize,
                triggerOnJoin,
                triggerOnGift,
                cooldownMinutes,
                updatedAt: new Date().toISOString()
            };

            if (this.editingId) {
                const idx = this.mappings.findIndex(m => m.id === this.editingId);
                if (idx !== -1) {
                    this.mappings[idx] = vipData;
                }
            } else {
                this.mappings.unshift(vipData);
            }

            this.save();
            this.closeModal();

            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification(`Đã lưu hiệu ứng vinh danh cho ${vipData.displayName}!`, 'success');
            }
        }

        deleteVip(id) {
            const item = this.mappings.find(m => m.id === id);
            const name = item ? item.displayName || item.username : 'User này';
            if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình vinh danh của ${name}?`)) {
                return;
            }
            this.mappings = this.mappings.filter(m => m.id !== id);
            this.save();
        }

        // Retrieve and search TikTok users matching Screenshot 2
        searchTikTokUsers(query = '') {
            const cleanQuery = (query || '').trim().toLowerCase().replace(/^@+/, '');
            let results = [];

            // 1. Get from localStorage cached seen live users
            try {
                const cached = JSON.parse(localStorage.getItem('liveflow_seen_tiktok_users') || '{}');
                for (const [key, val] of Object.entries(cached)) {
                    if (!cleanQuery || key.includes(cleanQuery) || (val.nickname || '').toLowerCase().includes(cleanQuery)) {
                        results.push({
                            username: `@${key}`,
                            nickname: val.nickname || key,
                            avatar: val.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(key)}&background=1e293b&color=fbbf24&bold=true`
                        });
                    }
                }
            } catch (e) {}

            // Sample defaults if empty
            if (results.length === 0 && !cleanQuery) {
                results = [
                    { username: '@yeucoba26', nickname: 'Zin LongPhuong', avatar: 'https://ui-avatars.com/api/?name=Zin+LongPhuong&background=1e293b&color=fbbf24&bold=true' },
                    { username: '@vuvujoker', nickname: 'Yu Vũ', avatar: 'https://ui-avatars.com/api/?name=Yu+Vu&background=1e293b&color=38bdf8&bold=true' },
                    { username: '@tienduan23456', nickname: 'Trịnh Tiến Duẩn', avatar: 'https://ui-avatars.com/api/?name=Tien+Duan&background=1e293b&color=4ade80&bold=true' },
                    { username: '@nolac678', nickname: 'RUN', avatar: 'https://ui-avatars.com/api/?name=RUN&background=1e293b&color=f472b6&bold=true' }
                ];
            }

            // 2. If query is not empty and not in cached, offer quick custom add and fetch profile
            if (cleanQuery) {
                const exists = results.some(r => r.username.toLowerCase().replace(/^@+/, '') === cleanQuery);
                if (!exists) {
                    results.unshift({
                        username: `@${cleanQuery}`,
                        nickname: cleanQuery,
                        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanQuery)}&background=1e293b&color=fbbf24&bold=true`,
                        isCustomNew: true
                    });
                }

                // Proactively resolve live TikTok profile in background
                if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
                    if (this._searchDebounce) clearTimeout(this._searchDebounce);
                    this._searchDebounce = setTimeout(async () => {
                        try {
                            const res = await window.electronAPI.invoke('tiktok:fetch-profile', cleanQuery);
                            if (res && res.success && res.user && res.user.avatar) {
                                const cached = JSON.parse(localStorage.getItem('liveflow_seen_tiktok_users') || '{}');
                                cached[cleanQuery] = {
                                    nickname: res.user.nickname || cleanQuery,
                                    avatar: res.user.avatar
                                };
                                localStorage.setItem('liveflow_seen_tiktok_users', JSON.stringify(cached));
                                this.searchTikTokUsers(cleanQuery);
                            }
                        } catch (_e) {}
                    }, 400);
                }
            }

            this.renderUserSearchResults(results);
        }

        renderUserSearchResults(users) {
            const container = document.getElementById('vip-user-search-list');
            if (!container) return;

            if (!users || users.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:16px; color:#64748b; font-size:11px;">
                        Chưa có người dùng nào. Hãy gõ tên/ID TikTok vào ô tìm kiếm để thêm!
                    </div>
                `;
                return;
            }

            container.innerHTML = users.map((u) => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); transition:all 0.15s; margin-bottom:6px;"
                    onmouseover="this.style.background='rgba(251,191,36,0.08)'; this.style.borderColor='rgba(251,191,36,0.25)';"
                    onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.06)';">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <img src="${u.avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1px solid rgba(251,191,36,0.3); background:#1e293b; flex-shrink:0;"
                            onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.nickname)}&background=1e293b&color=fbbf24&bold=true'">
                        <div style="display:flex; flex-direction:column; min-width:0;">
                            <span style="font-size:12px; font-weight:800; color:#fff; line-height:1.2; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${u.nickname}</span>
                            <span style="font-size:10px; color:#94a3b8; font-family:monospace; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${u.username}</span>
                        </div>
                    </div>
                    <button type="button" onclick="VipManager.selectUser('${encodeURIComponent(JSON.stringify(u))}')"
                        style="background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.4); color:#fbbf24; padding:5px 12px; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer; transition:all 0.15s; flex-shrink:0;"
                        onmouseover="this.style.background='#fbbf24'; this.style.color='#000';"
                        onmouseout="this.style.background='rgba(251,191,36,0.15)'; this.style.color='#fbbf24';">
                        ${u.isCustomNew ? '+ Thêm' : 'Thêm'}
                    </button>
                </div>
            `).join('');
        }

        async selectUser(encodedUserJson) {
            try {
                const u = JSON.parse(decodeURIComponent(encodedUserJson));
                const usernameInput = document.getElementById('vip-form-username');
                const nameInput = document.getElementById('vip-form-display-name');

                const clean = (u.username || '').replace(/^@+/, '');
                if (usernameInput) usernameInput.value = u.username.startsWith('@') ? u.username : `@${u.username}`;
                if (nameInput) {
                    nameInput.value = u.nickname || clean;
                    nameInput.dataset.autoFilled = 'true';
                }

                if (u.avatar && !u.avatar.includes('ui-avatars.com')) {
                    this.tempAvatarData = u.avatar;
                }

                this.updatePreview();

                // Proactively resolve live TikTok avatar
                if (!this.tempAvatarData || this.tempAvatarData.includes('ui-avatars.com')) {
                    await this.tryResolveTikTokProfile(clean, true);
                }

                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification(`Đã chọn: ${u.nickname} (${u.username})`, 'success');
                }
            } catch (e) {
                console.error('[Select User Error]', e);
            }
        }

        async testPlay(id, event) {
            const item = this.mappings.find(m => m.id === id);
            if (!item) return;

            const btn = event?.currentTarget || document.querySelector(`button[data-vip-test-id="${id}"]`);
            return this.testPlayItem(item, btn);
        }

        async testPlayItem(item, btn) {
            if (!item || !item.effectId) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('Không tìm thấy hiệu ứng để phát thử!', 'warning');
                }
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang phát...';
            }

            try {
                const token = window.app?.authToken || localStorage.getItem('token');
                const apiUrl = window.app?.API_URL || 'http://127.0.0.1:9000';
                
                const itemWithTest = { ...item, isVipTest: true };

                // 1. Send VIP honor intent over WebSocket directly so overlay is primed
                if (window.app?.ws && window.app.ws.readyState === WebSocket.OPEN) {
                    const vipPayload = {
                        isVipHonor: true,
                        isVipTest: true,
                        vipInfo: itemWithTest,
                        effectId: item.effectId
                    };
                    window.app.ws.send(JSON.stringify({
                        event: 'vip_honor_playback_request',
                        data: vipPayload
                    }));
                }

                // 2. Trigger preview via standard effect player route (issues token, brings up effect_player source)
                const res = await fetch(`${apiUrl}/api/obs/preview-effect-player`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        effectId: item.effectId,
                        isVipHonor: true,
                        isVipTest: true,
                        vipInfo: itemWithTest
                    })
                });

                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'Không thể kích hoạt hiệu ứng vinh danh.');
                }

                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification(`🎬 Đang phát thử vinh danh ${item.displayName}!`, 'success');
                }
            } catch (err) {
                console.error('[VIP Test Play Error]', err);
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification(err.message || 'Lỗi phát thử vinh danh VIP', 'error');
                }
            } finally {
                if (btn) {
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-play"></i> Phát thử';
                    }, 3000);
                }
            }
        }

        // Test VIP using current unsaved modal inputs
        async testCurrentModalVip(btn) {
            const username = document.getElementById('vip-form-username')?.value.trim() || '@VIP';
            const displayName = document.getElementById('vip-form-display-name')?.value.trim() || username;
            const effectId = document.getElementById('vip-form-effect-select')?.value || document.getElementById('vip-form-effect')?.value;
            if (!effectId) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('Vui lòng chọn hiệu ứng trước khi phát thử!', 'warning');
                }
                return;
            }

            const frameVal = document.getElementById('vip-form-frame-preset')?.value || 'frame_ho_trang';
            let frameSourceType = 'preset';
            let frameUrl = frameVal;
            let frameName = 'Khung Viền Sáng';

            if (frameVal === 'custom_svga') {
                frameSourceType = 'custom_svga';
                frameUrl = this.tempSvgaData ? this.tempSvgaData.url : '';
                frameName = this.tempSvgaData ? this.tempSvgaData.name : 'Khung SVGA';
            } else {
                const found = this.presetFrames.find(f => f.id === frameVal);
                if (found) frameName = found.name;
            }

            const posX = parseInt(document.getElementById('vip-form-pos-x')?.value || 50);
            const posY = parseInt(document.getElementById('vip-form-pos-y')?.value || 50);
            const scale = parseInt(document.getElementById('vip-form-scale')?.value || 144);
            const avatarCustomX = parseFloat(document.getElementById('vip-form-avatar-x')?.value || 50);
            const avatarCustomY = parseFloat(document.getElementById('vip-form-avatar-y')?.value || 48.5);
            const avatarCustomSize = parseInt(document.getElementById('vip-form-avatar-size')?.value || 58);
            const nameCustomX = parseFloat(document.getElementById('vip-form-name-x')?.value || 50);
            const nameCustomY = parseFloat(document.getElementById('vip-form-name-y')?.value || 80);
            const nameCustomSize = parseInt(document.getElementById('vip-form-name-size')?.value || 8);
            const glowColor = document.getElementById('vip-form-glow-color')?.value || '#fbbf24';
            const glowBlur = parseInt(document.getElementById('vip-form-glow-blur')?.value || 30);
            const animationStyle = document.getElementById('vip-form-animation')?.value || 'royal_pop';
            const appearLeadTimeSec = parseFloat(document.getElementById('vip-form-appear-lead-time')?.value ?? 2.0);
            const displayDurationSec = parseInt(document.getElementById('vip-form-display-duration')?.value || 4);

            const tempItem = {
                id: this.editingId || `vip_preview_${Date.now()}`,
                username: username.startsWith('@') ? username : `@${username}`,
                displayName,
                customAvatar: this.tempAvatarData || '',
                effectId,
                effectName: document.getElementById('vip-form-effect-select')?.selectedOptions?.[0]?.text || 'Hiệu ứng VIP',
                frameSourceType,
                frameUrl,
                frameName,
                glowColor,
                glowBlur,
                animationStyle,
                appearLeadTimeSec,
                displayDurationSec,
                positionX: posX,
                positionY: posY,
                scale,
                avatarCustomX,
                avatarCustomY,
                avatarCustomSize,
                nameCustomX,
                nameCustomY,
                nameCustomSize,
                isVipTest: true
            };

            await this.testPlayItem(tempItem, btn);
        }

        // Check and trigger VIP Honor sequence on live TikTok events
        async handleLiveEvent(eventType, eventData) {
            if (!this.mappings || this.mappings.length === 0) return;
            if (!eventData) return;

            const username = (eventData.uniqueId || eventData.username || eventData.nickname || '').trim().toLowerCase().replace(/^@+/, '');
            if (!username) return;

            // Cache seen user info
            if (eventData.uniqueId || eventData.username) {
                const clean = (eventData.uniqueId || eventData.username).toLowerCase().replace(/^@+/, '');
                try {
                    const cached = JSON.parse(localStorage.getItem('liveflow_seen_tiktok_users') || '{}');
                    cached[clean] = {
                        nickname: eventData.nickname || clean,
                        avatar: eventData.profilePictureUrl || eventData.avatar || ''
                    };
                    localStorage.setItem('liveflow_seen_tiktok_users', JSON.stringify(cached));
                } catch (_e) {}
            }

            const matched = this.mappings.find(m => {
                const target = (m.username || '').toLowerCase().replace(/^@+/, '');
                return target === username;
            });

            if (!matched) return;

            // Check trigger rule
            if (eventType === 'member' && !matched.triggerOnJoin) return;
            if (eventType === 'gift' && !matched.triggerOnGift) return;

            // Check Cooldown
            if (!this.cooldownTracker) this.cooldownTracker = new Map();
            const cooldownMs = (matched.cooldownMinutes || 5) * 60 * 1000;
            const lastTrigger = this.cooldownTracker.get(matched.id) || 0;
            const now = Date.now();

            if (now - lastTrigger < cooldownMs) {
                const remainingMin = Math.ceil((cooldownMs - (now - lastTrigger)) / 60000);
                console.log(`[VIP Manager] User ${matched.username} is in cooldown (${remainingMin}m remaining). Skipping.`);
                return;
            }

            // Set cooldown
            this.cooldownTracker.set(matched.id, now);

            console.log(`👑 [VIP Trigger] User ${matched.displayName} triggered VIP Honor! (event: ${eventType})`);
            
            // Enrich with current live avatar if available
            const vipPayload = { ...matched };
            if (!vipPayload.customAvatar && eventData.profilePictureUrl) {
                vipPayload.customAvatar = eventData.profilePictureUrl;
            }

            try {
                const token = window.app?.authToken || localStorage.getItem('token');
                const apiUrl = window.app?.API_URL || 'http://127.0.0.1:9000';

                // 1. Broadcast VIP honor intent over WebSocket
                if (window.app?.ws && window.app.ws.readyState === WebSocket.OPEN) {
                    const wsPayload = {
                        isVipHonor: true,
                        vipInfo: vipPayload,
                        effectId: matched.effectId
                    };
                    window.app.ws.send(JSON.stringify({
                        event: 'vip_honor_playback_request',
                        data: wsPayload
                    }));
                    window.app.ws.send(JSON.stringify({
                        event: 'challenge_wheel_spin',
                        data: wsPayload
                    }));
                }

                // 2. Trigger preview-effect-player
                await fetch(`${apiUrl}/api/obs/preview-effect-player`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        effectId: matched.effectId,
                        vipInfo: vipPayload
                    })
                });
            } catch (err) {
                console.error('[VIP Live Trigger Error]', err);
            }
        }
    }

    // Auto initialize immediately and on DOM ready
    const mgr = new VipMappingManager();
    window.VipManager = mgr;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mgr.init());
    } else {
        mgr.init();
    }

})();

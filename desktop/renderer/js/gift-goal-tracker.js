(function () {
    class GiftGoalTracker {
        constructor() {
            this.API_URLS = ['http://127.0.0.1:9000', 'http://localhost:9000'];
            this.API_URL = this.API_URLS[0];
            this.WS_URL = 'ws://localhost:9001';
            this.LOCAL_KEY = 'es_goal_tracker_config_v3';
            this.initialized = false;
            this.ws = null;
            this.gifts = [];
            this.drag = null;
            this.goalApiUnavailable = false;
            this.state = {
                title: 'Muc tieu',
                goals: [],
                layout: {
                    canvasWidth: 1080,
                    canvasHeight: 1920,
                    x: 120,
                    y: 180,
                    width: 460,
                    height: 260
                },
                style: {
                    preset: 'neon',
                    glow: 1,
                    accentColor: '#b287ff'
                },
                previewZoom: 1
            };
        }

        normalizeLayout(layout = {}) {
            const canvasWidth = Math.max(320, parseInt(layout.canvasWidth, 10) || 1080);
            const canvasHeight = Math.max(568, parseInt(layout.canvasHeight, 10) || 1920);
            const width = Math.min(canvasWidth, Math.max(240, parseInt(layout.width, 10) || 460));
            const height = Math.min(canvasHeight, Math.max(140, parseInt(layout.height, 10) || 260));
            const x = Math.max(0, Math.min(canvasWidth - width, parseInt(layout.x, 10) || 120));
            const y = Math.max(0, Math.min(canvasHeight - height, parseInt(layout.y, 10) || 180));
            return { canvasWidth, canvasHeight, x, y, width, height };
        }

        resolveIconUrl(icon) {
            if (!icon) return '';
            const raw = String(icon).trim();
            if (!raw) return '';
            if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
            if (raw.startsWith('/')) return `${this.API_URL}${raw}`;
            if (raw.startsWith('assets/')) return `${this.API_URL}/${raw}`;
            if (raw.startsWith('file:///')) return '';
            if (/^[a-zA-Z]:[\\/]/.test(raw)) return '';
            return `${this.API_URL}/${raw}`;
        }

        async fetchJson(pathname, options = {}, behavior = {}) {
            if (behavior.goalApi && this.goalApiUnavailable && behavior.allowNotFound) {
                return null;
            }

            let lastError = null;
            for (const base of this.API_URLS) {
                try {
                    const response = await fetch(`${base}${pathname}`, options);
                    const text = await response.text();
                    let data = null;
                    try {
                        data = text ? JSON.parse(text) : null;
                    } catch (_error) {
                        const err = new Error(`API tra ve khong hop le (${response.status})`);
                        err.status = response.status;
                        throw err;
                    }

                    if (!response.ok) {
                        if (response.status === 404 && behavior.allowNotFound) {
                            if (behavior.goalApi) this.goalApiUnavailable = true;
                            return null;
                        }
                        const err = new Error(data?.error || data?.message || `HTTP ${response.status}`);
                        err.status = response.status;
                        throw err;
                    }

                    this.API_URL = base;
                    return data;
                } catch (error) {
                    lastError = error;
                }
            }
            if (behavior.goalApi && lastError?.status === 404) {
                this.goalApiUnavailable = true;
            }
            throw lastError || new Error('Khong ket noi duoc backend');
        }

        loadLocalConfig() {
            try {
                const raw = localStorage.getItem(this.LOCAL_KEY);
                if (!raw) return;
                const local = JSON.parse(raw);
                if (!local || typeof local !== 'object') return;
                this.state.title = local.title || this.state.title;
                this.state.goals = Array.isArray(local.goals) ? local.goals : [];
                this.state.layout = this.normalizeLayout(local.layout || this.state.layout);
                this.state.style = { ...this.state.style, ...(local.style || {}) };
                this.state.previewZoom = Math.max(0.6, Math.min(1.8, parseFloat(local.previewZoom || 1)));
            } catch (_error) {}
        }

        saveLocalConfig() {
            try {
                localStorage.setItem(this.LOCAL_KEY, JSON.stringify(this.state));
            } catch (_error) {}
        }

        init() {
            this.mount = document.getElementById('gift-goal-tracker-view');
            if (!this.mount) return;

            if (!this.initialized) {
                this.renderShell();
                this.bindEvents();
                this.connectWebSocket();
                this.initialized = true;
            }
            this.loadAll();
        }

        renderShell() {
            this.mount.innerHTML = `
                <div class="goal-tracker-page">
                    <div class="goal-tracker-header">
                        <h2>Bang Muc Tieu Qua Tang</h2>
                        <p>Thiet ke vi tri hien thi tren khung 9:16 va xuat OBS dong bo 1:1.</p>
                    </div>
                    <div class="goal-tracker-grid">
                        <section class="goal-card">
                            <h3>Cau hinh muc tieu</h3>
                            <label>Ten chien dich</label>
                            <input id="goal-title-input" class="goal-input" maxlength="60" placeholder="Mo qua dac biet" />
                            <div id="goal-rows" class="goal-rows"></div>
                            <button id="add-goal-btn" class="goal-btn goal-btn-dashed">+ Them qua muc tieu</button>
                            <div class="goal-actions">
                                <button id="save-goal-btn" class="goal-btn goal-btn-primary">Luu cau hinh</button>
                                <button id="reset-goal-btn" class="goal-btn goal-btn-ghost">Reset tien do</button>
                            </div>
                            <p class="goal-note">Overlay URL: http://localhost:9000/overlay/goal/</p>
                        </section>

                        <section class="goal-card">
                            <h3>Xem truoc 9:16</h3>
                            <div class="goal-layout-tools">
                                <label>W</label>
                                <input id="goal-layout-width" type="number" min="240" max="1080" step="1" />
                                <label>H</label>
                                <input id="goal-layout-height" type="number" min="140" max="1920" step="1" />
                                <label>X</label>
                                <input id="goal-layout-x" type="number" min="0" step="1" />
                                <label>Y</label>
                                <input id="goal-layout-y" type="number" min="0" step="1" />
                            </div>
                            <div class="goal-layout-tools goal-style-tools">
                                <label>FX</label>
                                <select id="goal-style-preset">
                                    <option value="neon">Neon Glow</option>
                                    <option value="aurora">Aurora Pulse</option>
                                    <option value="holo">Hologram</option>
                                    <option value="electric">Electric Ring</option>
                                    <option value="plasma">Plasma Core</option>
                                    <option value="sunset">Sunset Bloom</option>
                                </select>
                                <label>Glow</label>
                                <input id="goal-style-glow" type="range" min="0.4" max="2" step="0.1" />
                            </div>
                            <div class="goal-layout-tools goal-style-tools">
                                <label>Mau</label>
                                <input id="goal-style-accent" type="color" value="#b287ff" />
                                <label>Scale</label>
                                <input id="goal-preview-scale" type="range" min="0.6" max="1.8" step="0.05" />
                            </div>
                            <div class="goal-layout-tools goal-size-sliders">
                                <label>Do dai</label>
                                <input id="goal-layout-width-range" type="range" min="240" max="1080" step="1" />
                                <label>Do cao</label>
                                <input id="goal-layout-height-range" type="range" min="140" max="1920" step="1" />
                            </div>
                            <div id="goal-canvas" class="goal-preview-canvas">
                                <div id="goal-widget-preview" class="goal-widget-preview"></div>
                            </div>
                            <p class="goal-note">Keo widget de dat vi tri. Keo tay nam de doi do dai/do cao. Luu de OBS cap nhat.</p>
                        </section>
                    </div>
                </div>
            `;
        }

        async loadAll() {
            await Promise.all([this.loadGiftLibrary(), this.loadConfig()]);
            this.renderGoalRows();
            this.renderPreviewWidget();
        }

        async loadGiftLibrary() {
            try {
                const data = await this.fetchJson('/api/tiktok/gifts-library', { cache: 'no-store' });
                if (data?.success && Array.isArray(data.gifts)) {
                    this.gifts = data.gifts.map((gift) => ({
                        id: String(gift.id || ''),
                        name: gift.name || 'Gift',
                        icon: this.resolveIconUrl(gift.icon),
                        coins: gift.coins || 0
                    }));
                }
            } catch (_error) {
                if (!this.gifts.length) {
                    this.gifts = [
                        { id: 'rose', name: 'Rose', icon: '/assets/gift-icons/Rose.png', coins: 1 },
                        { id: 'tiktok', name: 'TikTok', icon: '/assets/gift-icons/TikTok.png', coins: 1 },
                        { id: 'corgi', name: 'Corgi', icon: '/assets/gift-icons/Corgi.png', coins: 50 }
                    ].map((gift) => ({ ...gift, icon: this.resolveIconUrl(gift.icon) }));
                }
                window.app?.showNotification?.('warning', 'Khong lay duoc gift catalog tu server, dang dung fallback');
            }
        }

        async loadConfig() {
            try {
                const data = await this.fetchJson('/api/tiktok/goal-tracker/config', { cache: 'no-store' }, { allowNotFound: true, goalApi: true });
                if (!data) {
                    this.loadLocalConfig();
                    return;
                }
                if (data?.success && data.config) {
                    this.state.title = data.config.title || this.state.title;
                    this.state.goals = Array.isArray(data.config.goals) ? data.config.goals.map((goal) => ({
                        ...goal,
                        giftIcon: this.resolveIconUrl(goal.giftIcon)
                    })) : [];
                    this.state.layout = this.normalizeLayout(data.config.layout || this.state.layout);
                    this.state.style = { ...this.state.style, ...(data.config.style || {}) };
                    this.saveLocalConfig();
                }
            } catch (_error) {
                this.loadLocalConfig();
            }
        }

        bindEvents() {
            this.mount.addEventListener('click', async (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (target.id === 'add-goal-btn') this.addGoalRow();
                if (target.classList.contains('goal-remove-btn')) {
                    const rowEl = target.closest('.goal-row');
                    const index = parseInt(rowEl?.dataset.index || '-1', 10);
                    if (index >= 0) {
                        this.state.goals.splice(index, 1);
                        this.renderGoalRows();
                        this.renderPreviewWidget();
                    }
                }
                if (target.id === 'save-goal-btn') await this.saveConfig();
                if (target.id === 'reset-goal-btn') await this.resetProgress();
            });

            this.mount.addEventListener('input', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;

                if (target.id === 'goal-title-input') {
                    this.state.title = target.value.trim() || 'Muc tieu';
                    this.renderPreviewWidget();
                    return;
                }

                if (target.classList.contains('goal-target-input')) {
                    const rowEl = target.closest('.goal-row');
                    const index = parseInt(rowEl?.dataset.index || '-1', 10);
                    if (index >= 0 && this.state.goals[index]) {
                        this.state.goals[index].target = Math.max(1, parseInt(target.value || '1', 10));
                        this.renderPreviewWidget();
                    }
                    return;
                }

                if (['goal-layout-width', 'goal-layout-height', 'goal-layout-x', 'goal-layout-y', 'goal-layout-width-range', 'goal-layout-height-range'].includes(target.id)) {
                    const widthInput = this.mount.querySelector('#goal-layout-width');
                    const heightInput = this.mount.querySelector('#goal-layout-height');
                    const widthRange = this.mount.querySelector('#goal-layout-width-range');
                    const heightRange = this.mount.querySelector('#goal-layout-height-range');
                    const xInput = this.mount.querySelector('#goal-layout-x');
                    const yInput = this.mount.querySelector('#goal-layout-y');
                    this.state.layout = this.normalizeLayout({
                        ...this.state.layout,
                        width: widthInput?.value || widthRange?.value,
                        height: heightInput?.value || heightRange?.value,
                        x: xInput?.value,
                        y: yInput?.value
                    });
                    this.renderPreviewWidget();
                    return;
                }

                if (target.id === 'goal-style-glow') {
                    this.state.style.glow = Math.max(0.4, Math.min(2, parseFloat(target.value || '1')));
                    this.renderPreviewWidget();
                }
                if (target.id === 'goal-preview-scale') {
                    this.state.previewZoom = Math.max(0.6, Math.min(1.8, parseFloat(target.value || '1')));
                    this.renderPreviewWidget();
                }
            });

            this.mount.addEventListener('change', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (target.classList.contains('goal-gift-select')) {
                    const rowEl = target.closest('.goal-row');
                    const index = parseInt(rowEl?.dataset.index || '-1', 10);
                    if (index >= 0 && this.state.goals[index]) {
                        const gift = this.gifts.find((item) => item.id === target.value);
                        if (gift) {
                            this.state.goals[index].giftId = gift.id;
                            this.state.goals[index].giftName = gift.name;
                            this.state.goals[index].giftIcon = gift.icon;
                            this.renderPreviewWidget();
                        }
                    }
                }
                if (target.id === 'goal-style-preset') {
                    this.state.style.preset = target.value || 'neon';
                    this.renderPreviewWidget();
                }
                if (target.id === 'goal-style-accent') {
                    this.state.style.accentColor = target.value || '#b287ff';
                    this.renderPreviewWidget();
                }
            });
        }

        bindDrag(widgetEl, scale) {
            widgetEl.onpointerdown = (event) => {
                if (!(event.target instanceof HTMLElement)) return;
                const mode = event.target.classList.contains('goal-resize-corner')
                    ? 'resize-corner'
                    : event.target.classList.contains('goal-resize-right')
                        ? 'resize-right'
                        : event.target.classList.contains('goal-resize-bottom')
                            ? 'resize-bottom'
                            : 'move';
                event.preventDefault();
                widgetEl.setPointerCapture(event.pointerId);
                this.drag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: this.state.layout.x,
                    originY: this.state.layout.y,
                    originWidth: this.state.layout.width,
                    originHeight: this.state.layout.height,
                    scale,
                    mode
                };
            };

            widgetEl.onpointermove = (event) => {
                if (!this.drag || this.drag.pointerId !== event.pointerId) return;
                const dx = (event.clientX - this.drag.startX) / this.drag.scale;
                const dy = (event.clientY - this.drag.startY) / this.drag.scale;
                const draft = { ...this.state.layout };
                if (this.drag.mode === 'move') {
                    draft.x = Math.round(this.drag.originX + dx);
                    draft.y = Math.round(this.drag.originY + dy);
                } else if (this.drag.mode === 'resize-right') {
                    draft.width = Math.round(this.drag.originWidth + dx);
                } else if (this.drag.mode === 'resize-bottom') {
                    draft.height = Math.round(this.drag.originHeight + dy);
                } else {
                    draft.width = Math.round(this.drag.originWidth + dx);
                    draft.height = Math.round(this.drag.originHeight + dy);
                }
                this.state.layout = this.normalizeLayout(draft);
                this.syncLayoutInputs();
                this.applyWidgetLayout(widgetEl, scale);
            };

            widgetEl.onpointerup = () => { this.drag = null; };
            widgetEl.onpointercancel = () => { this.drag = null; };
        }

        addGoalRow() {
            const fallbackGift = this.gifts[0] || { id: '', name: 'Gift', icon: '' };
            this.state.goals.push({
                id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                giftId: fallbackGift.id,
                giftName: fallbackGift.name,
                giftIcon: fallbackGift.icon,
                target: 100,
                current: 0
            });
            this.renderGoalRows();
            this.renderPreviewWidget();
        }

        renderGoalRows() {
            const titleInput = this.mount.querySelector('#goal-title-input');
            if (titleInput) titleInput.value = this.state.title || '';

            const rowsEl = this.mount.querySelector('#goal-rows');
            if (!rowsEl) return;
            rowsEl.innerHTML = '';

            if (!this.state.goals.length) {
                rowsEl.innerHTML = '<div class="goal-empty">Chua co muc tieu. Bam "Them qua muc tieu".</div>';
                return;
            }

            this.state.goals.forEach((goal, index) => {
                const row = document.createElement('div');
                row.className = 'goal-row';
                row.dataset.index = String(index);
                row.innerHTML = `
                    <div class="goal-gift-head"><img src="${goal.giftIcon || ''}" alt="" onerror="this.style.display='none'" /></div>
                    <select class="goal-gift-select">
                        ${this.gifts.map((gift) => `<option value="${gift.id}" ${gift.id === goal.giftId ? 'selected' : ''}>${gift.name}</option>`).join('')}
                    </select>
                    <input class="goal-target-input" type="number" min="1" value="${goal.target || 1}" />
                    <div class="goal-current-view">${goal.current || 0}</div>
                    <button class="goal-remove-btn">X</button>
                `;
                rowsEl.appendChild(row);
            });
        }

        syncLayoutInputs() {
            const map = [
                ['#goal-layout-width', this.state.layout.width],
                ['#goal-layout-height', this.state.layout.height],
                ['#goal-layout-width-range', this.state.layout.width],
                ['#goal-layout-height-range', this.state.layout.height],
                ['#goal-layout-x', this.state.layout.x],
                ['#goal-layout-y', this.state.layout.y],
                ['#goal-style-preset', this.state.style.preset || 'neon'],
                ['#goal-style-glow', this.state.style.glow || 1],
                ['#goal-style-accent', this.state.style.accentColor || '#b287ff'],
                ['#goal-preview-scale', this.state.previewZoom || 1]
            ];
            map.forEach(([selector, value]) => {
                const el = this.mount.querySelector(selector);
                if (el) el.value = String(value);
            });
        }

        applyWidgetLayout(widgetEl, scale) {
            widgetEl.style.left = `${Math.round(this.state.layout.x * scale)}px`;
            widgetEl.style.top = `${Math.round(this.state.layout.y * scale)}px`;
            widgetEl.style.width = `${Math.round(this.state.layout.width * scale)}px`;
            widgetEl.style.minHeight = `${Math.round(this.state.layout.height * scale)}px`;
        }

        renderPreviewWidget() {
            const canvasEl = this.mount.querySelector('#goal-canvas');
            const widgetEl = this.mount.querySelector('#goal-widget-preview');
            if (!canvasEl || !widgetEl) return;

            const zoom = Math.max(0.6, Math.min(1.8, parseFloat(this.state.previewZoom || 1)));
            const canvasWidth = Math.round(360 * zoom);
            const canvasHeight = Math.round(canvasWidth * 16 / 9);
            const scale = canvasWidth / this.state.layout.canvasWidth;

            canvasEl.style.width = `${canvasWidth}px`;
            canvasEl.style.height = `${canvasHeight}px`;

            widgetEl.innerHTML = `
                <div class="goal-widget-title">${this.state.title || 'Muc tieu qua tang'}</div>
                ${(this.state.goals || []).map((goal) => {
                    const current = Math.max(0, parseInt(goal.current, 10) || 0);
                    const target = Math.max(1, parseInt(goal.target, 10) || 1);
                    const percent = Math.max(0, Math.min(100, (current / target) * 100));
                    return `
                        <div class="goal-widget-item">
                            <div class="goal-widget-icon-wrap"><img src="${goal.giftIcon || ''}" alt="" onerror="this.style.display='none'" /></div>
                            <div class="goal-widget-main">
                                <div class="goal-widget-head"><strong>${goal.giftName || 'Gift'}</strong><span>${current}/${target}</span></div>
                                <div class="goal-widget-track"><div class="goal-widget-fill" style="width:${percent}%"></div></div>
                            </div>
                        </div>
                    `;
                }).join('')}
                <div class="goal-resize-right" title="Resize width"></div>
                <div class="goal-resize-bottom" title="Resize height"></div>
                <div class="goal-resize-corner" title="Resize both"></div>
            `;

            widgetEl.className = `goal-widget-preview preset-${this.state.style.preset || 'neon'}`;
            widgetEl.style.setProperty('--goal-glow', String(this.state.style.glow || 1));
            widgetEl.style.setProperty('--goal-accent', this.state.style.accentColor || '#b287ff');

            this.syncLayoutInputs();
            this.applyWidgetLayout(widgetEl, scale);
            this.bindDrag(widgetEl, scale);
        }

        async saveConfig() {
            const payload = {
                title: this.state.title || 'Muc tieu',
                goals: this.state.goals.map((goal) => ({
                    id: goal.id,
                    giftId: goal.giftId,
                    giftName: goal.giftName,
                    giftIcon: goal.giftIcon,
                    target: Math.max(1, parseInt(goal.target, 10) || 1),
                    current: Math.max(0, parseInt(goal.current, 10) || 0)
                })),
                layout: this.normalizeLayout(this.state.layout),
                style: {
                    preset: this.state.style.preset || 'neon',
                    glow: Math.max(0.4, Math.min(2, parseFloat(this.state.style.glow || 1))),
                    accentColor: this.state.style.accentColor || '#b287ff'
                },
                previewZoom: Math.max(0.6, Math.min(1.8, parseFloat(this.state.previewZoom || 1)))
            };

            try {
                await this.fetchJson('/api/tiktok/goal-tracker/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, { allowNotFound: true, goalApi: true });
                this.saveLocalConfig();
                if (this.goalApiUnavailable) {
                    window.app?.showNotification?.('warning', 'Da luu local. Backend Goal API chua san sang.');
                } else {
                    window.app?.showNotification?.('success', 'Da luu cau hinh Goal.');
                }
            } catch (_error) {
                this.saveLocalConfig();
                window.app?.showNotification?.('warning', 'Luu local tam thoi (backend khong phan hoi).');
            }
        }

        async resetProgress() {
            try {
                const data = await this.fetchJson('/api/tiktok/goal-tracker/reset', { method: 'POST' }, { allowNotFound: true, goalApi: true });
                if (data?.success && data.state) {
                    this.state = {
                        ...this.state,
                        ...data.state,
                        layout: this.normalizeLayout(data.state.layout || this.state.layout),
                        style: { ...this.state.style, ...(data.state.style || {}) },
                        goals: Array.isArray(data.state.goals) ? data.state.goals.map((goal) => ({
                            ...goal,
                            giftIcon: this.resolveIconUrl(goal.giftIcon)
                        })) : []
                    };
                } else {
                    this.state.goals = this.state.goals.map((goal) => ({ ...goal, current: 0 }));
                }
                this.renderGoalRows();
                this.renderPreviewWidget();
                this.saveLocalConfig();
            } catch (_error) {
                this.state.goals = this.state.goals.map((goal) => ({ ...goal, current: 0 }));
                this.renderGoalRows();
                this.renderPreviewWidget();
                this.saveLocalConfig();
            }
        }

        connectWebSocket() {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
            this.ws = new WebSocket(this.WS_URL);
            this.ws.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data || '{}');
                    if (packet.event === 'goal_state' && packet.data) {
                        this.state = {
                            ...this.state,
                            ...packet.data,
                            layout: this.normalizeLayout(packet.data.layout || this.state.layout),
                            style: { ...this.state.style, ...(packet.data.style || {}) },
                            goals: Array.isArray(packet.data.goals) ? packet.data.goals.map((goal) => ({
                                ...goal,
                                giftIcon: this.resolveIconUrl(goal.giftIcon)
                            })) : []
                        };
                        this.renderGoalRows();
                        this.renderPreviewWidget();
                        this.saveLocalConfig();
                    }
                    if (packet.event === 'goal_update' && packet.data) {
                        const index = this.state.goals.findIndex((goal) => goal.id === packet.data.goalId || String(goal.giftId) === String(packet.data.giftId));
                        if (index >= 0) {
                            this.state.goals[index].current = packet.data.progress || 0;
                            this.renderGoalRows();
                            this.renderPreviewWidget();
                        }
                    }
                } catch (_error) {}
            };
            this.ws.onclose = () => setTimeout(() => this.connectWebSocket(), 2500);
        }
    }

    window.giftGoalTracker = new GiftGoalTracker();
})();

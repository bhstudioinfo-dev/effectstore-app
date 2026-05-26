(function () {
    class GiftMenuDesigner {
        constructor() {
            this.apiBase = (window.app && window.app.API_URL) || 'http://localhost:9000';
            this.token = (window.app && window.app.authToken) || localStorage.getItem('effectstore_auth_token') || '';
            this.mount = document.getElementById('gift-menu-designer-view');
            this.sidebarRight = document.querySelector('.sidebar-right');
            this.gifts = [];
            this.filteredGifts = [];
            this.items = [];
            this.selectedId = null;
            this.selectedIds = [];
            this.aspectRatio = '9:16';
            this.dragState = null;
            this.canvasSize = { width: 720, height: 960 };
            this.zoomLevel = 1;
            this.panX = 0;
            this.panY = 0;
            this.isSpacePressed = false;
            this.inspectorTab = 'gift';
            this.history = [];
            this.historyIndex = -1;
            this.isRestoringHistory = false;
            this.snapEnabled = true;
            this.activeGuides = { x: null, y: null };
            this.auraOptions = [
                { value: 'None', label: 'Không có' },
                { value: 'Glow', label: 'Glow (Tỏa sáng)' },
                { value: 'Bubble', label: 'Bubble (Bong bóng)' },
                { value: 'Magic Ring', label: 'Magic Ring (Vòng phép thuật)' },
                { value: 'Neon Frame', label: 'Neon Frame (Khung Neon)' },
                { value: 'Light Sweep', label: 'Light Sweep (Quét sáng)' }
            ];
            this.auraOptions.push(
                { value: 'Fire Aura', label: 'Fire Aura (Lửa)' },
                { value: 'Electric Aura', label: 'Electric Aura (Điện)' }
            );

            // GOAL BOARD STATE (PHASE 1)
            this.mode = 'gift-menu'; // 'gift-menu' or 'goal-board'
            this.leftPanelTab = 'templates'; // 'templates' or 'assets'
            this.goalBoard = {
                items: [],
                selectedId: null,
                selectedIds: [],
                aspectRatio: '9:16'
            };
            this.goalAssets = [];
            this.customTemplates = [];

            // Close custom selects when clicking outside
            window.addEventListener('click', (e) => {
                const openSelects = document.querySelectorAll('.gmd-custom-select-options.show');
                openSelects.forEach(opt => {
                    const selectContainer = opt.closest('.gmd-custom-select');
                    if (selectContainer && !selectContainer.contains(e.target)) {
                        opt.classList.remove('show');
                    }
                });
            });
        }

        init() {
            if (!this.mount) return;
            this.injectSharedRendererCss();
            this.render();
            this.bindEvents();
            this.loadGiftLibrary();
            this.loadLayout();
            this.connectWebSocket();
        }

        connectWebSocket() {
            try {
                const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                // Detect WebSocket host based on API URL or window.location
                const host = this.apiBase ? new URL(this.apiBase).hostname : 'localhost';
                const wsUrl = `${wsScheme}//${host}:9001`;

                console.log('📡 Designer connecting WebSocket:', wsUrl);
                const ws = new WebSocket(wsUrl);

                ws.onmessage = (event) => {
                    try {
                        const packet = JSON.parse(event.data || '{}');
                        if (packet.event === 'goal_board_progress_update' && packet.data?.layers) {
                            if (this.mode === 'goal-board') {
                                this.goalBoard.items = packet.data.layers.map(layer => {
                                    // Keep lock and visibility state from current designer items if present
                                    const currentItem = this.goalBoard.items.find(x => x.id === layer.id);
                                    return {
                                        ...layer,
                                        visible: currentItem ? currentItem.visible : (layer.visible !== false),
                                        locked: currentItem ? currentItem.locked : Boolean(layer.locked)
                                    };
                                });
                                this.renderCanvas();
                                if (this.inspectorTab !== 'layers') {
                                    this.renderInspector();
                                }
                            }
                        }
                    } catch (_err) {}
                };

                ws.onclose = () => {
                    setTimeout(() => this.connectWebSocket(), 5000);
                };
                
                ws.onerror = () => {
                    ws.close();
                };
            } catch (e) {
                console.error('Failed to init Designer WebSocket:', e);
            }
        }

        injectSharedRendererCss() {
            // Inject beautiful progress bar effects directly to bypass CSS caching
            const styleId = 'gmd-bar-effects-injected';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .gmd-goal-bar-inner, .gmd-boss-bar-inner, .gmd-mystery-bar-inner, .gmd-goal-list-bar-inner {
                        position: relative !important;
                        overflow: hidden !important;
                    }
                    
                    /* Glow Pulse Effect */
                    .gmd-bar-style-glow-pulse {
                        animation: gmdGlowPulseStyle 1.5s infinite alternate ease-in-out !important;
                    }
                    
                    /* Gradient Sweep Effect */
                    .gmd-bar-style-gradient-sweep::after {
                        content: "" !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent) !important;
                        transform: translate3d(-100%, 0, 0);
                        -webkit-transform: translate3d(-100%, 0, 0);
                        animation: gmdGradientSweep 1.8s infinite linear !important;
                        z-index: 5 !important;
                        display: block !important;
                        pointer-events: none !important;
                    }
                    
                    /* Candy Stripe Effect */
                    .gmd-bar-style-candy-stripe::after {
                        content: "" !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.25) 0px, rgba(255, 255, 255, 0.25) 15px, transparent 15px, transparent 30px) !important;
                        background-size: 42.42px 42.42px !important;
                        animation: gmdCandyStripe 1s linear infinite !important;
                        z-index: 5 !important;
                        display: block !important;
                        pointer-events: none !important;
                    }
                    
                    @keyframes gmdGlowPulseStyle {
                        0% {
                            filter: drop-shadow(0 0 2px var(--bar-glow, rgba(255, 0, 127, 0.5))) brightness(0.9);
                            box-shadow: 0 0 8px var(--bar-glow, rgba(255, 0, 127, 0.5)) !important;
                        }
                        100% {
                            filter: drop-shadow(0 0 15px var(--bar-glow, rgba(255, 0, 127, 0.9))) brightness(1.25);
                            box-shadow: 0 0 24px var(--bar-glow, rgba(255, 0, 127, 0.9)) !important;
                        }
                    }
                    @keyframes gmdGradientSweep {
                        0% { transform: translate3d(-100%, 0, 0); -webkit-transform: translate3d(-100%, 0, 0); }
                        100% { transform: translate3d(100%, 0, 0); -webkit-transform: translate3d(100%, 0, 0); }
                    }
                    @keyframes gmdCandyStripe {
                        0% { background-position: 0px 0px; }
                        100% { background-position: 42.42px 0px; }
                    }
                `;
                document.head.appendChild(style);
            }

            if (document.getElementById('gift-menu-renderer-css')) return;
            const link = document.createElement('link');
            link.id = 'gift-menu-renderer-css';
            link.rel = 'stylesheet';
            link.href = `${this.apiBase}/gift-menu-renderer.css?v=7`;
            document.head.appendChild(link);
        }

        render() {
            this.mount.innerHTML = `
                <div class="gift-menu-designer">
                    <div class="gmd-headline">
                        <div class="gmd-brand">EffectStore <span>|</span> Menu Designer <em>Pro</em></div>
                    </div>
                    <div class="gmd-toolbar">
                        <div class="gmd-group">
                            <button class="gmd-btn icon" data-action="undo" disabled><i class="fas fa-undo"></i></button>
                            <button class="gmd-btn icon" data-action="redo" disabled><i class="fas fa-redo"></i></button>
                            <button class="gmd-btn" data-action="help"><i class="far fa-question-circle"></i> Hướng dẫn</button>
                            <div class="gmd-mode-switch">
                                <button class="gmd-btn active" data-action="switch-mode" data-mode="gift-menu"><i class="fas fa-gift"></i> Menu Quà</button>
                                <button class="gmd-btn" data-action="switch-mode" data-mode="goal-board"><i class="fas fa-trophy"></i> Bảng Mục Tiêu</button>
                            </div>
                        </div>
                        <div class="gmd-group">
                            <button class="gmd-btn" data-action="preview-browser"><i class="fas fa-desktop"></i> Xem trên trình duyệt</button>
                            <button class="gmd-btn" data-action="save-new-template" id="gmd-save-template-btn" style="display:none; background:#8b5cf6; color:#ffffff; border:1px solid #a78bfa;"><i class="fas fa-star"></i> Lưu thành bảng mới</button>
                            <button class="gmd-btn" data-action="save"><i class="fas fa-save"></i> Lưu</button>
                            <button class="gmd-btn primary" data-action="save-export"><i class="fas fa-download"></i> Lưu & Xuất</button>
                        </div>
                    </div>
                    <div class="gmd-layout">
                        <aside class="gmd-left-col">
                            <section class="gmd-panel gmd-library-panel">
                                <h3>1. Chọn quà tặng</h3>
                                <p class="gmd-subline">Kéo thả hoặc click để thêm vào menu</p>
                                <div class="gmd-library-controls">
                                    <div class="gmd-search-wrap">
                                        <i class="fas fa-search"></i>
                                        <input id="gmd-search" class="gmd-input" placeholder="Tìm quà..." />
                                    </div>
                                    <button class="gmd-add-btn"><i class="fas fa-plus"></i></button>
                                </div>
                                <div id="gmd-gift-list" class="gmd-gift-list"></div>
                            </section>
                            <section class="gmd-panel gmd-my-library">
                                <div class="gmd-my-library-top">
                                    <h4>Thư viện của tôi</h4>
                                    <button class="gmd-btn" data-action="new-layout"><i class="fas fa-plus"></i> Tạo mới</button>
                                </div>
                                <div class="gmd-subline">Menu đã lưu</div>
                                <div class="gmd-my-library-list" id="gmd-my-library-list"></div>
                            </section>
                        </aside>
                        <main class="gmd-panel gmd-canvas-wrap">
                            <div class="gmd-canvas-header">
                                <h3>2. Thiết kế menu</h3>
                                <div class="gmd-canvas-tools">
                                    <div class="gmd-tool-group">
                                        <button class="gmd-btn icon" data-action="snap-toggle" title="Bật/Tắt Snap"><i class="fas fa-magnet"></i></button>
                                    </div>
                                    <div class="gmd-tool-group">
                                        <button class="gmd-btn icon" data-action="align-left" title="Căn trái"><i class="fas fa-align-left"></i></button>
                                        <button class="gmd-btn icon" data-action="align-center-x" title="Căn giữa ngang"><i class="fas fa-align-center"></i></button>
                                        <button class="gmd-btn icon" data-action="align-right" title="Căn phải"><i class="fas fa-align-right"></i></button>
                                        <button class="gmd-btn icon" data-action="align-top" title="Căn trên"><i class="fas fa-align-left fa-rotate-90"></i></button>
                                        <button class="gmd-btn icon" data-action="align-center-y" title="Căn giữa dọc"><i class="fas fa-align-center fa-rotate-90"></i></button>
                                        <button class="gmd-btn icon" data-action="align-bottom" title="Căn dưới"><i class="fas fa-align-right fa-rotate-90"></i></button>
                                    </div>
                                    <div class="gmd-tool-group">
                                        <button class="gmd-btn icon" data-action="distribute-x" title="Căn đều ngang"><i class="fas fa-arrows-alt-h"></i></button>
                                        <button class="gmd-btn icon" data-action="distribute-y" title="Căn đều dọc"><i class="fas fa-arrows-alt-v"></i></button>
                                    </div>
                                    <div class="gmd-tool-group">
                                        <button class="gmd-btn icon" data-action="duplicate"><i class="far fa-clone"></i></button>
                                        <button class="gmd-btn icon" data-action="delete"><i class="far fa-trash-alt"></i></button>
                                    </div>
                                </div>
                                <div class="gmd-ratios">
                                    <button class="gmd-btn active" data-ratio="9:16">9:16</button>
                                    <button class="gmd-btn" data-ratio="16:9">16:9</button>
                                    <button class="gmd-btn" data-ratio="1:1">1:1</button>
                                </div>
                            </div>
                            <div id="gmd-canvas" class="gmd-canvas">
                                <div id="gmd-stage" class="gmd-stage">
                                    <div id="gmd-safe-area" class="gmd-safe-area"></div>
                                    <div id="gmd-guide-x" class="gmd-guide gmd-guide-x"></div>
                                    <div id="gmd-guide-y" class="gmd-guide gmd-guide-y"></div>
                                </div>
                                <div class="gmd-zoom-pill">
                                    <button class="gmd-zoom-btn" data-action="zoom-out">−</button>
                                    <span id="gmd-zoom-value">100%</span>
                                    <button class="gmd-zoom-btn" data-action="zoom-in">+</button>
                                </div>
                            </div>
                        </main>
                        <aside class="gmd-panel gmd-inspector-panel">
                            <h3>3. Tùy chỉnh</h3>
                            <div class="gmd-inspector-tabs">
                                <button class="active" data-tab="gift">Quà tặng</button>
                                <button data-tab="layers">Layers</button>
                            </div>
                            <div id="gmd-inspector"></div>
                        </aside>
                    </div>
                </div>
            `;
            if (this.sidebarRight) this.sidebarRight.style.display = 'none';
            const snapBtn = this.mount.querySelector('[data-action="snap-toggle"]');
            if (snapBtn) snapBtn.classList.toggle('active', this.snapEnabled);
            this.updateCanvasSizeByRatio();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('init');
        }

        createHistorySnapshot() {
            return JSON.stringify({
                items: this.items.map((i) => ({ ...i })),
                selectedId: this.selectedId,
                selectedIds: [...this.selectedIds],
                aspectRatio: this.aspectRatio
            });
        }

        restoreHistorySnapshot(snapshot) {
            try {
                const data = JSON.parse(snapshot);
                this.items = Array.isArray(data.items) ? data.items.map((i) => ({ ...i })) : [];
                this.selectedId = data.selectedId || null;
                this.selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds : (this.selectedId ? [this.selectedId] : []);
                this.aspectRatio = data.aspectRatio || '9:16';
                this.syncSelectionAfterDataChange();
                this.mount.querySelectorAll('[data-ratio]').forEach((b) => b.classList.toggle('active', b.dataset.ratio === this.aspectRatio));
                this.updateCanvasSizeByRatio();
                this.renderCanvas();
                this.renderInspector();
                this.renderMyLibrary();
                this.updateHistoryButtons();
            } catch (_e) {}
        }

        pushHistory(_label = '') {
            if (this.isRestoringHistory) return;
            const snapshot = this.createHistorySnapshot();
            if (this.historyIndex >= 0 && this.history[this.historyIndex] === snapshot) return;
            if (this.historyIndex < this.history.length - 1) this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(snapshot);
            if (this.history.length > 200) this.history.shift();
            this.historyIndex = this.history.length - 1;
            this.updateHistoryButtons();
        }

        updateHistoryButtons() {
            const undoBtn = this.mount.querySelector('[data-action="undo"]');
            const redoBtn = this.mount.querySelector('[data-action="redo"]');
            if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
            if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
        }

        undo() {
            if (this.historyIndex <= 0) return;
            this.isRestoringHistory = true;
            this.historyIndex -= 1;
            this.restoreHistorySnapshot(this.history[this.historyIndex]);
            this.isRestoringHistory = false;
        }

        redo() {
            if (this.historyIndex >= this.history.length - 1) return;
            this.isRestoringHistory = true;
            this.historyIndex += 1;
            this.restoreHistorySnapshot(this.history[this.historyIndex]);
            this.isRestoringHistory = false;
        }

        isSelected(id) {
            return this.selectedIds.includes(id);
        }

        setSelection(ids = [], primaryId = null) {
            const unique = Array.from(new Set(ids.filter(Boolean)));
            this.selectedIds = unique;
            this.selectedId = primaryId && unique.includes(primaryId) ? primaryId : (unique[0] || null);
        }

        clearSelection() {
            this.selectedId = null;
            this.selectedIds = [];
        }

        getSelectedItems() {
            return this.items.filter((i) => this.selectedIds.includes(i.id));
        }

        syncSelectionAfterDataChange() {
            const valid = new Set(this.items.map((i) => i.id));
            this.selectedIds = this.selectedIds.filter((id) => valid.has(id));
            if (!this.selectedIds.length) this.selectedId = null;
            else if (!this.selectedId || !valid.has(this.selectedId)) this.selectedId = this.selectedIds[0];
        }

        async loadGiftLibrary() {
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/gifts-library`, { headers });
                const data = await res.json();
                this.gifts = Array.isArray(data.gifts) ? data.gifts : [];
                this.filteredGifts = [...this.gifts];
                this.renderGiftLibrary();
            } catch (_e) {
                this.gifts = [];
                this.filteredGifts = [];
                this.renderGiftLibrary();
            }
        }

        normalizeIcon(icon) {
            if (!icon) return '';
            return icon.startsWith('http') ? icon : `${this.apiBase}${icon}`;
        }

        renderGiftLibrary() {
            const list = this.mount.querySelector('#gmd-gift-list');
            if (!list) return;
            if (!this.filteredGifts.length) {
                list.innerHTML = '<div class="gmd-inspector-empty">Không có dữ liệu gift.</div>';
                return;
            }
            list.innerHTML = this.filteredGifts.map((gift) => `
                <button class="gmd-gift-card" draggable="true" data-gift-id="${gift.id}">
                    <img src="${this.normalizeIcon(gift.icon)}" alt="${gift.name}">
                    <div class="gmd-gift-name">${gift.name || gift.id}</div>
                </button>
            `).join('');
        }

        createItemFromGift(giftId, x = 100, y = 100) {
            const gift = this.gifts.find((g) => g.id === giftId);
            if (!gift) return null;
            return {
                id: `itm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                giftId: gift.id,
                name: gift.name || gift.id,
                iconUrl: this.normalizeIcon(gift.icon),
                x, y, width: 84, height: 84, rotation: 0,
                showName: true, textSize: 13, textColor: '#f7cb64', textGap: 4,
                auraType: 'None', auraColor: '#d7b2ff', auraShape: 'Circle',
                animationType: 'None', animationSpeed: 1, auraSpeed: 1, auraScale: 1, zIndex: this.items.length + 1,
                visible: true, locked: false
            };
        }

        getNextStackPosition() {
            const x = 56;
            const y = 46 + (this.items.length * 94);
            return { x, y };
        }

        addGiftToCanvas(giftId) {
            const p = this.getNextStackPosition();
            const item = this.createItemFromGift(giftId, p.x, p.y);
            if (!item) return;
            this.items.push(item);
            this.setSelection([item.id], item.id);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('add-gift');
        }

        getAuraClass(type) {
            const map = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep', 'Fire Aura': 'aura-fire', 'Electric Aura': 'aura-electric' };
            return map[type] || '';
        }

        getMotionClass(type) {
            const map = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
            return map[type] || '';
        }

        renderCanvas() {
            if (this.mode === 'goal-board') {
                this.renderGoalBoardCanvas();
                return;
            }
            const canvas = this.mount.querySelector('#gmd-canvas');
            const stage = this.mount.querySelector('#gmd-stage');
            if (!canvas || !stage) return;
            Array.from(stage.querySelectorAll('.gmd-item')).forEach((n) => n.remove());
            this.items.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach((item) => {
                if (item.visible === false) return;
                const selected = this.isSelected(item.id);
                const el = document.createElement('div');
                el.className = `gmd-item ${selected ? 'selected' : ''}`;
                el.dataset.itemId = item.id;
                el.style.left = `${item.x}px`;
                el.style.top = `${item.y}px`;
                el.style.width = `${item.width}px`;
                el.style.height = `${item.height}px`;
                el.style.transform = `rotate(${item.rotation}deg)`;
                el.style.zIndex = String(item.zIndex || 1);
                const auraShapeVars = this.getAuraShapeVars(item.auraShape);
                const lightSweepOverlay = '';
                el.innerHTML = `
                    <div class="gmd-visual ${this.getMotionClass(item.animationType)} ${this.getAuraClass(item.auraType)}" style="--aura-color:${item.auraColor};${auraShapeVars};--anim-speed:${item.animationSpeed}s;--aura-speed:${item.auraSpeed || 1}s;--aura-scale:${item.auraScale || 1};--icon-url:url('${item.iconUrl}');">
                        <span class="gmd-aura gmd-aura-back ${this.getAuraClass(item.auraType)}"></span>
                        <span class="gmd-icon-wrap" style="--icon-url:url('${item.iconUrl}')">
                            <img src="${item.iconUrl}" alt="${item.name}">
                            ${lightSweepOverlay}
                        </span>
                        <span class="gmd-aura gmd-aura-front ${this.getAuraClass(item.auraType)}"></span>
                    </div>
                    ${item.showName ? `<div class="gmd-item-label" style="font-size:${item.textSize}px;color:${item.textColor};--label-gap:${item.textGap}px;">${item.name}</div>` : ''}
                    ${selected && !item.locked && this.selectedId === item.id && this.selectedIds.length <= 1 ? '<span class="gmd-handle gmd-rotate-handle" data-handle="rotate">⟳</span><span class="gmd-handle gmd-resize-handle" data-handle="resize"></span>' : ''}
                `;
                stage.appendChild(el);
            });
            this.applyZoom();
        }

        getAuraShapeVars(shape) {
            switch (shape) {
                case 'Square':
                    return '--aura-radius: 14%; --aura-clip: none;';
                case 'Hexagon':
                    return '--aura-radius: 0; --aura-clip: polygon(25% 6%, 75% 6%, 96% 50%, 75% 94%, 25% 94%, 4% 50%);';
                case 'Star':
                    return '--aura-radius: 0; --aura-clip: polygon(50% 0%, 62% 35%, 98% 35%, 69% 57%, 79% 91%, 50% 70%, 21% 91%, 31% 57%, 2% 35%, 38% 35%);';
                case 'Oval':
                    return '--aura-radius: 50% / 38%; --aura-clip: none;';
                case 'Circle':
                default:
                    return '--aura-radius: 50%; --aura-clip: none;';
            }
        }

        selectItem(id, append = false) {
            if (!append) this.setSelection([id], id);
            else if (this.selectedIds.includes(id)) {
                const next = this.selectedIds.filter((x) => x !== id);
                this.setSelection(next, next[0] || null);
            } else {
                this.setSelection([...this.selectedIds, id], id);
            }
            this.renderCanvas();
            this.renderInspector();
        }

        renderSelect(key, value, options) {
            return `<select class="gmd-select" data-key="${key}">${options.map((o) => {
                const ov = typeof o === 'string' ? o : o.value;
                const ol = typeof o === 'string' ? o : o.label;
                return `<option value="${ov}" ${ov === value ? 'selected' : ''}>${ol}</option>`;
            }).join('')}</select>`;
        }

        renderLayerPanel() {
            const sorted = [...this.items].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
            return `
                <div class="gmd-section gmd-layer-panel">
                    <h4><i class="fas fa-layer-group"></i> LAYERS</h4>
                    <div class="gmd-layer-list">
                        ${sorted.length ? sorted.map((item) => `
                            <div class="gmd-layer-item ${this.isSelected(item.id) ? 'active' : ''}">
                                <button class="gmd-layer-main" data-action="layer-select" data-layer-id="${item.id}">
                                    <img src="${item.iconUrl}" alt="${item.name}">
                                    <span>${item.name}</span>
                                </button>
                                <div class="gmd-layer-actions">
                                    <button class="gmd-layer-btn" title="Lên trên" data-action="layer-up" data-layer-id="${item.id}"><i class="fas fa-arrow-up"></i></button>
                                    <button class="gmd-layer-btn" title="Xuống dưới" data-action="layer-down" data-layer-id="${item.id}"><i class="fas fa-arrow-down"></i></button>
                                    <button class="gmd-layer-btn ${item.visible === false ? 'off' : ''}" title="Ẩn/Hiện" data-action="layer-toggle-visible" data-layer-id="${item.id}"><i class="fas ${item.visible === false ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                                    <button class="gmd-layer-btn ${item.locked ? 'off' : ''}" title="Khóa/Mở khóa" data-action="layer-toggle-lock" data-layer-id="${item.id}"><i class="fas ${item.locked ? 'fa-lock' : 'fa-lock-open'}"></i></button>
                                </div>
                            </div>
                        `).join('') : '<div class="gmd-inspector-empty">Chưa có layer nào</div>'}
                    </div>
                </div>
            `;
        }

        renderInspector() {
            if (this.mode === 'goal-board') {
                this.renderGoalBoardInspector();
                return;
            }
            const inspector = this.mount.querySelector('#gmd-inspector');
            if (!inspector) return;
            const giftTabBtn = this.mount.querySelector('.gmd-inspector-tabs [data-tab="gift"]');
            const layersTabBtn = this.mount.querySelector('.gmd-inspector-tabs [data-tab="layers"]');
            if (giftTabBtn) giftTabBtn.classList.toggle('active', this.inspectorTab === 'gift');
            if (layersTabBtn) layersTabBtn.classList.toggle('active', this.inspectorTab === 'layers');
            if (this.inspectorTab === 'layers') {
                inspector.innerHTML = this.renderLayerPanel();
                return;
            }
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected) {
                inspector.innerHTML = '<div class="gmd-inspector-empty"><i class="fas fa-mouse-pointer"></i><p>Chọn một quà tặng<br>trên canvas để tùy chỉnh</p><small>(Giữ Shift để chọn nhiều)</small></div>';
                return;
            }
            const iconPreview = selected.iconUrl || '';
            inspector.innerHTML = `
                <div class="gmd-selected-card">
                    <img src="${iconPreview}" alt="${selected.name}">
                    <input class="gmd-title-input" data-key="name" value="${selected.name}">
                    <button class="gmd-delete-btn" data-action="delete"><i class="fas fa-trash"></i></button>
                </div>

                <div class="gmd-section">
                    <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>
                    <div class="gmd-field"><label>Vị trí</label></div>
                    <div class="gmd-row">
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="x" value="${selected.x}"><span>px</span></div>
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="y" value="${selected.y}"><span>px</span></div>
                    </div>
                    <div class="gmd-field"><label>Kích thước</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="width" value="${selected.width}"><span>px</span></div></div>
                    <input class="gmd-range" type="range" min="30" max="300" data-key="width" value="${selected.width}">
                </div>

                <div class="gmd-section">
                    <h4><i class="fas fa-signature"></i> CÀI ĐẶT CHỮ</h4>
                    <div class="gmd-field gmd-toggle-row">
                        <label>Hiển thị tên</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-key="showName" ${selected.showName ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    <div class="gmd-field"><label>Cỡ chữ</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textSize" value="${selected.textSize}"><span>px</span></div></div>
                    <input class="gmd-range" type="range" min="10" max="48" data-key="textSize" value="${selected.textSize}">
                    <div class="gmd-field"><label>Khoảng cách (Gap)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textGap" value="${selected.textGap}"><span>px</span></div></div>
                    <input class="gmd-range" type="range" min="0" max="30" data-key="textGap" value="${selected.textGap}">
                    <div class="gmd-field"><label>Màu chữ</label><input class="gmd-color" type="color" data-key="textColor" value="${selected.textColor}"></div>
                </div>

                <div class="gmd-section">
                    <h4><i class="fas fa-sparkles"></i> HIỆU ỨNG</h4>
                    <div class="gmd-field"><label>Hiệu ứng loop</label>${this.renderSelect('animationType', selected.animationType, ['None', 'Pulse', 'Bounce', 'Float', 'Zoom', 'Shake'])}</div>
                    <div class="gmd-field"><label>Tốc độ loop</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-key="animationSpeed" value="${selected.animationSpeed || 1}"><span>s</span></div></div>
                    <input class="gmd-range" type="range" min="0.2" max="8" step="0.1" data-key="animationSpeed" value="${selected.animationSpeed || 1}">
                    <div class="gmd-field"><label>Hiệu ứng nền (Aura)</label>${this.renderSelect('auraType', selected.auraType, this.auraOptions)}</div>
                    <div class="gmd-field"><label>Tốc độ Aura</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-key="auraSpeed" value="${selected.auraSpeed || 1}"><span>s</span></div></div>
                    <input class="gmd-range" type="range" min="0.2" max="8" step="0.1" data-key="auraSpeed" value="${selected.auraSpeed || 1}">
                    <div class="gmd-field"><label>Kích thước Aura</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.6" max="1.8" step="0.05" data-key="auraScale" value="${selected.auraScale || 1}"><span>x</span></div></div>
                    <input class="gmd-range" type="range" min="0.6" max="1.8" step="0.05" data-key="auraScale" value="${selected.auraScale || 1}">
                    <div class="gmd-field"><label>Màu Aura</label><div class="gmd-inline-color"><input class="gmd-input gmd-input-compact" data-key="auraColor" value="${selected.auraColor}"><input class="gmd-color" type="color" data-key="auraColor" value="${selected.auraColor}"></div></div>
                    <div class="gmd-field"><label>Hình dáng Aura</label>${this.renderSelect('auraShape', selected.auraShape, [
                        { value: 'Circle', label: 'Tròn' },
                        { value: 'Square', label: 'Vuông' },
                        { value: 'Hexagon', label: 'Lục giác' },
                        { value: 'Star', label: 'Ngôi sao' },
                        { value: 'Oval', label: 'Oval' }
                    ])}</div>
                </div>
            `;
        }

        updateSelectedItem(key, value, refreshInspector = true) {
            const item = this.items.find((x) => x.id === this.selectedId);
            if (!item) return;
            const selectedItems = this.getSelectedItems().filter((x) => !x.locked);
            const oldWidth = item.width;
            const oldHeight = item.height;
            if (key === 'showName') item[key] = Boolean(value);
            else if (['x', 'y', 'width', 'height', 'rotation', 'textSize', 'textGap', 'animationSpeed', 'auraSpeed', 'auraScale'].includes(key)) {
                item[key] = Number(value);
                // Keep icon box square by default for cleaner designer UX
                if (key === 'width') item.height = item.width;
                if (key === 'height') item.width = item.height;
                if ((key === 'width' || key === 'height') && selectedItems.length > 1) {
                    const sourceBefore = Math.max(1, key === 'width' ? oldWidth : oldHeight);
                    const nextSize = Math.max(1, key === 'width' ? item.width : item.height);
                    const ratio = nextSize / sourceBefore;
                    selectedItems.forEach((s) => {
                        if (s.id === item.id) return;
                        s.width = Math.round(s.width * ratio);
                        s.height = s.width;
                        this.clampInsideCanvas(s);
                    });
                }
                if (key === 'animationSpeed' || key === 'auraSpeed') {
                    item[key] = Math.max(0.2, Math.min(8, item[key] || 1));
                }
                if (key === 'auraScale') {
                    item[key] = Math.max(0.6, Math.min(1.8, item[key] || 1));
                }
            }
            else if (key === 'auraColor') {
                let v = String(value || '').trim();
                if (v && !v.startsWith('#')) v = `#${v}`;
                item[key] = v || '#c084fc';
            } else item[key] = value;
            this.renderCanvas();
            if (refreshInspector) this.renderInspector();
            this.pushHistory('update-item');
        }

        syncInspectorLinkedControls(sourceEl, key, value) {
            const inspector = this.mount.querySelector('#gmd-inspector');
            if (!inspector) return;
            inspector.querySelectorAll(`[data-key="${key}"]`).forEach((el) => {
                if (el === sourceEl) return;
                if (el.type === 'checkbox') el.checked = Boolean(value);
                else el.value = value;
            });
        }

        duplicateSelected() {
            const selected = this.getSelectedItems();
            if (!selected.length) return;
            const clones = selected.map((item, idx) => ({
                ...item,
                id: `itm_${Date.now()}_${Math.floor(Math.random() * 1000)}_${idx}`,
                x: item.x + 20,
                y: item.y + 20,
                zIndex: this.items.length + idx + 1
            }));
            this.items.push(...clones);
            this.setSelection(clones.map((c) => c.id), clones[0].id);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('duplicate');
        }

        deleteSelected() {
            if (!this.selectedIds.length && !this.selectedId) return;
            const removeSet = new Set(this.selectedIds.length ? this.selectedIds : [this.selectedId]);
            this.items = this.items.filter((i) => !removeSet.has(i.id));
            this.clearSelection();
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('delete');
        }

        normalizeZIndexOrder() {
            this.items
                .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                .forEach((item, idx) => { item.zIndex = idx + 1; });
        }

        moveLayer(id, dir) {
            this.normalizeZIndexOrder();
            const ordered = [...this.items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            const idx = ordered.findIndex((x) => x.id === id);
            if (idx < 0) return;
            const swapIdx = dir === 'up' ? idx + 1 : idx - 1;
            if (swapIdx < 0 || swapIdx >= ordered.length) return;
            const current = ordered[idx];
            const target = ordered[swapIdx];
            const tmp = current.zIndex;
            current.zIndex = target.zIndex;
            target.zIndex = tmp;
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('move-layer');
        }

        applyAlign(mode) {
            const canvas = this.mount.querySelector('#gmd-canvas');
            const safe = this.mount.querySelector('#gmd-safe-area');
            const selected = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
            if (!canvas || !safe || !selected.length) return;
            const safeRect = safe.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const left = Math.round(safeRect.left - canvasRect.left);
            const top = Math.round(safeRect.top - canvasRect.top);
            const right = Math.round(left + safe.clientWidth);
            const bottom = Math.round(top + safe.clientHeight);
            selected.forEach((item) => {
                if (mode === 'left') item.x = left;
                if (mode === 'center-x') item.x = Math.round(left + ((safe.clientWidth - item.width) / 2));
                if (mode === 'right') item.x = Math.round(right - item.width);
                if (mode === 'top') item.y = top;
                if (mode === 'center-y') item.y = Math.round(top + ((safe.clientHeight - item.height) / 2));
                if (mode === 'bottom') item.y = Math.round(bottom - item.height);
                item.x = Math.max(left, Math.min(item.x, right - item.width));
                item.y = Math.max(top, Math.min(item.y, bottom - item.height));
            });
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory(`align-${mode}`);
        }

        applyDistribute(axis) {
            const selected = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
            if (selected.length < 3) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('warning', 'Cần chọn ít nhất 3 phần quà để căn đều khoảng cách');
                }
                return;
            }
            if (axis === 'x') {
                const sorted = [...selected].sort((a, b) => a.x - b.x);
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                const span = (last.x + last.width) - first.x;
                const totalWidth = sorted.reduce((sum, i) => sum + i.width, 0);
                const gap = (span - totalWidth) / (sorted.length - 1);
                if (!Number.isFinite(gap)) return;
                let cursor = first.x;
                sorted.forEach((item) => {
                    item.x = Math.round(cursor);
                    cursor += item.width + gap;
                });
            } else {
                const sorted = [...selected].sort((a, b) => a.y - b.y);
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                const span = (last.y + last.height) - first.y;
                const totalHeight = sorted.reduce((sum, i) => sum + i.height, 0);
                const gap = (span - totalHeight) / (sorted.length - 1);
                if (!Number.isFinite(gap)) return;
                let cursor = first.y;
                sorted.forEach((item) => {
                    item.y = Math.round(cursor);
                    cursor += item.height + gap;
                });
            }
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory(`distribute-${axis}`);
        }

        applySnapForItem(baseX, baseY, item) {
            if (!this.snapEnabled) return { x: baseX, y: baseY, guideX: null, guideY: null };
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (!canvas) return { x: baseX, y: baseY, guideX: null, guideY: null };
            const threshold = 8;
            const cx = Math.round((canvas.clientWidth - item.width) / 2);
            const cy = Math.round((canvas.clientHeight - item.height) / 2);
            const candidatesX = [0, cx, canvas.clientWidth - item.width];
            const candidatesY = [0, cy, canvas.clientHeight - item.height];
            let x = baseX;
            let y = baseY;
            let guideX = null;
            let guideY = null;
            candidatesX.forEach((v) => {
                if (Math.abs(x - v) <= threshold) { x = v; guideX = Math.round(v + (item.width / 2)); }
            });
            candidatesY.forEach((v) => {
                if (Math.abs(y - v) <= threshold) { y = v; guideY = Math.round(v + (item.height / 2)); }
            });
            return { x, y, guideX, guideY };
        }

        updateGuides(guideX = null, guideY = null) {
            const gx = this.mount.querySelector('#gmd-guide-x');
            const gy = this.mount.querySelector('#gmd-guide-y');
            if (gx) {
                gx.style.display = guideX == null ? 'none' : 'block';
                if (guideX != null) gx.style.left = `${guideX}px`;
            }
            if (gy) {
                gy.style.display = guideY == null ? 'none' : 'block';
                if (guideY != null) gy.style.top = `${guideY}px`;
            }
        }

        setAspectRatio(ratio) {
            this.aspectRatio = ratio;
            this.mount.querySelectorAll('[data-ratio]').forEach((b) => b.classList.toggle('active', b.dataset.ratio === ratio));
            this.updateCanvasSizeByRatio();
        }

        updateCanvasSizeByRatio() {
            const safe = this.mount.querySelector('#gmd-safe-area');
            if (!safe) return;
            const map = { '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 }, '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 }, '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 } };
            const cfg = map[this.aspectRatio] || map['9:16'];
            safe.style.width = `${cfg.width}px`;
            safe.style.height = `${cfg.height}px`;
            this.canvasSize = { width: cfg.canvasW, height: cfg.canvasH };
            this.applyZoom();
        }

        applyZoom() {
            const stage = this.mount.querySelector('#gmd-stage');
            const zoomText = this.mount.querySelector('#gmd-zoom-value');
            if (stage) stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
            if (zoomText) zoomText.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (canvas) canvas.classList.toggle('is-zoomed', this.zoomLevel > 1.01);
        }

        setZoom(nextZoom) {
            this.zoomLevel = Math.max(0.5, Math.min(2, nextZoom));
            if (this.zoomLevel <= 1) {
                this.panX = 0;
                this.panY = 0;
            }
            this.applyZoom();
        }

        clientToCanvasPoint(clientX, clientY) {
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (!canvas) return { x: 0, y: 0 };
            const rect = canvas.getBoundingClientRect();
            const cx = canvas.clientWidth / 2;
            const cy = canvas.clientHeight / 2;
            const px = clientX - rect.left;
            const py = clientY - rect.top;
            return {
                x: (((px - cx) - this.panX) / this.zoomLevel) + cx,
                y: (((py - cy) - this.panY) / this.zoomLevel) + cy
            };
        }

        async saveLayout(showToast = true) {
            const canvas = this.mount ? this.mount.querySelector('#gmd-canvas') : null;
            const safe = this.mount ? this.mount.querySelector('#gmd-safe-area') : null;
            const liveCanvasSize = {
                width: canvas && canvas.clientWidth ? canvas.clientWidth : this.canvasSize.width,
                height: canvas && canvas.clientHeight ? canvas.clientHeight : this.canvasSize.height
            };
            const safeSize = {
                width: safe && safe.clientWidth ? safe.clientWidth : 360,
                height: safe && safe.clientHeight ? safe.clientHeight : 640
            };
            const safeOffset = {
                x: Math.round((liveCanvasSize.width - safeSize.width) / 2),
                y: Math.round((liveCanvasSize.height - safeSize.height) / 2)
            };
            const exportSize = this.aspectRatio === '9:16'
                ? { width: 1080, height: 1920 }
                : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
            const sx = exportSize.width / safeSize.width;
            const sy = exportSize.height / safeSize.height;
            const exportedItems = this.items.map((i) => ({
                ...i,
                x: Math.round((i.x - safeOffset.x) * sx),
                y: Math.round((i.y - safeOffset.y) * sy),
                width: Math.round(i.width * sx),
                height: Math.round(i.height * sy),
                textSize: Number(i.textSize || 13) * ((sx + sy) / 2),
                textGap: Number(i.textGap || 4) * sy
            }));
            const payload = {
                version: 2,
                savedAt: new Date().toISOString(),
                aspectRatio: this.aspectRatio,
                canvasSize: liveCanvasSize,
                safeArea: { ...safeSize, ...safeOffset },
                exportSize,
                items: this.items.map((i) => ({ ...i })),
                exportedItems
            };
            localStorage.setItem('giftMenuDesignerLayoutV2', JSON.stringify(payload));
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, { method: 'POST', headers, body: JSON.stringify(payload) });
            } catch (_e) {}
            if (showToast && window.app && typeof window.app.showNotification === 'function') window.app.showNotification('success', 'Đã lưu layout');
            this.renderMyLibrary();
        }

        async exportToOBS() {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/obs/setup-gift-menu`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({})
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    const msg = (data && (data.message || data.error)) || 'Không thể kết nối OBS';
                    throw new Error(msg);
                }
                return data;
            } catch (e) {
                throw e;
            }
        }

        async saveAndExport() {
            try {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('info', 'Đang lưu và đẩy Gift Menu lên OBS...');
                }
                await this.saveLayout(false);
                const data = await this.exportToOBS();
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('success', `Đã lưu & kết nối OBS (${data.sourceName || 'gift_menu_overlay'})`);
                }
            } catch (e) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', `Lưu & xuất thất bại: ${e.message || 'Lỗi không xác định'}`);
                }
            }
        }

        async loadLayout() {
            let payload = null;
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && data.layout) payload = data.layout;
                }
            } catch (_e) {}
            if (!payload) {
                try { payload = JSON.parse(localStorage.getItem('giftMenuDesignerLayoutV2') || 'null'); } catch (_e) { payload = null; }
            }
            if (!payload || !Array.isArray(payload.items)) return;
            this.aspectRatio = payload.aspectRatio || '9:16';
            this.items = payload.items.map((item, idx) => ({
                ...item,
                animationSpeed: Number(item.animationSpeed || 1),
                auraSpeed: Number(item.auraSpeed || 1),
                auraScale: Number(item.auraScale || 1),
                visible: item.visible !== false,
                locked: Boolean(item.locked),
                zIndex: item.zIndex || idx + 1
            }));
            this.setSelection(this.items[0] ? [this.items[0].id] : [], this.items[0] ? this.items[0].id : null);
            this.setAspectRatio(this.aspectRatio);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.history = [];
            this.historyIndex = -1;
            this.pushHistory('load-layout');
        }

        renderMyLibrary() {
            const box = this.mount.querySelector('#gmd-my-library-list');
            if (!box) return;
            box.innerHTML = `<div class="gmd-my-library-item active"><strong>New Menu</strong><span>${this.items.length} phần quà</span><i class="fas fa-check-circle"></i></div>`;
        }

        clampInsideCanvas(item) {
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (!canvas) return;
            item.width = Math.max(30, Math.min(item.width, canvas.clientWidth));
            item.height = Math.max(30, Math.min(item.height, canvas.clientHeight));
            item.x = Math.max(0, Math.min(item.x, canvas.clientWidth - item.width));
            item.y = Math.max(0, Math.min(item.y, canvas.clientHeight - item.height));
        }

        bindEvents() {
            this.mount.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                const giftCard = e.target.closest('.gmd-gift-card');
                const itemNode = e.target.closest('.gmd-item');
                const clickedCanvas = e.target.closest('#gmd-canvas');
                
                // Goal Board Mode Clicks
                if (this.mode === 'goal-board') {
                    const tabBtn = e.target.closest('[data-panel-tab]');
                    if (tabBtn) {
                        this.leftPanelTab = tabBtn.dataset.panelTab;
                        this.renderLeftPanel();
                        return;
                    }
                    const tmplCard = e.target.closest('.gmd-template-card');
                    if (tmplCard) {
                        this.addTemplateToCanvas(tmplCard.dataset.templateId);
                        return;
                    }
                    if (btn) {
                        const action = btn.dataset.action;
                        const layerId = btn.dataset.layerId;
                        
                        if (action === 'goal-layer-select' && layerId) {
                            if (e.shiftKey) {
                                if (this.goalBoard.selectedIds.includes(layerId)) {
                                    this.goalBoard.selectedIds = this.goalBoard.selectedIds.filter(id => id !== layerId);
                                    if (this.goalBoard.selectedId === layerId) {
                                        this.goalBoard.selectedId = this.goalBoard.selectedIds[0] || null;
                                    }
                                } else {
                                    this.goalBoard.selectedIds.push(layerId);
                                    this.goalBoard.selectedId = layerId;
                                }
                            } else {
                                this.goalBoard.selectedId = layerId;
                                this.goalBoard.selectedIds = [layerId];
                            }
                            this.renderCanvas();
                            this.renderInspector();
                            return;
                        }
                        if (action === 'goal-layer-toggle-visible' && layerId) {
                            const item = this.goalBoard.items.find(x => x.id === layerId);
                            if (item) {
                                item.visible = item.visible === false;
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-toggle-visible');
                            }
                            return;
                        }
                        if (action === 'goal-layer-toggle-lock' && layerId) {
                            const item = this.goalBoard.items.find(x => x.id === layerId);
                            if (item) {
                                item.locked = !item.locked;
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-toggle-lock');
                            }
                            return;
                        }
                        if (action === 'goal-layer-up' && layerId) {
                            const items = this.goalBoard.items;
                            const idx = items.findIndex(x => x.id === layerId);
                            if (idx < items.length - 1) {
                                const tmp = items[idx].zIndex;
                                items[idx].zIndex = items[idx+1].zIndex;
                                items[idx+1].zIndex = tmp;
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-layer-up');
                            }
                            return;
                        }
                        if (action === 'goal-layer-down' && layerId) {
                            const items = this.goalBoard.items;
                            const idx = items.findIndex(x => x.id === layerId);
                            if (idx > 0) {
                                const tmp = items[idx].zIndex;
                                items[idx].zIndex = items[idx-1].zIndex;
                                items[idx-1].zIndex = tmp;
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-layer-down');
                            }
                            return;
                        }
                        if (action === 'goal-duplicate') {
                            const sel = this.goalBoard.items.find(x => x.id === this.goalBoard.selectedId);
                            if (sel) {
                                const clone = {
                                    ...sel,
                                    id: `asset_dup_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                                    x: sel.x + 30,
                                    y: sel.y + 30,
                                    zIndex: this.goalBoard.items.length + 1
                                };
                                this.goalBoard.items.push(clone);
                                this.goalBoard.selectedId = clone.id;
                                this.goalBoard.selectedIds = [clone.id];
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-duplicate');
                            }
                            return;
                        }
                        if (action === 'goal-delete') {
                            if (this.goalBoard.selectedId) {
                                this.goalBoard.items = this.goalBoard.items.filter(x => x.id !== this.goalBoard.selectedId);
                                this.goalBoard.selectedId = null;
                                this.goalBoard.selectedIds = [];
                                this.renderCanvas();
                                this.renderInspector();
                                this.pushHistory('goal-delete');
                            }
                            return;
                        }
                        if (action === 'save-new-template') {
                            this.showSaveTemplateModal();
                            return;
                        }
                    }
                }
                
                // Switch Mode click
                const modeBtn = e.target.closest('[data-action="switch-mode"]');
                if (modeBtn) {
                    this.switchMode(modeBtn.dataset.mode);
                    return;
                }
                
                if (this.mode === 'goal-board') {
                    const clickedInspectorTab = e.target.closest('.gmd-inspector-tabs button');
                    if (clickedInspectorTab) {
                        this.inspectorTab = clickedInspectorTab.dataset.tab;
                        this.renderInspector();
                    }
                    return;
                }

                // Restore original Gift Menu Card, Canvas clicks
                if (giftCard) this.addGiftToCanvas(giftCard.dataset.giftId);
                if (itemNode) this.selectItem(itemNode.dataset.itemId, e.shiftKey);
                if (!giftCard && !itemNode && !btn && clickedCanvas) {
                    this.clearSelection();
                    this.renderCanvas();
                    this.renderInspector();
                }
                if (!btn) return;
                const action = btn.dataset.action;
                const layerId = btn.dataset.layerId;
                const tab = btn.dataset.tab;
                if (tab === 'gift' || tab === 'layers') {
                    this.inspectorTab = tab;
                    this.renderInspector();
                    return;
                }
                if (action === 'layer-select' && layerId) {
                    this.selectItem(layerId, e.shiftKey);
                    return;
                }
                if (action === 'layer-toggle-visible' && layerId) {
                    const item = this.items.find((x) => x.id === layerId);
                    if (!item) return;
                    item.visible = item.visible === false;
                    if (item.visible === false && this.isSelected(layerId)) {
                        this.setSelection(this.selectedIds.filter((x) => x !== layerId), this.selectedId === layerId ? null : this.selectedId);
                    }
                    this.renderCanvas();
                    this.renderInspector();
                    this.pushHistory('toggle-visible');
                    return;
                }
                if (action === 'layer-toggle-lock' && layerId) {
                    const item = this.items.find((x) => x.id === layerId);
                    if (!item) return;
                    item.locked = !item.locked;
                    this.renderCanvas();
                    this.renderInspector();
                    this.pushHistory('toggle-lock');
                    return;
                }
                if (action === 'layer-up' && layerId) {
                    this.moveLayer(layerId, 'up');
                    return;
                }
                if (action === 'layer-down' && layerId) {
                    this.moveLayer(layerId, 'down');
                    return;
                }
                if (action === 'snap-toggle') {
                    this.snapEnabled = !this.snapEnabled;
                    btn.classList.toggle('active', this.snapEnabled);
                    return;
                }
                if (action === 'align-left') this.applyAlign('left');
                if (action === 'align-center-x') this.applyAlign('center-x');
                if (action === 'align-right') this.applyAlign('right');
                if (action === 'align-top') this.applyAlign('top');
                if (action === 'align-center-y') this.applyAlign('center-y');
                if (action === 'align-bottom') this.applyAlign('bottom');
                if (action === 'distribute-x') this.applyDistribute('x');
                if (action === 'distribute-y') this.applyDistribute('y');
                if (action === 'duplicate') this.duplicateSelected();
                if (action === 'delete') this.deleteSelected();
                if (action === 'undo') this.undo();
                if (action === 'redo') this.redo();
                if (action === 'save-new-template') {
                    this.showSaveTemplateModal();
                    return;
                }
                if (action === 'save') {
                    if (this.mode === 'goal-board') this.saveGoalBoardLayout(true);
                    else this.saveLayout(true);
                }
                if (action === 'save-export') {
                    if (this.mode === 'goal-board') this.saveGoalBoardLayout(true);
                    else this.saveAndExport();
                }
                if (action === 'preview-browser') {
                    if (this.mode === 'goal-board') window.open(`${this.apiBase}/overlay/goal-board-overlay.html`, '_blank');
                    else window.open(`${this.apiBase}/overlay/gift-menu/`, '_blank');
                }
                if (action === 'new-layout') { this.items = []; this.clearSelection(); this.renderCanvas(); this.renderInspector(); this.renderMyLibrary(); this.pushHistory('new-layout'); }
                if (action === 'zoom-in') this.setZoom(this.zoomLevel + 0.1);
                if (action === 'zoom-out') this.setZoom(this.zoomLevel - 0.1);
            });

            const handleInputChange = (e) => {
                const el = e.target;
                
                // Goal Board inputs
                if (this.mode === 'goal-board') {
                    if (el.dataset && el.dataset.goalKey) {
                        const key = el.dataset.goalKey;
                        const value = el.type === 'checkbox' ? el.checked : el.value;
                        this.updateGoalBoardSelectedItem(key, value);
                    }
                    return;
                }
                
                if (el.id === 'gmd-search') {
                    const q = String(el.value || '').trim().toLowerCase();
                    this.filteredGifts = this.gifts.filter((g) => String(g.name || '').toLowerCase().includes(q) || String(g.id || '').toLowerCase().includes(q));
                    this.renderGiftLibrary();
                    return;
                }
                if (el.dataset && el.dataset.key) {
                    const key = el.dataset.key;
                    const value = el.type === 'checkbox' ? el.checked : el.value;
                    this.updateSelectedItem(key, value, false);
                    this.syncInspectorLinkedControls(el, key, value);
                }
            };

            this.mount.addEventListener('input', handleInputChange);
            this.mount.addEventListener('change', handleInputChange);

            this.mount.querySelectorAll('[data-ratio]').forEach((btn) => btn.addEventListener('click', () => this.setAspectRatio(btn.dataset.ratio)));

            this.mount.addEventListener('dragstart', (e) => {
                if (this.mode === 'goal-board') {
                    const assetCard = e.target.closest('.gmd-asset-card');
                    if (assetCard) {
                        e.dataTransfer.setData('asset-url', assetCard.dataset.assetUrl || '');
                        e.dataTransfer.setData('asset-name', assetCard.dataset.assetName || '');
                        e.dataTransfer.setData('asset-type', assetCard.dataset.assetType || '');
                    }
                    const tmplCard = e.target.closest('.gmd-template-card');
                    if (tmplCard) {
                        e.dataTransfer.setData('template-id', tmplCard.dataset.templateId || '');
                    }
                    return;
                }
                const giftCard = e.target.closest('.gmd-gift-card');
                if (!giftCard) return;
                e.dataTransfer.setData('text/plain', giftCard.dataset.giftId || '');
            });

            const canvas = this.mount.querySelector('#gmd-canvas');
            if (canvas) {
                canvas.addEventListener('dragover', (e) => e.preventDefault());
                canvas.addEventListener('drop', (e) => {
                    e.preventDefault();
                    
                    if (this.mode === 'goal-board') {
                        const assetUrl = e.dataTransfer.getData('asset-url');
                        const assetName = e.dataTransfer.getData('asset-name');
                        const assetType = e.dataTransfer.getData('asset-type');
                        const templateId = e.dataTransfer.getData('template-id');
                        
                        const safe = this.mount.querySelector('#gmd-safe-area');
                        const s = safe.clientWidth / 1080;
                        const rect = safe.getBoundingClientRect();
                        
                        const px = e.clientX - rect.left;
                        const py = e.clientY - rect.top;
                        
                        if (templateId) {
                            // Center the template dynamically on the drop cursor based on its bounding box
                            this.addTemplateToCanvas(templateId, px / s, py / s);
                            return;
                        }
                        
                        if (!assetUrl) return;
                        
                        const lx = px / s - 180;
                        const ly = py / s - 180;
                        
                        this.addAssetToCanvas(assetUrl, assetName, assetType, lx, ly);
                        return;
                    }
                    
                    const giftId = e.dataTransfer.getData('text/plain');
                    if (!giftId) return;
                    const point = this.clientToCanvasPoint(e.clientX, e.clientY);
                    const item = this.createItemFromGift(giftId, Math.round(point.x - 28), Math.round(point.y - 28));
                    if (!item) return;
                    this.clampInsideCanvas(item);
                    this.items.push(item);
                    this.setSelection([item.id], item.id);
                    this.renderCanvas();
                    this.renderInspector();
                    this.renderMyLibrary();
                    this.pushHistory('drop-gift');
                });
            }

            this.mount.addEventListener('mousedown', (e) => {
                if (this.mode === 'goal-board') {
                    this.handleGoalBoardMouseDown(e);
                    return;
                }
                const itemNode = e.target.closest('.gmd-item');
                if (!itemNode) {
                    const canvas = this.mount.querySelector('#gmd-canvas');
                    const allowPan = this.zoomLevel > 1.01 && (this.isSpacePressed || e.button === 1);
                    if (canvas && canvas.contains(e.target) && allowPan) {
                        e.preventDefault();
                        this.dragState = { mode: 'pan', sx: e.clientX, sy: e.clientY, panX: this.panX, panY: this.panY };
                        canvas.classList.add('is-panning');
                    }
                    return;
                }
                const item = this.items.find((x) => x.id === itemNode.dataset.itemId);
                if (!item) return;
                if (e.shiftKey) {
                    return;
                }
                if (item.locked) {
                    this.setSelection([item.id], item.id);
                    this.renderCanvas();
                    this.renderInspector();
                    return;
                }
                const handle = e.target.closest('[data-handle]');
                if (!this.isSelected(item.id)) this.setSelection([item.id], item.id);
                if (handle && handle.dataset.handle === 'resize') this.dragState = { mode: 'resize', id: item.id, sx: e.clientX, sy: e.clientY, width: item.width, height: item.height };
                else if (handle && handle.dataset.handle === 'rotate') this.dragState = { mode: 'rotate', id: item.id, sx: e.clientX, startRot: item.rotation };
                else {
                    const moving = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
                    const startPositions = Object.fromEntries(moving.map((m) => [m.id, { x: m.x, y: m.y }]));
                    this.dragState = { mode: 'move', id: item.id, sx: e.clientX, sy: e.clientY, x: item.x, y: item.y, movingIds: moving.map((m) => m.id), startPositions };
                }
                this.renderCanvas();
                this.renderInspector();
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.dragState) return;
                
                if (this.dragState.mode === 'goal-move') {
                    const dx = e.clientX - this.dragState.sx;
                    const dy = e.clientY - this.dragState.sy;
                    const s = this.dragState.scale;
                    
                    const primaryItem = this.goalBoard.items.find(x => x.id === this.dragState.id);
                    if (primaryItem) {
                        const logicalDx = Math.round(dx / s);
                        const logicalDy = Math.round(dy / s);
                        
                        if (primaryItem.groupId) {
                            // Find all layers in this group and apply displacement based on original start coordinates
                            const groupItems = this.goalBoard.items.filter(x => x.groupId === primaryItem.groupId && !x.locked);
                            
                            // Compute overall group bounding box based on start coordinates to clamp group as a rigid unit
                            let minX = Infinity, minY = Infinity;
                            let maxX = -Infinity, maxY = -Infinity;
                            groupItems.forEach(item => {
                                const startPos = this.dragState.groupStarts[item.id];
                                if (startPos) {
                                    if (startPos.x < minX) minX = startPos.x;
                                    if (startPos.y < minY) minY = startPos.y;
                                    if (startPos.x + item.w > maxX) maxX = startPos.x + item.w;
                                    if (startPos.y + item.h > maxY) maxY = startPos.y + item.h;
                                }
                            });
                            
                            let allowedDx = logicalDx;
                            let allowedDy = logicalDy;
                            if (minX !== Infinity) {
                                allowedDx = Math.max(-minX, Math.min(allowedDx, 1080 - maxX));
                            }
                            if (minY !== Infinity) {
                                allowedDy = Math.max(-minY, Math.min(allowedDy, 1920 - maxY));
                            }
                            
                            groupItems.forEach(item => {
                                const startPos = this.dragState.groupStarts[item.id];
                                if (startPos) {
                                    item.x = startPos.x + allowedDx;
                                    item.y = startPos.y + allowedDy;
                                    
                                    // Update DOM directly to avoid restarting videos/WebMs
                                    const el = this.mount.querySelector(`[data-item-id="${item.id}"]`);
                                    if (el) {
                                        el.style.left = `${Math.round(item.x * s)}px`;
                                        el.style.top = `${Math.round(item.y * s)}px`;
                                    }
                                }
                            });
                        } else {
                            primaryItem.x = Math.round(this.dragState.x + logicalDx);
                            primaryItem.y = Math.round(this.dragState.y + logicalDy);
                            
                            primaryItem.x = Math.max(0, Math.min(primaryItem.x, 1080 - primaryItem.w));
                            primaryItem.y = Math.max(0, Math.min(primaryItem.y, 1920 - primaryItem.h));
                            
                            // Update DOM directly to avoid restarting videos/WebMs
                            const el = this.mount.querySelector(`[data-item-id="${primaryItem.id}"]`);
                            if (el) {
                                el.style.left = `${Math.round(primaryItem.x * s)}px`;
                                el.style.top = `${Math.round(primaryItem.y * s)}px`;
                            }
                        }
                        
                        this.renderInspector();
                    }
                    return;
                }
                
                if (this.dragState.mode === 'goal-resize') {
                    const dx = e.clientX - this.dragState.sx;
                    const dy = e.clientY - this.dragState.sy;
                    const s = this.dragState.scale;
                    
                    const item = this.goalBoard.items.find(x => x.id === this.dragState.id);
                    if (item) {
                        const logicalDx = dx / s;
                        const logicalDy = dy / s;
                        
                        const groupItems = item.groupId 
                            ? this.goalBoard.items.filter(x => x.groupId === item.groupId && !x.locked)
                            : [];
                            
                        if (item.groupId && groupItems.length > 1 && this.dragState.groupStarts[item.id]) {
                            const primaryStart = this.dragState.groupStarts[item.id];
                            // Scale factor of the primary resized item
                            const scaleW = Math.max(0.1, (primaryStart.w + logicalDx) / primaryStart.w);
                            
                            const minX = this.dragState.minX;
                            const minY = this.dragState.minY;
                            
                            groupItems.forEach(gItem => {
                                const start = this.dragState.groupStarts[gItem.id];
                                if (start) {
                                    gItem.w = Math.max(20, Math.round(start.w * scaleW));
                                    gItem.h = Math.max(10, Math.round(start.h * scaleW));
                                    gItem.x = Math.round(minX + (start.x - minX) * scaleW);
                                    gItem.y = Math.round(minY + (start.y - minY) * scaleW);
                                    
                                    // Scale text font size if it is a text layer
                                    if (gItem.type === 'text') {
                                        gItem.fontSize = Math.max(10, Math.round(start.fontSize * scaleW));
                                    }
                                }
                            });
                        } else {
                            if (item.lockRatio) {
                                const ratio = this.dragState.h / this.dragState.w;
                                item.w = Math.round(this.dragState.w + logicalDx);
                                item.w = Math.max(100, Math.min(item.w, 1080));
                                item.h = Math.round(item.w * ratio);
                            } else {
                                item.w = Math.round(this.dragState.w + logicalDx);
                                item.w = Math.max(100, Math.min(item.w, 1080));
                                item.h = Math.round(this.dragState.h + logicalDy);
                                item.h = Math.max(30, Math.min(item.h, 1920));
                            }
                        }
                        
                        this.renderCanvas();
                        this.renderInspector();
                    }
                    return;
                }
                
                const item = this.items.find((x) => x.id === this.dragState.id);
                if (this.dragState.mode === 'pan') {
                    this.panX = this.dragState.panX + (e.clientX - this.dragState.sx);
                    this.panY = this.dragState.panY + (e.clientY - this.dragState.sy);
                    this.applyZoom();
                    return;
                }
                if (!item) return;
                if (this.dragState.mode === 'move') {
                    const dx = ((e.clientX - this.dragState.sx) / this.zoomLevel);
                    const dy = ((e.clientY - this.dragState.sy) / this.zoomLevel);
                    const baseX = Math.round(this.dragState.x + dx);
                    const baseY = Math.round(this.dragState.y + dy);
                    const snapped = this.applySnapForItem(baseX, baseY, item);
                    const snapDx = snapped.x - this.dragState.x;
                    const snapDy = snapped.y - this.dragState.y;
                    (this.dragState.movingIds || [item.id]).forEach((id) => {
                        const movingItem = this.items.find((x) => x.id === id);
                        const start = this.dragState.startPositions ? this.dragState.startPositions[id] : null;
                        if (!movingItem || !start) return;
                        movingItem.x = Math.round(start.x + snapDx);
                        movingItem.y = Math.round(start.y + snapDy);
                        this.clampInsideCanvas(movingItem);
                    });
                    this.updateGuides(snapped.guideX, snapped.guideY);
                } else if (this.dragState.mode === 'resize') {
                    const dx = (e.clientX - this.dragState.sx) / this.zoomLevel;
                    const dy = (e.clientY - this.dragState.sy) / this.zoomLevel;
                    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                    const nextSize = Math.round(this.dragState.width + delta);
                    item.width = nextSize;
                    item.height = nextSize;
                    this.clampInsideCanvas(item);
                } else if (this.dragState.mode === 'rotate') item.rotation = Math.round(this.dragState.startRot + (e.clientX - this.dragState.sx) * 0.7);
                this.renderCanvas();
                this.renderInspector();
            });

            window.addEventListener('mouseup', () => {
                if (this.dragState && this.dragState.mode && this.dragState.mode.startsWith('goal-')) {
                    this.renderCanvas(); // Final render to sync DOM structure
                    this.pushHistory('goal-drag-finish');
                    this.dragState = null;
                    return;
                }
                if (this.dragState && this.dragState.mode !== 'pan') this.pushHistory('drag-finish');
                this.updateGuides(null, null);
                this.dragState = null;
            });

            window.addEventListener('mouseup', () => {
                const canvas = this.mount.querySelector('#gmd-canvas');
                if (canvas) canvas.classList.remove('is-panning');
            });

            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = true;
                    const canvas = this.mount.querySelector('#gmd-canvas');
                    if (canvas && this.zoomLevel > 1.01) canvas.classList.add('is-pan-mode');
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = false;
                    const canvas = this.mount.querySelector('#gmd-canvas');
                    if (canvas) {
                        canvas.classList.remove('is-pan-mode');
                        canvas.classList.remove('is-panning');
                    }
                }
            });
        }

        // ==========================================
        // GOAL BOARD DESIGNER METHODS (PHASE 1)
        // ==========================================
        
        switchMode(newMode) {
            if (this.mode === newMode) return;
            this.mode = newMode;
            
            const designerEl = this.mount.querySelector('.gift-menu-designer');
            const myLibPanel = this.mount.querySelector('#gmd-my-library-panel');
            const leftCol = this.mount.querySelector('.gmd-left-col');
            const saveTemplateBtn = document.getElementById('gmd-save-template-btn');
            
            this.mount.querySelectorAll('[data-action="switch-mode"]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === newMode);
            });
            
            if (saveTemplateBtn) {
                saveTemplateBtn.style.display = newMode === 'goal-board' ? 'inline-flex' : 'none';
            }
            
            if (newMode === 'goal-board') {
                if (designerEl) designerEl.classList.add('goal-board-active');
                if (myLibPanel) myLibPanel.style.display = 'none';
                if (leftCol) leftCol.style.gridTemplateRows = '1fr';
                
                const ratioGroup = this.mount.querySelector('.gmd-ratios');
                if (ratioGroup) ratioGroup.style.display = 'none';
                
                this.inspectorTab = 'gift';
                this.loadGoalBoardLayout();
                this.loadGoalAssets();
                this.loadGoalTemplates();
            } else {
                if (designerEl) designerEl.classList.remove('goal-board-active');
                if (myLibPanel) myLibPanel.style.display = '';
                if (leftCol) leftCol.style.gridTemplateRows = '';
                
                const ratioGroup = this.mount.querySelector('.gmd-ratios');
                if (ratioGroup) ratioGroup.style.display = '';
                
                this.loadLayout();
            }
            
            this.renderLeftPanel();
        }

        renderLeftPanel() {
            const leftPanel = this.mount.querySelector('.gmd-library-panel');
            if (!leftPanel) return;
            
            if (this.mode !== 'goal-board') {
                leftPanel.innerHTML = `
                    <h3>1. Chọn quà tặng</h3>
                    <p class="gmd-subline">Kéo thả hoặc click để thêm vào menu</p>
                    <div class="gmd-library-controls">
                        <div class="gmd-search-wrap">
                            <i class="fas fa-search"></i>
                            <input id="gmd-search" class="gmd-input" placeholder="Tìm quà..." value="" />
                        </div>
                        <button class="gmd-add-btn"><i class="fas fa-plus"></i></button>
                    </div>
                    <div id="gmd-gift-list" class="gmd-gift-list"></div>
                `;
                this.renderGiftLibrary();
                return;
            }
            
            leftPanel.innerHTML = `
                <div class="gmd-tabs-header">
                    <button class="gmd-tab-btn ${this.leftPanelTab === 'templates' ? 'active' : ''}" data-panel-tab="templates"><i class="fas fa-cubes"></i> Bảng có sẵn</button>
                    <button class="gmd-tab-btn ${this.leftPanelTab === 'assets' ? 'active' : ''}" data-panel-tab="assets"><i class="fas fa-images"></i> Tài nguyên</button>
                </div>
                <div id="gmd-goal-library-content" style="height: calc(100% - 44px); min-height: 0; overflow: hidden;"></div>
            `;
            
            const libContent = leftPanel.querySelector('#gmd-goal-library-content');
            if (this.leftPanelTab === 'templates') {
                const standardTemplates = this.getDefaultTemplates();
                const allTemplates = [...(this.customTemplates || []), ...standardTemplates];
                libContent.innerHTML = `
                    <div class="gmd-template-grid">
                        ${allTemplates.map(t => {
                            let previewHTML = '';
                            if (t.id === 'tmpl_neon_purple') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at top left, #1e1145, #090518); border: 1px solid #ff007f; box-shadow: 0 0 10px rgba(255,0,127,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 800; color: #fff; line-height: 1;">
                                            <span style="text-shadow: 0 0 4px #ff007f; display: flex; align-items: center; gap: 2px;">🎁 Mở quà bí mật</span>
                                            <span style="color: #ff007f; text-shadow: 0 0 4px #ff007f; font-size: 7px;">30%</span>
                                        </div>
                                        <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden; border: 1px solid rgba(255, 0, 127, 0.2); position: relative; box-sizing: border-box;">
                                            <div style="height: 100%; border-radius: 99px; width: 30%; background: linear-gradient(90deg, #ff007f, #a855f7); box-shadow: 0 0 8px #ff007f;"></div>
                                        </div>
                                        <div style="font-size: 5px; color: #a855f7; opacity: 0.8; text-align: left; line-height: 1;">Mục tiêu: 150/500 Rose</div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_boss_challenge_gaming') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1f0b0b, #0c0202); border: 1px solid #ef4444; box-shadow: 0 0 10px rgba(239,68,68,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; font-weight: 900; color: #ff5f5f; line-height: 1;">
                                            <span style="display: flex; align-items: center; gap: 3px; text-shadow: 0 0 4px #ef4444;">🐉 BOSS HP</span>
                                            <span style="color: #ef4444; text-shadow: 0 0 4px #ef4444; font-size: 6px;">35%</span>
                                        </div>
                                        <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 2px; overflow: hidden; border: 1px solid rgba(239, 68, 68, 0.2); position: relative; box-sizing: border-box;">
                                            <div style="height: 100%; width: 35%; background: linear-gradient(90deg, #b91c1c, #ef4444); box-shadow: 0 0 8px #ef4444;"></div>
                                        </div>
                                        <div style="font-size: 5px; color: #9ca3af; text-align: left; display: flex; justify-content: space-between; line-height: 1;">
                                            <span>⚔️ Corgi tấn công</span>
                                            <span style="color: #ef4444;">3.5k/10k</span>
                                        </div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_lucky_mystery_box') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1b0e3d, #080315); border: 1px solid #a855f7; box-shadow: 0 0 10px rgba(168,85,247,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 800; color: #fbbf24; text-shadow: 0 0 4px #fbbf24; line-height: 1;">
                                            <span>LUCKY BOX</span>
                                            <span style="font-size: 6px; color: #a855f7;">70%</span>
                                        </div>
                                        <div style="width: 100%; height: 5px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden; border: 1px solid rgba(168, 85, 247, 0.2); box-sizing: border-box;">
                                            <div style="height: 100%; width: 70%; background: linear-gradient(90deg, #a855f7, #f43f5e); box-shadow: 0 0 6px #d946ef;"></div>
                                        </div>
                                        <div style="font-size: 5px; color: #cbd5e1; opacity: 0.8; line-height: 1; text-align: left;">Rose để mở hộp</div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_cute_pink_idol') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #2e121e, #14050b); border: 1px solid #fb7185; box-shadow: 0 0 10px rgba(251,113,133,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 800; color: #fecdd3; line-height: 1;">
                                            <span style="display: flex; align-items: center; gap: 2px;">💖 Cute Challenge</span>
                                            <span style="color: #fb7185; text-shadow: 0 0 4px #fb7185; font-size: 7px;">40%</span>
                                        </div>
                                        <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden; border: 1px solid rgba(251, 113, 133, 0.2); box-sizing: border-box;">
                                            <div style="height: 100%; width: 40%; background: linear-gradient(90deg, #fb7185, #f472b6); box-shadow: 0 0 6px #fb7185;"></div>
                                        </div>
                                        <div style="font-size: 5px; color: #fda4af; text-align: left; opacity: 0.9; line-height: 1;">Mục tiêu: 120/300 Rose</div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_luxury_gold_vip') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #251b05, #0c0801); border: 1px solid #fbbf24; box-shadow: 0 0 10px rgba(251,191,36,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 900; color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.4); line-height: 1;">
                                            <span style="display: flex; align-items: center; gap: 3px;">👑 VIP GOAL</span>
                                            <span style="font-size: 7px; color: #fff;">40%</span>
                                        </div>
                                        <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 4px; overflow: hidden; border: 1px solid rgba(251, 196, 36, 0.2); box-sizing: border-box;">
                                            <div style="height: 100%; width: 40%; background: linear-gradient(90deg, #f59e0b, #fbbf24); box-shadow: 0 0 6px #fbbf24;"></div>
                                        </div>
                                        <div style="font-size: 5px; color: #d97706; text-align: left; font-weight: bold; line-height: 1;">Galaxy: 2/5</div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_multi_goal_list') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #0e172a, #020617); border: 1px solid #38bdf8; box-shadow: 0 0 8px rgba(56,189,248,0.15); border-radius: 6px; padding: 4px 8px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 3px; box-sizing: border-box; overflow: hidden; position: relative;">
                                        <div style="font-size: 7px; font-weight: 800; color: #38bdf8; text-align: center; border-bottom: 1px solid rgba(56,189,248,0.2); padding-bottom: 1px; margin-bottom: 1px; text-transform: uppercase; line-height: 1;">🎯 MỤC TIÊU HÔM NAY</div>
                                        <div style="display: flex; flex-direction: column; gap: 2px;">
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #fff; line-height: 1;">
                                                <span style="width: 25px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; text-align: left;">🌹 Rose</span>
                                                <div style="flex: 1; height: 3px; background: rgba(0,0,0,0.5); border-radius: 2px; overflow: hidden;">
                                                    <div style="height: 100%; width: 30%; background: #ff007f;"></div>
                                                </div>
                                                <span style="color: #ff007f; font-weight: bold;">30%</span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #fff; line-height: 1;">
                                                <span style="width: 25px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; text-align: left;">🔥 TikTok</span>
                                                <div style="flex: 1; height: 3px; background: rgba(0,0,0,0.5); border-radius: 2px; overflow: hidden;">
                                                    <div style="height: 100%; width: 32%; background: #2563eb;"></div>
                                                </div>
                                                <span style="color: #60a5fa; font-weight: bold;">32%</span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #fff; line-height: 1;">
                                                <span style="width: 25px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; text-align: left;">🐶 Corgi</span>
                                                <div style="flex: 1; height: 3px; background: rgba(0,0,0,0.5); border-radius: 2px; overflow: hidden;">
                                                    <div style="height: 100%; width: 30%; background: #eab308;"></div>
                                                </div>
                                                <span style="color: #facc15; font-weight: bold;">30%</span>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_top_supporters_board') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #111827, #030712); border: 1px solid #f59e0b; box-shadow: 0 0 10px rgba(245,158,11,0.2); border-radius: 6px; padding: 4px 8px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 2px; box-sizing: border-box; overflow: hidden; position: relative;">
                                        <div style="font-size: 7px; font-weight: 900; color: #f59e0b; text-align: center; border-bottom: 1px solid rgba(245,158,11,0.2); padding-bottom: 1px; display: flex; align-items: center; justify-content: center; gap: 3px; line-height: 1;">
                                            <span>🏆 TOP SUPPORTERS</span>
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 1px; width: 100%;">
                                            <div style="display: flex; justify-content: space-between; font-size: 5px; color: #fcd34d; background: rgba(245,158,11,0.15); padding: 1px 3px; border-radius: 2px; line-height: 1;">
                                                <span>🥇 #1 Streamer...</span>
                                                <span style="font-weight: 800;">1.2k💎</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 5px; color: #e2e8f0; padding: 1px 3px; line-height: 1;">
                                                <span>🥈 #2 FanCung</span>
                                                <span>850💎</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 5px; color: #9ca3af; padding: 1px 3px; line-height: 1;">
                                                <span>🥉 #3 User102</span>
                                                <span>620💎</span>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_combo_boost_popup') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: linear-gradient(135deg, #022c22, #064e3b, #020617); border: 1px solid #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.3); border-radius: 6px; padding: 6px 10px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box; overflow: hidden; position: relative;">
                                        <div style="position: relative; z-index: 2; font-size: 16px;">🔥</div>
                                        <div style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px;">
                                            <span style="font-size: 11px; font-weight: 900; color: #34d399; text-shadow: 0 0 6px #10b981; line-height: 1.1;">x10 COMBO!</span>
                                            <span style="font-size: 5px; color: #a7f3d0; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1;">Chuỗi quà liên tiếp</span>
                                        </div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_unlock_reward_board') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #0f172a, #020617); border: 1px solid #f43f5e; box-shadow: 0 0 10px rgba(244,63,94,0.25); border-radius: 6px; padding: 4px 8px; width: 100%; height: 100%; display: flex; align-items: center; gap: 6px; box-sizing: border-box; overflow: hidden; position: relative;">
                                        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; position: relative; z-index: 2;">
                                            <div style="font-size: 7px; font-weight: 800; color: #fda4af; text-shadow: 0 0 3px #f43f5e; line-height: 1; text-align: left;">🔒 SẮP MỞ KHÓA</div>
                                            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.08); border-radius: 99px; position: relative; margin: 2px 0; box-sizing: border-box;">
                                                <div style="height: 100%; width: 30%; background: #f43f5e; border-radius: 99px; box-shadow: 0 0 4px #f43f5e;"></div>
                                                <div style="position: absolute; top: -1px; left: 25%; width: 6px; height: 6px; border-radius: 50%; background: #f43f5e; border: 1px solid #fff;"></div>
                                                <div style="position: absolute; top: -1px; left: 50%; width: 6px; height: 6px; border-radius: 50%; background: #334155; border: 1px solid rgba(255,255,255,0.2);"></div>
                                                <div style="position: absolute; top: -1px; left: 75%; width: 6px; height: 6px; border-radius: 50%; background: #334155; border: 1px solid rgba(255,255,255,0.2);"></div>
                                                <div style="position: absolute; top: -1px; left: 95%; width: 6px; height: 6px; border-radius: 50%; background: #334155; border: 1px solid rgba(255,255,255,0.2);"></div>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 5px; color: #94a3b8; line-height: 1;">
                                                <span>30% Hoàn thành</span>
                                                <span style="color: #f43f5e;">150/500 Rose</span>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            } else if (t.id === 'tmpl_event_mission_board') {
                                previewHTML = `
                                    <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1e1b4b, #090514); border: 1px solid #8b5cf6; box-shadow: 0 0 10px rgba(139,92,246,0.25); border-radius: 6px; padding: 4px 8px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 2px; box-sizing: border-box; overflow: hidden; position: relative;">
                                        <div style="position: relative; z-index: 2; font-size: 7px; font-weight: 800; color: #a78bfa; text-align: center; border-bottom: 1px solid rgba(139,92,246,0.2); padding-bottom: 1px; margin-bottom: 1px; line-height: 1;">📋 NHIỆM VỤ LIVE</div>
                                        <div style="position: relative; z-index: 2; display: flex; flex-direction: column; gap: 1px; text-align: left;">
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #e2e8f0; line-height: 1;">
                                                <div style="width: 5px; height: 5px; border-radius: 50%; background: #8b5cf6; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #fff; font-weight: bold;">✓</div>
                                                <span>🌹 Gửi 150/500 Rose</span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #94a3b8; line-height: 1;">
                                                <div style="width: 5px; height: 5px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;"></div>
                                                <span>🐶 Gửi 3/10 Corgi</span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 3px; font-size: 5px; color: #94a3b8; line-height: 1;">
                                                <div style="width: 5px; height: 5px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;"></div>
                                                <span>🕶️ Gửi 1/3 Sunglasses</span>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            } else {
                                // Dynamic scans for user custom templates - Render a mini scale-down canvas to reflect all layers
                                let minX = Infinity, minY = Infinity;
                                let maxX = -Infinity, maxY = -Infinity;
                                (t.layers || []).forEach(l => {
                                    const lx = l.x || 0;
                                    const ly = l.y || 0;
                                    const lw = l.w || 100;
                                    const lh = l.h || 100;
                                    if (lx < minX) minX = lx;
                                    if (ly < minY) minY = ly;
                                    if (lx + lw > maxX) maxX = lx + lw;
                                    if (ly + lh > maxY) maxY = ly + lh;
                                });
                                
                                const bw = (maxX - minX > 0) ? (maxX - minX) : 1080;
                                const bh = (maxY - minY > 0) ? (maxY - minY) : 1920;
                                const maxScale = Math.min(80 / bw, 56 / bh);
                                
                                const miniLayersHTML = (t.layers || []).map(layer => {
                                    let contentHTML = '';
                                    if (layer.type === 'goal-bar') {
                                        const color = layer.barColor || '#ff007f';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at top left, ${color}12, #0f172a)`)}; border: 1px solid ${layer.hideBg ? 'transparent' : `${color}80`}; border-radius: 4px; box-sizing: border-box; display:flex; align-items:center; justify-content:center;"><div style="width:80%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;"><div style="width:30%; height:100%; background:${color}; border-radius:2px;"></div></div></div>`;
                                    } else if (layer.type === 'boss-bar') {
                                        const color = layer.barColor || '#ef4444';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: 1px solid ${color}; border-radius: 4px; box-sizing: border-box; display:flex; align-items:center; justify-content:center;"><div style="width:80%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;"><div style="width:35%; height:100%; background:${color}; border-radius:2px;"></div></div></div>`;
                                    } else if (layer.type === 'top-contributors' || layer.type === 'podium-contributors') {
                                        const color = layer.barColor || '#eab308';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: 1px solid ${color}; border-radius: 4px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:2px;"><div style="width:70%; height:2px; background:${color}60;"></div><div style="width:50%; height:2px; background:${color}40;"></div></div>`;
                                    } else if (layer.type === 'mystery-chests') {
                                        const color = layer.barColor || '#a855f7';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at center, rgba(168, 85, 247, 0.1) 0%, #0a0a14 100%)`)}; border: 1px solid ${color}; border-radius: 4px; display:flex; align-items:center; justify-content:center; font-size:8px;">🎁</div>`;
                                    } else if (layer.type === 'goal-list') {
                                        const color = layer.barColor || '#ff007f';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: 1px solid ${color}; border-radius: 4px; display:flex; flex-direction:column; justify-content:center; gap:2px; padding:2px; box-sizing:border-box;"><div style="width:100%; height:2px; background:rgba(255,255,255,0.1);"></div><div style="width:100%; height:2px; background:rgba(255,255,255,0.1);"></div></div>`;
                                    } else if (layer.type === 'combo') {
                                        const color = layer.barColor || '#ef4444';
                                        contentHTML = `<div style="width:100%; height:100%; background: ${layer.hideBg ? 'transparent' : (layer.useCustomBg ? (layer.bgColor || '#0a0a14') : `radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, #0a0a14 100%)`)}; border: 1px solid ${color}; border-radius: 4px; display:flex; align-items:center; justify-content:center; font-size:8px; color:${color}; font-weight:bold;">🔥</div>`;
                                    } else if (layer.type === 'media-asset') {
                                        const isVideo = layer.isWebM || (layer.assetUrl && layer.assetUrl.endsWith('.webm'));
                                        const assetSrc = layer.assetUrl ? (layer.assetUrl.startsWith('http') ? layer.assetUrl : `${this.apiBase}${layer.assetUrl}`) : '';
                                        contentHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                                            ${isVideo 
                                                ? `<video src="${assetSrc}" style="width:100%; height:100%; object-fit:${layer.fitMode || 'contain'};" autoplay loop muted playsinline></video>` 
                                                : `<img src="${assetSrc}" style="width:100%; height:100%; object-fit:${layer.fitMode || 'contain'};">`
                                            }
                                        </div>`;
                                    } else if (layer.type === 'text') {
                                        contentHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:${layer.color || '#fff'}; font-size:4px; font-weight:bold; text-align:center; overflow:hidden;">${layer.text || 'Text'}</div>`;
                                    } else {
                                        contentHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:8px;">🎨</div>`;
                                    }
                                    
                                    const lx = (layer.x - minX) * maxScale;
                                    const ly = (layer.y - minY) * maxScale;
                                    const lw = (layer.w || 100) * maxScale;
                                    const lh = (layer.h || 100) * maxScale;
                                    
                                    return `
                                        <div style="position:absolute; left:${Math.round(lx)}px; top:${Math.round(ly)}px; width:${Math.round(lw)}px; height:${Math.round(lh)}px; z-index:${layer.zIndex || 1};">
                                            ${contentHTML}
                                        </div>
                                    `;
                                }).join('');

                                previewHTML = `
                                    <div style="position:relative; width:${Math.round(bw * maxScale)}px; height:${Math.round(bh * maxScale)}px; overflow:visible; background:transparent;">
                                        ${miniLayersHTML}
                                    </div>
                                `;
                            }
                            
                            const isPremium = Boolean(t.isPremium);
                            const priceTag = isPremium ? `${Number(t.price || 0).toLocaleString()}đ` : 'Free';
                            
                            return `
                                 <div class="gmd-template-card" draggable="true" data-template-id="${t.id}" style="display: flex; flex-direction: column; gap: 8px; padding: 10px;">
                                    <div class="gmd-template-preview-box" style="width: 100%; height: 64px; background: rgba(0,0,0,0.35); border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 4px; box-sizing: border-box; overflow: hidden; border: 1px solid rgba(255,255,255,0.06);">
                                        ${previewHTML}
                                    </div>
                                    <div class="gmd-template-info" style="width: 100%;">
                                        <div class="gmd-template-name" style="font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t.name}">${t.name}</div>
                                        <div class="gmd-template-meta" style="margin-top: 2px; display: flex; justify-content: space-between; align-items: center;">
                                            <span class="gmd-template-tag">${t.tag || 'Custom'}</span>
                                            ${isPremium 
                                                ? `<span class="gmd-template-premium" style="background: rgba(139,92,246,0.15); color: #c084fc; font-weight: 800; border: 1px solid rgba(139,92,246,0.3); border-radius: 4px; padding: 1px 4px; font-size: 9px;">${priceTag}</span>` 
                                                : `<span class="gmd-template-tag" style="background: rgba(16,185,129,0.15); color: #10b981; font-weight: 800; border-radius: 4px; padding: 1px 4px; font-size: 9px;">${priceTag}</span>`
                                            }
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                libContent.innerHTML = `
                    <div class="gmd-asset-grid">
                        ${this.goalAssets.length ? this.goalAssets.map(a => {
                            const isVideo = a.type === 'video';
                            return `
                                <div class="gmd-asset-card" draggable="true" data-asset-url="${a.url}" data-asset-name="${a.name}" data-asset-type="${a.type}">
                                    <div class="gmd-asset-preview">
                                        ${isVideo 
                                            ? `<video src="${this.apiBase}${a.url}" autoplay loop muted playsinline></video>` 
                                            : `<img src="${this.apiBase}${a.url}" alt="${a.name}">`
                                        }
                                    </div>
                                    <div class="gmd-asset-name" title="${a.name}">${a.name}</div>
                                </div>
                            `;
                        }).join('') : '<div class="gmd-inspector-empty" style="grid-column: 1/-1; height: 120px; padding: 12px; font-size: 11px;">Chưa có tài nguyên mẫu. Hãy copy file PNG/WebM vào thư mục backend/assets/goal/ hoặc upload bên dưới!</div>'}
                    </div>
                    
                    <div class="gmd-upload-box" id="gmd-asset-upload-trigger">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <div>Thêm tài nguyên</div>
                        <span>PNG, WebM (Tối đa 50MB)</span>
                        <input type="file" id="gmd-asset-file-input" accept=".png,.jpg,.jpeg,.webp,.gif,.webm,.mp4" style="display: none;">
                    </div>
                `;
                
                const uploadTrigger = libContent.querySelector('#gmd-asset-upload-trigger');
                const fileInput = libContent.querySelector('#gmd-asset-file-input');
                if (uploadTrigger && fileInput) {
                    uploadTrigger.addEventListener('click', () => fileInput.click());
                    fileInput.addEventListener('change', (e) => {
                        if (e.target.files && e.target.files[0]) {
                            this.uploadGoalAsset(e.target.files[0]);
                        }
                    });
                }
            }
        }

        getDefaultTemplates() {
            return [
                {
                    id: 'tmpl_neon_purple',
                    name: 'Neon Purple Gift Goal',
                    tag: 'Neon',
                    category: 'goal-board',
                    tags: ['basic', 'purple', 'gift'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'neon_purple_widget',
                            name: '🎁 Mở quà bí mật',
                            type: 'goal-bar',
                            x: 90,
                            y: 800,
                            w: 900,
                            h: 160,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            giftId: 'rose',
                            giftName: 'Rose',
                            targetCount: 500,
                            currentCount: 150,
                            showPercentage: true,
                            barColor: '#ff007f',
                            glowColor: '#a855f7',
                            borderRadius: 20,
                            themeStyle: 'neon',
                            titleColor: '#ffffff',
                            subtitleText: 'Mục tiêu: 150/500 Rose',
                            subtitleColor: '#a855f7'
                        }
                    ]
                },
                {
                    id: 'tmpl_multi_goal_list',
                    name: 'Multi Goal List',
                    tag: 'Multi Bar',
                    category: 'multi-goal',
                    tags: ['list', 'multi', 'daily-goal'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'multi_goal_list_widget',
                            name: '🎯 MỤC TIÊU HÔM NAY',
                            type: 'goal-list',
                            x: 90,
                            y: 500,
                            w: 900,
                            h: 480,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            barColor: '#38bdf8',
                            goals: [
                                { giftId: 'rose', giftName: 'Rose', current: 150, target: 500, icon: '/assets/gift-icons/Rose.png' },
                                { giftId: 'tiktok', giftName: 'TikTok', current: 32, target: 100, icon: '/assets/gift-icons/TikTok.png' },
                                { giftId: 'corgi', giftName: 'Corgi', current: 3, target: 10, icon: '/assets/gift-icons/Corgi.png' }
                            ]
                        }
                    ]
                },
                {
                    id: 'tmpl_top_supporters_board',
                    name: 'Top Supporters Board',
                    tag: 'Honors',
                    category: 'contributors',
                    tags: ['top', 'ranking', 'supporters'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'top_supporters_contributors_widget',
                            name: '🏆 TOP SUPPORTERS',
                            type: 'top-contributors',
                            x: 90,
                            y: 500,
                            w: 900,
                            h: 560,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            barColor: '#eab308',
                            limitCount: 3,
                            showAvatar: true,
                            showValue: true,
                            contributors: [
                                { nickname: '@user - Top 1', value: 1250, avatar: '' },
                                { nickname: '@user - Top 2', value: 850, avatar: '' },
                                { nickname: '@user - Top 3', value: 620, avatar: '' }
                            ]
                        }
                    ]
                },
                {
                    id: 'tmpl_combo_boost_popup',
                    name: 'Combo Boost Popup',
                    tag: 'Combo Popup',
                    category: 'combo',
                    tags: ['combo', 'popup', 'live-effect'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'combo_boost_widget_layer',
                            name: '🔥 x10 COMBO!',
                            type: 'combo',
                            x: 140,
                            y: 800,
                            w: 800,
                            h: 220,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            comboCount: 10,
                            subtitleText: 'Chuỗi quà liên tiếp!'
                        }
                    ]
                },
                {
                    id: 'tmpl_unlock_reward_board',
                    name: 'Unlock Reward Board',
                    tag: 'Unlock Reward',
                    category: 'unlock',
                    tags: ['unlock', 'reward', 'gift'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'unlock_reward_chests_widget',
                            name: '🔒 SẮP MỞ KHÓA',
                            type: 'mystery-chests',
                            x: 90,
                            y: 800,
                            w: 900,
                            h: 240,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            giftId: 'rose',
                            giftName: 'Rose',
                            targetCount: 500,
                            currentCount: 150,
                            subtitleText: '30% Hoàn thành'
                        }
                    ]
                },
                {
                    id: 'tmpl_event_mission_board',
                    name: 'Event Mission Board',
                    tag: 'Daily Mission',
                    category: 'mission',
                    tags: ['event', 'mission', 'daily'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'event_mission_list_widget',
                            name: '📋 NHIỆM VỤ LIVE',
                            type: 'goal-list',
                            x: 90,
                            y: 500,
                            w: 900,
                            h: 480,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            barColor: '#8b5cf6',
                            goals: [
                                { giftId: 'rose', giftName: 'Rose', current: 150, target: 500, icon: '/assets/gift-icons/Rose.png' },
                                { giftId: 'corgi', giftName: 'Corgi', current: 3, target: 10, icon: '/assets/gift-icons/Corgi.png' },
                                { giftId: 'sunglasses', giftName: 'Sunglasses', current: 1, target: 3, icon: '/assets/gift-icons/Sunglasses.png' }
                            ],
                            footerText: 'Hoàn thành để mở event đặc biệt!'
                        }
                    ]
                }
            ];
        }

        addTemplateToCanvas(templateId, dropX = null, dropY = null) {
            const templates = this.getDefaultTemplates();
            const allTemplates = [...(this.customTemplates || []), ...templates];
            const tmpl = allTemplates.find(t => t.id === templateId);
            if (!tmpl) return;
            
            this.goalBoard.selectedId = null;
            this.goalBoard.selectedIds = [];
            
            const baseZ = this.goalBoard.items.length;
            const groupUniqueId = `group_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            tmpl.layers.forEach(layer => {
                if (layer.x < minX) minX = layer.x;
                if (layer.y < minY) minY = layer.y;
                if (layer.x + layer.w > maxX) maxX = layer.x + layer.w;
                if (layer.y + layer.h > maxY) maxY = layer.y + layer.h;
            });
            const w = maxX - minX;
            const h = maxY - minY;
            
            const newLayers = tmpl.layers.map((layer, idx) => {
                const uniqueId = `layer_${layer.type}_${Date.now()}_${Math.floor(Math.random()*1000)}_${idx}`;
                let newX = layer.x;
                let newY = layer.y;
                if (dropX !== null && dropY !== null) {
                    newX = dropX - (w / 2) + (layer.x - minX);
                    newY = dropY - (h / 2) + (layer.y - minY);
                }
                
                const freshLayer = {
                    ...layer,
                    id: uniqueId,
                    groupId: groupUniqueId,
                    x: Math.round(newX),
                    y: Math.round(newY),
                    zIndex: baseZ + idx + 1
                };

                // Reset progress values to 0/empty for newly added templates
                if (freshLayer.currentCount !== undefined) freshLayer.currentCount = 0;
                if (freshLayer.comboCount !== undefined) freshLayer.comboCount = 0;
                if (Array.isArray(freshLayer.goals)) {
                    freshLayer.goals = freshLayer.goals.map(g => ({ ...g, current: 0 }));
                }
                if (Array.isArray(freshLayer.contributors)) {
                    freshLayer.contributors = [];
                }

                return freshLayer;
            });
            
            this.goalBoard.items.push(...newLayers);
            
            if (newLayers[0]) {
                this.goalBoard.selectedId = newLayers[0].id;
                this.goalBoard.selectedIds = [newLayers[0].id];
            }
            
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('add-template');
        }

        async loadGoalAssets() {
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/assets`, { headers });
                const data = await res.json();
                this.goalAssets = Array.isArray(data.assets) ? data.assets : [];
                if (this.mode === 'goal-board' && this.leftPanelTab === 'assets') {
                    this.renderLeftPanel();
                }
            } catch (_e) {
                this.goalAssets = [];
            }
        }

        async uploadGoalAsset(file) {
            if (!file) return;
            const formData = new FormData();
            formData.append('assetFile', file);
            
            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('info', 'Đang tải tài nguyên lên server...');
            }
            
            try {
                const headers = {};
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/upload-asset`, {
                    method: 'POST',
                    headers,
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('success', 'Đã tải lên thành công tài nguyên mới!');
                    }
                    await this.loadGoalAssets();
                } else {
                    throw new Error(data.error || 'Lỗi upload');
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', `Tải lên thất bại: ${err.message}`);
                }
            }
        }

        addAssetToCanvas(assetUrl, assetName, assetType, x = 100, y = 100) {
            const uniqueId = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            const isWebM = assetType === 'video' || assetUrl.endsWith('.webm');
            
            const newLayer = {
                id: uniqueId,
                name: assetName || (isWebM ? 'Asset WebM' : 'Asset PNG'),
                type: 'media-asset',
                assetUrl: assetUrl,
                isWebM: isWebM,
                x: Math.round(x),
                y: Math.round(y),
                w: 360,
                h: 360,
                opacity: 1.0,
                fitMode: 'contain',
                autoplay: true,
                loop: true,
                muted: true,
                playsinline: true,
                zIndex: this.goalBoard.items.length + 1,
                visible: true,
                locked: false
            };
            
            this.goalBoard.items.push(newLayer);
            this.goalBoard.selectedId = uniqueId;
            this.goalBoard.selectedIds = [uniqueId];
            
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('add-asset');
        }

        renderGoalBoardCanvas() {
            const canvas = this.mount.querySelector('#gmd-canvas');
            const stage = this.mount.querySelector('#gmd-stage');
            const safe = this.mount.querySelector('#gmd-safe-area');
            if (!canvas || !stage || !safe) return;
            
            const getTranslucentBg = (colorHex, defaultHex = '#0a0a14') => {
                const hex = colorHex || defaultHex;
                return (hex.startsWith('#') && hex.length === 7) ? hex + '40' : hex;
            };
            
            // Remove elements that are no longer active or visible
            const activeIds = new Set((this.goalBoard.items || []).filter(item => item.visible !== false).map(item => String(item.id)));
            Array.from(safe.querySelectorAll('.gmd-item')).forEach(child => {
                const id = child.dataset.itemId;
                if (!activeIds.has(id)) {
                    child.remove();
                }
            });
            
            const s = safe.clientWidth / 1080;
            
            this.goalBoard.items.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach((item) => {
                if (item.visible === false) return;
                
                const selected = this.goalBoard.selectedIds.includes(item.id);
                let el = safe.querySelector(`[data-item-id="${item.id}"]`);
                const exists = !!el;
                if (!exists) {
                    el = document.createElement('div');
                    el.dataset.itemId = item.id;
                    safe.appendChild(el);
                }
                let refW = item.lockedW || item.w || 900;
                let refH = item.lockedH || item.h || 160;
                let isWidget = false;
                
                if (['goal-bar', 'boss-bar', 'top-contributors', 'podium-contributors', 'mystery-chests', 'combo', 'goal-list'].includes(item.type)) {
                    isWidget = true;
                    if (!item.lockRatio) {
                        if (item.type === 'boss-bar') { refW = 840; refH = 180; }
                        else if (item.type === 'combo') { refW = 800; refH = 220; }
                        else if (item.type === 'mystery-chests') { refW = 900; refH = 240; }
                        else if (item.type === 'top-contributors' || item.type === 'podium-contributors') { refW = 900; refH = 560; }
                        else if (item.type === 'goal-list') { refW = 900; refH = item.h || 700; }
                        else if (item.type === 'goal-bar') { refW = 900; refH = 160; }
                    }
                }
                
                const fs = 1;
                el.className = `gmd-item ${selected ? 'selected' : ''}`;
                el.dataset.itemId = item.id;
                
                el.style.left = `${Math.round(item.x * s)}px`;
                el.style.top = `${Math.round(item.y * s)}px`;
                el.style.width = `${Math.round(item.w * s)}px`;
                el.style.height = `${Math.round(item.h * s)}px`;
                el.style.zIndex = String(item.zIndex || 1);
                
                let widgetHTML = '';
                let skipHTMLUpdate = false;
                if (item.type === 'goal-bar') {
                    const current = Number(item.currentCount || 0);
                    const target = Number(item.targetCount || 100);
                    const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                    const color = item.barColor || '#ff007f';
                    const glow = item.glowColor || 'rgba(255,0,127,0.5)';
                    const titleSize = item.fontSize || 38;
                    const subSize = item.subtitleFontSize || 24;
                    const subtitle = item.subtitleText ? `<div class="gmd-goal-bar-subtitle" style="font-size: ${subSize}px; color: ${item.subtitleColor || '#cbd5e1'}; text-align: left; margin-top: 2px; line-height: 1.2; opacity: 0.9;">${item.subtitleText}</div>` : '';
                    widgetHTML = `
                        <div class="gmd-goal-bar-widget ${item.themeStyle === 'neon' ? 'theme-neon' : ''}" style="border-radius: ${item.borderRadius || 12}px; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `${color}80`)}; box-shadow: ${item.hideBg ? 'none' : `0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 15px ${color}26`}; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at top left, ${color}12, #0f172a)`)}; padding: 16px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; gap: 8px; width: 100%;">
                                <div class="gmd-goal-bar-title-row" style="font-size: ${titleSize}px;">
                                    <span style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}; text-shadow: 0 0 10px ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}80; font-size: ${titleSize}px;">${item.name || (item.giftName + ' Goal') || 'Rose Goal'}</span>
                                    <span style="color: ${color}; text-shadow: 0 0 10px ${color}80; font-size: ${titleSize}px;">${current}/${target}</span>
                                </div>
                                <div class="gmd-goal-bar-outer" style="height: ${item.barHeight !== undefined ? item.barHeight : 54}px;">
                                    <div class="gmd-goal-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; --bar-color: ${color}; --bar-glow: ${glow}; background: linear-gradient(90deg, ${color}, ${glow}); box-shadow: 0 0 24px ${glow};"></div>
                                </div>
                                ${item.subtitleText ? `<div class="gmd-goal-bar-subtitle" style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : (item.subtitleColor || '#cbd5e1')}; text-align: left; margin-top: 2px; line-height: 1.2; opacity: 0.9;">${item.subtitleText}</div>` : ''}
                            </div>
                        </div>
                    `;
                } else if (item.type === 'boss-bar') {
                    const current = Number(item.currentCount || 0);
                    const target = Number(item.targetCount || 100);
                    const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                    const color = item.barColor || '#ef4444';
                    const titleSize = item.fontSize || 38;
                    const subSize = item.subtitleFontSize || 26;
                    
                    const formatNum = (num) => {
                        if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'k';
                        return num;
                    };
                    
                    widgetHTML = `
                        <div class="gmd-boss-bar-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 30px ${color}4d, 0 8px 32px rgba(0,0,0,0.6)`}; display: flex; flex-direction: column; justify-content: center; padding: 16px; box-sizing: border-box; width: 100%; height: 100%;">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; gap: 14px; width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: ${titleSize}px; font-weight: 900; color: #fff; line-height: 1;">
                                    <span style="display: flex; align-items: center; gap: 6px; text-shadow: 0 0 10px ${color}; font-size: ${titleSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'};">🐉 ${item.bossName || 'BOSS HP'}</span>
                                    <span style="color: ${color}; text-shadow: 0 0 10px ${color}; font-size: ${titleSize}px;">${pct}%</span>
                                </div>
                                <div class="gmd-boss-bar-outer" style="height: ${item.barHeight !== undefined ? item.barHeight : 24}px; background: rgba(0, 0, 0, 0.6); border-radius: 4px; overflow: hidden; border: 1px solid ${color}40; position: relative; box-sizing: border-box; width: 100%;">
                                    <div class="gmd-boss-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="height: 100%; width: ${pct}%; --bar-color: ${color}; --bar-glow: ${color}; background: linear-gradient(90deg, #b91c1c, ${color}); box-shadow: 0 0 12px ${color};"></div>
                                </div>
                                <div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#9ca3af') : '#9ca3af'}; text-align: left; display: flex; justify-content: space-between; line-height: 1;">
                                    <span style="font-size: ${subSize}px;">⚔️ ${item.bossSub || 'Corgi tấn công'}</span>
                                    <span style="color: ${color}; font-weight: bold; font-size: ${subSize}px;">${formatNum(current)}/${formatNum(target)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (item.type === 'top-contributors') {
                    const contributors = Array.isArray(item.contributors) ? item.contributors : [
                        { nickname: 'BH Studio', value: 520, avatar: '' },
                        { nickname: 'Minh Anh', value: 120, avatar: '' },
                        { nickname: 'Khánh Huyền', value: 99, avatar: '' }
                    ];
                    const limit = Number(item.limitCount || 3);
                    const sliced = contributors.slice(0, limit);
                    const color = item.barColor || '#eab308';
                    const headerSize = item.fontSize || 34;
                    const rowSize = item.rowFontSize || 30;
                    widgetHTML = `
                        <div class="gmd-contributors-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 20px ${color}33, 0 8px 32px rgba(0,0,0,0.6)`}; padding: 12px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; gap: 6px; width: 100%;">
                                <div class="gmd-contrib-header" style="font-size: ${headerSize}px; padding-bottom: 14px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; border-bottom-color: ${color}4d;">🏆 BẢNG VINH DANH</div>
                                <div class="gmd-contrib-list">
                                    ${sliced.map((c, idx) => `
                                        <div class="gmd-contrib-item" style="font-size: ${rowSize}px; padding: 10px 14px; gap: 18px; border-radius: 14px;">
                                            <span class="gmd-contrib-rank" style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">#${idx + 1}</span>
                                            ${item.showAvatar !== false ? `<div class="gmd-contrib-avatar" style="width: 48px; height: 48px; border-radius: 50%; background: #2e3b5e; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;"></div>` : ''}
                                            <span class="gmd-contrib-name" style="color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : ''};">${c.nickname || 'BH Studio'}</span>
                                            ${item.showValue !== false ? `<span class="gmd-contrib-val">${c.value}💎</span>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                } else if (item.type === 'podium-contributors') {
                    const contributors = Array.isArray(item.contributors) ? item.contributors : [
                        { nickname: 'Vua Donate', value: 520, avatar: '' },
                        { nickname: 'Minh Anh', value: 120, avatar: '' },
                        { nickname: 'Khánh Huyền', value: 99, avatar: '' }
                    ];
                    const headerSize = item.fontSize || 34;
                    const nameSize = item.rowFontSize || 22;
                    const valSize = item.valueFontSize || 22;
                    widgetHTML = `
                        <div class="gmd-podium-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(234, 179, 8, 0.1) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : '#eab308'}`}; border-radius: 24px; padding: 18px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; box-shadow: ${item.hideBg ? 'none' : ''};">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; width: 100%;">
                                <div class="gmd-podium-header" style="font-size: ${headerSize}px; padding-bottom: 8px; color: ${item.useCustomTextColor ? (item.textColor || '#eab308') : ''};">👑 VƯƠNG MIỆN HOÀNG GIA</div>
                                <div class="gmd-podium-podium">
                                    <div class="gmd-podium-spot rank-2">
                                        <div class="gmd-podium-avatar-wrap">
                                            <div class="gmd-podium-crown" style="font-size: 32px; top: -20px;">🥈</div>
                                            <div class="gmd-podium-avatar" style="width: 64px; height: 64px; display:flex; align-items:center; justify-content:center; font-size:28px;">👤</div>
                                        </div>
                                        <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${contributors[1]?.nickname || 'Trống'}</div>
                                        ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px;">${contributors[1]?.value || 0}💎</div>` : ''}
                                    </div>
                                    <div class="gmd-podium-spot rank-1">
                                        <div class="gmd-podium-avatar-wrap">
                                            <div class="gmd-podium-crown" style="font-size: 44px; top: -28px;">👑</div>
                                            <div class="gmd-podium-glow-ring" style="inset: -6px; border-width: 3px;"></div>
                                            <div class="gmd-podium-avatar" style="width: 88px; height: 88px; display:flex; align-items:center; justify-content:center; font-size:38px;">👤</div>
                                        </div>
                                        <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${contributors[0]?.nickname || 'Vua Donate'}</div>
                                        ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px;">${contributors[0]?.value || 0}💎</div>` : ''}
                                    </div>
                                    <div class="gmd-podium-spot rank-3">
                                        <div class="gmd-podium-avatar-wrap">
                                            <div class="gmd-podium-crown" style="font-size: 32px; top: -20px;">🥉</div>
                                            <div class="gmd-podium-avatar" style="width: 64px; height: 64px; display:flex; align-items:center; justify-content:center; font-size:28px;">👤</div>
                                        </div>
                                        <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${contributors[2]?.nickname || 'Trống'}</div>
                                        ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px;">${contributors[2]?.value || 0}💎</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (item.type === 'mystery-chests') {
                    const current = Number(item.currentCount || 0);
                    const target = Number(item.targetCount || 100);
                    const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                    const titleText = item.name || '🎁 MỞ KHÓA HỘP QUÀ KỲ BÍ';
                    const titleSize = item.fontSize || 32;
                    const subSize = item.subtitleFontSize || 20;
                    const subtitle = item.subtitleText ? `<div style="font-size: ${subSize}px; color: ${item.subtitleColor || '#fda4af'}; text-align: center; margin-top: 6px; font-weight: bold; line-height: 1.2;">${item.subtitleText}</div>` : '';
                    widgetHTML = `
                        <div class="gmd-mystery-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(168, 85, 247, 0.1) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : (item.barColor || '#a855f7')}`}; border-radius: 24px; padding: 18px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; box-shadow: ${item.hideBg ? 'none' : ''};">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; width: 100%;">
                                <div class="gmd-mystery-header" style="font-size: ${titleSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')};">${titleText}</div>
                                <div class="gmd-mystery-title-row" style="font-size: 26px; margin-top: 6px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">
                                    <span>${item.giftName || 'Hộp Quà'} Goal</span>
                                    <span>${current}/${target}</span>
                                </div>
                                <div class="gmd-mystery-track-wrap" style="margin-top: 16px;">
                                    <div class="gmd-mystery-bar-outer" style="height: ${item.barHeight !== undefined ? item.barHeight : 24}px; border-radius: 24px;">
                                        <div class="gmd-mystery-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; border-radius: 24px; --bar-color: ${item.barColor || '#a855f7'}; --bar-glow: ${item.glowColor || '#fb7185'};"></div>
                                    </div>
                                    <div class="gmd-mystery-milestones">
                                        <div class="gmd-mystery-node ${pct >= 25 ? 'unlocked' : ''}" style="left: 25%;">
                                            <span class="gmd-mystery-chest" style="font-size: ${pct >= 25 ? 44 : 32}px; top: -8px;">📦</span>
                                            <span class="gmd-mystery-pct" style="font-size: 20px; margin-top: 8px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">25%</span>
                                        </div>
                                        <div class="gmd-mystery-node ${pct >= 50 ? 'unlocked' : ''}" style="left: 50%;">
                                            <span class="gmd-mystery-chest" style="font-size: ${pct >= 50 ? 44 : 32}px; top: -8px;">🧰</span>
                                            <span class="gmd-mystery-pct" style="font-size: 20px; margin-top: 8px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">50%</span>
                                        </div>
                                        <div class="gmd-mystery-node ${pct >= 75 ? 'unlocked' : ''}" style="left: 75%;">
                                            <span class="gmd-mystery-chest" style="font-size: ${pct >= 75 ? 44 : 32}px; top: -8px;">🪙</span>
                                            <span class="gmd-mystery-pct" style="font-size: 20px; margin-top: 8px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">75%</span>
                                        </div>
                                        <div class="gmd-mystery-node ${pct >= 100 ? 'unlocked' : ''}" style="left: 100%;">
                                            <span class="gmd-mystery-chest" style="font-size: ${pct >= 100 ? 44 : 32}px; top: -8px;">💎</span>
                                            <span class="gmd-mystery-pct" style="font-size: 20px; margin-top: 8px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">100%</span>
                                        </div>
                                    </div>
                                </div>
                                ${item.subtitleText ? `<div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#fda4af') : (item.subtitleColor || '#fda4af')}; text-align: center; margin-top: 6px; font-weight: bold; line-height: 1.2;">${item.subtitleText}</div>` : ''}
                            </div>
                        </div>
                    `;
                } else if (item.type === 'combo') {
                    const count = item.comboCount || 88;
                    const titleSize = item.fontSize || 40;
                    const numSize = item.numberFontSize || 64;
                    const subSize = item.subtitleFontSize || 20;
                    const subtitle = item.subtitleText ? `<div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#fca5a5') : (item.subtitleColor || '#fca5a5')}; font-weight: bold; margin-top: 4px; line-height: 1.2;">${item.subtitleText}</div>` : '';
                    widgetHTML = `
                        <div class="gmd-combo-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? 'none' : `1.5px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : (item.barColor || '#ef4444')}`}; font-size: ${titleSize}px; border-radius: 24px; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; padding: 12px; gap: 8px; display: flex; align-items: center; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; box-shadow: ${item.hideBg ? 'none' : '0 0 12px rgba(239, 68, 68, 0.2)'};">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;">
                                <div class="gmd-combo-num" style="font-size: ${numSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">x${count}</div>
                                <div style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${item.name || 'COMBO ĐANG CHẠY!'}</div>
                                ${subtitle}
                            </div>
                        </div>
                    `;
                } else if (item.type === 'media-asset') {
                    const isVideo = item.isWebM || (item.assetUrl && item.assetUrl.endsWith('.webm'));
                    const opacity = item.opacity !== undefined ? item.opacity : 1;
                    const fitMode = item.fitMode || 'contain';
                    const assetSrc = item.assetUrl ? (item.assetUrl.startsWith('http') ? item.assetUrl : `${this.apiBase}${item.assetUrl}`) : '';
                    
                    if (exists) {
                        if (isVideo) {
                            const videoEl = el.querySelector('video');
                            if (videoEl && (videoEl.src === assetSrc || videoEl.getAttribute('src') === item.assetUrl)) {
                                videoEl.style.objectFit = fitMode;
                                videoEl.style.opacity = String(opacity);
                                skipHTMLUpdate = true;
                            }
                        } else {
                            const imgEl = el.querySelector('img');
                            if (imgEl && (imgEl.src === assetSrc || imgEl.getAttribute('src') === item.assetUrl)) {
                                imgEl.style.objectFit = fitMode;
                                imgEl.style.opacity = String(opacity);
                                skipHTMLUpdate = true;
                            }
                        }
                    }
                    
                    if (!skipHTMLUpdate) {
                        widgetHTML = `
                            <div class="gmd-asset-container" style="width:100%; height:100%; position:relative;">
                                <div class="gmd-asset-fallback-box" style="position:absolute; inset:0; display: ${assetSrc ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; background: rgba(168, 85, 247, 0.03); border: 1px dashed rgba(168, 85, 247, 0.25); border-radius: 16px; box-sizing: border-box; text-align: center; padding: 12px; pointer-events: none; z-index: 1;">
                                    <div style="font-size: 36px; opacity: 0.6;">🖼️</div>
                                    <div style="font-size: 20px; font-weight: bold; color: rgba(192, 132, 252, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 90%; margin-top: 1px;" title="${item.name || 'Tài nguyên'}">${item.name || 'Tài nguyên'}</div>
                                </div>
                                ${assetSrc ? (isVideo
                                    ? `<video src="${assetSrc}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" autoplay loop muted playsinline></video>`
                                    : `<img src="${assetSrc}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" alt="">`
                                ) : ''}
                            </div>
                        `;
                    }
                } else if (item.type === 'goal-list') {
                    const title = item.name || 'MỤC TIÊU HÔM NAY 🎯';
                    const goals = Array.isArray(item.goals) ? item.goals : [
                        { giftName: 'Rose', current: 150, target: 500, icon: '/assets/gift-icons/Rose.png', giftId: 'rose' },
                        { giftName: 'TikTok', current: 32, target: 100, icon: '/assets/gift-icons/TikTok.png', giftId: 'tiktok' },
                        { giftName: 'Corgi', current: 3, target: 10, icon: '/assets/gift-icons/Corgi.png', giftId: 'corgi' }
                    ];
                    const footerText = item.footerText || '';
                    const color = item.barColor || '#ff007f';
                    const headerSize = item.fontSize || 32;
                    const rowSize = item.rowFontSize || 22;
                    const footerSize = item.footerFontSize || 20;
                    widgetHTML = `
                        <div class="gmd-goal-list-widget" style="width:100%; height:100%; padding: 24px; box-sizing: border-box; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : color}`}; border-radius: 24px; display:flex; flex-direction:column; justify-content:center; box-shadow: ${item.hideBg ? 'none' : `0 0 30px ${color}26, 0 8px 32px rgba(0,0,0,0.6)`};">
                            <div style="transform: translateY(${item.contentOffsetY || 0}px); display: flex; flex-direction: column; gap: 14px; width: 100%;">
                                <div class="gmd-goal-list-header" style="font-weight:900; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; text-shadow: 0 0 10px ${color}80; text-align:center; font-size: ${headerSize}px; margin-bottom: 6px;">${title}</div>
                                <div class="gmd-goal-list-body" style="display:flex; flex-direction:column; gap: 12px;">
                                    ${goals.map(g => {
                                        const pct = Math.min(100, Math.round((g.current || 0) / (g.target || 1) * 100));
                                        const iconUrl = g.icon ? (g.icon.startsWith('http') ? g.icon : `${this.apiBase}${g.icon}`) : '';
                                        return `
                                            <div class="gmd-goal-list-row" style="display:flex; flex-direction:column; gap: 8px; background:rgba(255,255,255,0.02); padding: 12px 16px; border-radius: 12px;">
                                                <div class="gmd-goal-list-text-row" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                                    <div style="display:flex; align-items:center; gap:8px;">
                                                        ${iconUrl ? `<img class="gmd-goal-list-icon" src="${iconUrl}" style="width: 28px; height: 28px; border-radius:50%;" alt="">` : `<div style="font-size:20px;">🎁</div>`}
                                                        ${item.showGiftName !== false ? `<span class="gmd-goal-list-label" style="font-size: ${rowSize}px; font-weight:800; color:${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : '#e2e8f0'};">${g.giftName || 'Gift'}</span>` : ''}
                                                    </div>
                                                    <span class="gmd-goal-list-counts" style="font-size: ${rowSize}px; font-weight:800; color: ${item.barColor || '#38bdf8'}; text-shadow: 0 0 10px ${item.barColor || '#38bdf8'}80;">${g.current}/${g.target} (${pct}%)</span>
                                                </div>
                                                <div class="gmd-goal-list-bar-outer" style="width:100%; height: ${item.barHeight !== undefined ? item.barHeight : 12}px; background:rgba(0,0,0,0.35); border-radius:99px; overflow:hidden; border: none; position:relative;">
                                                    <div class="gmd-goal-list-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width:${pct}%; height:100%; --bar-color: ${item.barColor || '#38bdf8'}; --bar-glow: ${item.barColor || '#38bdf8'}; background:${item.barColor || '#38bdf8'}; border-radius:99px; box-shadow: 0 0 12px ${item.barColor || '#38bdf8'};"></div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                                ${footerText ? `<div class="gmd-goal-list-footer" style="text-align:center; font-size: ${footerSize}px; color:#cbd5e1; font-weight:bold; margin-top: 6px;">${footerText}</div>` : ''}
                            </div>
                        </div>
                    `;
                } else if (item.type === 'text') {
                    widgetHTML = `
                        <div class="gmd-text-widget" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:${item.color || '#ffffff'}; font-size:${Math.round((item.fontSize || 36) * s)}px; font-weight:${item.fontWeight || 'bold'}; text-shadow:${item.textShadow || 'none'}; text-align:${item.textAlign || 'center'}; font-family:inherit; line-height:1.2; word-break:break-word; pointer-events:none;">
                            ${item.text || 'Nhập văn bản'}
                        </div>
                    `;
                }
                
                let finalVisualHTML = '';
                if (isWidget) {
                    if (item.lockRatio) {
                        const scaleX = (item.w * s) / refW;
                        const scaleY = (item.h * s) / refH;
                        finalVisualHTML = `
                            <div class="gmd-visual-scaled-wrapper" style="width: ${refW}px; height: ${refH}px; transform: scale(${scaleX}, ${scaleY}); transform-origin: top left; position: absolute; top: 0; left: 0; pointer-events: none;">
                                ${widgetHTML}
                            </div>
                        `;
                    } else {
                        finalVisualHTML = `
                            <div class="gmd-visual-scaled-wrapper" style="width: ${item.w}px; height: ${item.h}px; transform: scale(${s}); transform-origin: top left; position: absolute; top: 0; left: 0; pointer-events: none;">
                                ${widgetHTML}
                            </div>
                        `;
                    }
                } else {
                    finalVisualHTML = widgetHTML;
                }
                
                if (!skipHTMLUpdate) {
                    el.innerHTML = `
                        <div class="gmd-visual" style="width:100%; height:100%; position: relative; overflow: visible;">
                            ${finalVisualHTML}
                        </div>
                    `;
                }

                // Add or remove selection handles dynamically without wiping innerHTML
                const hasHandle = !!el.querySelector('.gmd-resize-handle');
                const needsHandle = selected && !item.locked && this.goalBoard.selectedId === item.id && this.goalBoard.selectedIds.length <= 1;
                if (needsHandle && !hasHandle) {
                    const handleSpan = document.createElement('span');
                    handleSpan.className = 'gmd-handle gmd-resize-handle';
                    handleSpan.dataset.handle = 'resize';
                    el.appendChild(handleSpan);
                } else if (!needsHandle && hasHandle) {
                    const handleSpan = el.querySelector('.gmd-resize-handle');
                    if (handleSpan) handleSpan.remove();
                }
            });
            
            this.applyZoom();
        }

        renderGoalBoardInspector() {
            const inspector = this.mount.querySelector('#gmd-inspector');
            if (!inspector) return;
            
            const selected = this.goalBoard.items.find((x) => x.id === this.goalBoard.selectedId);
            const giftTabBtn = this.mount.querySelector('.gmd-inspector-tabs [data-tab="gift"]');
            const layersTabBtn = this.mount.querySelector('.gmd-inspector-tabs [data-tab="layers"]');
            
            if (giftTabBtn) {
                giftTabBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Thuộc tính';
                giftTabBtn.classList.toggle('active', this.inspectorTab === 'gift');
            }
            if (layersTabBtn) {
                layersTabBtn.classList.toggle('active', this.inspectorTab === 'layers');
            }
            
            if (this.inspectorTab === 'layers') {
                inspector.innerHTML = this.renderGoalBoardLayerPanel();
                return;
            }
            
            if (!selected) {
                inspector.innerHTML = '<div class="gmd-inspector-empty"><i class="fas fa-mouse-pointer"></i><p>Chọn một layer<br>trên canvas để tùy chỉnh</p></div>';
                return;
            }
            
            let testButtonHTML = '';
            if (['goal-bar', 'boss-bar', 'mystery-chests', 'goal-list', 'top-contributors', 'podium-contributors', 'combo'].includes(selected.type)) {
                testButtonHTML = `
                    <div class="gmd-section" style="border: 1px dashed rgba(139,92,246,0.3); background: rgba(139,92,246,0.05); padding: 12px; border-radius: 12px; margin-bottom: 12px;">
                        <h4 style="color: #a855f7; margin-bottom: 6px;"><i class="fas fa-flask"></i> CHẠY THỬ / TEST GOAL</h4>
                        <p style="font-size: 10px; color: #cbd5e1; margin: 0 0 10px 0; line-height: 1.3;">Gửi quà thử nghiệm ảo để xem hiệu ứng tiến trình trên canvas và OBS Overlay.</p>
                        <button class="gmd-btn primary" style="width: 100%; font-size: 11px; background: #8b5cf6; padding: 6px 12px; height: 32px;" onclick="window.giftMenuDesigner.sendSimulatedGift('${selected.id}')"><i class="fas fa-play"></i> Gửi quà Test</button>
                    </div>
                `;
            }
            
            const makeCompactFontSizeField = (label, key, defaultValue, min = 10, max = 120) => `
                <div class="gmd-field" style="margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                        <label style="margin: 0; font-size: 11px; font-weight: 700; color: #cbd5e1;">${label}</label>
                        <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 62px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="${key}" value="${selected[key] !== undefined ? selected[key] : defaultValue}"><span>px</span></div>
                    </div>
                    <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="${min}" max="${max}" data-goal-key="${key}" value="${selected[key] !== undefined ? selected[key] : defaultValue}">
                </div>
            `;

            const makeCustomGiftSelect = (label, currentId) => {
                const currentGift = this.gifts.find(g => String(g.id) === String(currentId)) || this.gifts[0] || { id: '', name: 'Chọn quà', icon: '' };
                const currentIcon = currentGift.icon ? (currentGift.icon.startsWith('http') ? currentGift.icon : this.apiBase + currentGift.icon) : '';
                return `
                    <div class="gmd-field">
                        <label>${label}</label>
                        <div class="gmd-custom-select">
                            <div class="gmd-custom-select-header" onclick="this.nextElementSibling.classList.toggle('show')">
                                ${currentIcon ? `<img src="${currentIcon}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: contain; margin-right: 8px;">` : '<div style="width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.1); margin-right: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px;">🎁</div>'}
                                <span>${currentGift.name || currentGift.id}</span>
                                <i class="fas fa-chevron-down" style="margin-left: auto; font-size: 10px; opacity: 0.7;"></i>
                            </div>
                            <div class="gmd-custom-select-options">
                                ${this.gifts.map(g => {
                                    const gIcon = g.icon ? (g.icon.startsWith('http') ? g.icon : this.apiBase + g.icon) : '';
                                    return `
                                        <div class="gmd-custom-select-option ${String(g.id) === String(currentId) ? 'active' : ''}" onclick="window.giftMenuDesigner.updateGoalBoardSelectedItem('giftId', '${g.id}'); window.giftMenuDesigner.renderInspector();">
                                            ${gIcon ? `<img src="${gIcon}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: contain;">` : '<div style="width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 10px;">🎁</div>'}
                                            <span>${g.name || g.id}</span>
                                            <span style="margin-left: auto; font-size: 9px; color: #a855f7;">${g.coins || 1}💎</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            };

            let specificConfigHTML = '';
            
            if (selected.type === 'goal-bar') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-cog"></i> CẤU HÌNH TIẾN TRÌNH</h4>
                        ${makeCustomGiftSelect('Chọn quà mục tiêu', selected.giftId)}
                        <div class="gmd-field">
                            <label>Mục tiêu (Target Count)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>Hiện tại (Current Count)</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị phần trăm</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showPercentage" ${selected.showPercentage ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        <div class="gmd-field">
                            <label>Dòng phụ đề (Subtitle)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}" placeholder="Ví dụ: Gửi Rose để hoàn thành mục tiêu">
                        </div>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 38)}
                        ${makeCompactFontSizeField('Cỡ chữ Phụ đề', 'subtitleFontSize', 24)}
                    </div>
                    
                    <div class="gmd-section">
                        <h4><i class="fas fa-palette"></i> PHONG CÁCH WIDGET</h4>
                        <div class="gmd-field">
                            <label>Giao diện (Theme)</label>
                            <select class="gmd-select" data-goal-key="themeStyle">
                                <option value="neon" ${selected.themeStyle === 'neon' ? 'selected' : ''}>Neon Glow</option>
                                <option value="simple" ${selected.themeStyle === 'simple' ? 'selected' : ''}>Simple Clean</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Màu tiến trình</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ff007f'}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu bóng tỏa (Glow)</label>
                            <input class="gmd-color" type="color" data-goal-key="glowColor" value="${selected.glowColor || '#ff007f'}">
                        </div>
                        <div class="gmd-field">
                            <label>Bo góc (Radius)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="borderRadius" value="${selected.borderRadius || 12}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="30" data-goal-key="borderRadius" value="${selected.borderRadius || 12}">
                        <div class="gmd-field">
                            <label>Độ dày thanh (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 54}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="100" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 54}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh (Bar Style)</label>
                            <select class="gmd-select" data-goal-key="barStyle">
                                <option value="solid" ${selected.barStyle === 'solid' ? 'selected' : ''}>Classic Solid/Gradient</option>
                                <option value="glow-pulse" ${selected.barStyle === 'glow-pulse' ? 'selected' : ''}>Neon Glow Pulse</option>
                                <option value="gradient-sweep" ${selected.barStyle === 'gradient-sweep' ? 'selected' : ''}>Gradient Sweep</option>
                                <option value="candy-stripe" ${selected.barStyle === 'candy-stripe' ? 'selected' : ''}>Candy Stripe Shimmer</option>
                            </select>
                        </div>
                    </div>
                `;
            } else if (selected.type === 'boss-bar') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-dragon"></i> THUỘC TÍNH BOSS</h4>
                        <div class="gmd-field">
                            <label>Tên quái vật (Boss Title)</label>
                            <input class="gmd-input" type="text" data-goal-key="bossName" value="${selected.bossName || 'Hỏa Long Bất Diệt'}">
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ (Subtitle)</label>
                            <input class="gmd-input" type="text" data-goal-key="bossSub" value="${selected.bossSub || 'Gửi quà để sát thương Boss'}">
                        </div>
                        ${makeCustomGiftSelect('Liên kết Quà tặng', selected.giftId)}
                        <div class="gmd-field">
                            <label>Máu Boss tối đa (Target HP)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>Máu Boss hiện tại (Current HP)</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Độ dày thanh (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="6" max="60" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh (Bar Style)</label>
                            <select class="gmd-select" data-goal-key="barStyle">
                                <option value="solid" ${selected.barStyle === 'solid' ? 'selected' : ''}>Classic Solid/Gradient</option>
                                <option value="glow-pulse" ${selected.barStyle === 'glow-pulse' ? 'selected' : ''}>Neon Glow Pulse</option>
                                <option value="gradient-sweep" ${selected.barStyle === 'gradient-sweep' ? 'selected' : ''}>Gradient Sweep</option>
                                <option value="candy-stripe" ${selected.barStyle === 'candy-stripe' ? 'selected' : ''}>Candy Stripe Shimmer</option>
                            </select>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Boss HP', 'fontSize', 38)}
                        ${makeCompactFontSizeField('Cỡ chữ Thông số phụ', 'subtitleFontSize', 26)}
                    </div>
                `;
            } else if (selected.type === 'top-contributors') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-list-ol"></i> BẢNG XẾP HẠNG</h4>
                        <div class="gmd-field">
                            <label>Số lượng người hiển thị</label>
                            <input class="gmd-input" type="number" data-goal-key="limitCount" value="${selected.limitCount || 5}">
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị Avatar</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showAvatar" ${selected.showAvatar !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị điểm số (Diamond)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showValue" ${selected.showValue !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 34)}
                        ${makeCompactFontSizeField('Cỡ chữ Dòng BXH', 'rowFontSize', 30)}
                    </div>
                `;
            } else if (selected.type === 'podium-contributors') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-crown"></i> CẤU HÌNH PODIUM</h4>
                        <p class="gmd-subline" style="margin:0 0 8px 0; font-size:10px;">Podium Vương Miện Hoàng Gia hiển thị vinh danh top 3 nhà tài trợ lớn nhất theo mô hình bục nhận giải danh giá để thúc đẩy donate!</p>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị Avatar</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showAvatar" ${selected.showAvatar !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị điểm số (Diamond)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showValue" ${selected.showValue !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 34)}
                        ${makeCompactFontSizeField('Cỡ chữ Tên user', 'rowFontSize', 22)}
                        ${makeCompactFontSizeField('Cỡ chữ Điểm số', 'valueFontSize', 22)}
                    </div>
                `;
            } else if (selected.type === 'mystery-chests') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-gift"></i> TIẾN TRÌNH HỘP QUÀ</h4>
                        ${makeCustomGiftSelect('Chọn quà mục tiêu', selected.giftId)}
                        <div class="gmd-field">
                            <label>Mục tiêu (Target Count)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 500}">
                        </div>
                        <div class="gmd-field">
                            <label>Hiện tại (Current Count)</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Độ dày thanh (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="6" max="60" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh (Bar Style)</label>
                            <select class="gmd-select" data-goal-key="barStyle">
                                <option value="solid" ${selected.barStyle === 'solid' ? 'selected' : ''}>Classic Solid/Gradient</option>
                                <option value="glow-pulse" ${selected.barStyle === 'glow-pulse' ? 'selected' : ''}>Neon Glow Pulse</option>
                                <option value="gradient-sweep" ${selected.barStyle === 'gradient-sweep' ? 'selected' : ''}>Gradient Sweep</option>
                                <option value="candy-stripe" ${selected.barStyle === 'candy-stripe' ? 'selected' : ''}>Candy Stripe Shimmer</option>
                            </select>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        <div class="gmd-field">
                            <label>Dòng phụ đề (Subtitle)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}" placeholder="Ví dụ: Gửi quà để mở khóa rương">
                        </div>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 32)}
                        ${makeCompactFontSizeField('Cỡ chữ Phụ đề', 'subtitleFontSize', 20)}
                    </div>
                `;
            } else if (selected.type === 'combo') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-bolt"></i> COMBO WIDGET</h4>
                        <p class="gmd-subline" style="margin:0 0 10px 0;">Combo Widget hiển thị các chuỗi quà tặng combo được streamer nhận real-time trên stream TikTok Live.</p>
                        <div class="gmd-field">
                            <label>Số Combo hiện tại (Để test)</label>
                            <input class="gmd-input" type="number" data-goal-key="comboCount" value="${selected.comboCount || 88}">
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ đề (Subtitle)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}" placeholder="Ví dụ: Đang chạy chuỗi combo">
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tên combo', 'fontSize', 40)}
                        ${makeCompactFontSizeField('Cỡ chữ Số combo', 'numberFontSize', 64)}
                        ${makeCompactFontSizeField('Cỡ chữ Phụ đề', 'subtitleFontSize', 20)}
                    </div>
                `;
            } else if (selected.type === 'media-asset') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-image"></i> THUỘC TÍNH TÀI NGUYÊN</h4>
                        <div class="gmd-field">
                            <label>Độ trong suốt (Opacity)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" step="0.1" min="0" max="1" data-goal-key="opacity" value="${selected.opacity !== undefined ? selected.opacity : 1}"><span>x</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="1" step="0.05" data-goal-key="opacity" value="${selected.opacity !== undefined ? selected.opacity : 1}">
                        
                        <div class="gmd-field">
                            <label>Chế độ hiển thị (Fit Mode)</label>
                            <select class="gmd-select" data-goal-key="fitMode">
                                <option value="contain" ${selected.fitMode === 'contain' ? 'selected' : ''}>Chứa gọn (Contain)</option>
                                <option value="cover" ${selected.fitMode === 'cover' ? 'selected' : ''}>Bao phủ (Cover)</option>
                                <option value="fill" ${selected.fitMode === 'fill' ? 'selected' : ''}>Giãn đầy (Stretch)</option>
                            </select>
                        </div>
                    </div>
                `;
            } else if (selected.type === 'goal-list') {
                const makeCustomGiftSelectForGoal = (idx, currentId) => {
                    const currentGift = this.gifts.find(g => String(g.id) === String(currentId)) || this.gifts.find(g => String(g.name).toLowerCase() === String(currentId).toLowerCase()) || this.gifts[0] || { id: '', name: 'Chọn quà', icon: '' };
                    const currentIcon = currentGift.icon ? (currentGift.icon.startsWith('http') ? currentGift.icon : this.apiBase + currentGift.icon) : '';
                    return `
                        <div class="gmd-custom-select" style="margin: 0;">
                            <div class="gmd-custom-select-header" style="height: 32px; padding: 4px 8px; font-size: 11px; background: #1e293b; border: 1px solid rgba(255,255,255,0.08);" onclick="this.nextElementSibling.classList.toggle('show')">
                                ${currentIcon ? `<img src="${currentIcon}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: contain; margin-right: 6px;">` : '<div style="width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,0.1); margin-right: 6px; display: flex; align-items: center; justify-content: center; font-size: 8px;">🎁</div>'}
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">${currentGift.name || currentGift.id}</span>
                                <i class="fas fa-chevron-down" style="margin-left: auto; font-size: 8px; opacity: 0.7;"></i>
                            </div>
                            <div class="gmd-custom-select-options" style="top: 32px; z-index: 100;">
                                ${this.gifts.map(g => {
                                    const gIcon = g.icon ? (g.icon.startsWith('http') ? g.icon : this.apiBase + g.icon) : '';
                                    return `
                                        <div class="gmd-custom-select-option ${String(g.id) === String(currentId) ? 'active' : ''}" style="padding: 6px 8px; font-size: 11px;" onclick="window.giftMenuDesigner.updateGoalListItem(${idx}, 'giftId', '${g.id}'); window.giftMenuDesigner.renderInspector();">
                                            ${gIcon ? `<img src="${gIcon}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: contain;">` : '<div style="width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 8px;">🎁</div>'}
                                            <span>${g.name || g.id}</span>
                                            <span style="margin-left: auto; font-size: 8px; color: #a855f7;">${g.coins || 1}💎</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                };

                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-list-ul"></i> MULTI GOAL LIST</h4>
                        <div class="gmd-field">
                            <label>Dòng chân trang (Footer Text)</label>
                            <input class="gmd-input" type="text" data-goal-key="footerText" value="${selected.footerText || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu tiến trình chung</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ff007f'}">
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị tên quà</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showGiftName" ${selected.showGiftName !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field">
                            <label>Độ dày thanh (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 12}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="4" max="32" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 12}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh (Bar Style)</label>
                            <select class="gmd-select" data-goal-key="barStyle">
                                <option value="solid" ${selected.barStyle === 'solid' ? 'selected' : ''}>Classic Solid/Gradient</option>
                                <option value="glow-pulse" ${selected.barStyle === 'glow-pulse' ? 'selected' : ''}>Neon Glow Pulse</option>
                                <option value="gradient-sweep" ${selected.barStyle === 'gradient-sweep' ? 'selected' : ''}>Gradient Sweep</option>
                                <option value="candy-stripe" ${selected.barStyle === 'candy-stripe' ? 'selected' : ''}>Candy Stripe Shimmer</option>
                            </select>
                        </div>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 32)}
                        ${makeCompactFontSizeField('Cỡ chữ Dòng quà', 'rowFontSize', 22)}
                        ${makeCompactFontSizeField('Cỡ chữ Chân trang', 'footerFontSize', 20)}
                    </div>
                        
                    <div class="gmd-section">
                        <div class="gmd-field" style="margin-top: 10px;">
                            <label style="font-weight: 800; color: #a855f7;">Danh sách mục tiêu</label>
                            <div class="gmd-subline" style="margin-bottom:8px; font-size:10px;">Các mục tiêu quà tặng hiển thị trong bảng:</div>
                            <div class="gmd-goal-list-items-editor" style="display:flex; flex-direction:column; gap:8px;">
                                ${(selected.goals || []).map((g, idx) => `
                                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:6px; border-radius:6px; display:flex; flex-direction:column; gap:4px;">
                                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:bold; color:#cbd5e1;">
                                            <span>Mục tiêu #${idx + 1}: ${g.giftName || g.giftId}</span>
                                            <button class="gmd-btn" style="background:none; border:none; color:#ef4444; padding:0; cursor:pointer;" onclick="window.giftMenuDesigner.removeGoalListItem('${selected.id}', ${idx})"><i class="fas fa-trash-alt"></i></button>
                                        </div>
                                        <div style="display:grid; grid-template-columns: 1.2fr 1fr 1fr; gap:6px; align-items:center;">
                                            ${makeCustomGiftSelectForGoal(idx, g.giftId)}
                                            <input class="gmd-input gmd-input-compact" style="font-size:10px; background:#1e293b; color:#fff; height: 32px;" type="number" placeholder="Mục tiêu" value="${g.target}" oninput="window.giftMenuDesigner.updateGoalListItem(${idx}, 'target', this.value)">
                                            <input class="gmd-input gmd-input-compact" style="font-size:10px; background:#1e293b; color:#fff; height: 32px;" type="number" placeholder="Hiện tại" value="${g.current}" oninput="window.giftMenuDesigner.updateGoalListItem(${idx}, 'current', this.value)">
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="gmd-btn" style="margin-top:8px; width:100%; font-size:11px; background:rgba(139,92,246,0.1); border:1px dashed rgba(139,92,246,0.4); color:#c084fc; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.giftMenuDesigner.addGoalListItem('${selected.id}')"><i class="fas fa-plus"></i> Thêm mục tiêu</button>
                        </div>
                    </div>
                `;
            } else if (selected.type === 'text') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> THUỘC TÍNH VĂN BẢN</h4>
                        <div class="gmd-field">
                            <label>Nội dung văn bản</label>
                            <textarea class="gmd-input" style="height:60px; font-family:inherit; font-size:12px; resize:none; background:#1e293b; color:#fff;" data-goal-key="text">${selected.text || 'Nhập văn bản'}</textarea>
                        </div>
                        <div class="gmd-field">
                            <label>Màu chữ</label>
                            <input class="gmd-color" type="color" data-goal-key="color" value="${selected.color || '#ffffff'}">
                        </div>
                        ${makeCompactFontSizeField('Cỡ chữ (Font Size)', 'fontSize', 36, 12, 120)}
                        <div class="gmd-field">
                            <label>Độ đậm (Font Weight)</label>
                            <select class="gmd-select" data-goal-key="fontWeight">
                                <option value="normal" ${selected.fontWeight === 'normal' ? 'selected' : ''}>Bình thường</option>
                                <option value="bold" ${selected.fontWeight === 'bold' ? 'selected' : ''}>In đậm (Bold)</option>
                                <option value="900" ${selected.fontWeight === '900' ? 'selected' : ''}>Siêu đậm (Black)</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Bóng chữ (Text Shadow)</label>
                            <select class="gmd-select" data-goal-key="textShadow">
                                <option value="none" ${selected.textShadow === 'none' ? 'selected' : ''}>Không bóng</option>
                                <option value="0 0 8px rgba(168,85,247,0.8)" ${selected.textShadow === '0 0 8px rgba(168,85,247,0.8)' ? 'selected' : ''}>Tím Neon Glow</option>
                                <option value="0 0 8px rgba(245,158,11,0.8)" ${selected.textShadow === '0 0 8px rgba(245,158,11,0.8)' ? 'selected' : ''}>Vàng Neon Glow</option>
                                <option value="0 0 8px rgba(236,72,153,0.8)" ${selected.textShadow === '0 0 8px rgba(236,72,153,0.8)' ? 'selected' : ''}>Hồng Neon Glow</option>
                                <option value="2px 2px 4px rgba(0,0,0,0.8)" ${selected.textShadow === '2px 2px 4px rgba(0,0,0,0.8)' ? 'selected' : ''}>Bóng đổ đen dịu</option>
                            </select>
                        </div>
                    </div>
                `;
            }
            
            inspector.innerHTML = `
                <div class="gmd-selected-card">
                    <div style="font-size: 20px;">${selected.type === 'media-asset' ? '🖼️' : '📊'}</div>
                    <input class="gmd-title-input" data-goal-key="name" value="${selected.name}">
                    <button class="gmd-delete-btn" data-action="goal-delete"><i class="fas fa-trash"></i></button>
                </div>
                
                <div class="gmd-section">
                    <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>
                    <div class="gmd-field"><label>Vị trí X / Y (Logical)</label></div>
                    <div class="gmd-row">
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="x" value="${selected.x}"><span>px</span></div>
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="y" value="${selected.y}"><span>px</span></div>
                    </div>
                    <div class="gmd-row" style="margin-top: 8px;">
                        <div class="gmd-field" style="margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                <label style="margin: 0; font-size: 11px;">Rộng (W)</label>
                                <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="w" value="${selected.w}"><span>px</span></div>
                            </div>
                            <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="100" max="1080" data-goal-key="w" value="${selected.w}">
                        </div>
                        <div class="gmd-field" style="margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                <label style="margin: 0; font-size: 11px;">Cao (H)</label>
                                <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="h" value="${selected.h}"><span>px</span></div>
                            </div>
                            <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="30" max="1920" data-goal-key="h" value="${selected.h}">
                        </div>
                    </div>
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Khóa tỷ lệ (Aspect Ratio)</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="lockRatio" ${selected.lockRatio ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    <div class="gmd-field" style="margin-top: 8px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                            <label style="margin: 0; font-size: 11px;">Vị trí nội dung (Dọc)</label>
                            <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="contentOffsetY" value="${selected.contentOffsetY !== undefined ? selected.contentOffsetY : 0}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="-300" max="300" data-goal-key="contentOffsetY" value="${selected.contentOffsetY !== undefined ? selected.contentOffsetY : 0}">
                    </div>

                    <!-- Hide Background -->
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Ẩn viền và nền bảng</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="hideBg" ${selected.hideBg ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>

                    <!-- Custom BG Color -->
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Tự chọn màu nền bảng</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="useCustomBg" ${selected.useCustomBg ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ${selected.useCustomBg ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu nền bảng</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="bgColor" value="${selected.bgColor || '#0a0a14'}">
                    </div>
                    ` : ''}

                    <!-- Custom Text Color -->
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Tự chọn màu chữ</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="useCustomTextColor" ${selected.useCustomTextColor ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ${selected.useCustomTextColor ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu chữ</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="textColor" value="${selected.textColor || '#ffffff'}">
                    </div>
                    ` : ''}
                    <div class="gmd-field" style="margin-top: 10px;">
                        <div style="display:flex; gap:10px;">
                            <button class="gmd-btn" data-action="goal-duplicate"><i class="far fa-clone"></i> Nhân bản</button>
                            <button class="gmd-btn" data-action="goal-delete"><i class="far fa-trash-alt"></i> Xóa</button>
                        </div>
                    </div>
                </div>
                
                ${testButtonHTML}
                ${specificConfigHTML}
            `;
        }

        renderGoalBoardLayerPanel() {
            const sorted = [...this.goalBoard.items].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
            return `
                <div class="gmd-section gmd-layer-panel">
                    <h4><i class="fas fa-layer-group"></i> LAYERS BẢNG MỤC TIÊU</h4>
                    <div class="gmd-layer-list">
                        ${sorted.length ? sorted.map((item) => `
                            <div class="gmd-layer-item ${item.id === this.goalBoard.selectedId ? 'active' : ''}">
                                <button class="gmd-layer-main" data-action="goal-layer-select" data-layer-id="${item.id}">
                                    <div style="font-size: 14px;">${item.type === 'media-asset' ? '🖼️' : '📊'}</div>
                                    <div class="gmd-layer-name">${item.name || item.type}</div>
                                </button>
                                <div class="gmd-layer-actions">
                                    <button class="gmd-layer-btn" data-action="goal-layer-toggle-lock" data-layer-id="${item.id}" title="${item.locked ? 'Mở khóa' : 'Khóa'}">
                                        <i class="fas ${item.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                                    </button>
                                    <button class="gmd-layer-btn" data-action="goal-layer-toggle-visible" data-layer-id="${item.id}" title="${item.visible !== false ? 'Ẩn' : 'Hiện'}">
                                        <i class="fas ${item.visible !== false ? 'fa-eye' : 'fa-eye-slash'}"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('') : '<div style="text-align:center; padding:10px; color:#64748b; font-size:11px;">Chưa có layer nào</div>'}
                    </div>
                </div>
            `;
        }

        updateGoalBoardSelectedItem(key, value) {
            const item = this.goalBoard.items.find((x) => x.id === this.goalBoard.selectedId);
            if (!item) return;

            if (['x', 'y', 'w', 'h', 'targetCount', 'currentCount', 'limitCount', 'borderRadius', 'opacity', 'fontSize', 'subtitleFontSize', 'rowFontSize', 'numberFontSize', 'valueFontSize', 'footerFontSize', 'comboCount', 'barHeight', 'contentOffsetY'].includes(key)) {
                const numVal = Number(value);
                if (item.lockRatio) {
                    if (key === 'w' && item.w) {
                        const ratio = item.h / item.w;
                        item.w = numVal;
                        item.h = Math.round(numVal * ratio);
                    } else if (key === 'h' && item.h) {
                        const ratio = item.w / item.h;
                        item.h = numVal;
                        item.w = Math.round(numVal * ratio);
                    } else {
                        item[key] = numVal;
                    }
                } else {
                    item[key] = numVal;
                }
            } else if (key === 'showPercentage' || key === 'showAvatar' || key === 'showValue' || key === 'lockRatio' || key === 'showGiftName' || key === 'useCustomBg' || key === 'useCustomTextColor' || key === 'hideBg') {
                item[key] = Boolean(value);
                if (key === 'lockRatio') {
                    if (item.lockRatio) {
                        item.lockedW = item.w;
                        item.lockedH = item.h;
                    } else {
                        delete item.lockedW;
                        delete item.lockedH;
                    }
                }
            } else {
                item[key] = value;
                if (key === 'giftId') {
                    const cleanVal = String(value).trim();
                    const gift = this.gifts.find(g => String(g.id).toLowerCase() === cleanVal.toLowerCase());
                    if (gift) {
                        item.giftName = gift.name || cleanVal;
                    }
                }
            }
            
            // Sync all inputs with the same data-goal-key in the inspector
            const inputs = this.mount.querySelectorAll(`#gmd-inspector [data-goal-key="${key}"]`);
            inputs.forEach(input => {
                if (document.activeElement === input) return;
                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else {
                    input.value = value;
                }
            });
            
            this.renderCanvas();
            this.pushHistory('update-goal-item');
        }

        handleGoalBoardMouseDown(e) {
            const itemNode = e.target.closest('.gmd-item');
            const safe = this.mount.querySelector('#gmd-safe-area');
            if (!itemNode) {
                if (safe && safe.contains(e.target)) {
                    this.goalBoard.selectedId = null;
                    this.goalBoard.selectedIds = [];
                    this.renderCanvas();
                    this.renderInspector();
                }
                return;
            }
            
            const itemId = itemNode.dataset.itemId;
            const item = this.goalBoard.items.find(x => x.id === itemId);
            if (!item) return;
            
            if (e.shiftKey) {
                if (this.goalBoard.selectedIds.includes(itemId)) {
                    this.goalBoard.selectedIds = this.goalBoard.selectedIds.filter(id => id !== itemId);
                    if (this.goalBoard.selectedId === itemId) {
                        this.goalBoard.selectedId = this.goalBoard.selectedIds[0] || null;
                    }
                } else {
                    this.goalBoard.selectedIds.push(itemId);
                    this.goalBoard.selectedId = itemId;
                }
            } else {
                this.goalBoard.selectedId = itemId;
                this.goalBoard.selectedIds = [itemId];
            }
            this.renderCanvas();
            this.renderInspector();
            
            if (item.locked) return;
            
            const handle = e.target.closest('[data-handle]');
            const s = safe.clientWidth / 1080;
            
            if (handle && handle.dataset.handle === 'resize') {
                const groupStarts = {};
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                if (item.groupId) {
                    this.goalBoard.items.forEach(x => {
                        if (x.groupId === item.groupId) {
                            groupStarts[x.id] = { x: x.x, y: x.y, w: x.w, h: x.h, fontSize: x.fontSize || 36 };
                            if (x.x < minX) minX = x.x;
                            if (x.y < minY) minY = x.y;
                            if (x.x + x.w > maxX) maxX = x.x + x.w;
                            if (x.y + x.h > maxY) maxY = x.y + x.h;
                        }
                    });
                }
                
                this.dragState = {
                    mode: 'goal-resize',
                    id: item.id,
                    sx: e.clientX,
                    sy: e.clientY,
                    w: item.w,
                    h: item.h,
                    scale: s,
                    groupStarts,
                    minX,
                    minY,
                    maxX,
                    maxY
                };
            } else {
                // For goal-move, record start coordinates of all layers in the same group
                const groupStarts = {};
                if (item.groupId) {
                    this.goalBoard.items.forEach(x => {
                        if (x.groupId === item.groupId) {
                            groupStarts[x.id] = { x: x.x, y: x.y };
                        }
                    });
                }
                this.dragState = {
                    mode: 'goal-move',
                    id: item.id,
                    sx: e.clientX,
                    sy: e.clientY,
                    x: item.x,
                    y: item.y,
                    scale: s,
                    groupStarts
                };
            }
        }

        async loadGoalBoardLayout() {
            let payload = null;
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/layout`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && data.layout) payload = data.layout;
                }
            } catch (_e) {}
            if (!payload) {
                try { payload = JSON.parse(localStorage.getItem('goalBoardLayoutV1') || 'null'); } catch (_e) { payload = null; }
            }
            if (!payload || !Array.isArray(payload.layers)) {
                this.goalBoard.items = [];
            } else {
                this.goalBoard.items = payload.layers.map((layer, idx) => ({
                    ...layer,
                    visible: layer.visible !== false,
                    locked: Boolean(layer.locked),
                    zIndex: layer.zIndex || idx + 1
                }));
            }
            
            const first = this.goalBoard.items[0];
            this.goalBoard.selectedId = first ? first.id : null;
            this.goalBoard.selectedIds = first ? [first.id] : [];
            
            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('load-goal-layout');
        }

        async saveGoalBoardLayout(showToast = true) {
            const payload = {
                version: 1,
                savedAt: new Date().toISOString(),
                aspectRatio: '9:16',
                canvas: {
                    width: 1080,
                    height: 1920,
                    aspectRatio: '9:16'
                },
                layers: this.goalBoard.items.map(i => ({ ...i }))
            };
            localStorage.setItem('goalBoardLayoutV1', JSON.stringify(payload));
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                await fetch(`${this.apiBase}/api/tiktok/goal-board/layout`, { method: 'POST', headers, body: JSON.stringify(payload) });
            } catch (_e) {}
            if (showToast && window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', 'Đã lưu layout bảng mục tiêu');
            }
        }
        
        async loadGoalTemplates() {
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/templates`, { headers });
                const data = await res.json();
                this.customTemplates = Array.isArray(data.customTemplates) ? data.customTemplates : [];
            } catch (e) {
                console.error('Failed to load custom goal templates:', e);
                this.customTemplates = [];
            }
            if (this.mode === 'goal-board' && this.leftPanelTab === 'templates') {
                this.renderLeftPanel();
            }
        }

        showSaveTemplateModal() {
            const modalId = 'gmd-save-template-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();
            
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'gmd-modal-overlay';
            modal.innerHTML = `
                <div class="gmd-modal-content" style="background:#0f172a; border:1px solid #334155; border-radius:16px; padding:20px; width:450px; max-width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.5); font-family:inherit; color:#fff; position:relative; box-sizing:border-box;">
                    <div class="gmd-modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:10px; margin-bottom:14px;">
                        <h3 style="margin:0; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;"><i class="fas fa-star" style="color:#a855f7;"></i> Lưu thành bảng mục tiêu mới</h3>
                        <button class="gmd-modal-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="document.getElementById('${modalId}').remove()">&times;</button>
                    </div>
                    <div class="gmd-modal-body" style="display:flex; flex-direction:column; gap:12px;">
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Tên Template *</label>
                            <input type="text" id="gmd-tmpl-name" class="gmd-input" placeholder="Ví dụ: Thử Thách Boss Hoàng Kim" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="${this.goalBoard.selectedId ? (this.goalBoard.items.find(x=>x.id===this.goalBoard.selectedId)?.name || '') : ''}">
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Chuyên mục (Category)</label>
                            <select id="gmd-tmpl-category" class="gmd-select" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px; cursor:pointer;">
                                <option value="goal-board">Mục tiêu quà tặng (Goal Board)</option>
                                <option value="boss-goal">Thách đấu Boss (Boss Challenge)</option>
                                <option value="unlock-reward">Mở khóa hộp quà (Unlock Reward)</option>
                                <option value="idol-goal">Idol/Beauty Live</option>
                                <option value="vip-goal">Luxury VIP Goal</option>
                                <option value="multi-goal">Nhiều mục tiêu (Multi Goal)</option>
                                <option value="contributors">Top Contributors</option>
                                <option value="combo">Combo Boost Effect</option>
                                <option value="unlock">Unlock Milestone</option>
                                <option value="mission">Event Mission Board</option>
                            </select>
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Tags (Phân tách bằng dấu phẩy)</label>
                            <input type="text" id="gmd-tmpl-tags" class="gmd-input" placeholder="Ví dụ: gaming, boss, vip, gold" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;">
                        </div>
                        <div class="gmd-modal-field gmd-toggle-row" style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Đây là mẫu Premium (Trả phí)</label>
                            <label class="gmd-switch" style="position:relative; display:inline-block; width:40px; height:20px;">
                                <input type="checkbox" id="gmd-tmpl-premium" style="opacity:0; width:0; height:0;" onchange="document.getElementById('gmd-tmpl-price-row').style.display = this.checked ? 'block' : 'none'">
                                <span style="position:absolute; cursor:pointer; inset:0; background:#334155; transition:0.3s; border-radius:34px;"></span>
                            </label>
                        </div>
                        <div class="gmd-modal-field" id="gmd-tmpl-price-row" style="display:none; margin-top:4px; display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Giá bán (VNĐ)</label>
                            <input type="number" id="gmd-tmpl-price" class="gmd-input" placeholder="Ví dụ: 99000" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="79000">
                        </div>
                    </div>
                    <div class="gmd-modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #1e293b; padding-top:14px; margin-top:18px;">
                        <button class="gmd-btn" style="background:#334155; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;" onclick="document.getElementById('${modalId}').remove()">Hủy</button>
                        <button class="gmd-btn primary" id="gmd-tmpl-save-btn" style="background:#8b5cf6; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold; box-shadow:0 0 10px rgba(139,92,246,0.3);">Lưu template</button>
                    </div>
                </div>
            `;
            
            // Background overlay styles
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.background = 'rgba(0,0,0,0.7)';
            modal.style.backdropFilter = 'blur(4px)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '99999';
            
            // Style inner switch styling elements
            const switchEl = modal.querySelector('.gmd-switch');
            const switchSpan = switchEl.querySelector('span');
            const switchInput = switchEl.querySelector('input');
            switchInput.addEventListener('change', () => {
                switchSpan.style.background = switchInput.checked ? '#8b5cf6' : '#334155';
            });
            
            this.mount.appendChild(modal);
            
            const saveBtn = modal.querySelector('#gmd-tmpl-save-btn');
            saveBtn.addEventListener('click', async () => {
                const name = String(modal.querySelector('#gmd-tmpl-name').value).trim();
                const category = modal.querySelector('#gmd-tmpl-category').value;
                const tagsRaw = modal.querySelector('#gmd-tmpl-tags').value;
                const isPremium = modal.querySelector('#gmd-tmpl-premium').checked;
                const price = Number(modal.querySelector('#gmd-tmpl-price').value) || 0;
                
                if (!name) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('error', 'Vui lòng nhập tên template!');
                    } else {
                        alert('Vui lòng nhập tên template!');
                    }
                    return;
                }
                
                const tags = tagsRaw.split(',').map(x => x.trim()).filter(Boolean);
                if (tags.length === 0) tags.push(category);
                
                const payload = {
                    name,
                    category,
                    tags,
                    isPremium,
                    price,
                    canvas: {
                        width: 1080,
                        height: 1920,
                        aspectRatio: '9:16'
                    },
                    layers: (this.goalBoard.selectedIds && this.goalBoard.selectedIds.length > 0)
                        ? this.goalBoard.items.filter(i => this.goalBoard.selectedIds.includes(i.id)).map(i => ({ ...i }))
                        : this.goalBoard.items.map(i => ({ ...i }))
                };
                
                saveBtn.disabled = true;
                saveBtn.innerText = 'Đang lưu...';
                
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (this.token) headers.Authorization = `Bearer ${this.token}`;
                    
                    const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/templates`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    
                    if (data.success) {
                        if (window.app && typeof window.app.showNotification === 'function') {
                            window.app.showNotification('success', 'Đã lưu template mới thành công!');
                        }
                        modal.remove();
                        await this.loadGoalTemplates();
                    } else {
                        throw new Error(data.error || 'Lỗi server');
                    }
                } catch (e) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = 'Lưu template';
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('error', `Không thể lưu template: ${e.message}`);
                    } else {
                        alert(`Không thể lưu template: ${e.message}`);
                    }
                }
            });
        }

        updateGoalListItem(idx, field, value) {
            const selected = this.goalBoard.items.find((x) => x.id === this.goalBoard.selectedId);
            if (selected && selected.type === 'goal-list' && Array.isArray(selected.goals) && selected.goals[idx]) {
                const goal = selected.goals[idx];
                if (field === 'target' || field === 'current') {
                    goal[field] = Number(value) || 0;
                } else if (field === 'giftId') {
                    const cleanVal = String(value).trim();
                    goal.giftId = cleanVal;
                    // Auto-sync nickname/giftName
                    const gift = this.gifts.find(g => String(g.id).toLowerCase() === cleanVal.toLowerCase());
                    if (gift) {
                        goal.giftName = gift.name || cleanVal;
                        goal.icon = gift.icon || '';
                    } else {
                        goal.giftName = cleanVal;
                    }
                }
                this.renderCanvas();
                this.pushHistory('update-goal-list-item');
            }
        }

        addGoalListItem(itemId) {
            const item = this.goalBoard.items.find((x) => x.id === itemId);
            if (item && item.type === 'goal-list') {
                if (!Array.isArray(item.goals)) {
                    item.goals = [];
                }
                const firstGift = this.gifts[0] || { id: 'rose', name: 'Rose', icon: '/assets/gift-icons/Rose.png' };
                item.goals.push({
                    giftId: firstGift.id,
                    giftName: firstGift.name || firstGift.id,
                    current: 0,
                    target: 100,
                    icon: firstGift.icon || ''
                });
                this.renderCanvas();
                this.renderInspector();
                this.pushHistory('add-goal-list-item');
            }
        }

        removeGoalListItem(itemId, idx) {
            const item = this.goalBoard.items.find((x) => x.id === itemId);
            if (item && item.type === 'goal-list' && Array.isArray(item.goals)) {
                item.goals.splice(idx, 1);
                this.renderCanvas();
                this.renderInspector();
                this.pushHistory('remove-goal-list-item');
            }
        }
        
        async sendSimulatedGift(itemId) {
            const item = this.goalBoard.items.find(x => x.id === itemId);
            if (!item) return;

            let giftId = 'rose';
            let giftName = 'Rose';
            let repeatCount = 1;

            if (item.type === 'goal-bar' || item.type === 'boss-bar' || item.type === 'mystery-chests') {
                giftId = item.giftId || 'rose';
                giftName = item.giftName || 'Rose';
                repeatCount = item.type === 'boss-bar' ? Math.ceil((item.targetCount || 100) / 10) : 10;
                
                item.currentCount = (Number(item.currentCount) || 0) + repeatCount;
            } else if (item.type === 'goal-list' && Array.isArray(item.goals) && item.goals.length > 0) {
                const randomGoal = item.goals[Math.floor(Math.random() * item.goals.length)];
                giftId = randomGoal.giftId || 'rose';
                giftName = randomGoal.giftName || 'Rose';
                repeatCount = Math.ceil((randomGoal.target || 100) / 5);
                
                randomGoal.current = (Number(randomGoal.current) || 0) + repeatCount;
            } else if (item.type === 'top-contributors' || item.type === 'podium-contributors') {
                const testNames = ['Vua Tặng Quà 👑', 'Minh Anh idol', 'Thần Donate ⚡', 'Khánh Huyền Cute', 'Anh Hai Sài Gòn'];
                const nickname = testNames[Math.floor(Math.random() * testNames.length)];
                giftId = 'galaxy';
                giftName = 'Galaxy';
                repeatCount = 1;
                const value = Math.floor(Math.random() * 500) + 100;
                
                if (!Array.isArray(item.contributors)) item.contributors = [];
                const existing = item.contributors.find(c => c.nickname === nickname);
                if (existing) {
                    existing.value = (Number(existing.value) || 0) + value;
                } else {
                    item.contributors.push({ nickname, value, avatar: '' });
                }
                item.contributors.sort((a, b) => b.value - a.value);
                item.contributors = item.contributors.slice(0, 20);
            } else if (item.type === 'combo') {
                giftId = 'corgi';
                giftName = 'Corgi';
                repeatCount = (item.comboCount || 0) + 5;
                item.comboCount = repeatCount;
            }

            // Immediately render on canvas
            this.renderCanvas();
            this.renderInspector();

            // Save layout to backend which automatically saves file and broadcasts the update to OBS Overlay
            await this.saveGoalBoardLayout(false);

            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', `Đã test gửi ${repeatCount}x ${giftName}!`);
            }
        }
        
        onModeChange() {
            // Placeholder compatible wrapper
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const designer = new GiftMenuDesigner();
        designer.init();
        window.giftMenuDesigner = designer;
    });
})();

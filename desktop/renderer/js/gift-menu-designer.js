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
        }

        init() {
            if (!this.mount) return;
            this.injectSharedRendererCss();
            this.render();
            this.bindEvents();
            this.loadGiftLibrary();
            this.loadLayout();
        }

        injectSharedRendererCss() {
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
                        </div>
                        <div class="gmd-group">
                            <button class="gmd-btn" data-action="preview-browser"><i class="fas fa-desktop"></i> Xem trên trình duyệt</button>
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
                if (action === 'save') this.saveLayout(true);
                if (action === 'save-export') this.saveAndExport();
                if (action === 'preview-browser') window.open('http://localhost:9000/overlay/gift-menu/', '_blank');
                if (action === 'new-layout') { this.items = []; this.clearSelection(); this.renderCanvas(); this.renderInspector(); this.renderMyLibrary(); this.pushHistory('new-layout'); }
                if (action === 'zoom-in') this.setZoom(this.zoomLevel + 0.1);
                if (action === 'zoom-out') this.setZoom(this.zoomLevel - 0.1);
            });

            this.mount.addEventListener('input', (e) => {
                const el = e.target;
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
            });

            this.mount.querySelectorAll('[data-ratio]').forEach((btn) => btn.addEventListener('click', () => this.setAspectRatio(btn.dataset.ratio)));

            this.mount.addEventListener('dragstart', (e) => {
                const giftCard = e.target.closest('.gmd-gift-card');
                if (!giftCard) return;
                e.dataTransfer.setData('text/plain', giftCard.dataset.giftId || '');
            });

            const canvas = this.mount.querySelector('#gmd-canvas');
            if (canvas) {
                canvas.addEventListener('dragover', (e) => e.preventDefault());
                canvas.addEventListener('drop', (e) => {
                    e.preventDefault();
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
                    // Let click handler manage multi-select toggle without starting drag.
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
    }

    document.addEventListener('DOMContentLoaded', () => {
        const designer = new GiftMenuDesigner();
        designer.init();
        window.giftMenuDesigner = designer;
    });
})();

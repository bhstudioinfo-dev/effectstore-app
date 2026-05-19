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
            this.aspectRatio = '9:16';
            this.dragState = null;
            this.canvasSize = { width: 720, height: 960 };
            this.zoomLevel = 1;
            this.panX = 0;
            this.panY = 0;
            this.isSpacePressed = false;
            this.inspectorTab = 'gift';
            this.auraOptions = [
                { value: 'None', label: 'Không có' },
                { value: 'Glow', label: 'Glow (Tỏa sáng)' },
                { value: 'Bubble', label: 'Bubble (Bong bóng)' },
                { value: 'Magic Ring', label: 'Magic Ring (Vòng phép thuật)' },
                { value: 'Neon Frame', label: 'Neon Frame (Khung Neon)' },
                { value: 'Light Sweep', label: 'Light Sweep (Quét sáng)' }
            ];
        }

        init() {
            if (!this.mount) return;
            this.render();
            this.bindEvents();
            this.loadGiftLibrary();
            this.loadLayout();
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
                                    <button class="gmd-btn icon" data-action="duplicate"><i class="far fa-clone"></i></button>
                                    <button class="gmd-btn icon" data-action="delete"><i class="far fa-trash-alt"></i></button>
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
            this.updateCanvasSizeByRatio();
            this.renderInspector();
            this.renderMyLibrary();
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
            this.selectedId = item.id;
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
        }

        getAuraClass(type) {
            const map = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep' };
            return map[type] || '';
        }

        getMotionClass(type) {
            const map = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake', 'Light Sweep': 'anim-sweep' };
            return map[type] || '';
        }

        renderCanvas() {
            const canvas = this.mount.querySelector('#gmd-canvas');
            const stage = this.mount.querySelector('#gmd-stage');
            if (!canvas || !stage) return;
            Array.from(stage.querySelectorAll('.gmd-item')).forEach((n) => n.remove());
            this.items.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach((item) => {
                if (item.visible === false) return;
                const selected = this.selectedId === item.id;
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
                    ${selected && !item.locked ? '<span class="gmd-handle gmd-rotate-handle" data-handle="rotate">⟳</span><span class="gmd-handle gmd-resize-handle" data-handle="resize"></span>' : ''}
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

        selectItem(id) {
            this.selectedId = id;
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
                            <div class="gmd-layer-item ${this.selectedId === item.id ? 'active' : ''}">
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
                    <div class="gmd-field"><label>Hiệu ứng xuất hiện</label>${this.renderSelect('animationType', selected.animationType, ['None', 'Pulse', 'Bounce', 'Float', 'Zoom', 'Shake', 'Light Sweep'])}</div>
                    <div class="gmd-field"><label>Tốc độ xuất hiện</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-key="animationSpeed" value="${selected.animationSpeed || 1}"><span>s</span></div></div>
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
            if (key === 'showName') item[key] = Boolean(value);
            else if (['x', 'y', 'width', 'height', 'rotation', 'textSize', 'textGap', 'animationSpeed', 'auraSpeed', 'auraScale'].includes(key)) {
                item[key] = Number(value);
                // Keep icon box square by default for cleaner designer UX
                if (key === 'width') item.height = item.width;
                if (key === 'height') item.width = item.height;
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
            const item = this.items.find((x) => x.id === this.selectedId);
            if (!item) return;
            const clone = { ...item, id: `itm_${Date.now()}_${Math.floor(Math.random() * 1000)}`, x: item.x + 20, y: item.y + 20, zIndex: this.items.length + 1 };
            this.items.push(clone);
            this.selectedId = clone.id;
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
        }

        deleteSelected() {
            if (!this.selectedId) return;
            this.items = this.items.filter((i) => i.id !== this.selectedId);
            this.selectedId = null;
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
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
            const payload = { version: 2, savedAt: new Date().toISOString(), aspectRatio: this.aspectRatio, canvasSize: this.canvasSize, items: this.items.map((i) => ({ ...i })) };
            localStorage.setItem('giftMenuDesignerLayoutV2', JSON.stringify(payload));
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, { method: 'POST', headers, body: JSON.stringify(payload) });
            } catch (_e) {}
            if (showToast && window.app && typeof window.app.showNotification === 'function') window.app.showNotification('success', 'Đã lưu layout');
            this.renderMyLibrary();
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
            this.selectedId = this.items[0] ? this.items[0].id : null;
            this.setAspectRatio(this.aspectRatio);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
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
                if (itemNode) this.selectItem(itemNode.dataset.itemId);
                if (!giftCard && !itemNode && !btn && clickedCanvas) {
                    this.selectedId = null;
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
                    this.selectItem(layerId);
                    return;
                }
                if (action === 'layer-toggle-visible' && layerId) {
                    const item = this.items.find((x) => x.id === layerId);
                    if (!item) return;
                    item.visible = item.visible === false;
                    if (item.visible === false && this.selectedId === layerId) this.selectedId = null;
                    this.renderCanvas();
                    this.renderInspector();
                    return;
                }
                if (action === 'layer-toggle-lock' && layerId) {
                    const item = this.items.find((x) => x.id === layerId);
                    if (!item) return;
                    item.locked = !item.locked;
                    this.renderCanvas();
                    this.renderInspector();
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
                if (action === 'duplicate') this.duplicateSelected();
                if (action === 'delete') this.deleteSelected();
                if (action === 'save' || action === 'save-export') this.saveLayout(true);
                if (action === 'preview-browser') window.open('http://localhost:9000/overlay/gift-menu/', '_blank');
                if (action === 'new-layout') { this.items = []; this.selectedId = null; this.renderCanvas(); this.renderInspector(); this.renderMyLibrary(); }
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
                    this.selectedId = item.id;
                    this.renderCanvas();
                    this.renderInspector();
                    this.renderMyLibrary();
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
                if (item.locked) {
                    this.selectedId = item.id;
                    this.renderCanvas();
                    this.renderInspector();
                    return;
                }
                const handle = e.target.closest('[data-handle]');
                this.selectedId = item.id;
                if (handle && handle.dataset.handle === 'resize') this.dragState = { mode: 'resize', id: item.id, sx: e.clientX, sy: e.clientY, width: item.width, height: item.height };
                else if (handle && handle.dataset.handle === 'rotate') this.dragState = { mode: 'rotate', id: item.id, sx: e.clientX, startRot: item.rotation };
                else this.dragState = { mode: 'move', id: item.id, sx: e.clientX, sy: e.clientY, x: item.x, y: item.y };
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
                    item.x = Math.round(this.dragState.x + ((e.clientX - this.dragState.sx) / this.zoomLevel));
                    item.y = Math.round(this.dragState.y + ((e.clientY - this.dragState.sy) / this.zoomLevel));
                    this.clampInsideCanvas(item);
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

            window.addEventListener('mouseup', () => { this.dragState = null; });

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

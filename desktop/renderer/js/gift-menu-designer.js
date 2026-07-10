(function () {
    class GiftMenuDesigner {
        constructor() {
            this.apiBase = (window.app && window.app.API_URL) || 'http://localhost:9000';
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
            this.layouts = [];
            this.currentLayoutId = null;
            this.currentLayoutName = '';
            this.zoomLevel = 1;
            this.panX = 0;
            this.panY = 0;
            this.advancedExpanded = false;
            this.isSpacePressed = false;
            this.inspectorTab = 'gift';
            this.history = [];
            this.historyIndex = -1;
            this.isRestoringHistory = false;
            this.snapEnabled = true;
            this.activeGuides = { x: null, y: null };
            this.inspectorChildrenExpanded = true;
            this.inspectorAdvancedExpanded = true;
            this.itemRegistry = window.MenuDesignerItemRegistry || null;
            this.coordinateEngine = window.MenuDesignerCoordinateEngine || null;
            this.sharedRenderEngine = window.MenuDesignerSharedRenderEngine || null;
            this.inspectorEngine = window.MenuDesignerInspectorEngine || null;
            this.auraOptions = [
                { value: 'None', label: 'Không có' },
                { value: 'Glow', label: 'Glow (Tỏa sáng)' },
                { value: 'Bubble', label: 'Bubble (Bong bóng)' },
                { value: 'Magic Ring', label: 'Magic Ring (Vòng phép thuật)' },
                { value: 'Neon Frame', label: 'Neon Frame (Khung Neon)' },
                { value: 'Light Sweep', label: 'Light Sweep (Quét sáng)' },
                { value: 'Fire Aura', label: 'Fire Aura (Lửa)' },
                { value: 'Electric Aura', label: 'Electric Aura (Điện)' }
            ];

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

        get token() {
            return (window.app && window.app.authToken) || localStorage.getItem('token') || localStorage.getItem('effectstore_auth_token') || '';
        }

        get isAdmin() {
            return window.app && window.app.currentUser && (window.app.currentUser.isAdmin || window.app.currentUser.email === 'admin@effectstore.vn');
        }

        get actualPlanKey() {
            if (this.isAdmin) return 'admin';
            return String(window.app?.currentUser?.subscription || 'free').toLowerCase();
        }

        get planKey() {
            return 'admin';
        }

        showUpgrade(feature, message) {
            if (window.app && typeof window.app.showUpgradePopup === 'function') {
                const actualPlan = this.actualPlanKey;
                const targetPlan = actualPlan === 'free' ? 'pro' : (actualPlan === 'pro' ? 'business' : 'studio');
                window.app.showUpgradePopup(feature, message, targetPlan);
            } else if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('warning', message || 'Tính năng này cần nâng cấp gói.');
            }
        }

        handlePlanLimit(data, feature) {
            if (!data || data.upgradeRequired !== true) return false;
            this.showUpgrade(data.feature || feature, data.message);
            return true;
        }

        get goalTrackerLimit() {
            if (this.planKey === 'free') return 1;
            if (this.planKey === 'pro') return 10;
            return Infinity;
        }

        countGoalTrackers(items = this.items) {
            const types = new Set(['goal-bar', 'goal-circle', 'boss-bar', 'mystery-chests', 'goal-list', 'top-contributors', 'podium-contributors', 'combo']);
            return Array.isArray(items) ? items.filter(item => item && types.has(item.type)).length : 0;
        }

        onViewSwitch() {
            if (!this.mount) return;
            const publishBtn = this.mount.querySelector('[data-action="publish-store"]');
            if (publishBtn) {
                publishBtn.style.display = this.isAdmin ? 'inline-block' : 'none';
            }
            this.loadDataIfNeeded();
        }

        init() {
            if (!this.mount) return;
            this.injectSharedRendererCss();
            this.render();
            this.bindEvents();
            if (this.token) {
                this.loadGiftLibrary();
                this.loadGoalAssets();
                this.loadGoalTemplates();
                this.loadLayoutsList().then(() => {
                    this.loadLayout();
                });
                this.connectWebSocket();
            }
            window.addEventListener('resize', () => {
                this.applyZoom();
            });
            this.onViewSwitch();
        }

        loadDataIfNeeded() {
            if (!this.token) return;
            this.loadGiftLibrary();
            this.loadGoalAssets();
            this.loadGoalTemplates();
            this.loadLayoutsList().then(() => {
                if (!this.currentLayoutId && this.layouts.length > 0) {
                    this.loadLayout();
                }
            });
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
                        if (packet.event === 'gift_menu_progress_update' && packet.data?.items) {
                            let updated = false;
                            packet.data.items.forEach(layer => {
                                const existing = this.items.find(x => x.id === layer.id);
                                if (existing) {
                                    if (layer.currentCount !== undefined) {
                                        if (existing._originalCurrentCount === undefined) existing._originalCurrentCount = existing.currentCount || 0;
                                        existing.currentCount = layer.currentCount;
                                    }
                                    if (layer.comboCount !== undefined) {
                                        if (existing._originalComboCount === undefined) existing._originalComboCount = existing.comboCount || 0;
                                        existing.comboCount = layer.comboCount;
                                    }
                                    if (layer.goals !== undefined) {
                                        const originalByGift = new Map((existing.goals || []).map(goal => [String(goal.giftId), Number(goal.current) || 0]));
                                        existing.goals = layer.goals.map(goal => ({
                                            ...goal,
                                            _originalCurrent: goal._originalCurrent !== undefined ? goal._originalCurrent : (originalByGift.get(String(goal.giftId)) || 0)
                                        }));
                                    }
                                    if (layer.contributors !== undefined) {
                                        if (existing._originalContributors === undefined) existing._originalContributors = Array.isArray(existing.contributors) ? existing.contributors.map(c => ({ ...c })) : [];
                                        existing.contributors = layer.contributors;
                                    }
                                    updated = true;
                                }
                            });
                            if (updated) {
                                this.renderCanvas();
                                if (this.inspectorTab !== 'layers') {
                                    this.renderInspector();
                                }
                            }
                        }
                    } catch (_err) { }
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
                    .gmd-left-col {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 12px !important;
                        height: 100% !important;
                        min-height: 0 !important;
                    }
                    .gmd-library-panel {
                        flex: 1 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        min-height: 250px !important;
                        height: 0 !important;
                    }
                    .gmd-gift-list {
                        flex: 1 !important;
                        min-height: 0 !important;
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 8px !important;
                        max-height: none !important;
                        overflow-y: auto !important;
                        padding-right: 4px !important;
                    }
                    .gmd-gift-card {
                        min-height: 80px !important;
                        padding: 6px !important;
                        gap: 5px !important;
                    }
                    .gmd-my-library {
                        flex: 0 0 auto !important;
                    }
                    .gmd-my-library-list {
                        max-height: 180px !important;
                        overflow-y: auto !important;
                    }

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
            link.href = `${this.apiBase}/gift-menu-renderer.css?v=11`;
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
                            <button class="gmd-btn" id="gmd-add-text-btn"><i class="fas fa-font"></i> Thêm chữ</button>
                        </div>
                        <div class="gmd-group">
                            <button class="gmd-btn" data-action="publish-store" style="display:none; background:#10b981; color:#fff; border:none; font-weight:700;"><i class="fas fa-store"></i> Đưa lên Cửa hàng</button>
                            <button class="gmd-btn" data-action="save"><i class="fas fa-save"></i> Lưu</button>
                            <button class="gmd-btn primary" data-action="save-export"><i class="fas fa-download"></i> Lưu & Xuất</button>
                        </div>
                    </div>
                    <div class="gmd-layout">
                        <aside class="gmd-left-col">
                            <section class="gmd-panel gmd-library-panel" style="flex: 1; display: flex; flex-direction: column; min-height: 250px;">
                                <div class="gmd-left-tabs" style="display:flex; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:6px; gap:4px; flex-shrink: 0;">
                                    <button class="gmd-left-tab-btn active" data-tab-name="gifts" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid #3b82f6; color:#fff; cursor:pointer; font-weight:600; font-size:12px;"><i class="fas fa-gift"></i> Quà tặng</button>
                                    <button class="gmd-left-tab-btn" data-tab-name="widgets" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid transparent; color:#888; cursor:pointer; font-weight:600; font-size:12px;"><i class="fas fa-trophy"></i> Mục tiêu</button>
                                    <button class="gmd-left-tab-btn" data-tab-name="assets" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid transparent; color:#888; cursor:pointer; font-weight:600; font-size:12px;"><i class="fas fa-images"></i> Tài nguyên</button>
                                </div>
                                <div id="gmd-gifts-tab-content" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                                    <div class="gmd-library-controls">
                                        <div class="gmd-search-wrap">
                                            <i class="fas fa-search"></i>
                                            <input id="gmd-search" class="gmd-input" placeholder="Tìm quà..." />
                                        </div>
                                        <button class="gmd-add-btn"><i class="fas fa-plus"></i></button>
                                    </div>
                                    <div id="gmd-gift-list" class="gmd-gift-list" style="flex: 1; min-height: 0;"></div>
                                </div>
                                <div id="gmd-widgets-tab-content" style="display:none; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto;">
                                    <div class="gmd-template-grid" id="gmd-widgets-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                                </div>
                                <div id="gmd-assets-tab-content" style="display:none; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; gap: 8px;">
                                    <div class="gmd-asset-upload-row" style="display: flex; gap: 8px; margin-bottom: 8px; flex-shrink: 0;">
                                        <button class="gmd-btn primary" id="gmd-upload-asset-btn" style="flex: 1;"><i class="fas fa-upload"></i> Tải lên</button>
                                        <input type="file" id="gmd-asset-file-input" style="display: none;" accept=".png,.gif,.webm,image/png,image/gif,video/webm">
                                        <button class="gmd-btn" id="gmd-add-text-btn" style="white-space: nowrap;"><i class="fas fa-font"></i> Thêm Chữ</button>
                                    </div>
                                    <div class="gmd-assets-grid" id="gmd-assets-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"></div>
                                </div>
                            </section>
                            <section class="gmd-panel gmd-my-library">
                                <div class="gmd-lib-tabs" style="display:flex; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:6px;">
                                    <button class="gmd-lib-tab-btn active" data-tab-name="my-library" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid #3b82f6; color:#fff; cursor:pointer; font-weight:600; font-size:12px;">Thư viện</button>
                                    <button class="gmd-lib-tab-btn" data-tab-name="templates" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid transparent; color:#888; cursor:pointer; font-weight:600; font-size:12px;">Mẫu đã mua</button>
                                </div>
                                <div id="gmd-my-library-content">
                                    <div class="gmd-my-library-top">
                                        <h4>Thư viện của tôi</h4>
                                        <button class="gmd-btn" data-action="new-layout"><i class="fas fa-plus"></i> Tạo mới</button>
                                    </div>
                                    <div class="gmd-subline">Menu đã lưu</div>
                                    <div class="gmd-my-library-list" id="gmd-my-library-list"></div>
                                </div>
                                <div id="gmd-templates-content" style="display:none;">
                                    <div class="gmd-my-library-top">
                                        <h4>Mẫu đã mua</h4>
                                    </div>
                                    <div class="gmd-subline">Click để dùng</div>
                                    <div class="gmd-templates-list" id="gmd-templates-list" style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;"></div>
                                </div>
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
                                        <button class="gmd-btn" data-action="create-stack-group" title="Gop qua"><i class="fas fa-layer-group"></i> Gop qua</button>
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
            if (this.sidebarRight && (!window.app || window.app.currentView === 'gift-menu-designer')) this.sidebarRight.style.display = 'none';
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
            } catch (_e) { }
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
                const remoteGifts = Array.isArray(data.gifts) ? data.gifts : [];
                let customGifts = [];
                try { customGifts = JSON.parse(localStorage.getItem('es_custom_gifts') || '[]'); } catch (_e) { }
                if (!Array.isArray(customGifts)) customGifts = [];
                customGifts = customGifts.map((gift) => ({ ...gift, isCustom: true }));
                this.gifts = [...customGifts, ...remoteGifts];
                this.filteredGifts = [...this.gifts];
                this.renderGiftLibrary();
            } catch (_e) {
                let customGifts = [];
                try { customGifts = JSON.parse(localStorage.getItem('es_custom_gifts') || '[]'); } catch (_parseError) { }
                if (!Array.isArray(customGifts)) customGifts = [];
                this.gifts = customGifts.map((gift) => ({ ...gift, isCustom: true }));
                this.filteredGifts = [...this.gifts];
                this.renderGiftLibrary();
            }
        }

        async loadTemplatesList() {
            const listEl = this.mount.querySelector('#gmd-templates-list');
            if (!listEl) return;
            listEl.innerHTML = '<div style="text-align:center; padding:12px; font-size:11px; color:#888;"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-templates`, { headers });
                const data = await res.json();
                if (data.success && Array.isArray(data.templates)) {
                    this.serverTemplates = data.templates;
                    const purchasedOnly = data.templates.filter(t => t.isPurchased === true);
                    if (purchasedOnly.length === 0) {
                        listEl.innerHTML = '<div style="text-align:center; padding:12px; font-size:11px; color:#888;">Không có mẫu đã mua nào</div>';
                        return;
                    }
                    listEl.innerHTML = purchasedOnly.map(t => {
                        const price = Math.max(0, Number(t.price) || 0);
                        const isOwned = Boolean(t.isPurchased) || price === 0;
                        const actionText = isOwned ? 'Sử dụng' : `Mua ${price.toLocaleString('vi-VN')}đ`;
                        const bgStyle = isOwned ? 'background:#10b981;' : 'background:#8b5cf6;';
                        return `
                            <div class="gmd-tmpl-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:8px 10px; border-radius:6px; gap:8px;">
                                <div style="display:flex; flex-direction:column; gap:2px;">
                                    <span style="font-size:12px; color:#fff; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:110px;" title="${this.escapeHtml(t.name)}">${this.escapeHtml(t.name)}</span>
                                    <span style="font-size:10px; color:#888;">Tỷ lệ: ${t.aspectRatio || '9:16'}</span>
                                </div>
                                <button class="gmd-btn-use-tmpl" data-template-id="${t._id}" style="font-size:10px; ${bgStyle} border:none; color:#fff; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:700; white-space:nowrap;">
                                    ${actionText}
                                </button>
                            </div>
                        `;
                    }).join('');
                } else {
                    listEl.innerHTML = '<div style="text-align:center; padding:12px; font-size:11px; color:#ef4444;">Lỗi tải mẫu đã mua</div>';
                }
            } catch (err) {
                console.error(err);
                listEl.innerHTML = '<div style="text-align:center; padding:12px; font-size:11px; color:#ef4444;">Lỗi kết nối máy chủ</div>';
            }
        }

        async legacyBuyOrUseTemplateFromSidebar(templateId) {
            if (window.app && typeof window.app.buyOrUseMenuTemplate === 'function') {
                window.app.buyOrUseMenuTemplate(templateId);
            } else {
                alert('Không tìm thấy chức năng thanh toán chính.');
            }
        }

        async buyOrUseTemplateFromSidebar(templateId) {
            const template = (this.serverTemplates || []).find((item) => String(item._id) === String(templateId));
            if (template && Number(template.price || 0) > 0 && !template.isPurchased) {
                if (window.app && typeof window.app.buyMenuTemplate === 'function') {
                    window.app.buyMenuTemplate(templateId);
                } else {
                    alert('Chức năng thanh toán tạm thời không khả dụng.');
                }
                return;
            }
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-templates/${templateId}/use`, { method: 'POST', headers });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    if (this.handlePlanLimit(data, 'templates')) return;
                    throw new Error(data.error || `HTTP ${res.status}`);
                }
                await this.loadLayoutsList();
                await this.loadLayout();
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('success', 'Đã tạo thiết kế từ mẫu thành công.');
                }
            } catch (error) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', `Không thể sử dụng mẫu: ${error.message}`);
                }
            }
        }

        normalizeIcon(icon) {
            if (!icon) return '';
            if (icon.startsWith('data:') || icon.startsWith('http')) return icon;
            return `${this.apiBase}${icon}`;
        }

        isVideoAsset(url) {
            return /^data:video\/webm/i.test(String(url || '')) || /\.webm(?:$|[?#])/i.test(String(url || ''));
        }

        escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[char]));
        }

        renderGiftLibrary() {
            const list = this.mount.querySelector('#gmd-gift-list');
            if (!list) return;
            if (!this.filteredGifts.length) {
                list.innerHTML = '<div class="gmd-inspector-empty">Không có dữ liệu gift.</div>';
                return;
            }
            list.innerHTML = this.filteredGifts.map((gift) => {
                const iconUrl = this.normalizeIcon(gift.icon);
                const media = gift.displayMode === 'text'
                    ? `<span class="gmd-text-gift-icon" style="color:${gift.textColor || '#ffffff'};font-size:${Number(gift.textSize) || 20}px;">${this.escapeHtml(gift.displayText || gift.name || gift.id)}</span>`
                    : (this.isVideoAsset(iconUrl)
                        ? `<video src="${this.escapeHtml(iconUrl)}" autoplay loop muted playsinline></video>`
                        : `<img src="${this.escapeHtml(iconUrl)}" alt="${this.escapeHtml(gift.name)}">`);
                return `
                    <div class="gmd-gift-card" role="button" tabindex="0" draggable="true" data-gift-id="${this.escapeHtml(gift.id)}">
                        ${gift.isCustom ? `<button type="button" class="gmd-custom-gift-delete" data-custom-gift-id="${this.escapeHtml(gift.id)}" title="Xóa quà custom"><i class="fas fa-times"></i></button>` : ''}
                        ${media}
                        <div class="gmd-gift-name">${this.escapeHtml(gift.name || gift.id)}</div>
                    </div>
                `;
            }).join('');
        }

        async deleteCustomGift(giftId) {
            let customGifts = [];
            try { customGifts = JSON.parse(localStorage.getItem('es_custom_gifts') || '[]'); } catch (_e) { }
            if (!Array.isArray(customGifts)) customGifts = [];
            const gift = customGifts.find((item) => String(item.id) === String(giftId));
            if (!gift) return;

            const confirmed = await this.showConfirmModal(`Xóa quà custom "${gift.name || gift.id}" khỏi thư viện? Các layer đã đặt trên canvas sẽ được giữ nguyên.`);
            if (!confirmed) return;

            customGifts = customGifts.filter((item) => String(item.id) !== String(giftId));
            localStorage.setItem('es_custom_gifts', JSON.stringify(customGifts));
            this.gifts = this.gifts.filter((item) => !(item.isCustom && String(item.id) === String(giftId)));
            const search = this.mount.querySelector('#gmd-search');
            const query = String(search?.value || '').trim().toLowerCase();
            this.filteredGifts = this.gifts.filter((item) => !query || String(item.name || '').toLowerCase().includes(query) || String(item.id || '').toLowerCase().includes(query));
            this.renderGiftLibrary();
            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', 'Đã xóa quà custom khỏi thư viện.');
            }
        }

        createItemFromGift(giftId, x = 100, y = 100) {
            const gift = this.gifts.find((g) => g.id === giftId);
            if (!gift) return null;
            return {
                id: `itm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                giftId: gift.id,
                name: gift.name || gift.id,
                iconUrl: this.normalizeIcon(gift.icon),
                iconDisplayMode: gift.displayMode === 'text' ? 'text' : 'media',
                iconText: gift.displayText || gift.name || gift.id,
                iconTextColor: gift.textColor || '#ffffff',
                iconTextSize: Number(gift.textSize) || 20,
                isVideoIcon: Boolean(gift.isVideo) || this.isVideoAsset(gift.icon),
                x, y, width: 84, height: 84, rotation: 0,
                showName: true, textSize: 13, textColor: '#f7cb64', textGap: 4, textAlign: 'center',
                textPosition: 'bottom',
                subtext: '', showTextBg: false, textBgStyle: 'classic', textBgColor: '#000000',
                textBgGradientFrom: '#a855f7', textBgGradientTo: '#22d3ee',
                auraType: 'None', auraColor: '#d7b2ff', auraShape: 'Circle',
                animationType: 'None', animationSpeed: 1, auraSpeed: 1, auraScale: 1, zIndex: this.items.length + 1,
                visible: true, locked: false, lockRatio: true
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

        getItemsBounds(items) {
            if (!items || !items.length) return null;
            const minX = Math.min(...items.map((item) => Number(item.x) || 0));
            const minY = Math.min(...items.map((item) => Number(item.y) || 0));
            const maxX = Math.max(...items.map((item) => (Number(item.x) || 0) + (Number(item.width) || 0)));
            const maxY = Math.max(...items.map((item) => (Number(item.y) || 0) + (Number(item.height) || 0)));
            return {
                x: Math.round(minX),
                y: Math.round(minY),
                width: Math.max(30, Math.round(maxX - minX)),
                height: Math.max(30, Math.round(maxY - minY))
            };
        }

        getStackGroupLayoutChildren(group) {
            const children = Array.isArray(group && group.children) ? group.children : [];
            if (!group || !children.length) return [];
            const direction = group.layoutDirection === 'horizontal' ? 'horizontal' : 'vertical';
            const gap = Math.max(0, Number(group.gap) || 0);
            const groupW = Math.max(10, Number(group.width) || 10);
            const groupH = Math.max(10, Number(group.height) || 10);
            const iconSize = Math.max(10, Number(group.iconSize) || 64);
            const textSize = Math.max(1, Number(group.textSize) || 14);
            const textGap = Math.max(0, Number(group.textGap) || 0);
            const textPosition = group.textPosition || 'bottom';
            const showName = group.showName !== false;
            const padding = 8;
            const contentW = Math.max(1, groupW - padding * 2);
            const contentH = Math.max(1, groupH - padding * 2);
            const ordered = [...children];

            const estimateTextWidth = (child) => {
                if (!showName) return 0;
                const label = String(child.name || child.giftName || '');
                return Math.max(textSize, Math.round(label.length * textSize * 0.62));
            };
            const measureChild = (child) => {
                const labelW = estimateTextWidth(child);
                const labelH = showName ? Math.round(textSize * 1.15) : 0;
                if (!showName) return { width: iconSize, height: iconSize, labelW, labelH };
                if (textPosition === 'left' || textPosition === 'right') {
                    return {
                        width: iconSize + textGap + labelW,
                        height: Math.max(iconSize, labelH),
                        labelW,
                        labelH
                    };
                }
                return {
                    width: Math.max(iconSize, labelW),
                    height: iconSize + textGap + labelH,
                    labelW,
                    labelH
                };
            };
            const measured = ordered.map((child) => ({ child, ...measureChild(child) }));
            const totalW = direction === 'horizontal'
                ? measured.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, measured.length - 1)
                : Math.max(...measured.map((item) => item.width), iconSize);
            const totalH = direction === 'vertical'
                ? measured.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, measured.length - 1)
                : Math.max(...measured.map((item) => item.height), iconSize);
            let cursor = direction === 'vertical'
                ? group.y + padding + Math.max(0, (contentH - totalH) / 2)
                : group.x + padding + Math.max(0, (contentW - totalW) / 2);

            return measured.map((entry) => {
                const child = entry.child;
                const childX = direction === 'vertical'
                    ? group.x + padding + Math.max(0, (contentW - entry.width) / 2)
                    : cursor;
                const childY = direction === 'vertical'
                    ? cursor
                    : group.y + padding + Math.max(0, (contentH - entry.height) / 2);
                let iconX = childX;
                let iconY = childY;
                if (showName) {
                    if (textPosition === 'left') {
                        iconX = childX + entry.labelW + textGap;
                        iconY = childY + Math.max(0, (entry.height - iconSize) / 2);
                    } else if (textPosition === 'right') {
                        iconX = childX;
                        iconY = childY + Math.max(0, (entry.height - iconSize) / 2);
                    } else if (textPosition === 'top') {
                        iconX = childX + Math.max(0, (entry.width - iconSize) / 2);
                        iconY = childY + entry.labelH + textGap;
                    } else {
                        iconX = childX + Math.max(0, (entry.width - iconSize) / 2);
                        iconY = childY;
                    }
                }
                const visual = {
                    ...child,
                    width: Math.round(iconSize),
                    height: Math.round(iconSize),
                    showName: group.showName !== false,
                    textSize: group.textSize,
                    textPosition: group.textPosition || 'bottom',
                    textGap: group.textGap,
                    textColor: group.textColor
                };
                if (direction === 'vertical') {
                    cursor += entry.height + gap;
                } else {
                    cursor += entry.width + gap;
                }
                visual.x = Math.round(iconX);
                visual.y = Math.round(iconY);
                visual.relativeX = visual.x - group.x;
                visual.relativeY = visual.y - group.y;
                return visual;
            });
        }

        createStackGroupFromSelection() {
            const selectedGifts = this.getSelectedItems().filter((item) => !item.locked && item.visible !== false && (!item.type || item.type === 'gift'));
            if (selectedGifts.length < 2) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('warning', 'Chon it nhat 2 gift de tao Stack Group.');
                }
                return;
            }
            const bounds = this.getItemsBounds(selectedGifts);
            if (!bounds) return;
            const maxZ = Math.max(...this.items.map((item) => Number(item.zIndex) || 0), 0);
            const orderedChildren = [...selectedGifts]
                .sort((a, b) => ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0)))
                .map((item) => ({
                    ...item,
                    relativeX: Math.round((Number(item.x) || 0) - bounds.x),
                    relativeY: Math.round((Number(item.y) || 0) - bounds.y)
                }));
            const group = {
                id: `stack_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                type: 'gift-stack-group',
                name: 'Nhom qua',
                iconUrl: '',
                layoutDirection: 'vertical',
                gap: 10,
                borderRadius: 8,
                padding: 8,
                iconSize: Math.max(10, Math.round(selectedGifts.reduce((sum, item) => sum + (Number(item.width) || 64), 0) / selectedGifts.length)),
                textSize: 14,
                textPosition: 'bottom',
                textGap: 4,
                textColor: '#ffffff',
                showName: true,
                showPanel: true,
                showBorder: true,
                panelColor: '#0a0a14',
                panelFillType: 'solid',
                panelGradientFrom: '#3b1f48',
                panelGradientTo: '#0a0a14',
                panelGradientAngle: 135,
                panelEffect: 'none',
                panelEffectSpeed: 3,
                panelGlowIntensity: 0.35,
                borderColor: '#22d3ee',
                borderFillType: 'solid',
                borderGradientFrom: '#22d3ee',
                borderGradientTo: '#a855f7',
                borderGradientAngle: 135,
                borderEffect: 'none',
                borderEffectSpeed: 2,
                borderGlowIntensity: 0.55,
                loopEnabled: false,
                loopDirection: 'vertical',
                loopSpeed: 15,
                children: orderedChildren,
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                rotation: 0,
                zIndex: maxZ + 1,
                visible: true,
                locked: false
            };
            const selectedIds = new Set(selectedGifts.map((item) => item.id));
            this.items = this.items.filter((item) => !selectedIds.has(item.id));
            this.items.push(group);
            this.setSelection([group.id], group.id);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('create-stack-group');
        }

        ungroupStackGroup(groupId = this.selectedId) {
            const group = this.items.find((item) => item.id === groupId && item.type === 'gift-stack-group');
            if (!group || !Array.isArray(group.children) || !group.children.length) return;
            const visualChildren = this.getStackGroupLayoutChildren(group);
            const restored = visualChildren.map((child, idx) => {
                const restoredItem = {
                    ...child,
                    id: child.id || `itm_${Date.now()}_${idx}`,
                    x: child.x,
                    y: child.y,
                    width: child.width,
                    height: child.height,
                    zIndex: (Number(group.zIndex) || this.items.length) + idx,
                    visible: child.visible !== false,
                    locked: Boolean(child.locked)
                };
                delete restoredItem.relativeX;
                delete restoredItem.relativeY;
                return restoredItem;
            });
            this.items = this.items.filter((item) => item.id !== group.id);
            this.items.push(...restored);
            this.normalizeZIndexOrder();
            this.setSelection(restored.map((item) => item.id), restored[0] ? restored[0].id : null);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('ungroup-stack-group');
        }

        migrateLegacyStackGroups() {
            const removeIds = new Set();
            this.items.forEach((group) => {
                if (!group || group.type !== 'gift-stack-group') return;
                if (Array.isArray(group.children) && group.children.length) return;
                const refs = Array.isArray(group.itemRefs) ? group.itemRefs : [];
                if (!refs.length) return;
                const children = refs
                    .map((id) => this.items.find((item) => item.id === id && (!item.type || item.type === 'gift')))
                    .filter(Boolean)
                    .map((item) => {
                        removeIds.add(item.id);
                        return {
                            ...item,
                            relativeX: Math.round((Number(item.x) || 0) - (Number(group.x) || 0)),
                            relativeY: Math.round((Number(item.y) || 0) - (Number(group.y) || 0))
                        };
                    });
                if (children.length) {
                    group.children = children;
                }
            });
            if (removeIds.size) {
                this.items = this.items.filter((item) => !removeIds.has(item.id));
            }
        }

        getAuraClass(type) {
            const map = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep', 'Fire Aura': 'aura-fire', 'Electric Aura': 'aura-electric' };
            return map[type] || '';
        }

        getMotionClass(type) {
            const map = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
            return map[type] || '';
        }

        renderCanvas(sync = false) {
            if (sync) {
                this.renderCanvasActual();
                return;
            }
            if (this._renderCanvasPending) return;
            this._renderCanvasPending = true;
            requestAnimationFrame(() => {
                this._renderCanvasPending = false;
                this.renderCanvasActual();
            });
        }

        renderCanvasActual() {
            const canvas = this.mount.querySelector('#gmd-canvas');
            const stage = this.mount.querySelector('#gmd-stage');
            if (!canvas || !stage) return;

            const getTranslucentBg = (colorHex, defaultHex = '#0a0a14') => {
                const hex = colorHex || defaultHex;
                return (hex.startsWith('#') && hex.length === 7) ? hex + '40' : hex;
            };

            const activeIds = new Set();

            this.items.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach((item) => {
                if (item.visible === false) return;
                const domId = `gmd-item-${item.id}`;
                activeIds.add(domId);

                const selected = this.isSelected(item.id);

                let el = document.getElementById(domId);
                if (el && !stage.contains(el)) el = null;
                if (!el) {
                    el = document.createElement('div');
                    el.id = domId;
                    el.dataset.itemId = item.id;
                    el.innerHTML = `<div class="gmd-visual-container" style="width:100%; height:100%; position:relative; overflow:visible;"></div><div class="gmd-selection-overlay" style="position:absolute; inset:0; pointer-events:none; z-index:99999;"></div>`;
                    stage.appendChild(el);
                }

                // Update outer wrapper coordinates and styles instantly (no layout flickering)
                el.className = `gmd-item ${selected ? 'selected' : ''} ${item.type === 'gift-stack-group' ? 'gmd-stack-group' : ''}`;
                el.style.left = `${item.x}px`;
                el.style.top = `${item.y}px`;
                el.style.width = `${item.width}px`;
                el.style.height = `${item.height}px`;
                el.style.transform = `rotate(${item.rotation || 0}deg)`;
                el.style.zIndex = String(item.zIndex || 1);

                if (item.type === 'gift-stack-group') {
                    el.style.border = '1px solid transparent';
                    el.style.outline = selected ? '1px dashed rgba(34, 211, 238, 0.75)' : 'none';
                    el.style.outlineOffset = '3px';
                    el.style.background = 'transparent';
                    el.style.boxSizing = 'border-box';
                    el.style.overflow = 'visible';
                    el.style.pointerEvents = 'auto';
                } else {
                    el.style.border = '';
                    el.style.outline = '';
                    el.style.outlineOffset = '';
                    el.style.background = '';
                    el.style.boxSizing = '';
                    el.style.overflow = '';
                    el.style.pointerEvents = '';
                }

                // Decouple content changes from selection changes using signatures
                const visualContainer = el.querySelector('.gmd-visual-container');
                const selectionOverlay = el.querySelector('.gmd-selection-overlay');

                // Content Signature determines when to regenerate the widget inner DOM
                const contentSignature = JSON.stringify({
                    id: item.id,
                    width: item.width,
                    height: item.height,
                    item: item
                });

                if (visualContainer && visualContainer.dataset.contentSignature !== contentSignature) {
                    visualContainer.dataset.contentSignature = contentSignature;

                    if (item.type === 'gift-stack-group') {
                        const groupHTML = this.sharedRenderEngine && typeof this.sharedRenderEngine.renderGiftStackGroup === 'function'
                            ? this.sharedRenderEngine.renderGiftStackGroup(item, { mode: 'preview', scale: 1, apiBase: this.apiBase, escapeText: true })
                            : '';
                        visualContainer.innerHTML = groupHTML;
                    } else if (item.type && item.type !== 'gift') {
                        let refW = item.lockedW || item.w || 900;
                        let refH = item.lockedH || item.h || 160;
                        if (!item.lockRatio) {
                            if (item.type === 'boss-bar') { refW = 840; refH = 180; }
                            else if (item.type === 'combo') { refW = 800; refH = 220; }
                            else if (item.type === 'mystery-chests') { refW = 900; refH = 240; }
                            else if (item.type === 'top-contributors' || item.type === 'podium-contributors') { refW = 900; refH = 560; }
                            else if (item.type === 'goal-list') { refW = 900; refH = item.h || 700; }
                            else if (item.type === 'goal-bar') { refW = 900; refH = 160; }
                            else if (item.type === 'goal-circle') { refW = 280; refH = 320; }
                        }

                        const scaleX = item.width / refW;
                        const scaleY = item.height / refH;

                        const widgetHTML = this.sharedRenderEngine && typeof this.sharedRenderEngine.renderByType === 'function'
                            ? this.sharedRenderEngine.renderByType(item, { mode: 'preview', scale: 1, apiBase: this.apiBase, escapeText: true, gifts: this.gifts, includeDesignerFallback: true })
                            : '';

                        visualContainer.innerHTML = `
                            <div class="gmd-visual" style="width:100%; height:100%; position: relative; overflow: visible;">
                                <div class="gmd-visual-scaled-wrapper" style="width: ${refW}px; height: ${refH}px; transform: scale(${scaleX}, ${scaleY}); transform-origin: top left; position: absolute; top: 0; left: 0; pointer-events: none;">
                                    ${widgetHTML}
                                </div>
                            </div>
                        `;
                    } else {
                        const auraShapeVars = this.getAuraShapeVars(item.auraShape);
                        const lightSweepOverlay = '';
                        const labelBgStyle = this.getGiftLabelBackgroundStyle(item);
                        visualContainer.innerHTML = `
                            <div class="gmd-visual ${this.getMotionClass(item.animationType)} ${this.getAuraClass(item.auraType)}" style="--aura-color:${item.auraColor};${auraShapeVars};--anim-speed:${item.animationSpeed}s;--aura-speed:${item.auraSpeed || 1}s;--aura-scale:${item.auraScale || 1};--icon-url:url('${item.iconUrl}');">
                                <span class="gmd-aura ${this.getAuraClass(item.auraType)} gmd-aura-back"></span>
                                <span class="gmd-icon-wrap" style="--icon-url:url('${item.iconUrl}')">
                                    ${item.iconDisplayMode === 'text'
                                ? `<span class="gmd-text-gift-icon" style="color:${item.iconTextColor || '#ffffff'};font-size:${Number(item.iconTextSize) || 20}px;">${this.escapeHtml(item.iconText || item.name)}</span>`
                                : (item.isVideoIcon || this.isVideoAsset(item.iconUrl)
                                    ? `<video src="${this.escapeHtml(item.iconUrl)}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>`
                                    : `<img src="${this.escapeHtml(item.iconUrl)}" alt="${this.escapeHtml(item.name)}">`)}
                                    ${lightSweepOverlay}
                                </span>
                                <span class="gmd-aura ${this.getAuraClass(item.auraType)} gmd-aura-front"></span>
                            </div>
                            ${item.showName ? `<div class="gmd-item-label gmd-gift-label-text-wrap pos-${item.textPosition || 'bottom'}" style="font-size:${item.textSize}px;color:${item.textColor};--label-gap:${item.textGap}px;text-align:${item.textAlign || 'center'};${labelBgStyle}"><div style="font-weight:800;line-height:1.15;white-space:nowrap;">${this.escapeHtml(item.name)}</div>${item.subtext ? `<div style="font-size:${Math.max(5, Math.round((Number(item.textSize) || 13) * .78))}px;opacity:.8;font-weight:600;line-height:1.15;white-space:nowrap;margin-top:2px;">${this.escapeHtml(item.subtext)}</div>` : ''}</div>` : ''}
                        `;
                    }
                }

                // Selection overlay updates independently (no visual container redraw, no animation reset!)
                const selectionSignature = JSON.stringify({
                    selected: selected,
                    name: item.name || item.giftName || '',
                    locked: Boolean(item.locked),
                    isPrimary: this.selectedId === item.id,
                    type: item.type
                });

                if (selectionOverlay && selectionOverlay.dataset.selectionSignature !== selectionSignature) {
                    selectionOverlay.dataset.selectionSignature = selectionSignature;
                    if (selected) {
                        const label = String(item.name || (item.type === 'gift-stack-group' ? 'Nhóm quà' : 'Phần quà'));
                        const showRotate = !item.locked && this.selectedId === item.id && item.type !== 'gift-stack-group' && item.type !== 'media-asset';
                        const showResize = !item.locked && this.selectedId === item.id;
                        selectionOverlay.innerHTML = `
                            <div style="position:absolute; left:8px; top:-24px; max-width:calc(100% - 16px); padding:3px 8px; border-radius:6px; background:rgba(8, 16, 34, 0.96); border:1px solid rgba(34,211,238,.45); color:#bae6fd; font-size:10px; font-weight:800; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:0 4px 12px rgba(0,0,0,.32);">${this.escapeHtml(label)}</div>
                            ${showRotate ? '<span class="gmd-handle gmd-rotate-handle" data-handle="rotate" style="pointer-events:auto;">⟳</span>' : ''}
                            ${showResize ? '<span class="gmd-handle gmd-resize-handle" data-handle="resize" style="pointer-events:auto;"></span>' : ''}
                        `;
                    } else {
                        selectionOverlay.innerHTML = '';
                    }
                }
            });

            // Remove inactive nodes
            Array.from(stage.querySelectorAll('.gmd-item')).forEach((n) => {
                if (!activeIds.has(n.id)) n.remove();
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
                inspector.innerHTML = '<div class="gmd-inspector-empty"><i class="fas fa-mouse-pointer"></i><p>Chọn một quà tặng hoặc widget<br>trên canvas để tùy chỉnh</p><small>(Giữ Shift để chọn nhiều)</small></div>';
                return;
            }
            if (selected.type && selected.type !== 'gift') {
                this.renderGoalBoardInspector();
                return;
            }
            const iconPreview = selected.iconUrl || '';
            const isMultiSelect = this.selectedIds.length > 1;
            let selectedHeaderHTML = '';
            if (isMultiSelect) {
                selectedHeaderHTML = `
                    <div class="gmd-selected-card multi" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px; color: #a78bfa;">
                            <i class="fas fa-layer-group"></i>
                            <span>Đang chọn <strong>${this.selectedIds.length}</strong> quà tặng</span>
                        </div>
                        <button class="gmd-delete-btn" data-action="delete" title="Xóa tất cả" style="background: rgba(239, 68, 68, 0.2); border: none; color: #ef4444; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: background 0.2s;"><i class="fas fa-trash"></i></button>
                    </div>
                `;
            } else {
                selectedHeaderHTML = `
                    <div class="gmd-selected-card">
                        ${selected.iconDisplayMode === 'text'
                        ? `<span class="gmd-text-gift-icon" style="width:42px;height:42px;color:${selected.iconTextColor || '#ffffff'};font-size:${Number(selected.iconTextSize) || 20}px;">${this.escapeHtml(selected.iconText || selected.name)}</span>`
                        : (selected.isVideoIcon || this.isVideoAsset(iconPreview)
                            ? `<video src="${this.escapeHtml(iconPreview)}" autoplay loop muted playsinline style="width:42px;height:42px;object-fit:contain;"></video>`
                            : `<img src="${this.escapeHtml(iconPreview)}" alt="${this.escapeHtml(selected.name)}">`)}
                        <input class="gmd-title-input" data-key="name" value="${this.escapeHtml(selected.name)}">
                        <button class="gmd-delete-btn" data-action="delete"><i class="fas fa-trash"></i></button>
                    </div>
                `;
            }
            inspector.innerHTML = `
                ${selectedHeaderHTML}

                <!-- ✨ TÙY CHỈNH CƠ BẢN -->
                <div class="gmd-section-group basic-features">
                    <div style="border-bottom: 2px solid rgba(255,255,255,0.05); padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
                        <span style="font-weight: 800; font-size: 11px; color: var(--accent); letter-spacing: 0.5px; text-transform: uppercase;">✨ Tùy chỉnh cơ bản</span>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>
                        <div class="gmd-field"><label>Vị trí</label></div>
                        <div class="gmd-row">
                            <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="x" value="${selected.x}"><span>px</span></div>
                            <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="y" value="${selected.y}"><span>px</span></div>
                        </div>
                        <div class="gmd-field"><label>Rộng (W)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="10" data-key="width" value="${selected.width}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="10" max="600" data-key="width" value="${selected.width}">
                        <div class="gmd-field"><label>Cao (H)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="10" data-key="height" value="${selected.height}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="10" max="600" data-key="height" value="${selected.height}">
                        <div class="gmd-field gmd-toggle-row" style="margin-top:8px;">
                            <label>Khóa tỷ lệ</label>
                            <label class="gmd-switch"><input type="checkbox" data-key="lockRatio" ${selected.lockRatio !== false ? 'checked' : ''}><span></span></label>
                        </div>
                    </div>

                    ${selected.iconDisplayMode === 'text' ? `
                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> CHỮ THAY ICON</h4>
                        <div class="gmd-field"><label>Nội dung</label><input class="gmd-input" maxlength="12" data-key="iconText" value="${this.escapeHtml(selected.iconText || selected.name)}"></div>
                        <div class="gmd-field"><label>Màu chữ</label><input class="gmd-color" type="color" data-key="iconTextColor" value="${selected.iconTextColor || '#ffffff'}"></div>
                        <div class="gmd-field"><label>Cỡ chữ</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="10" max="40" data-key="iconTextSize" value="${Number(selected.iconTextSize) || 20}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="10" max="40" data-key="iconTextSize" value="${Number(selected.iconTextSize) || 20}">
                    </div>
                    ` : ''}

                    <template>
                        <h4><i class="fas fa-signature"></i> CÀI ĐẶT CHỮ</h4>
                        <div class="gmd-field"><label>Tên chính</label><input class="gmd-input" data-key="name" value="${this.escapeHtml(selected.name || '')}"></div>
                        <div class="gmd-field"><label>Tên phụ / Ghi chú</label><input class="gmd-input" data-key="subtext" value="${this.escapeHtml(selected.subtext || '')}"></div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị tên</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-key="showName" ${selected.showName ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field"><label>Vị trí chữ</label>${this.renderSelect('textPosition', selected.textPosition || 'bottom', [
                { value: 'bottom', label: 'Dưới' },
                { value: 'top', label: 'Trên' },
                { value: 'left', label: 'Trái' },
                { value: 'right', label: 'Phải' }
            ])}</div>
                        <div class="gmd-field"><label>Cỡ chữ</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="6" max="48" data-key="textSize" value="${selected.textSize}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="6" max="48" data-key="textSize" value="${selected.textSize}">
                        <div class="gmd-field"><label>Căn lề chữ</label>${this.renderSelect('textAlign', selected.textAlign || 'center', [
                { value: 'left', label: 'Căn trái' },
                { value: 'center', label: 'Căn giữa' },
                { value: 'right', label: 'Căn phải' }
            ])}</div>
                        <div class="gmd-field"><label>Khoảng cách (Gap)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textGap" value="${selected.textGap}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="0" max="30" data-key="textGap" value="${selected.textGap}">
                        <div class="gmd-field"><label>Màu chữ</label><input class="gmd-color" type="color" data-key="textColor" value="${selected.textColor}"></div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Bật nền chữ</label>
                            <label class="gmd-switch"><input type="checkbox" data-key="showTextBg" ${selected.showTextBg ? 'checked' : ''}><span></span></label>
                        </div>
                        ${selected.showTextBg ? `
                        <div class="gmd-field"><label>Kiểu nền chữ</label>${this.renderSelect('textBgStyle', selected.textBgStyle || 'classic', [
                { value: 'classic', label: 'Cổ điển (Classic)' },
                { value: 'glass', label: 'Gương kính (Glass)' },
                { value: 'neon', label: 'Khung cổ thuật (Mystic)' },
                { value: 'holo', label: 'Hologram' },
                { value: 'light-sweep', label: 'Quét sáng' }
            ])}</div>
                        ${(selected.textBgStyle || 'classic') === 'classic' ? `<div class="gmd-field"><label>Màu nền chữ</label><input class="gmd-color" type="color" data-key="textBgColor" value="${selected.textBgColor && selected.textBgColor.startsWith('#') ? selected.textBgColor.slice(0, 7) : '#000000'}"></div>` : ''}
                        ` : ''}
                    </template>
                </div>

                <!-- 👑 TÍNH NĂNG NÂNG CAO -->
                <div class="gmd-section-group advanced-features" style="background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 12px; margin-top: 16px; box-shadow: inset 0 2px 6px rgba(0,0,0,0.15);">
                    <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" onclick="window.giftMenuDesigner.toggleAdvancedFeatures()">
                        <span style="font-weight: 800; font-size: 11px; color: #a78bfa; letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-crown" style="color: #fbbf24;"></i> Tính năng nâng cao
                        </span>
                        <i class="fas ${this.advancedExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                    </div>

                    <div id="gmd-advanced-content" style="display: ${this.advancedExpanded ? 'block' : 'none'}; margin-top: 12px;">
                        <div class="gmd-section">
                            <h4><i class="fas fa-signature"></i> C&#192;I &#272;&#7862;T CH&#7918;</h4>
                            <div class="gmd-field"><label>T&#234;n ch&#237;nh</label><input class="gmd-input" data-key="name" value="${this.escapeHtml(selected.name || '')}"></div>
                            <div class="gmd-field"><label>T&#234;n ph&#7909; / Ghi ch&#250;</label><input class="gmd-input" data-key="subtext" value="${this.escapeHtml(selected.subtext || '')}"></div>
                            <div class="gmd-field gmd-toggle-row">
                                <label>Hi&#7875;n th&#7883; t&#234;n</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-key="showName" ${selected.showName ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>
                            <div class="gmd-field"><label>V&#7883; tr&#237; ch&#7919;</label>${this.renderSelect('textPosition', selected.textPosition || 'bottom', [
                { value: 'bottom', label: 'Dưới' },
                { value: 'top', label: 'Trên' },
                { value: 'left', label: 'Trái' },
                { value: 'right', label: 'Phải' }
            ])}</div>
                            <div class="gmd-field"><label>C&#7905; ch&#7919;</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="6" max="48" data-key="textSize" value="${selected.textSize}"><span>px</span></div></div>
                            <input class="gmd-range" type="range" min="6" max="48" data-key="textSize" value="${selected.textSize}">
                            <div class="gmd-field"><label>C&#259;n l&#7873; ch&#7919;</label>${this.renderSelect('textAlign', selected.textAlign || 'center', [
                { value: 'left', label: 'Căn trái' },
                { value: 'center', label: 'Căn giữa' },
                { value: 'right', label: 'Căn phải' }
            ])}</div>
                            <div class="gmd-field"><label>Kho&#7843;ng c&#225;ch (Gap)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textGap" value="${selected.textGap}"><span>px</span></div></div>
                            <input class="gmd-range" type="range" min="0" max="30" data-key="textGap" value="${selected.textGap}">
                            <div class="gmd-field"><label>M&#224;u ch&#7919;</label><input class="gmd-color" type="color" data-key="textColor" value="${selected.textColor}"></div>
                            <div class="gmd-field gmd-toggle-row">
                                <label>B&#7853;t n&#7873;n ch&#7919;</label>
                                <label class="gmd-switch"><input type="checkbox" data-key="showTextBg" ${selected.showTextBg ? 'checked' : ''}><span></span></label>
                            </div>
                            ${selected.showTextBg ? `
                            <div class="gmd-field"><label>Ki&#7875;u n&#7873;n ch&#7919;</label>${this.renderSelect('textBgStyle', selected.textBgStyle || 'classic', [
                { value: 'classic', label: 'Cổ điển (Classic)' },
                { value: 'glass', label: 'Gương kính (Glass)' },
                { value: 'neon', label: 'Khung cổ thuật (Mystic)' },
                { value: 'holo', label: 'Hologram' },
                { value: 'light-sweep', label: 'Quét sáng' }
            ])}</div>
                            ${(selected.textBgStyle || 'classic') === 'classic' ? `<div class="gmd-field"><label>M&#224;u n&#7873;n ch&#7919;</label><input class="gmd-color" type="color" data-key="textBgColor" value="${selected.textBgColor && selected.textBgColor.startsWith('#') ? selected.textBgColor.slice(0, 7) : '#000000'}"></div>` : ''}
                            ${selected.textBgStyle === 'neon' ? `
                            <div class="gmd-row">
                                <div class="gmd-field"><label>M&#224;u gradient 1</label><input class="gmd-color" type="color" data-key="textBgGradientFrom" value="${selected.textBgGradientFrom || '#a855f7'}"></div>
                                <div class="gmd-field"><label>M&#224;u gradient 2</label><input class="gmd-color" type="color" data-key="textBgGradientTo" value="${selected.textBgGradientTo || '#22d3ee'}"></div>
                            </div>` : ''}
                            ` : ''}
                        </div>
                        <div class="gmd-section" style="margin-bottom: 0; padding-bottom: 0; border: none; background: none;">
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
                    </div>
                </div>
            `;
        }

        toggleAdvancedFeatures() {
            this.advancedExpanded = !this.advancedExpanded;
            this.renderInspector();
        }

        toggleInspectorChildren() {
            this.inspectorChildrenExpanded = !this.inspectorChildrenExpanded;
            this.renderInspector();
        }

        toggleInspectorAdvanced() {
            this.inspectorAdvancedExpanded = !this.inspectorAdvancedExpanded;
            this.renderInspector();
        }

        toggleInspectorSize() {
            this.inspectorSizeExpanded = this.inspectorSizeExpanded === undefined ? false : !this.inspectorSizeExpanded;
            this.renderInspector();
        }

        toggleInspectorTeam(idx) {
            if (!this.expandedTeams) {
                this.expandedTeams = {};
            }
            this.expandedTeams[idx] = !this.expandedTeams[idx];
            this.renderInspector();
        }

        changePkTeamCount(count) {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected) return;
            selected.teamCount = count;

            if (!Array.isArray(selected.pkPlayers)) {
                selected.pkPlayers = [];
            }

            const defaultColors = ['#ef4444', '#3b82f6', '#fbbf24', '#22c55e'];
            const defaultGifts = [
                { id: 'rose', name: 'Rose' },
                { id: 'coffee', name: 'Coffee' },
                { id: 'donut', name: 'Donut' },
                { id: 'heart', name: 'Heart' }
            ];

            while (selected.pkPlayers.length < count) {
                const idx = selected.pkPlayers.length;
                selected.pkPlayers.push({
                    name: `ĐỘI ${idx + 1}`,
                    score: idx === 0 ? 120 : (idx === 1 ? 80 : 50),
                    color: defaultColors[idx] || '#ff007f',
                    giftId: defaultGifts[idx % defaultGifts.length].id,
                    giftName: defaultGifts[idx % defaultGifts.length].name,
                    iconMode: 'preset',
                    iconPreset: idx === 0 ? 'lion' : (idx === 1 ? 'wolf' : (idx === 2 ? 'crown' : 'star'))
                });
            }

            if (selected.pkPlayers.length > count) {
                selected.pkPlayers = selected.pkPlayers.slice(0, count);
            }

            this.renderCanvas();
            this.renderInspector();
            this.syncLayoutState();
        }

        updateGoalBoardPlayerItem(index, key, value, pushHist = true) {
            const item = this.items.find((x) => x.id === this.selectedId);
            if (!item || !Array.isArray(item.pkPlayers)) return;
            const player = item.pkPlayers[index];
            if (!player) return;

            const freeStyleKeys = ['color'];
            if (this.planKey === 'free' && freeStyleKeys.includes(key)) {
                this.showUpgrade('menuAdvanced', 'Nâng cấp Basic để đổi màu đội PK.');
                this.renderInspector();
                return;
            }

            player[key] = (key === 'score' || key === 'pointMultiplier' || key === 'animationSpeed' || key === 'auraSpeed' || key === 'auraScale' || key === 'fontSize' || key === 'scoreFontSize' || key === 'headerOffsetX' || key === 'headerOffsetY') ? Number(value) : value;
            this.renderCanvas();

            if (pushHist) {
                this.pushHistory('update-goal-player-item');
                this.renderInspector();
            } else if (key === 'auraType' || key === 'animationType' || key === 'auraShape') {
                this.renderInspector();
            }
            this.syncLayoutState();
        }

        syncLayoutState() {
            this.saveLayout(false, false);
        }

        triggerPlayerAvatarUpload(playerIndex) {
            if (this.planKey === 'free') {
                this.showUpgrade('menuAssets', 'Nâng cấp Basic để tải ảnh/video riêng vào menu.');
                return;
            }
            this.pendingUploadPlayerIndex = playerIndex;
            const fileInput = this.mount.querySelector('#gmd-asset-file-input');
            if (fileInput) {
                fileInput.value = '';
                fileInput.click();
            }
        }

        async optimizeImageUpload(file, maxDimension = 256) {
            if (!file) return file;
            const ext = `.${String(file.name || '').split('.').pop().toLowerCase()}`;
            if (ext === '.gif') return file; // Preserve animated gif
            try {
                const bitmap = await createImageBitmap(file);
                const largest = Math.max(bitmap.width, bitmap.height);
                const scale = Math.min(1, maxDimension / largest);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                const ctx = canvas.getContext('2d', { alpha: true });
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                // Preserve transparency for PNG/WebP, otherwise export as JPEG
                const exportType = (ext === '.png' || ext === '.webp') ? 'image/png' : 'image/jpeg';
                const quality = exportType === 'image/jpeg' ? 0.82 : undefined;
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, exportType, quality));
                if (!blob) return file;
                const newName = file.name.replace(/\.[^/.]+$/, "") + (exportType === 'image/png' ? '.png' : '.jpg');
                return new File([blob], newName, { type: exportType, lastModified: Date.now() });
            } catch (_e) {
                return file;
            }
        }

        async uploadPlayerAvatarAsset(file) {
            if (!file) return null;
            const ext = `.${String(file.name || '').split('.').pop().toLowerCase()}`;
            if (!['.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm', '.mp4'].includes(ext)) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Hỗ trợ các định dạng PNG, JPG, GIF, WebP, WebM và MP4.');
                }
                return null;
            }
            const isVideo = ['.webm', '.mp4'].includes(ext);
            const uploadFile = isVideo ? file : await this.optimizeImageUpload(file, 256);
            const formData = new FormData();
            formData.append('assetFile', uploadFile);

            try {
                const headers = {};
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/upload-asset`, {
                    method: 'POST',
                    headers,
                    body: formData
                });
                const data = await res.json();
                if (data.success && data.asset) {
                    return data.asset.url;
                }
            } catch (err) {
                console.error(err);
            }
            return null;
        }

        triggerFrameUpload(rank) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png, image/jpeg, image/gif, image/webp, video/webm';
            input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;
                
                try {
                    const uploadedUrl = await this.uploadPlayerAvatarAsset(file);
                    if (uploadedUrl) {
                        const selected = this.items.find((x) => x.id === this.selectedId);
                        if (selected) {
                            selected[`top${rank}FrameUrl`] = uploadedUrl;
                            this.renderCanvas();
                            this.renderInspector();
                            this.syncLayoutState();
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            };
            input.click();
        }

        trySelectivePkScoreUpdate(item) {
            const domId = `gmd-item-${item.id}`;
            const el = document.getElementById(domId);
            if (!el) return false;

            const players = Array.isArray(item.pkPlayers) ? item.pkPlayers : [];
            if (players.length === 0) return false;

            // 0. Detect if leader has changed
            let prevMaxScore = 0;
            let prevLeaderIdx = -1;
            let prevLeaderCount = 0;
            let prevHasScores = false;
            
            players.forEach((p, idx) => {
                const scoreEl = el.querySelector(`.gmd-pk-score-text[data-player-index="${idx}"]`);
                if (scoreEl) {
                    const s = parseInt(scoreEl.textContent.replace(/\./g, '')) || 0;
                    if (s > 0) prevHasScores = true;
                    if (s > prevMaxScore) {
                        prevMaxScore = s;
                        prevLeaderIdx = idx;
                        prevLeaderCount = 1;
                    } else if (s === prevMaxScore && s > 0) {
                        prevLeaderCount++;
                    }
                }
            });
            const prevLeader = (prevHasScores && prevLeaderCount === 1) ? prevLeaderIdx : -1;

            let maxScore = 0;
            let leaderIdx = -1;
            let leaderCount = 0;
            let hasScores = false;
            players.forEach((p, idx) => {
                const s = Number(p.score || 0);
                if (s > 0) hasScores = true;
                if (s > maxScore) {
                    maxScore = s;
                    leaderIdx = idx;
                    leaderCount = 1;
                } else if (s === maxScore && s > 0) {
                    leaderCount++;
                }
            });
            const currentLeader = (hasScores && leaderCount === 1) ? leaderIdx : -1;

            if (prevLeader !== currentLeader) {
                // Leader shifted, need full redraw to update crowns, scales, backgrounds correctly
                return false;
            }

            let total = 0;
            players.forEach(p => {
                total += Number(p.score || 0);
            });

            // 1. Update score labels
            players.forEach((p, idx) => {
                const scoreElms = el.querySelectorAll(`.gmd-pk-score-text[data-player-index="${idx}"]`);
                const formattedScore = Number(p.score || 0).toLocaleString('vi-VN');
                scoreElms.forEach(scoreEl => {
                    if (scoreEl.textContent !== formattedScore) {
                        scoreEl.textContent = formattedScore;
                    }
                });
            });

            // 2. Update segments widths and percentage text
            let accumPct = 0;
            players.forEach((p, idx) => {
                const segmentEl = el.querySelector(`.gmd-pk-segment[data-player-index="${idx}"]`);
                if (segmentEl) {
                    const rawPct = total > 0 ? (Number(p.score || 0) / total) * 100 : (100 / players.length);
                    let widthVal = Math.round(rawPct);
                    if (idx === players.length - 1) {
                        widthVal = 100 - accumPct;
                    } else {
                        accumPct += widthVal;
                    }
                    widthVal = Math.max(5, widthVal);
                    segmentEl.style.width = `${widthVal}%`;

                    const pctTextEl = el.querySelector(`.gmd-pk-segment-percent-text[data-player-index="${idx}"]`);
                    if (pctTextEl) {
                        const formattedPct = `${rawPct.toFixed(1)}%`;
                        if (pctTextEl.textContent !== formattedPct) {
                            pctTextEl.textContent = formattedPct;
                        }
                    }
                }
            });

            // 3. Update active signature
            const visualContainer = el.querySelector('.gmd-visual-container');
            if (visualContainer) {
                const contentSignature = JSON.stringify({
                    id: item.id,
                    width: item.width,
                    height: item.height,
                    item: item
                });
                visualContainer.dataset.contentSignature = contentSignature;
            }

            return true;
        }

        testPkPlayerScore(playerIdx, addPoints) {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected || !Array.isArray(selected.pkPlayers)) return;
            const player = selected.pkPlayers[playerIdx];
            if (!player) return;

            player.score = (Number(player.score) || 0) + Number(addPoints);

            if (this.trySelectivePkScoreUpdate(selected)) {
                this.renderInspector();
                this.syncLayoutState();
            } else {
                this.renderCanvas();
                this.renderInspector();
                this.syncLayoutState();
            }
        }

        resetPkScores() {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected || !Array.isArray(selected.pkPlayers)) return;
            selected.pkPlayers.forEach(p => {
                p.score = 0;
            });

            if (this.trySelectivePkScoreUpdate(selected)) {
                this.renderInspector();
                this.syncLayoutState();
            } else {
                this.renderCanvas();
                this.renderInspector();
                this.syncLayoutState();
            }
        }

        toggleTimerRunning(start) {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected) return;

            if (start) {
                // Determine current remaining seconds
                let durationSecs = selected.timerDurationSeconds;
                if (!durationSecs) {
                    durationSecs = this.parseTimeToSeconds(selected.timerDuration || '00:20:00');
                    selected.timerDurationSeconds = durationSecs;
                }
                const remaining = selected.timerRemainingSeconds !== undefined ? selected.timerRemainingSeconds : durationSecs;

                selected.timerRunning = true;
                const elapsed = durationSecs - remaining;
                selected.timerStartedAt = Date.now() - (elapsed * 1000);
            } else {
                if (selected.timerRunning && selected.timerStartedAt) {
                    const elapsed = Math.floor((Date.now() - selected.timerStartedAt) / 1000);
                    const duration = selected.timerDurationSeconds || 1200;
                    selected.timerRemainingSeconds = Math.max(0, duration - elapsed);
                }
                selected.timerRunning = false;
                selected.timerStartedAt = 0;
            }

            this.renderCanvas();
            this.renderInspector();
            this.syncLayoutState();
        }

        resetTimer() {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (!selected) return;

            const durationSecs = this.parseTimeToSeconds(selected.timerDuration || '00:20:00');
            selected.timerDurationSeconds = durationSecs;
            selected.timerRemainingSeconds = durationSecs;
            selected.timerRunning = false;
            selected.timerStartedAt = 0;

            this.renderCanvas();
            this.renderInspector();
            this.syncLayoutState();
        }

        parseTimeToSeconds(timeStr) {
            if (!timeStr) return 1200;
            const parts = String(timeStr).split(':').map(Number);
            if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            }
            return Number(timeStr) || 1200;
        }


        updateGoalBoardChildItem(index, key, value, pushHist = true) {
            const item = this.items.find((x) => x.id === this.selectedId);
            if (!item || !Array.isArray(item.children)) return;
            const child = item.children[index];
            if (!child) return;

            if (this.planKey === 'free' && ['auraType', 'animationType', 'showTextBg', 'textBgStyle', 'textBgColor', 'textBgGradientFrom', 'textBgGradientTo', 'textColor'].includes(key)) {
                this.showUpgrade('menuAdvanced', 'Nâng cấp Basic để đổi màu và dùng hiệu ứng động.');
                return;
            }
            if (this.planKey === 'pro' && ((key === 'animationType' && !['None', 'Pulse', 'Bounce', 'Float'].includes(String(value))) || (key === 'auraType' && !['None', 'Glow'].includes(String(value))))) {
                this.showUpgrade('menuAdvanced', 'Hiệu ứng chuyển động cao cấp dành cho gói Pro.');
                return;
            }

            if (key === 'showTextBg') {
                child[key] = Boolean(value);
            } else {
                child[key] = value;
            }
            this.renderCanvas();

            if (pushHist) {
                this.pushHistory('update-goal-child-item');
                this.renderInspector();
            } else if (key === 'auraType' || key === 'animationType' || key === 'showTextBg' || key === 'textBgStyle') {
                this.renderInspector();
            }
        }

        updateSelectedItem(key, value, refreshInspector = true, pushHist = true) {
            const primaryItem = this.items.find((x) => x.id === this.selectedId);
            if (!primaryItem) return;
            if (this.planKey === 'free' && ['animationType', 'auraType', 'auraColor', 'showTextBg', 'textBgStyle', 'textBgColor', 'textBgGradientFrom', 'textBgGradientTo', 'textColor', 'iconTextColor'].includes(key)) {
                this.showUpgrade('menuAdvanced', 'Nâng cấp Basic để đổi màu và dùng hiệu ứng động.');
                return;
            }
            if (this.planKey === 'pro' && ((key === 'animationType' && !['None', 'Pulse', 'Bounce', 'Float'].includes(String(value))) || (key === 'auraType' && !['None', 'Glow'].includes(String(value))))) {
                this.showUpgrade('menuAdvanced', 'Hiệu ứng chuyển động cao cấp dành cho gói Pro.');
                return;
            }
            const selectedItems = this.getSelectedItems().filter((x) => !x.locked);

            selectedItems.forEach((item) => {
                if (key === 'showName' || key === 'showTextBg' || key === 'lockRatio') {
                    item[key] = Boolean(value);
                } else if (['x', 'y', 'width', 'height', 'rotation', 'textSize', 'textGap', 'iconTextSize', 'animationSpeed', 'auraSpeed', 'auraScale'].includes(key)) {
                    const previousWidth = Math.max(1, Number(item.width) || 1);
                    const previousHeight = Math.max(1, Number(item.height) || 1);
                    item[key] = Number(value);
                    if (item.lockRatio !== false && key === 'width') {
                        item.height = Math.max(10, Math.round(item.width * (previousHeight / previousWidth)));
                    }
                    if (item.lockRatio !== false && key === 'height') {
                        item.width = Math.max(10, Math.round(item.height * (previousWidth / previousHeight)));
                    }
                    if (key === 'animationSpeed' || key === 'auraSpeed') {
                        item[key] = Math.max(0.2, Math.min(8, item[key] || 1));
                    }
                    if (key === 'auraScale') {
                        item[key] = Math.max(0.6, Math.min(1.8, item[key] || 1));
                    }
                    if (key === 'iconTextSize') {
                        item[key] = Math.max(10, Math.min(40, item[key] || 20));
                    }
                    if (key === 'textSize') {
                        item[key] = Math.max(6, Math.min(48, item[key] || 13));
                    }
                    this.clampInsideCanvas(item);
                } else if (key === 'auraColor') {
                    let v = String(value || '').trim();
                    if (v && !v.startsWith('#')) v = `#${v}`;
                    item[key] = v || '#c084fc';
                } else if (key === 'name') {
                    // Only update name on the primary item to avoid duplicate labels
                    if (item.id === this.selectedId) {
                        item[key] = value;
                    }
                } else {
                    item[key] = value;
                }
            });

            this.renderCanvas();
            if (refreshInspector || key === 'showTextBg' || key === 'textBgStyle') this.renderInspector();
            if (pushHist) this.pushHistory('update-item');
        }

        syncInspectorLinkedControls(sourceEl, key, value) {
            const inspector = this.mount.querySelector('#gmd-inspector');
            if (!inspector) return;
            inspector.querySelectorAll(`[data-key="${key}"]`).forEach((el) => {
                if (el === sourceEl) return;
                if (el.type === 'checkbox') el.checked = Boolean(value);
                else el.value = value;
            });
            if (sourceEl.dataset && sourceEl.dataset.playerIndex !== undefined) {
                const pIdx = sourceEl.dataset.playerIndex;
                const pKey = sourceEl.dataset.playerKey;
                inspector.querySelectorAll(`[data-player-index="${pIdx}"][data-player-key="${pKey}"]`).forEach((el) => {
                    if (el === sourceEl) return;
                    if (el.type === 'checkbox') el.checked = Boolean(value);
                    else el.value = value;
                });
            }
        }

        duplicateSelected() {
            const selected = this.getSelectedItems();
            if (!selected.length) return;
            const clones = selected.map((item, idx) => {
                const clone = JSON.parse(JSON.stringify(item));
                clone.id = `itm_${Date.now()}_${Math.floor(Math.random() * 1000)}_${idx}`;
                clone.x = item.x + 20;
                clone.y = item.y + 20;
                clone.zIndex = this.items.length + idx + 1;
                return clone;
            });
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
            const safeArea = this.coordinateEngine && typeof this.coordinateEngine.getSafeArea === 'function'
                ? this.coordinateEngine.getSafeArea(this.aspectRatio)
                : { x: 180, y: 160, width: safe.clientWidth, height: safe.clientHeight };
            const left = safeArea.x;
            const top = safeArea.y;
            const right = left + safeArea.width;
            const bottom = top + safeArea.height;
            selected.forEach((item) => {
                if (mode === 'left') item.x = left;
                if (mode === 'center-x') item.x = Math.round(left + ((safeArea.width - item.width) / 2));
                if (mode === 'right') item.x = Math.round(right - item.width);
                if (mode === 'top') item.y = top;
                if (mode === 'center-y') item.y = Math.round(top + ((safeArea.height - item.height) / 2));
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
            const threshold = 8;
            const safe = this.coordinateEngine && typeof this.coordinateEngine.getSafeArea === 'function'
                ? this.coordinateEngine.getSafeArea(this.aspectRatio)
                : { x: 0, y: 0, width: this.canvasSize.width, height: this.canvasSize.height };
            const cx = Math.round(safe.x + (safe.width - item.width) / 2);
            const cy = Math.round(safe.y + (safe.height - item.height) / 2);
            const candidatesX = [safe.x, cx, safe.x + safe.width - item.width];
            const candidatesY = [safe.y, cy, safe.y + safe.height - item.height];
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
            const oldRatio = this.aspectRatio;
            if (ratio !== oldRatio && this.coordinateEngine) {
                const oldSafe = this.coordinateEngine.getSafeArea(oldRatio);
                const nextSafe = this.coordinateEngine.getSafeArea(ratio);
                this.items.forEach((item) => {
                    const nx = (Number(item.x) - oldSafe.x) / oldSafe.width;
                    const ny = (Number(item.y) - oldSafe.y) / oldSafe.height;
                    const nw = Number(item.width) / oldSafe.width;
                    const nh = Number(item.height) / oldSafe.height;
                    item.x = Math.round(nextSafe.x + nx * nextSafe.width);
                    item.y = Math.round(nextSafe.y + ny * nextSafe.height);
                    item.width = Math.max(10, Math.round(nw * nextSafe.width));
                    item.height = Math.max(10, Math.round(nh * nextSafe.height));
                });
            }
            this.aspectRatio = ratio;
            this.mount.querySelectorAll('[data-ratio]').forEach((b) => b.classList.toggle('active', b.dataset.ratio === ratio));
            this.updateCanvasSizeByRatio();
            if (ratio !== oldRatio) {
                this.items.forEach((item) => {
                    this.clampInsideCanvas(item);
                    if (item.type && item.type !== 'gift') {
                        const logical = this.stageToLogical(item);
                        item.w = logical.w;
                        item.h = logical.h;
                    }
                });
                this.renderCanvas();
                this.renderInspector();
                this.pushHistory('change-aspect-ratio');
            }
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

        getFitScale() {
            const canvas = this.mount ? this.mount.querySelector('#gmd-canvas') : null;
            if (!canvas || canvas.clientWidth <= 50 || canvas.clientHeight <= 50) return 0.5;
            const pad = 30;
            const scaleX = (canvas.clientWidth - pad) / this.canvasSize.width;
            const scaleY = (canvas.clientHeight - pad) / this.canvasSize.height;
            return Math.max(0.1, Math.min(scaleX, scaleY, 1));
        }

        applyZoom() {
            const stage = this.mount.querySelector('#gmd-stage');
            const zoomText = this.mount.querySelector('#gmd-zoom-value');
            const fitScale = this.getFitScale();
            const finalScale = fitScale * this.zoomLevel;
            if (stage) {
                stage.style.position = 'absolute';
                stage.style.left = '50%';
                stage.style.top = '50%';
                stage.style.width = `${this.canvasSize.width}px`;
                stage.style.height = `${this.canvasSize.height}px`;
                stage.style.transform = `translate(-50%, -50%) translate(${this.panX}px, ${this.panY}px) scale(${finalScale})`;
            }
            if (zoomText) zoomText.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (canvas) canvas.classList.toggle('is-zoomed', this.zoomLevel > 1.01);
        }

        setZoom(nextZoom) {
            this.zoomLevel = Math.max(0.5, Math.min(5, nextZoom));
            if (this.zoomLevel <= 1) {
                this.panX = 0;
                this.panY = 0;
            }
            this.applyZoom();
        }

        clientToCanvasPoint(clientX, clientY) {
            const canvas = this.mount.querySelector('#gmd-canvas');
            if (!canvas) return { x: 0, y: 0 };
            const finalScale = this.getFitScale() * this.zoomLevel;
            const rect = canvas.getBoundingClientRect();
            const cx = canvas.clientWidth / 2;
            const cy = canvas.clientHeight / 2;
            const px = clientX - rect.left;
            const py = clientY - rect.top;
            const stageLeft = cx + this.panX - (this.canvasSize.width / 2) * finalScale;
            const stageTop = cy + this.panY - (this.canvasSize.height / 2) * finalScale;
            return {
                x: (px - stageLeft) / finalScale,
                y: (py - stageTop) / finalScale
            };
        }

        showPromptModal(title, defaultValue = '') {
            return new Promise((resolve) => {
                const modalId = 'gmd-custom-prompt-modal';
                let existing = document.getElementById(modalId);
                if (existing) existing.remove();

                const modal = document.createElement('div');
                modal.id = modalId;
                modal.style.position = 'fixed';
                modal.style.inset = '0';
                modal.style.background = 'rgba(3, 7, 18, 0.75)';
                modal.style.backdropFilter = 'blur(8px)';
                modal.style.zIndex = '99999';
                modal.style.display = 'flex';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';

                modal.innerHTML = `
                    <div style="background: linear-gradient(180deg, #0f172a 0%, #090d16 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 380px; padding: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); font-family: system-ui, sans-serif;">
                        <h4 style="margin: 0 0 12px; color: #f8fafc; font-size: 16px; font-weight: 800;">${title}</h4>
                        <input id="gmd-prompt-input" type="text" value="${this.escapeHtml(defaultValue)}" style="width: 100%; padding: 10px; background: rgba(3, 7, 18, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #f8fafc; font-size: 13px; margin-bottom: 16px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" />
                        <div style="display: flex; justify-content: flex-end; gap: 8px;">
                            <button id="gmd-prompt-cancel" class="gmd-btn" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1;">Hủy</button>
                            <button id="gmd-prompt-submit" class="gmd-btn primary" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); border: none; color: #fff;">Xác nhận</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

                const input = modal.querySelector('#gmd-prompt-input');
                input.focus();
                input.select();

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = input.value;
                        modal.remove();
                        resolve(val);
                    }
                    if (e.key === 'Escape') {
                        modal.remove();
                        resolve(null);
                    }
                });

                modal.querySelector('#gmd-prompt-cancel').onclick = () => {
                    modal.remove();
                    resolve(null);
                };

                modal.querySelector('#gmd-prompt-submit').onclick = () => {
                    const val = input.value;
                    modal.remove();
                    resolve(val);
                };
            });
        }

        showConfirmModal(title) {
            return new Promise((resolve) => {
                const modalId = 'gmd-custom-confirm-modal';
                let existing = document.getElementById(modalId);
                if (existing) existing.remove();

                const modal = document.createElement('div');
                modal.id = modalId;
                modal.style.position = 'fixed';
                modal.style.inset = '0';
                modal.style.background = 'rgba(3, 7, 18, 0.75)';
                modal.style.backdropFilter = 'blur(8px)';
                modal.style.zIndex = '99999';
                modal.style.display = 'flex';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';

                modal.innerHTML = `
                    <div style="background: linear-gradient(180deg, #0f172a 0%, #090d16 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 360px; padding: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); font-family: system-ui, sans-serif;">
                        <h4 style="margin: 0 0 16px; color: #f8fafc; font-size: 15px; font-weight: 800; line-height: 1.4;">${this.escapeHtml(title)}</h4>
                        <div style="display: flex; justify-content: flex-end; gap: 8px;">
                            <button id="gmd-confirm-cancel" class="gmd-btn" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1;">Hủy</button>
                            <button id="gmd-confirm-submit" class="gmd-btn primary" style="background: linear-gradient(135deg, #ef4444, #b91c1c); border: none; color: #fff;">Xóa</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

                const handleKey = (e) => {
                    if (e.key === 'Escape') {
                        modal.remove();
                        window.removeEventListener('keydown', handleKey);
                        resolve(false);
                    }
                };
                window.addEventListener('keydown', handleKey);

                modal.querySelector('#gmd-confirm-cancel').onclick = () => {
                    modal.remove();
                    window.removeEventListener('keydown', handleKey);
                    resolve(false);
                };

                modal.querySelector('#gmd-confirm-submit').onclick = () => {
                    modal.remove();
                    window.removeEventListener('keydown', handleKey);
                    resolve(true);
                };
            });
        }

        async saveLayout(showToast = true, forcePromptName = false) {
            let nameToSave = this.currentLayoutName || 'Menu mới';
            if (forcePromptName || !this.currentLayoutId || this.currentLayoutName === 'Menu mặc định' || this.currentLayoutName === 'New Menu') {
                const name = await this.showPromptModal('Nhập tên thiết kế để lưu:', this.currentLayoutName || 'Menu mới');
                if (name === null) return false; // user cancelled naming
                nameToSave = name.trim() || 'Menu mới';
                this.currentLayoutName = nameToSave;
            }

            const map = {
                '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
            };
            const cfg = map[this.aspectRatio] || map['9:16'];
            const liveCanvasSize = {
                width: cfg.canvasW,
                height: cfg.canvasH
            };
            const safeSize = {
                width: cfg.width,
                height: cfg.height
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
            const cleanRuntimeItem = (item) => {
                const cleanItem = JSON.parse(JSON.stringify(item));
                if (cleanItem._originalCurrentCount !== undefined) cleanItem.currentCount = cleanItem._originalCurrentCount;
                if (cleanItem._originalContributors !== undefined) cleanItem.contributors = cleanItem._originalContributors;
                if (cleanItem._originalComboCount !== undefined) cleanItem.comboCount = cleanItem._originalComboCount;
                if (Array.isArray(cleanItem.goals)) {
                    cleanItem.goals = cleanItem.goals.map((goal) => {
                        if (goal._originalCurrent !== undefined) goal.current = goal._originalCurrent;
                        delete goal._originalCurrent;
                        return goal;
                    });
                }
                delete cleanItem._originalCurrentCount;
                delete cleanItem._originalContributors;
                delete cleanItem._originalComboCount;
                return cleanItem;
            };
            const cleanItems = this.items.map(cleanRuntimeItem);
            const exportedItems = cleanItems.map((cleanItem, index) => {
                const i = this.items[index];
                const itemExport = {
                    ...cleanItem,
                    x: Math.round((i.x - safeOffset.x) * sx),
                    y: Math.round((i.y - safeOffset.y) * sy),
                    width: Math.round(i.width * sx),
                    height: Math.round(i.height * sy),
                    textSize: Number(i.textSize || 13) * ((sx + sy) / 2),
                    textGap: Number(i.textGap || 4) * sy,
                    iconTextSize: Number(i.iconTextSize || 20) * ((sx + sy) / 2)
                };
                if (i.type && i.type !== 'gift') {
                    itemExport.w = itemExport.width;
                    itemExport.h = itemExport.height;
                }
                if (i.type === 'goal-list' && Array.isArray(cleanItem.goals)) {
                    const avgScale = (sx + sy) / 2;
                    itemExport.goals = cleanItem.goals.map((goal) => ({
                        ...goal,
                        iconTextSize: Number(goal.iconTextSize || 16) * avgScale
                    }));
                }
                if (i.type === 'gift-stack-group') {
                    const avgScale = (sx + sy) / 2;
                    itemExport.renderScale = avgScale;
                    itemExport.children = Array.isArray(i.children) ? i.children.map((child) => ({
                        ...child,
                        iconTextSize: Number(child.iconTextSize || 20) * avgScale
                    })) : [];
                    itemExport.iconSize = Number(i.iconSize || 64) * avgScale;
                    itemExport.textSize = Number(i.textSize || 14) * avgScale;
                    itemExport.textGap = Number(i.textGap || 4) * avgScale;
                    itemExport.gap = Number(i.gap || 10) * avgScale;
                    itemExport.borderRadius = Number(i.borderRadius !== undefined ? i.borderRadius : 8) * avgScale;
                    itemExport.padding = Number(i.padding !== undefined ? i.padding : 8) * avgScale;
                    itemExport.loopEnabled = Boolean(i.loopEnabled);
                }
                return itemExport;
            });
            const payload = {
                id: this.currentLayoutId || undefined,
                name: nameToSave,
                version: 2,
                savedAt: new Date().toISOString(),
                aspectRatio: this.aspectRatio,
                canvasSize: liveCanvasSize,
                safeArea: { ...safeSize, ...safeOffset },
                exportSize,
                items: cleanItems,
                exportedItems
            };
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, { method: 'POST', headers, body: JSON.stringify(payload) });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data && data.success && data.layout) {
                    this.currentLayoutId = data.layout._id;
                    this.currentLayoutName = data.layout.name;
                    localStorage.setItem('giftMenuDesignerLayoutV2', JSON.stringify(payload));
                } else {
                    if (this.handlePlanLimit(data, 'layouts')) return false;
                    throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
                }
            } catch (err) {
                console.error('❌ Failed to save layout:', err);
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', `Không thể lưu thiết kế: ${err.message || err}`);
                }
                return false;
            }
            if (showToast && window.app && typeof window.app.showNotification === 'function') window.app.showNotification('success', 'Đã lưu layout');
            await this.loadLayoutsList();
            return true;
        }

        async exportToOBS() {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/obs/setup-gift-menu`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ layoutId: this.currentLayoutId })
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
                const saved = await this.saveLayout(false, false);
                if (saved === false) return; // user cancelled naming
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

        async loadLayoutsList() {
            if (!this.token) {
                this.layouts = [];
                this.renderMyLibrary();
                return;
            }
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layouts`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.layouts)) {
                        this.layouts = data.layouts;
                    }
                }
            } catch (_e) {
                this.layouts = [];
            }
            this.renderMyLibrary();
        }

        async loadLayout() {
            let payload = null;
            let loadedFromDb = false;
            if (this.token) {
                try {
                    const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                    const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, { headers });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.success) {
                            payload = data.layout;
                            loadedFromDb = true;
                        }
                    }
                } catch (_e) { }
            }
            if (!payload && !loadedFromDb) {
                try { payload = JSON.parse(localStorage.getItem('giftMenuDesignerLayoutV2') || 'null'); } catch (_e) { payload = null; }
            }
            if (!payload) {
                if (loadedFromDb) {
                    localStorage.removeItem('giftMenuDesignerLayoutV2');
                }
                this.currentLayoutId = null;
                this.currentLayoutName = '';
                this.items = [];
                this.clearSelection();
                this.renderCanvas();
                this.renderInspector();
                this.renderMyLibrary();
                return;
            }
            this.currentLayoutId = payload._id || null;
            this.currentLayoutName = payload.name || 'Menu mặc định';
            this.aspectRatio = payload.aspectRatio || '9:16';
            this.items = Array.isArray(payload.items) ? payload.items.map((item, idx) => {
                const normalized = {
                    ...item,
                    animationSpeed: Number(item.animationSpeed || 1),
                    auraSpeed: Number(item.auraSpeed || 1),
                    auraScale: Number(item.auraScale || 1),
                    textPosition: item.textPosition || 'bottom',
                    visible: item.visible !== false,
                    locked: Boolean(item.locked),
                    zIndex: item.zIndex || idx + 1
                };
                if (item.type === 'gift-stack-group') {
                    normalized.children = Array.isArray(item.children) ? item.children.map((child) => ({ ...child })) : [];
                    normalized.itemRefs = Array.isArray(item.itemRefs) ? item.itemRefs : [];
                    normalized.layoutDirection = item.layoutDirection === 'horizontal' ? 'horizontal' : 'vertical';
                    normalized.gap = item.gap !== undefined ? Number(item.gap) : 10;
                    normalized.iconSize = item.iconSize !== undefined ? Number(item.iconSize) : 64;
                    normalized.textSize = item.textSize !== undefined ? Number(item.textSize) : 14;
                    normalized.textPosition = item.textPosition || 'bottom';
                    normalized.textGap = item.textGap !== undefined ? Number(item.textGap) : 4;
                    normalized.textColor = item.textColor || '#ffffff';
                    normalized.showName = item.showName !== false;
                    normalized.showPanel = item.showPanel !== undefined ? Boolean(item.showPanel) : !item.hideBg;
                    normalized.showBorder = item.showBorder !== undefined ? Boolean(item.showBorder) : !item.hideBg;
                    normalized.panelColor = item.panelColor || item.bgColor || '#0a0a14';
                    normalized.panelFillType = item.panelFillType === 'gradient' ? 'gradient' : 'solid';
                    normalized.panelGradientFrom = item.panelGradientFrom || item.panelColor || item.bgColor || '#3b1f48';
                    normalized.panelGradientTo = item.panelGradientTo || '#0a0a14';
                    normalized.panelGradientAngle = item.panelGradientAngle !== undefined ? Number(item.panelGradientAngle) : 135;
                    normalized.panelEffect = item.panelEffect || 'none';
                    normalized.panelEffectSpeed = item.panelEffectSpeed !== undefined ? Number(item.panelEffectSpeed) : 3;
                    normalized.panelGlowIntensity = item.panelGlowIntensity !== undefined ? Number(item.panelGlowIntensity) : 0.35;
                    normalized.borderColor = item.borderColor || '#22d3ee';
                    normalized.borderFillType = item.borderFillType === 'gradient' ? 'gradient' : 'solid';
                    normalized.borderGradientFrom = item.borderGradientFrom || item.borderColor || '#22d3ee';
                    normalized.borderGradientTo = item.borderGradientTo || '#a855f7';
                    normalized.borderGradientAngle = item.borderGradientAngle !== undefined ? Number(item.borderGradientAngle) : 135;
                    normalized.borderEffect = item.borderEffect || 'none';
                    normalized.borderEffectSpeed = item.borderEffectSpeed !== undefined ? Number(item.borderEffectSpeed) : 2;
                    normalized.borderGlowIntensity = item.borderGlowIntensity !== undefined ? Number(item.borderGlowIntensity) : 0.55;
                    normalized.loopEnabled = Boolean(item.loopEnabled);
                    normalized.loopDirection = item.loopDirection === 'horizontal' ? 'horizontal' : 'vertical';
                    normalized.loopSpeed = item.loopSpeed !== undefined ? Number(item.loopSpeed) : 15;
                }
                return normalized;
            }) : [];
            this.migrateLegacyStackGroups();
            this.setSelection(this.items[0] ? [this.items[0].id] : [], this.items[0] ? this.items[0].id : null);
            this.setAspectRatio(this.aspectRatio);
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.history = [];
            this.historyIndex = -1;
            this.pushHistory('load-layout');
        }

        async createNewLayout(name) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout/create`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (data && data.success && data.layout) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('success', 'Đã tạo thiết kế mới');
                    }
                    this.currentLayoutId = data.layout._id;
                    this.currentLayoutName = data.layout.name;
                    this.items = [];
                    this.clearSelection();
                    this.setAspectRatio('9:16');
                    this.renderCanvas();
                    this.renderInspector();
                    await this.loadLayoutsList();
                    this.history = [];
                    this.historyIndex = -1;
                    this.pushHistory('new-layout');
                } else if (!this.handlePlanLimit(data, 'layouts')) {
                    throw new Error(data.error || data.message || 'Không thể tạo thiết kế mới');
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Không thể tạo thiết kế mới');
                }
            }
        }

        async activateLayout(layoutId) {
            try {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('info', 'Đang kích hoạt layout...');
                }
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout/${layoutId}/activate`, { method: 'PUT', headers });
                const data = await res.json();
                if (data && data.success) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('success', 'Đã kích hoạt layout');
                    }
                    await this.loadLayoutsList();
                    await this.loadLayout();
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Không thể kích hoạt layout');
                }
            }
        }

        async deleteLayout(layoutId) {
            const confirmed = await this.showConfirmModal('Bạn có chắc chắn muốn xóa thiết kế này?');
            if (!confirmed) return;
            try {
                const headers = {};
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout/${layoutId}`, { method: 'DELETE', headers });
                const data = await res.json();
                if (data && data.success) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('success', 'Đã xóa thiết kế');
                    }
                    await this.loadLayoutsList();
                    if (this.currentLayoutId === layoutId) {
                        this.currentLayoutId = null;
                        this.currentLayoutName = '';
                        await this.loadLayout();
                    }
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Không thể xóa thiết kế');
                }
            }
        }

        async renameLayout(layoutId, newName) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers.Authorization = `Bearer ${this.token}`;
                const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        id: layoutId,
                        name: newName
                    })
                });
                const data = await res.json();
                if (!res.ok || !(data && data.success)) {
                    throw new Error((data && (data.message || data.error)) || 'Rename layout is not supported');
                }
                if (data && data.success) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('success', 'Đã đổi tên thiết kế');
                    }
                    if (this.currentLayoutId === layoutId) {
                        this.currentLayoutName = newName;
                    }
                    await this.loadLayoutsList();
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Không thể đổi tên thiết kế');
                }
            }
        }

        renderMyLibrary() {
            const box = this.mount.querySelector('#gmd-my-library-list');
            if (!box) return;
            if (!this.layouts || !this.layouts.length) {
                box.innerHTML = `<div style="text-align: center; padding: 24px 12px; font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px;">
                    Chưa có thiết kế nào.<br>Hãy bấm <strong>"Tạo mới"</strong> ở trên để bắt đầu!
                </div>`;
                return;
            }
            box.innerHTML = this.layouts.map(layout => {
                const isActive = layout.isActive || (this.currentLayoutId === layout._id);
                return `
                    <div class="gmd-my-library-item ${isActive ? 'active' : ''}" data-layout-id="${layout._id}">
                        <div class="gmd-my-library-info">
                            <strong>${this.escapeHtml(layout.name || 'Menu không tên')}</strong>
                            <span>${(layout.items || []).length} phần quà</span>
                        </div>
                        <div class="gmd-my-library-actions">
                            ${isActive ? '<i class="fas fa-check-circle active-check" title="Đang hoạt động"></i>' : `<button class="gmd-lib-btn activate-btn" data-action="activate-layout" data-layout-id="${layout._id}" title="Kích hoạt"><i class="fas fa-power-off"></i></button>`}
                            <button class="gmd-lib-btn rename-btn" data-action="rename-layout" data-layout-id="${layout._id}" title="Đổi tên"><i class="fas fa-edit"></i></button>
                            <button class="gmd-lib-btn delete-btn" data-action="delete-layout" data-layout-id="${layout._id}" title="Xóa"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        clampInsideCanvas(item) {
            const w = this.canvasSize.width;
            const h = this.canvasSize.height;
            const minSize = item.type && item.type !== 'gift' ? 30 : 10;
            item.width = Math.max(minSize, Math.min(item.width, w));
            item.height = Math.max(minSize, Math.min(item.height, h));
            item.x = Math.max(0, Math.min(item.x, w - item.width));
            item.y = Math.max(0, Math.min(item.y, h - item.height));
        }

        bindEvents() {
            this.mount.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                const giftCard = e.target.closest('.gmd-gift-card');
                const itemNode = e.target.closest('.gmd-item');
                const clickedCanvas = e.target.closest('#gmd-canvas');

                // Unified Sidebar Left Tabs Click Handling
                const leftTab = e.target.closest('.gmd-left-tab-btn');
                if (leftTab) {
                    const tabName = leftTab.dataset.tabName;
                    this.leftPanelTab = tabName;
                    this.mount.querySelectorAll('.gmd-left-tab-btn').forEach(b => {
                        b.classList.toggle('active', b === leftTab);
                        b.style.borderBottomColor = b === leftTab ? '#3b82f6' : 'transparent';
                        b.style.color = b === leftTab ? '#fff' : '#888';
                    });

                    const giftsContent = this.mount.querySelector('#gmd-gifts-tab-content');
                    const widgetsContent = this.mount.querySelector('#gmd-widgets-tab-content');
                    const assetsContent = this.mount.querySelector('#gmd-assets-tab-content');

                    if (giftsContent) giftsContent.style.display = tabName === 'gifts' ? 'flex' : 'none';
                    if (widgetsContent) widgetsContent.style.display = tabName === 'widgets' ? 'flex' : 'none';
                    if (assetsContent) assetsContent.style.display = tabName === 'assets' ? 'flex' : 'none';

                    if (tabName === 'widgets') {
                        this.renderWidgetsList();
                    } else if (tabName === 'assets') {
                        this.renderAssetsList();
                    }
                    return;
                }

                // Custom Gift Addition Button Click
                const addGiftBtn = e.target.closest('.gmd-add-btn');
                if (addGiftBtn) {
                    this.showAddCustomGiftModal();
                    return;
                }

                const deleteCustomGiftBtn = e.target.closest('.gmd-custom-gift-delete');
                if (deleteCustomGiftBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteCustomGift(deleteCustomGiftBtn.dataset.customGiftId);
                    return;
                }

                // Add Text Button Click
                const addTextBtn = e.target.closest('#gmd-add-text-btn');
                if (addTextBtn) {
                    this.addTextToCanvas();
                    return;
                }

                // Upload trigger button
                const uploadBtn = e.target.closest('#gmd-upload-asset-btn');
                const fileInput = this.mount.querySelector('#gmd-asset-file-input');
                if (uploadBtn && fileInput) {
                    if (this.planKey === 'free') {
                        this.showUpgrade('menuAssets', 'Nâng cấp Basic để tải ảnh/video riêng vào menu.');
                        return;
                    }
                    fileInput.click();
                    return;
                }

                // Sidebar Tabs Click Handling (Bottom panel)
                const libTab = e.target.closest('.gmd-lib-tab-btn');
                if (libTab) {
                    const tabName = libTab.dataset.tabName;
                    this.mount.querySelectorAll('.gmd-lib-tab-btn').forEach(b => {
                        b.classList.toggle('active', b === libTab);
                        b.style.borderBottomColor = b === libTab ? '#3b82f6' : 'transparent';
                        b.style.color = b === libTab ? '#fff' : '#888';
                    });

                    const myLibContent = this.mount.querySelector('#gmd-my-library-content');
                    const tmplContent = this.mount.querySelector('#gmd-templates-content');

                    if (tabName === 'my-library') {
                        if (myLibContent) myLibContent.style.display = 'block';
                        if (tmplContent) tmplContent.style.display = 'none';
                    } else if (tabName === 'templates') {
                        if (myLibContent) myLibContent.style.display = 'none';
                        if (tmplContent) tmplContent.style.display = 'block';
                        this.loadTemplatesList();
                    }
                    return;
                }

                // Sidebar Use Template Click
                const tmplUseBtn = e.target.closest('.gmd-btn-use-tmpl');
                if (tmplUseBtn) {
                    const templateId = tmplUseBtn.dataset.templateId;
                    this.buyOrUseTemplateFromSidebar(templateId);
                    return;
                }

                // Unified Widget/Template Card Clicks
                const tmplCard = e.target.closest('.gmd-template-card');
                if (tmplCard) {
                    const templateId = tmplCard.dataset.templateId;
                    if (this.planKey === 'free' && templateId !== 'tmpl_neon_purple') {
                        this.showUpgrade('templates', 'Gói Free chỉ sử dụng mẫu cơ bản. Nâng cấp Basic để mở thêm mẫu.');
                        return;
                    }
                    this.addTemplateToCanvas(templateId);
                    return;
                }
                const assetCard = e.target.closest('.gmd-asset-card');
                if (assetCard) {
                    if (this.planKey === 'free') {
                        this.showUpgrade('menuAssets', 'Nâng cấp Basic để đưa ảnh/video riêng vào menu.');
                        return;
                    }
                    const url = assetCard.dataset.assetUrl;
                    const name = assetCard.dataset.assetName;
                    const type = assetCard.dataset.assetType;
                    this.addAssetToCanvas(url, name, type);
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
                    if (tab === 'layers' && !['business', 'studio', 'admin'].includes(this.planKey)) {
                        this.showUpgrade('menuAdvanced', 'Hệ thống lớp nâng cao dành cho gói Pro.');
                        return;
                    }
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
                if (action === 'create-stack-group') {
                    this.createStackGroupFromSelection();
                    return;
                }
                if (action === 'ungroup-stack') {
                    this.ungroupStackGroup();
                    return;
                }
                if (action === 'duplicate') this.duplicateSelected();
                if (action === 'delete') this.deleteSelected();
                if (action === 'undo') this.undo();
                if (action === 'redo') this.redo();
                if (action === 'help') {
                    alert('Gift Menu Designer\n\n• Kéo thả để di chuyển\n• Shift + click để chọn nhiều\n• Ctrl + D để nhân bản\n• Ctrl + Z / Ctrl + Y để hoàn tác / làm lại\n• Delete để xóa\n• Ctrl + cuộn chuột để zoom\n• Giữ Space hoặc chuột giữa để pan khi đang zoom');
                    return;
                }
                if (['layer-toggle-visible', 'layer-toggle-lock', 'layer-up', 'layer-down', 'align-left', 'align-center-x', 'align-right', 'align-top', 'align-center-y', 'align-bottom', 'distribute-x', 'distribute-y', 'create-stack-group', 'ungroup-stack'].includes(action) && !['business', 'studio', 'admin'].includes(this.planKey)) {
                    this.showUpgrade('menuAdvanced', 'Hệ thống lớp nâng cao dành cho gói Pro.');
                    return;
                }
                if (action === 'save-new-template') {
                    this.showSaveTemplateModal();
                    return;
                }
                if (action === 'clear-goal-board') {
                    this.clearGoalBoard();
                    return;
                }
                if (action === 'publish-store') {
                    this.showPublishStoreModal();
                    return;
                }
                if (action === 'save') {
                    this.saveLayout(true, false);
                }
                if (action === 'save-export') {
                    this.saveAndExport();
                }

                // Library panel actions
                const libItem = e.target.closest('.gmd-my-library-item');
                if (libItem) {
                    const deleteBtn = e.target.closest('[data-action="delete-layout"]');
                    const renameBtn = e.target.closest('[data-action="rename-layout"]');
                    const activateBtn = e.target.closest('[data-action="activate-layout"]');
                    const layoutId = libItem.dataset.layoutId;

                    if (deleteBtn) {
                        e.stopPropagation();
                        if (layoutId) this.deleteLayout(layoutId);
                        return;
                    }
                    if (renameBtn) {
                        e.stopPropagation();
                        if (layoutId) {
                            const layout = this.layouts.find(x => x._id === layoutId);
                            const oldName = layout ? layout.name : 'Menu mới';
                            this.showPromptModal('Nhập tên mới cho thiết kế:', oldName).then(newName => {
                                if (newName !== null && newName.trim()) {
                                    this.renameLayout(layoutId, newName.trim());
                                }
                            });
                        }
                        return;
                    }
                    if (activateBtn || (!deleteBtn && !renameBtn)) {
                        if (layoutId && layoutId !== this.currentLayoutId) {
                            this.activateLayout(layoutId);
                        }
                        return;
                    }
                }

                if (action === 'new-layout') {
                    this.showPromptModal('Nhập tên thiết kế mới:', 'Menu mới').then(name => {
                        if (name === null) return;
                        const safeName = name.trim() || 'Menu mới';
                        this.createNewLayout(safeName);
                    });
                    return;
                }
                if (action === 'zoom-in') this.setZoom(this.zoomLevel + 0.1);
                if (action === 'zoom-out') this.setZoom(this.zoomLevel - 0.1);
            });

            const handleInputChange = (e) => {
                const el = e.target;
                const isTemp = e.type === 'input';

                if (el.id === 'gmd-search') {
                    const q = String(el.value || '').trim().toLowerCase();
                    this.filteredGifts = this.gifts.filter((g) => String(g.name || '').toLowerCase().includes(q) || String(g.id || '').toLowerCase().includes(q));
                    this.renderGiftLibrary();
                    return;
                }
                if (el.dataset && el.dataset.childIndex !== undefined) {
                    const index = Number(el.dataset.childIndex);
                    const key = el.dataset.childKey;
                    const value = el.type === 'checkbox' ? el.checked : el.value;
                    this.updateGoalBoardChildItem(index, key, value, !isTemp);
                    return;
                }

                if (el.dataset && el.dataset.playerIndex !== undefined) {
                    const index = Number(el.dataset.playerIndex);
                    const key = el.dataset.playerKey;
                    const value = el.type === 'checkbox' ? el.checked : el.value;
                    this.updateGoalBoardPlayerItem(index, key, value, !isTemp);
                    this.syncInspectorLinkedControls(el, key, value);
                    return;
                }
                if (el.dataset && el.dataset.goalKey) {
                    const key = el.dataset.goalKey;
                    const value = el.type === 'checkbox' ? el.checked : el.value;
                    this.updateGoalBoardSelectedItem(key, value, !isTemp);
                    return;
                }
                if (el.dataset && el.dataset.key) {
                    const key = el.dataset.key;
                    const value = el.type === 'checkbox' ? el.checked : el.value;
                    this.updateSelectedItem(key, value, false, !isTemp);
                    this.syncInspectorLinkedControls(el, key, value);
                }
            };

            this.mount.addEventListener('input', handleInputChange);
            this.mount.addEventListener('change', handleInputChange);

            this.mount.querySelectorAll('[data-ratio]').forEach((btn) => btn.addEventListener('click', () => this.setAspectRatio(btn.dataset.ratio)));

            this.mount.addEventListener('dragstart', (e) => {
                const giftCard = e.target.closest('.gmd-gift-card');
                if (giftCard) {
                    e.dataTransfer.setData('text/plain', giftCard.dataset.giftId || '');
                    return;
                }
                const tmplCard = e.target.closest('.gmd-template-card');
                if (tmplCard) {
                    e.dataTransfer.setData('template-id', tmplCard.dataset.templateId || '');
                    return;
                }
                const assetCard = e.target.closest('.gmd-asset-card');
                if (assetCard) {
                    e.dataTransfer.setData('asset-url', assetCard.dataset.assetUrl || '');
                    e.dataTransfer.setData('asset-name', assetCard.dataset.assetName || '');
                    e.dataTransfer.setData('asset-type', assetCard.dataset.assetType || '');
                    return;
                }
            });

            const canvas = this.mount.querySelector('#gmd-canvas');
            if (canvas) {
                canvas.addEventListener('dragover', (e) => e.preventDefault());
                canvas.addEventListener('drop', (e) => {
                    e.preventDefault();

                    const templateId = e.dataTransfer.getData('template-id');
                    const assetUrl = e.dataTransfer.getData('asset-url');
                    const assetName = e.dataTransfer.getData('asset-name');
                    const assetType = e.dataTransfer.getData('asset-type');

                    const point = this.clientToCanvasPoint(e.clientX, e.clientY);

                    if (templateId) {
                        if (this.planKey === 'free' && templateId !== 'tmpl_neon_purple') {
                            this.showUpgrade('templates', 'Gói Free chỉ sử dụng mẫu cơ bản.');
                            return;
                        }
                        this.addTemplateToCanvas(templateId, point.x, point.y);
                        return;
                    }

                    if (assetUrl) {
                        if (this.planKey === 'free') {
                            this.showUpgrade('menuAssets', 'Nâng cấp Basic để đưa ảnh/video riêng vào menu.');
                            return;
                        }
                        this.addAssetToCanvas(assetUrl, assetName, assetType, point.x - 60, point.y - 60);
                        return;
                    }

                    const giftId = e.dataTransfer.getData('text/plain');
                    if (!giftId) return;
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
                e.preventDefault(); // Prevent browser default drag/selection ghosts!
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
                if (handle && handle.dataset.handle === 'resize') {
                    if (item.type === 'gift-stack-group') {
                        this.dragState = {
                            mode: 'stack-resize',
                            id: item.id,
                            sx: e.clientX,
                            sy: e.clientY,
                            x: item.x,
                            y: item.y,
                            width: item.width,
                            height: item.height
                        };
                        this.renderCanvas();
                        this.renderInspector();
                        return;
                    }
                    let moving = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
                    const groupIds = new Set(moving.map(m => m.groupId).filter(Boolean));
                    if (groupIds.size > 0) {
                        const extra = this.items.filter(x => groupIds.has(x.groupId) && !x.locked && x.visible !== false);
                        moving = Array.from(new Set([...moving, ...extra]));
                    }
                    const startSizes = Object.fromEntries(moving.map((m) => [m.id, { width: m.width, height: m.height, fontSize: m.fontSize || 36 }]));
                    this.dragState = { mode: 'resize', id: item.id, sx: e.clientX, sy: e.clientY, width: item.width, height: item.height, movingIds: moving.map((m) => m.id), startSizes };
                } else if (handle && handle.dataset.handle === 'rotate') {
                    const moving = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
                    const startRotations = Object.fromEntries(moving.map((m) => [m.id, m.rotation]));
                    this.dragState = { mode: 'rotate', id: item.id, sx: e.clientX, startRot: item.rotation, movingIds: moving.map((m) => m.id), startRotations };
                } else {
                    let moving = this.getSelectedItems().filter((x) => !x.locked && x.visible !== false);
                    const groupIds = new Set(moving.map(m => m.groupId).filter(Boolean));
                    if (groupIds.size > 0) {
                        const extra = this.items.filter(x => groupIds.has(x.groupId) && !x.locked && x.visible !== false);
                        moving = Array.from(new Set([...moving, ...extra]));
                    }
                    const startPositions = Object.fromEntries(moving.map((m) => [m.id, { x: m.x, y: m.y }]));
                    this.dragState = { mode: 'move', id: item.id, sx: e.clientX, sy: e.clientY, x: item.x, y: item.y, movingIds: moving.map((m) => m.id), startPositions };
                }
                this.renderCanvas();
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.dragState) return;

                if (this.dragState.mode === 'goal-move' || this.dragState.mode === 'goal-resize') {
                    // Legacy goalBoard drag modes are intentionally disabled.
                    // The active Menu Designer canvas uses this.items with move/resize modes below.
                    this.dragState = null;
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
                    const finalScale = this.getFitScale() * this.zoomLevel;
                    const dx = ((e.clientX - this.dragState.sx) / finalScale);
                    const dy = ((e.clientY - this.dragState.sy) / finalScale);
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

                        // Ultra Performance Direct DOM updates
                        const domEl = document.getElementById('gmd-item-' + id);
                        if (domEl) {
                            domEl.style.left = movingItem.x + 'px';
                            domEl.style.top = movingItem.y + 'px';
                        }
                    });
                    this.updateGuides(snapped.guideX, snapped.guideY);
                } else if (this.dragState.mode === 'stack-resize') {
                    const finalScale = this.getFitScale() * this.zoomLevel;
                    const dx = (e.clientX - this.dragState.sx) / finalScale;
                    const dy = (e.clientY - this.dragState.sy) / finalScale;
                    item.width = Math.max(30, Math.round(this.dragState.width + dx));
                    item.height = item.lockRatio
                        ? Math.max(30, Math.round(item.width * (this.dragState.height / this.dragState.width)))
                        : Math.max(30, Math.round(this.dragState.height + dy));
                    this.clampInsideCanvas(item);

                    const map = {
                        '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                        '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                        '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
                    };
                    const cfg = map[this.aspectRatio] || map['9:16'];
                    const exportSize = this.aspectRatio === '9:16'
                        ? { width: 1080, height: 1920 }
                        : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
                    const sx = exportSize.width / cfg.width;
                    const sy = exportSize.height / cfg.height;
                    item.w = Math.round(item.width * sx);
                    item.h = Math.round(item.height * sy);
                    this.renderCanvas();
                } else if (this.dragState.mode === 'resize') {
                    const finalScale = this.getFitScale() * this.zoomLevel;
                    const dx = (e.clientX - this.dragState.sx) / finalScale;
                    const dy = (e.clientY - this.dragState.sy) / finalScale;
                    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                    (this.dragState.movingIds || [item.id]).forEach((id) => {
                        const target = this.items.find((x) => x.id === id);
                        const start = this.dragState.startSizes ? this.dragState.startSizes[id] : null;
                        if (!target || !start) return;
                        const isWidget = target.type && target.type !== 'gift';
                        if (isWidget) {
                            if (target.lockRatio) {
                                const ratio = start.height / start.width;
                                target.width = Math.round(start.width + dx);
                                target.height = Math.round(target.width * ratio);
                            } else {
                                target.width = Math.round(start.width + dx);
                                target.height = Math.round(start.height + dy);
                            }
                            // Sync logical w/h
                            const map = {
                                '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                                '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                                '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
                            };
                            const cfg = map[this.aspectRatio] || map['9:16'];
                            const exportSize = this.aspectRatio === '9:16'
                                ? { width: 1080, height: 1920 }
                                : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
                            const sx = exportSize.width / cfg.width;
                            const sy = exportSize.height / cfg.height;
                            target.w = Math.round(target.width * sx);
                            target.h = Math.round(target.height * sy);
                            if (target.type === 'text') {
                                const scaleW = target.width / start.width;
                                target.fontSize = Math.max(10, Math.round((start.fontSize || 36) * scaleW));
                            }
                        } else if (target.lockRatio !== false) {
                            const nextWidth = Math.max(10, Math.round(start.width + delta));
                            target.width = nextWidth;
                            target.height = Math.max(10, Math.round(nextWidth * (start.height / start.width)));
                        } else {
                            target.width = Math.max(10, Math.round(start.width + dx));
                            target.height = Math.max(10, Math.round(start.height + dy));
                        }
                        this.clampInsideCanvas(target);
                    });
                    this.renderCanvas();
                } else if (this.dragState.mode === 'rotate') {
                    const deltaRot = Math.round((e.clientX - this.dragState.sx) * 0.7);
                    (this.dragState.movingIds || [item.id]).forEach((id) => {
                        const target = this.items.find((x) => x.id === id);
                        const startRot = this.dragState.startRotations ? this.dragState.startRotations[id] : 0;
                        if (!target) return;
                        target.rotation = Math.round(startRot + deltaRot);
                    });
                    this.renderCanvas();
                }
            });

            window.addEventListener('mouseup', () => {
                if (this.dragState && this.dragState.mode !== 'pan') {
                    this.pushHistory('drag-finish');
                    this.renderCanvas(); // Final render sync on release
                    this.renderInspector();
                }
                this.updateGuides(null, null);
                this.dragState = null;
            });

            window.addEventListener('mouseup', () => {
                const canvas = this.mount.querySelector('#gmd-canvas');
                if (canvas) canvas.classList.remove('is-panning');
            });

            const canvasEl = this.mount.querySelector('#gmd-canvas');
            if (canvasEl) {
                canvasEl.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    if (e.ctrlKey) {
                        // Ctrl + Wheel: Zoom
                        const zoomFactor = 1.1;
                        if (e.deltaY < 0) {
                            this.setZoom(this.zoomLevel * zoomFactor);
                        } else {
                            this.setZoom(this.zoomLevel / zoomFactor);
                        }
                    } else {
                        // Mouse Wheel: Pan
                        this.panX -= e.deltaX;
                        this.panY -= e.deltaY;
                        this.applyZoom();
                    }
                }, { passive: false });
            }

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

            // Keyboard hotkeys for canvas operations
            window.addEventListener('keydown', (e) => {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag === 'input' || activeTag === 'textarea') return;

                if (e.code === 'Delete' || e.code === 'Backspace') {
                    e.preventDefault();
                    this.deleteSelected();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
                    e.preventDefault();
                    this.duplicateSelected();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
                    e.preventDefault();
                    this.undo();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
                    e.preventDefault();
                    this.redo();
                }
            });
        }

        // ==========================================
        // GOAL BOARD DESIGNER METHODS (PHASE 1)
        // ==========================================

        logicalToStage(item) {
            if (this.coordinateEngine && typeof this.coordinateEngine.logicalToStage === 'function') {
                return this.coordinateEngine.logicalToStage(item, this.aspectRatio);
            }
            const map = {
                '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
            };
            const cfg = map[this.aspectRatio] || map['9:16'];
            const safeSize = {
                width: cfg.width,
                height: cfg.height
            };
            const safeOffset = {
                x: Math.round((cfg.canvasW - cfg.width) / 2),
                y: Math.round((cfg.canvasH - cfg.height) / 2)
            };
            const exportSize = this.aspectRatio === '9:16'
                ? { width: 1080, height: 1920 }
                : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });

            const sx = safeSize.width / exportSize.width;
            const sy = safeSize.height / exportSize.height;

            const logicalX = item.x !== undefined ? item.x : 90;
            const logicalY = item.y !== undefined ? item.y : 800;
            const logicalW = item.w !== undefined ? item.w : (item.width !== undefined ? item.width : 900);
            const logicalH = item.h !== undefined ? item.h : (item.height !== undefined ? item.height : 160);

            return {
                x: Math.round(safeOffset.x + logicalX * sx),
                y: Math.round(safeOffset.y + logicalY * sy),
                width: Math.round(logicalW * sx),
                height: Math.round(logicalH * sy),
                w: logicalW,
                h: logicalH
            };
        }

        stageToLogical(item) {
            if (this.coordinateEngine && typeof this.coordinateEngine.stageToLogical === 'function') {
                return this.coordinateEngine.stageToLogical(item, this.aspectRatio);
            }
            const map = {
                '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
            };
            const cfg = map[this.aspectRatio] || map['9:16'];
            const safeOffset = {
                x: Math.round((cfg.canvasW - cfg.width) / 2),
                y: Math.round((cfg.canvasH - cfg.height) / 2)
            };
            const exportSize = this.aspectRatio === '9:16'
                ? { width: 1080, height: 1920 }
                : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
            const sx = exportSize.width / cfg.width;
            const sy = exportSize.height / cfg.height;

            return {
                x: Math.round((item.x - safeOffset.x) * sx),
                y: Math.round((item.y - safeOffset.y) * sy),
                w: Math.round(item.width * sx),
                h: Math.round(item.height * sy)
            };
        }

        renderWidgetsList() {
            const listEl = this.mount.querySelector('#gmd-widgets-list');
            if (!listEl) return;

            const standardTemplates = this.getDefaultTemplates();
            const allTemplates = [...(this.customTemplates || []), ...standardTemplates];

            listEl.innerHTML = `
                <div class="gmd-template-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: calc(100vh - 280px); overflow-y: auto;">
                    ${allTemplates.map(t => {
                let previewHTML = '';
                if (t.id === 'tmpl_pk_versus_bar') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #0f172a 0%, #05070f 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 4px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 3px; box-sizing: border-box; position: relative;">
                                    <div style="display: flex; justify-content: space-between; font-size: 5px; color: #ef4444; font-weight: bold; line-height: 1;">
                                        <span>⚔️ PK ĐỎ</span>
                                        <span style="color: #3b82f6;">XANH ⚔️</span>
                                    </div>
                                    <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.6); border-radius: 4px; overflow: hidden; display: flex; box-sizing: border-box;">
                                        <div style="width: 60%; background: #ef4444; height: 100%;"></div>
                                        <div style="width: 40%; background: #3b82f6; height: 100%;"></div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_neon_purple') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:4px;box-sizing:border-box;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 800; color: #fff; line-height: 1;">
                                        <span style="text-shadow: 0 0 4px #ff007f; display: flex; align-items: center; gap: 2px;">🎁 Mở quà</span>
                                        <span style="color: #ff007f; text-shadow: 0 0 4px #ff007f; font-size: 7px;">30%</span>
                                    </div>
                                    <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden; border: 1px solid rgba(255, 0, 127, 0.2); position: relative; box-sizing: border-box;">
                                        <div style="height: 100%; border-radius: 99px; width: 30%; background: linear-gradient(90deg, #ff007f, #a855f7); box-shadow: 0 0 8px #ff007f;"></div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_boss_challenge_gaming') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1f0b0b, #0c0202); border: 1px solid #ef4444; box-shadow: 0 0 10px rgba(239,68,68,0.3); border-radius: 6px; padding: 6px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; font-weight: 900; color: #ff5f5f; line-height: 1;">
                                        <span style="display: flex; align-items: center; gap: 3px; text-shadow: 0 0 4px #ef4444;">🐉 BOSS HP</span>
                                        <span style="color: #ef4444; text-shadow: 0 0 4px #ef4444; font-size: 6px;">35%</span>
                                    </div>
                                    <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 2px; overflow: hidden; border: 1px solid rgba(239, 68, 68, 0.2); position: relative; box-sizing: border-box;">
                                        <div style="height: 100%; width: 35%; background: linear-gradient(90deg, #b91c1c, #ef4444); box-shadow: 0 0 8px #ef4444;"></div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_lucky_mystery_box') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1b0e3d, #080315); border: 1px solid #a855f7; box-shadow: 0 0 10px rgba(168,85,247,0.3); border-radius: 6px; padding: 6px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; box-sizing: border-box;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; font-weight: 800; color: #fbbf24; text-shadow: 0 0 4px #fbbf24; line-height: 1;">
                                        <span>LUCKY BOX</span>
                                        <span style="font-size: 6px; color: #a855f7;">70%</span>
                                    </div>
                                    <div style="width: 100%; height: 5px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden; border: 1px solid rgba(168, 85, 247, 0.2); box-sizing: border-box;">
                                        <div style="height: 100%; width: 70%; background: linear-gradient(90deg, #a855f7, #f43f5e); box-shadow: 0 0 6px #d946ef;"></div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_multi_goal_list' || t.id === 'tmpl_event_mission_board') {
                    const isPurple = t.id === 'tmpl_event_mission_board';
                    const primaryColor = isPurple ? '#8b5cf6' : '#38bdf8';
                    const title = isPurple ? '📋 NHIỆM VỤ LIVE' : '🎯 MỤC TIÊU HÔM NAY';
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, ${isPurple ? '#160e2a' : '#0a172a'}, #05050d); border: 1px solid ${primaryColor}75; box-shadow: 0 0 10px ${primaryColor}40; border-radius: 6px; padding: 4px 6px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 3px; box-sizing: border-box;">
                                    <div style="font-size: 6px; font-weight: 800; color: ${primaryColor}; text-align: center; margin-bottom: 2px;">${title}</div>
                                    <div style="display: flex; flex-direction: column; gap: 2px;">
                                        <div style="display: flex; justify-content: space-between; font-size: 5px; color: #fff; line-height: 1;">
                                            <span style="transform: scale(0.95);">Rose</span><span style="font-size: 5px; opacity:0.85;">30%</span>
                                        </div>
                                        <div style="width: 100%; height: 3px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden;">
                                            <div style="height: 100%; width: 30%; background: ${primaryColor};"></div>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; font-size: 5px; color: #fff; line-height: 1;">
                                            <span style="transform: scale(0.95);">${isPurple ? 'Corgi' : 'TikTok'}</span><span style="font-size: 5px; opacity:0.85;">32%</span>
                                        </div>
                                        <div style="width: 100%; height: 3px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; overflow: hidden;">
                                            <div style="height: 100%; width: 32%; background: ${primaryColor};"></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_top_supporters_board') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1a1508, #050402); border: 1px solid #eab30875; box-shadow: 0 0 10px rgba(234,179,8,0.25); border-radius: 6px; padding: 4px 6px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 3px; box-sizing: border-box;">
                                    <div style="font-size: 6px; font-weight: 900; color: #eab308; text-align: center; margin-bottom: 2px; border-bottom: 1px dashed rgba(234,179,8,0.2); padding-bottom: 1px; line-height: 1;">🏆 TOP SUPPORTERS</div>
                                    <div style="display: flex; flex-direction: column; gap: 2px;">
                                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 5px; color: #fff; background: rgba(255,255,255,0.02); padding: 1px 3px; border-radius: 2px; line-height: 1;">
                                            <span style="color: #eab308; font-weight: bold;">#1</span>
                                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 32px; font-size: 5px;">BH Studio</span>
                                            <span style="color: #eab308; font-size: 5px;">1.2k</span>
                                        </div>
                                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 5px; color: #fff; background: rgba(255,255,255,0.02); padding: 1px 3px; border-radius: 2px; line-height: 1;">
                                            <span style="color: #cbd5e1; font-weight: bold;">#2</span>
                                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 32px; font-size: 5px;">Minh Anh</span>
                                            <span style="color: #888; font-size: 5px;">850</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_combo_boost_popup') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: linear-gradient(135deg, rgba(220,38,38,0.18), rgba(15,23,42,0.88)); border: 1px solid #ef444475; box-shadow: 0 0 10px rgba(239,68,68,0.3); border-radius: 6px; padding: 4px 6px; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; box-sizing: border-box;">
                                    <div style="font-size: 10px; font-weight: 900; color: #ef4444; text-shadow: 0 0 4px #ef4444; line-height: 1;">x88</div>
                                    <div style="font-size: 5px; font-weight: 800; color: #fff; line-height: 1; margin-top: 1px;">🔥 x10 COMBO!</div>
                                    <div style="font-size: 4px; color: #fca5a5; transform: scale(0.9); line-height: 1;">Chuỗi quà liên tiếp!</div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_unlock_reward_board') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, #1b0e35, #070414); border: 1px solid #a855f775; box-shadow: 0 0 10px rgba(168,85,247,0.25); border-radius: 6px; padding: 4px 6px; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 2px; box-sizing: border-box;">
                                    <div style="font-size: 6px; font-weight: 800; color: #fff; text-align: center; line-height: 1; margin-bottom: 1px;">🔒 SẮP MỞ KHÓA</div>
                                    <div style="display: flex; justify-content: space-between; font-size: 5px; color: #a855f7; font-weight: bold; line-height: 1;">
                                        <span style="font-size: 5px;">Rose Goal</span>
                                        <span style="font-size: 5px;">150/500</span>
                                    </div>
                                    <div style="position: relative; width: 100%; height: 4px; background: rgba(0, 0, 0, 0.6); border-radius: 99px; margin-top: 1px;">
                                        <div style="height: 100%; width: 30%; background: linear-gradient(90deg, #a855f7, #fb7185); border-radius: 99px;"></div>
                                    </div>
                                </div>
                            `;
                } else if (t.id === 'tmpl_circular_heart_goal') {
                    previewHTML = `
                                <div class="gmd-mini-widget" style="background: radial-gradient(circle at center, rgba(10,15,30,0.5) 0%, #0a0a14 100%); border: 1px solid #ff007f; box-shadow: 0 0 10px rgba(255,0,127,0.3); border-radius: 6px; padding: 4px; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
                                    <div style="font-size: 6px; font-weight: 900; color: #ff007f; margin-bottom: 2px; line-height: 1;">62%</div>
                                    <div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                        <svg width="26" height="26" viewBox="0 0 26 26" style="transform: rotate(-90deg);">
                                            <circle cx="13" cy="13" r="10" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
                                            <circle cx="13" cy="13" r="10" fill="transparent" stroke="#ff007f" stroke-width="2"
                                                    stroke-dasharray="62.8" stroke-dashoffset="23.8" stroke-linecap="round" />
                                        </svg>
                                        <div style="position: absolute; font-size: 8px;">❤️</div>
                                    </div>
                                    <div style="font-size: 5px; color: #fff; margin-top: 1px; font-weight: bold; transform: scale(0.9); line-height: 1;">MỤC TIÊU</div>
                                </div>
                            `;
                } else {
                    previewHTML = `<div style="font-size: 18px;">📊</div>`;
                }

                const isPremium = Boolean(t.isPremium);
                const priceTag = isPremium ? `${Number(t.price || 0).toLocaleString()}đ` : 'Free';
                const isPlanLocked = this.actualPlanKey === 'free' && t.id !== 'tmpl_neon_purple';

                return `
                            <div class="gmd-template-card" draggable="true" data-template-id="${t.id}" data-plan-locked="${isPlanLocked ? 'true' : 'false'}" style="display: flex; flex-direction: column; gap: 6px; padding: 8px; background: rgba(255, 255, 255, 0.02); border: 1px solid ${isPlanLocked ? 'rgba(245,158,11,.35)' : 'rgba(255, 255, 255, 0.08)'}; border-radius: 8px; cursor: ${isPlanLocked ? 'pointer' : 'grab'}; position:relative;">
                                ${isPlanLocked ? '<span style="position:absolute;right:5px;top:5px;z-index:2;padding:2px 5px;border-radius:5px;background:rgba(15,23,42,.9);color:#fbbf24;font-size:8px;font-weight:900;">🔒 BASIC</span>' : ''}
                                <div class="gmd-template-preview-box" style="width: 100%; height: 60px; background: rgba(0,0,0,0.35); border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 4px; box-sizing: border-box; overflow: hidden;">
                                    ${previewHTML}
                                </div>
                                <div class="gmd-template-info" style="width: 100%;">
                                    <div class="gmd-template-name" style="font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;" title="${t.name}">${t.name}</div>
                                    <div class="gmd-template-meta" style="margin-top: 2px; display: flex; justify-content: space-between; align-items: center;">
                                        <span class="gmd-template-tag" style="font-size: 9px; color: #888;">${t.tag || 'Widget'}</span>
                                        <span style="background: ${isPremium ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)'}; color: ${isPremium ? '#c084fc' : '#10b981'}; font-weight: 800; border-radius: 4px; padding: 1px 4px; font-size: 9px;">${priceTag}</span>
                                    </div>
                                </div>
                            </div>
                        `;
            }).join('')}
                </div>
            `;
        }

        renderAssetsList() {
            const listEl = this.mount.querySelector('#gmd-assets-list');
            if (!listEl) return;

            listEl.innerHTML = this.goalAssets.length ? this.goalAssets.map(a => {
                const isVideo = a.type === 'video' || a.url.endsWith('.webm');
                return `
                    <div class="gmd-asset-card" draggable="true" data-asset-url="${a.url}" data-asset-name="${a.name}" data-asset-type="${a.type}" style="display: flex; flex-direction: column; gap: 4px; padding: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; cursor: grab;">
                        <div class="gmd-asset-preview" style="width: 100%; height: 50px; background: rgba(0,0,0,0.3); border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${isVideo
                        ? `<video src="${this.apiBase}${a.url}" style="width: 100%; height: 100%; object-fit: contain;" autoplay loop muted playsinline></video>`
                        : `<img src="${this.apiBase}${a.url}" style="width: 100%; height: 100%; object-fit: contain;" alt="${a.name}">`
                    }
                        </div>
                        <div class="gmd-asset-name" style="font-size: 10px; text-align: center; color: #aaa; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${a.name}">${a.name}</div>
                    </div>
                `;
            }).join('') : '<div class="gmd-inspector-empty" style="grid-column: 1/-1; height: 80px; padding: 12px; font-size: 11px;">Chưa có tài nguyên.</div>';

            const fileInput = this.mount.querySelector('#gmd-asset-file-input');
            if (fileInput && !fileInput.dataset.bound) {
                fileInput.dataset.bound = 'true';
                fileInput.addEventListener('change', async (e) => {
                    if (e.target.files && e.target.files[0]) {
                        if (this.pendingUploadPlayerIndex !== undefined) {
                            const idx = this.pendingUploadPlayerIndex;
                            delete this.pendingUploadPlayerIndex;
                            const uploadedUrl = await this.uploadPlayerAvatarAsset(e.target.files[0]);
                            if (uploadedUrl) {
                                this.updateGoalBoardPlayerItem(idx, 'customIconUrl', uploadedUrl);
                                this.renderInspector();
                            }
                        } else {
                            this.uploadGoalAsset(e.target.files[0]);
                        }
                    }
                });
            }
        }

        addTemplateToCanvas(templateId, dropX = null, dropY = null) {
            if (this.planKey === 'free' && templateId !== 'tmpl_neon_purple') {
                this.showUpgrade('templates', 'Gói Free chỉ sử dụng mẫu cơ bản. Nâng cấp Basic để mở thêm mẫu.');
                return;
            }
            const templates = this.getDefaultTemplates();
            const allTemplates = [...(this.customTemplates || []), ...templates];
            const tmpl = allTemplates.find(t => t.id === templateId);
            if (!tmpl) return;
            const incomingGoals = this.countGoalTrackers(tmpl.layers);
            if (this.countGoalTrackers() + incomingGoals > this.goalTrackerLimit) {
                this.showUpgrade('goalTrackers', `Gói hiện tại chỉ hỗ trợ ${this.goalTrackerLimit} bảng mục tiêu.`);
                return;
            }

            const baseZ = this.items.length;
            const groupUniqueId = `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
                const uniqueId = `layer_${layer.type}_${Date.now()}_${Math.floor(Math.random() * 1000)}_${idx}`;
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

                const stageCoords = this.logicalToStage(freshLayer);
                freshLayer.x = stageCoords.x;
                freshLayer.y = stageCoords.y;
                freshLayer.width = stageCoords.width;
                freshLayer.height = stageCoords.height;
                freshLayer.w = stageCoords.w;
                freshLayer.h = stageCoords.h;

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

            this.items.push(...newLayers);

            if (newLayers[0]) {
                this.setSelection(newLayers.map(l => l.id), newLayers[0].id);
            }

            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('add-template');
        }

        addAssetToCanvas(assetUrl, assetName, assetType, x = 100, y = 100) {
            if (this.planKey === 'free') {
                this.showUpgrade('menuAssets', 'Nâng cấp Basic để đưa ảnh/video riêng vào menu.');
                return;
            }
            const uniqueId = `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
                zIndex: this.items.length + 1,
                visible: true,
                locked: false
            };

            const stageCoords = this.logicalToStage(newLayer);
            newLayer.x = stageCoords.x;
            newLayer.y = stageCoords.y;
            newLayer.width = stageCoords.width;
            newLayer.height = stageCoords.height;

            this.items.push(newLayer);
            this.setSelection([uniqueId], uniqueId);

            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('add-asset');
        }

        addTextToCanvas(x = 200, y = 200) {
            const uniqueId = `text_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const newLayer = {
                id: uniqueId,
                name: 'Văn bản',
                type: 'text',
                text: 'Nhập văn bản',
                x: Math.round(x),
                y: Math.round(y),
                w: 600,
                h: 120,
                color: '#ffffff',
                fontSize: 36,
                fontWeight: 'bold',
                textShadow: 'none',
                textAlign: 'center',
                zIndex: this.items.length + 1,
                visible: true,
                locked: false
            };

            const stageCoords = this.logicalToStage(newLayer);
            newLayer.x = stageCoords.x;
            newLayer.y = stageCoords.y;
            newLayer.width = stageCoords.width;
            newLayer.height = stageCoords.height;

            this.items.push(newLayer);
            this.setSelection([uniqueId], uniqueId);

            this.renderCanvas();
            this.renderInspector();
            this.pushHistory('add-text');
        }

        async showSaveTemplateModal() {
            if (!this.items.length) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('warning', 'Khong co layer nao de luu thanh mau.');
                }
                return;
            }

            const name = await this.showPromptModal('Nhap ten mau thiet ke:', this.currentLayoutName || 'Gift Menu Template');
            if (name === null) return;

            const safeName = String(name || '').trim() || 'Gift Menu Template';
            const templateId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const layers = this.items.map((item, idx) => {
                const logical = this.stageToLogical(item);
                const layer = {
                    ...item,
                    id: `${templateId}_layer_${idx}`,
                    x: logical.x,
                    y: logical.y,
                    w: logical.w,
                    h: logical.h,
                    width: logical.w,
                    height: logical.h,
                    zIndex: idx + 1
                };
                delete layer.groupId;
                return layer;
            });

            this.customTemplates = Array.isArray(this.customTemplates) ? this.customTemplates : [];
            const newTemplate = {
                id: templateId,
                name: safeName,
                tag: 'Custom',
                category: 'custom',
                tags: ['custom'],
                isPremium: false,
                layers
            };
            this.customTemplates.unshift(newTemplate);
            try {
                let localTemplates = [];
                try { localTemplates = JSON.parse(localStorage.getItem('giftMenuDesignerCustomTemplates') || '[]'); } catch (_parseError) { }
                if (!Array.isArray(localTemplates)) localTemplates = [];
                localTemplates.unshift(newTemplate);
                localStorage.setItem('giftMenuDesignerCustomTemplates', JSON.stringify(localTemplates));
            } catch (_e) {
                this.customTemplates.shift();
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Không đủ dung lượng để lưu mẫu thiết kế trên máy.');
                }
                return;
            }

            if (this.leftPanelTab === 'widgets') {
                this.renderWidgetsList();
            }

            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', 'Mẫu đã được lưu trên máy này.');
            }
        }

        async clearGoalBoard() {
            if (!this.items.length) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('info', 'Canvas hien dang trong.');
                }
                return;
            }

            const confirmed = await this.showConfirmModal('Xoa tat ca layer tren canvas hien tai? Thao tac nay chi ap dung cho ban thiet ke dang mo va chi duoc luu vao database neu ban bam Luu.');
            if (!confirmed) return;

            this.pushHistory('before-clear-board');
            this.items = [];
            this.clearSelection();
            this.renderCanvas();
            this.renderInspector();
            this.renderMyLibrary();
            this.pushHistory('clear-board');

            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', 'Da xoa canvas hien tai. Bam Luu neu muon ghi thay doi nay.');
            }
        }

        async loadGoalAssets() {
            if (!this.token) {
                this.goalAssets = [];
                if (this.leftPanelTab === 'assets') {
                    this.renderAssetsList();
                }
                return;
            }
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/assets`, { headers });
                const data = await res.json();
                this.goalAssets = Array.isArray(data.assets) ? data.assets : [];
                if (this.leftPanelTab === 'assets') {
                    this.renderAssetsList();
                }
            } catch (_e) {
                this.goalAssets = [];
            }
        }

        getGiftLabelBackgroundStyle(item) {
            if (item.showTextBg !== true) return '';
            const style = item.textBgStyle || 'classic';
            const gradientFrom = item.textBgGradientFrom || '#a855f7';
            const gradientTo = item.textBgGradientTo || '#22d3ee';
            let css = '';
            if (style === 'glass') css = 'background:rgba(255,255,255,.05);animation:gmdGlassBreath 4s ease-in-out infinite;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.12);';
            else if (style === 'neon') css = `background-image:linear-gradient(rgba(8,8,12,.94),rgba(8,8,12,.94)),linear-gradient(135deg,${gradientFrom},${gradientTo});background-origin:border-box;background-clip:padding-box,border-box;border:1px solid transparent;--frame-color:${gradientFrom};--glow-soft:color-mix(in srgb,${gradientFrom} 8%,transparent);--glow-bright:color-mix(in srgb,${gradientTo} 22%,transparent);--inner-border-color:color-mix(in srgb,${gradientTo} 50%,white);animation:gmdMagicLiquidMorph 6s ease-in-out infinite,gmdMysticGlow 4s ease-in-out infinite;`;
            else if (style === 'holo') css = 'background:linear-gradient(120deg,rgba(236,72,153,.18) 0%,rgba(56,189,248,.18) 40%,rgba(168,85,247,.18) 70%,rgba(236,72,153,.18) 100%);background-size:250% 100%;animation:gmdTextHoloShift 5s ease infinite;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 12px rgba(0,0,0,.25);';
            else if (style === 'light-sweep' || style === 'dark-matte') css = 'background:linear-gradient(110deg,rgba(15,23,42,.85) 30%,rgba(255,255,255,.28) 50%,rgba(15,23,42,.85) 70%);background-size:200% 100%;animation:gmdTextLightSweep 3s linear infinite;border:1px solid rgba(255,255,255,.1);box-shadow:0 4px 12px rgba(0,0,0,.3);';
            else css = `background:${item.textBgColor || '#000000'};box-shadow:0 2px 6px rgba(0,0,0,.25);`;
            return `${css}padding:3px 8px;border-radius:6px;`;
        }

        async optimizePngUpload(file, maxDimension = 1600) {
            if (!file || !/\.png$/i.test(file.name || '')) return file;
            try {
                const bitmap = await createImageBitmap(file);
                const largest = Math.max(bitmap.width, bitmap.height);
                if (largest <= maxDimension && file.size <= 1024 * 1024) {
                    bitmap.close();
                    return file;
                }
                const scale = Math.min(1, maxDimension / largest);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                const ctx = canvas.getContext('2d', { alpha: true });
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (!blob) return file;
                if (scale === 1 && blob.size >= file.size) return file;
                return new File([blob], file.name, { type: 'image/png', lastModified: Date.now() });
            } catch (_e) {
                return file;
            }
        }

        async uploadGoalAsset(file) {
            if (this.planKey === 'free') {
                this.showUpgrade('menuAssets', 'Nâng cấp Basic để tải ảnh/video riêng vào menu.');
                return;
            }
            if (!file) return;
            const ext = `.${String(file.name || '').split('.').pop().toLowerCase()}`;
            if (!['.png', '.gif', '.webm'].includes(ext) || (file.type && !['image/png', 'image/gif', 'video/webm'].includes(file.type))) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'Chỉ hỗ trợ tài nguyên PNG, GIF và WebM.');
                }
                return;
            }
            if (file.size > 50 * 1024 * 1024) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', 'File phải nhỏ hơn 50 MB trước khi tối ưu.');
                }
                return;
            }
            const uploadFile = await this.optimizePngUpload(file, 1600);
            const formData = new FormData();
            formData.append('assetFile', uploadFile);

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
                        const savedPercent = data.asset?.optimized && data.asset.originalSize
                            ? Math.max(1, Math.round((1 - data.asset.size / data.asset.originalSize) * 100))
                            : 0;
                        window.app.showNotification('success', savedPercent > 0
                            ? `Đã tải lên và giảm khoảng ${savedPercent}% dung lượng.`
                            : 'Đã tải lên tài nguyên mới.');
                    }
                    await this.loadGoalAssets();
                } else {
                    if (this.handlePlanLimit(data, 'menuAssets')) return;
                    throw new Error(data.error || 'Lỗi upload');
                }
            } catch (err) {
                if (window.app && typeof window.app.showNotification === 'function') {
                    window.app.showNotification('error', `Tải lên thất bại: ${err.message}`);
                }
            }
        }

        async loadGoalTemplates() {
            if (!this.token) {
                try {
                    const localTemplates = JSON.parse(localStorage.getItem('giftMenuDesignerCustomTemplates') || '[]');
                    this.customTemplates = Array.isArray(localTemplates) ? localTemplates : [];
                } catch (_e) {
                    this.customTemplates = [];
                }
                if (this.leftPanelTab === 'widgets') {
                    this.renderWidgetsList();
                }
                return;
            }
            try {
                const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/templates`, { headers });
                const data = await res.json();
                let localTemplates = [];
                try { localTemplates = JSON.parse(localStorage.getItem('giftMenuDesignerCustomTemplates') || '[]'); } catch (_e) { }
                if (!Array.isArray(localTemplates)) localTemplates = [];
                const serverTemplates = Array.isArray(data.customTemplates) ? data.customTemplates : [];
                this.customTemplates = [...localTemplates, ...serverTemplates];
                if (this.leftPanelTab === 'widgets') {
                    this.renderWidgetsList();
                }
            } catch (e) {
                console.error('Failed to load custom goal templates:', e);
                try {
                    const localTemplates = JSON.parse(localStorage.getItem('giftMenuDesignerCustomTemplates') || '[]');
                    this.customTemplates = Array.isArray(localTemplates) ? localTemplates : [];
                } catch (_e) {
                    this.customTemplates = [];
                }
            }
        }

        renderGoalBoardInspector() {
            const inspector = this.mount.querySelector('#gmd-inspector');
            if (!inspector) return;

            const selected = this.items.find((x) => x.id === this.selectedId);
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
                inspector.innerHTML = this.renderLayerPanel();
                return;
            }

            if (!selected) {
                inspector.innerHTML = '<div class="gmd-inspector-empty"><i class="fas fa-mouse-pointer"></i><p>Chọn một layer<br>trên canvas để tùy chỉnh</p></div>';
                return;
            }

            const logical = this.stageToLogical(selected);

            if (selected && selected.type === 'goal-bar' && selected.barStyle === 'pk') {
                const players = selected.pkPlayers || [];

                const renderGiftOptionMedia = (gift, url, size, marginRight = 0) => {
                    const style = `width:${size}px;height:${size}px;border-radius:50%;object-fit:contain;${marginRight ? `margin-right:${marginRight}px;` : ''}`;
                    if (gift?.displayMode === 'text') {
                        return `<span class="gmd-text-gift-icon" style="${style}color:${gift.textColor || '#ffffff'};font-size:${Math.max(8, Math.min(size, Number(gift.textSize) || 16))}px;">${this.escapeHtml(gift.displayText || gift.name || gift.id)}</span>`;
                    }
                    if (!url) return '🎁';
                    return this.isVideoAsset(url)
                        ? `<video src="${this.escapeHtml(url)}" style="${style}" autoplay loop muted playsinline></video>`
                        : `<img src="${this.escapeHtml(url)}" style="${style}">`;
                };

                const makeCustomPlayerGiftSelect = (playerIdx, currentId) => {
                    const currentGift = this.gifts.find(g => String(g.id) === String(currentId)) || this.gifts[0] || { id: '', name: 'Chọn quà', icon: '' };
                    const currentIcon = this.normalizeIcon(currentGift.icon || '');
                    return `
                        <div class="gmd-custom-select" style="margin-top: 4px;">
                            <div class="gmd-custom-select-header" onclick="this.nextElementSibling.classList.toggle('show')" style="font-size: 11px; padding: 4px 6px; height: 26px;">
                                ${renderGiftOptionMedia(currentGift, currentIcon, 16, 4)}
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;">${currentGift.name || currentGift.id}</span>
                                <i class="fas fa-chevron-down" style="margin-left: auto; font-size: 9px; opacity: 0.7;"></i>
                            </div>
                            <div class="gmd-custom-select-options">
                                ${this.gifts.map(g => {
                        const gIcon = this.normalizeIcon(g.icon || '');
                        return `
                                        <div class="gmd-custom-select-option ${String(g.id) === String(currentId) ? 'active' : ''}" onclick="window.giftMenuDesigner.updateGoalBoardPlayerItem(${playerIdx}, 'giftId', '${g.id}'); window.giftMenuDesigner.updateGoalBoardPlayerItem(${playerIdx}, 'giftName', '${g.name || g.id}'); window.giftMenuDesigner.renderInspector();" style="font-size: 11px; padding: 4px;">
                                            ${renderGiftOptionMedia(g, gIcon, 16)}
                                            <span style="margin-left: 4px;">${g.name || g.id}</span>
                                        </div>
                                    `;
                    }).join('')}
                            </div>
                        </div>
                    `;
                };

                const teamsHTML = players.map((p, idx) => {
                    const isExpanded = !!(this.expandedTeams && this.expandedTeams[idx]);
                    return `
                    <div class="gmd-section-subcard" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 8px; border-radius: 8px; margin-bottom: 6px;">
                        <div style="font-size: 11px; font-weight: bold; color: ${p.color}; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; padding: 2px 0;" onclick="window.giftMenuDesigner.toggleInspectorTeam(${idx})">
                            <span>ĐỘI ${idx + 1}: ${this.escapeHtml(p.name || `Đội ${idx + 1}`)}</span>
                            <i class="fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                        </div>
                        
                        <div style="display: ${isExpanded ? 'block' : 'none'}; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 6px;">
                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Tên đội</label>
                                <input class="gmd-input gmd-input-compact" type="text" data-player-index="${idx}" data-player-key="name" value="${p.name || ''}" style="font-size: 11px; height: 24px; padding: 2px 6px;">
                            </div>
                            
                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Màu đội</label>
                                <input class="gmd-color" type="color" data-player-index="${idx}" data-player-key="color" value="${p.color || '#ef4444'}" style="height: 24px; padding: 0;">
                            </div>

                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Quà tính điểm</label>
                                ${makeCustomPlayerGiftSelect(idx, p.giftId)}
                            </div>

                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Điểm hiện tại</label>
                                <input class="gmd-input gmd-input-compact" type="number" data-player-index="${idx}" data-player-key="score" value="${p.score || 0}" style="font-size: 11px; height: 24px; padding: 2px 6px;">
                            </div>

                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Ảnh đại diện</label>
                                <select class="gmd-select" data-player-index="${idx}" data-player-key="iconMode" style="font-size: 11px; height: 24px; padding: 2px 4px;">
                                    <option value="preset" ${p.iconMode === 'preset' ? 'selected' : ''}>Khiên mặc định</option>
                                    <option value="upload" ${p.iconMode === 'upload' ? 'selected' : ''}>Tải ảnh lên</option>
                                    <option value="gift" ${p.iconMode === 'gift' ? 'selected' : ''}>Icon quà tặng</option>
                                </select>
                            </div>

                            ${p.iconMode === 'preset' ? `
                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Linh vật</label>
                                <select class="gmd-select" data-player-index="${idx}" data-player-key="iconPreset" style="font-size: 11px; height: 24px; padding: 2px 4px;">
                                    <option value="lion" ${p.iconPreset === 'lion' ? 'selected' : ''}>Sư tử (Lion)</option>
                                    <option value="wolf" ${p.iconPreset === 'wolf' ? 'selected' : ''}>Sói (Wolf)</option>
                                    <option value="crown" ${p.iconPreset === 'crown' ? 'selected' : ''}>Vương miện (Crown)</option>
                                    <option value="star" ${p.iconPreset === 'star' ? 'selected' : ''}>Ngôi sao (Star)</option>
                                </select>
                            </div>
                            ` : ''}

                            ${p.iconMode === 'upload' ? `
                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Ảnh đã tải</label>
                                <div style="display: flex; gap: 4px; align-items: center;">
                                    <input class="gmd-input gmd-input-compact" type="text" data-player-index="${idx}" data-player-key="customIconUrl" value="${p.customIconUrl || ''}" placeholder="URL ảnh" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.triggerPlayerAvatarUpload(${idx})" style="padding: 2px 6px; font-size: 11px; height: 24px;"><i class="fas fa-upload"></i></button>
                                </div>
                            </div>
                            ` : ''}

                            <div class="gmd-field" style="margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Viền Avatar</label>
                                <select class="gmd-select" data-player-index="${idx}" data-player-key="avatarBorder" style="font-size: 11px; height: 24px; padding: 2px 4px; width: 100%;">
                                    <option value="" ${!p.avatarBorder ? 'selected' : ''}>Không dùng viền</option>
                                    <option value="vien-1" ${p.avatarBorder === 'vien-1' ? 'selected' : ''}>Viền 1 (Vàng sáng)</option>
                                    <option value="vien-2" ${p.avatarBorder === 'vien-2' ? 'selected' : ''}>Viền 2 (Hồng ngọc)</option>
                                    <option value="vien-3" ${p.avatarBorder === 'vien-3' ? 'selected' : ''}>Viền 3 (Neon Tím)</option>
                                    <option value="vien-4" ${p.avatarBorder === 'vien-4' ? 'selected' : ''}>Viền 4 (Esport Xanh)</option>
                                </select>
                            </div>

                            <!-- Hiệu ứng ảnh đại diện cho đội -->
                            <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px;">
                                <div style="font-size: 10px; font-weight: bold; color: #a855f7; margin-bottom: 6px;"><i class="fas fa-sparkles"></i> HIỆU ỨNG ẢNH ĐẠI DIỆN</div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Hiệu ứng nền (Aura)</label>
                                    <select class="gmd-select" data-player-index="${idx}" data-player-key="auraType" style="font-size: 11px; height: 24px; padding: 2px 4px; width: 100%;">
                                        <option value="" ${!p.auraType ? 'selected' : ''}>Không có</option>
                                        <option value="Glow" ${p.auraType === 'Glow' ? 'selected' : ''}>Glow (Phát sáng)</option>
                                        <option value="Bubble" ${p.auraType === 'Bubble' ? 'selected' : ''}>Bubble (Bong bóng)</option>
                                        <option value="Magic Ring" ${p.auraType === 'Magic Ring' ? 'selected' : ''}>Magic Ring</option>
                                        <option value="Neon Frame" ${p.auraType === 'Neon Frame' ? 'selected' : ''}>Neon Frame</option>
                                        <option value="Light Sweep" ${p.auraType === 'Light Sweep' ? 'selected' : ''}>Light Sweep</option>
                                        <option value="Fire Aura" ${p.auraType === 'Fire Aura' ? 'selected' : ''}>Fire Aura (Lửa)</option>
                                        <option value="Electric Aura" ${p.auraType === 'Electric Aura' ? 'selected' : ''}>Electric Aura (Điện)</option>
                                    </select>
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Tốc độ Aura</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-player-index="${idx}" data-player-key="auraSpeed" value="${p.auraSpeed || 1}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">s</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="0.2" max="8" step="0.1" data-player-index="${idx}" data-player-key="auraSpeed" value="${p.auraSpeed || 1}" style="width: 100%;">
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Kích thước Aura</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="0.6" max="1.8" step="0.05" data-player-index="${idx}" data-player-key="auraScale" value="${p.auraScale || 1}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">x</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="0.6" max="1.8" step="0.05" data-player-index="${idx}" data-player-key="auraScale" value="${p.auraScale || 1}" style="width: 100%;">
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Màu Aura</label>
                                    <div style="display: flex; gap: 4px; align-items: center;">
                                        <input class="gmd-input gmd-input-compact" data-player-index="${idx}" data-player-key="auraColor" value="${p.auraColor || p.color || '#d7b2ff'}" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                        <input class="gmd-color" type="color" data-player-index="${idx}" data-player-key="auraColor" value="${p.auraColor || p.color || '#d7b2ff'}" style="width: 24px; height: 24px; padding: 0;">
                                    </div>
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Hình dáng Aura</label>
                                    <select class="gmd-select" data-player-index="${idx}" data-player-key="auraShape" style="font-size: 11px; height: 24px; padding: 2px 4px; width: 100%;">
                                        <option value="Circle" ${p.auraShape === 'Circle' || !p.auraShape ? 'selected' : ''}>Tròn</option>
                                        <option value="Square" ${p.auraShape === 'Square' ? 'selected' : ''}>Vuông</option>
                                        <option value="Hexagon" ${p.auraShape === 'Hexagon' ? 'selected' : ''}>Lục giác</option>
                                        <option value="Star" ${p.auraShape === 'Star' ? 'selected' : ''}>Ngôi sao</option>
                                        <option value="Oval" ${p.auraShape === 'Oval' ? 'selected' : ''}>Oval</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Tùy chỉnh vị trí và cỡ chữ riêng biệt cho đội -->
                            <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px;">
                                <div style="font-size: 10px; font-weight: bold; color: #a855f7; margin-bottom: 6px;"><i class="fas fa-text-height"></i> CHỮ & VỊ TRÍ RIÊNG</div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Cỡ chữ Tên đội</label>
                                    <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="12" max="64" data-player-index="${idx}" data-player-key="fontSize" value="${p.fontSize || 30}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">px</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="12" max="64" data-player-index="${idx}" data-player-key="fontSize" value="${p.fontSize || 30}" style="width: 100%;">
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Cỡ chữ Điểm số</label>
                                    <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="14" max="80" data-player-index="${idx}" data-player-key="scoreFontSize" value="${p.scoreFontSize || 36}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">px</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="14" max="80" data-player-index="${idx}" data-player-key="scoreFontSize" value="${p.scoreFontSize || 36}" style="width: 100%;">
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Dịch ngang</label>
                                    <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="-150" max="150" data-player-index="${idx}" data-player-key="headerOffsetX" value="${p.headerOffsetX !== undefined ? p.headerOffsetX : 0}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">px</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="-150" max="150" data-player-index="${idx}" data-player-key="headerOffsetX" value="${p.headerOffsetX !== undefined ? p.headerOffsetX : 0}" style="width: 100%;">
                                </div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Dịch dọc</label>
                                    <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                        <input class="gmd-input gmd-input-compact" type="number" min="-100" max="100" data-player-index="${idx}" data-player-key="headerOffsetY" value="${p.headerOffsetY !== undefined ? p.headerOffsetY : 0}" style="font-size: 11px; height: 24px; padding: 2px 6px; flex: 1;">
                                        <span style="font-size: 11px;">px</span>
                                    </div>
                                    <input class="gmd-range" type="range" min="-100" max="100" data-player-index="${idx}" data-player-key="headerOffsetY" value="${p.headerOffsetY !== undefined ? p.headerOffsetY : 0}" style="width: 100%;">
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                const simulatorHTML = `
                    <div style="border: 1px dashed rgba(139,92,246,0.3); background: rgba(139,92,246,0.05); padding: 10px; border-radius: 8px; margin-top: 10px;">
                        <div style="font-size: 11px; font-weight: bold; color: #a855f7; margin-bottom: 4px;"><i class="fas fa-flask"></i> GIẢ LẬP KIỂM THỬ</div>
                        <p style="font-size: 9px; color: #cbd5e1; margin: 0 0 8px 0; line-height: 1.2;">Cộng điểm giả lập để kiểm tra thanh co giãn trên Canva.</p>
                        ${players.map((p, idx) => `
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-size: 10px; font-weight: 700; color: ${p.color}; width: 80px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${p.name}</span>
                                <div style="display: flex; gap: 4px;">
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.testPkPlayerScore(${idx}, 10000)" style="padding: 2px 6px; font-size: 9px; height: 20px;">+10K</button>
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.testPkPlayerScore(${idx}, 50000)" style="padding: 2px 6px; font-size: 9px; height: 20px;">+50K</button>
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.testPkPlayerScore(${idx}, 100000)" style="padding: 2px 6px; font-size: 9px; height: 20px;">+100K</button>
                                </div>
                            </div>
                        `).join('')}
                        <button class="gmd-btn" onclick="window.giftMenuDesigner.resetPkScores()" style="width: 100%; font-size: 10px; height: 24px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; margin-top: 4px;"><i class="fas fa-undo"></i> Reset điểm</button>
                    </div>
                `;

                inspector.innerHTML = `
                    <div class="gmd-selected-card">
                        <div style="font-size: 20px;">⚔️</div>
                        <input class="gmd-title-input" data-goal-key="name" value="${this.escapeHtml(selected.name)}">
                        <button class="gmd-delete-btn" data-action="delete"><i class="fas fa-trash"></i></button>
                    </div>
                    
                    <!-- PHẦN 1: KÍCH THƯỚC & VỊ TRÍ -->
                    <div class="gmd-section">
                        <h4 style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" onclick="window.giftMenuDesigner.toggleInspectorSize()">
                            <span><i class="fas fa-ruler-combined"></i> PHẦN 1: KÍCH THƯỚC & VỊ TRÍ</span>
                            <i class="fas ${this.inspectorSizeExpanded !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                        </h4>
                        <div style="display: ${this.inspectorSizeExpanded !== false ? 'block' : 'none'};">
                            <div class="gmd-field"><label>Vị trí X / Y (Logical)</label></div>
                            <div class="gmd-row">
                                <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="x" value="${logical.x}"><span>px</span></div>
                                <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="y" value="${logical.y}"><span>px</span></div>
                            </div>
                            <div class="gmd-row" style="margin-top: 8px;">
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                        <label style="margin: 0; font-size: 11px;">Rộng (W)</label>
                                        <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 80px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="w" value="${logical.w}"><span>px</span></div>
                                    </div>
                                    <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="100" max="1080" data-goal-key="w" value="${logical.w}">
                                </div>
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                        <label style="margin: 0; font-size: 11px;">Cao (H)</label>
                                        <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 80px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="h" value="${logical.h}"><span>px</span></div>
                                    </div>
                                    <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="30" max="1920" data-goal-key="h" value="${logical.h}">
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
                        </div>
                    </div>
                    
                    <!-- PHẦN 2: TÍNH NĂNG NÂNG CAO -->
                    <div class="gmd-section">
                        <h4 style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" onclick="window.giftMenuDesigner.toggleInspectorAdvanced()">
                            <span><i class="fas fa-crown"></i> PHẦN 2: TÍNH NĂNG NÂNG CAO</span>
                            <i class="fas ${this.inspectorAdvancedExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                        </h4>
                        <div style="display: ${this.inspectorAdvancedExpanded ? 'block' : 'none'};">
                            <!-- CẤU HÌNH CHUNG -->
                            <div class="gmd-section-subheader" style="font-weight: 800; font-size: 11px; color: #a855f7; margin-bottom: 6px; margin-top: 6px;">CẤU HÌNH CHUNG</div>
                            <div class="gmd-field">
                                <label style="font-size: 11px;">Số đội PK</label>
                                <div style="display:flex; gap:6px;">
                                    <button class="gmd-btn ${selected.teamCount === 2 || !selected.teamCount ? 'active' : ''}" onclick="window.giftMenuDesigner.changePkTeamCount(2)" style="flex:1; height:26px; font-size:11px; padding:2px;">2 Đội</button>
                                    <button class="gmd-btn ${selected.teamCount === 3 ? 'active' : ''}" onclick="window.giftMenuDesigner.changePkTeamCount(3)" style="flex:1; height:26px; font-size:11px; padding:2px;">3 Đội</button>
                                    <button class="gmd-btn ${selected.teamCount === 4 ? 'active' : ''}" onclick="window.giftMenuDesigner.changePkTeamCount(4)" style="flex:1; height:26px; font-size:11px; padding:2px;">4 Đội</button>
                                </div>
                            </div>
                            
                            <div class="gmd-field" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Mẫu Preset</label>
                                <select class="gmd-select" data-goal-key="presetStyle" style="font-size: 11px; height: 26px; padding: 2px 4px;">
                                    <option value="esport" ${selected.presetStyle === 'esport' ? 'selected' : ''}>Esport</option>
                                    <option value="neon" ${selected.presetStyle === 'neon' ? 'selected' : ''}>Neon</option>
                                    <option value="royal" ${selected.presetStyle === 'royal' ? 'selected' : ''}>Royal</option>
                                    <option value="cute" ${selected.presetStyle === 'cute' ? 'selected' : ''}>Cute</option>
                                    <option value="minimal" ${selected.presetStyle === 'minimal' ? 'selected' : ''}>Minimal</option>
                                    ${selected.teamCount === 2 || !selected.teamCount ? `<option value="fire_vs_ice" ${selected.presetStyle === 'fire_vs_ice' ? 'selected' : ''}>Fire vs Ice</option>` : ''}
                                </select>
                            </div>
                            
                            <div class="gmd-field" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Hiệu ứng chạy thanh PK</label>
                                <select class="gmd-select" data-goal-key="pkBarAnimation" style="font-size: 11px; height: 26px; padding: 2px 4px;">
                                    <option value="none" ${selected.pkBarAnimation === 'none' || !selected.pkBarAnimation ? 'selected' : ''}>Không có hiệu ứng</option>
                                    <option value="glass-sweep" ${selected.pkBarAnimation === 'glass-sweep' ? 'selected' : ''}>Quét sáng mặt kính (Glass Sweep)</option>
                                    <option value="stripes" ${selected.pkBarAnimation === 'stripes' ? 'selected' : ''}>Vệt sọc năng lượng chạy (Stripes)</option>
                                    <option value="divider-glow" ${selected.pkBarAnimation === 'divider-glow' ? 'selected' : ''}>Đường phân tách phát sáng (Divider Glow)</option>
                                    <option value="electric" ${selected.pkBarAnimation === 'electric' ? 'selected' : ''}>Viền điện chạy tuần hoàn (Neon Flow)</option>
                                    <option value="electric-arc" ${selected.pkBarAnimation === 'electric-arc' ? 'selected' : ''}>Viền tia sét chớp giật (Lightning Arcs)</option>
                                    <option value="glass-divider" ${selected.pkBarAnimation === 'glass-divider' ? 'selected' : ''}>Phối hợp Quét sáng + Phân tách</option>
                                    <option value="electric-glass-divider" ${selected.pkBarAnimation === 'electric-glass-divider' ? 'selected' : ''}>Kết hợp Viền điện + Quét sáng + Phân tách</option>
                                    <option value="lightning-glass-divider" ${selected.pkBarAnimation === 'lightning-glass-divider' ? 'selected' : ''}>Kết hợp Tia sét + Quét sáng + Phân tách</option>
                                </select>
                            </div>

                            <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Tùy chỉnh màu viền PK</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-goal-key="useCustomPkBorderColor" ${selected.useCustomPkBorderColor ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>
                            
                            ${selected.useCustomPkBorderColor ? `
                            <div class="gmd-field" style="margin-top: 6px; margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Màu viền PK 1 (Đỏ/Glow chính)</label>
                                <div style="display: flex; gap: 4px; align-items: center;">
                                    <input class="gmd-input gmd-input-compact" data-goal-key="pkBorderColor1" value="${selected.pkBorderColor1 || '#ff003c'}" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                    <input class="gmd-color" type="color" data-goal-key="pkBorderColor1" value="${selected.pkBorderColor1 || '#ff003c'}" style="width: 24px; height: 24px; padding: 0;">
                                </div>
                            </div>
                            <div class="gmd-field" style="margin-top: 4px; margin-bottom: 4px;">
                                <label style="font-size: 9px; margin-bottom: 2px;">Màu viền PK 2 (Xanh/Glow phụ)</label>
                                <div style="display: flex; gap: 4px; align-items: center;">
                                    <input class="gmd-input gmd-input-compact" data-goal-key="pkBorderColor2" value="${selected.pkBorderColor2 || '#00f0ff'}" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                    <input class="gmd-color" type="color" data-goal-key="pkBorderColor2" value="${selected.pkBorderColor2 || '#00f0ff'}" style="width: 24px; height: 24px; padding: 0;">
                                </div>
                            </div>
                            ` : ''}
                            
                            <div class="gmd-field" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Hiệu ứng Loop đội dẫn đầu</label>
                                <select class="gmd-select" data-goal-key="animationType" style="font-size: 11px; height: 26px; padding: 2px 4px;">
                                    <option value="None" ${selected.animationType === 'None' || !selected.animationType ? 'selected' : ''}>Không có</option>
                                    <option value="Pulse" ${selected.animationType === 'Pulse' ? 'selected' : ''}>Pulse (Đập)</option>
                                    <option value="Bounce" ${selected.animationType === 'Bounce' ? 'selected' : ''}>Bounce (Nẩy)</option>
                                    <option value="Float" ${selected.animationType === 'Float' ? 'selected' : ''}>Float (Bay)</option>
                                    <option value="Zoom" ${selected.animationType === 'Zoom' ? 'selected' : ''}>Zoom (Phóng)</option>
                                    <option value="Shake" ${selected.animationType === 'Shake' ? 'selected' : ''}>Shake (Rung)</option>
                                </select>
                            </div>
                            
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Tốc độ Loop đội dẫn đầu</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" step="0.1" data-goal-key="animationSpeed" value="${selected.animationSpeed || 1}"><span>s</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="0.2" max="8" step="0.1" data-goal-key="animationSpeed" value="${selected.animationSpeed || 1}">
                            </div>

                            <!-- CẤU HÌNH ĐỘI -->
                            <div class="gmd-section-subheader" style="font-weight: 800; font-size: 11px; color: #a855f7; margin-bottom: 6px; margin-top: 10px;">CẤU HÌNH ĐỘI BÓNG / ĐẤU THỦ</div>
                            <div class="gmd-pk-players-editor">
                                ${teamsHTML}
                            </div>

                            <!-- TÙY CHỈNH CHỮ -->
                            <div class="gmd-section-subheader" style="font-weight: 800; font-size: 11px; color: #a855f7; margin-bottom: 6px; margin-top: 10px;">TÙY CHỈNH CHỮ (FONTS)</div>
                            <div class="gmd-field">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Cỡ chữ Tên đội</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="fontSize" value="${selected.fontSize || 30}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="12" max="64" data-goal-key="fontSize" value="${selected.fontSize || 30}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Cỡ chữ Điểm số</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="scoreFontSize" value="${selected.scoreFontSize || 36}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="14" max="80" data-goal-key="scoreFontSize" value="${selected.scoreFontSize || 36}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Cỡ chữ Đếm ngược</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="timerFontSize" value="${selected.timerFontSize || 24}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="10" max="48" data-goal-key="timerFontSize" value="${selected.timerFontSize || 24}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Độ dày thanh PK</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="barHeight" value="${selected.barHeight || 32}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="16" max="80" data-goal-key="barHeight" value="${selected.barHeight || 32}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Màu chữ Tên đội</label>
                                <select class="gmd-select" data-goal-key="pkNameColorMode" style="font-size: 11px; height: 26px; padding: 2px 4px;">
                                    <option value="white" ${selected.pkNameColorMode === 'white' ? 'selected' : ''}>Màu trắng thanh lịch (Khuyên dùng)</option>
                                    <option value="team" ${selected.pkNameColorMode === 'team' ? 'selected' : ''}>Màu đại diện của Đội</option>
                                </select>
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Màu chữ Điểm số</label>
                                <select class="gmd-select" data-goal-key="pkScoreColorMode" style="font-size: 11px; height: 26px; padding: 2px 4px;">
                                    <option value="white" ${selected.pkScoreColorMode === 'white' ? 'selected' : ''}>Màu trắng thanh lịch (Khuyên dùng)</option>
                                    <option value="team" ${selected.pkScoreColorMode === 'team' ? 'selected' : ''}>Màu đại diện của Đội</option>
                                </select>
                            </div>

                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Dịch ngang thông tin đội</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="headerOffsetX" value="${selected.headerOffsetX !== undefined ? selected.headerOffsetX : 0}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="-150" max="150" data-goal-key="headerOffsetX" value="${selected.headerOffsetX !== undefined ? selected.headerOffsetX : 0}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Dịch dọc thông tin đội</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="headerOffsetY" value="${selected.headerOffsetY !== undefined ? selected.headerOffsetY : 0}"><span>px</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="-100" max="100" data-goal-key="headerOffsetY" value="${selected.headerOffsetY !== undefined ? selected.headerOffsetY : 0}">
                            </div>
                            <div class="gmd-field" style="margin-top: 6px; margin-bottom: 10px;">
                                <label style="font-size: 11px;">URL Vương miện dẫn đầu (.webm / .gif / .png)</label>
                                <input class="gmd-input" type="text" data-goal-key="customCrownUrl" value="${selected.customCrownUrl || ''}" placeholder="Mặc định 👑 (Để trống)" style="font-size: 11px; height: 26px; padding: 2px 6px;">
                                <div style="font-size: 9px; color: #888; margin-top: 2px; line-height: 1.2;">Bỏ trống dùng 👑 mặc định. Bạn có thể copy file webm vào thư mục backend/assets/goal/ và nhập: /assets/goal/ten_file.webm</div>
                            </div>

                            <!-- CÀI ĐẶT MỤC TIÊU COINS & TIMER -->
                            <div class="gmd-section-subheader" style="font-weight: 800; font-size: 11px; color: #a855f7; margin-bottom: 6px; margin-top: 10px;">CÀI ĐẶT MỤC TIÊU (COINS)</div>
                            <div class="gmd-field">
                                <label style="font-size: 11px;">Mục tiêu Xu (Coins)</label>
                                <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 30000000}" style="font-size: 11px; height: 26px; padding: 2px 6px;">
                            </div>

                            <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Ẩn nền bảng PK (Trong suốt)</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-goal-key="hideBg" ${selected.hideBg !== false ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>

                            ${selected.hideBg === false ? `
                            <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Tùy chỉnh màu nền</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-goal-key="useCustomBg" ${selected.useCustomBg ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>
                            ${selected.useCustomBg && !selected.useCustomBgGradient ? `
                            <div class="gmd-field" style="margin-top: 4px;">
                                <label style="font-size: 11px;">Màu nền đơn</label>
                                <input class="gmd-color" type="color" data-goal-key="bgColor" value="${selected.bgColor || '#0f172a'}">
                            </div>
                            ` : ''}

                            <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Nền màu Gradient</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-goal-key="useCustomBgGradient" ${selected.useCustomBgGradient ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>
                            ${selected.useCustomBgGradient ? `
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;">
                                <div class="gmd-field" style="margin: 0;">
                                    <label style="font-size: 11px;">Màu đầu</label>
                                    <input class="gmd-color" type="color" data-goal-key="bgColorGradientFrom" value="${selected.bgColorGradientFrom || '#1e1b4b'}">
                                </div>
                                <div class="gmd-field" style="margin: 0;">
                                    <label style="font-size: 11px;">Màu cuối</label>
                                    <input class="gmd-color" type="color" data-goal-key="bgColorGradientTo" value="${selected.bgColorGradientTo || '#311042'}">
                                </div>
                            </div>
                            <div class="gmd-field" style="margin-top: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                    <label style="margin: 0; font-size: 11px;">Góc xoay Gradient</label>
                                    <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 60px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="bgColorGradientAngle" value="${selected.bgColorGradientAngle !== undefined ? selected.bgColorGradientAngle : 135}"><span>°</span></div>
                                </div>
                                <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="0" max="360" data-goal-key="bgColorGradientAngle" value="${selected.bgColorGradientAngle !== undefined ? selected.bgColorGradientAngle : 135}">
                            </div>
                            ` : ''}
                            ` : ''}

                            <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                <label style="font-size: 11px;">Hiển thị thời gian PK</label>
                                <label class="gmd-switch">
                                    <input type="checkbox" data-goal-key="showTimer" ${selected.showTimer ? 'checked' : ''}>
                                    <span></span>
                                </label>
                            </div>

                            ${selected.showTimer ? `
                            <div class="gmd-field" style="margin-top: 4px;">
                                <label style="font-size: 11px;">Thời gian đếm ngược</label>
                                <input class="gmd-input" type="text" data-goal-key="timerDuration" value="${selected.timerDuration || '00:20:00'}" placeholder="hh:mm:ss" style="font-size: 11px; height: 26px; padding: 2px 6px;">
                            </div>
                            <div class="gmd-field" style="margin-top: 4px; display: flex; gap: 4px;">
                                ${selected.timerRunning ? `
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.toggleTimerRunning(false)" style="flex: 1; height: 26px; font-size: 11px; padding: 2px 4px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); cursor: pointer;"><i class="fas fa-pause"></i> Tạm dừng</button>
                                ` : `
                                    <button class="gmd-btn" onclick="window.giftMenuDesigner.toggleTimerRunning(true)" style="flex: 1; height: 26px; font-size: 11px; padding: 2px 4px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); cursor: pointer;"><i class="fas fa-play"></i> Bắt đầu</button>
                                `}
                                <button class="gmd-btn" onclick="window.giftMenuDesigner.resetTimer()" style="flex: 1; height: 26px; font-size: 11px; padding: 2px 4px; background: rgba(255, 255, 255, 0.05); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;"><i class="fas fa-undo"></i> Đặt lại</button>
                            </div>
                            ` : ''}



                            ${simulatorHTML}
                        </div>
                    </div>
                `;
                return;
            }



            let testButtonHTML = '';
            if (['goal-bar', 'goal-circle', 'boss-bar', 'mystery-chests', 'goal-list', 'top-contributors', 'podium-contributors', 'combo'].includes(selected.type)) {
                testButtonHTML = `
                    <div class="gmd-section" style="border: 1px dashed rgba(139,92,246,0.3); background: rgba(139,92,246,0.05); padding: 12px; border-radius: 12px; margin-bottom: 12px;">
                        <h4 style="color: #a855f7; margin-bottom: 6px;"><i class="fas fa-flask"></i> CHẠY THỬ / TEST GOAL</h4>
                        <p style="font-size: 10px; color: #cbd5e1; margin: 0 0 10px 0; line-height: 1.3;">Mô phỏng chỉ hiển thị trong app để kiểm tra giao diện. OBS chỉ cập nhật khi nhận quà thật từ TikTok Live.</p>
                        <div style="display: flex; gap: 8px;">
                            <button class="gmd-btn primary" style="flex: 1; font-size: 11px; background: #8b5cf6; padding: 6px 12px; height: 32px;" onclick="window.giftMenuDesigner.sendSimulatedGift('${selected.id}')"><i class="fas fa-play"></i> Gửi quà Test</button>
                            <button class="gmd-btn" style="flex: 1; font-size: 11px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 6px 12px; height: 32px;" onclick="window.giftMenuDesigner.resetGoalBoardItem('${selected.id}')"><i class="fas fa-undo"></i> Reset lại đầu</button>
                        </div>
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

            const renderGiftOptionMedia = (gift, url, size, marginRight = 0) => {
                const style = `width:${size}px;height:${size}px;border-radius:50%;object-fit:contain;${marginRight ? `margin-right:${marginRight}px;` : ''}`;
                if (gift?.displayMode === 'text') {
                    return `<span class="gmd-text-gift-icon" style="${style}color:${gift.textColor || '#ffffff'};font-size:${Math.max(8, Math.min(size, Number(gift.textSize) || 16))}px;">${this.escapeHtml(gift.displayText || gift.name || gift.id)}</span>`;
                }
                if (!url) return '🎁';
                return this.isVideoAsset(url)
                    ? `<video src="${this.escapeHtml(url)}" style="${style}" autoplay loop muted playsinline></video>`
                    : `<img src="${this.escapeHtml(url)}" style="${style}">`;
            };

            const makeCustomGiftSelect = (label, currentId) => {
                const currentGift = this.gifts.find(g => String(g.id) === String(currentId)) || this.gifts[0] || { id: '', name: 'Chọn quà', icon: '' };
                const currentIcon = this.normalizeIcon(currentGift.icon || '');
                return `
                    <div class="gmd-field">
                        <label>${label}</label>
                        <div class="gmd-custom-select">
                            <div class="gmd-custom-select-header" onclick="this.nextElementSibling.classList.toggle('show')">
                                ${renderGiftOptionMedia(currentGift, currentIcon, 20, 8)}
                                <span>${currentGift.name || currentGift.id}</span>
                                <i class="fas fa-chevron-down" style="margin-left: auto; font-size: 10px; opacity: 0.7;"></i>
                            </div>
                            <div class="gmd-custom-select-options">
                                ${this.gifts.map(g => {
                    const gIcon = this.normalizeIcon(g.icon || '');
                    return `
                                        <div class="gmd-custom-select-option ${String(g.id) === String(currentId) ? 'active' : ''}" onclick="window.giftMenuDesigner.updateGoalBoardSelectedItem('giftId', '${g.id}'); window.giftMenuDesigner.renderInspector();">
                                            ${renderGiftOptionMedia(g, gIcon, 20)}
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

            const makeCustomGiftSelectForGoal = (goalIdx, currentId) => {
                const currentGift = this.gifts.find(g => String(g.id) === String(currentId)) || this.gifts[0] || { id: '', name: 'Chọn quà', icon: '' };
                const currentIcon = this.normalizeIcon(currentGift.icon || '');
                return `
                    <div class="gmd-custom-select" style="grid-column: 1;">
                        <div class="gmd-custom-select-header" style="height: 32px; padding: 4px 8px;" onclick="this.nextElementSibling.classList.toggle('show')">
                            ${renderGiftOptionMedia(currentGift, currentIcon, 16, 4)}
                            <span style="font-size: 10px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:55px;">${currentGift.name || currentGift.id}</span>
                        </div>
                        <div class="gmd-custom-select-options">
                            ${this.gifts.map(g => {
                    const gIcon = this.normalizeIcon(g.icon || '');
                    return `
                                    <div class="gmd-custom-select-option ${String(g.id) === String(currentId) ? 'active' : ''}" style="padding: 4px 6px; font-size: 11px;" onclick="window.giftMenuDesigner.updateGoalListItem(${goalIdx}, 'giftId', '${g.id}'); this.parentElement.classList.remove('show'); window.giftMenuDesigner.renderInspector();">
                                        ${renderGiftOptionMedia(g, gIcon, 16)}
                                        <span>${g.name || g.id}</span>
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
            };

            let specificConfigHTML = '';

            if (selected.type === 'gift-stack-group') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-layer-group"></i> NHOM QUA</h4>
                        <div class="gmd-field">
                            <label>Huong sap xep</label>
                            <select class="gmd-select" data-goal-key="layoutDirection">
                                <option value="vertical" ${selected.layoutDirection !== 'horizontal' ? 'selected' : ''}>Doc</option>
                                <option value="horizontal" ${selected.layoutDirection === 'horizontal' ? 'selected' : ''}>Ngang</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Khoang cach qua</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="120" data-goal-key="gap" value="${selected.gap !== undefined ? selected.gap : 10}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="80" data-goal-key="gap" value="${selected.gap !== undefined ? selected.gap : 10}">
                        <div class="gmd-field">
                            <label>Kich thuoc icon</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="10" max="240" data-goal-key="iconSize" value="${selected.iconSize !== undefined ? selected.iconSize : 64}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="180" data-goal-key="iconSize" value="${selected.iconSize !== undefined ? selected.iconSize : 64}">
                        <div class="gmd-field">
                            <label>Kich thuoc chu</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="8" max="72" data-goal-key="textSize" value="${selected.textSize !== undefined ? selected.textSize : 14}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="8" max="72" data-goal-key="textSize" value="${selected.textSize !== undefined ? selected.textSize : 14}">
                        <div class="gmd-field">
                            <label>Vi tri chu</label>
                            <select class="gmd-select" data-goal-key="textPosition">
                                <option value="bottom" ${(selected.textPosition || 'bottom') === 'bottom' ? 'selected' : ''}>Duoi</option>
                                <option value="top" ${selected.textPosition === 'top' ? 'selected' : ''}>Tren</option>
                                <option value="left" ${selected.textPosition === 'left' ? 'selected' : ''}>Trai</option>
                                <option value="right" ${selected.textPosition === 'right' ? 'selected' : ''}>Phai</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Khoang cach chu</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="80" data-goal-key="textGap" value="${selected.textGap !== undefined ? selected.textGap : 4}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="60" data-goal-key="textGap" value="${selected.textGap !== undefined ? selected.textGap : 4}">
                        <div class="gmd-field">
                            <label>Khoảng cách viền (Padding)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="80" data-goal-key="padding" value="${selected.padding !== undefined ? selected.padding : 8}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="80" data-goal-key="padding" value="${selected.padding !== undefined ? selected.padding : 8}">
                        <div class="gmd-field">
                            <label>Bo góc (Border Radius)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="64" data-goal-key="borderRadius" value="${selected.borderRadius !== undefined ? selected.borderRadius : 8}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="64" data-goal-key="borderRadius" value="${selected.borderRadius !== undefined ? selected.borderRadius : 8}">
                        <div class="gmd-field"><label>Mau chu</label><input class="gmd-color" type="color" data-goal-key="textColor" value="${selected.textColor || '#ffffff'}"></div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hien ten qua</label>
                            <label class="gmd-switch"><input type="checkbox" data-goal-key="showName" ${selected.showName !== false ? 'checked' : ''}><span></span></label>
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Bat cuon</label>
                            <label class="gmd-switch"><input type="checkbox" data-goal-key="loopEnabled" ${selected.loopEnabled ? 'checked' : ''}><span></span></label>
                        </div>
                        <div class="gmd-field">
                            <label>Huong cuon</label>
                            <select class="gmd-select" data-goal-key="loopDirection">
                                <option value="vertical" ${(selected.loopDirection || 'vertical') === 'vertical' ? 'selected' : ''}>Doc</option>
                                <option value="horizontal" ${selected.loopDirection === 'horizontal' ? 'selected' : ''}>Ngang</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Toc do cuon</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="1" max="60" data-goal-key="loopSpeed" value="${selected.loopSpeed !== undefined ? selected.loopSpeed : 15}"><span>s</span></div>
                        </div>
                        <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin:8px 0;">Khi bật cuộn, danh sách quà sẽ lặp liên tục theo hướng đã chọn.</div>
                        <button class="gmd-btn" data-action="ungroup-stack" style="width:100%; border-color: rgba(239,68,68,.4); color:#fca5a5;"><i class="fas fa-object-ungroup"></i> Bo gop</button>
                        <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin-top:8px;">${Array.isArray(selected.children) ? selected.children.length : 0} gift trong nhom.</div>
                    </div>
                `;
            } else if (selected.type === 'goal-bar') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-cog"></i> CẤU HÌNH TIẾN TRÌNH</h4>
                        ${makeCustomGiftSelect('Chọn quà mục tiêu', selected.giftId)}
                        <div class="gmd-field">
                            <label>Số lượng mục tiêu (Target)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>Số lượng hiện tại (Current)</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ hiển thị (Subtitle Text)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu tiến trình (Bar Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ff007f'}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu tỏa sáng (Glow Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="glowColor" value="${selected.glowColor || 'rgba(255,0,127,0.5)'}">
                        </div>
                        <div class="gmd-field">
                            <label>Bo góc bảng mục tiêu</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="borderRadius" value="${selected.borderRadius !== undefined ? selected.borderRadius : 12}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="64" data-goal-key="borderRadius" value="${selected.borderRadius !== undefined ? selected.borderRadius : 12}">
                        <div class="gmd-field">
                            <label>Độ dày thanh (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 54}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="100" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 54}">
                        <div class="gmd-field">
                            <label>Giao diện chủ đề (Theme Style)</label>
                            <select class="gmd-select" data-goal-key="themeStyle">
                                <option value="classic" ${selected.themeStyle === 'classic' ? 'selected' : ''}>Chủ đề Cổ điển (Classic)</option>
                                <option value="neon" ${selected.themeStyle === 'neon' ? 'selected' : ''}>Tím Neon tỏa sáng (Neon Pro)</option>
                            </select>
                        </div>
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
                        ${makeCompactFontSizeField('Cỡ chữ tiêu đề', 'fontSize', 38)}
                        ${makeCompactFontSizeField('Cỡ chữ dòng phụ', 'subtitleFontSize', 24)}
                    </div>
                `;
            } else if (selected.type === 'goal-circle') {
                const centerIcon = selected.centerIcon || '❤️';
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-cog"></i> CẤU HÌNH VÒNG TRÒN</h4>
                        ${makeCustomGiftSelect('Chọn quà mục tiêu', selected.giftId)}
                        <div class="gmd-field">
                            <label>Số lượng mục tiêu (Target)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>Số lượng hiện tại (Current)</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Icon ở tâm vòng tròn</label>
                            <select class="gmd-select" data-goal-key="centerIcon">
                                <option value="❤️" ${centerIcon === '❤️' ? 'selected' : ''}>Trái tim ❤️</option>
                                <option value="⭐" ${centerIcon === '⭐' ? 'selected' : ''}>Ngôi sao ⭐</option>
                                <option value="🎁" ${centerIcon === '🎁' ? 'selected' : ''}>Hộp quà 🎁</option>
                                <option value="🔥" ${centerIcon === '🔥' ? 'selected' : ''}>Lửa 🔥</option>
                                <option value="gift-icon" ${centerIcon === 'gift-icon' ? 'selected' : ''}>Hình ảnh Quà tặng (Chọn ở trên)</option>
                            </select>
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ hiển thị (Subtitle Text)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu vòng tròn (Circle Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ff007f'}">
                        </div>
                    </div>
                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 24)}
                        ${makeCompactFontSizeField('Cỡ chữ Dòng phụ', 'subtitleFontSize', 16)}
                        ${makeCompactFontSizeField('Cỡ chữ Điểm số (Value)', 'numberFontSize', 16)}
                    </div>
                `;
            } else if (selected.type === 'boss-bar') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-skull"></i> THÁCH ĐẤU BOSS</h4>
                        ${makeCustomGiftSelect('Chọn quà tấn công Boss', selected.giftId)}
                        <div class="gmd-field">
                            <label>Tên quái thú / Boss Name</label>
                            <input class="gmd-input" type="text" data-goal-key="bossName" value="${selected.bossName || 'BOSS HP'}">
                        </div>
                        <div class="gmd-field">
                            <label>Tên hành động (Ví dụ: Corgi tấn công)</label>
                            <input class="gmd-input" type="text" data-goal-key="bossSub" value="${selected.bossSub || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>HP của Boss (Mục tiêu)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>HP hiện tại</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu HP thanh máu (Bar Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ef4444'}">
                        </div>
                        <div class="gmd-field">
                            <label>Độ dày thanh HP (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="60" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh máu (Bar Style)</label>
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
                        ${makeCompactFontSizeField('Cỡ chữ tên Boss', 'fontSize', 38)}
                        ${makeCompactFontSizeField('Cỡ chữ dòng phụ', 'subtitleFontSize', 26)}
                    </div>
                `;
            } else if (selected.type === 'top-contributors' || selected.type === 'podium-contributors') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-medal"></i> BẢNG VINH DANH</h4>
                        
                        <div class="gmd-field">
                            <label>Tiêu đề bảng vinh danh</label>
                            <input class="gmd-input" type="text" data-goal-key="name" value="${selected.name || ''}" placeholder="Mặc định">
                        </div>

                        <div class="gmd-field">
                            <label>Hiệu ứng chữ tiêu đề</label>
                            <select class="gmd-select" data-goal-key="titleEffect">
                                <option value="none" ${selected.titleEffect === 'none' || !selected.titleEffect ? 'selected' : ''}>Không có hiệu ứng</option>
                                <option value="glow-neon" ${selected.titleEffect === 'glow-neon' ? 'selected' : ''}>Phát sáng Neon (Glow)</option>
                                <option value="gold-metallic" ${selected.titleEffect === 'gold-metallic' ? 'selected' : ''}>Chữ đúc Vàng 3D (Gold)</option>
                                <option value="gradient-wave" ${selected.titleEffect === 'gradient-wave' ? 'selected' : ''}>Sóng Gradient động (Wave)</option>
                                <option value="fire-flicker" ${selected.titleEffect === 'fire-flicker' ? 'selected' : ''}>Tia lửa bập bùng (Flame)</option>
                            </select>
                        </div>

                        ${selected.titleEffect === 'glow-neon' ? `
                            <div class="gmd-field">
                                <label>Màu phát sáng Neon</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor1" value="${selected.titleColor1 || '#eab308'}">
                            </div>
                        ` : ''}

                        ${selected.titleEffect === 'gold-metallic' ? `
                            <div class="gmd-field">
                                <label>Màu vàng kim (Bắt đầu)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor1" value="${selected.titleColor1 || '#ffe066'}">
                            </div>
                            <div class="gmd-field">
                                <label>Màu vàng kim (Kết thúc)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor2" value="${selected.titleColor2 || '#d97706'}">
                            </div>
                        ` : ''}

                        ${selected.titleEffect === 'gradient-wave' ? `
                            <div class="gmd-field">
                                <label>Màu sóng Gradient (Bắt đầu)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor1" value="${selected.titleColor1 || '#eab308'}">
                            </div>
                            <div class="gmd-field">
                                <label>Màu sóng Gradient (Kết thúc)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor2" value="${selected.titleColor2 || '#f43f5e'}">
                            </div>
                        ` : ''}

                        ${selected.titleEffect === 'fire-flicker' ? `
                            <div class="gmd-field">
                                <label>Màu ánh lửa (Bắt đầu)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor1" value="${selected.titleColor1 || '#ff8000'}">
                            </div>
                            <div class="gmd-field">
                                <label>Màu ánh lửa (Kết thúc)</label>
                                <input class="gmd-color" type="color" data-goal-key="titleColor2" value="${selected.titleColor2 || '#f43f5e'}">
                            </div>
                        ` : ''}

                        <div class="gmd-field">
                            <label>Kiểu hiển thị</label>
                            <select class="gmd-select" data-goal-key="contribStyle">
                                <option value="list-only" ${selected.contribStyle === 'list-only' || (!selected.contribStyle && selected.type === 'top-contributors') ? 'selected' : ''}>Dạng danh sách (List)</option>
                                <option value="podium-only" ${selected.contribStyle === 'podium-only' || (!selected.contribStyle && selected.type === 'podium-contributors') ? 'selected' : ''}>Chỉ hiện bục (Top 3)</option>
                                <option value="podium-table" ${selected.contribStyle === 'podium-table' ? 'selected' : ''}>Bục & Bảng chi tiết</option>
                            </select>
                        </div>

                        ${(selected.contribStyle === 'list-only' || selected.contribStyle === 'podium-table' || (!selected.contribStyle && selected.type === 'top-contributors')) ? `
                            <div class="gmd-field">
                                <label>Giới hạn số người hiển thị</label>
                                <select class="gmd-select" data-goal-key="limitCount">
                                    <option value="3" ${Number(selected.limitCount || 3) === 3 ? 'selected' : ''}>3 người</option>
                                    <option value="5" ${Number(selected.limitCount || 3) === 5 ? 'selected' : ''}>5 người</option>
                                    <option value="10" ${Number(selected.limitCount || 3) === 10 ? 'selected' : ''}>10 người</option>
                                    <option value="15" ${Number(selected.limitCount || 3) === 15 ? 'selected' : ''}>15 người</option>
                                </select>
                            </div>
                        ` : ''}
                        
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị ảnh đại diện (Avatar)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showAvatar" ${selected.showAvatar !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị số tiền vinh danh (Value)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="showValue" ${selected.showValue !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field">
                            <label>Màu chủ đề bảng vinh danh</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#eab308'}">
                        </div>

                        ${(selected.contribStyle === 'podium-only' || selected.contribStyle === 'podium-table' || (!selected.contribStyle && selected.type === 'podium-contributors')) ? `
                            <div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 10px;">
                                <div style="font-size: 10px; font-weight: bold; color: #a855f7; margin-bottom: 6px;"><i class="fas fa-image"></i> KHUNG VIỀN AVATAR TOP 1-2-3</div>
                                
                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Khung viền Top 1 (.png / .gif / .webm)</label>
                                    <div style="display: flex; gap: 4px; align-items: center;">
                                        <input class="gmd-input gmd-input-compact" type="text" data-goal-key="top1FrameUrl" value="${selected.top1FrameUrl || ''}" placeholder="URL khung viền" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                        <button class="gmd-btn" onclick="window.giftMenuDesigner.triggerFrameUpload(1)" style="padding: 2px 6px; font-size: 11px; height: 24px;"><i class="fas fa-upload"></i></button>
                                    </div>
                                </div>

                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Khung viền Top 2 (.png / .gif / .webm)</label>
                                    <div style="display: flex; gap: 4px; align-items: center;">
                                        <input class="gmd-input gmd-input-compact" type="text" data-goal-key="top2FrameUrl" value="${selected.top2FrameUrl || ''}" placeholder="URL khung viền" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                        <button class="gmd-btn" onclick="window.giftMenuDesigner.triggerFrameUpload(2)" style="padding: 2px 6px; font-size: 11px; height: 24px;"><i class="fas fa-upload"></i></button>
                                    </div>
                                </div>

                                <div class="gmd-field" style="margin-bottom: 4px;">
                                    <label style="font-size: 9px; margin-bottom: 2px;">Khung viền Top 3 (.png / .gif / .webm)</label>
                                    <div style="display: flex; gap: 4px; align-items: center;">
                                        <input class="gmd-input gmd-input-compact" type="text" data-goal-key="top3FrameUrl" value="${selected.top3FrameUrl || ''}" placeholder="URL khung viền" style="font-size: 10px; height: 24px; flex: 1; padding: 2px 4px;">
                                        <button class="gmd-btn" onclick="window.giftMenuDesigner.triggerFrameUpload(3)" style="padding: 2px 6px; font-size: 11px; height: 24px;"><i class="fas fa-upload"></i></button>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 34)}
                        ${makeCompactFontSizeField('Cỡ chữ Tên người dùng', 'rowFontSize', selected.type === 'podium-contributors' ? 22 : 30)}
                        ${selected.type === 'podium-contributors' ? makeCompactFontSizeField('Cỡ chữ Điểm số (Value)', 'valueFontSize', 22) : ''}
                    </div>
                `;
            } else if (selected.type === 'mystery-chests') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-gift"></i> HỘP QUÀ BÍ MẬT</h4>
                        ${makeCustomGiftSelect('Chọn quà tích lũy mở hộp', selected.giftId)}
                        <div class="gmd-field">
                            <label>Tiêu đề hộp quà</label>
                            <input class="gmd-input" type="text" data-goal-key="name" value="${selected.name || '🎁 MỞ KHÓA HỘP QUÀ KỲ BÍ'}">
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ hiển thị (Subtitle Text)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>Số lượng mục tiêu (Hộp 100%)</label>
                            <input class="gmd-input" type="number" data-goal-key="targetCount" value="${selected.targetCount || 100}">
                        </div>
                        <div class="gmd-field">
                            <label>Số lượng hiện tại</label>
                            <input class="gmd-input" type="number" data-goal-key="currentCount" value="${selected.currentCount || 0}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu tiến trình tích lũy (Bar Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#a855f7'}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu tỏa sáng (Glow Color)</label>
                            <input class="gmd-color" type="color" data-goal-key="glowColor" value="${selected.glowColor || '#fb7185'}">
                        </div>
                        <div class="gmd-field">
                            <label>Độ dày thanh tích lũy (Bar Height)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="60" data-goal-key="barHeight" value="${selected.barHeight !== undefined ? selected.barHeight : 24}">
                        <div class="gmd-field">
                            <label>Hiệu ứng thanh tích lũy (Bar Style)</label>
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
                        ${makeCompactFontSizeField('Cỡ chữ dòng phụ', 'subtitleFontSize', 20)}
                    </div>
                `;
            } else if (selected.type === 'combo') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-fire"></i> HIỆU ỨNG COMBO</h4>
                        <div class="gmd-field">
                            <label>Số lượng Combo hiển thị</label>
                            <input class="gmd-input" type="number" data-goal-key="comboCount" value="${selected.comboCount || 88}">
                        </div>
                        <div class="gmd-field">
                            <label>Tiêu đề Combo</label>
                            <input class="gmd-input" type="text" data-goal-key="name" value="${selected.name || 'COMBO ĐANG CHẠY!'}">
                        </div>
                        <div class="gmd-field">
                            <label>Dòng phụ hiển thị (Subtitle Text)</label>
                            <input class="gmd-input" type="text" data-goal-key="subtitleText" value="${selected.subtitleText || ''}">
                        </div>
                        <div class="gmd-field">
                            <label>Màu chủ đề Combo</label>
                            <input class="gmd-color" type="color" data-goal-key="barColor" value="${selected.barColor || '#ef4444'}">
                        </div>
                    </div>
                    <div class="gmd-section">
                        <h4><i class="fas fa-font"></i> TÙY CHỈNH CHỮ</h4>
                        ${makeCompactFontSizeField('Cỡ chữ Tiêu đề', 'fontSize', 40)}
                        ${makeCompactFontSizeField('Cỡ chữ Con số (Combo)', 'numberFontSize', 64)}
                        ${makeCompactFontSizeField('Cỡ chữ Dòng phụ', 'subtitleFontSize', 20)}
                    </div>
                `;
            } else if (selected.type === 'media-asset') {
                specificConfigHTML = `
                    <div class="gmd-section">
                        <h4><i class="fas fa-photo-video"></i> THUỘC TÍNH MEDIA</h4>
                        <div class="gmd-field">
                            <label>Độ trong suốt (Opacity)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="1" step="0.05" data-goal-key="opacity" value="${selected.opacity !== undefined ? selected.opacity : 1.0}"><span>%</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="0" max="1" step="0.05" data-goal-key="opacity" value="${selected.opacity !== undefined ? selected.opacity : 1.0}">
                        <div class="gmd-field">
                            <label>Chế độ hiển thị (Fit Mode)</label>
                            <select class="gmd-select" data-goal-key="fitMode">
                                <option value="contain" ${selected.fitMode === 'contain' ? 'selected' : ''}>Thu nhỏ vừa vặn (Contain)</option>
                                <option value="cover" ${selected.fitMode === 'cover' ? 'selected' : ''}>Kéo giãn lấp đầy (Cover)</option>
                                <option value="fill" ${selected.fitMode === 'fill' ? 'selected' : ''}>Kéo tràn khung (Fill)</option>
                            </select>
                        </div>
                    </div>
                `;
            } else if (selected.type === 'goal-list') {
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
                            <label>Kích thước icon quà tặng (Icon Size)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="iconSize" value="${selected.iconSize !== undefined ? selected.iconSize : 28}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="12" max="64" data-goal-key="iconSize" value="${selected.iconSize !== undefined ? selected.iconSize : 28}">
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

                        <div class="gmd-field gmd-toggle-row">
                            <label>Cuộn tự động (Auto Scroll)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="autoScroll" ${selected.autoScroll ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        ${selected.autoScroll ? `
                        <div class="gmd-field">
                            <label>Tốc độ cuộn (s)</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="1" max="60" data-goal-key="autoScrollSpeed" value="${selected.autoScrollSpeed !== undefined ? selected.autoScrollSpeed : 15}"><span>s</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="3" max="40" data-goal-key="autoScrollSpeed" value="${selected.autoScrollSpeed !== undefined ? selected.autoScrollSpeed : 15}">
                        ` : ''}
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiệu ứng quét sáng (Shimmer)</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-goal-key="shimmerEffect" ${selected.shimmerEffect !== false ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field">
                            <label>Cỡ chữ Tiêu đề</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="fontSize" value="${selected.fontSize !== undefined ? selected.fontSize : 32}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="12" max="64" data-goal-key="fontSize" value="${selected.fontSize !== undefined ? selected.fontSize : 32}">
                        <div class="gmd-field">
                            <label>Cỡ chữ Dòng quà</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="rowFontSize" value="${selected.rowFontSize !== undefined ? selected.rowFontSize : 22}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="48" data-goal-key="rowFontSize" value="${selected.rowFontSize !== undefined ? selected.rowFontSize : 22}">
                        <div class="gmd-field">
                            <label>Cỡ chữ Chân trang</label>
                            <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="footerFontSize" value="${selected.footerFontSize !== undefined ? selected.footerFontSize : 20}"><span>px</span></div>
                        </div>
                        <input class="gmd-range" type="range" min="10" max="48" data-goal-key="footerFontSize" value="${selected.footerFontSize !== undefined ? selected.footerFontSize : 20}">
                        
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

            const panelStyleControlsHTML = selected.type === 'gift-stack-group' ? `
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Bật viền</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="showBorder" ${selected.showBorder !== false ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ${selected.showBorder !== false ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu viền</label>
                        <select class="gmd-select" data-goal-key="borderFillType" style="margin-bottom:8px;">
                            <option value="solid" ${(selected.borderFillType || 'solid') !== 'gradient' ? 'selected' : ''}>Mau don</option>
                            <option value="gradient" ${selected.borderFillType === 'gradient' ? 'selected' : ''}>Gradient</option>
                        </select>
                        ${(selected.borderFillType || 'solid') === 'gradient' ? `
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer; margin-bottom:6px;" type="color" data-goal-key="borderGradientFrom" value="${selected.borderGradientFrom || selected.borderColor || '#22d3ee'}">
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer; margin-bottom:6px;" type="color" data-goal-key="borderGradientTo" value="${selected.borderGradientTo || '#a855f7'}">
                        <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="360" data-goal-key="borderGradientAngle" value="${selected.borderGradientAngle !== undefined ? selected.borderGradientAngle : 135}"><span>deg</span></div>
                        ` : `<input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="borderColor" value="${selected.borderColor || '#22d3ee'}">`}
                        <select class="gmd-select" data-goal-key="borderEffect" style="margin-top:8px;">
                            <option value="none" ${(selected.borderEffect || 'none') === 'none' ? 'selected' : ''}>Khong hieu ung</option>
                            <option value="glow" ${selected.borderEffect === 'glow' ? 'selected' : ''}>Glow</option>
                            <option value="pulse" ${selected.borderEffect === 'pulse' ? 'selected' : ''}>Pulse</option>
                            <option value="running-light" ${selected.borderEffect === 'running-light' ? 'selected' : ''}>Running Light</option>
                            <option value="dashed-march" ${selected.borderEffect === 'dashed-march' ? 'selected' : ''}>Dashed March</option>
                        </select>
                        ${(selected.borderEffect || 'none') !== 'none' ? `
                        <div class="gmd-inline-input gmd-inline-input-single" style="margin-top:6px;"><input class="gmd-input gmd-input-compact" type="number" min="0.5" max="10" step="0.1" data-goal-key="borderEffectSpeed" value="${selected.borderEffectSpeed !== undefined ? selected.borderEffectSpeed : 2}"><span>s</span></div>
                        <div class="gmd-inline-input gmd-inline-input-single" style="margin-top:6px;"><input class="gmd-input gmd-input-compact" type="number" min="0" max="1" step="0.05" data-goal-key="borderGlowIntensity" value="${selected.borderGlowIntensity !== undefined ? selected.borderGlowIntensity : 0.55}"><span>x</span></div>
                        ` : ''}
                    </div>
                    ` : ''}
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Bật bảng</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="showPanel" ${selected.showPanel !== false ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ${selected.showPanel !== false ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Kiểu bảng</label>
                        <select class="gmd-select" data-goal-key="panelFillType">
                            <option value="solid" ${(selected.panelFillType || 'solid') !== 'gradient' ? 'selected' : ''}>Màu đơn</option>
                            <option value="gradient" ${selected.panelFillType === 'gradient' ? 'selected' : ''}>Gradient</option>
                        </select>
                    </div>
                    ${(selected.panelFillType || 'solid') === 'gradient' ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu gradient 1</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="panelGradientFrom" value="${selected.panelGradientFrom || selected.panelColor || '#3b1f48'}">
                    </div>
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu gradient 2</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="panelGradientTo" value="${selected.panelGradientTo || '#0a0a14'}">
                    </div>
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Góc gradient</label>
                        <div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0" max="360" data-goal-key="panelGradientAngle" value="${selected.panelGradientAngle !== undefined ? selected.panelGradientAngle : 135}"><span>deg</span></div>
                    </div>
                    ` : `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">Màu bảng</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="panelColor" value="${selected.panelColor || '#0a0a14'}">
                    </div>
                    `}
                    <select class="gmd-select" data-goal-key="panelEffect" style="margin-top:8px;">
                        <option value="none" ${(selected.panelEffect || 'none') === 'none' ? 'selected' : ''}>Khong hieu ung</option>
                        <option value="light-sweep" ${selected.panelEffect === 'light-sweep' ? 'selected' : ''}>Light Sweep</option>
                        <option value="breathing" ${selected.panelEffect === 'breathing' ? 'selected' : ''}>Breathing</option>
                        <option value="energy-flow" ${selected.panelEffect === 'energy-flow' ? 'selected' : ''}>Energy Flow</option>
                        <option value="glass-shine" ${selected.panelEffect === 'glass-shine' ? 'selected' : ''}>Glass Shine</option>
                    </select>
                    ${(selected.panelEffect || 'none') !== 'none' ? `
                    <div class="gmd-inline-input gmd-inline-input-single" style="margin-top:6px;"><input class="gmd-input gmd-input-compact" type="number" min="0.5" max="10" step="0.1" data-goal-key="panelEffectSpeed" value="${selected.panelEffectSpeed !== undefined ? selected.panelEffectSpeed : 3}"><span>s</span></div>
                    <div class="gmd-inline-input gmd-inline-input-single" style="margin-top:6px;"><input class="gmd-input gmd-input-compact" type="number" min="0" max="1" step="0.05" data-goal-key="panelGlowIntensity" value="${selected.panelGlowIntensity !== undefined ? selected.panelGlowIntensity : 0.35}"><span>x</span></div>
                    ` : ''}
                    ` : ''}
            ` : '';

            const customTextColorControlsHTML = `
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Tá»± chá»n mÃ u chá»¯</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="useCustomTextColor" ${selected.useCustomTextColor ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ${selected.useCustomTextColor ? `
                    <div class="gmd-field" style="margin-top: 4px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px;">MÃ u chá»¯</label>
                        <input class="gmd-color" style="width:100%; height:32px; padding:0; border:1px solid rgba(255,255,255,0.1); background:none; cursor:pointer;" type="color" data-goal-key="textColor" value="${selected.textColor || '#ffffff'}">
                    </div>
                    ` : ''}
            `;

            const stackChildrenControlsHTML = selected.type === 'gift-stack-group' ? `
                <div class="gmd-section">
                    <h4 style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" onclick="window.giftMenuDesigner.toggleInspectorChildren()">
                        <span><i class="fas fa-gifts"></i> CÁC QUÀ TẶNG ĐÃ GỘP</span>
                        <i class="fas ${this.inspectorChildrenExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                    </h4>
                    <div style="display: ${this.inspectorChildrenExpanded ? 'block' : 'none'};">
                        ${(selected.children || []).map((child, index) => {
                const iconPath = child.iconUrl || child.icon || '';
                const childIcon = iconPath ? (iconPath.startsWith('http') ? iconPath : this.apiBase + iconPath) : '';
                const childName = child.name || child.giftName || `Quà ${index + 1}`;
                return `
                                <div class="gmd-child-config-item" style="border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; margin-bottom: 8px; background: rgba(255,255,255,0.015);">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <img src="${childIcon}" style="width: 24px; height: 24px; object-fit: contain;">
                                        <span style="font-weight: bold; font-size: 12px; color: #fbbf24;">${childName}</span>
                                    </div>
                                    
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Tên chính (Main Text)</label>
                                        <input class="gmd-input gmd-input-compact" style="width:100%; font-size:11px; height:24px; padding:2px 4px;" data-child-index="${index}" data-child-key="name" value="${child.name || child.giftName || ''}">
                                    </div>

                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Tên phụ / Ghi chú (Subtext)</label>
                                        <input class="gmd-input gmd-input-compact" style="width:100%; font-size:11px; height:24px; padding:2px 4px;" data-child-index="${index}" data-child-key="subtext" value="${child.subtext || ''}">
                                    </div>



                                    <div class="gmd-field gmd-toggle-row" style="margin-top: 6px;">
                                        <label style="font-size: 11px;">Bật nền chữ</label>
                                        <label class="gmd-switch">
                                            <input type="checkbox" data-child-index="${index}" data-child-key="showTextBg" ${child.showTextBg ? 'checked' : ''}>
                                            <span></span>
                                        </label>
                                    </div>

                                    ${child.showTextBg ? `
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Kiểu nền chữ</label>
                                        <select class="gmd-select" data-child-index="${index}" data-child-key="textBgStyle" style="width:100%; font-size:11px; padding:4px;">
                                            <option value="classic" ${(child.textBgStyle || 'classic') === 'classic' ? 'selected' : ''}>Cổ điển (Classic)</option>
                                            <option value="glass" ${child.textBgStyle === 'glass' ? 'selected' : ''}>Gương kính (Glassmorphism)</option>
                                            <option value="neon" ${child.textBgStyle === 'neon' ? 'selected' : ''}>Khung cổ thuật (Mystic Frame)</option>
                                            <option value="holo" ${child.textBgStyle === 'holo' ? 'selected' : ''}>Hologram (Holographic)</option>
                                            <option value="light-sweep" ${child.textBgStyle === 'light-sweep' || child.textBgStyle === 'dark-matte' ? 'selected' : ''}>Quét sáng (Light Sweep)</option>
                                        </select>
                                    </div>

                                    ${(child.textBgStyle || 'classic') === 'classic' ? `
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Màu nền chữ</label>
                                        <div class="gmd-inline-color" style="display:flex; gap:4px; align-items:center;">
                                            <input class="gmd-input gmd-input-compact" style="flex:1; font-size:11px; height:24px; padding:2px 4px;" data-child-index="${index}" data-child-key="textBgColor" value="${child.textBgColor || 'rgba(0,0,0,0.5)'}">
                                            <input class="gmd-color" type="color" style="width:24px; height:24px; padding:0; border:0; background:none; cursor:pointer;" data-child-index="${index}" data-child-key="textBgColor" value="${child.textBgColor && child.textBgColor.startsWith('#') ? child.textBgColor.slice(0, 7) : '#000000'}">
                                        </div>
                                    </div>
                                    ` : ''}
                                    ${child.textBgStyle === 'neon' ? `
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Màu gradient</label>
                                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                                            <input class="gmd-color" type="color" data-child-index="${index}" data-child-key="textBgGradientFrom" value="${child.textBgGradientFrom || '#a855f7'}">
                                            <input class="gmd-color" type="color" data-child-index="${index}" data-child-key="textBgGradientTo" value="${child.textBgGradientTo || '#22d3ee'}">
                                        </div>
                                    </div>
                                    ` : ''}
                                    ` : ''}

                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Hiệu ứng Loop</label>
                                        <select class="gmd-select" data-child-index="${index}" data-child-key="animationType" style="width:100%; font-size:11px; padding:4px;">
                                            <option value="">Không có</option>
                                            <option value="Pulse" ${child.animationType === 'Pulse' ? 'selected' : ''}>Pulse (Đập)</option>
                                            <option value="Bounce" ${child.animationType === 'Bounce' ? 'selected' : ''}>Bounce (Nẩy)</option>
                                            <option value="Float" ${child.animationType === 'Float' ? 'selected' : ''}>Float (Bay)</option>
                                            <option value="Zoom" ${child.animationType === 'Zoom' ? 'selected' : ''}>Zoom (Phóng)</option>
                                            <option value="Shake" ${child.animationType === 'Shake' ? 'selected' : ''}>Shake (Rung)</option>
                                        </select>
                                    </div>
                                    
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Hiệu ứng Nền</label>
                                        <select class="gmd-select" data-child-index="${index}" data-child-key="auraType" style="width:100%; font-size:11px; padding:4px;">
                                            <option value="">Không có</option>
                                            <option value="Glow" ${child.auraType === 'Glow' ? 'selected' : ''}>Glow (Phát sáng)</option>
                                            <option value="Bubble" ${child.auraType === 'Bubble' ? 'selected' : ''}>Bubble (Bong bóng)</option>
                                            <option value="Magic Ring" ${child.auraType === 'Magic Ring' ? 'selected' : ''}>Magic Ring (Vòng ma thuật)</option>
                                            <option value="Neon Frame" ${child.auraType === 'Neon Frame' ? 'selected' : ''}>Neon Frame (Khung Neon)</option>
                                            <option value="Light Sweep" ${child.auraType === 'Light Sweep' ? 'selected' : ''}>Light Sweep (Quét sáng)</option>
                                            <option value="Fire Aura" ${child.auraType === 'Fire Aura' ? 'selected' : ''}>Fire Aura (Lửa)</option>
                                            <option value="Electric Aura" ${child.auraType === 'Electric Aura' ? 'selected' : ''}>Electric Aura (Điện)</option>
                                        </select>
                                    </div>

                                    ${child.auraType ? `
                                    <div class="gmd-field" style="margin-top: 4px;">
                                        <label style="font-size: 11px;">Màu nền</label>
                                        <div class="gmd-inline-color" style="display:flex; gap:4px; align-items:center;">
                                            <input class="gmd-input gmd-input-compact" style="flex:1; font-size:11px; height:24px; padding:2px 4px;" data-child-index="${index}" data-child-key="auraColor" value="${child.auraColor || '#d7b2ff'}">
                                            <input class="gmd-color" type="color" style="width:24px; height:24px; padding:0; border:0; background:none; cursor:pointer;" data-child-index="${index}" data-child-key="auraColor" value="${child.auraColor || '#d7b2ff'}">
                                        </div>
                                    </div>
                                    ` : ''}
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            ` : '';

            const stackAdvancedControlsHTML = selected.type === 'gift-stack-group' ? `
                <div class="gmd-section">
                    <h4 style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" onclick="window.giftMenuDesigner.toggleInspectorAdvanced()">
                        <span><i class="fas fa-crown"></i> TÍNH NĂNG NÂNG CAO</span>
                        <i class="fas ${this.inspectorAdvancedExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                    </h4>
                    <div style="display: ${this.inspectorAdvancedExpanded ? 'block' : 'none'};">
                        ${panelStyleControlsHTML}
                        ${customTextColorControlsHTML}
                        ${selected.type === 'gift-stack-group' ? `
                        <div class="gmd-field" style="margin-top: 8px;">
                            <label style="font-size: 11px;">Căn lề quà tặng</label>
                            <select class="gmd-select" data-goal-key="childAlign" style="width:100%; font-size:11px; padding:4px;">
                                <option value="center" ${(selected.childAlign || 'center') === 'center' ? 'selected' : ''}>Căn giữa (Center)</option>
                                <option value="left" ${selected.childAlign === 'left' ? 'selected' : ''}>Căn trái (Left)</option>
                                <option value="right" ${selected.childAlign === 'right' ? 'selected' : ''}>Căn phải (Right)</option>
                            </select>
                        </div>
                        <div class="gmd-field" style="margin-top: 8px;">
                            <label style="font-size: 11px;">Căn lề chữ (Tất cả)</label>
                            <select class="gmd-select" data-goal-key="textAlign" style="width:100%; font-size:11px; padding:4px;">
                                <option value="center" ${(selected.textAlign || 'center') === 'center' ? 'selected' : ''}>Căn giữa (Center)</option>
                                <option value="left" ${selected.textAlign === 'left' ? 'selected' : ''}>Căn trái (Left)</option>
                                <option value="right" ${selected.textAlign === 'right' ? 'selected' : ''}>Căn phải (Right)</option>
                            </select>
                        </div>
                        <div class="gmd-field" style="margin-top: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <label style="font-size: 11px; margin: 0;">Đệm lề viền (Padding)</label>
                                <span class="gmd-slider-value-display" style="font-size: 11px; color: #bae6fd; font-weight: 700;">${selected.padding !== undefined ? selected.padding : 8}px</span>
                            </div>
                            <input class="gmd-range" type="range" min="0" max="60" data-goal-key="padding" value="${selected.padding !== undefined ? selected.padding : 8}" oninput="this.previousElementSibling.querySelector('.gmd-slider-value-display').innerText = this.value + 'px'">
                        </div>
                        ` : ''}
                        ${specificConfigHTML}
                    </div>
                </div>
            ` : '';

            inspector.innerHTML = `
                <div class="gmd-selected-card">
                    <div style="font-size: 20px;">${selected.type === 'media-asset' ? '🖼️' : '📊'}</div>
                    <input class="gmd-title-input" data-goal-key="name" value="${this.escapeHtml(selected.name)}">
                    <button class="gmd-delete-btn" data-action="delete"><i class="fas fa-trash"></i></button>
                </div>
                
                <div class="gmd-section">
                    <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>
                    <div class="gmd-field"><label>Vị trí X / Y (Logical)</label></div>
                    <div class="gmd-row">
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="x" value="${logical.x}"><span>px</span></div>
                        <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-goal-key="y" value="${logical.y}"><span>px</span></div>
                    </div>
                    <div class="gmd-row" style="margin-top: 8px;">
                        <div class="gmd-field" style="margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                <label style="margin: 0; font-size: 11px;">Rộng (W)</label>
                                <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 80px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="w" value="${logical.w}"><span>px</span></div>
                            </div>
                            <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="100" max="1080" data-goal-key="w" value="${logical.w}">
                        </div>
                        <div class="gmd-field" style="margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                <label style="margin: 0; font-size: 11px;">Cao (H)</label>
                                <div class="gmd-inline-input gmd-inline-input-single" style="max-width: 80px; margin: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(5,12,28,.4);"><input class="gmd-input gmd-input-compact" style="padding: 2px 4px !important; font-size: 11px; height: 18px;" type="number" data-goal-key="h" value="${logical.h}"><span>px</span></div>
                            </div>
                            <input class="gmd-range" style="height: 4px; margin-top: 2px;" type="range" min="30" max="1920" data-goal-key="h" value="${logical.h}">
                        </div>
                    </div>
                    ${selected.type === 'gift-stack-group' ? `
                    <div class="gmd-field gmd-toggle-row" style="margin-top: 8px;">
                        <label style="font-size: 11px;">Khóa tỷ lệ (Aspect Ratio)</label>
                        <label class="gmd-switch">
                            <input type="checkbox" data-goal-key="lockRatio" ${selected.lockRatio ? 'checked' : ''}>
                            <span></span>
                        </label>
                    </div>
                    ` : ''}
                    ${selected.type !== 'gift-stack-group' ? `
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
                    ` : ''}

                    ${selected.type !== 'gift-stack-group' ? `
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
                    ` : ''}

                    ${selected.type !== 'gift-stack-group' ? `
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
                    ` : ''}
                    <div class="gmd-field" style="margin-top: 10px;">
                        <div style="display:flex; gap:10px;">
                            <button class="gmd-btn" data-action="duplicate"><i class="far fa-clone"></i> Nhân bản</button>
                            <button class="gmd-btn" data-action="delete"><i class="far fa-trash-alt"></i> Xóa</button>
                        </div>
                    </div>
                </div>
                
                ${selected.type === 'gift-stack-group' ? `${stackChildrenControlsHTML}${stackAdvancedControlsHTML}` : `${testButtonHTML}${specificConfigHTML}`}
            `;
        }

        updateGoalBoardSelectedItem(key, value, pushHist = true) {
            const item = this.items.find((x) => x.id === this.selectedId);
            if (!item) return;

            const freeStyleKeys = ['barColor', 'glowColor', 'bgColor', 'textColor', 'useCustomBg', 'useCustomTextColor', 'barStyle', 'panelEffect', 'borderEffect', 'panelColor', 'panelGradientFrom', 'panelGradientTo', 'borderColor', 'borderGradientFrom', 'borderGradientTo'];
            if (this.planKey === 'free' && freeStyleKeys.includes(key)) {
                this.showUpgrade('menuAdvanced', 'Nâng cấp Basic để đổi màu và dùng hiệu ứng đẹp mắt.');
                return;
            }
            if (this.planKey === 'pro' && ((key === 'panelEffect' && !['none', 'breathing'].includes(String(value))) || (key === 'borderEffect' && !['none', 'glow', 'pulse'].includes(String(value))))) {
                this.showUpgrade('menuAdvanced', 'Tùy chỉnh chuyển động nâng cao dành cho gói Pro.');
                return;
            }

            if (['x', 'y', 'w', 'h', 'targetCount', 'currentCount', 'limitCount', 'borderRadius', 'opacity', 'fontSize', 'subtitleFontSize', 'rowFontSize', 'numberFontSize', 'valueFontSize', 'footerFontSize', 'comboCount', 'barHeight', 'contentOffsetY', 'iconSize', 'gap', 'textSize', 'textGap', 'loopSpeed', 'panelGradientAngle', 'panelEffectSpeed', 'panelGlowIntensity', 'borderGradientAngle', 'borderEffectSpeed', 'borderGlowIntensity', 'padding', 'timerDurationSeconds', 'timerRemainingSeconds', 'timerStartedAt', 'bgColorGradientAngle'].includes(key)) {
                const numVal = Number(value);
                if (key === 'x' || key === 'y' || key === 'w' || key === 'h') {
                    const previousW = Math.max(1, Number(item.w) || Number(item.width) || 1);
                    const previousH = Math.max(1, Number(item.h) || Number(item.height) || 1);
                    const map = {
                        '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                        '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                        '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
                    };
                    const cfg = map[this.aspectRatio] || map['9:16'];
                    const safeOffset = {
                        x: Math.round((cfg.canvasW - cfg.width) / 2),
                        y: Math.round((cfg.canvasH - cfg.height) / 2)
                    };
                    const exportSize = this.aspectRatio === '9:16'
                        ? { width: 1080, height: 1920 }
                        : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
                    const stageSx = cfg.width / exportSize.width;
                    const stageSy = cfg.height / exportSize.height;

                    if (key === 'x') {
                        item.x = Math.round(safeOffset.x + numVal * stageSx);
                    } else if (key === 'y') {
                        item.y = Math.round(safeOffset.y + numVal * stageSy);
                    } else if (key === 'w') {
                        item.w = numVal;
                        item.width = Math.round(numVal * stageSx);
                        if (item.lockRatio) {
                            const ratio = previousH / previousW;
                            item.height = Math.round(item.width * ratio);
                            item.h = Math.round(item.w * ratio);
                        }
                    } else if (key === 'h') {
                        item.h = numVal;
                        item.height = Math.round(numVal * stageSy);
                        if (item.lockRatio) {
                            const ratio = previousW / previousH;
                            item.width = Math.round(item.height * ratio);
                            item.w = Math.round(item.h * ratio);
                        }
                    }
                } else {
                    item[key] = numVal;
                }
            } else if (key === 'showPercentage' || key === 'showAvatar' || key === 'showValue' || key === 'lockRatio' || key === 'showGiftName' || key === 'useCustomBg' || key === 'useCustomTextColor' || key === 'hideBg' || key === 'showName' || key === 'loopEnabled' || key === 'showPanel' || key === 'showBorder' || key === 'useCustomPkBorderColor' || key === 'timerRunning' || key === 'showTimer' || key === 'useCustomBgGradient') {
                item[key] = Boolean(value);
                if (key === 'lockRatio') {
                    if (item.lockRatio) {
                        item.lockedW = item.w || item.width;
                        item.lockedH = item.h || item.height;
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
                        item.iconUrl = gift.icon || '';
                        item.iconDisplayMode = gift.displayMode === 'text' ? 'text' : 'media';
                        item.iconText = gift.displayText || gift.name || cleanVal;
                        item.iconTextColor = gift.textColor || '#ffffff';
                        item.iconTextSize = Number(gift.textSize) || 20;
                    }
                } else if (key === 'timerDuration') {
                    const secs = this.parseTimeToSeconds(value);
                    item.timerDurationSeconds = secs;
                    if (!item.timerRunning) {
                        item.timerRemainingSeconds = secs;
                    }
                }
            }

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
            if (key === 'showPanel' || key === 'showBorder' || key === 'panelFillType' || key === 'panelEffect' || key === 'borderFillType' || key === 'borderEffect' || key === 'useCustomBg' || key === 'useCustomTextColor' || key === 'useCustomPkBorderColor' || key === 'showTimer' || key === 'hideBg' || key === 'useCustomBgGradient' || key === 'titleEffect' || key === 'contribStyle') {
                this.renderInspector();
            }
            if (pushHist) {
                this.pushHistory('update-goal-item');
            }
        }

        updateGoalListItem(idx, field, value) {
            const selected = this.items.find((x) => x.id === this.selectedId);
            if (selected && selected.type === 'goal-list' && Array.isArray(selected.goals) && selected.goals[idx]) {
                const goal = selected.goals[idx];
                if (field === 'target' || field === 'current') {
                    goal[field] = Number(value) || 0;
                } else if (field === 'giftId') {
                    const cleanVal = String(value).trim();
                    goal.giftId = cleanVal;
                    const gift = this.gifts.find(g => String(g.id).toLowerCase() === cleanVal.toLowerCase());
                    if (gift) {
                        goal.giftName = gift.name || cleanVal;
                        goal.icon = gift.icon || '';
                        goal.iconDisplayMode = gift.displayMode === 'text' ? 'text' : 'media';
                        goal.iconText = gift.displayText || gift.name || cleanVal;
                        goal.iconTextColor = gift.textColor || '#ffffff';
                        goal.iconTextSize = Number(gift.textSize) || 20;
                    } else {
                        goal.giftName = cleanVal;
                    }
                }
                this.renderCanvas();
                this.pushHistory('update-goal-list-item');
            }
        }

        addGoalListItem(itemId) {
            const item = this.items.find((x) => x.id === itemId);
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
                    icon: firstGift.icon || '',
                    iconDisplayMode: firstGift.displayMode === 'text' ? 'text' : 'media',
                    iconText: firstGift.displayText || firstGift.name || firstGift.id,
                    iconTextColor: firstGift.textColor || '#ffffff',
                    iconTextSize: Number(firstGift.textSize) || 20
                });
                this.renderCanvas();
                this.renderInspector();
                this.pushHistory('add-goal-list-item');
            }
        }

        removeGoalListItem(itemId, idx) {
            const item = this.items.find((x) => x.id === itemId);
            if (item && item.type === 'goal-list' && Array.isArray(item.goals)) {
                item.goals.splice(idx, 1);
                this.renderCanvas();
                this.renderInspector();
                this.pushHistory('remove-goal-list-item');
            }
        }

        async sendSimulatedGift(itemId) {
            const item = this.items.find(x => x.id === itemId);
            if (!item) return;

            let giftId = 'rose';
            let giftName = 'Rose';
            let repeatCount = 1;

            if (item.type === 'goal-bar' || item.type === 'boss-bar' || item.type === 'mystery-chests' || item.type === 'goal-circle') {
                giftId = item.giftId || 'rose';
                giftName = item.giftName || 'Rose';
                repeatCount = item.type === 'boss-bar' ? Math.ceil((item.targetCount || 100) / 10) : 10;

                if (item._originalCurrentCount === undefined) {
                    item._originalCurrentCount = item.currentCount || 0;
                }
                item.currentCount = (Number(item.currentCount) || 0) + repeatCount;
            } else if (item.type === 'goal-list' && Array.isArray(item.goals) && item.goals.length > 0) {
                const randomGoal = item.goals[Math.floor(Math.random() * item.goals.length)];
                giftId = randomGoal.giftId || 'rose';
                giftName = randomGoal.giftName || 'Rose';
                repeatCount = Math.ceil((randomGoal.target || 100) / 5);

                if (randomGoal._originalCurrent === undefined) {
                    randomGoal._originalCurrent = randomGoal.current || 0;
                }
                randomGoal.current = (Number(randomGoal.current) || 0) + repeatCount;
            } else if (item.type === 'top-contributors' || item.type === 'podium-contributors') {
                const testNames = [
                    'Vua Tặng Quà 👑', 'Minh Anh idol', 'Thần Donate ⚡', 'Khánh Huyền Cute', 'Anh Hai Sài Gòn',
                    'Đại Gia Phố Núi 💰', 'Hằng Nga 🌙', 'Công Tử Bạc Liêu', 'Bé Thỏ Ngọc 🐰', 'Phan Cứng BH 💎',
                    'Lão Đại 🥃', 'Mưa Sao Băng 🌠', 'Út cưng 🌸', 'Sơn Tùng M-TP (Fake)', 'Người Đi Hóng Hớt 🍿'
                ];
                const nickname = testNames[Math.floor(Math.random() * testNames.length)];
                giftId = 'galaxy';
                giftName = 'Galaxy';
                repeatCount = 1;
                const value = Math.floor(Math.random() * 500) + 100;

                if (item._originalContributors === undefined) {
                    item._originalContributors = Array.isArray(item.contributors) ? item.contributors.map(c => ({ ...c })) : [];
                }
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
                if (item._originalComboCount === undefined) {
                    item._originalComboCount = item.comboCount || 0;
                }
                item.comboCount = repeatCount;
            }

            this.renderCanvas();
            this.renderInspector();
        }

        async _oldSendSimulatedGift_disabled(itemId) {
            const item = this.items.find(x => x.id === itemId);
            if (!item) return;

            let giftId = 'rose';
            let giftName = 'Rose';
            let repeatCount = 1;

            if (item.type === 'goal-bar' || item.type === 'boss-bar' || item.type === 'mystery-chests' || item.type === 'goal-circle') {
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
                const testNames = [
                    'Vua Tặng Quà 👑', 'Minh Anh idol', 'Thần Donate ⚡', 'Khánh Huyền Cute', 'Anh Hai Sài Gòn',
                    'Đại Gia Phố Núi 💰', 'Hằng Nga 🌙', 'Công Tử Bạc Liêu', 'Bé Thỏ Ngọc 🐰', 'Phan Cứng BH 💎',
                    'Lão Đại 🥃', 'Mưa Sao Băng 🌠', 'Út cưng 🌸', 'Sơn Tùng M-TP (Fake)', 'Người Đi Hóng Hớt 🍿'
                ];
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

            this.renderCanvas();
            this.renderInspector();

            await this.saveLayout(false, false);

        }

        async resetGoalBoardItem(itemId) {
            const item = this.items.find(x => x.id === itemId);
            if (!item) return;

            if (item.type === 'goal-bar' || item.type === 'boss-bar' || item.type === 'mystery-chests' || item.type === 'goal-circle') {
                if (item._originalCurrentCount === undefined) item._originalCurrentCount = item.currentCount || 0;
                item.currentCount = item._originalCurrentCount;
            } else if (item.type === 'goal-list' && Array.isArray(item.goals)) {
                item.goals.forEach(g => {
                    if (g._originalCurrent === undefined) g._originalCurrent = g.current || 0;
                    g.current = g._originalCurrent;
                });
            } else if (item.type === 'top-contributors' || item.type === 'podium-contributors') {
                if (item._originalContributors === undefined) item._originalContributors = Array.isArray(item.contributors) ? item.contributors.map(c => ({ ...c })) : [];
                item.contributors = item._originalContributors.map(c => ({ ...c }));
            } else if (item.type === 'combo') {
                if (item._originalComboCount === undefined) item._originalComboCount = item.comboCount || 0;
                item.comboCount = item._originalComboCount;
            }

            this.renderCanvas();
            this.renderInspector();

        }

        async _oldResetGoalBoardItem_disabled(itemId) {
            const item = this.items.find(x => x.id === itemId);
            if (!item) return;

            if (item.type === 'goal-bar' || item.type === 'boss-bar' || item.type === 'mystery-chests' || item.type === 'goal-circle') {
                item.currentCount = 0;
            } else if (item.type === 'goal-list' && Array.isArray(item.goals)) {
                item.goals.forEach(g => {
                    g.current = 0;
                });
            } else if (item.type === 'top-contributors' || item.type === 'podium-contributors') {
                item.contributors = [];
            } else if (item.type === 'combo') {
                item.comboCount = 0;
            }

            this.renderCanvas();
            this.renderInspector();

            await this.saveLayout(false, false);

            if (window.app && typeof window.app.showNotification === 'function') {
                window.app.showNotification('success', 'Đã reset tiến trình mục tiêu về ban đầu!');
            }
        }

        getDefaultTemplates() {
            return [
                {
                    id: 'tmpl_pk_versus_bar',
                    name: '⚔️ Thanh đối kháng / PK',
                    tag: 'Đấu PK',
                    category: 'pk-versus',
                    tags: ['pk', 'versus', 'battle'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'pk_versus_bar_default_layer',
                            name: '⚔️ Thanh PK đối kháng',
                            type: 'goal-bar',
                            barStyle: 'pk',
                            presetStyle: 'esport',
                            teamCount: 2,
                            x: 90,
                            y: 800,
                            w: 900,
                            h: 180,
                            width: 900,
                            height: 180,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            lockRatio: true,
                            targetCount: 30000000,
                            showTimer: true,
                            timerDuration: '00:20:00',
                            showTopContributors: true,
                            enableAuraEffect: true,
                            auraIntensity: 'normal',
                            fontSize: 30,
                            scoreFontSize: 36,
                            timerFontSize: 24,
                            barHeight: 32,
                            pkNameColorMode: 'white',
                            pkScoreColorMode: 'white',
                            pkPlayers: [
                                { name: 'ĐỘI ĐỎ', score: 120, color: '#ef4444', giftId: 'rose', giftName: 'Rose', iconMode: 'preset', iconPreset: 'lion' },
                                { name: 'ĐỘI XANH', score: 80, color: '#3b82f6', giftId: 'coffee', giftName: 'Coffee', iconMode: 'preset', iconPreset: 'wolf' }
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
                }
            ];
        }

        showPublishStoreModal() {
            const modalId = 'gmd-publish-store-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'gmd-modal-overlay';
            modal.innerHTML = `
                <div class="gmd-modal-content" style="background:#0f172a; border:1px solid #334155; border-radius:16px; padding:20px; width:450px; max-width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.5); font-family:inherit; color:#fff; position:relative; box-sizing:border-box;">
                    <div class="gmd-modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:10px; margin-bottom:14px;">
                        <h3 style="margin:0; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;"><i class="fas fa-store" style="color:#10b981;"></i> Đăng thiết kế lên Cửa hàng</h3>
                        <button class="gmd-modal-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="document.getElementById('${modalId}').remove()">&times;</button>
                    </div>
                    <div class="gmd-modal-body" style="display:flex; flex-direction:column; gap:12px;">
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Tên Mẫu Thiết Kế *</label>
                            <input type="text" id="gmd-pub-name" class="gmd-input" placeholder="Ví dụ: Menu Quà Thách Đấu Cute" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="${this.currentLayoutName || 'Mẫu menu mới'}">
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Giá bán (VNĐ) *</label>
                            <input type="number" id="gmd-pub-price" class="gmd-input" placeholder="Nhập 0 nếu miễn phí" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="0">
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Giá gốc (VNĐ)</label>
                            <input type="number" id="gmd-pub-original-price" class="gmd-input" placeholder="Nhập 0 nếu không giảm" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="0">
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Mô tả sản phẩm</label>
                            <textarea id="gmd-pub-desc" class="gmd-input" placeholder="Mẫu thiết kế menu quà tặng đẹp mắt..." style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px; height:60px; resize:none;">Mẫu thiết kế menu quà tặng đẹp mắt</textarea>
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:12px; font-weight:700; color:#94a3b8;">Emoji Đại Diện (Icon)</label>
                            <input type="text" id="gmd-pub-icon" class="gmd-input" placeholder="Ví dụ: 📋, 🎁, ⭐" style="background:#1e293b; border:1px solid #334155; color:#fff; padding:8px 12px; border-radius:8px; font-size:12px;" value="📋">
                        </div>
                    </div>
                    <div class="gmd-modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #1e293b; padding-top:14px; margin-top:18px;">
                        <button class="gmd-btn" style="background:#334155; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;" onclick="document.getElementById('${modalId}').remove()">Hủy</button>
                        <button class="gmd-btn primary" id="gmd-pub-save-btn" style="background:#10b981; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold; box-shadow:0 0 10px rgba(16,185,207,0.3);">Đăng bán</button>
                    </div>
                </div>
            `;

            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.background = 'rgba(0,0,0,0.7)';
            modal.style.backdropFilter = 'blur(4px)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '99999';

            this.mount.appendChild(modal);

            const saveBtn = modal.querySelector('#gmd-pub-save-btn');
            saveBtn.addEventListener('click', async () => {
                const name = String(modal.querySelector('#gmd-pub-name').value).trim();
                const price = Number(modal.querySelector('#gmd-pub-price').value) || 0;
                const originalPrice = Number(modal.querySelector('#gmd-pub-original-price').value) || 0;
                const description = String(modal.querySelector('#gmd-pub-desc').value).trim();
                const icon = String(modal.querySelector('#gmd-pub-icon').value).trim() || '📋';

                if (!name) {
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('error', 'Vui lòng nhập tên mẫu!');
                    } else {
                        alert('Vui lòng nhập tên mẫu!');
                    }
                    return;
                }

                const map = {
                    '9:16': { width: 360, height: 640, canvasW: 720, canvasH: 960 },
                    '16:9': { width: 640, height: 360, canvasW: 960, canvasH: 720 },
                    '1:1': { width: 480, height: 480, canvasW: 900, canvasH: 900 }
                };
                const cfg = map[this.aspectRatio] || map['9:16'];
                const liveCanvasSize = { width: cfg.canvasW, height: cfg.canvasH };
                const safeSize = { width: cfg.width, height: cfg.height };
                const safeOffset = {
                    x: Math.round((liveCanvasSize.width - safeSize.width) / 2),
                    y: Math.round((liveCanvasSize.height - safeSize.height) / 2)
                };
                const exportSize = this.aspectRatio === '9:16'
                    ? { width: 1080, height: 1920 }
                    : (this.aspectRatio === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1080 });
                const sx = exportSize.width / safeSize.width;
                const sy = exportSize.height / safeSize.height;
                const exportedItems = this.items.map((i) => {
                    const itemExport = {
                        ...i,
                        x: Math.round((i.x - safeOffset.x) * sx),
                        y: Math.round((i.y - safeOffset.y) * sy),
                        width: Math.round(i.width * sx),
                        height: Math.round(i.height * sy),
                        textSize: Number(i.textSize || 13) * ((sx + sy) / 2),
                        textGap: Number(i.textGap || 4) * sy,
                        iconTextSize: Number(i.iconTextSize || 20) * ((sx + sy) / 2)
                    };
                    if (i.type === 'gift-stack-group') {
                        const avgScale = (sx + sy) / 2;
                        itemExport.renderScale = avgScale;
                        itemExport.children = Array.isArray(i.children) ? i.children.map((child) => ({
                            ...child,
                            iconTextSize: Number(child.iconTextSize || 20) * avgScale
                        })) : [];
                        itemExport.iconSize = Number(i.iconSize || 64) * avgScale;
                        itemExport.textSize = Number(i.textSize || 14) * avgScale;
                        itemExport.textGap = Number(i.textGap || 4) * avgScale;
                        itemExport.gap = Number(i.gap || 10) * avgScale;
                        itemExport.borderRadius = Number(i.borderRadius !== undefined ? i.borderRadius : 8) * avgScale;
                        itemExport.padding = Number(i.padding !== undefined ? i.padding : 8) * avgScale;
                        itemExport.loopEnabled = Boolean(i.loopEnabled);
                    }
                    if (i.type === 'goal-list' && Array.isArray(i.goals)) {
                        const avgScale = (sx + sy) / 2;
                        itemExport.goals = i.goals.map((goal) => ({
                            ...goal,
                            iconTextSize: Number(goal.iconTextSize || 16) * avgScale
                        }));
                    }
                    return itemExport;
                });

                const layoutData = {
                    version: 2,
                    aspectRatio: this.aspectRatio,
                    canvasSize: liveCanvasSize,
                    safeArea: { ...safeSize, ...safeOffset },
                    exportSize,
                    items: this.items.map((i) => ({ ...i })),
                    exportedItems
                };

                saveBtn.disabled = true;
                saveBtn.innerText = 'Đang đăng...';

                try {
                    const saved = await this.saveLayout(false, false);
                    if (saved === false) throw new Error('Layout chưa được lưu');
                    const headers = { 'Content-Type': 'application/json' };
                    if (this.token) headers.Authorization = `Bearer ${this.token}`;

                    const res = await fetch(`${this.apiBase}/api/tiktok/gift-menu-layout/publish`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            name,
                            price,
                            originalPrice,
                            description,
                            icon,
                            layoutData
                        })
                    });
                    const data = await res.json();

                    if (data.success) {
                        if (window.app && typeof window.app.showNotification === 'function') {
                            window.app.showNotification('success', 'Đã đăng mẫu menu lên Cửa hàng thành công!');
                        }
                        modal.remove();
                        if (window.app && typeof window.app.loadEffects === 'function') {
                            await window.app.loadEffects();
                        }
                    } else {
                        throw new Error(data.error || 'Lỗi server');
                    }
                } catch (e) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = 'Đăng bán';
                    if (window.app && typeof window.app.showNotification === 'function') {
                        window.app.showNotification('error', `Không thể đăng bán: ${e.message}`);
                    } else {
                        alert(`Không thể đăng bán: ${e.message}`);
                    }
                }
            });
        }

        onModeChange() {
            // Placeholder compatible wrapper
        }

        showAddCustomGiftModal() {
            const modalId = 'gmd-add-custom-gift-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.background = 'rgba(3, 7, 18, 0.75)';
            modal.style.backdropFilter = 'blur(8px)';
            modal.style.zIndex = '99999';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';

            modal.innerHTML = `
                <div class="gmd-modal-content" style="background:#0f172a; border:1px solid #334155; border-radius:16px; padding:20px; width:400px; max-width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.5); font-family:inherit; color:#fff; position:relative; box-sizing:border-box;">
                    <div class="gmd-modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:10px; margin-bottom:14px;">
                        <h4 style="margin:0; font-size:16px; font-weight:700;"><i class="fas fa-plus-circle" style="color:#a855f7;"></i> Thêm Quà Tặng Tự Chọn</h4>
                        <button class="gmd-modal-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="document.getElementById('${modalId}').remove()">&times;</button>
                    </div>
                    <div class="gmd-modal-body" style="display:flex; flex-direction:column; gap:12px;">
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:11px; color:#94a3b8; font-weight:600;">ID Quà Tặng (Ví dụ: custom_balloon)</label>
                            <input id="gmd-custom-gift-id" class="gmd-input" placeholder="Nhập ID quà (chỉ chữ thường, số, dấu gạch dưới)..." style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px; border-radius:6px; font-size:13px;" />
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:11px; color:#94a3b8; font-weight:600;">Tên Quà Tặng (Ví dụ: Bong Bóng)</label>
                            <input id="gmd-custom-gift-name" class="gmd-input" placeholder="Nhập tên hiển thị..." style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px; border-radius:6px; font-size:13px;" />
                        </div>
                        <div class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:11px; color:#94a3b8; font-weight:600;">Kiểu hiển thị thay icon</label>
                            <select id="gmd-custom-gift-display-mode" class="gmd-input" style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px; border-radius:6px; font-size:13px;">
                                <option value="media">PNG / GIF / WebM</option>
                                <option value="text">Chữ</option>
                            </select>
                        </div>
                        <div id="gmd-custom-gift-media-fields" class="gmd-modal-field" style="display:flex; flex-direction:column; gap:4px;">
                            <label style="font-size:11px; color:#94a3b8; font-weight:600;">Icon Quà Tặng</label>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button class="gmd-btn primary" id="gmd-custom-gift-upload-btn" style="flex:1; font-size:12px; padding:8px; background:#8b5cf6; border:none; color:#fff; border-radius:6px; cursor:pointer; font-weight:bold;"><i class="fas fa-upload"></i> Chọn PNG/GIF/WebM</button>
                                <input type="file" id="gmd-custom-gift-file-input" style="display:none;" accept=".png,.gif,.webm,image/png,image/gif,video/webm" />
                                <div id="gmd-custom-gift-preview-container" style="width:40px; height:40px; border-radius:6px; border:1px solid #334155; display:flex; align-items:center; justify-content:center; background:#1e293b; overflow:hidden; flex-shrink:0;">
                                    <span style="font-size:9px; color:#475569; text-align:center;">No Icon</span>
                                </div>
                            </div>
                        </div>
                        <div id="gmd-custom-gift-text-fields" class="gmd-modal-field" style="display:none; flex-direction:column; gap:8px; padding:10px; border:1px solid rgba(168,85,247,.28); border-radius:8px; background:rgba(168,85,247,.06);">
                            <label style="font-size:11px; color:#c4b5fd; font-weight:700;">Chữ thay cho icon</label>
                            <input id="gmd-custom-gift-display-text" class="gmd-input" maxlength="12" placeholder="Ví dụ: 1K, FOLLOW, VIP..." style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px; border-radius:6px; font-size:13px;" />
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <label style="font-size:11px;color:#94a3b8;display:flex;flex-direction:column;gap:4px;">Màu chữ<input id="gmd-custom-gift-text-color" type="color" value="#ffffff" style="width:100%;height:34px;border:0;background:transparent;"></label>
                                <label style="font-size:11px;color:#94a3b8;display:flex;flex-direction:column;gap:4px;">Cỡ chữ<input id="gmd-custom-gift-text-size" type="number" min="10" max="40" value="20" class="gmd-input" style="height:34px;background:#1e293b;color:#fff;border:1px solid #334155;border-radius:6px;padding:5px;"></label>
                            </div>
                            <div id="gmd-custom-gift-text-preview" class="gmd-text-gift-icon" style="width:64px;height:64px;align-self:center;color:#fff;font-size:20px;border:1px dashed rgba(255,255,255,.18);">TEXT</div>
                        </div>
                    </div>
                    <div class="gmd-modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #1e293b; padding-top:14px; margin-top:18px;">
                        <button class="gmd-btn" style="background:#334155; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;" onclick="document.getElementById('${modalId}').remove()">Hủy</button>
                        <button class="gmd-btn primary" id="gmd-custom-gift-save-btn" style="background:#a855f7; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">Thêm Quà</button>
                    </div>
                </div>
            `;

            this.mount.appendChild(modal);

            const fileInput = modal.querySelector('#gmd-custom-gift-file-input');
            const uploadBtn = modal.querySelector('#gmd-custom-gift-upload-btn');
            const previewContainer = modal.querySelector('#gmd-custom-gift-preview-container');
            const saveBtn = modal.querySelector('#gmd-custom-gift-save-btn');
            const modeSelect = modal.querySelector('#gmd-custom-gift-display-mode');
            const mediaFields = modal.querySelector('#gmd-custom-gift-media-fields');
            const textFields = modal.querySelector('#gmd-custom-gift-text-fields');
            const displayTextInput = modal.querySelector('#gmd-custom-gift-display-text');
            const textColorInput = modal.querySelector('#gmd-custom-gift-text-color');
            const textSizeInput = modal.querySelector('#gmd-custom-gift-text-size');
            const textPreview = modal.querySelector('#gmd-custom-gift-text-preview');

            let selectedFile = null;
            let previewUrl = '';

            const updateTextPreview = () => {
                const textValue = displayTextInput.value.trim() || 'TEXT';
                const size = Math.max(10, Math.min(40, Number(textSizeInput.value) || 20));
                textPreview.textContent = textValue;
                textPreview.style.color = textColorInput.value || '#ffffff';
                textPreview.style.fontSize = `${size}px`;
            };
            modeSelect.onchange = () => {
                const textMode = modeSelect.value === 'text';
                mediaFields.style.display = textMode ? 'none' : 'flex';
                textFields.style.display = textMode ? 'flex' : 'none';
                if (textMode) displayTextInput.focus();
            };
            displayTextInput.oninput = updateTextPreview;
            textColorInput.oninput = updateTextPreview;
            textSizeInput.oninput = updateTextPreview;

            uploadBtn.onclick = () => fileInput.click();

            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const ext = `.${String(file.name || '').split('.').pop().toLowerCase()}`;
                const allowed = new Set(['.png', '.gif', '.webm']);
                if (!allowed.has(ext) || (file.type && !['image/png', 'image/gif', 'video/webm'].includes(file.type))) {
                    alert('Chỉ hỗ trợ PNG, GIF và WebM.');
                    fileInput.value = '';
                    return;
                }
                if (file.size > 50 * 1024 * 1024) {
                    alert('File phải nhỏ hơn 50 MB trước khi tối ưu.');
                    fileInput.value = '';
                    return;
                }
                selectedFile = file;
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                previewUrl = URL.createObjectURL(file);
                previewContainer.innerHTML = ext === '.webm'
                    ? `<video src="${previewUrl}" style="width:100%; height:100%; object-fit:contain;" autoplay loop muted playsinline></video>`
                    : `<img src="${previewUrl}" style="width:100%; height:100%; object-fit:contain;" />`;
            };

            saveBtn.onclick = async () => {
                const id = modal.querySelector('#gmd-custom-gift-id').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                const name = modal.querySelector('#gmd-custom-gift-name').value.trim();
                const displayMode = modeSelect.value === 'text' ? 'text' : 'media';
                const displayText = displayTextInput.value.trim().slice(0, 12);
                const textColor = textColorInput.value || '#ffffff';
                const textSize = Math.max(10, Math.min(40, Number(textSizeInput.value) || 20));

                if (!id) {
                    alert('Vui lòng nhập ID quà tặng hợp lệ (chỉ chữ thường, số, dấu gạch dưới).');
                    return;
                }
                if (!name) {
                    alert('Vui lòng nhập tên quà tặng.');
                    return;
                }
                if (displayMode === 'media' && !selectedFile) {
                    alert('Vui lòng chọn file PNG, GIF hoặc WebM cho quà tặng.');
                    return;
                }
                if (displayMode === 'text' && !displayText) {
                    alert('Vui lòng nhập chữ sẽ hiển thị thay icon.');
                    return;
                }

                if (this.gifts.some(g => String(g.id).toLowerCase() === id.toLowerCase())) {
                    alert('ID quà tặng này đã tồn tại trong danh sách. Vui lòng dùng ID khác!');
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.textContent = displayMode === 'media' ? 'Đang tối ưu...' : 'Đang lưu...';
                let uploadedAsset = null;
                if (displayMode === 'media') {
                    try {
                        const uploadIconFile = await this.optimizePngUpload(selectedFile, 512);
                        const formData = new FormData();
                        formData.append('assetFile', uploadIconFile);
                        const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
                        const res = await fetch(`${this.apiBase}/api/tiktok/goal-board/upload-asset`, { method: 'POST', headers, body: formData });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || !data.success || !data.asset) {
                            if (this.handlePlanLimit(data, 'menuAssets')) {
                                saveBtn.disabled = false;
                                saveBtn.textContent = 'Thêm Quà';
                                return;
                            }
                            throw new Error(data.error || `HTTP ${res.status}`);
                        }
                        uploadedAsset = data.asset;
                    } catch (error) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Thêm Quà';
                        alert(`Không thể tải icon: ${error.message}`);
                        return;
                    }
                }

                const newGift = {
                    id,
                    name,
                    icon: uploadedAsset?.url || '',
                    format: uploadedAsset?.format || (displayMode === 'text' ? 'text' : ''),
                    isVideo: uploadedAsset?.format === 'webm',
                    displayMode,
                    displayText: displayMode === 'text' ? displayText : '',
                    textColor,
                    textSize,
                    isCustom: true,
                    coins: 1
                };

                let customGifts = [];
                try { customGifts = JSON.parse(localStorage.getItem('es_custom_gifts') || '[]'); } catch (_e) { }
                if (!Array.isArray(customGifts)) customGifts = [];
                customGifts.push(newGift);
                try {
                    localStorage.setItem('es_custom_gifts', JSON.stringify(customGifts));
                } catch (_e) {
                    alert('Không đủ dung lượng lưu quà custom trên máy.');
                    return;
                }

                this.gifts.unshift(newGift);
                this.filteredGifts = [...this.gifts];
                this.renderGiftLibrary();
                if (uploadedAsset) await this.loadGoalAssets();
                if (window.app && typeof window.app.showNotification === 'function') {
                    const savedPercent = uploadedAsset?.optimized && uploadedAsset.originalSize
                        ? Math.max(1, Math.round((1 - uploadedAsset.size / uploadedAsset.originalSize) * 100))
                        : 0;
                    window.app.showNotification('success', savedPercent > 0
                        ? `Đã thêm quà và giảm khoảng ${savedPercent}% dung lượng media.`
                        : 'Đã thêm quà tặng tự chọn.');
                }

                if (previewUrl) URL.revokeObjectURL(previewUrl);
                modal.remove();
            };
        }
    }

    const initDesigner = () => {
        const designer = new GiftMenuDesigner();
        designer.init();
        window.giftMenuDesigner = designer;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDesigner);
    } else {
        initDesigner();
    }
})();

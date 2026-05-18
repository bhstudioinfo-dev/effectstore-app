/**
 * 🎨 GIFT MENU DESIGNER
 * Phase 1.6: Real TikTok Gifts Integration
 */

class GiftMenuDesigner {
    constructor() {
        this.containerId = 'gift-menu-designer-view';
        this.canvasId = 'designer-canvas';
        this.items = []; // Current items on canvas
        this.selectedItemId = null;
        
        // Data
        this.gifts = []; // Real TikTok gifts from API
        
        // Settings
        this.gridEnabled = false;
        this.snapEnabled = false;
        this.currentRatio = '9:16';
        
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
    }

    async init() {
        console.log('🎨 GiftMenuDesigner initializing...');
        this.renderLayout();
        await this.loadGifts();
        this.renderLibrary();
        this.setupEventListeners();
    }

    async loadGifts() {
        try {
            const baseUrl = (window.app && window.app.API_URL) ? window.app.API_URL : 'http://127.0.0.1:9000';
            const token = localStorage.getItem('token');
            const response = await fetch(baseUrl + '/api/tiktok/gifts-library', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.gifts = data.gifts || [];
                console.log(`✅ Loaded ${this.gifts.length} real TikTok gifts for Designer`);
            } else {
                console.error('❌ Failed to load gifts:', data.message);
            }
        } catch (error) {
            console.error('❌ Error loading gifts for Designer:', error);
            if (window.app) app.showNotification('error', 'Không thể tải danh sách Gifts');
        }
    }

    renderLayout() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <!-- Top Toolbar -->
            <div class="designer-toolbar">
                <div class="toolbar-group">
                    <div style="font-weight: 900; color: var(--primary); font-size: 14px; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; margin-right: 10px;">
                        <i class="fas fa-magic"></i> ES DESIGNER
                    </div>
                </div>

                <div class="toolbar-group">
                    <button class="toolbar-btn" title="Undo (Ctrl+Z)" onclick="giftDesigner.undo()">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="toolbar-btn" title="Redo (Ctrl+Y)" onclick="giftDesigner.redo()">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>

                <div class="toolbar-group">
                    <button id="toggle-grid-btn" class="toolbar-btn ${this.gridEnabled ? 'active' : ''}" title="Toggle Grid" onclick="giftDesigner.toggleGrid()">
                        <i class="fas fa-th"></i>
                    </button>
                    <button id="toggle-snap-btn" class="toolbar-btn ${this.snapEnabled ? 'active' : ''}" title="Snap to Grid" onclick="giftDesigner.toggleSnap()">
                        <i class="fas fa-magnet"></i>
                    </button>
                </div>

                <div class="toolbar-spacer"></div>

                <div class="toolbar-group">
                    <button class="toolbar-btn text-btn" onclick="giftDesigner.preview()">
                        <i class="fas fa-play"></i> Xem thử
                    </button>
                    <button class="toolbar-btn text-btn primary" onclick="giftDesigner.saveProject()">
                        <i class="fas fa-save"></i> Lưu
                    </button>
                    <button class="toolbar-btn text-btn" onclick="giftDesigner.export()">
                        <i class="fas fa-download"></i> Xuất bản
                    </button>
                </div>
            </div>
            
            <div class="designer-container">
                <!-- Left: Library -->
                <div class="designer-panel">
                    <div class="panel-header">
                        <h3><i class="fas fa-shapes"></i> Gift Library</h3>
                        <div id="library-count" style="font-size: 10px; color: var(--text-muted); font-weight: 800;">0 ITEMS</div>
                    </div>

                    <div class="library-search-wrap">
                        <div class="search-input-group">
                            <i class="fas fa-search"></i>
                            <input type="text" placeholder="Tìm kiếm quà tặng..." oninput="giftDesigner.filterLibrary(this.value)">
                        </div>
                        <div class="library-filters">
                            <select class="filter-select" onchange="giftDesigner.renderLibrary()">
                                <option value="all">Tất cả hạng</option>
                                <option value="common">Phổ biến</option>
                                <option value="rare">Hiếm</option>
                                <option value="legendary">Huyền thoại</option>
                            </select>
                            <select id="library-sort" class="filter-select" onchange="giftDesigner.renderLibrary()">
                                <option value="price-asc">Giá thấp → cao</option>
                                <option value="price-desc">Giá cao → thấp</option>
                                <option value="name-asc">Tên A → Z</option>
                            </select>
                        </div>
                    </div>

                    <div id="designer-library" class="gift-library">
                        <!-- Gifts will be rendered here -->
                    </div>
                </div>

                <!-- Center: Canvas Area -->
                <div class="designer-panel canvas-area">
                    <div class="canvas-controls-top">
                        <button class="ratio-btn ${this.currentRatio === '9:16' ? 'active' : ''}" onclick="giftDesigner.setRatio('9:16')">9:16</button>
                        <button class="ratio-btn ${this.currentRatio === '16:9' ? 'active' : ''}" onclick="giftDesigner.setRatio('16:9')">16:9</button>
                        <button class="ratio-btn ${this.currentRatio === '1:1' ? 'active' : ''}" onclick="giftDesigner.setRatio('1:1')">1:1</button>
                    </div>

                    <div id="${this.canvasId}" class="canvas-wrapper ${this.gridEnabled ? 'grid-on' : ''}">
                        <!-- Canvas items will be rendered here -->
                    </div>

                    <!-- Bottom Export Bar -->
                    <div class="designer-export-bar">
                        <div class="export-url-wrap">
                            <label>OBS URL</label>
                            <input type="text" readonly value="${(window.app && app.API_URL) || 'http://localhost:9000'}/api/overlay/designer/${(app.currentUser && (app.currentUser._id || app.currentUser.id)) || 'guest'}">
                        </div>
                        <div class="export-actions">
                            <button class="export-btn" onclick="giftDesigner.copyURL()">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                            <button class="export-btn" onclick="giftDesigner.exportHTML()">
                                <i class="fas fa-file-code"></i> Export HTML
                            </button>
                            <button class="export-btn primary" onclick="giftDesigner.preview()">
                                <i class="fas fa-external-link-alt"></i> Preview
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right: Inspector -->
                <div class="designer-panel">
                    <div class="panel-header">
                        <h3><i class="fas fa-fingerprint"></i> Inspector</h3>
                        <button class="toolbar-btn" style="width: 24px; height: 24px;" title="Reset" onclick="giftDesigner.resetSelectedItem()">
                            <i class="fas fa-undo-alt" style="font-size: 10px;"></i>
                        </button>
                    </div>
                    <div id="designer-inspector" class="inspector-content">
                        <!-- Inspector content rendered here -->
                    </div>
                </div>
            </div>
        `;
    }

    renderLibrary(filterText = '') {
        const library = document.getElementById('designer-library');
        const countLabel = document.getElementById('library-count');
        if (!library) return;

        let filtered = this.gifts.filter(g => 
            g.name.toLowerCase().includes(filterText.toLowerCase())
        );

        // Sort logic
        const sortVal = document.getElementById('library-sort')?.value || 'price-asc';
        if (sortVal === 'price-asc') filtered.sort((a, b) => (a.coins || 0) - (b.coins || 0));
        else if (sortVal === 'price-desc') filtered.sort((a, b) => (b.coins || 0) - (a.coins || 0));
        else if (sortVal === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name));

        if (countLabel) countLabel.innerText = `${filtered.length} GIFTS`;

        const baseUrl = (window.app && window.app.API_URL) ? window.app.API_URL : 'http://127.0.0.1:9000';

        library.innerHTML = filtered.map(gift => {
            const giftId = gift.id;
            const isImage = gift.icon && (gift.icon.includes('/') || gift.icon.includes('.'));
            
            let iconHTML = '';
            if (isImage) {
                const iconUrl = gift.icon.startsWith('http') ? gift.icon : `${baseUrl}${gift.icon}`;
                iconHTML = `<img src="${iconUrl}" style="width: 44px; height: 44px; object-fit: contain;">`;
            } else {
                iconHTML = `<div style="font-size: 32px;">${gift.icon || '🎁'}</div>`;
            }

            return `
                <div class="library-item" onclick="giftDesigner.addToCanvas('${giftId}')">
                    <div class="gift-media-wrap" style="height: 50px; margin-bottom: 8px; display: flex; align-items: center; justify-content: center;">
                        ${iconHTML}
                    </div>
                    <div class="gift-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; font-size: 11px;">${gift.name}</div>
                    <div class="gift-price" style="font-size: 10px; color: var(--secondary);">${gift.coins || 0} coins</div>
                </div>
            `;
        }).join('');
    }

    filterLibrary(val) {
        this.renderLibrary(val);
    }

    setRatio(ratio) {
        this.currentRatio = ratio;
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) return;

        if (ratio === '9:16') {
            canvas.style.width = '360px';
            canvas.style.height = '640px';
        } else if (ratio === '16:9') {
            canvas.style.width = '640px';
            canvas.style.height = '360px';
        } else if (ratio === '1:1') {
            canvas.style.width = '450px';
            canvas.style.height = '450px';
        }

        // Update UI
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            btn.classList.toggle('active', btn.innerText === ratio);
        });
    }

    toggleGrid() {
        this.gridEnabled = !this.gridEnabled;
        const canvas = document.getElementById(this.canvasId);
        const btn = document.getElementById('toggle-grid-btn');
        if (canvas) canvas.classList.toggle('grid-on', this.gridEnabled);
        if (btn) btn.classList.toggle('active', this.gridEnabled);
    }

    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
        const btn = document.getElementById('toggle-snap-btn');
        if (btn) btn.classList.toggle('active', this.snapEnabled);
    }

    addToCanvas(giftId) {
        const gift = this.gifts.find(g => g.id === giftId);
        if (!gift) return;

        const newItem = {
            id: 'item_' + Date.now(),
            giftId: gift.id,
            name: gift.name,
            icon: gift.icon || '🎁',
            x: 100 + (Math.random() * 50),
            y: 100 + (Math.random() * 50),
            scale: 1,
            rotation: 0,
            aura: 'none',
            animation: 'none'
        };

        this.items.push(newItem);
        this.renderCanvas();
        this.selectItem(newItem.id);
    }

    renderCanvas() {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) return;

        const baseUrl = (window.app && window.app.API_URL) ? window.app.API_URL : 'http://127.0.0.1:9000';

        canvas.innerHTML = this.items.map(item => {
            const isImage = item.icon && (item.icon.includes('/') || item.icon.includes('.'));
            let iconHTML = '';
            
            if (isImage) {
                const iconUrl = item.icon.startsWith('http') ? item.icon : `${baseUrl}${item.icon}`;
                iconHTML = `<img src="${iconUrl}" style="width: 54px; height: 54px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(167, 139, 250, 0.8)); z-index: 2;">`;
            } else {
                iconHTML = `<div class="icon" style="font-size: 40px;">${item.icon}</div>`;
            }

            return `
                <div id="${item.id}" 
                     class="designer-item ${this.selectedItemId === item.id ? 'selected' : ''}" 
                     style="left: ${item.x}px; top: ${item.y}px; transform: rotate(${item.rotation}deg) scale(${item.scale});"
                     onmousedown="giftDesigner.startDrag(event, '${item.id}')">
                    ${item.aura !== 'none' ? `<div class="aura" style="background: ${this.getAuraColor(item.aura)}"></div>` : ''}
                    ${iconHTML}
                    <div class="name-tag">${item.name}</div>
                </div>
            `;
        }).join('');
    }

    getAuraColor(aura) {
        const colors = {
            'purple': 'radial-gradient(circle, rgba(167, 139, 250, 0.5) 0%, transparent 70%)',
            'gold': 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, transparent 70%)',
            'red': 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 0%, transparent 70%)',
            'blue': 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)'
        };
        return colors[aura] || colors['purple'];
    }

    selectItem(id) {
        this.selectedItemId = id;
        this.renderCanvas();
        this.renderInspector();
    }

    renderInspector() {
        const inspector = document.getElementById('designer-inspector');
        if (!inspector) return;

        const item = this.items.find(i => i.id === this.selectedItemId);
        if (!item) {
            inspector.innerHTML = `
                <div class="empty-inspector">
                    <div class="empty-state-icon">
                        <i class="fas fa-mouse-pointer"></i>
                    </div>
                    <h4>No Selection</h4>
                    <p>Chọn một món quà trên canvas để tùy chỉnh</p>
                </div>
            `;
            return;
        }

        inspector.innerHTML = `
            <div class="inspector-group">
                <label>Tên hiển thị</label>
                <input type="text" class="inspector-control" value="${item.name}" 
                       oninput="giftDesigner.updateSelectedItem('name', this.value)">
            </div>

            <div class="inspector-row">
                <div class="inspector-group">
                    <label>Tọa độ X</label>
                    <input type="number" class="inspector-control" value="${Math.round(item.x)}"
                           oninput="giftDesigner.updateSelectedItem('x', parseInt(this.value))">
                </div>
                <div class="inspector-group">
                    <label>Tọa độ Y</label>
                    <input type="number" class="inspector-control" value="${Math.round(item.y)}"
                           oninput="giftDesigner.updateSelectedItem('y', parseInt(this.value))">
                </div>
            </div>

            <div class="inspector-group">
                <label>Kích thước (Scale: ${item.scale})</label>
                <input type="range" min="0.5" max="3" step="0.1" value="${item.scale}" 
                       oninput="giftDesigner.updateSelectedItem('scale', parseFloat(this.value))">
            </div>

            <div class="inspector-group">
                <label>Xoay (Degrees: ${item.rotation}°)</label>
                <input type="range" min="0" max="360" step="1" value="${item.rotation}" 
                       oninput="giftDesigner.updateSelectedItem('rotation', parseInt(this.value))">
            </div>

            <div class="inspector-group">
                <label>Hiệu ứng Aura</label>
                <select class="inspector-control" onchange="giftDesigner.updateSelectedItem('aura', this.value)">
                    <option value="none" ${item.aura === 'none' ? 'selected' : ''}>Không có</option>
                    <option value="purple" ${item.aura === 'purple' ? 'selected' : ''}>Tím Neon</option>
                    <option value="gold" ${item.aura === 'gold' ? 'selected' : ''}>Vàng Kim</option>
                    <option value="red" ${item.aura === 'red' ? 'selected' : ''}>Đỏ Lửa</option>
                    <option value="blue" ${item.aura === 'blue' ? 'selected' : ''}>Xanh Nước</option>
                </select>
            </div>

            <div class="inspector-group" style="margin-top: 20px;">
                <button class="toolbar-btn text-btn" style="width: 100%; border-color: #ef4444; color: #ef4444;" 
                        onclick="giftDesigner.deleteSelectedItem()">
                    <i class="fas fa-trash"></i> Xóa phần tử
                </button>
            </div>
        `;
    }

    updateSelectedItem(key, value) {
        const item = this.items.find(i => i.id === this.selectedItemId);
        if (item) {
            item[key] = value;
            this.renderCanvas();
            // Don't re-render whole inspector for text inputs to avoid focus loss
            if (['scale', 'rotation', 'aura'].includes(key)) {
                this.renderInspector();
            }
        }
    }

    resetSelectedItem() {
        const item = this.items.find(i => i.id === this.selectedItemId);
        if (item) {
            item.scale = 1;
            item.rotation = 0;
            item.aura = 'none';
            this.renderCanvas();
            this.renderInspector();
        }
    }

    deleteSelectedItem() {
        if (!this.selectedItemId) return;
        this.items = this.items.filter(i => i.id !== this.selectedItemId);
        this.selectedItemId = null;
        this.renderCanvas();
        this.renderInspector();
    }

    // Placeholders for Phase 1
    undo() { app.showNotification('info', 'Undo: Tính năng sẽ có trong Phase 2'); }
    redo() { app.showNotification('info', 'Redo: Tính năng sẽ có trong Phase 2'); }
    preview() { app.showNotification('info', 'Preview: Đang mở cửa sổ xem thử...'); }
    export() { app.showNotification('warning', 'Export: Vui lòng lưu thiết kế trước'); }
    copyURL() { 
        const input = document.querySelector('.export-url-wrap input');
        input.select();
        document.execCommand('copy');
        app.showNotification('success', '✅ Đã copy URL OBS');
    }
    exportHTML() { app.showNotification('info', 'HTML Export: Tính năng đang phát triển'); }

    clearCanvas() {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ thiết kế?')) {
            this.items = [];
            this.selectedItemId = null;
            this.renderCanvas();
            this.renderInspector();
        }
    }

    saveProject() {
        console.log('💾 Saving project:', this.items);
        app.showNotification('success', '✅ Đã lưu thiết kế thành công!');
    }

    startDrag(e, id) {
        e.preventDefault();
        this.selectItem(id);
        const item = this.items.find(i => i.id === id);
        if (!item) return;

        this.isDragging = true;
        this.dragOffset = {
            x: e.clientX - item.x,
            y: e.clientY - item.y
        };

        const onMouseMove = (moveEvent) => {
            if (!this.isDragging) return;
            
            let newX = moveEvent.clientX - this.dragOffset.x;
            let newY = moveEvent.clientY - this.dragOffset.y;
            
            // Snap logic placeholder
            if (this.snapEnabled) {
                newX = Math.round(newX / 20) * 20;
                newY = Math.round(newY / 20) * 20;
            }
            
            item.x = newX;
            item.y = newY;
            this.renderCanvas();
        };

        const onMouseUp = () => {
            this.isDragging = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            this.renderInspector();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    setupEventListeners() {
        const canvas = document.getElementById(this.canvasId);
        if (canvas) {
            canvas.addEventListener('mousedown', (e) => {
                if (e.target.id === this.canvasId) {
                    this.selectedItemId = null;
                    this.renderCanvas();
                    this.renderInspector();
                }
            });
        }
    }
}

// Global instance
window.giftDesigner = new GiftMenuDesigner();

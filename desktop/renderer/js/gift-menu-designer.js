/**
 * Gift Menu Designer Logic
 * Author: Antigravity AI
 */

class GiftMenuDesigner {
    constructor() {
        this.canvas = document.getElementById('gmd-canvas');
        this.library = document.getElementById('gmd-gift-library');
        this.inspector = document.getElementById('gmd-inspector');
        this.zoomLevelEl = document.getElementById('gmd-zoom-level');

        this.state = {
            name: "Bản thiết kế mới",
            items: [], // { uid, giftId, name, icon, x, y, size, animation, showText, textColor, fontSize, gap }
            zoom: 1,
            selectedId: null,
            gridSize: 20,
            showGrid: true,
            layoutType: 'both', // left, right, both
            spacing: 20
        };

        this.history = [];
        this.historyIndex = -1;

        this.gifts = []; // Raw gift library
        this.API_URL = 'http://localhost:9000';

        this.isDragging = false;
        this.draggedItem = null;
        this.dragOffset = { x: 0, y: 0 };

        this.init();
    }

    init() {
        console.log("🎨 Gift Menu Designer Initializing...");
        this.loadGifts();
        this.setupEventListeners();
        this.pushHistory();
        this.render();
    }

    async loadGifts() {
        try {
            const res = await fetch(`${this.API_URL}/api/tiktok/gifts-library`);
            const data = await res.json();
            if (data.success) {
                this.gifts = data.gifts;
                this.renderLibrary();
            }
        } catch (error) {
            console.error("Error loading gifts:", error);
        }
    }

    renderLibrary(filter = '') {
        if (!this.library) return;

        const filteredGifts = this.gifts.filter(g =>
            g.name.toLowerCase().includes(filter.toLowerCase())
        );

        this.library.innerHTML = filteredGifts.map(gift => `
            <div class="gmd-gift-item" draggable="true" ondragstart="gmd.onDragStart(event, '${gift.id}')">
                <div class="gmd-gift-icon">
                    <img src="${this.API_URL}${gift.icon}" style="width: 32px; height: 32px; object-fit: contain;">
                </div>
                <div class="gmd-gift-name">${gift.name}</div>
            </div>
        `).join('');
    }

    filterLibrary() {
        const filter = document.getElementById('gmd-search-gifts').value;
        this.renderLibrary(filter);
    }

    setupEventListeners() {
        // Global mouse events for dragging on canvas
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());

        // Deselect when clicking canvas background
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.target === this.canvas) {
                this.selectItem(null);
            }
        });

        // Shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') this.undo();
            if (e.ctrlKey && e.key === 'y') this.redo();
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.state.selectedId && document.activeElement.tagName !== 'INPUT') {
                    this.deleteSelectedItem();
                }
            }
        });
    }

    // --- Drag & Drop from Library ---
    onDragStart(e, giftId) {
        e.dataTransfer.setData('giftId', giftId);
    }

    onDragOver(e) {
        e.preventDefault();
    }

    onDrop(e) {
        e.preventDefault();
        const giftId = e.dataTransfer.getData('giftId');
        const gift = this.gifts.find(g => g.id == giftId);

        if (gift) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.state.zoom;
            const y = (e.clientY - rect.top) / this.state.zoom;

            this.addItem(gift, x, y);
        }
    }

    // --- Item Management ---
    addItem(gift, x, y) {
        const newItem = {
            uid: 'item_' + Date.now(),
            giftId: gift.id,
            name: gift.name,
            icon: gift.icon,
            x: x - 40, // Center item
            y: y - 40,
            size: 80,
            animation: 'none',
            showText: true,
            textColor: '#ffcc70',
            fontSize: 14,
            gap: 5
        };

        this.state.items.push(newItem);
        this.pushHistory();
        this.selectItem(newItem.uid);
        this.render();
    }

    deleteSelectedItem() {
        if (!this.state.selectedId) return;
        this.state.items = this.state.items.filter(item => item.uid !== this.state.selectedId);
        this.state.selectedId = null;
        this.pushHistory();
        this.render();
    }

    selectItem(uid) {
        this.state.selectedId = uid;
        this.renderInspector();
        this.render(); // Re-render to show selection highlight
    }

    // --- Dragging on Canvas ---
    onItemMouseDown(e, uid) {
        e.stopPropagation();
        this.selectItem(uid);
        this.isDragging = true;
        this.draggedItem = this.state.items.find(item => item.uid === uid);

        const rect = this.canvas.getBoundingClientRect();
        this.dragOffset = {
            x: (e.clientX - rect.left) / this.state.zoom - this.draggedItem.x,
            y: (e.clientY - rect.top) / this.state.zoom - this.draggedItem.y
        };
    }

    onMouseMove(e) {
        if (this.isDragging && this.draggedItem) {
            const rect = this.canvas.getBoundingClientRect();
            let newX = (e.clientX - rect.left) / this.state.zoom - this.dragOffset.x;
            let newY = (e.clientY - rect.top) / this.state.zoom - this.dragOffset.y;

            // Snap to grid if enabled
            if (this.state.showGrid) {
                newX = Math.round(newX / 10) * 10;
                newY = Math.round(newY / 10) * 10;
            }

            this.draggedItem.x = newX;
            this.draggedItem.y = newY;
            this.render();
            this.updateInspectorValues();
        }
    }

    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggedItem = null;
            this.pushHistory();
        }
    }

    // --- Rendering ---
    render() {
        if (!this.canvas) return;

        // Update Canvas CSS for zoom
        this.canvas.style.transform = `scale(${this.state.zoom})`;

        // Render items
        const itemsHtml = this.state.items.map(item => {
            const isSelected = item.uid === this.state.selectedId;
            const animClass = item.animation !== 'none' ? `anim-${item.animation}` : '';

            return `
                <div id="${item.uid}" 
                     class="gmd-item ${isSelected ? 'selected' : ''} ${animClass}"
                     style="left: ${item.x}px; top: ${item.y}px; width: ${item.size}px; height: ${item.size + (item.showText ? 30 : 0)}px;"
                     onmousedown="gmd.onItemMouseDown(event, '${item.uid}')"
                >
                    <div class="gmd-item-icon" style="width: ${item.size}px; height: ${item.size}px; font-size: ${item.size * 0.5}px;">
                        <img src="${this.API_URL}${item.icon}" style="width: 80%; height: 80%; object-fit: contain;">
                        <div class="gmd-item-glow" style="background: ${item.textColor};"></div>
                    </div>
                    ${item.showText ? `
                        <div class="gmd-item-text" style="color: ${item.textColor}; font-size: ${item.fontSize}px; margin-top: ${item.gap}px;">
                            ${item.name}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        this.canvas.innerHTML = itemsHtml;
    }

    renderInspector() {
        if (!this.inspector) return;

        const item = this.state.items.find(i => i.uid === this.state.selectedId);

        if (!item) {
            this.inspector.innerHTML = `
                <div class="gmd-inspector-header">
                    <h3>⚙️ Cài đặt chung</h3>
                </div>
                <div class="gmd-inspector-body">
                    <div class="gmd-control-group">
                        <label>Layout Type</label>
                        <select class="gmd-select" onchange="gmd.updateGlobal('layoutType', this.value)">
                            <option value="both" ${this.state.layoutType === 'both' ? 'selected' : ''}>Cả 2 bên</option>
                            <option value="left" ${this.state.layoutType === 'left' ? 'selected' : ''}>Bên trái</option>
                            <option value="right" ${this.state.layoutType === 'right' ? 'selected' : ''}>Bên phải</option>
                        </select>
                    </div>
                    <div class="gmd-control-group">
                        <label>Spacing</label>
                        <div class="gmd-slider-wrap">
                            <input type="range" class="gmd-slider" min="0" max="100" value="${this.state.spacing}" oninput="gmd.updateGlobal('spacing', this.value)">
                            <span class="gmd-slider-val">${this.state.spacing}px</span>
                        </div>
                    </div>
                    <div class="gmd-control-group">
                        <div class="gmd-toggle-row">
                            <label style="margin:0">Hiện lưới</label>
                            <input type="checkbox" ${this.state.showGrid ? 'checked' : ''} onchange="gmd.toggleGrid()">
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        this.inspector.innerHTML = `
            <div class="gmd-inspector-header">
                <h3>🛠 Thuộc tính Item</h3>
                <button class="gmd-btn-icon" onclick="gmd.deleteSelectedItem()"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="gmd-inspector-body">
                <div class="gmd-control-group">
                    <label>Vị trí (X / Y)</label>
                    <div class="gmd-input-row">
                        <div class="gmd-field">
                            <span>X</span>
                            <input type="number" class="gmd-input" value="${Math.round(item.x)}" onchange="gmd.updateItem('x', this.value)">
                        </div>
                        <div class="gmd-field">
                            <span>Y</span>
                            <input type="number" class="gmd-input" value="${Math.round(item.y)}" onchange="gmd.updateItem('y', this.value)">
                        </div>
                    </div>
                </div>

                <div class="gmd-control-group">
                    <label>Kích thước</label>
                    <div class="gmd-slider-wrap">
                        <input type="range" class="gmd-slider" min="40" max="150" value="${item.size}" oninput="gmd.updateItem('size', this.value)">
                        <span class="gmd-slider-val">${item.size}px</span>
                    </div>
                </div>

                <div class="gmd-control-group">
                    <label>Hiệu ứng (Animation)</label>
                    <select class="gmd-select" onchange="gmd.updateItem('animation', this.value)">
                        <option value="none" ${item.animation === 'none' ? 'selected' : ''}>Không</option>
                        <option value="pulse" ${item.animation === 'pulse' ? 'selected' : ''}>Pulse (Nhịp đập)</option>
                        <option value="bounce" ${item.animation === 'bounce' ? 'selected' : ''}>Bounce (Nhảy)</option>
                        <option value="fade" ${item.animation === 'fade' ? 'selected' : ''}>Fade (Ẩn hiện)</option>
                    </select>
                </div>

                <div class="gmd-control-group">
                    <div class="gmd-toggle-row">
                        <label style="margin:0">Hiện tên quà</label>
                        <input type="checkbox" ${item.showText ? 'checked' : ''} onchange="gmd.updateItem('showText', this.checked)">
                    </div>
                </div>

                <div id="gmd-text-settings" style="display: ${item.showText ? 'block' : 'none'}">
                    <div class="gmd-control-group">
                        <label>Màu chữ & Glow</label>
                        <input type="color" class="gmd-input" value="${item.textColor}" onchange="gmd.updateItem('textColor', this.value)" style="height:40px; padding:2px;">
                    </div>
                    <div class="gmd-control-group">
                        <label>Cỡ chữ</label>
                        <div class="gmd-slider-wrap">
                            <input type="range" class="gmd-slider" min="10" max="30" value="${item.fontSize}" oninput="gmd.updateItem('fontSize', this.value)">
                            <span class="gmd-slider-val">${item.fontSize}px</span>
                        </div>
                    </div>
                    <div class="gmd-control-group">
                        <label>Khoảng cách (Gap)</label>
                        <div class="gmd-slider-wrap">
                            <input type="range" class="gmd-slider" min="0" max="20" value="${item.gap}" oninput="gmd.updateItem('gap', this.value)">
                            <span class="gmd-slider-val">${item.gap}px</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updateInspectorValues() {
        // Update only specific values without full re-render for performance during drag
        if (!this.state.selectedId) return;
        const item = this.state.items.find(i => i.uid === this.state.selectedId);
        if (item) {
            const inputs = this.inspector.querySelectorAll('input[type="number"]');
            if (inputs.length >= 2) {
                inputs[0].value = Math.round(item.x);
                inputs[1].value = Math.round(item.y);
            }
        }
    }

    updateItem(key, value) {
        if (!this.state.selectedId) return;
        const item = this.state.items.find(i => i.uid === this.state.selectedId);
        if (item) {
            // Convert to number if applicable
            if (key === 'x' || key === 'y' || key === 'size' || key === 'fontSize' || key === 'gap') {
                value = parseInt(value);
            }

            item[key] = value;
            this.render();
            this.renderInspector();
            this.pushHistory();
        }
    }

    updateGlobal(key, value) {
        if (key === 'spacing') value = parseInt(value);
        this.state[key] = value;
        this.render();
        this.renderInspector();
        this.pushHistory();
    }

    // --- Zoom Controls ---
    zoomIn() {
        this.state.zoom = Math.min(this.state.zoom + 0.1, 2);
        this.updateZoomUI();
    }

    zoomOut() {
        this.state.zoom = Math.max(this.state.zoom - 0.1, 0.5);
        this.updateZoomUI();
    }

    resetZoom() {
        this.state.zoom = 1;
        this.updateZoomUI();
    }

    updateZoomUI() {
        this.zoomLevelEl.textContent = Math.round(this.state.zoom * 100) + '%';
        this.render();
    }

    toggleGrid() {
        this.state.showGrid = !this.state.showGrid;
        if (this.state.showGrid) {
            this.canvas.classList.add('checkerboard');
        } else {
            this.canvas.classList.remove('checkerboard');
        }
        this.renderInspector();
    }

    clearCanvas() {
        if (confirm("Xóa tất cả các vật phẩm trên canvas?")) {
            this.state.items = [];
            this.pushHistory();
            this.render();
            this.renderInspector();
        }
    }

    // --- History (Undo/Redo) ---
    pushHistory() {
        // Deep clone state for history
        const stateCopy = JSON.parse(JSON.stringify(this.state));

        // Remove forward history if we are in the middle of it
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(stateCopy);
        if (this.history.length > 50) this.history.shift();
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.render();
            this.renderInspector();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.render();
            this.renderInspector();
        }
    }

    // --- Actions ---
    async save() {
        console.log("Saving layout:", this.state);
        localStorage.setItem('gmd_layout', JSON.stringify(this.state));

        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', '✅ Đã lưu thiết kế thành công!');
        } else {
            alert("Đã lưu thiết kế!");
        }
    }

    preview() {
        this.save();
        window.open('overlay.html?preview=true', '_blank', 'width=400,height=600');
    }

    exportOBS() {
        this.save();
        const overlayUrl = window.location.href.replace('index.html', 'overlay.html');

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 100000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div style="background: #161625; padding: 30px; border-radius: 16px; border: 1px solid var(--gmd-accent); max-width: 500px; width: 90%; color: white;">
                <h3 style="margin-top: 0; color: var(--gmd-accent);">🚀 Xuất OBS Overlay</h3>
                <p style="font-size: 14px; color: #94a3b8; margin-bottom: 20px;">Copy đường dẫn dưới đây và dán vào <strong>Browser Source</strong> trong OBS của bạn.</p>
                <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; word-break: break-all; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px;">
                    ${overlayUrl}
                </div>
                <div style="display:flex; gap: 10px;">
                    <button onclick="navigator.clipboard.writeText('${overlayUrl}'); alert('Đã copy!');" style="flex: 1; background: var(--gmd-accent); color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 700;">Copy URL</button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer;">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }
}

// Initialize global instance
const gmd = new GiftMenuDesigner();
window.gmd = gmd;

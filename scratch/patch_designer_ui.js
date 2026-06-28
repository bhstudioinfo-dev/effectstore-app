const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'js', 'gift-menu-designer.js');

let content = fs.readFileSync(file, 'utf8');

// 1. Add advancedExpanded state to constructor
content = content.replace(
    "this.panY = 0;",
    "this.panY = 0;\n            this.advancedExpanded = false;"
);

// 2. Add toggleAdvancedFeatures method
content = content.replace(
    "updateSelectedItem(key, value, refreshInspector = true) {",
    `toggleAdvancedFeatures() {
            this.advancedExpanded = !this.advancedExpanded;
            this.renderInspector();
        }

        updateSelectedItem(key, value, refreshInspector = true) {`
);

// 3. Replace renderInspector HTML content
const oldInspectorHTMLStart = `            inspector.innerHTML = \`
                \${selectedHeaderHTML}

                <div class="gmd-section">
                    <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>`;

const oldInspectorHTMLEnd = `                    <div class="gmd-field"><label>Hình dáng Aura</label>\${this.renderSelect('auraShape', selected.auraShape, [
                { value: 'Circle', label: 'Tròn' },
                { value: 'Square', label: 'Vuông' },
                { value: 'Hexagon', label: 'Lục giác' },
                { value: 'Star', label: 'Ngôi sao' },
                { value: 'Oval', label: 'Oval' }
            ])}</div>
                </div>
            \`;`;

const newInspectorHTML = `            inspector.innerHTML = \`
                \${selectedHeaderHTML}

                <!-- ✨ TÙY CHỈNH CƠ BẢN -->
                <div class="gmd-section-group basic-features">
                    <div style="border-bottom: 2px solid rgba(255,255,255,0.05); padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
                        <span style="font-weight: 800; font-size: 11px; color: var(--accent); letter-spacing: 0.5px; text-transform: uppercase;">✨ Tùy chỉnh cơ bản</span>
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-ruler-combined"></i> KÍCH THƯỚC & VỊ TRÍ</h4>
                        <div class="gmd-field"><label>Vị trí</label></div>
                        <div class="gmd-row">
                            <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="x" value="\${selected.x}"><span>px</span></div>
                            <div class="gmd-inline-input"><input class="gmd-input gmd-input-compact" type="number" data-key="y" value="\${selected.y}"><span>px</span></div>
                        </div>
                        <div class="gmd-field"><label>Kích thước</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="width" value="\${selected.width}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="30" max="300" data-key="width" value="\${selected.width}">
                    </div>

                    <div class="gmd-section">
                        <h4><i class="fas fa-signature"></i> CÀI ĐẶT CHỮ</h4>
                        <div class="gmd-field gmd-toggle-row">
                            <label>Hiển thị tên</label>
                            <label class="gmd-switch">
                                <input type="checkbox" data-key="showName" \${selected.showName ? 'checked' : ''}>
                                <span></span>
                            </label>
                        </div>
                        <div class="gmd-field"><label>Vị trí chữ</label>\${this.renderSelect('textPosition', selected.textPosition || 'bottom', [
                    { value: 'bottom', label: 'Dưới' },
                    { value: 'top', label: 'Trên' },
                    { value: 'left', label: 'Trái' },
                    { value: 'right', label: 'Phải' }
                ])}</div>
                        <div class="gmd-field"><label>Cỡ chữ</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textSize" value="\${selected.textSize}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="10" max="48" data-key="textSize" value="\${selected.textSize}">
                        <div class="gmd-field"><label>Khoảng cách (Gap)</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" data-key="textGap" value="\${selected.textGap}"><span>px</span></div></div>
                        <input class="gmd-range" type="range" min="0" max="30" data-key="textGap" value="\${selected.textGap}">
                        <div class="gmd-field"><label>Màu chữ</label><input class="gmd-color" type="color" data-key="textColor" value="\${selected.textColor}"></div>
                    </div>
                </div>

                <!-- 👑 TÍNH NĂNG NÂNG CAO -->
                <div class="gmd-section-group advanced-features" style="background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 12px; margin-top: 16px; box-shadow: inset 0 2px 6px rgba(0,0,0,0.15);">
                    <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" onclick="window.giftMenuDesigner.toggleAdvancedFeatures()">
                        <span style="font-weight: 800; font-size: 11px; color: #a78bfa; letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-crown" style="color: #fbbf24;"></i> Tính năng nâng cao
                        </span>
                        <i class="fas \${this.advancedExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 10px; color: rgba(255,255,255,0.4);"></i>
                    </div>

                    <div id="gmd-advanced-content" style="display: \${this.advancedExpanded ? 'block' : 'none'}; margin-top: 12px;">
                        <div class="gmd-section" style="margin-bottom: 0; padding-bottom: 0; border: none; background: none;">
                            <h4><i class="fas fa-sparkles"></i> HIỆU ỨNG</h4>
                            <div class="gmd-field"><label>Hiệu ứng loop</label>\${this.renderSelect('animationType', selected.animationType, ['None', 'Pulse', 'Bounce', 'Float', 'Zoom', 'Shake'])}</div>
                            <div class="gmd-field"><label>Tốc độ loop</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-key="animationSpeed" value="\${selected.animationSpeed || 1}"><span>s</span></div></div>
                            <input class="gmd-range" type="range" min="0.2" max="8" step="0.1" data-key="animationSpeed" value="\${selected.animationSpeed || 1}">
                            <div class="gmd-field"><label>Hiệu ứng nền (Aura)</label>\${this.renderSelect('auraType', selected.auraType, this.auraOptions)}</div>
                            <div class="gmd-field"><label>Tốc độ Aura</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.2" max="8" step="0.1" data-key="auraSpeed" value="\${selected.auraSpeed || 1}"><span>s</span></div></div>
                            <input class="gmd-range" type="range" min="0.2" max="8" step="0.1" data-key="auraSpeed" value="\${selected.auraSpeed || 1}">
                            <div class="gmd-field"><label>Kích thước Aura</label><div class="gmd-inline-input gmd-inline-input-single"><input class="gmd-input gmd-input-compact" type="number" min="0.6" max="1.8" step="0.05" data-key="auraScale" value="\${selected.auraScale || 1}"><span>x</span></div></div>
                            <input class="gmd-range" type="range" min="0.6" max="1.8" step="0.05" data-key="auraScale" value="\${selected.auraScale || 1}">
                            <div class="gmd-field"><label>Màu Aura</label><div class="gmd-inline-color"><input class="gmd-input gmd-input-compact" data-key="auraColor" value="\${selected.auraColor}"><input class="gmd-color" type="color" data-key="auraColor" value="\${selected.auraColor}"></div></div>
                            <div class="gmd-field"><label>Hình dáng Aura</label>\${this.renderSelect('auraShape', selected.auraShape, [
                        { value: 'Circle', label: 'Tròn' },
                        { value: 'Square', label: 'Vuông' },
                        { value: 'Hexagon', label: 'Lục giác' },
                        { value: 'Star', label: 'Ngôi sao' },
                        { value: 'Oval', label: 'Oval' }
                    ])}</div>
                        </div>
                    </div>
                </div>
            \`;`;

// Re-read file content and do matching
const regexStr = /inspector\.innerHTML\s*=\s*`[\s\S]+?Oval'[\s\S]+?\}\)[\s\S]+?<\/div>[\s\S]+?<\/div>[\s\S]+?`;/;

if (regexStr.test(content)) {
    content = content.replace(regexStr, newInspectorHTML);
    console.log('Successfully replaced inspector HTML');
} else {
    console.warn('Could not match regexStr in gift-menu-designer.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched gift-menu-designer.js');

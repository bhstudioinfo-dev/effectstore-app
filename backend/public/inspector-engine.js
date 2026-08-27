(function () {
    const TAB_ORDER = Object.freeze(['basic', 'advanced', 'data', 'test']);

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function tabs(...names) {
        return TAB_ORDER.filter((tab) => names.includes(tab));
    }

    function field(label, inputHtml) {
        return `
            <div class="gmd-field">
                <label>${esc(label)}</label>
                ${inputHtml}
            </div>
        `;
    }

    function numberInput(key, value, suffix = 'px', attrs = '') {
        return `
            <div class="gmd-inline-input gmd-inline-input-single">
                <input class="gmd-input gmd-input-compact" type="number" data-inspector-key="${esc(key)}" value="${esc(value ?? '')}" ${attrs}>
                <span>${esc(suffix)}</span>
            </div>
        `;
    }

    function textInput(key, value) {
        return `<input class="gmd-input" type="text" data-inspector-key="${esc(key)}" value="${esc(value ?? '')}">`;
    }

    function colorInput(key, value) {
        return `<input class="gmd-color" type="color" data-inspector-key="${esc(key)}" value="${esc(value || '#ffffff')}">`;
    }

    function selectInput(key, value, options) {
        return `
            <select class="gmd-select" data-inspector-key="${esc(key)}">
                ${(options || []).map((option) => {
                    const opt = typeof option === 'string' ? { value: option, label: option } : option;
                    return `<option value="${esc(opt.value)}" ${String(opt.value) === String(value) ? 'selected' : ''}>${esc(opt.label)}</option>`;
                }).join('')}
            </select>
        `;
    }

    function fontSelectInput(key, value) {
        const utmFonts = Array.isArray(window.UTM_FONTS) && window.UTM_FONTS.length > 0
            ? window.UTM_FONTS
            : ['UTM Avo', 'UTM Bebas', 'UTM Impact', 'UTM Cafeta', 'UTM Helve', 'UTM Alexander', 'UTM Cooper Black', 'UTM Neo Sans Intel', 'UTM ThuPhap Thien An', 'UTM Ong Do Tre'];
        
        const popular = [
            { value: '', label: 'Mặc định (Inter / Hệ thống)' },
            { value: 'Inter', label: 'Inter' },
            { value: 'sans-serif', label: 'Sans-Serif' },
            { value: 'monospace', label: 'Monospace' }
        ];
        
        const utmOptions = utmFonts.map(f => ({ value: f, label: f }));
        const options = [...popular, ...utmOptions];
        return selectInput(key, value || '', options);
    }

    function toggleInput(key, checked) {
        return `
            <label class="gmd-switch">
                <input type="checkbox" data-inspector-key="${esc(key)}" ${checked ? 'checked' : ''}>
                <span></span>
            </label>
        `;
    }

    function section(title, body, icon = 'fas fa-sliders-h') {
        return `
            <div class="gmd-section">
                <h4><i class="${esc(icon)}"></i> ${esc(title)}</h4>
                ${body}
            </div>
        `;
    }

    function buildResult(type, activeTabs, panels) {
        return {
            type,
            tabs: Object.freeze([...activeTabs]),
            panels: Object.freeze({ ...panels }),
            html: activeTabs.map((tab) => panels[tab] || '').join('')
        };
    }

    function renderCommonBasic(item) {
        return section('Kích thước và vị trí', `
            <div class="gmd-row">
                ${numberInput('x', item.x ?? 0)}
                ${numberInput('y', item.y ?? 0)}
            </div>
            ${field('Chiều rộng', numberInput('width', item.width ?? item.w ?? 0))}
            ${field('Chiều cao', numberInput('height', item.height ?? item.h ?? 0))}
            ${field('Thứ tự lớp', numberInput('zIndex', item.zIndex ?? 1, '#'))}
        `, 'fas fa-ruler-combined');
    }

    function renderWidgetStyleAdvanced(item) {
        return section('Hiển thị nâng cao', `
            <div class="gmd-field gmd-toggle-row">
                <label>Ẩn nền</label>
                ${toggleInput('hideBg', item.hideBg === true)}
            </div>
            <div class="gmd-field gmd-toggle-row">
                <label>Dùng nền riêng</label>
                ${toggleInput('useCustomBg', item.useCustomBg === true)}
            </div>
            ${field('Màu nền', colorInput('bgColor', item.bgColor || '#0a0a14'))}
            <div class="gmd-field gmd-toggle-row">
                <label>Dùng màu chữ riêng</label>
                ${toggleInput('useCustomTextColor', item.useCustomTextColor === true)}
            </div>
            ${field('Màu chữ', colorInput('textColor', item.textColor || '#ffffff'))}
            ${field('Phông chữ (Font UTM)', fontSelectInput('fontFamily', item.fontFamily || ''))}
            ${field('Dịch nội dung theo chiều dọc', numberInput('contentOffsetY', item.contentOffsetY || 0))}
        `, 'fas fa-wand-magic-sparkles');
    }

    function renderGoalTestPanel(item) {
        return section('Phát thử', `
            <div style="display:flex; gap:8px;">
                <button class="gmd-btn primary" data-inspector-action="test-goal" data-item-id="${esc(item.id)}">Phát thử</button>
                <button class="gmd-btn" data-inspector-action="reset-goal" data-item-id="${esc(item.id)}">Đặt lại</button>
            </div>
        `, 'fas fa-flask');
    }

    function renderGiftInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('gift', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Chữ', `
                    <div class="gmd-field gmd-toggle-row">
                        <label>Hiển thị tên</label>
                        ${toggleInput('showName', item.showName !== false)}
                    </div>
                    ${field('Tên chính', textInput('name', item.name || ''))}
                    ${field('Tên phụ', textInput('subtext', item.subtext || ''))}
                    ${field('Cỡ chữ', numberInput('textSize', item.textSize || 13))}
                    ${field('Phông chữ (Font UTM)', fontSelectInput('fontFamily', item.fontFamily || ''))}
                    ${field('Màu tên chính', colorInput('textColor', item.textColor || '#f7cb64'))}
                    ${field('Màu tên phụ', colorInput('subtextColor', item.subtextColor || item.textColor || '#f7cb64'))}
                    ${field('Khoảng cách', numberInput('textGap', item.textGap || 4))}
                `, 'fas fa-font')}
            `,
            advanced: section('Hiệu ứng', `
                ${field('Chuyển động', selectInput('animationType', item.animationType || 'None', [{value:'None',label:'Không có'},{value:'Pulse',label:'Nhịp đập'},{value:'Bounce',label:'Nảy'},{value:'Float',label:'Trôi nhẹ'},{value:'Zoom',label:'Phóng to, thu nhỏ'},{value:'Shake',label:'Rung'}]))}
                ${field('Tốc độ chuyển động', numberInput('animationSpeed', item.animationSpeed || 1, 's', 'step="0.1"'))}
                ${field('Hào quang', selectInput('auraType', item.auraType || 'None', [{value:'None',label:'Không có'},{value:'Glow',label:'Phát sáng'},{value:'Bubble',label:'Bong bóng'},{value:'Magic Ring',label:'Vòng phép thuật'},{value:'Neon Frame',label:'Khung neon'},{value:'Light Sweep',label:'Ánh sáng quét'},{value:'Fire Aura',label:'Hào quang lửa'},{value:'Electric Aura',label:'Hào quang điện'}]))}
                ${field('Màu hào quang', colorInput('auraColor', item.auraColor || '#d7b2ff'))}
                ${field('Tốc độ hào quang', numberInput('auraSpeed', item.auraSpeed || 1, 's', 'step="0.1"'))}
                ${field('Kích thước hào quang', numberInput('auraScale', item.auraScale || 1, 'x', 'step="0.05"'))}
            `, 'fas fa-sparkles')
        });
    }

    function renderTextInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('text', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Nội dung', `
                    ${field('Văn bản', textInput('text', item.text || ''))}
                    ${field('Cỡ chữ', numberInput('fontSize', item.fontSize || 36))}
                    ${field('Màu chữ', colorInput('color', item.color || '#ffffff'))}
                    ${field('Căn chữ', selectInput('textAlign', item.textAlign || 'center', [{value:'left',label:'Trái'},{value:'center',label:'Giữa'},{value:'right',label:'Phải'}]))}
                `, 'fas fa-font')}
            `,
            advanced: section('Kiểu chữ', `
                ${field('Phông chữ (Font UTM)', fontSelectInput('fontFamily', item.fontFamily || ''))}
                ${field('Độ đậm', selectInput('fontWeight', item.fontWeight || 'bold', ['normal', '600', 'bold', '800', '900']))}
                ${field('Bóng chữ', textInput('textShadow', item.textShadow || 'none'))}
            `, 'fas fa-wand-magic-sparkles')
        });
    }

    function renderMediaInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('media-asset', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Ảnh hoặc video', `
                    ${field('Tên', textInput('name', item.name || ''))}
                    ${field('Địa chỉ tệp', textInput('assetUrl', item.assetUrl || ''))}
                `, 'fas fa-photo-video')}
            `,
            advanced: section('Hiển thị', `
                ${field('Độ trong suốt', numberInput('opacity', item.opacity ?? 1, 'x', 'step="0.05" min="0" max="1"'))}
                ${field('Cách vừa khung', selectInput('fitMode', item.fitMode || 'contain', [{value:'contain',label:'Hiện toàn bộ'},{value:'cover',label:'Phủ kín khung'},{value:'fill',label:'Kéo đầy khung'}]))}
            `, 'fas fa-sliders-h')
        });
    }

    function renderGoalBarInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('goal-bar', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: `
                ${renderWidgetStyleAdvanced(item)}
                ${section('Cài đặt viền PK', `
                    <div class="gmd-field gmd-toggle-row">
                        <label>Tùy chỉnh màu viền PK</label>
                        ${toggleInput('useCustomPkBorderColor', item.useCustomPkBorderColor === true)}
                    </div>
                    ${field('Màu viền PK 1 (Đỏ/Glow chính)', colorInput('pkBorderColor1', item.pkBorderColor1 || '#ff003c'))}
                    ${field('Màu viền PK 2 (Xanh/Glow phụ)', colorInput('pkBorderColor2', item.pkBorderColor2 || '#00f0ff'))}
                `, 'fas fa-border-style')}
            `,
            data: section('Dữ liệu mục tiêu', `
                ${field('Mã quà', textInput('giftId', item.giftId || ''))}
                ${field('Mục tiêu', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Hiện tại', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Màu thanh', colorInput('barColor', item.barColor || '#ff007f'))}
                ${field('Chiều cao thanh', numberInput('barHeight', item.barHeight ?? 54))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderGoalCircleInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('goal-circle', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Dữ liệu mục tiêu tròn', `
                ${field('Mã quà', textInput('giftId', item.giftId || ''))}
                ${field('Mục tiêu', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Hiện tại', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Biểu tượng ở giữa', textInput('centerIcon', item.centerIcon || 'gift-icon'))}
                ${field('Màu vòng tròn', colorInput('barColor', item.barColor || '#ff007f'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderBossBarInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('boss-bar', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Dữ liệu quái thú', `
                ${field('Tên quái thú', textInput('bossName', item.bossName || 'BOSS HP'))}
                ${field('Dòng mô tả phụ', textInput('bossSub', item.bossSub || ''))}
                ${field('Máu tối đa', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Máu hiện tại', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Màu thanh', colorInput('barColor', item.barColor || '#ef4444'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderComboInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('combo', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Dữ liệu chuỗi quà', `
                ${field('Số quà liên tiếp', numberInput('comboCount', item.comboCount || 0, ''))}
                ${field('Tiêu đề', textInput('name', item.name || 'COMBO ĐANG CHẠY!'))}
                ${field('Dòng phụ', textInput('subtitleText', item.subtitleText || ''))}
                ${field('Màu chủ đạo', colorInput('barColor', item.barColor || '#ef4444'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderMysteryInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('mystery-chests', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Dữ liệu rương bí ẩn', `
                ${field('Mã quà', textInput('giftId', item.giftId || ''))}
                ${field('Mục tiêu', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Hiện tại', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Màu thanh', colorInput('barColor', item.barColor || '#a855f7'))}
                ${field('Màu phát sáng', colorInput('glowColor', item.glowColor || '#fb7185'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderTopContributorsInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('top-contributors', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Dữ liệu bảng xếp hạng', `
                ${field('Số người hiển thị', numberInput('limitCount', item.limitCount || 3, ''))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Hiển thị ảnh đại diện</label>
                    ${toggleInput('showAvatar', item.showAvatar !== false)}
                </div>
                <div class="gmd-field gmd-toggle-row">
                    <label>Hiển thị giá trị</label>
                    ${toggleInput('showValue', item.showValue !== false)}
                </div>
                ${field('Màu chủ đạo', colorInput('barColor', item.barColor || '#eab308'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderGoalListInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('goal-list', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: `
                ${renderWidgetStyleAdvanced(item)}
                ${section('Cuộn danh sách', `
                    <div class="gmd-field gmd-toggle-row">
                        <label>Tự động cuộn</label>
                        ${toggleInput('autoScroll', item.autoScroll === true)}
                    </div>
                    ${field('Tốc độ tự động cuộn', numberInput('autoScrollSpeed', item.autoScrollSpeed || 15, 's'))}
                    <div class="gmd-field gmd-toggle-row">
                        <label>Hiệu ứng lấp lánh</label>
                        ${toggleInput('shimmerEffect', item.shimmerEffect !== false)}
                    </div>
                `, 'fas fa-scroll')}
            `,
            data: section('Dữ liệu danh sách mục tiêu', `
                ${field('Dòng chân trang', textInput('footerText', item.footerText || ''))}
                ${field('Màu thanh', colorInput('barColor', item.barColor || '#ff007f'))}
                ${field('Cỡ biểu tượng', numberInput('iconSize', item.iconSize ?? 28))}
                ${field('Chiều cao thanh', numberInput('barHeight', item.barHeight ?? 12))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderPodiumInspector(item) {
        const base = renderTopContributorsInspector({ ...item, type: 'podium-contributors' });
        return buildResult('podium-contributors', base.tabs, base.panels);
    }

    function renderGiftStackGroupInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data');
        return buildResult('gift-stack-group', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: section('Bố cục nhóm quà', `
                ${field('Hướng sắp xếp', selectInput('layoutDirection', item.layoutDirection || 'vertical', [
                    { value: 'vertical', label: 'Dọc' },
                    { value: 'horizontal', label: 'Ngang' }
                ]))}
                ${field('Khoảng cách', numberInput('gap', item.gap ?? 10))}
                ${field('Cỡ biểu tượng', numberInput('iconSize', item.iconSize ?? 64))}
                ${field('Cỡ chữ', numberInput('textSize', item.textSize ?? 14))}
                ${field('Phông chữ (Font UTM)', fontSelectInput('fontFamily', item.fontFamily || ''))}
                ${field('Vị trí chữ', selectInput('textPosition', item.textPosition || 'bottom', [
                    { value: 'bottom', label: 'Dưới' },
                    { value: 'top', label: 'Trên' },
                    { value: 'left', label: 'Trái' },
                    { value: 'right', label: 'Phải' }
                ]))}
                ${field('Khoảng cách chữ', numberInput('textGap', item.textGap ?? 4))}
                ${field('Màu tên chính', colorInput('textColor', item.textColor || '#ffffff'))}
                ${field('Màu tên phụ', colorInput('subtextColor', item.subtextColor || item.textColor || '#ffffff'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Bật viền</label>
                    ${toggleInput('showBorder', item.showBorder !== false)}
                </div>
                ${field('Kiểu viền', selectInput('borderFillType', item.borderFillType || 'solid', [
                    { value: 'solid', label: 'Màu đơn' },
                    { value: 'gradient', label: 'Chuyển màu' }
                ]))}
                ${field('Màu viền', colorInput('borderColor', item.borderColor || '#22d3ee'))}
                ${field('Màu viền 1', colorInput('borderGradientFrom', item.borderGradientFrom || '#22d3ee'))}
                ${field('Màu viền 2', colorInput('borderGradientTo', item.borderGradientTo || '#a855f7'))}
                ${field('Góc chuyển màu viền', numberInput('borderGradientAngle', item.borderGradientAngle ?? 135, 'deg'))}
                ${field('Hiệu ứng viền', selectInput('borderEffect', item.borderEffect || 'none', [
                    { value: 'none', label: 'Không có' },
                    { value: 'glow', label: 'Phát sáng' },
                    { value: 'pulse', label: 'Nhịp đập' },
                    { value: 'running-light', label: 'Ánh sáng chạy' },
                    { value: 'dashed-march', label: 'Nét đứt chuyển động' }
                ]))}
                ${field('Tốc độ viền', numberInput('borderEffectSpeed', item.borderEffectSpeed ?? 2, 's'))}
                ${field('Độ sáng viền', numberInput('borderGlowIntensity', item.borderGlowIntensity ?? 0.55, 'x'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Bật bảng nền</label>
                    ${toggleInput('showPanel', item.showPanel !== false)}
                </div>
                ${field('Kiểu bảng nền', selectInput('panelFillType', item.panelFillType || 'solid', [
                    { value: 'solid', label: 'Màu đơn' },
                    { value: 'gradient', label: 'Chuyển màu' }
                ]))}
                ${field('Màu bảng nền', colorInput('panelColor', item.panelColor || '#0a0a14'))}
                ${field('Màu chuyển 1', colorInput('panelGradientFrom', item.panelGradientFrom || '#3b1f48'))}
                ${field('Màu chuyển 2', colorInput('panelGradientTo', item.panelGradientTo || '#0a0a14'))}
                ${field('Góc chuyển màu', numberInput('panelGradientAngle', item.panelGradientAngle ?? 135, 'deg'))}
                ${field('Hiệu ứng bảng nền', selectInput('panelEffect', item.panelEffect || 'none', [
                    { value: 'none', label: 'Không có' },
                    { value: 'light-sweep', label: 'Ánh sáng quét' },
                    { value: 'breathing', label: 'Nhịp thở' },
                    { value: 'energy-flow', label: 'Dòng năng lượng' },
                    { value: 'glass-shine', label: 'Kính lấp lánh' }
                ]))}
                ${field('Tốc độ bảng nền', numberInput('panelEffectSpeed', item.panelEffectSpeed ?? 3, 's'))}
                ${field('Độ sáng bảng nền', numberInput('panelGlowIntensity', item.panelGlowIntensity ?? 0.35, 'x'))}
                ${field('Khoảng cách viền (Padding)', numberInput('padding', item.padding ?? 8, 'px'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Hiển thị tên quà</label>
                    ${toggleInput('showName', item.showName !== false)}
                </div>
                <div class="gmd-field gmd-toggle-row">
                    <label>Tự động cuộn lặp lại</label>
                    ${toggleInput('loopEnabled', Boolean(item.loopEnabled))}
                </div>
                ${field('Hướng cuộn', selectInput('loopDirection', item.loopDirection || 'vertical', [
                    { value: 'vertical', label: 'Dọc' },
                    { value: 'horizontal', label: 'Ngang' }
                ]))}
                ${field('Tốc độ cuộn', numberInput('loopSpeed', item.loopSpeed ?? 15, 's'))}
                <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin:8px 0;">Khi bật cuộn, danh sách quà sẽ lặp liên tục theo hướng đã chọn.</div>
                <button class="gmd-btn" data-action="ungroup-stack" style="width:100%; border-color: rgba(239,68,68,.4); color:#fca5a5;"><i class="fas fa-object-ungroup"></i> Tách nhóm</button>
            `, 'fas fa-layer-group'),
            data: section('Quà trong nhóm', `
                <div style="font-size:12px;color:#cbd5e1;line-height:1.4;">
                    ${(Array.isArray(item.children) ? item.children : []).length} quà trong nhóm
                </div>
            `, 'fas fa-database')
        });
    }

    function renderInspectorForItem(item) {
        const type = item && item.type ? item.type : 'gift';
        const renderers = {
            gift: renderGiftInspector,
            text: renderTextInspector,
            'media-asset': renderMediaInspector,
            'goal-bar': renderGoalBarInspector,
            'goal-circle': renderGoalCircleInspector,
            'boss-bar': renderBossBarInspector,
            combo: renderComboInspector,
            'mystery-chests': renderMysteryInspector,
            'top-contributors': renderTopContributorsInspector,
            'podium-contributors': renderPodiumInspector,
            'goal-list': renderGoalListInspector,
            'gift-stack-group': renderGiftStackGroupInspector
        };
        const renderer = renderers[type] || renderGiftInspector;
        return renderer(item || {});
    }

    window.MenuDesignerInspectorEngine = Object.freeze({
        tabs,
        renderGiftInspector,
        renderTextInspector,
        renderMediaInspector,
        renderGoalBarInspector,
        renderGoalCircleInspector,
        renderBossBarInspector,
        renderComboInspector,
        renderMysteryInspector,
        renderTopContributorsInspector,
        renderPodiumInspector,
        renderGoalListInspector,
        renderGiftStackGroupInspector,
        renderInspectorForItem
    });
})();

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
        return section('Kich thuoc & vi tri', `
            <div class="gmd-row">
                ${numberInput('x', item.x ?? 0)}
                ${numberInput('y', item.y ?? 0)}
            </div>
            ${field('Width', numberInput('width', item.width ?? item.w ?? 0))}
            ${field('Height', numberInput('height', item.height ?? item.h ?? 0))}
            ${field('Layer Order', numberInput('zIndex', item.zIndex ?? 1, '#'))}
        `, 'fas fa-ruler-combined');
    }

    function renderWidgetStyleAdvanced(item) {
        return section('Hien thi nang cao', `
            <div class="gmd-field gmd-toggle-row">
                <label>An nen</label>
                ${toggleInput('hideBg', item.hideBg === true)}
            </div>
            <div class="gmd-field gmd-toggle-row">
                <label>Dung nen rieng</label>
                ${toggleInput('useCustomBg', item.useCustomBg === true)}
            </div>
            ${field('Mau nen', colorInput('bgColor', item.bgColor || '#0a0a14'))}
            <div class="gmd-field gmd-toggle-row">
                <label>Dung mau chu rieng</label>
                ${toggleInput('useCustomTextColor', item.useCustomTextColor === true)}
            </div>
            ${field('Mau chu', colorInput('textColor', item.textColor || '#ffffff'))}
            ${field('Content Offset Y', numberInput('contentOffsetY', item.contentOffsetY || 0))}
        `, 'fas fa-wand-magic-sparkles');
    }

    function renderGoalTestPanel(item) {
        return section('Test', `
            <div style="display:flex; gap:8px;">
                <button class="gmd-btn primary" data-inspector-action="test-goal" data-item-id="${esc(item.id)}">Test</button>
                <button class="gmd-btn" data-inspector-action="reset-goal" data-item-id="${esc(item.id)}">Reset</button>
            </div>
        `, 'fas fa-flask');
    }

    function renderGiftInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('gift', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Chu', `
                    <div class="gmd-field gmd-toggle-row">
                        <label>Hien thi ten</label>
                        ${toggleInput('showName', item.showName !== false)}
                    </div>
                    ${field('Ten', textInput('name', item.name || ''))}
                    ${field('Co chu', numberInput('textSize', item.textSize || 13))}
                    ${field('Mau chu', colorInput('textColor', item.textColor || '#f7cb64'))}
                    ${field('Gap', numberInput('textGap', item.textGap || 4))}
                `, 'fas fa-font')}
            `,
            advanced: section('Hieu ung', `
                ${field('Animation', selectInput('animationType', item.animationType || 'None', ['None', 'Pulse', 'Bounce', 'Float', 'Zoom', 'Shake']))}
                ${field('Animation Speed', numberInput('animationSpeed', item.animationSpeed || 1, 's', 'step="0.1"'))}
                ${field('Aura', selectInput('auraType', item.auraType || 'None', ['None', 'Glow', 'Bubble', 'Magic Ring', 'Neon Frame', 'Light Sweep', 'Fire Aura', 'Electric Aura']))}
                ${field('Aura Color', colorInput('auraColor', item.auraColor || '#d7b2ff'))}
                ${field('Aura Speed', numberInput('auraSpeed', item.auraSpeed || 1, 's', 'step="0.1"'))}
                ${field('Aura Scale', numberInput('auraScale', item.auraScale || 1, 'x', 'step="0.05"'))}
            `, 'fas fa-sparkles')
        });
    }

    function renderTextInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('text', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Noi dung', `
                    ${field('Text', textInput('text', item.text || ''))}
                    ${field('Font Size', numberInput('fontSize', item.fontSize || 36))}
                    ${field('Color', colorInput('color', item.color || '#ffffff'))}
                    ${field('Align', selectInput('textAlign', item.textAlign || 'center', ['left', 'center', 'right']))}
                `, 'fas fa-font')}
            `,
            advanced: section('Text Style', `
                ${field('Font Weight', selectInput('fontWeight', item.fontWeight || 'bold', ['normal', '600', 'bold', '800', '900']))}
                ${field('Text Shadow', textInput('textShadow', item.textShadow || 'none'))}
            `, 'fas fa-wand-magic-sparkles')
        });
    }

    function renderMediaInspector(item) {
        const activeTabs = tabs('basic', 'advanced');
        return buildResult('media-asset', activeTabs, {
            basic: `
                ${renderCommonBasic(item)}
                ${section('Media', `
                    ${field('Name', textInput('name', item.name || ''))}
                    ${field('Asset URL', textInput('assetUrl', item.assetUrl || ''))}
                `, 'fas fa-photo-video')}
            `,
            advanced: section('Display', `
                ${field('Opacity', numberInput('opacity', item.opacity ?? 1, 'x', 'step="0.05" min="0" max="1"'))}
                ${field('Fit Mode', selectInput('fitMode', item.fitMode || 'contain', ['contain', 'cover', 'fill']))}
            `, 'fas fa-sliders-h')
        });
    }

    function renderGoalBarInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('goal-bar', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Goal Data', `
                ${field('Gift ID', textInput('giftId', item.giftId || ''))}
                ${field('Target', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Current', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Bar Color', colorInput('barColor', item.barColor || '#ff007f'))}
                ${field('Bar Height', numberInput('barHeight', item.barHeight ?? 54))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderGoalCircleInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('goal-circle', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Circle Goal Data', `
                ${field('Gift ID', textInput('giftId', item.giftId || ''))}
                ${field('Target', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Current', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Center Icon', textInput('centerIcon', item.centerIcon || 'gift-icon'))}
                ${field('Circle Color', colorInput('barColor', item.barColor || '#ff007f'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderBossBarInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('boss-bar', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Boss Data', `
                ${field('Boss Name', textInput('bossName', item.bossName || 'BOSS HP'))}
                ${field('Boss Sub', textInput('bossSub', item.bossSub || ''))}
                ${field('Target HP', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Current HP', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Bar Color', colorInput('barColor', item.barColor || '#ef4444'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderComboInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('combo', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Combo Data', `
                ${field('Combo Count', numberInput('comboCount', item.comboCount || 0, ''))}
                ${field('Title', textInput('name', item.name || 'COMBO DANG CHAY!'))}
                ${field('Subtitle', textInput('subtitleText', item.subtitleText || ''))}
                ${field('Theme Color', colorInput('barColor', item.barColor || '#ef4444'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderMysteryInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('mystery-chests', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Mystery Data', `
                ${field('Gift ID', textInput('giftId', item.giftId || ''))}
                ${field('Target', numberInput('targetCount', item.targetCount || 100, ''))}
                ${field('Current', numberInput('currentCount', item.currentCount || 0, ''))}
                ${field('Bar Color', colorInput('barColor', item.barColor || '#a855f7'))}
                ${field('Glow Color', colorInput('glowColor', item.glowColor || '#fb7185'))}
            `, 'fas fa-database'),
            test: renderGoalTestPanel(item)
        });
    }

    function renderTopContributorsInspector(item) {
        const activeTabs = tabs('basic', 'advanced', 'data', 'test');
        return buildResult('top-contributors', activeTabs, {
            basic: renderCommonBasic(item),
            advanced: renderWidgetStyleAdvanced(item),
            data: section('Leaderboard Data', `
                ${field('Limit', numberInput('limitCount', item.limitCount || 3, ''))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Show Avatar</label>
                    ${toggleInput('showAvatar', item.showAvatar !== false)}
                </div>
                <div class="gmd-field gmd-toggle-row">
                    <label>Show Value</label>
                    ${toggleInput('showValue', item.showValue !== false)}
                </div>
                ${field('Theme Color', colorInput('barColor', item.barColor || '#eab308'))}
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
                ${section('Scroll', `
                    <div class="gmd-field gmd-toggle-row">
                        <label>Auto Scroll</label>
                        ${toggleInput('autoScroll', item.autoScroll === true)}
                    </div>
                    ${field('Auto Scroll Speed', numberInput('autoScrollSpeed', item.autoScrollSpeed || 15, 's'))}
                    <div class="gmd-field gmd-toggle-row">
                        <label>Shimmer</label>
                        ${toggleInput('shimmerEffect', item.shimmerEffect !== false)}
                    </div>
                `, 'fas fa-scroll')}
            `,
            data: section('Goal List Data', `
                ${field('Footer Text', textInput('footerText', item.footerText || ''))}
                ${field('Bar Color', colorInput('barColor', item.barColor || '#ff007f'))}
                ${field('Icon Size', numberInput('iconSize', item.iconSize ?? 28))}
                ${field('Bar Height', numberInput('barHeight', item.barHeight ?? 12))}
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
            advanced: section('Stack Layout', `
                ${field('Direction', selectInput('layoutDirection', item.layoutDirection || 'vertical', [
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' }
                ]))}
                ${field('Gap', numberInput('gap', item.gap ?? 10))}
                ${field('Icon Size', numberInput('iconSize', item.iconSize ?? 64))}
                ${field('Text Size', numberInput('textSize', item.textSize ?? 14))}
                ${field('Text Position', selectInput('textPosition', item.textPosition || 'bottom', [
                    { value: 'bottom', label: 'Bottom' },
                    { value: 'top', label: 'Top' },
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' }
                ]))}
                ${field('Text Gap', numberInput('textGap', item.textGap ?? 4))}
                ${field('Text Color', colorInput('textColor', item.textColor || '#ffffff'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Bat vien</label>
                    ${toggleInput('showBorder', item.showBorder !== false)}
                </div>
                ${field('Kieu vien', selectInput('borderFillType', item.borderFillType || 'solid', [
                    { value: 'solid', label: 'Mau don' },
                    { value: 'gradient', label: 'Gradient' }
                ]))}
                ${field('Mau vien', colorInput('borderColor', item.borderColor || '#22d3ee'))}
                ${field('Mau vien 1', colorInput('borderGradientFrom', item.borderGradientFrom || '#22d3ee'))}
                ${field('Mau vien 2', colorInput('borderGradientTo', item.borderGradientTo || '#a855f7'))}
                ${field('Goc gradient vien', numberInput('borderGradientAngle', item.borderGradientAngle ?? 135, 'deg'))}
                ${field('Hieu ung vien', selectInput('borderEffect', item.borderEffect || 'none', [
                    { value: 'none', label: 'Khong' },
                    { value: 'glow', label: 'Glow' },
                    { value: 'pulse', label: 'Pulse' },
                    { value: 'running-light', label: 'Running Light' },
                    { value: 'dashed-march', label: 'Dashed March' }
                ]))}
                ${field('Toc do vien', numberInput('borderEffectSpeed', item.borderEffectSpeed ?? 2, 's'))}
                ${field('Do sang vien', numberInput('borderGlowIntensity', item.borderGlowIntensity ?? 0.55, 'x'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Bat bang</label>
                    ${toggleInput('showPanel', item.showPanel !== false)}
                </div>
                ${field('Kieu bang', selectInput('panelFillType', item.panelFillType || 'solid', [
                    { value: 'solid', label: 'Mau don' },
                    { value: 'gradient', label: 'Gradient' }
                ]))}
                ${field('Mau bang', colorInput('panelColor', item.panelColor || '#0a0a14'))}
                ${field('Mau gradient 1', colorInput('panelGradientFrom', item.panelGradientFrom || '#3b1f48'))}
                ${field('Mau gradient 2', colorInput('panelGradientTo', item.panelGradientTo || '#0a0a14'))}
                ${field('Goc gradient', numberInput('panelGradientAngle', item.panelGradientAngle ?? 135, 'deg'))}
                ${field('Hieu ung bang', selectInput('panelEffect', item.panelEffect || 'none', [
                    { value: 'none', label: 'Khong' },
                    { value: 'light-sweep', label: 'Light Sweep' },
                    { value: 'breathing', label: 'Breathing' },
                    { value: 'energy-flow', label: 'Energy Flow' },
                    { value: 'glass-shine', label: 'Glass Shine' }
                ]))}
                ${field('Toc do bang', numberInput('panelEffectSpeed', item.panelEffectSpeed ?? 3, 's'))}
                ${field('Do sang bang', numberInput('panelGlowIntensity', item.panelGlowIntensity ?? 0.35, 'x'))}
                ${field('Khoảng cách viền (Padding)', numberInput('padding', item.padding ?? 8, 'px'))}
                <div class="gmd-field gmd-toggle-row">
                    <label>Show Gift Name</label>
                    ${toggleInput('showName', item.showName !== false)}
                </div>
                <div class="gmd-field gmd-toggle-row">
                    <label>Enable Loop</label>
                    ${toggleInput('loopEnabled', Boolean(item.loopEnabled))}
                </div>
                ${field('Loop Direction', selectInput('loopDirection', item.loopDirection || 'vertical', [
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' }
                ]))}
                ${field('Loop Speed', numberInput('loopSpeed', item.loopSpeed ?? 15, 's'))}
                <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin:8px 0;">Khi bật cuộn, danh sách quà sẽ lặp liên tục theo hướng đã chọn.</div>
                <button class="gmd-btn" data-action="ungroup-stack" style="width:100%; border-color: rgba(239,68,68,.4); color:#fca5a5;"><i class="fas fa-object-ungroup"></i> Bo gop</button>
            `, 'fas fa-layer-group'),
            data: section('Child Gifts', `
                <div style="font-size:12px;color:#cbd5e1;line-height:1.4;">
                    ${(Array.isArray(item.children) ? item.children : []).length} nested gifts
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

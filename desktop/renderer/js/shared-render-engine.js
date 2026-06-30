(function () {
    function safeText(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function roundPx(value, scale) {
        return Math.round(Number(value || 0) * scale);
    }

    function bg(colorHex, defaultHex = '#0a0a14') {
        const hex = colorHex || defaultHex;
        return (hex.startsWith('#') && hex.length === 7) ? hex + '40' : hex;
    }

    function assetUrl(url, apiBase = '') {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        if (apiBase) return `${apiBase}${url}`;
        return `${url.startsWith('/') ? '' : '/'}${url}`;
    }

    function isVideoAsset(url) {
        return /^data:video\/webm/i.test(String(url || '')) || /\.webm(?:$|[?#])/i.test(String(url || ''));
    }

    function giftIconFromLibrary(item, gifts, apiBase) {
        if (item.iconUrl) return assetUrl(item.iconUrl, apiBase);
        if (!item.giftId || !Array.isArray(gifts)) return '';
        const gift = gifts.find(g => String(g.id) === String(item.giftId));
        return gift && gift.icon ? assetUrl(gift.icon, apiBase) : '';
    }

    function createContext(options) {
        return {
            mode: options && options.mode ? options.mode : 'preview',
            scale: Number(options && options.scale) || 1,
            apiBase: options && options.apiBase ? options.apiBase : '',
            gifts: options && Array.isArray(options.gifts) ? options.gifts : [],
            escapeText: options && options.escapeText === false ? false : true,
            includeDesignerFallback: Boolean(options && options.includeDesignerFallback)
        };
    }

    function text(ctx, value) {
        return ctx.escapeText ? safeText(value) : String(value || '');
    }

    function font(ctx, value, fallback) {
        return Math.round((Number(value) || fallback) * ctx.scale);
    }

    function length(ctx, value, fallback) {
        return Math.round((value !== undefined ? Number(value) : fallback) * ctx.scale);
    }

    function renderGift(item, options) {
        const ctx = createContext(options);
        const auraMap = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep', 'Fire Aura': 'aura-fire', 'Electric Aura': 'aura-electric' };
        const motionMap = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
        const auraClass = auraMap[item.auraType] || '';
        const motionClass = motionMap[item.animationType] || '';
        const shapeMap = {
            Square: { radius: '14%', clip: 'none' },
            Hexagon: { radius: '0', clip: 'polygon(25% 6%, 75% 6%, 96% 50%, 75% 94%, 25% 94%, 4% 50%)' },
            Star: { radius: '0', clip: 'polygon(50% 0%, 62% 35%, 98% 35%, 69% 57%, 79% 91%, 50% 70%, 21% 91%, 31% 57%, 2% 35%, 38% 35%)' },
            Oval: { radius: '50% / 38%', clip: 'none' },
            Circle: { radius: '50%', clip: 'none' }
        };
        const shape = shapeMap[item.auraShape] || shapeMap.Circle;
        const iconUrl = assetUrl(item.iconUrl || '', ctx.apiBase);
        const name = text(ctx, item.name || '');
        const textSize = font(ctx, item.textSize, 13);
        const textGap = length(ctx, item.textGap, 4);
        const animSpeed = Math.max(0.2, Number(item.animationSpeed) || 1);
        const auraSpeed = Math.max(0.2, Number(item.auraSpeed) || 1);
        const auraScale = Number(item.auraScale || 1);
        const iconMedia = isVideoAsset(iconUrl)
            ? `<video src="${iconUrl}" autoplay loop muted playsinline></video>`
            : `<img src="${iconUrl}" alt="${name}">`;

        return `
            <div class="gmd-visual ${motionClass} ${auraClass}"
                style="--aura-color:${item.auraColor || '#d7b2ff'};--aura-radius:${shape.radius};--aura-clip:${shape.clip};--anim-speed:${animSpeed}s;--aura-speed:${auraSpeed}s;--aura-scale:${auraScale};--icon-url:url('${iconUrl}');">
                <span class="gmd-aura gmd-aura-back ${auraClass}"></span>
                <span class="gmd-icon-wrap" style="--icon-url:url('${iconUrl}')">
                    ${iconMedia}
                </span>
                <span class="gmd-aura gmd-aura-front ${auraClass}"></span>
            </div>
            ${item.showName ? `<div class="gmd-item-label pos-${item.textPosition || 'bottom'}" style="font-size:${textSize}px;color:${item.textColor || '#f7cb64'};--label-gap:${textGap}px;">${name}</div>` : ''}
        `;
    }

    function renderText(item, options) {
        const ctx = createContext(options);
        return `
            <div class="gmd-text-widget" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:${item.color || '#ffffff'}; font-size:${font(ctx, item.fontSize, 36)}px; font-weight:${item.fontWeight || 'bold'}; text-shadow:${item.textShadow || 'none'}; text-align:${item.textAlign || 'center'}; font-family:inherit; line-height:1.2; word-break:break-word; pointer-events:none;">
                ${text(ctx, item.text || 'Nhap van ban')}
            </div>
        `;
    }

    function renderMediaAsset(item, options) {
        const ctx = createContext(options);
        const src = assetUrl(item.assetUrl || '', ctx.apiBase);
        const isVideo = item.isWebM || (src && src.endsWith('.webm')) || (src && src.endsWith('.mp4'));
        const opacity = item.opacity !== undefined ? item.opacity : 1;
        const fitMode = item.fitMode || 'contain';
        const fallback = ctx.includeDesignerFallback ? `
            <div class="gmd-asset-fallback-box" style="position:absolute; inset:0; display: ${src ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; background: rgba(168, 85, 247, 0.03); border: 1px dashed rgba(168, 85, 247, 0.25); border-radius: 16px; box-sizing: border-box; text-align: center; padding: 12px; pointer-events: none; z-index: 1;">
                <div style="font-size: ${font(ctx, 36, 36)}px; opacity: 0.6;">IMG</div>
                <div style="font-size: ${font(ctx, 20, 20)}px; font-weight: bold; color: rgba(192, 132, 252, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 90%; margin-top: 1px;" title="${text(ctx, item.name || 'Asset')}">${text(ctx, item.name || 'Asset')}</div>
            </div>
        ` : '';
        return `
            <div class="gmd-asset-container" style="width:100%; height:100%; position:relative;">
                ${fallback}
                ${src ? (isVideo
                    ? `<video src="${src}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" autoplay loop muted playsinline></video>`
                    : `<img src="${src}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" alt="">`
                ) : ''}
            </div>
        `;
    }

    function renderGoalBar(item, options) {
        const ctx = createContext(options);
        const current = Number(item.currentCount || 0);
        const target = Number(item.targetCount || 100);
        const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
        const color = item.barColor || '#ff007f';
        const glow = item.glowColor || 'rgba(255,0,127,0.5)';
        const titleSize = font(ctx, item.fontSize, 38);
        const subSize = font(ctx, item.subtitleFontSize, 24);
        const radius = length(ctx, item.borderRadius, 12);
        return `
            <div class="gmd-goal-bar-widget ${item.themeStyle === 'neon' ? 'theme-neon' : ''}" style="border-radius: ${radius}px; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `${color}80`)}; box-shadow: ${item.hideBg ? 'none' : `0 ${roundPx(10, ctx.scale)}px ${roundPx(30, ctx.scale)}px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 ${roundPx(15, ctx.scale)}px ${color}26`}; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at top left, ${color}12, #0f172a)`)}; padding: ${roundPx(16, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; gap: ${roundPx(8, ctx.scale)}px; width: 100%;">
                    <div class="gmd-goal-bar-title-row" style="font-size: ${titleSize}px;">
                        <span style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}80; font-size: ${titleSize}px;">${text(ctx, item.name) || (text(ctx, item.giftName) + ' Goal') || 'Rose Goal'}</span>
                        <span style="color: ${color}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}80; font-size: ${titleSize}px;">${current}/${target}</span>
                    </div>
                    <div class="gmd-goal-bar-outer" style="height: ${length(ctx, item.barHeight, 54)}px; border-radius: ${radius}px;">
                        <div class="gmd-goal-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; --bar-color: ${color}; --bar-glow: ${glow}; background: linear-gradient(90deg, ${color}, ${glow}); box-shadow: 0 0 ${roundPx(24, ctx.scale)}px ${glow}; border-radius: ${radius}px;"></div>
                    </div>
                    ${item.subtitleText ? `<div class="gmd-goal-bar-subtitle" style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : (item.subtitleColor || '#cbd5e1')}; text-align: left; margin-top: ${roundPx(2, ctx.scale)}px; line-height: 1.2; opacity: 0.9;">${text(ctx, item.subtitleText)}</div>` : ''}
                </div>
            </div>
        `;
    }

    function renderGoalCircle(item, options) {
        const ctx = createContext(options);
        const current = Number(item.currentCount || 0);
        const target = Number(item.targetCount || 100);
        const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
        const color = item.barColor || '#ff007f';
        const r = 50;
        const circ = 2 * Math.PI * r;
        const strokeOffset = circ - (pct / 100) * circ;
        const icon = item.centerIcon || 'heart';
        const giftIcon = icon === 'gift-icon' ? giftIconFromLibrary(item, ctx.gifts, ctx.apiBase) : '';
        const innerIcon = giftIcon
            ? (isVideoAsset(giftIcon)
                ? `<video src="${giftIcon}" autoplay loop muted playsinline style="width: ${roundPx(44, ctx.scale)}px; height: ${roundPx(44, ctx.scale)}px; border-radius: 50%; object-fit: contain; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color});"></video>`
                : `<img src="${giftIcon}" style="width: ${roundPx(44, ctx.scale)}px; height: ${roundPx(44, ctx.scale)}px; border-radius: 50%; object-fit: contain; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color});">`)
            : `<span style="font-size: ${roundPx(32, ctx.scale)}px; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color});">${text(ctx, icon)}</span>`;
        return `
            <div class="gmd-goal-circle-widget" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box; background:${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : 'radial-gradient(circle at center, rgba(10,15,30,0.5) 0%, #0a0a14 100%)')}; border:${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : 'rgba(255,255,255,0.08)'}`}; border-radius: ${roundPx(24, ctx.scale)}px; padding: ${roundPx(16, ctx.scale)}px; box-shadow:${item.hideBg ? 'none' : `0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.37)`};">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display:flex; flex-direction:column; align-items:center; width:100%; position:relative;">
                    <div style="font-size: ${font(ctx, item.fontSize, 24)}px; font-weight: 900; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}80; margin-bottom: ${roundPx(8, ctx.scale)}px;">${pct}%</div>
                    <div style="position: relative; width: ${roundPx(120, ctx.scale)}px; height: ${roundPx(120, ctx.scale)}px; display: flex; align-items: center; justify-content: center;">
                        <svg width="${roundPx(120, ctx.scale)}" height="${roundPx(120, ctx.scale)}" viewBox="0 0 120 120" style="transform: rotate(-90deg);">
                            <circle cx="60" cy="60" r="${r}" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                            <circle cx="60" cy="60" r="${r}" fill="transparent" stroke="${color}" stroke-width="8" stroke-dasharray="${circ}" stroke-dashoffset="${strokeOffset}" stroke-linecap="round" style="transition: stroke-dashoffset 0.3s ease; filter: drop-shadow(0 0 ${roundPx(8, ctx.scale)}px ${color});" />
                        </svg>
                        <div style="position: absolute; display: flex; align-items: center; justify-content: center;">${innerIcon}</div>
                    </div>
                    <div style="font-size: ${font(ctx, item.fontSize, 24)}px; font-weight: 800; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; margin-top: ${roundPx(12, ctx.scale)}px; text-align: center; line-height: 1.2;">${text(ctx, item.name || item.giftName || 'Goal')}</div>
                    <div style="font-size: ${font(ctx, item.numberFontSize, 16)}px; font-weight: 800; color: ${color}; text-shadow: 0 0 ${roundPx(8, ctx.scale)}px ${color}60; margin-top: ${roundPx(4, ctx.scale)}px;">${current}/${target}</div>
                    ${item.subtitleText ? `<div style="font-size: ${font(ctx, item.subtitleFontSize, 16)}px; color: ${item.useCustomTextColor ? (item.textColor || '#94a3b8') : '#94a3b8'}; margin-top: ${roundPx(4, ctx.scale)}px; text-align: center; font-weight: 600; line-height: 1.2;">${text(ctx, item.subtitleText)}</div>` : ''}
                </div>
            </div>
        `;
    }

    function renderBossBar(item, options) {
        const ctx = createContext(options);
        const current = Number(item.currentCount || 0);
        const target = Number(item.targetCount || 100);
        const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
        const color = item.barColor || '#ef4444';
        const formatNum = (num) => num >= 1000 ? (num / 1000).toFixed(1).replace('.0', '') + 'k' : num;
        return `
            <div class="gmd-boss-bar-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${roundPx(30, ctx.scale)}px ${color}4d, 0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.6)`}; display: flex; flex-direction: column; justify-content: center; padding: ${roundPx(16, ctx.scale)}px; box-sizing: border-box; width: 100%; height: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; gap: ${roundPx(14, ctx.scale)}px; width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: ${font(ctx, item.fontSize, 38)}px; font-weight: 900; color: #fff; line-height: 1;">
                        <span style="display: flex; align-items: center; gap: ${roundPx(6, ctx.scale)}px; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}; font-size: ${font(ctx, item.fontSize, 38)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'};">${text(ctx, item.bossName || 'BOSS HP')}</span>
                        <span style="color: ${color}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}; font-size: ${font(ctx, item.fontSize, 38)}px;">${pct}%</span>
                    </div>
                    <div class="gmd-boss-bar-outer" style="height: ${length(ctx, item.barHeight, 24)}px; background: rgba(0, 0, 0, 0.6); border-radius: 4px; overflow: hidden; border: 1px solid ${color}40; position: relative; box-sizing: border-box; width: 100%;">
                        <div class="gmd-boss-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="height: 100%; width: ${pct}%; --bar-color: ${color}; --bar-glow: ${color}; background: linear-gradient(90deg, #b91c1c, ${color}); box-shadow: 0 0 ${roundPx(12, ctx.scale)}px ${color};"></div>
                    </div>
                    <div style="font-size: ${font(ctx, item.subtitleFontSize, 26)}px; color: ${item.useCustomTextColor ? (item.textColor || '#9ca3af') : '#9ca3af'}; text-align: left; display: flex; justify-content: space-between; line-height: 1;">
                        <span>${text(ctx, item.bossSub || 'Gift attack')}</span>
                        <span style="color: ${color}; font-weight: bold;">${formatNum(current)}/${formatNum(target)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCombo(item, options) {
        const ctx = createContext(options);
        const count = item.comboCount || 88;
        return `
            <div class="gmd-combo-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? 'none' : `1.5px solid ${item.useCustomBg ? bg(item.bgColor) : (item.barColor || '#ef4444')}`}; font-size: ${font(ctx, item.fontSize, 40)}px; border-radius: ${roundPx(24, ctx.scale)}px; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; padding: ${roundPx(12, ctx.scale)}px; gap: ${roundPx(8, ctx.scale)}px; display: flex; align-items: center; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${roundPx(12, ctx.scale)}px rgba(239, 68, 68, 0.2)`};">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; align-items: center; gap: ${roundPx(8, ctx.scale)}px; width: 100%;">
                    <div class="gmd-combo-num" style="font-size: ${font(ctx, item.numberFontSize, 64)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">x${count}</div>
                    <div style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${text(ctx, item.name || 'COMBO DANG CHAY!')}</div>
                    ${item.subtitleText ? `<div style="font-size: ${font(ctx, item.subtitleFontSize, 20)}px; color: ${item.useCustomTextColor ? (item.textColor || '#fca5a5') : (item.subtitleColor || '#fca5a5')}; font-weight: bold; margin-top: ${roundPx(4, ctx.scale)}px; line-height: 1.2;">${text(ctx, item.subtitleText)}</div>` : ''}
                </div>
            </div>
        `;
    }

    function renderMysteryChest(item, options) {
        const ctx = createContext(options);
        const current = Number(item.currentCount || 0);
        const target = Number(item.targetCount || 100);
        const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
        const color = item.barColor || '#a855f7';
        const node = (left, label, icon) => `
            <div class="gmd-mystery-node ${pct >= left ? 'unlocked' : ''}" style="left: ${left}%;">
                <span class="gmd-mystery-chest" style="font-size: ${roundPx(pct >= left ? 44 : 32, ctx.scale)}px; top: -${roundPx(8, ctx.scale)}px;">${icon}</span>
                <span class="gmd-mystery-pct" style="font-size: ${roundPx(20, ctx.scale)}px; margin-top: ${roundPx(8, ctx.scale)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${label}</span>
            </div>
        `;
        return `
            <div class="gmd-mystery-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, rgba(168, 85, 247, 0.1) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : color}`}; border-radius: ${roundPx(24, ctx.scale)}px; padding: ${roundPx(18, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; width: 100%;">
                    <div class="gmd-mystery-header" style="font-size: ${font(ctx, item.fontSize, 32)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')};">${text(ctx, item.name || 'Mystery Chest')}</div>
                    <div class="gmd-mystery-title-row" style="font-size: ${roundPx(26, ctx.scale)}px; margin-top: ${roundPx(6, ctx.scale)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">
                        <span>${text(ctx, item.giftName || 'Gift')} Goal</span>
                        <span>${current}/${target}</span>
                    </div>
                    <div class="gmd-mystery-track-wrap" style="margin-top: ${roundPx(16, ctx.scale)}px;">
                        <div class="gmd-mystery-bar-outer" style="height: ${length(ctx, item.barHeight, 24)}px; border-radius: ${roundPx(24, ctx.scale)}px;">
                            <div class="gmd-mystery-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; border-radius: ${roundPx(24, ctx.scale)}px; --bar-color: ${color}; --bar-glow: ${item.glowColor || '#fb7185'};"></div>
                        </div>
                        <div class="gmd-mystery-milestones">
                            ${node(25, '25%', 'BOX')}
                            ${node(50, '50%', 'BOX')}
                            ${node(75, '75%', 'BOX')}
                            ${node(100, '100%', 'GEM')}
                        </div>
                    </div>
                    ${item.subtitleText ? `<div style="font-size: ${font(ctx, item.subtitleFontSize, 20)}px; color: ${item.useCustomTextColor ? (item.textColor || '#fda4af') : (item.subtitleColor || '#fda4af')}; text-align: center; margin-top: ${roundPx(6, ctx.scale)}px; font-weight: bold; line-height: 1.2;">${text(ctx, item.subtitleText)}</div>` : ''}
                </div>
            </div>
        `;
    }

    function renderTopContributors(item, options) {
        const ctx = createContext(options);
        const contributors = Array.isArray(item.contributors) ? item.contributors : [];
        const sliced = contributors.slice(0, Number(item.limitCount || 3));
        const color = item.barColor || '#eab308';
        return `
            <div class="gmd-contributors-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${roundPx(20, ctx.scale)}px ${color}33, 0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.6)`}; padding: ${roundPx(12, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; gap: ${roundPx(6, ctx.scale)}px; width: 100%;">
                    <div class="gmd-contrib-header" style="font-size: ${font(ctx, item.fontSize, 34)}px; padding-bottom: ${roundPx(14, ctx.scale)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; border-bottom-color: ${color}4d;">BANG VINH DANH</div>
                    <div class="gmd-contrib-list" style="display: flex; flex-direction: column; gap: ${roundPx(6, ctx.scale)}px;">
                        ${sliced.map((c, idx) => `
                            <div class="gmd-contrib-item" style="font-size: ${font(ctx, item.rowFontSize, 30)}px; padding: ${roundPx(10, ctx.scale)}px ${roundPx(14, ctx.scale)}px; gap: ${roundPx(18, ctx.scale)}px; border-radius: ${roundPx(14, ctx.scale)}px;">
                                <span class="gmd-contrib-rank" style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">#${idx + 1}</span>
                                ${item.showAvatar !== false ? `<div class="gmd-contrib-avatar" style="width: ${roundPx(48, ctx.scale)}px; height: ${roundPx(48, ctx.scale)}px; border-radius: 50%; background: #2e3b5e; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; background-image: url('${c.avatar || ''}'); background-size: cover;"></div>` : ''}
                                <span class="gmd-contrib-name" style="color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : ''};">${text(ctx, c.nickname || 'BH Studio')}</span>
                                ${item.showValue !== false ? `<span class="gmd-contrib-val">${c.value || 0}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPodium(item, options) {
        const ctx = createContext(options);
        const contributors = Array.isArray(item.contributors) ? item.contributors : [];
        const person = (idx, rank, size) => {
            const c = contributors[idx] || {};
            return `
                <div class="gmd-podium-spot rank-${rank}">
                    <div class="gmd-podium-avatar-wrap">
                        <div class="gmd-podium-avatar" style="width: ${roundPx(size, ctx.scale)}px; height: ${roundPx(size, ctx.scale)}px; display:flex; align-items:center; justify-content:center; font-size:${roundPx(size * 0.44, ctx.scale)}px; background-image: url('${c.avatar || ''}'); background-size: cover;">${c.avatar ? '' : ''}</div>
                    </div>
                    <div class="gmd-podium-name" style="font-size: ${font(ctx, item.rowFontSize, 22)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${text(ctx, c.nickname || 'Trong')}</div>
                    ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${font(ctx, item.valueFontSize, 22)}px;">${c.value || 0}</div>` : ''}
                </div>
            `;
        };
        return `
            <div class="gmd-podium-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : 'radial-gradient(circle at center, rgba(234, 179, 8, 0.1) 0%, #0a0a14 100%)')}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : '#eab308'}`}; border-radius: ${roundPx(24, ctx.scale)}px; padding: ${roundPx(18, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; width: 100%;">
                    <div class="gmd-podium-header" style="font-size: ${font(ctx, item.fontSize, 34)}px; padding-bottom: ${roundPx(8, ctx.scale)}px; color: ${item.useCustomTextColor ? (item.textColor || '#eab308') : ''};">VUONG MIEN HOANG GIA</div>
                    <div class="gmd-podium-podium" style="gap: ${roundPx(14, ctx.scale)}px;">
                        ${person(1, 2, 64)}
                        ${person(0, 1, 88)}
                        ${person(2, 3, 64)}
                    </div>
                </div>
            </div>
        `;
    }

    function renderGoalList(item, options) {
        const ctx = createContext(options);
        const goals = Array.isArray(item.goals) ? item.goals : [];
        const color = item.barColor || '#ff007f';
        const isAutoScroll = item.autoScroll === true;
        const goalsList = isAutoScroll && goals.length > 0 ? [...goals, ...goals] : goals;
        return `
            <div class="gmd-goal-list-widget" style="width:100%; height:100%; padding: ${roundPx(24, ctx.scale)}px; box-sizing: border-box; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : color}`}; border-radius: ${roundPx(24, ctx.scale)}px; display:flex; flex-direction:column; justify-content:flex-start; overflow:hidden; box-shadow: ${item.hideBg ? 'none' : `0 0 ${roundPx(30, ctx.scale)}px ${color}26, 0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.6)`};">
                <div class="gmd-goal-list-header" style="font-weight:900; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}80; text-align:center; font-size: ${font(ctx, item.fontSize, 32)}px; margin-bottom: ${roundPx(12, ctx.scale)}px; flex-shrink: 0; transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px);">${text(ctx, item.name || 'MUC TIEU HOM NAY')}</div>
                <div class="gmd-goal-list-scroll-container" style="flex: 1; overflow: hidden; position: relative; width: 100%; transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px);">
                    <div class="${isAutoScroll ? 'gmd-goal-list-marquee-track' : 'gmd-goal-list-static-track'}" style="${isAutoScroll ? `animation: gmdMarqueeVertical ${item.autoScrollSpeed !== undefined ? item.autoScrollSpeed : 15}s linear infinite;` : `display:flex; flex-direction:column; gap: ${roundPx(12, ctx.scale)}px;`}">
                        ${goalsList.map(g => {
                            const pct = Math.min(100, Math.round((g.current || 0) / (g.target || 1) * 100));
                            const icon = assetUrl(g.icon || '', ctx.apiBase);
                            return `
                                <div class="gmd-goal-list-row ${item.shimmerEffect !== false ? 'gmd-shimmer-row' : ''}" style="display:flex; flex-direction:column; gap: ${roundPx(8, ctx.scale)}px; background:rgba(255,255,255,0.02); padding: ${roundPx(12, ctx.scale)}px ${roundPx(16, ctx.scale)}px; border-radius: ${roundPx(12, ctx.scale)}px; margin-bottom: ${isAutoScroll ? `${roundPx(12, ctx.scale)}px` : '0'}; position: relative; overflow: hidden;">
                                    <div class="gmd-goal-list-text-row" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                        <div style="display:flex; align-items:center; gap:${roundPx(8, ctx.scale)}px;">
                                            ${icon ? `<img class="gmd-goal-list-icon" src="${icon}" style="width: ${length(ctx, item.iconSize, 28)}px; height: ${length(ctx, item.iconSize, 28)}px; border-radius:50%;" alt="">` : `<div style="font-size:${roundPx(item.iconSize !== undefined ? Math.round(item.iconSize * 0.7) : 20, ctx.scale)}px;"></div>`}
                                            ${item.showGiftName !== false ? `<span class="gmd-goal-list-label" style="font-size: ${font(ctx, item.rowFontSize, 22)}px; font-weight:800; color:${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : '#e2e8f0'};">${text(ctx, g.giftName || 'Gift')}</span>` : ''}
                                        </div>
                                        <span class="gmd-goal-list-counts" style="font-size: ${font(ctx, item.rowFontSize, 22)}px; font-weight:800; color: ${item.barColor || '#38bdf8'}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${item.barColor || '#38bdf8'}80;">${g.current}/${g.target} (${pct}%)</span>
                                    </div>
                                    <div class="gmd-goal-list-bar-outer" style="width:100%; height: ${length(ctx, item.barHeight, 12)}px; background:rgba(0,0,0,0.35); border-radius:99px; overflow:hidden; border: none; position:relative;">
                                        <div class="gmd-goal-list-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width:${pct}%; height:100%; --bar-color: ${item.barColor || '#38bdf8'}; --bar-glow: ${item.barColor || '#38bdf8'}; background:${item.barColor || '#38bdf8'}; border-radius:99px; box-shadow: 0 0 ${roundPx(12, ctx.scale)}px ${item.barColor || '#38bdf8'};"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ${item.footerText ? `<div class="gmd-goal-list-footer" style="text-align:center; font-size: ${font(ctx, item.footerFontSize, 20)}px; color:#cbd5e1; font-weight:bold; margin-top: ${roundPx(12, ctx.scale)}px; flex-shrink: 0; transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px);">${text(ctx, item.footerText)}</div>` : ''}
            </div>
        `;
    }

    function renderGiftStackGroup(item, options) {
        const ctx = createContext(options);
        const children = Array.isArray(item.children) ? item.children : [];
        const isLoop = item.loopEnabled === true;
        const loopDir = item.loopDirection || 'vertical';
        const loopSpeed = item.loopSpeed !== undefined ? item.loopSpeed : 15;
        const childrenToRender = isLoop && children.length > 0 ? Array(6).fill(children).flat() : children;
        const direction = item.layoutDirection === 'horizontal' ? 'horizontal' : 'vertical';
        const textPosition = item.textPosition || 'bottom';
        const iconSize = length(ctx, item.iconSize, 64);
        const textSize = font(ctx, item.textSize, 14);
        const textGap = length(ctx, item.textGap, 4);
        const gap = length(ctx, item.gap, 10);
        const flexDirection = direction === 'horizontal' ? 'row' : 'column';
        const childFlexDirection = textPosition === 'left' || textPosition === 'right' ? 'row' : 'column';
        const labelOrder = textPosition === 'top' || textPosition === 'left' ? -1 : 1;
        const panelBg = item.showPanel === false
            ? 'transparent'
            : (item.panelFillType === 'gradient'
                ? `linear-gradient(${Number(item.panelGradientAngle ?? 135)}deg, ${bg(item.panelGradientFrom || item.panelColor || '#3b1f48')}, ${bg(item.panelGradientTo || '#0a0a14')})`
                : bg(item.panelColor || item.bgColor || '#0a0a14'));
        const borderBg = item.borderFillType === 'gradient'
            ? `linear-gradient(${Number(item.borderGradientAngle ?? 135)}deg, ${item.borderGradientFrom || item.borderColor || '#22d3ee'}, ${item.borderGradientTo || '#a855f7'})`
            : (item.borderColor || '#22d3ee');
        const borderEffect = ['glow', 'pulse', 'running-light', 'dashed-march'].includes(item.borderEffect) ? item.borderEffect : 'none';
        const panelEffect = ['light-sweep', 'breathing', 'energy-flow', 'glass-shine'].includes(item.panelEffect) ? item.panelEffect : 'none';
        const borderSpeed = Math.max(0.5, Number(item.borderEffectSpeed) || 2);
        const panelSpeed = Math.max(0.5, Number(item.panelEffectSpeed) || 3);
        const borderGlow = Math.max(0, Math.min(1, Number(item.borderGlowIntensity ?? 0.55)));
        const panelGlow = Math.max(0, Math.min(1, Number(item.panelGlowIntensity ?? 0.35)));
        const effectScale = ctx.scale * Math.max(1, Math.sqrt(Math.max(1, Number(item.renderScale) || 1)));
        const effectPx = (value) => Math.round(Number(value || 0) * effectScale);
        const renderedW = Math.max(1, Number(item.width || item.w || 100) * ctx.scale);
        const renderedH = Math.max(1, Number(item.height || item.h || 100) * ctx.scale);
        const radiusPx = Math.round(Number(item.borderRadius || 8) * ctx.scale);
        const paddingPx = Math.round(Number(item.padding !== undefined ? item.padding : 8) * ctx.scale);
        const borderId = `gmd_stack_border_${String(item.id || 'group').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const borderStroke = item.borderFillType === 'gradient' ? `url(#${borderId})` : (item.borderColor || '#22d3ee');
        const borderWidth = Math.max(1, effectPx(2));
        const runningFrom = item.borderGradientFrom || item.borderColor || '#22d3ee';
        const runningTo = item.borderGradientTo || '#a855f7';
        const borderMask = '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;';
        const runningCoreSize = Math.max(3, borderWidth * 1.35);
        const runningGlowSize = Math.max(10, borderWidth * 4.8);
        const runningCoreGradient = `linear-gradient(90deg, transparent 0%, ${runningFrom} 18%, rgba(255,255,255,.96) 50%, ${runningTo} 82%, transparent 100%)`;
        const runningVerticalGradient = `linear-gradient(180deg, transparent 0%, ${runningFrom} 18%, rgba(255,255,255,.96) 50%, ${runningTo} 82%, transparent 100%)`;
        const borderInsetX = Math.max(0.2, (borderWidth / 2 / renderedW) * 100);
        const borderInsetY = Math.max(0.2, (borderWidth / 2 / renderedH) * 100);
        const borderRectW = 100 - borderInsetX * 2;
        const borderRectH = 100 - borderInsetY * 2;
        const perimeter = 2 * (renderedW + renderedH);
        const runningDash = Math.round(perimeter * 0.35);
        const runningGap = perimeter - runningDash;
        const borderRx = Math.max(0, Math.min(50, (radiusPx / renderedW) * 100));
        const borderRy = Math.max(0, Math.min(50, (radiusPx / renderedH) * 100));
        const pathD = `M ${borderInsetX + borderRx} ${borderInsetY} h ${borderRectW - 2 * borderRx} a ${borderRx} ${borderRy} 0 0 1 ${borderRx} ${borderRy} v ${borderRectH - 2 * borderRy} a ${borderRx} ${borderRy} 0 0 1 -${borderRx} ${borderRy} h -${borderRectW - 2 * borderRx} a ${borderRx} ${borderRy} 0 0 1 -${borderRx} -${borderRy} v -${borderRectH - 2 * borderRy} a ${borderRx} ${borderRy} 0 0 1 ${borderRx} -${borderRy} Z`;
        const borderDash = borderEffect === 'running-light'
            ? `${runningDash} ${runningGap}`
            : (borderEffect === 'dashed-march' ? '4 4' : '');
        const borderAnimation = borderEffect === 'running-light'
            ? 'none'
            : (borderEffect === 'dashed-march'
                ? `gmdStackStrokeDash var(--stack-border-speed) linear infinite`
                : (borderEffect === 'pulse' ? `gmdStackBorderPulse var(--stack-border-speed) ease-in-out infinite` : 'none'));
        const shadow = item.showPanel === false && item.showBorder === false
            ? 'none'
            : `0 0 ${effectPx(18)}px rgba(34, 211, 238, ${0.08 + borderGlow * 0.22}), 0 ${effectPx(8)}px ${effectPx(24)}px rgba(0,0,0,.35)`;
        const labelMargin = textPosition === 'left' || textPosition === 'right'
            ? `margin-${textPosition === 'left' ? 'right' : 'left'}:${textGap}px;`
            : `margin-${textPosition === 'top' ? 'bottom' : 'top'}:${textGap}px;`;

        return `
            <style>
                @keyframes gmdStackBorderPulse { 0%,100%{opacity:.65;filter:brightness(1)} 50%{opacity:1;filter:brightness(1.55)} }
                @keyframes gmdStackStrokeDash { to { stroke-dashoffset: -16; } }
                @keyframes gmdStackRunTop { 0%{opacity:1;transform:translateX(-125%)} 24%{opacity:1;transform:translateX(245%)} 24.1%,100%{opacity:0;transform:translateX(245%)} }
                @keyframes gmdStackRunRight { 0%,24.9%{opacity:0;transform:translateY(-125%)} 25%{opacity:1;transform:translateY(-125%)} 49%{opacity:1;transform:translateY(245%)} 49.1%,100%{opacity:0;transform:translateY(245%)} }
                @keyframes gmdStackRunBottom { 0%,49.9%{opacity:0;transform:translateX(125%)} 50%{opacity:1;transform:translateX(125%)} 74%{opacity:1;transform:translateX(-245%)} 74.1%,100%{opacity:0;transform:translateX(-245%)} }
                @keyframes gmdStackRunLeft { 0%,74.9%{opacity:0;transform:translateY(125%)} 75%{opacity:1;transform:translateY(125%)} 99%{opacity:1;transform:translateY(-245%)} 99.1%,100%{opacity:0;transform:translateY(-245%)} }
                @keyframes gmdStackLightSweep { 0%{transform:translateX(0) skewX(-18deg)} 100%{transform:translateX(360%) skewX(-18deg)} }
                @keyframes gmdStackBreathing { 0%,100%{opacity:.2} 50%{opacity:.75} }
                @keyframes gmdStackEnergyFlow { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
                @keyframes gmdTextLightSweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
                @keyframes gmdTextHoloShift {
                    0% { background-position: 0% 50%; filter: hue-rotate(0deg); }
                    50% { background-position: 100% 50%; filter: hue-rotate(180deg); }
                    100% { background-position: 0% 50%; filter: hue-rotate(360deg); }
                }
                @keyframes gmdGlassBreath {
                    0%, 100% { background-color: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); box-shadow: 0 ${Math.max(2, Math.round(2 * ctx.scale))}px ${Math.max(6, Math.round(6 * ctx.scale))}px rgba(0,0,0,0.2); }
                    50% { background-color: rgba(255,255,255,0.11); border-color: rgba(255,255,255,0.22); box-shadow: 0 ${Math.max(4, Math.round(4 * ctx.scale))}px ${Math.max(12, Math.round(12 * ctx.scale))}px rgba(0,0,0,0.28), 0 0 ${Math.max(4, Math.round(4 * ctx.scale))}px rgba(255,255,255,0.08); }
                }
                @keyframes gmdMysticGlow {
                    0%, 100% { box-shadow: 0 0 ${effectPx(6)}px var(--glow-soft); }
                    50% { box-shadow: 0 0 ${effectPx(14)}px var(--glow-bright); }
                }
                @keyframes gmdMagicLiquidMorph {
                    0%, 100% { border-radius: ${effectPx(16)}px ${effectPx(4)}px ${effectPx(18)}px ${effectPx(6)}px / ${effectPx(6)}px ${effectPx(16)}px ${effectPx(4)}px ${effectPx(18)}px; }
                    50% { border-radius: ${effectPx(4)}px ${effectPx(18)}px ${effectPx(6)}px ${effectPx(16)}px / ${effectPx(18)}px ${effectPx(4)}px ${effectPx(16)}px ${effectPx(6)}px; }
                }
                @keyframes gmdMagicLiquidMorph2 {
                    0%, 100% { border-radius: ${effectPx(4)}px ${effectPx(18)}px ${effectPx(6)}px ${effectPx(16)}px / ${effectPx(18)}px ${effectPx(4)}px ${effectPx(16)}px ${effectPx(6)}px; }
                    50% { border-radius: ${effectPx(16)}px ${effectPx(4)}px ${effectPx(18)}px ${effectPx(6)}px / ${effectPx(6)}px ${effectPx(16)}px ${effectPx(4)}px ${effectPx(18)}px; }
                }
                .gmd-stack-group-text-wrap {
                    position: relative !important;
                    overflow: visible !important;
                }
                .gmd-stack-group-text-wrap::before {
                    content: '' !important;
                    position: absolute !important;
                    inset: -${effectPx(2.5)}px !important;
                    border: 0.8px solid var(--inner-border-color, transparent) !important;
                    pointer-events: none !important;
                    animation: gmdMagicLiquidMorph2 8s ease-in-out infinite !important;
                    z-index: 1 !important;
                }
                @keyframes gmdStackMarqueeHorizontal_${item.id || 'group'} { 0% { transform: translateX(0); } 100% { transform: translateX(-16.6667%); } }
                @keyframes gmdStackMarqueeVertical_${item.id || 'group'} { 0% { transform: translateY(0); } 100% { transform: translateY(-16.6667%); } }
            </style>
            <div class="gmd-stack-group-viewport gmd-stack-panel-${panelEffect}" style="--stack-panel-speed:${panelSpeed}s;--stack-panel-glow:${panelGlow};width:100%;height:100%;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;background:${panelBg};border:1px solid transparent;border-radius:${radiusPx}px;box-shadow:${shadow};box-sizing:border-box;padding:${paddingPx}px;">
                ${item.showPanel !== false && panelEffect !== 'none' ? `<span class="gmd-stack-panel-effect" style="position:absolute;pointer-events:none;z-index:1;border-radius:inherit;${panelEffect === 'light-sweep' ? `top:0;bottom:0;left:-55%;width:55%;background:linear-gradient(105deg, transparent 22%, rgba(255,255,255,${0.15 + panelGlow * 0.55}) 50%, transparent 78%);animation:gmdStackLightSweep var(--stack-panel-speed) ease-in-out infinite;` : ''}${panelEffect === 'breathing' ? `inset:0;background:radial-gradient(circle at 50% 45%, rgba(255,255,255,${0.08 + panelGlow * 0.28}), transparent 68%);animation:gmdStackBreathing var(--stack-panel-speed) ease-in-out infinite;` : ''}${panelEffect === 'energy-flow' ? `inset:0;background:linear-gradient(90deg, transparent, rgba(255,255,255,${0.06 + panelGlow * 0.18}), transparent, rgba(168,85,247,${0.08 + panelGlow * 0.22}), transparent);background-size:200% 100%;animation:gmdStackEnergyFlow var(--stack-panel-speed) linear infinite;` : ''}${panelEffect === 'glass-shine' ? `inset:0;background:linear-gradient(145deg, rgba(255,255,255,${0.12 + panelGlow * 0.22}), transparent 34%, transparent 68%, rgba(255,255,255,${0.05 + panelGlow * 0.12}));` : ''}"></span>` : ''}
                ${item.showBorder !== false ? `
                    <svg class="gmd-stack-border-effect gmd-stack-border-${borderEffect}" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible;filter:drop-shadow(0 0 ${effectPx(8)}px rgba(34,211,238,${borderGlow}));">
                        <defs>
                            <linearGradient id="${borderId}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="${item.borderGradientFrom || item.borderColor || '#22d3ee'}"></stop>
                                <stop offset="100%" stop-color="${item.borderGradientTo || '#a855f7'}"></stop>
                            </linearGradient>
                        </defs>
                        ${borderEffect === 'running-light' ? `
                            <path d="${pathD}" fill="none" stroke="${borderStroke}" stroke-width="${Math.max(1, borderWidth * 0.72)}" opacity="${0.18 + borderGlow * 0.18}" vector-effect="non-scaling-stroke"></path>
                            <path d="${pathD}" fill="none" stroke="${borderStroke}" stroke-width="${Math.max(4, borderWidth * 2.55)}" stroke-dasharray="${Math.round(runningDash * 1.2)} ${Math.max(1, perimeter - Math.round(runningDash * 1.2))}" stroke-dashoffset="0" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="${Math.min(0.82, 0.22 + borderGlow * 0.52)}" style="filter:blur(${effectPx(1.7)}px);">
                                <animate attributeName="stroke-dashoffset" from="0" to="-${perimeter}" dur="${borderSpeed}s" begin="run_anim_${borderId}.begin" repeatCount="indefinite"></animate>
                            </path>
                            <path id="run_anim_core_${borderId}" d="${pathD}" fill="none" stroke="${borderStroke}" stroke-width="${Math.max(2, borderWidth * 1.22)}" stroke-dasharray="${runningDash} ${runningGap}" stroke-dashoffset="0" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="1">
                                <animate id="run_anim_${borderId}" attributeName="stroke-dashoffset" from="0" to="-${perimeter}" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                            </path>
                        ` : borderEffect === 'pulse' ? `
                            <rect x="${borderInsetX}" y="${borderInsetY}" width="${borderRectW}" height="${borderRectH}" rx="${borderRx}" ry="${borderRy}" fill="none" stroke="${borderStroke}" stroke-width="${Math.max(2.5, borderWidth * 1.8)}" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="${0.18 + borderGlow * 0.28}" style="filter:blur(${effectPx(1.5)}px);">
                                <animate attributeName="opacity" values="${0.18 + borderGlow * 0.22};${0.42 + borderGlow * 0.46};${0.18 + borderGlow * 0.22}" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                                <animate attributeName="stroke-width" values="${Math.max(2.5, borderWidth * 1.4)};${Math.max(4, borderWidth * 2.6)};${Math.max(2.5, borderWidth * 1.4)}" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                            </rect>
                            <rect x="${borderInsetX}" y="${borderInsetY}" width="${borderRectW}" height="${borderRectH}" rx="${borderRx}" ry="${borderRy}" fill="none" stroke="${borderStroke}" stroke-width="${borderWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.92">
                                <animate attributeName="opacity" values="0.68;1;0.68" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                            </rect>
                        ` : borderEffect === 'dashed-march' ? `
                            <rect x="${borderInsetX}" y="${borderInsetY}" width="${borderRectW}" height="${borderRectH}" rx="${borderRx}" ry="${borderRy}" fill="none" stroke="${borderStroke}" stroke-width="${Math.max(2.5, borderWidth * 1.65)}" stroke-dasharray="${Math.max(4, borderWidth * 2)} ${Math.max(4, borderWidth * 1.7)}" stroke-dashoffset="0" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="${Math.min(0.62, 0.14 + borderGlow * 0.42)}" style="filter:blur(${effectPx(1)}px);">
                                <animate attributeName="stroke-dashoffset" from="0" to="-${Math.max(16, borderWidth * 8)}" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                            </rect>
                            <rect x="${borderInsetX}" y="${borderInsetY}" width="${borderRectW}" height="${borderRectH}" rx="${borderRx}" ry="${borderRy}" fill="none" stroke="${borderStroke}" stroke-width="${borderWidth}" stroke-dasharray="${Math.max(4, borderWidth * 2)} ${Math.max(4, borderWidth * 1.7)}" stroke-dashoffset="0" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.98">
                                <animate attributeName="stroke-dashoffset" from="0" to="-${Math.max(16, borderWidth * 8)}" dur="${borderSpeed}s" repeatCount="indefinite"></animate>
                            </rect>
                        ` : `
                            <rect x="${borderInsetX}" y="${borderInsetY}" width="${borderRectW}" height="${borderRectH}" rx="${borderRx}" ry="${borderRy}" fill="none" stroke="${borderStroke}" stroke-width="${borderWidth}" stroke-dasharray="${borderDash}" stroke-linecap="round" vector-effect="non-scaling-stroke" style="animation:${borderAnimation};opacity:${borderEffect === 'glow' ? 1 : 0.95};"></rect>
                        `}
                    </svg>
                ` : ''}
                <div class="gmd-stack-group-track" style="display:flex;flex-direction:${flexDirection};align-items:${item.childAlign === 'left' ? 'flex-start' : (item.childAlign === 'right' ? 'flex-end' : 'center')};gap:${isLoop ? 0 : gap}px;position:relative;z-index:2;${
                    isLoop 
                        ? (loopDir === 'horizontal' 
                            ? `width:max-content;height:100%;animation:gmdStackMarqueeHorizontal_${item.id || 'group'} ${loopSpeed}s linear infinite;`
                            : `width:100%;height:max-content;animation:gmdStackMarqueeVertical_${item.id || 'group'} ${loopSpeed}s linear infinite;`)
                        : 'width:100%;height:100%;justify-content:center;'
                }">
                    ${childrenToRender.map((child) => {
                        const icon = assetUrl(child.iconUrl || child.icon || '', ctx.apiBase);
                        const name = text(ctx, child.name || child.giftName || '');
                        const subtext = text(ctx, child.subtext || '');
                        
                        const auraMap = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep', 'Fire Aura': 'aura-fire', 'Electric Aura': 'aura-electric' };
                        const motionMap = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
                        const auraClass = auraMap[child.auraType] || '';
                        const motionClass = motionMap[child.animationType] || '';
                        const shapeMap = {
                            Square: { radius: '14%', clip: 'none' },
                            Hexagon: { radius: '0', clip: 'polygon(25% 6%, 75% 6%, 96% 50%, 75% 94%, 25% 94%, 4% 50%)' },
                            Star: { radius: '0', clip: 'polygon(50% 0%, 62% 35%, 98% 35%, 69% 57%, 79% 91%, 50% 70%, 21% 91%, 31% 57%, 2% 35%, 38% 35%)' },
                            Oval: { radius: '50% / 38%', clip: 'none' },
                            Circle: { radius: '50%', clip: 'none' }
                        };
                        const shape = shapeMap[child.auraShape] || shapeMap.Circle;
                        const animSpeed = Math.max(0.2, Number(child.animationSpeed) || 1);
                        const auraSpeed = Math.max(0.2, Number(child.auraSpeed) || 1);
                        const auraScale = Number(child.auraScale || 1);
                        const childMedia = isVideoAsset(icon)
                            ? `<video src="${icon}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>`
                            : `<img src="${icon}" alt="${name}">`;
                        const plainChildMedia = isVideoAsset(icon)
                            ? `<video src="${icon}" autoplay loop muted playsinline style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;display:block;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45));flex-shrink:0;"></video>`
                            : `<img src="${icon}" alt="${name}" style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;display:block;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45));flex-shrink:0;">`;

                        const visualContent = (auraClass || motionClass)
                            ? `
                                <div class="gmd-visual ${motionClass} ${auraClass}"
                                    style="width:${iconSize}px;height:${iconSize}px;--aura-color:${child.auraColor || '#d7b2ff'};--aura-radius:${shape.radius};--aura-clip:${shape.clip};--anim-speed:${animSpeed}s;--aura-speed:${auraSpeed}s;--aura-scale:${auraScale};--icon-url:url('${icon}');flex-shrink:0;">
                                    <span class="gmd-aura gmd-aura-back ${auraClass}"></span>
                                    <span class="gmd-icon-wrap" style="--icon-url:url('${icon}')">
                                        ${childMedia}
                                    </span>
                                    <span class="gmd-aura gmd-aura-front ${auraClass}"></span>
                                </div>
                            `
                            : plainChildMedia;

                        const showTextBg = child.showTextBg === true;
                        const textBgColor = child.textBgColor || 'rgba(0,0,0,0.5)';
                        const textBgStyle = child.textBgStyle || 'classic';
                        const auraColor = child.auraColor || '#d7b2ff';
                        
                        let labelBgStyle = '';
                        if (showTextBg) {
                            if (textBgStyle === 'glass') {
                                labelBgStyle = `background:rgba(255,255,255,0.05);animation:gmdGlassBreath 4s ease-in-out infinite;backdrop-filter:blur(${effectPx(6)}px);-webkit-backdrop-filter:blur(${effectPx(6)}px);border:${effectPx(1)}px solid rgba(255,255,255,0.12);`;
                            } else if (textBgStyle === 'neon') {
                                labelBgStyle = `background-image:linear-gradient(rgba(8,8,12,0.94), rgba(8,8,12,0.94)), linear-gradient(135deg, ${auraColor}, color-mix(in srgb, ${auraColor} 30%, white 70%));background-origin:border-box;background-clip:padding-box, border-box;border:${effectPx(1)}px solid transparent;--frame-color:${auraColor};--glow-soft:color-mix(in srgb, ${auraColor} 8%, transparent);--glow-bright:color-mix(in srgb, ${auraColor} 22%, transparent);--inner-border-color:color-mix(in srgb, ${auraColor} 50%, white);animation:gmdMagicLiquidMorph 6s ease-in-out infinite, gmdMysticGlow 4s ease-in-out infinite;`;
                            } else if (textBgStyle === 'holo') {
                                labelBgStyle = `background:linear-gradient(120deg, rgba(236,72,153,0.18) 0%, rgba(56,189,248,0.18) 40%, rgba(168,85,247,0.18) 70%, rgba(236,72,153,0.18) 100%);background-size:250% 100%;animation:gmdTextHoloShift 5s ease infinite;backdrop-filter:blur(${effectPx(6)}px);-webkit-backdrop-filter:blur(${effectPx(6)}px);border:${effectPx(1)}px solid rgba(255,255,255,0.12);box-shadow:0 ${effectPx(4)}px ${effectPx(12)}px rgba(0,0,0,0.25);`;
                            } else if (textBgStyle === 'dark-matte' || textBgStyle === 'light-sweep') {
                                labelBgStyle = `background:linear-gradient(110deg, rgba(15,23,42,0.85) 30%, rgba(255,255,255,0.28) 50%, rgba(15,23,42,0.85) 70%);background-size:200% 100%;animation:gmdTextLightSweep 3s linear infinite;border:${effectPx(1)}px solid rgba(255,255,255,0.1);box-shadow:0 ${effectPx(4)}px ${effectPx(12)}px rgba(0,0,0,0.3);`;
                            } else {
                                labelBgStyle = `background:${textBgColor};box-shadow:0 ${effectPx(2)}px ${effectPx(6)}px rgba(0,0,0,0.25);`;
                            }
                            labelBgStyle += `padding:${effectPx(3)}px ${effectPx(8)}px;border-radius:${effectPx(6)}px;`;
                        }

                        const textAlign = item.textAlign || 'center';
                        const alignVal = textAlign === 'left' ? 'flex-start' : (textAlign === 'right' ? 'flex-end' : 'center');

                        const childMargin = isLoop
                            ? (loopDir === 'horizontal' ? `margin-right:${gap}px;` : `margin-bottom:${gap}px;`)
                            : '';
                        return `
                            <div class="gmd-stack-group-child" style="display:flex;flex-direction:${childFlexDirection};align-items:center;justify-content:center;flex:0 0 auto;min-width:0;min-height:0;${childMargin}">
                                ${visualContent}
                                ${item.showName !== false ? `
                                    <div class="gmd-stack-group-text-wrap pos-${textPosition}" style="order:${labelOrder};${labelMargin}display:flex;flex-direction:column;align-items:${alignVal};justify-content:center;${labelBgStyle}">
                                        <div class="gmd-stack-group-label" style="font-size:${textSize}px;color:${item.textColor || '#ffffff'};font-weight:800;line-height:1.15;text-align:${textAlign};white-space:nowrap;text-shadow:0 2px 8px rgba(0,0,0,.62);">${name}</div>
                                        ${subtext ? `<div class="gmd-stack-group-subtext" style="font-size:${Math.max(8, Math.round(textSize * 0.78))}px;color:${item.textColor || '#ffffff'};opacity:0.8;font-weight:600;line-height:1.15;text-align:${textAlign};white-space:nowrap;margin-top:${effectPx(2)}px;text-shadow:0 1px 4px rgba(0,0,0,.5);">${subtext}</div>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderByType(item, options) {
        if (!item) return '';
        const type = item.type || 'gift';
        const map = {
            gift: renderGift,
            text: renderText,
            'media-asset': renderMediaAsset,
            'goal-bar': renderGoalBar,
            'goal-circle': renderGoalCircle,
            'boss-bar': renderBossBar,
            combo: renderCombo,
            'mystery-chests': renderMysteryChest,
            'top-contributors': renderTopContributors,
            'podium-contributors': renderPodium,
            'goal-list': renderGoalList,
            'gift-stack-group': renderGiftStackGroup
        };
        const renderer = map[type];
        return renderer ? renderer(item, options) : '';
    }

    window.MenuDesignerSharedRenderEngine = Object.freeze({
        safeText,
        renderGift,
        renderText,
        renderMediaAsset,
        renderGoalBar,
        renderGoalCircle,
        renderBossBar,
        renderCombo,
        renderMysteryChest,
        renderTopContributors,
        renderPodium,
        renderGoalList,
        renderGiftStackGroup,
        renderByType
    });
})();

(function () {
    let renderInstanceSequence = 0;

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

    function giftLabelBackground(item, ctx) {
        if (item.showTextBg !== true) return '';
        const px = (value) => roundPx(value, ctx.scale);
        const style = item.textBgStyle || 'classic';
        const gradientFrom = item.textBgGradientFrom || '#a855f7';
        const gradientTo = item.textBgGradientTo || '#22d3ee';
        let css = '';
        if (style === 'glass') css = `background:rgba(255,255,255,.05);animation:gmdGlassBreath 4s ease-in-out infinite;backdrop-filter:blur(${px(6)}px);-webkit-backdrop-filter:blur(${px(6)}px);border:${px(1)}px solid rgba(255,255,255,.12);`;
        else if (style === 'neon') css = `background-image:linear-gradient(rgba(8,8,12,.94),rgba(8,8,12,.94)),linear-gradient(135deg,${gradientFrom},${gradientTo});background-origin:border-box;background-clip:padding-box,border-box;border:${px(1)}px solid transparent;--frame-color:${gradientFrom};--glow-soft:color-mix(in srgb,${gradientFrom} 8%,transparent);--glow-bright:color-mix(in srgb,${gradientTo} 22%,transparent);--inner-border-color:color-mix(in srgb,${gradientTo} 50%,white);animation:gmdMagicLiquidMorph 6s ease-in-out infinite,gmdMysticGlow 4s ease-in-out infinite;`;
        else if (style === 'holo') css = `background:linear-gradient(120deg,rgba(236,72,153,.18) 0%,rgba(56,189,248,.18) 40%,rgba(168,85,247,.18) 70%,rgba(236,72,153,.18) 100%);background-size:250% 100%;animation:gmdTextHoloShift 5s ease infinite;backdrop-filter:blur(${px(6)}px);-webkit-backdrop-filter:blur(${px(6)}px);border:${px(1)}px solid rgba(255,255,255,.12);box-shadow:0 ${px(4)}px ${px(12)}px rgba(0,0,0,.25);`;
        else if (style === 'light-sweep' || style === 'dark-matte') css = `background:linear-gradient(110deg,rgba(15,23,42,.85) 30%,rgba(255,255,255,.28) 50%,rgba(15,23,42,.85) 70%);background-size:200% 100%;animation:gmdTextLightSweep 3s linear infinite;border:${px(1)}px solid rgba(255,255,255,.1);box-shadow:0 ${px(4)}px ${px(12)}px rgba(0,0,0,.3);`;
        else css = `background:${item.textBgColor || '#000000'};box-shadow:0 ${px(2)}px ${px(6)}px rgba(0,0,0,.25);`;
        return `${css}padding:${px(3)}px ${px(8)}px;border-radius:${px(6)}px;`;
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
        const iconMedia = item.iconDisplayMode === 'text'
            ? `<span class="gmd-text-gift-icon" style="color:${item.iconTextColor || '#ffffff'};font-size:${font(ctx, item.iconTextSize, 20)}px;">${text(ctx, item.iconText || item.name)}</span>`
            : (isVideoAsset(iconUrl)
                ? `<video src="${iconUrl}" autoplay loop muted playsinline></video>`
                : `<img src="${iconUrl}" alt="${name}">`);
        const labelBackground = giftLabelBackground(item, ctx);
        const subtext = text(ctx, item.subtext || '');

        return `
            <div class="gmd-visual ${motionClass} ${auraClass}"
                style="--aura-color:${item.auraColor || '#d7b2ff'};--aura-radius:${shape.radius};--aura-clip:${shape.clip};--anim-speed:${animSpeed}s;--aura-speed:${auraSpeed}s;--aura-scale:${auraScale};--icon-url:url('${iconUrl}');">
                <span class="gmd-aura gmd-aura-back ${auraClass}"></span>
                <span class="gmd-icon-wrap" style="--icon-url:url('${iconUrl}')">
                    ${iconMedia}
                </span>
                <span class="gmd-aura gmd-aura-front ${auraClass}"></span>
            </div>
            ${item.showName ? `<div class="gmd-item-label gmd-gift-label-text-wrap pos-${item.textPosition || 'bottom'}" style="font-size:${textSize}px;color:${item.textColor || '#f7cb64'};--label-gap:${textGap}px;text-align:${item.textAlign || 'center'};${labelBackground}"><div style="font-weight:800;line-height:1.15;white-space:nowrap;">${name}</div>${subtext ? `<div style="font-size:${Math.max(5, Math.round(textSize * .78))}px;opacity:.8;font-weight:600;line-height:1.15;white-space:nowrap;margin-top:${roundPx(2, ctx.scale)}px;">${subtext}</div>` : ''}</div>` : ''}
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
        let ctx = createContext(options);
        const isPk = item.barStyle === 'pk';
        
        if (isPk) {
            const w = Number(item.w || item.width || 900);
            const h = Number(item.h || item.height || 180);
            const localScale = w / 900;
            ctx = { ...ctx, scale: ctx.scale * localScale };

            const players = Array.isArray(item.pkPlayers) && item.pkPlayers.length >= 2
                ? item.pkPlayers
                : [
                    { name: 'ĐỘI ĐỎ', score: Number(item.currentCount || 120), color: '#ef4444', giftId: item.giftId || 'rose', giftName: 'Rose', iconMode: 'preset', iconPreset: 'lion' },
                    { name: 'ĐỘI XANH', score: Number(item.targetCount || 80), color: '#3b82f6', giftId: item.blueGiftId || 'coffee', giftName: 'Coffee', iconMode: 'preset', iconPreset: 'wolf' }
                ];
            
            const totalScore = players.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
            
            // Find leading score
            let maxScore = -1;
            players.forEach(p => {
                const s = Number(p.score) || 0;
                if (s > maxScore) maxScore = s;
            });
            const hasLeader = totalScore > 0;

            const nameSize = font(ctx, item.fontSize, 30);
            const scoreSize = font(ctx, item.scoreFontSize, 36);
            const timerSize = font(ctx, item.timerFontSize, 24);
            const titleSize = nameSize;
            const subSize = font(ctx, item.subtitleFontSize, 24);
            
            const radius = length(ctx, item.borderRadius, 16);
            
            const hideHeaders = w < 420 || h < 120;
            const hideSubtitle = h < 90 || !item.subtitleText;
            
            const style = item.presetStyle || 'esport';

            // Generate player avatar helper
            const renderPlayerAvatar = (p, isLeading, idx) => {
                const avatarSize = players.length === 2 
                    ? roundPx(56, ctx.scale) 
                    : roundPx(42, ctx.scale);
                
                const auraMap = { Glow: 'aura-glow', Bubble: 'aura-bubble', 'Magic Ring': 'aura-ring', 'Neon Frame': 'aura-frame', 'Light Sweep': 'aura-sweep', 'Fire Aura': 'aura-fire', 'Electric Aura': 'aura-electric' };
                
                const auraClass = auraMap[p.auraType] || '';
                
                const shapeMap = {
                    Square: { radius: '14%', clip: 'none' },
                    Hexagon: { radius: '0', clip: 'polygon(25% 6%, 75% 6%, 96% 50%, 75% 94%, 25% 94%, 4% 50%)' },
                    Star: { radius: '0', clip: 'polygon(50% 0%, 62% 35%, 98% 35%, 69% 57%, 79% 91%, 50% 70%, 21% 91%, 31% 57%, 2% 35%, 38% 35%)' },
                    Oval: { radius: '50% / 38%', clip: 'none' },
                    Circle: { radius: '50%', clip: 'none' }
                };
                const shape = shapeMap[p.auraShape] || shapeMap.Circle;
                
                const auraSpeed = Math.max(0.2, Number(p.auraSpeed) || 1);
                const auraScale = Number(p.auraScale || 1);
                const auraColor = p.auraColor || p.color || '#d7b2ff';

                let innerContent = '';
                
                if (p.iconMode === 'upload' && p.customIconUrl) {
                    const isVideo = isVideoAsset(p.customIconUrl);
                    const fullIconUrl = p.customIconUrl.startsWith('http') || p.customIconUrl.startsWith('data:')
                        ? p.customIconUrl
                        : `${ctx.apiBase || ''}${p.customIconUrl.startsWith('/') ? '' : '/'}${p.customIconUrl}`;
                    innerContent = isVideo
                        ? `<video src="${fullIconUrl}" autoplay loop muted playsinline style="width: 100%; height: 100%; border-radius: inherit; object-fit: cover;"></video>`
                        : `<img src="${fullIconUrl}" style="width: 100%; height: 100%; border-radius: inherit; object-fit: cover;">`;
                } else if (p.iconMode === 'gift') {
                    const giftIcon = giftIconFromLibrary(p, ctx.gifts, ctx.apiBase) || '';
                    if (giftIcon) {
                        innerContent = isVideoAsset(giftIcon)
                            ? `<video src="${giftIcon}" autoplay loop muted playsinline style="width: 100%; height: 100%; border-radius: inherit; object-fit: contain;"></video>`
                            : `<img src="${giftIcon}" style="width: 100%; height: 100%; border-radius: inherit; object-fit: contain;">`;
                    } else {
                        innerContent = `<div style="width: 100%; height: 100%; border-radius: inherit; background: #111; display: flex; align-items: center; justify-content: center; font-size: ${roundPx(16, ctx.scale)}px;">🎁</div>`;
                    }
                } else {
                    // Preset shields
                    const preset = p.iconPreset || 'lion';
                    let presetIconHTML = '';
                    
                    if (style === 'fire_vs_ice' && players.length === 2) {
                        if (idx === 0) {
                            presetIconHTML = `<i class="fas fa-fire" style="color: #ff781f; font-size: ${roundPx(24, ctx.scale)}px; filter: drop-shadow(0 0 6px #ef4444);"></i>`;
                        } else {
                            presetIconHTML = `<i class="fas fa-snowflake" style="color: #00e5ff; font-size: ${roundPx(24, ctx.scale)}px; filter: drop-shadow(0 0 6px #3b82f6);"></i>`;
                        }
                    } else {
                        const presetMap = {
                            lion: { bg: '#eab308', fa: 'fa-shield-cat' },
                            wolf: { bg: '#3b82f6', fa: 'fa-dog' },
                            crown: { bg: '#a855f7', fa: 'fa-crown' },
                            star: { bg: '#ef4444', fa: 'fa-star' }
                        };
                        const cfg = presetMap[preset] || presetMap.lion;
                        presetIconHTML = `<i class="fas ${cfg.fa}" style="color: #ffffff; font-size: ${players.length === 2 ? roundPx(22, ctx.scale) : roundPx(16, ctx.scale)}px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></i>`;
                    }
                    
                    const bgGlow = (style === 'fire_vs_ice' && players.length === 2) ? (idx === 0 ? '#ef4444' : '#3b82f6') : p.color;
                    
                    innerContent = `
                        <div style="width: 100%; height: 100%; border-radius: inherit; background: linear-gradient(135deg, ${bgGlow} 0%, #111 100%); border: 2px solid ${bgGlow}; display: flex; align-items: center; justify-content: center; position: relative;">
                            ${presetIconHTML}
                        </div>
                    `;
                }

                const finalStyleString = `style="width: 100%; height: 100%; border-radius: inherit; display: flex; align-items: center; justify-content: center; overflow: visible; --aura-speed:${auraSpeed}s; --aura-scale:${auraScale}; --aura-color:${auraColor}; --aura-radius:${shape.radius}; --aura-clip:${shape.clip};"`;

                let borderHtml = '';
                let iconWrapStyle = `width: 100%; height: 100%; border-radius: inherit; overflow: hidden; display: flex; align-items: center; justify-content: center;`;

                if (p.avatarBorder) {
                    const borderUrl = p.avatarBorder.startsWith('http') || p.avatarBorder.startsWith('/') || p.avatarBorder.startsWith('data:') ? p.avatarBorder : `${ctx.apiBase || ''}/assets/goal/${p.avatarBorder}.png`;
                    borderHtml = `<img src="${borderUrl}" style="position: absolute; top: -10%; left: -10%; width: 120%; height: 120%; z-index: 6; pointer-events: none; object-fit: contain;">`;
                    iconWrapStyle = `width: 80%; height: 80%; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; position: absolute; top: 10%; left: 10%; z-index: 2;`;
                }

                return `
                    <div style="width: ${avatarSize}px; height: ${avatarSize}px; position: relative; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <div class="gmd-visual ${auraClass}" ${finalStyleString}>
                            <span class="gmd-aura gmd-aura-back ${auraClass}"></span>
                            <span class="${p.avatarBorder ? '' : 'gmd-icon-wrap'}" style="${iconWrapStyle}">
                                ${innerContent}
                            </span>
                            <span class="gmd-aura gmd-aura-front ${auraClass}"></span>
                            ${borderHtml}
                        </div>
                    </div>
                `;
            };

            // Color selection modes
            const nameColorOf = (p, defaultVal = '#ffffff') => item.pkNameColorMode === 'team' ? p.color : defaultVal;
            const scoreColorOf = (p, defaultVal = '#ffffff') => item.pkScoreColorMode === 'team' ? p.color : defaultVal;

            // Build the player headers row if not hidden
            let headersHTML = '';
            if (!hideHeaders) {
                if (players.length === 2) {
                    const p1 = players[0];
                    const p2 = players[1];
                    const p1Leading = hasLeader && (Number(p1.score) || 0) === maxScore;
                    const p2Leading = hasLeader && (Number(p2.score) || 0) === maxScore;
                    
                    const gift1 = giftIconFromLibrary(p1, ctx.gifts, ctx.apiBase) || '';
                    const gift1Media = gift1 ? `<img src="${gift1}" style="width: ${roundPx(24, ctx.scale)}px; height: ${roundPx(24, ctx.scale)}px; object-fit: contain; vertical-align: middle;">` : '';
                    const gift2 = giftIconFromLibrary(p2, ctx.gifts, ctx.apiBase) || '';
                    const gift2Media = gift2 ? `<img src="${gift2}" style="width: ${roundPx(24, ctx.scale)}px; height: ${roundPx(24, ctx.scale)}px; object-fit: contain; vertical-align: middle;">` : '';

                    // Resolve sizes & offsets for Player 1 (Red/Left)
                    const p1NameSize = font(ctx, p1.fontSize || item.fontSize, 30);
                    const p1ScoreSize = font(ctx, p1.scoreFontSize || item.scoreFontSize, 36);
                    const p1OffsetX = p1.headerOffsetX !== undefined ? Number(p1.headerOffsetX) : Number(item.headerOffsetX || 0);
                    const p1OffsetY = p1.headerOffsetY !== undefined ? Number(p1.headerOffsetY) : Number(item.headerOffsetY || 0);

                    // Resolve sizes & offsets for Player 2 (Blue/Right)
                    const p2NameSize = font(ctx, p2.fontSize || item.fontSize, 30);
                    const p2ScoreSize = font(ctx, p2.scoreFontSize || item.scoreFontSize, 36);
                    const p2OffsetX = p2.headerOffsetX !== undefined ? Number(p2.headerOffsetX) : -Number(item.headerOffsetX || 0);
                    const p2OffsetY = p2.headerOffsetY !== undefined ? Number(p2.headerOffsetY) : Number(item.headerOffsetY || 0);

                    const vsOffsetY = (p1OffsetY + p2OffsetY) / 2;
                    const motionMap = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
                    const p1MotionClass = p1Leading ? (motionMap[item.animationType] || '') : '';
                    const p1AnimSpeed = Math.max(0.2, Number(item.animationSpeed) || 1);
                    const p2MotionClass = p2Leading ? (motionMap[item.animationType] || '') : '';
                    const p2AnimSpeed = Math.max(0.2, Number(item.animationSpeed) || 1);
                    
                    const p1Scale = hasLeader ? (p1Leading ? 1.05 : 0.95) : 1;
                    const p2Scale = hasLeader ? (p2Leading ? 1.05 : 0.95) : 1;
                    const p1ZIndex = p1Leading ? 10 : 1;
                    const p2ZIndex = p2Leading ? 10 : 1;

                    headersHTML = `
                        <!-- Đội Đỏ (Trái) -->
                        <div style="display: flex; flex: 1; min-width: 0; justify-content: flex-start; transform: translate(${roundPx(p1OffsetX, ctx.scale)}px, ${roundPx(p1OffsetY, ctx.scale)}px) scale(${p1Scale}); transition: transform 0.2s ease, all 0.3s ease; z-index: ${p1ZIndex};">
                            <div class="${p1MotionClass}" style="display: flex; align-items: center; gap: ${roundPx(14, ctx.scale)}px; width: 100%; --anim-speed: ${p1AnimSpeed}s;">
                                ${renderPlayerAvatar(p1, p1Leading, 0)}
                                <div style="display: flex; flex-direction: column; min-width: 0; justify-content: center; gap: ${roundPx(2, ctx.scale)}px;">
                                    <div style="font-weight: 800; font-size: ${p1NameSize}px; color: ${nameColorOf(p1)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1;">
                                         ${text(ctx, p1.name)}
                                    </div>
                                    <div style="display: flex; align-items: center; gap: ${roundPx(8, ctx.scale)}px; font-weight: 900; font-size: ${p1ScoreSize}px; color: ${scoreColorOf(p1)}; line-height: 1.1; margin-top: ${roundPx(2, ctx.scale)}px;">
                                         <span class="gmd-pk-score-text" data-player-index="0">${Number(p1.score || 0).toLocaleString('vi-VN')}</span>
                                         ${gift1Media ? `<span style="display: inline-flex; align-items: center; padding: ${roundPx(3, ctx.scale)}px; background: rgba(255,255,255,0.06); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));">${gift1Media}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
 
                        <!-- Chữ đối kháng -->
                        ${item.showVs !== false ? `<div class="gmd-pk-vs-text" style="font-size: ${font(ctx, Math.round(p1NameSize * 1.3), 38)}px; font-weight: 950; color: #ffffff; text-shadow: 0 0 ${roundPx(12, ctx.scale)}px rgba(255,255,255,0.45); padding: 0 ${roundPx(16, ctx.scale)}px; display: flex; align-items: center; justify-content: center; font-style: italic; transform: translateY(${roundPx(vsOffsetY, ctx.scale)}px); transition: transform 0.2s ease;">
                            ${text(ctx, item.vsText || 'VS')}
                        </div>` : ''}
 
                        <!-- Đội Xanh (Phải) -->
                        <div style="display: flex; flex: 1; min-width: 0; justify-content: flex-end; text-align: right; transform: translate(${roundPx(p2OffsetX, ctx.scale)}px, ${roundPx(p2OffsetY, ctx.scale)}px) scale(${p2Scale}); transition: transform 0.2s ease, all 0.3s ease; z-index: ${p2ZIndex};">
                            <div class="${p2MotionClass}" style="display: flex; align-items: center; gap: ${roundPx(14, ctx.scale)}px; width: 100%; justify-content: flex-end; text-align: right; --anim-speed: ${p2AnimSpeed}s;">
                                <div style="display: flex; flex-direction: column; min-width: 0; align-items: flex-end; justify-content: center; gap: ${roundPx(2, ctx.scale)}px;">
                                    <div style="font-weight: 800; font-size: ${p2NameSize}px; color: ${nameColorOf(p2)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; text-align: right; width: 100%;">
                                         ${text(ctx, p2.name)}
                                    </div>
                                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: ${roundPx(8, ctx.scale)}px; font-weight: 900; font-size: ${p2ScoreSize}px; color: ${scoreColorOf(p2)}; line-height: 1.1; margin-top: ${roundPx(2, ctx.scale)}px; width: 100%;">
                                         ${gift2Media ? `<span style="display: inline-flex; align-items: center; padding: ${roundPx(3, ctx.scale)}px; background: rgba(255,255,255,0.06); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));">${gift2Media}</span>` : ''}
                                         <span class="gmd-pk-score-text" data-player-index="1">${Number(p2.score || 0).toLocaleString('vi-VN')}</span>
                                    </div>
                                </div>
                                ${renderPlayerAvatar(p2, p2Leading, 1)}
                            </div>
                        </div>
                    `;
                } else {
                    headersHTML = players.map((p, idx) => {
                        const isLeading = hasLeader && (Number(p.score) || 0) === maxScore;
                        const giftIcon = giftIconFromLibrary(p, ctx.gifts, ctx.apiBase) || '';
                        const giftMedia = giftIcon 
                            ? `<img src="${giftIcon}" style="width: ${roundPx(24, ctx.scale)}px; height: ${roundPx(24, ctx.scale)}px; object-fit: contain; vertical-align: middle;">`
                            : '';
                        
                        const pNameSize = font(ctx, p.fontSize || (item.fontSize ? Math.round(item.fontSize * 0.65) : 18), 18);
                        const pScoreSize = font(ctx, p.scoreFontSize || (item.scoreFontSize ? Math.round(item.scoreFontSize * 0.65) : 22), 22);
                        
                        const pOffsetX = p.headerOffsetX !== undefined 
                            ? Number(p.headerOffsetX) 
                            : (players.length === 2 
                                ? (idx === 0 ? Number(item.headerOffsetX || 0) : -Number(item.headerOffsetX || 0))
                                : Number(item.headerOffsetX || 0)
                              );
                        const pOffsetY = p.headerOffsetY !== undefined ? Number(p.headerOffsetY) : Number(item.headerOffsetY || 0);
                        const cardBg = isLeading 
                            ? `linear-gradient(110deg, color-mix(in srgb, ${p.color || '#ffffff'} 12%, rgba(15, 23, 42, 0.45)) 30%, rgba(255, 255, 255, 0.3) 50%, color-mix(in srgb, ${p.color || '#ffffff'} 12%, rgba(15, 23, 42, 0.45)) 70%)` 
                            : `linear-gradient(180deg, color-mix(in srgb, ${p.color || '#ffffff'} 8%, rgba(15, 23, 42, 0.45)), rgba(15, 23, 42, 0.45))`;
                        const cardBorder = isLeading ? `3px solid ${p.color || '#fbbf24'}` : `1.5px solid color-mix(in srgb, ${p.color || '#ffffff'} 35%, rgba(255,255,255,0.06))`;
                        const cardShadow = isLeading ? `0 0 ${roundPx(14, ctx.scale)}px color-mix(in srgb, ${p.color || '#fbbf24'} 40%, transparent)` : `0 0 ${roundPx(8, ctx.scale)}px color-mix(in srgb, ${p.color || '#ffffff'} 12%, transparent)`;
                        const borderSweepStyle = isLeading 
                            ? `background-size: 200% 100%; animation: gmdGoldSweep 3.5s linear infinite, gmdLeadingPulse 2s ease-in-out infinite;`
                            : '';
 
                        const motionMap = { Pulse: 'anim-pulse', Bounce: 'anim-bounce', Float: 'anim-float', Zoom: 'anim-zoom', Shake: 'anim-shake' };
                        const motionClass = isLeading ? (motionMap[item.animationType] || '') : '';
                        const animSpeed = Math.max(0.2, Number(item.animationSpeed) || 1);
                        
                        const cardScale = hasLeader ? (isLeading ? 1.05 : 0.95) : 1;
                        const cardZIndex = isLeading ? 10 : 1;
 
                        return `
                            <div style="display: flex; flex: 1; min-width: 0; transform: translate(${roundPx(pOffsetX, ctx.scale)}px, ${roundPx(pOffsetY, ctx.scale)}px) scale(${cardScale}); transition: all 0.3s ease; z-index: ${cardZIndex}; overflow: visible; box-sizing: border-box !important;">
                                <div class="${motionClass}" style="position: relative; display: flex; align-items: center; gap: ${roundPx(8, ctx.scale)}px; flex: 1; min-width: 0; padding: ${isLeading ? `${roundPx(8, ctx.scale)}px ${roundPx(14, ctx.scale)}px` : `${roundPx(6, ctx.scale)}px ${roundPx(12, ctx.scale)}px`}; border-radius: 12px; box-shadow: ${cardShadow}; --anim-speed: ${animSpeed}s; overflow: visible; border: ${isLeading ? 'none' : cardBorder}; --glow-color: ${p.color || '#fbbf24'}; width: 100%; box-sizing: border-box !important;">
                                    
                                    ${isLeading ? `
                                    <!-- Leading Team Gold Sweep Background (No overflow clipping of avatar border) -->
                                    <div style="position: absolute; inset: 0; border-radius: 12px; overflow: hidden; pointer-events: none; z-index: 0; border: ${cardBorder}; box-sizing: border-box !important;">
                                        <div style="position: absolute; inset: 0; background: ${cardBg}; z-index: 0;"></div>
                                        <div style="position: absolute; inset: -50%; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%); background-size: 200% 100%; animation: gmdGoldSweep 3.5s linear infinite; z-index: 1;"></div>
                                    </div>
                                    ` : `
                                    <!-- Normal Background -->
                                    <div style="position: absolute; inset: 0; border-radius: 12px; background: ${cardBg}; z-index: 0; pointer-events: none; box-sizing: border-box !important;"></div>
                                    `}
                                    
                                    <!-- Content layer positioned relatively above the backgrounds -->
                                    <div style="position: relative; z-index: 2; display: flex; align-items: center; gap: ${roundPx(8, ctx.scale)}px; width: 100%; overflow: visible; box-sizing: border-box !important;">
                                        ${renderPlayerAvatar(p, isLeading, idx)}
                                        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden;">
                                            <div style="font-weight: 800; font-size: ${pNameSize}px; color: ${nameColorOf(p, p.color)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; display: block; line-height: 1.1;">
                                                ${text(ctx, p.name)}
                                            </div>
                                            <div style="display: flex; align-items: center; gap: ${roundPx(6, ctx.scale)}px; font-weight: 900; font-size: ${pScoreSize}px; color: ${scoreColorOf(p)}; line-height: 1.1; margin-top: 4px; overflow: hidden; max-width: 100%;">
                                                <span class="gmd-pk-score-text" data-player-index="${idx}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">${Number(p.score || 0).toLocaleString('vi-VN')}</span>
                                                ${giftMedia ? `<span style="display: inline-flex; align-items: center; padding: ${roundPx(2, ctx.scale)}px; background: rgba(255,255,255,0.06); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25)); flex-shrink: 0;">${giftMedia}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Build progress bar segments HTML
            let accumPct = 0;
            const segmentsHTML = players.map((p, idx) => {
                const score = Number(p.score) || 0;
                const pPct = totalScore > 0 ? (score / totalScore) * 100 : 100 / players.length;
                
                let widthVal = Math.round(pPct);
                if (idx === players.length - 1) {
                    widthVal = 100 - accumPct;
                } else {
                    accumPct += widthVal;
                }
                if (widthVal <= 0) return '';

                // Color gradients based on preset style
                let barBg = `linear-gradient(180deg, ${p.color}, ${p.color}cc)`;
                if (style === 'fire_vs_ice' && players.length === 2) {
                    if (idx === 0) {
                        barBg = 'linear-gradient(90deg, #f97316 0%, #ef4444 100%)';
                    } else {
                        barBg = 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)';
                    }
                } else if (style === 'royal') {
                    barBg = `linear-gradient(180deg, ${p.color} 0%, ${p.color}aa 50%, ${p.color} 100%)`;
                } else if (style === 'minimal') {
                    barBg = p.color;
                }

                // Apply skew transform to division lines for Esport style
                const segmentSkew = (style === 'esport' || style === 'fire_vs_ice' || style === 'royal') ? 'transform: skewX(-15deg);' : '';
                const unskewText = (style === 'esport' || style === 'fire_vs_ice' || style === 'royal') ? 'transform: skewX(15deg);' : '';

                // Align percentage text based on team index
                let alignStyle = `justify-content: center;`;
                if (players.length === 2) {
                    alignStyle = idx === 0 
                        ? `justify-content: flex-start; padding-left: ${roundPx(14, ctx.scale)}px;`
                        : `justify-content: flex-end; padding-right: ${roundPx(14, ctx.scale)}px;`;
                }

                // Only show percentage text if segment is wide enough to prevent visual clutter
                const percentText = widthVal >= 8 
                    ? `<div style="position: relative; z-index: 2; display: flex; align-items: center; width: 100%; height: 100%; box-sizing: border-box; font-weight: 900; font-size: ${timerSize}px; color: #ffffff; text-shadow: 0 1px 3px rgba(0,0,0,0.6); ${alignStyle} ${unskewText}"><span class="gmd-pk-segment-percent-text" data-player-index="${idx}">${pPct.toFixed(1)}%</span></div>`
                    : '';

                // Divider glow decoration
                const dividerHTML = ((item.pkBarAnimation === 'divider-glow' || item.pkBarAnimation === 'glass-divider' || item.pkBarAnimation === 'electric-glass-divider' || item.pkBarAnimation === 'lightning-glass-divider') && idx < players.length - 1)
                    ? `<div style="position: absolute; right: 0; top: 0; bottom: 0; width: ${roundPx(3, ctx.scale)}px; background: #ffffff; box-shadow: 0 0 ${roundPx(8, ctx.scale)}px #ffffff, 0 0 ${roundPx(15, ctx.scale)}px ${p.color || '#ffffff'}; z-index: 3; pointer-events: none; animation: gmdDividerGlowPulse 1.5s ease-in-out infinite; --glow-color: ${p.color || '#ffffff'};"></div>`
                    : '';

                // Stripes overlay
                const stripesHTML = (item.pkBarAnimation === 'stripes')
                    ? `<div style="position: absolute; inset: 0; background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent); background-size: 20px 20px; animation: gmdBarStripesMove 1.5s linear infinite; pointer-events: none; z-index: 1; opacity: 0.85;"></div>`
                    : '';

                // Electric overlay (removed from internal segments, now rendered as a border)
                const electricHTML = '';

                return `
                    <div class="gmd-pk-segment" data-player-index="${idx}" style="width: ${widthVal}%; background: ${barBg}; height: 100%; display: flex; align-items: center; position: relative; box-shadow: inset 0 2px 4px rgba(255,255,255,0.15); transition: width 0.3s ease; ${segmentSkew}">
                        ${stripesHTML}
                        ${electricHTML}
                        ${percentText}
                        ${dividerHTML}
                    </div>
                `;
            }).join('');

            // Gold target coins badge (removed)
            const targetBadgeHTML = '';

            // Clock countdown timer pill
            let timerHTML = '';
            if (item.showTimer) {
                let displayTime = item.timerDuration || '00:20:00';
                if (item.timerRunning && item.timerStartedAt) {
                    const elapsed = Math.floor((Date.now() - item.timerStartedAt) / 1000);
                    const duration = item.timerDurationSeconds || 1200;
                    let remain = duration - elapsed;
                    if (remain < 0) remain = 0;
                    
                    const h = Math.floor(remain / 3600);
                    const m = Math.floor((remain % 3600) / 60);
                    const s = remain % 60;
                    displayTime = [
                        String(h).padStart(2, '0'),
                        String(m).padStart(2, '0'),
                        String(s).padStart(2, '0')
                    ].join(':');
                } else if (item.timerRemainingSeconds !== undefined) {
                    const remain = item.timerRemainingSeconds;
                    const h = Math.floor(remain / 3600);
                    const m = Math.floor((remain % 3600) / 60);
                    const s = remain % 60;
                    displayTime = [
                        String(h).padStart(2, '0'),
                        String(m).padStart(2, '0'),
                        String(s).padStart(2, '0')
                    ].join(':');
                }

                timerHTML = `<div class="gmd-pk-timer-pill" style="position: absolute; top: ${roundPx(-2, ctx.scale)}px; left: 50%; transform: translateX(-50%); background: rgba(5, 7, 15, 0.85); border: 1.5px solid #a855f7; color: #ffffff; font-size: ${timerSize}px; font-weight: 800; padding: ${roundPx(3, ctx.scale)}px ${roundPx(12, ctx.scale)}px; border-radius: ${roundPx(20, ctx.scale)}px; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 ${roundPx(10, ctx.scale)}px #a855f750; z-index: 10;">
                    <i class="fas fa-clock" style="color: #c084fc; animation: gmdClockSpin 4s linear infinite;"></i>
                    <span class="gmd-pk-timer-text" data-timer-id="${item.id}" data-running="${item.timerRunning === true}" data-started-at="${item.timerStartedAt || 0}" data-duration-secs="${item.timerDurationSeconds || 1200}" data-remaining="${item.timerRemainingSeconds ?? item.timerDurationSeconds ?? 1200}" style="font-family: monospace; letter-spacing: 0.5px;">${displayTime}</span>
                </div>`;
            }

            // Outer wrapper breathing aura (disabled)
            let outerAuraStyle = '';

            // Preset overlay panels (metallic reflect for royal, hex patterns for esport, glass glow for neon)
            let presetClass = `preset-${style}`;
            let innerBevelOverlay = '';
            if (style === 'royal') {
                innerBevelOverlay = `<div style="position: absolute; top: 0; left: 0; right: 0; height: 50%; background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%); pointer-events: none; z-index: 2;"></div>`;
            }

            // Glass Sweep Overlay
            let glassSweepHTML = '';
            if (item.pkBarAnimation === 'glass-sweep' || item.pkBarAnimation === 'glass-divider' || item.pkBarAnimation === 'electric-glass-divider' || item.pkBarAnimation === 'lightning-glass-divider') {
                glassSweepHTML = `
                    <div style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 5; border-radius: ${radius}px;">
                        <div style="position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.28) 50%, transparent 100%); animation: gmdBarGlassSweep 3.5s ease-in-out infinite; transform: skewX(-15deg);"></div>
                    </div>
                `;
            }

            // Electric Border Overlay Sibling
            let electricBorderHTML = '';
            const isCirculating = item.pkBarAnimation === 'electric' || item.pkBarAnimation === 'electric-glass-divider';
            const isLightning = item.pkBarAnimation === 'electric-arc' || item.pkBarAnimation === 'lightning-glass-divider';
            
            if (isCirculating || isLightning) {
                // Find team/player colors dynamically or custom
                const teamColor1 = item.useCustomPkBorderColor
                    ? (item.pkBorderColor1 || '#ff003c')
                    : ((players[0] && players[0].color) || '#ff003c');
                const teamColor2 = item.useCustomPkBorderColor
                    ? (item.pkBorderColor2 || '#00f0ff')
                    : ((players[1] && players[1].color) || '#00f0ff');

                // Find leader color
                let leaderColor = '#00d2ff';
                if (item.useCustomPkBorderColor) {
                    leaderColor = item.pkBorderColor1 || '#00d2ff';
                } else if (hasLeader) {
                    const leaders = players.filter(p => (Number(p.score) || 0) === maxScore);
                    if (leaders.length === 1) {
                        leaderColor = leaders[0].color || '#00d2ff';
                    } else {
                        leaderColor = '#a855f7';
                    }
                }
                
                if (isCirculating) {
                    electricBorderHTML = `
                        <svg style="position: absolute; inset: ${roundPx(-2.5, ctx.scale)}px; width: calc(100% + ${roundPx(5, ctx.scale)}px); height: calc(100% + ${roundPx(5, ctx.scale)}px); pointer-events: none; z-index: 6; overflow: visible; --glow-color: ${leaderColor};">
                            <!-- Glow Path (circulating, thickness pulsing) -->
                            <rect style="animation: gmdElectricCirculate 4s linear infinite, gmdElectricWidthPulse 0.22s ease-in-out infinite; stroke-dasharray: ${roundPx(120, ctx.scale)} ${roundPx(240, ctx.scale)};" 
                                  x="${roundPx(1.25, ctx.scale)}" y="${roundPx(1.25, ctx.scale)}" 
                                  width="100%" height="100%" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="${leaderColor}" stroke-width="${roundPx(3, ctx.scale)}" />
                            <!-- White Core Path (circulating) -->
                            <rect style="animation: gmdElectricCirculate 4s linear infinite; stroke-dasharray: ${roundPx(120, ctx.scale)} ${roundPx(240, ctx.scale)};" 
                                  x="${roundPx(1.25, ctx.scale)}" y="${roundPx(1.25, ctx.scale)}" 
                                  width="100%" height="100%" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="#ffffff" stroke-width="${roundPx(1.2, ctx.scale)}" />
                        </svg>
                    `;
                } else if (isLightning) {
                    const padding = 14;
                    const filterId = `gmdLightningFilter_${String(item.id || 'pk').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                    electricBorderHTML = `
                        <svg style="position: absolute; inset: ${roundPx(-padding, ctx.scale)}px; width: calc(100% + ${roundPx(padding * 2, ctx.scale)}px); height: calc(100% + ${roundPx(padding * 2, ctx.scale)}px); pointer-events: none; z-index: 6; overflow: visible;">
                            <style>
                                @keyframes gmdElectricCirculate-${item.id || 'pk'} {
                                    0% { stroke-dashoffset: 1000; }
                                    100% { stroke-dashoffset: 0; }
                                }
                                @keyframes gmdLightningWidthPulse {
                                    0%, 100% { 
                                        stroke-width: ${roundPx(3.5, ctx.scale)}px; 
                                        opacity: 0.75; 
                                    }
                                    50% { 
                                        stroke-width: ${roundPx(5.5, ctx.scale)}px; 
                                        opacity: 1; 
                                    }
                                }
                                @keyframes gmdLightningWidthPulseThinner {
                                    0%, 100% { 
                                        stroke-width: ${roundPx(2.2, ctx.scale)}px; 
                                        opacity: 0.7; 
                                    }
                                    50% { 
                                        stroke-width: ${roundPx(3.8, ctx.scale)}px; 
                                        opacity: 0.95; 
                                    }
                                }
                            </style>
                            <defs>
                                <linearGradient id="${filterId}_grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="${teamColor1}" />
                                    <stop offset="50%" stop-color="${teamColor2}" />
                                    <stop offset="100%" stop-color="${teamColor1}" />
                                </linearGradient>
                                <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" seed="1" />
                                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${12 * ctx.scale}" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                                    <feDropShadow in="displaced" dx="0" dy="0" stdDeviation="${4 * ctx.scale}" flood-color="${teamColor1}" flood-opacity="0.85" result="glow1" />
                                    <feDropShadow in="glow1" dx="0" dy="0" stdDeviation="${8 * ctx.scale}" flood-color="${teamColor2}" flood-opacity="0.6" />
                                </filter>
                                <filter id="${filterId}_core" x="-30%" y="-30%" width="160%" height="160%">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" seed="1" />
                                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${12 * ctx.scale}" xChannelSelector="R" yChannelSelector="G" />
                                </filter>
                            </defs>
                            
                            <!-- Arc 1 Glow Path (Thick, 5s speed, pathLength calibrated) -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 5s linear infinite, gmdLightningWidthPulse 0.22s ease-in-out infinite; stroke-dasharray: 250 750; filter: url(#${filterId});" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="url(#${filterId}_grad)" stroke-width="${roundPx(5.5, ctx.scale)}" />
                            <!-- Arc 1 White Core -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 5s linear infinite; stroke-dasharray: 250 750; filter: url(#${filterId}_core);" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="#ffffff" stroke-width="${roundPx(2.2, ctx.scale)}" />

                            <!-- Arc 2 Glow Path (Thick, 5s speed, offset 50% delay, pathLength calibrated) -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 5s linear infinite, gmdLightningWidthPulse 0.22s ease-in-out infinite; animation-delay: -2.5s; stroke-dasharray: 250 750; filter: url(#${filterId});" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="url(#${filterId}_grad)" stroke-width="${roundPx(5.5, ctx.scale)}" />
                            <!-- Arc 2 White Core -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 5s linear infinite; animation-delay: -2.5s; stroke-dasharray: 250 750; filter: url(#${filterId}_core);" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="#ffffff" stroke-width="${roundPx(2.2, ctx.scale)}" />

                            <!-- Arc 3 Glow Path (Layered/Overlapping on top, thinner, 3.5s speed, pathLength calibrated) -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 3.5s linear infinite, gmdLightningWidthPulseThinner 0.18s ease-in-out infinite; stroke-dasharray: 150 850; filter: url(#${filterId}); opacity: 0.85;" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="url(#${filterId}_grad)" stroke-width="${roundPx(3.2, ctx.scale)}" />
                            <!-- Arc 3 White Core -->
                            <rect style="animation: gmdElectricCirculate-${item.id || 'pk'} 3.5s linear infinite; stroke-dasharray: 150 850; filter: url(#${filterId}_core); opacity: 0.9;" 
                                  pathLength="1000"
                                  x="${roundPx(padding, ctx.scale)}" y="${roundPx(padding, ctx.scale)}" 
                                  width="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" height="calc(100% - ${roundPx(padding * 2, ctx.scale)}px)" 
                                  rx="${radius}" ry="${radius}" 
                                  fill="none" stroke="#ffffff" stroke-width="${roundPx(1.2, ctx.scale)}" />
                        </svg>
                    `;
                }
            }

            // Progress Bar Container with Sibling Electric Border Sibling
            const pbContainerHTML = `
                <!-- Progress Bar Wrapper -->
                <div class="gmd-pk-bar-wrapper" style="position: relative; width: 100%; height: ${length(ctx, item.barHeight, 32)}px;">
                    <!-- Progress Bar Container -->
                    <div class="gmd-pk-bar-container" style="height: 100%; border-radius: ${radius}px; display: flex; background: rgba(0, 0, 0, 0.5); border: 1.5px solid rgba(255, 255, 255, 0.08); overflow: hidden; position: relative; width: 100%;">
                        ${innerBevelOverlay}
                        ${segmentsHTML}
                        ${glassSweepHTML}
                    </div>
                    ${electricBorderHTML}
                </div>
            `;

            let containerBg = 'transparent';
            let containerBorder = 'none';
            let containerShadow = 'none';
            let containerBackdrop = 'none';

            if (item.hideBg === false) {
                if (item.useCustomBgGradient) {
                    const from = item.bgColorGradientFrom || '#1e1b4b';
                    const to = item.bgColorGradientTo || '#311042';
                    const angle = item.bgColorGradientAngle ?? 135;
                    containerBg = `linear-gradient(${angle}deg, ${from}, ${to})`;
                } else if (item.useCustomBg) {
                    containerBg = bg(item.bgColor);
                } else {
                    containerBg = 'radial-gradient(circle at top left, rgba(15, 23, 42, 0.95), rgba(8, 10, 16, 0.98))';
                }
                containerBorder = `1px solid rgba(255, 255, 255, 0.08)`;
                containerShadow = `0 ${roundPx(10, ctx.scale)}px ${roundPx(30, ctx.scale)}px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)`;
                containerBackdrop = `blur(${roundPx(10, ctx.scale)}px)`;
            }

            return `
                <div class="gmd-goal-bar-widget theme-pk-multi ${presetClass}" style="position: relative; border-radius: ${radius}px; background: ${containerBg} !important; border: ${containerBorder} !important; box-shadow: ${containerShadow} !important; backdrop-filter: ${containerBackdrop} !important; -webkit-backdrop-filter: ${containerBackdrop} !important; padding: ${roundPx(16, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                    
                    <style>
                    @keyframes gmdClockSpin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes gmdAuraPulseSoft {
                        0% { filter: drop-shadow(0 0 ${roundPx(3, ctx.scale)}px var(--glow-color)); transform: scale(1); }
                        50% { filter: drop-shadow(0 0 ${roundPx(8, ctx.scale)}px var(--glow-color)); transform: scale(1.02); }
                        100% { filter: drop-shadow(0 0 ${roundPx(3, ctx.scale)}px var(--glow-color)); transform: scale(1); }
                    }
                    @keyframes gmdAuraPulseNormal {
                        0% { filter: drop-shadow(0 0 ${roundPx(5, ctx.scale)}px var(--glow-color)); transform: scale(1); }
                        50% { filter: drop-shadow(0 0 ${roundPx(15, ctx.scale)}px var(--glow-color)); transform: scale(1.03); }
                        100% { filter: drop-shadow(0 0 ${roundPx(5, ctx.scale)}px var(--glow-color)); transform: scale(1); }
                    }
                    @keyframes gmdLeadingAuraEpic {
                        0% { filter: drop-shadow(0 0 ${roundPx(10, ctx.scale)}px var(--glow-color)) brightness(1); transform: scale(1); }
                        50% { filter: drop-shadow(0 0 ${roundPx(24, ctx.scale)}px var(--glow-color)) brightness(1.2); transform: scale(1.05); }
                        100% { filter: drop-shadow(0 0 ${roundPx(10, ctx.scale)}px var(--glow-color)) brightness(1); transform: scale(1); }
                    }
                    @keyframes gmdCrownFloat {
                        0% { transform: translateX(-50%) translateY(0) rotate(-4deg); }
                        50% { transform: translateX(-50%) translateY(-4px) rotate(4deg); }
                        100% { transform: translateX(-50%) translateY(0) rotate(-4deg); }
                    }
                    @keyframes gmdGoldSweep {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                    @keyframes gmdLeadingPulse {
                        0% { box-shadow: 0 0 ${roundPx(8, ctx.scale)}px color-mix(in srgb, var(--glow-color, #fbbf24) 30%, transparent); }
                        50% { box-shadow: 0 0 ${roundPx(18, ctx.scale)}px color-mix(in srgb, var(--glow-color, #fbbf24) 60%, transparent); }
                        100% { box-shadow: 0 0 ${roundPx(8, ctx.scale)}px color-mix(in srgb, var(--glow-color, #fbbf24) 30%, transparent); }
                    }
                    @keyframes gmdLeaderBorderRotate {
                        0% { transform: translate(-50%, -50%) rotate(0deg); }
                        100% { transform: translate(-50%, -50%) rotate(360deg); }
                    }
                    @keyframes gmdBarGlassSweep {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(350%); }
                    }
                    @keyframes gmdBarStripesMove {
                        0% { background-position: 0 0; }
                        100% { background-position: 40px 0; }
                    }
                    @keyframes gmdDividerGlowPulse {
                        0% { opacity: 0.55; }
                        50% { opacity: 1; }
                        100% { opacity: 0.55; }
                    }
                    @keyframes gmdElectricCirculate {
                        0% { stroke-dashoffset: 1000; }
                        100% { stroke-dashoffset: 0; }
                    }
                    @keyframes gmdElectricWidthPulse {
                        0%, 100% { 
                            stroke-width: ${roundPx(2.5, ctx.scale)}px; 
                            opacity: 0.85; 
                            filter: blur(${roundPx(0.8, ctx.scale)}px) drop-shadow(0 0 ${roundPx(3, ctx.scale)}px var(--glow-color)) drop-shadow(0 0 ${roundPx(8, ctx.scale)}px var(--glow-color)); 
                        }
                        50% { 
                            stroke-width: ${roundPx(4, ctx.scale)}px; 
                            opacity: 1; 
                            filter: blur(${roundPx(1.2, ctx.scale)}px) drop-shadow(0 0 ${roundPx(5, ctx.scale)}px var(--glow-color)) drop-shadow(0 0 ${roundPx(12, ctx.scale)}px var(--glow-color)); 
                        }
                    }
                    @keyframes gmdElectricFlicker1 {
                        0%, 100% { opacity: 0.35; transform: scaleY(0.7) translateY(-2%); }
                        20% { opacity: 0.95; transform: scaleY(1.3) translateY(3%) scaleX(-1); }
                        40% { opacity: 0.15; transform: scaleY(0.5) translateY(-5%); }
                        60% { opacity: 1; transform: scaleY(1.1) translateY(1%) scaleX(1); }
                        80% { opacity: 0.25; transform: scaleY(0.8) translateY(-4%) scaleX(-1); }
                    }
                    @keyframes gmdElectricFlicker2 {
                        0%, 100% { opacity: 0.15; transform: scaleY(1.2) translateY(3%) scaleX(-1); }
                        25% { opacity: 0.9; transform: scaleY(0.6) translateY(-4%) scaleX(1); }
                        50% { opacity: 0.25; transform: scaleY(1.4) translateY(2%) scaleX(-1); }
                        75% { opacity: 0.95; transform: scaleY(0.8) translateY(-2%) scaleX(1); }
                    }
                    .gmd-leader-running-border {
                        position: relative !important;
                        overflow: hidden !important;
                        border: none !important;
                        box-sizing: border-box !important;
                    }
                    .gmd-leader-running-border::before {
                        content: '' !important;
                        position: absolute !important;
                        top: 50% !important;
                        left: 50% !important;
                        width: 300% !important;
                        height: 300% !important;
                        transform: translate(-50%, -50%) !important;
                        background: conic-gradient(from 0deg, transparent 60%, var(--glow-color, #fbbf24) 75%, #ffffff 80%, var(--glow-color, #fbbf24) 85%, transparent 100%) !important;
                        animation: gmdLeaderBorderRotate 3s linear infinite !important;
                        z-index: 0 !important;
                        pointer-events: none !important;
                    }
                    .gmd-leader-running-border::after {
                        content: '' !important;
                        position: absolute !important;
                        inset: var(--border-width, 3px) !important;
                        background: var(--card-bg-mask, #1e293b) !important;
                        border-radius: calc(12px - var(--border-width, 3px)) !important;
                        z-index: 1 !important;
                        pointer-events: none !important;
                    }
                    .gmd-leader-running-border > * {
                        position: relative !important;
                        z-index: 2 !important;
                    }
                    .gmd-leading-avatar-aura {
                        --glow-color: #fbbf24 !important;
                        animation: gmdLeadingAuraEpic 1.5s ease-in-out infinite !important;
                    }
                    </style>
 
                    ${targetBadgeHTML}
                    ${timerHTML}
 
                    <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; gap: ${roundPx(8, ctx.scale)}px; width: 100%;">
                        
                        <!-- Player Headers -->
                        ${!hideHeaders ? `
                        <div style="display: flex; gap: ${roundPx(8, ctx.scale)}px; width: 100%; justify-content: space-between; align-items: stretch; margin-top: ${roundPx(10, ctx.scale)}px; margin-bottom: ${roundPx(2, ctx.scale)}px;">
                            ${headersHTML}
                        </div>
                        ` : ''}
 
                        ${pbContainerHTML}
 
                        <!-- Subtitle / Footer -->
                        ${!hideSubtitle ? `
                        <div class="gmd-goal-bar-subtitle" style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#9ca3af') : '#9ca3af'}; text-align: center; font-weight: 600; opacity: 0.9; line-height: 1.2;">${text(ctx, item.subtitleText)}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        }


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
        const shape = item.progressShape || 'circle';
        const effect = item.progressEffect || 'none';

        const useGrad = item.useBarGradient === true;
        const color2 = item.barColorGradientTo || '#7c3aed';

        const showPct = item.showPercentage !== false;
        const pctSize = item.pctFontSize !== undefined ? Number(item.pctFontSize) : 24;

        let strokeColor = color;
        let defsMarkup = '';
        if (useGrad) {
            strokeColor = `url(#gmd-grad-${item.id})`;
            defsMarkup = `
                <defs>
                    <linearGradient id="gmd-grad-${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${color}" />
                        <stop offset="100%" stop-color="${color2}" />
                    </linearGradient>
                </defs>
            `;
        }

        let pathMarkup = '';
        let svgRotation = 'rotate(-90deg)';

        const styleMarkup = `
            <style>
                @keyframes gmd-svg-pulse-${item.id} {
                    0%, 100% { filter: drop-shadow(0 0 ${roundPx(4, ctx.scale)}px ${color}); opacity: 0.85; }
                    50% { filter: drop-shadow(0 0 ${roundPx(14, ctx.scale)}px ${color}); opacity: 1; }
                }
                @keyframes gmd-svg-rainbow-${item.id} {
                    0% { filter: hue-rotate(0deg) drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color}); }
                    100% { filter: hue-rotate(360deg) drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color}); }
                }
                @keyframes gmd-svg-spin-${item.id} {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes gmd-svg-flicker-${item.id} {
                    0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { filter: drop-shadow(0 0 ${roundPx(8, ctx.scale)}px ${color}); opacity: 1; }
                    20%, 24%, 55% { filter: drop-shadow(0 0 ${roundPx(2, ctx.scale)}px ${color}); opacity: 0.7; }
                }
                .gmd-path-pulse-${item.id} {
                    animation: gmd-svg-pulse-${item.id} 2s ease-in-out infinite;
                }
                .gmd-path-rainbow-${item.id} {
                    animation: gmd-svg-rainbow-${item.id} 4s linear infinite;
                }
                .gmd-path-spin-${item.id} {
                    animation: gmd-svg-spin-${item.id} 6s linear infinite;
                    transform-origin: 60px 60px;
                }
                .gmd-path-flicker-${item.id} {
                    animation: gmd-svg-flicker-${item.id} 3s linear infinite;
                }
            </style>
        `;

        let shapeEffectClass = '';
        let pathStyle = `transition: stroke-dashoffset 0.3s ease;`;
        if (effect === 'pulse') {
            shapeEffectClass = `gmd-path-pulse-${item.id}`;
        } else if (effect === 'rainbow') {
            shapeEffectClass = `gmd-path-rainbow-${item.id}`;
        } else if (effect === 'spin') {
            shapeEffectClass = `gmd-path-spin-${item.id}`;
        } else if (effect === 'flicker') {
            shapeEffectClass = `gmd-path-flicker-${item.id}`;
        } else {
            pathStyle += ` filter: drop-shadow(0 0 ${roundPx(8, ctx.scale)}px ${color});`;
        }

        if (shape === 'circle') {
            const r = 50;
            const circ = 2 * Math.PI * r;
            const strokeOffset = circ - (pct / 100) * circ;
            pathMarkup = `
                ${styleMarkup}
                ${defsMarkup}
                <circle cx="60" cy="60" r="${r}" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
                <circle cx="60" cy="60" r="${r}" fill="transparent" stroke="${strokeColor}" stroke-width="8" stroke-dasharray="${circ}" stroke-dashoffset="${strokeOffset}" stroke-linecap="round" class="gmd-progress-path ${shapeEffectClass}" style="${pathStyle}" />
            `;
        } else {
            svgRotation = 'none';
            let d = '';
            if (shape === 'heart') {
                d = "M 60,30 C 60,30 48,12 28,12 C 14,12 8,24 8,42 C 8,68 60,108 60,108 C 60,108 112,68 112,42 C 112,24 106,12 92,12 C 72,12 60,30 60,30 Z";
            } else if (shape === 'square') {
                d = "M 60,10 L 110,10 L 110,110 L 10,110 L 10,10 Z";
            } else if (shape === 'hexagon') {
                d = "M 60,10 L 103.3,35 L 103.3,85 L 60,110 L 16.7,85 L 16.7,35 Z";
            } else if (shape === 'star') {
                d = "M 60,10 L 75,45 L 112,45 L 82,67 L 93,103 L 60,80 L 27,103 L 38,67 L 8,45 L 45,45 Z";
            }
            pathMarkup = `
                ${styleMarkup}
                ${defsMarkup}
                <path d="${d}" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linejoin="round" />
                <path d="${d}" fill="transparent" stroke="${strokeColor}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - pct}" class="gmd-progress-path ${shapeEffectClass}" style="${pathStyle}" />
            `;
        }

        const icon = item.centerIcon || 'heart';
        const giftIcon = icon === 'gift-icon' ? giftIconFromLibrary(item, ctx.gifts, ctx.apiBase) : '';
        const innerIcon = item.iconDisplayMode === 'text'
            ? `<span class="gmd-text-gift-icon" style="width:${roundPx(52, ctx.scale)}px;height:${roundPx(52, ctx.scale)}px;color:${item.iconTextColor || '#ffffff'};font-size:${font(ctx, item.iconTextSize, 20)}px;">${text(ctx, item.iconText || item.giftName || item.name)}</span>`
            : (giftIcon
            ? (isVideoAsset(giftIcon)
                ? `<video src="${giftIcon}" autoplay loop muted playsinline style="width: ${roundPx(44, ctx.scale)}px; height: ${roundPx(44, ctx.scale)}px; border-radius: 50%; object-fit: contain; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color});"></video>`
                : `<div style="width: ${roundPx(44, ctx.scale)}px; height: ${roundPx(44, ctx.scale)}px; border-radius: 50%; background-image: url('${giftIcon}'); background-size: contain; background-repeat: no-repeat; background-position: center; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color}); display: inline-block;"></div>`)
            : `<span style="font-size: ${roundPx(32, ctx.scale)}px; filter: drop-shadow(0 0 ${roundPx(6, ctx.scale)}px ${color});">${text(ctx, icon)}</span>`);
        return `
            <div class="gmd-goal-circle-widget" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box; background:${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : 'radial-gradient(circle at center, rgba(10,15,30,0.5) 0%, #0a0a14 100%)')}; border:${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : 'rgba(255,255,255,0.08)'}`}; border-radius: ${roundPx(24, ctx.scale)}px; padding: ${roundPx(16, ctx.scale)}px; box-shadow:${item.hideBg ? 'none' : `0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.37)`};">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display:flex; flex-direction:column; align-items:center; width:100%; position:relative;">
                    ${showPct ? `<div class="gmd-pct-text" style="font-size: ${font(ctx, pctSize, 24)}px; font-weight: 900; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; text-shadow: 0 0 ${roundPx(10, ctx.scale)}px ${color}80; margin-bottom: ${roundPx(8, ctx.scale)}px;">${pct}%</div>` : ''}
                    <div style="position: relative; width: ${roundPx(120, ctx.scale)}px; height: ${roundPx(120, ctx.scale)}px; display: flex; align-items: center; justify-content: center;">
                        <svg width="${roundPx(120, ctx.scale)}" height="${roundPx(120, ctx.scale)}" viewBox="0 0 120 120" style="transform: ${svgRotation};">
                            ${pathMarkup}
                        </svg>
                        <div style="position: absolute; display: flex; align-items: center; justify-content: center;">${innerIcon}</div>
                    </div>
                    <div style="font-size: ${font(ctx, item.fontSize, 24)}px; font-weight: 800; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; margin-top: ${roundPx(12, ctx.scale)}px; text-align: center; line-height: 1.2;">${text(ctx, item.name || item.giftName || 'Goal')}</div>
                    <div class="gmd-count-text" style="font-size: ${font(ctx, item.numberFontSize, 16)}px; font-weight: 800; color: ${color}; text-shadow: 0 0 ${roundPx(8, ctx.scale)}px ${color}60; margin-top: ${roundPx(4, ctx.scale)}px;">${current}/${target}</div>
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

    function renderWidgetHeader(item, ctx, defaultTitle, color, headerClass) {
        const titleText = item.name || defaultTitle;
        const effect = item.titleEffect || 'none';
        
        let styleInject = '';
        let extraStyles = '';
        let extraClasses = '';

        const customColor = item.useCustomTextColor ? (item.textColor || '#ffffff') : color;

        if (effect === 'glow-neon') {
            const glowColor = item.titleColor1 || customColor;
            extraClasses = ' gmd-title-glow-neon';
            styleInject = `
                <style>
                    @keyframes gmdTitleGlow {
                        0% { text-shadow: 0 0 ${roundPx(8, ctx.scale)}px ${glowColor}, 0 0 ${roundPx(16, ctx.scale)}px ${glowColor}; }
                        100% { text-shadow: 0 0 ${roundPx(12, ctx.scale)}px ${glowColor}, 0 0 ${roundPx(24, ctx.scale)}px ${glowColor}, 0 0 ${roundPx(32, ctx.scale)}px ${glowColor}; }
                    }
                    .gmd-title-glow-neon {
                        animation: gmdTitleGlow 1.5s infinite alternate ease-in-out !important;
                    }
                </style>
            `;
        } else if (effect === 'gold-metallic') {
            const gold1 = item.titleColor1 || '#ffe066';
            const gold2 = item.titleColor2 || '#d97706';
            extraClasses = ' gmd-title-gold-metallic';
            extraStyles = `background: linear-gradient(180deg, #fff8c7 0%, ${gold1} 18%, #f7c948 38%, #9a5708 51%, #ffd970 62%, ${gold2} 82%, #6b3505 100%) !important; -webkit-background-clip: text !important; background-clip: text !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke: ${Math.max(0.35, 0.55 * ctx.scale).toFixed(2)}px rgba(92,49,3,.72); text-shadow: none !important; filter: drop-shadow(0 ${roundPx(1, ctx.scale)}px 0 rgba(255,239,153,.45)) drop-shadow(0 ${roundPx(2.5, ctx.scale)}px ${roundPx(1.5, ctx.scale)}px rgba(45,20,0,.72)); font-weight: 900 !important; letter-spacing: ${Math.max(0.2, 0.35 * ctx.scale).toFixed(2)}px;`;
        } else if (effect === 'gradient-wave') {
            const flowColor1 = item.titleColor1 || customColor;
            const flowColor2 = item.titleColor2 || '#f43f5e';
            extraClasses = ' gmd-title-gradient-wave';
            styleInject = `
                <style>
                    @keyframes gmdTitleWave {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                    }
                    .gmd-title-gradient-wave {
                        background: linear-gradient(90deg, ${flowColor1}, ${flowColor2}, ${flowColor1}) !important;
                        background-size: 200% auto !important;
                        -webkit-background-clip: text !important;
                        -webkit-text-fill-color: transparent !important;
                        animation: gmdTitleWave 3s linear infinite !important;
                        font-weight: 900 !important;
                    }
                </style>
            `;
        } else if (effect === 'fire-flicker') {
            const fire1 = item.titleColor1 || '#ff8000';
            const fire2 = item.titleColor2 || '#f43f5e';
            extraClasses = ' gmd-title-fire-flicker';
            styleInject = `
                <style>
                    @keyframes gmdTitleFire {
                        0% { text-shadow: 0 -${roundPx(2, ctx.scale)}px ${roundPx(4, ctx.scale)}px #fff, 0 -${roundPx(4, ctx.scale)}px ${roundPx(10, ctx.scale)}px ${fire1}, 0 -${roundPx(10, ctx.scale)}px ${roundPx(20, ctx.scale)}px ${fire2}, 0 -${roundPx(18, ctx.scale)}px ${roundPx(40, ctx.scale)}px #f00; }
                        50% { text-shadow: 0 -${roundPx(2, ctx.scale)}px ${roundPx(4, ctx.scale)}px #fff, 0 -${roundPx(5, ctx.scale)}px ${roundPx(12, ctx.scale)}px ${fire1}, 0 -${roundPx(12, ctx.scale)}px ${roundPx(24, ctx.scale)}px ${fire2}, 0 -${roundPx(22, ctx.scale)}px ${roundPx(44, ctx.scale)}px #f00; }
                        100% { text-shadow: 0 -${roundPx(2, ctx.scale)}px ${roundPx(4, ctx.scale)}px #fff, 0 -${roundPx(4, ctx.scale)}px ${roundPx(10, ctx.scale)}px ${fire1}, 0 -${roundPx(10, ctx.scale)}px ${roundPx(20, ctx.scale)}px ${fire2}, 0 -${roundPx(18, ctx.scale)}px ${roundPx(40, ctx.scale)}px #f00; }
                    }
                    .gmd-title-fire-flicker {
                        animation: gmdTitleFire 0.8s infinite alternate ease-in-out !important;
                        color: ${customColor} !important;
                    }
                </style>
            `;
        }

        return {
            styleInject,
            titleHTML: `<div class="${headerClass}${extraClasses}" style="font-size: ${font(ctx, item.fontSize, 34)}px; color: ${customColor}; ${extraStyles}">${text(ctx, titleText)}</div>`
        };
    }

    function renderTopContributors(item, options) {
        if (item.contribStyle === 'podium-only' || item.contribStyle === 'podium-table') {
            return renderPodium(item, options);
        }
        const ctx = createContext(options);
        const contributors = Array.isArray(item.contributors) ? item.contributors : [];
        const sliced = contributors.slice(0, Number(item.limitCount || 3));
        const color = item.barColor || '#eab308';
        const headerInfo = renderWidgetHeader(item, ctx, 'BANG VINH DANH', color, 'gmd-contrib-header');
        return `
            ${headerInfo.styleInject}
            <div class="gmd-contributors-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${roundPx(20, ctx.scale)}px ${color}33, 0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(0,0,0,0.6)`}; padding: ${roundPx(12, ctx.scale)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; gap: ${roundPx(6, ctx.scale)}px; width: 100%;">
                    ${headerInfo.titleHTML}
                    <div class="gmd-contrib-list" style="display: flex; flex-direction: column; gap: ${roundPx(6, ctx.scale)}px;">
                        ${sliced.map((c, idx) => {
                            const rawAvatar = c.avatar || 'https://www.w3schools.com/howto/img_avatar.png';
                            const fullAvatarUrl = rawAvatar.startsWith('http') || rawAvatar.startsWith('data:')
                                ? rawAvatar
                                ? rawAvatar
                                : `${ctx.apiBase || ''}${rawAvatar.startsWith('/') ? '' : '/'}${rawAvatar}`
                                : 'https://www.w3schools.com/howto/img_avatar.png';
                            return `
                                <div class="gmd-contrib-item" style="font-size: ${font(ctx, item.rowFontSize, 30)}px; padding: ${roundPx(10, ctx.scale)}px ${roundPx(14, ctx.scale)}px; gap: ${roundPx(18, ctx.scale)}px; border-radius: ${roundPx(14, ctx.scale)}px;">
                                    <span class="gmd-contrib-rank" style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">#${idx + 1}</span>
                                    ${item.showAvatar !== false ? `<div class="gmd-contrib-avatar" style="width: ${roundPx(48, ctx.scale)}px; height: ${roundPx(48, ctx.scale)}px; border-radius: 50%; background: #2e3b5e; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; background-image: url('${fullAvatarUrl}'); background-size: cover;"></div>` : ''}
                                    <span class="gmd-contrib-name" style="color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : ''};">${text(ctx, c.nickname || 'BH Studio')}</span>
                                    ${item.showValue !== false ? `<span class="gmd-contrib-val">${c.value || 0}</span>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPodium(item, options) {
        if (item.contribStyle === 'list-only') {
            return renderTopContributors(item, options);
        }
        const ctx = createContext(options);
        const contributors = Array.isArray(item.contributors) ? item.contributors : [];
        const color = item.barColor || '#eab308';

        const isTable = item.contribStyle === 'podium-table';
        const size1 = isTable ? 70 : 88;
        const size2 = isTable ? 52 : 64;

        const person = (idx, rank, size) => {
            const c = contributors[idx] || {};
            const podiumGap = Number(item.podiumGap !== undefined ? item.podiumGap : 14);
            const rankOffset = rank === 2 ? -podiumGap : (rank === 3 ? podiumGap : 0);
            const topEffect = rank === 1 ? String(item.top1Effect || 'none') : 'none';
            const topEffectAnimation = topEffect === 'shake'
                ? 'animation:gmdShake .7s ease-in-out infinite;'
                : (topEffect === 'pulse' || topEffect === 'light-sweep-pulse' ? 'animation:gmdPulse 1.4s ease-in-out infinite;' : '');
            let frameUrl = item[`top${rank}FrameUrl`] || '';
            if (frameUrl && !frameUrl.startsWith('http') && !frameUrl.startsWith('data:')) {
                frameUrl = `${ctx.apiBase || ''}${frameUrl.startsWith('/') ? '' : '/'}${frameUrl}`;
            }
            const frameHtml = frameUrl
                ? (frameUrl.toLowerCase().endsWith('.webm') || frameUrl.toLowerCase().endsWith('.mp4')
                    ? `<video src="${frameUrl}" autoplay loop muted playsinline style="position: absolute; inset: -14%; width: 128%; height: 128%; z-index: 2; pointer-events: none; object-fit: contain;"></video>`
                    : `<img src="${frameUrl}" style="position: absolute; inset: -14%; width: 128%; height: 128%; z-index: 2; pointer-events: none; object-fit: contain;">`
                  )
                : '';

            const rawAvatar = c.avatar || 'https://www.w3schools.com/howto/img_avatar.png';
            const fullAvatarUrl = rawAvatar.startsWith('http') || rawAvatar.startsWith('data:')
                ? rawAvatar
                : `${ctx.apiBase || ''}${rawAvatar.startsWith('/') ? '' : '/'}${rawAvatar}`;

            return `
                <div class="gmd-podium-spot rank-${rank}" style="transform: translateX(${roundPx(rankOffset, ctx.scale)}px);">
                    <div class="gmd-podium-avatar-wrap" style="position: relative; ${topEffectAnimation}">
                        <div class="gmd-podium-avatar" style="width: ${roundPx(size, ctx.scale)}px; height: ${roundPx(size, ctx.scale)}px; display:flex; align-items:center; justify-content:center; font-size:${roundPx(size * 0.44, ctx.scale)}px; background-image: url('${fullAvatarUrl}'); background-size: cover; z-index: 1;"></div>
                        ${frameHtml}
                        ${topEffect === 'light-sweep' || topEffect === 'light-sweep-pulse' ? `<span style="position:absolute;inset:-14%;border-radius:50%;z-index:3;pointer-events:none;background:linear-gradient(110deg,transparent 28%,rgba(255,255,255,.72) 49%,transparent 70%);background-size:250% 100%;animation:gmdTextLightSweep 1.8s linear infinite;mix-blend-mode:screen;"></span>` : ''}
                    </div>
                    <div class="gmd-podium-name" style="font-size: ${font(ctx, item.rowFontSize, 22)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''};">${text(ctx, c.nickname || 'BH Studio')}</div>
                    ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${font(ctx, item.valueFontSize, 22)}px;">${Number(c.value || 0).toLocaleString('vi-VN')}</div>` : ''}
                </div>
            `;
        };

        const tableHTML = isTable
            ? `
            <div class="gmd-contrib-table" style="margin-top: ${roundPx(12, ctx.scale)}px; display: flex; flex-direction: column; gap: ${roundPx(5, ctx.scale)}px; width: 100%; box-sizing: border-box; overflow: hidden; flex: 1;">
                ${contributors.slice(3, Number(item.limitCount || 10)).map((c, sliceIdx) => {
                    const rankIdx = sliceIdx + 4;
                    const valueStr = item.showValue !== false ? (Number(c.value || 0).toLocaleString('vi-VN') + ' xu') : '';
                    const rawRowAvatar = c.avatar || 'https://www.w3schools.com/howto/img_avatar.png';
                    const fullRowAvatarUrl = rawRowAvatar.startsWith('http') || rawRowAvatar.startsWith('data:')
                        ? rawRowAvatar
                        : `${ctx.apiBase || ''}${rawRowAvatar.startsWith('/') ? '' : '/'}${rawRowAvatar}`;
                    return `
                        <div class="gmd-contrib-row" style="display: grid; grid-template-columns: ${roundPx(50, ctx.scale)}px 1fr auto; align-items: center; padding: ${roundPx(6, ctx.scale)}px ${roundPx(10, ctx.scale)}px; border-radius: ${roundPx(8, ctx.scale)}px; background: rgba(255,255,255,0.03); border: 1.5px solid rgba(255,255,255,0.05); gap: ${roundPx(8, ctx.scale)}px; font-size: ${font(ctx, item.rowFontSize, 22)}px; box-sizing: border-box;">
                            <div class="gmd-contrib-row-rank" style="font-weight: 800; color: ${item.useCustomTextColor ? (item.textColor || '#a855f7') : '#a855f7'};">#${rankIdx}</div>
                            <div class="gmd-contrib-row-user" style="display: flex; align-items: center; gap: ${roundPx(6, ctx.scale)}px; min-width: 0;">
                                ${item.showAvatar !== false ? `<div class="gmd-contrib-row-avatar" style="width: ${roundPx(24, ctx.scale)}px; height: ${roundPx(24, ctx.scale)}px; border-radius: 50%; background: #2e3b5e; border: 1.5px solid rgba(255,255,255,0.1); background-image: url('${fullRowAvatarUrl}'); background-size: cover; flex-shrink: 0;"></div>` : ''}
                                <div class="gmd-contrib-row-name" style="font-weight: 700; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${text(ctx, c.nickname || 'BH Studio')}</div>
                            </div>
                            <div class="gmd-contrib-row-val" style="font-weight: 900; color: ${item.useCustomTextColor ? (item.textColor || '#fbbf24') : '#fbbf24'};">${valueStr}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            `
            : '';

        const paddingVal = isTable ? 12 : 18;
        const justifyVal = isTable ? 'flex-start' : 'center';
        const headerInfo = renderWidgetHeader(item, ctx, 'VUONG MIEN HOANG GIA', color, 'gmd-podium-header');

        return `
            ${headerInfo.styleInject}
            <div class="gmd-podium-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? bg(item.bgColor) : 'radial-gradient(circle at center, rgba(234, 179, 8, 0.1) 0%, #0a0a14 100%)')} !important; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? bg(item.bgColor) : '#eab308'}`} !important; box-shadow: ${item.hideBg ? 'none' : `0 ${roundPx(8, ctx.scale)}px ${roundPx(32, ctx.scale)}px rgba(217, 70, 239, 0.25), 0 ${roundPx(12, ctx.scale)}px ${roundPx(48, ctx.scale)}px rgba(0,0,0,0.7)`} !important; border-radius: ${roundPx(24, ctx.scale)}px; padding: ${roundPx(paddingVal, ctx.scale)}px; display: flex; flex-direction: column; justify-content: ${justifyVal}; height: 100%; box-sizing: border-box; width: 100%; overflow: hidden;">
                <div style="transform: translateY(${roundPx(item.contentOffsetY || 0, ctx.scale)}px); display: flex; flex-direction: column; width: 100%; ${isTable ? 'height: 100%;' : ''} box-sizing: border-box;">
                    ${headerInfo.titleHTML}
                    <div class="gmd-podium-podium" style="gap: 0; margin-top: ${roundPx(item.podiumHeaderGap !== undefined ? item.podiumHeaderGap : 8, ctx.scale)}px; justify-content: center; flex-shrink: 0; flex: none !important;">
                        ${person(1, 2, size2)}
                        ${person(0, 1, size1)}
                        ${person(2, 3, size2)}
                    </div>
                    ${tableHTML}
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
                            const iconSize = length(ctx, item.iconSize, 28);
                            const goalIcon = g.iconDisplayMode === 'text'
                                ? `<span class="gmd-text-gift-icon" style="width:${iconSize}px;height:${iconSize}px;color:${g.iconTextColor || '#ffffff'};font-size:${font(ctx, g.iconTextSize, 16)}px;">${text(ctx, g.iconText || g.giftName)}</span>`
                                : (icon ? (isVideoAsset(icon)
                                    ? `<video class="gmd-goal-list-icon" src="${icon}" autoplay loop muted playsinline style="width:${iconSize}px;height:${iconSize}px;border-radius:50%;object-fit:contain;"></video>`
                                    : `<img class="gmd-goal-list-icon" src="${icon}" style="width:${iconSize}px;height:${iconSize}px;border-radius:50%;" alt="">`) : '');
                            return `
                                <div class="gmd-goal-list-row ${item.shimmerEffect !== false ? 'gmd-shimmer-row' : ''}" style="display:flex; flex-direction:column; gap: ${roundPx(8, ctx.scale)}px; background:rgba(255,255,255,0.02); padding: ${roundPx(12, ctx.scale)}px ${roundPx(16, ctx.scale)}px; border-radius: ${roundPx(12, ctx.scale)}px; margin-bottom: ${isAutoScroll ? `${roundPx(12, ctx.scale)}px` : '0'}; position: relative; overflow: hidden;">
                                    <div class="gmd-goal-list-text-row" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                        <div style="display:flex; align-items:center; gap:${roundPx(8, ctx.scale)}px;">
                                            ${goalIcon}
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
        const direction = item.layoutDirection === 'horizontal' ? 'horizontal' : 'vertical';
        const loopDir = direction === 'horizontal'
            ? (item.loopDirection === 'left-to-right' ? 'left-to-right' : 'right-to-left')
            : (item.loopDirection === 'top-to-bottom' ? 'top-to-bottom' : 'bottom-to-top');
        const loopSpeed = item.loopSpeed !== undefined ? item.loopSpeed : 15;
        const childrenToRender = isLoop && children.length > 0 ? Array(6).fill(children).flat() : children;
        const textPosition = item.textPosition || 'bottom';
        const iconSize = length(ctx, item.iconSize, 64);
        const textSize = font(ctx, item.textSize, 14);
        const subtextSize = font(ctx, item.subtextSize, Math.max(4, Math.round((Number(item.textSize) || 14) * 0.78)));
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
        const borderId = `gmd_stack_border_${String(item.id || 'group').replace(/[^a-zA-Z0-9_-]/g, '_')}_${ctx.mode}_${++renderInstanceSequence}`;
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
                @keyframes gmdStackMarqueeRightToLeft_${item.id || 'group'} { 0% { transform: translateX(0); } 100% { transform: translateX(-16.6667%); } }
                @keyframes gmdStackMarqueeLeftToRight_${item.id || 'group'} { 0% { transform: translateX(-16.6667%); } 100% { transform: translateX(0); } }
                @keyframes gmdStackMarqueeBottomToTop_${item.id || 'group'} { 0% { transform: translateY(0); } 100% { transform: translateY(-16.6667%); } }
                @keyframes gmdStackMarqueeTopToBottom_${item.id || 'group'} { 0% { transform: translateY(-16.6667%); } 100% { transform: translateY(0); } }
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
                        ? `${direction === 'horizontal' ? 'width:max-content;height:100%;' : 'width:100%;height:max-content;'}animation:${direction === 'horizontal' ? (loopDir === 'left-to-right' ? 'gmdStackMarqueeLeftToRight' : 'gmdStackMarqueeRightToLeft') : (loopDir === 'top-to-bottom' ? 'gmdStackMarqueeTopToBottom' : 'gmdStackMarqueeBottomToTop')}_${item.id || 'group'} ${loopSpeed}s linear infinite;`
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
                        const childMedia = child.iconDisplayMode === 'text'
                            ? `<span class="gmd-text-gift-icon" style="color:${child.iconTextColor || '#ffffff'};font-size:${font(ctx, child.iconTextSize, 20)}px;">${text(ctx, child.iconText || child.name)}</span>`
                            : (isVideoAsset(icon)
                                ? `<video src="${icon}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>`
                                : `<img src="${icon}" alt="${name}">`);
                        const plainChildMedia = child.iconDisplayMode === 'text'
                            ? `<span class="gmd-text-gift-icon" style="width:${iconSize}px;height:${iconSize}px;color:${child.iconTextColor || '#ffffff'};font-size:${font(ctx, child.iconTextSize, 20)}px;flex-shrink:0;">${text(ctx, child.iconText || child.name)}</span>`
                            : (isVideoAsset(icon)
                                ? `<video src="${icon}" autoplay loop muted playsinline style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;display:block;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45));flex-shrink:0;"></video>`
                                : `<img src="${icon}" alt="${name}" style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;display:block;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45));flex-shrink:0;">`);

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
                        const textGradientFrom = child.textBgGradientFrom || '#a855f7';
                        const textGradientTo = child.textBgGradientTo || '#22d3ee';
                        
                        let labelBgStyle = '';
                        if (showTextBg) {
                            if (textBgStyle === 'glass') {
                                labelBgStyle = `background:rgba(255,255,255,0.05);animation:gmdGlassBreath 4s ease-in-out infinite;backdrop-filter:blur(${effectPx(6)}px);-webkit-backdrop-filter:blur(${effectPx(6)}px);border:${effectPx(1)}px solid rgba(255,255,255,0.12);`;
                            } else if (textBgStyle === 'neon') {
                                labelBgStyle = `background-image:linear-gradient(rgba(8,8,12,0.94), rgba(8,8,12,0.94)), linear-gradient(135deg, ${textGradientFrom}, ${textGradientTo});background-origin:border-box;background-clip:padding-box, border-box;border:${effectPx(1)}px solid transparent;--frame-color:${textGradientFrom};--glow-soft:color-mix(in srgb, ${textGradientFrom} 8%, transparent);--glow-bright:color-mix(in srgb, ${textGradientTo} 22%, transparent);--inner-border-color:color-mix(in srgb, ${textGradientTo} 50%, white);animation:gmdMagicLiquidMorph 6s ease-in-out infinite, gmdMysticGlow 4s ease-in-out infinite;`;
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
                                        ${subtext ? `<div class="gmd-stack-group-subtext" style="font-size:${subtextSize}px;color:${item.textColor || '#ffffff'};opacity:0.8;font-weight:600;line-height:1.15;text-align:${textAlign};white-space:nowrap;margin-top:${effectPx(2)}px;text-shadow:0 1px 4px rgba(0,0,0,.5);">${subtext}</div>` : ''}
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

    if (typeof window !== 'undefined') {
        if (!window._gmdTimerInterval) {
            window._gmdTimerInterval = setInterval(() => {
                const timerElms = document.querySelectorAll('.gmd-pk-timer-text');
                timerElms.forEach(el => {
                    const running = el.getAttribute('data-running') === 'true';
                    if (!running) return;
                    
                    let remaining = Number(el.getAttribute('data-remaining'));
                    const startedAt = Number(el.getAttribute('data-started-at'));
                    const duration = Number(el.getAttribute('data-duration-secs'));
                    
                    if (startedAt && duration) {
                        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                        remaining = duration - elapsed;
                        if (remaining < 0) remaining = 0;
                    }
                    
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    const s = remaining % 60;
                    const formatted = [
                        String(h).padStart(2, '0'),
                        String(m).padStart(2, '0'),
                        String(s).padStart(2, '0')
                    ].join(':');
                    
                    if (el.textContent !== formatted) {
                        el.textContent = formatted;
                    }
                });
            }, 200);
        }
    }
})();

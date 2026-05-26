(function () {
    const stage = document.getElementById('goal-board-stage');
    const apiBase = window.location.origin;
    // Map HTTP protocol to WS protocol
    const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use port 9001 for WebSocket by default
    const wsUrl = `${wsScheme}//${window.location.hostname}:9001`;

    let activeLayout = null;
    let ws = null;
    let reconnectTimeout = null;

    // Load initial layout
    async function loadLayout() {
        try {
            const res = await fetch(`${apiBase}/api/tiktok/goal-board/layout?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.success && data.layout) {
                    activeLayout = data.layout;
                    render();
                }
            }
        } catch (err) {
            console.error('Failed to load goal board layout:', err);
        }
    }

    // Connect to WebSocket for real-time sync
    function connectWebSocket() {
        if (ws) {
            try { ws.close(); } catch(e) {}
        }

        console.log(`Connecting to WebSocket: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('✅ Connected to WebSocket Server');
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
        };

        ws.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data || '{}');
                console.log('Received socket packet:', packet);

                // Handle layout changes
                if (packet.event === 'goal_board_layout_update' && packet.data?.layout) {
                    console.log('Layout updated from designer:', packet.data.layout);
                    activeLayout = packet.data.layout;
                    render();
                }
                
                // Handle progress updates (Phase 2)
                if (packet.event === 'goal_board_progress_update' && packet.data?.layers) {
                    console.log('Live progress updated:', packet.data.layers);
                    if (activeLayout) {
                        activeLayout.layers = packet.data.layers;
                        render();
                    }
                }
            } catch (err) {
                console.error('Failed to parse WebSocket packet:', err);
            }
        };

        ws.onclose = () => {
            console.log('❌ WebSocket connection closed. Reconnecting in 3s...');
            ws = null;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('⚠️ WebSocket error:', err.message);
        };
    }

    // Render layers responsively
    function render() {
        if (!stage || !activeLayout || !Array.isArray(activeLayout.layers)) return;

        // Viewport scale relative to logic 1080x1920
        const exportW = 1080;
        const exportH = 1920;
        const sx = window.innerWidth / exportW;
        const sy = window.innerHeight / exportH;
        
        // Use a uniform scale factor to prevent aspect ratio distortion
        const s = Math.min(sx, sy) || 1;

        // Remove elements that are no longer active or visible
        const activeIds = new Set((activeLayout.layers || []).filter(item => item.visible !== false).map(item => String(item.id)));
        Array.from(stage.children).forEach(child => {
            const id = child.id.replace('layer_', '');
            if (!activeIds.has(id)) {
                child.remove();
            }
        });

        const sortedLayers = [...activeLayout.layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        // Helper to convert hex colors to translucent (25% opacity) if they are 7-char hex strings
        const getTranslucentBg = (colorHex, defaultHex = '#0a0a14') => {
            const hex = colorHex || defaultHex;
            return (hex.startsWith('#') && hex.length === 7) ? hex + '40' : hex;
        };

        sortedLayers.forEach((item) => {
            if (item.visible === false) return;
            
            let refW = item.lockedW || item.w || 900;
            let refH = item.lockedH || item.h || 160;
            let isWidget = false;
            
            if (['goal-bar', 'boss-bar', 'top-contributors', 'podium-contributors', 'mystery-chests', 'combo', 'goal-list'].includes(item.type)) {
                isWidget = true;
                if (!item.lockRatio) {
                    if (item.type === 'boss-bar') { refW = 840; refH = 180; }
                    else if (item.type === 'combo') { refW = 800; refH = 220; }
                    else if (item.type === 'mystery-chests') { refW = 900; refH = 240; }
                    else if (item.type === 'top-contributors' || item.type === 'podium-contributors') { refW = 900; refH = 560; }
                    else if (item.type === 'goal-list') { refW = 900; refH = item.h || 700; }
                    else if (item.type === 'goal-bar') { refW = 900; refH = 160; }
                }
            }
            
            let el = document.getElementById(`layer_${item.id}`);
            const exists = !!el;
            if (!exists) {
                el = document.createElement('div');
                el.id = `layer_${item.id}`;
                el.className = 'gmd-item';
                stage.appendChild(el);
            }
            
            // Convert logical units (1080x1920) to absolute responsive pixels
            el.style.left = `${Math.round(item.x * sx)}px`;
            el.style.top = `${Math.round(item.y * sy)}px`;
            el.style.width = `${Math.round(item.w * sx)}px`;
            el.style.height = `${Math.round(item.h * sy)}px`;
            el.style.zIndex = String(item.zIndex || 1);

            let widgetHTML = '';
            let skipHTMLUpdate = false;

            if (item.type === 'media-asset') {
                const isVideo = item.isWebM || (item.assetUrl && item.assetUrl.endsWith('.webm'));
                const opacity = item.opacity !== undefined ? item.opacity : 1;
                const fitMode = item.fitMode || 'contain';
                const assetSrc = item.assetUrl ? (item.assetUrl.startsWith('http') ? item.assetUrl : `${apiBase}${item.assetUrl}`) : '';
                
                if (exists) {
                    if (isVideo) {
                        const videoEl = el.querySelector('video');
                        if (videoEl && (videoEl.src === assetSrc || videoEl.getAttribute('src') === item.assetUrl)) {
                            videoEl.style.objectFit = fitMode;
                            videoEl.style.opacity = String(opacity);
                            skipHTMLUpdate = true;
                        }
                    } else {
                        const imgEl = el.querySelector('img');
                        if (imgEl && (imgEl.src === assetSrc || imgEl.getAttribute('src') === item.assetUrl)) {
                            imgEl.style.objectFit = fitMode;
                            imgEl.style.opacity = String(opacity);
                            skipHTMLUpdate = true;
                        }
                    }
                }

                if (!skipHTMLUpdate) {
                    widgetHTML = `
                        <div class="gmd-asset-container" style="width:100%; height:100%; position:relative;">
                            <div class="gmd-asset-fallback-box" style="position:absolute; inset:0; display: ${assetSrc ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; background: rgba(168, 85, 247, 0.03); border: 1px dashed rgba(168, 85, 247, 0.25); border-radius: 16px; box-sizing: border-box; text-align: center; padding: 12px; pointer-events: none; z-index: 1;">
                                <div style="font-size: 36px; opacity: 0.6;">🖼️</div>
                                <div style="font-size: 20px; font-weight: bold; color: rgba(192, 132, 252, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 90%; margin-top: 1px;" title="${item.name || 'Tài nguyên'}">${item.name || 'Tài nguyên'}</div>
                            </div>
                            ${assetSrc ? (isVideo
                                ? `<video src="${assetSrc}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" autoplay loop muted playsinline></video>`
                                : `<img src="${assetSrc}" style="position:relative; z-index:2; width:100%; height:100%; object-fit:${fitMode}; opacity:${opacity}; background:transparent;" alt="">`
                            ) : ''}
                        </div>
                    `;
                }
            } else if (item.type === 'goal-bar') {
                const current = Number(item.currentCount || 0);
                const target = Number(item.targetCount || 100);
                const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                const color = item.barColor || '#ff007f';
                const glow = item.glowColor || 'rgba(255,0,127,0.5)';
                const titleSize = Math.round((item.fontSize || 38) * s);
                const subSize = Math.round((item.subtitleFontSize || 24) * s);
                
                widgetHTML = `
                    <div class="gmd-goal-bar-widget ${item.themeStyle === 'neon' ? 'theme-neon' : ''}" style="border-radius: ${Math.round((item.borderRadius || 12) * s)}px; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `${color}80`)}; box-shadow: ${item.hideBg ? 'none' : `0 ${Math.round(10 * s)}px ${Math.round(30 * s)}px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 ${Math.round(15 * s)}px ${color}26`}; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at top left, ${color}12, #0f172a)`)}; padding: ${Math.round(16 * s)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; gap: ${Math.round(8 * s)}px; width: 100%;">
                            <div class="gmd-goal-bar-title-row" style="font-size: ${titleSize}px;">
                                <span style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}; text-shadow: 0 0 ${Math.round(10 * s)}px ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}80; font-size: ${titleSize}px;">${escapeHtml(item.name) || (escapeHtml(item.giftName) + ' Goal') || 'Rose Goal'}</span>
                                <span style="color: ${color}; text-shadow: 0 0 ${Math.round(10 * s)}px ${color}80; font-size: ${titleSize}px;">${current}/${target}</span>
                            </div>
                            <div class="gmd-goal-bar-outer" style="height: ${Math.round((item.barHeight !== undefined ? item.barHeight : 54) * s)}px; border-radius: ${Math.round((item.borderRadius || 12) * s)}px;">
                                <div class="gmd-goal-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; --bar-color: ${color}; --bar-glow: ${glow}; background: linear-gradient(90deg, ${color}, ${glow}); box-shadow: 0 0 ${Math.round(24 * s)}px ${glow}; border-radius: ${Math.round((item.borderRadius || 12) * s)}px;"></div>
                            </div>
                            ${item.subtitleText ? `<div class="gmd-goal-bar-subtitle" style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : (item.subtitleColor || '#cbd5e1')}; text-align: left; margin-top: ${Math.round(2 * s)}px; line-height: 1.2; opacity: 0.9;">${escapeHtml(item.subtitleText)}</div>` : ''}
                        </div>
                    </div>
                `;
            } else if (item.type === 'boss-bar') {
                const current = Number(item.currentCount || 0);
                const target = Number(item.targetCount || 100);
                const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                const color = item.barColor || '#ef4444';
                const titleSize = Math.round((item.fontSize || 38) * s);
                const subSize = Math.round((item.subtitleFontSize || 26) * s);
                
                const formatNum = (num) => {
                    if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'k';
                    return num;
                };
                
                widgetHTML = `
                    <div class="gmd-boss-bar-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${Math.round(30 * s)}px ${color}4d, 0 ${Math.round(8 * s)}px ${Math.round(32 * s)}px rgba(0,0,0,0.6)`}; display: flex; flex-direction: column; justify-content: center; padding: ${Math.round(16 * s)}px; box-sizing: border-box; width: 100%; height: 100%;">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; gap: ${Math.round(14 * s)}px; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: ${titleSize}px; font-weight: 900; color: #fff; line-height: 1;">
                                <span style="display: flex; align-items: center; gap: ${Math.round(6 * s)}px; text-shadow: 0 0 ${Math.round(10 * s)}px ${color}; font-size: ${titleSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'};">🐉 ${escapeHtml(item.bossName) || 'BOSS HP'}</span>
                                <span style="color: ${color}; text-shadow: 0 0 ${Math.round(10 * s)}px ${color}; font-size: ${titleSize}px;">${pct}%</span>
                            </div>
                            <div class="gmd-boss-bar-outer" style="height: ${Math.round((item.barHeight !== undefined ? item.barHeight : 24) * s)}px; background: rgba(0, 0, 0, 0.6); border-radius: 4px; overflow: hidden; border: 1px solid ${color}40; position: relative; box-sizing: border-box; width: 100%;">
                                <div class="gmd-boss-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="height: 100%; width: ${pct}%; --bar-color: ${color}; --bar-glow: ${color}; background: linear-gradient(90deg, #b91c1c, ${color}); box-shadow: 0 0 ${Math.round(12 * s)}px ${color};"></div>
                            </div>
                            <div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#9ca3af') : '#9ca3af'}; text-align: left; display: flex; justify-content: space-between; line-height: 1;">
                                <span style="font-size: ${subSize}px;">⚔️ ${escapeHtml(item.bossSub) || 'Corgi tấn công'}</span>
                                <span style="color: ${color}; font-weight: bold; font-size: ${subSize}px;">${formatNum(current)}/${formatNum(target)}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (item.type === 'top-contributors') {
                const contributors = Array.isArray(item.contributors) ? item.contributors : [];
                const limit = Number(item.limitCount || 3);
                const sliced = contributors.slice(0, limit);
                const color = item.barColor || '#eab308';
                const headerSize = Math.round((item.fontSize || 34) * s);
                const rowSize = Math.round((item.rowFontSize || 30) * s);
                widgetHTML = `
                    <div class="gmd-contributors-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border-color: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : color)}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${Math.round(20 * s)}px ${color}33, 0 ${Math.round(8 * s)}px ${Math.round(32 * s)}px rgba(0,0,0,0.6)`}; padding: ${Math.round(12 * s)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%;">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; gap: ${Math.round(6 * s)}px; width: 100%;">
                            <div class="gmd-contrib-header" style="font-size: ${headerSize}px; padding-bottom: ${Math.round(14 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; border-bottom-color: ${color}4d;">🏆 BẢNG VINH DANH</div>
                            <div class="gmd-contrib-list" style="display: flex; flex-direction: column; gap: ${Math.round(6 * s)}px;">
                                ${sliced.map((c, idx) => `
                                    <div class="gmd-contrib-item" style="font-size: ${rowSize}px; padding: ${Math.round(10 * s)}px ${Math.round(14 * s)}px; gap: ${Math.round(18 * s)}px; border-radius: ${Math.round(14 * s)}px; display: flex; align-items: center;">
                                        <span class="gmd-contrib-rank" style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''}; font-weight: bold;">#${idx + 1}</span>
                                        ${item.showAvatar !== false ? `<div class="gmd-contrib-avatar" style="width: ${Math.round(48 * s)}px; height: ${Math.round(48 * s)}px; border-radius: 50%; background: #2e3b5e; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;"></div>` : ''}
                                        <span class="gmd-contrib-name" style="color: ${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : ''}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;">${escapeHtml(c.nickname) || 'BH Studio'}</span>
                                        ${item.showValue !== false ? `<span class="gmd-contrib-val" style="color: ${color}; font-weight: bold;">${c.value}💎</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            } else if (item.type === 'podium-contributors') {
                const contributors = Array.isArray(item.contributors) ? item.contributors : [];
                const headerSize = Math.round((item.fontSize || 34) * s);
                const nameSize = Math.round((item.rowFontSize || 22) * s);
                const valSize = Math.round((item.valueFontSize || 22) * s);
                widgetHTML = `
                    <div class="gmd-podium-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(234, 179, 8, 0.1) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : '#eab308'}`}; border-radius: ${Math.round(24 * s)}px; padding: ${Math.round(18 * s)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; box-shadow: ${item.hideBg ? 'none' : ''};">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; width: 100%;">
                            <div class="gmd-podium-header" style="font-size: ${headerSize}px; padding-bottom: ${Math.round(8 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#eab308') : ''}; text-align: center; font-weight: 900;">👑 VƯƠNG MIỆN HOÀNG GIA</div>
                            <div class="gmd-podium-podium" style="display: flex; justify-content: space-around; align-items: flex-end; margin-top: ${Math.round(24 * s)}px; gap: 8px;">
                                <div class="gmd-podium-spot rank-2" style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                                    <div class="gmd-podium-avatar-wrap" style="position: relative; margin-bottom: 8px;">
                                        <div class="gmd-podium-crown" style="font-size: ${Math.round(32 * s)}px; position: absolute; top: -${Math.round(20 * s)}px; left: 50%; transform: translateX(-50%); z-index: 2;">🥈</div>
                                        <div class="gmd-podium-avatar" style="width: ${Math.round(64 * s)}px; height: ${Math.round(64 * s)}px; border-radius: 50%; border: 2px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-size:${Math.round(28 * s)}px; background: #1e293b;">👤</div>
                                    </div>
                                    <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold; text-align: center; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(contributors[1]?.nickname) || 'Trống'}</div>
                                    ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px; color: #eab308; font-weight: bold;">${contributors[1]?.value || 0}💎</div>` : ''}
                                </div>
                                <div class="gmd-podium-spot rank-1" style="display: flex; flex-direction: column; align-items: center; flex: 1.2;">
                                    <div class="gmd-podium-avatar-wrap" style="position: relative; margin-bottom: 8px;">
                                        <div class="gmd-podium-crown" style="font-size: ${Math.round(44 * s)}px; position: absolute; top: -${Math.round(28 * s)}px; left: 50%; transform: translateX(-50%); z-index: 2;">👑</div>
                                        <div class="gmd-podium-glow-ring" style="inset: -${Math.round(6 * s)}px; border-width: ${Math.round(3 * s)}px; position: absolute; border-radius: 50%; border: 2px solid #eab308; box-shadow: 0 0 10px #eab308;"></div>
                                        <div class="gmd-podium-avatar" style="width: ${Math.round(88 * s)}px; height: ${Math.round(88 * s)}px; border-radius: 50%; border: 3px solid #f59e0b; display:flex; align-items:center; justify-content:center; font-size:${Math.round(38 * s)}px; background: #1e293b; box-shadow: 0 0 15px rgba(245,158,11,0.5);">👤</div>
                                    </div>
                                    <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold; text-align: center; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(contributors[0]?.nickname) || 'Vua Donate'}</div>
                                    ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px; color: #f59e0b; font-weight: bold;">${contributors[0]?.value || 0}💎</div>` : ''}
                                </div>
                                <div class="gmd-podium-spot rank-3" style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                                    <div class="gmd-podium-avatar-wrap" style="position: relative; margin-bottom: 8px;">
                                        <div class="gmd-podium-crown" style="font-size: ${Math.round(32 * s)}px; position: absolute; top: -${Math.round(20 * s)}px; left: 50%; transform: translateX(-50%); z-index: 2;">🥉</div>
                                        <div class="gmd-podium-avatar" style="width: ${Math.round(64 * s)}px; height: ${Math.round(64 * s)}px; border-radius: 50%; border: 2px solid #b45309; display:flex; align-items:center; justify-content:center; font-size:${Math.round(28 * s)}px; background: #1e293b;">👤</div>
                                    </div>
                                    <div class="gmd-podium-name" style="font-size: ${nameSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold; text-align: center; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(contributors[2]?.nickname) || 'Trống'}</div>
                                    ${item.showValue !== false ? `<div class="gmd-podium-value" style="font-size: ${valSize}px; color: #eab308; font-weight: bold;">${contributors[2]?.value || 0}💎</div>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (item.type === 'mystery-chests') {
                const current = Number(item.currentCount || 0);
                const target = Number(item.targetCount || 100);
                const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
                const titleText = item.name || '🎁 MỞ KHÓA HỘP QUÀ KỲ BÍ';
                const titleSize = Math.round((item.fontSize || 32) * s);
                const subSize = Math.round((item.subtitleFontSize || 20) * s);
                
                widgetHTML = `
                    <div class="gmd-mystery-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(168, 85, 247, 0.1) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : (item.barColor || '#a855f7')}`}; border-radius: ${Math.round(24 * s)}px; padding: ${Math.round(18 * s)}px; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; box-shadow: ${item.hideBg ? 'none' : ''};">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; width: 100%;">
                            <div class="gmd-mystery-header" style="font-size: ${titleSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : (item.titleColor || '#ffffff')}; text-align: center; font-weight: 900;">${escapeHtml(titleText)}</div>
                            <div class="gmd-mystery-title-row" style="font-size: ${Math.round(26 * s)}px; margin-top: ${Math.round(6 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; display: flex; justify-content: space-between; font-weight: bold;">
                                <span>${escapeHtml(item.giftName || 'Hộp Quà')} Goal</span>
                                <span>${current}/${target}</span>
                            </div>
                            <div class="gmd-mystery-track-wrap" style="margin-top: ${Math.round(16 * s)}px; position: relative; padding-bottom: ${Math.round(28 * s)}px;">
                                <div class="gmd-mystery-bar-outer" style="height: ${Math.round((item.barHeight !== undefined ? item.barHeight : 24) * s)}px; border-radius: 24px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.08); overflow: hidden;">
                                    <div class="gmd-mystery-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width: ${pct}%; height: 100%; border-radius: 24px; --bar-color: ${item.barColor || '#a855f7'}; --bar-glow: ${item.glowColor || '#fb7185'}; background: ${item.barColor || '#a855f7'};"></div>
                                </div>
                                <div class="gmd-mystery-milestones" style="position: absolute; width: 100%; left: 0; top: 0; height: 100%; pointer-events: none;">
                                    <div class="gmd-mystery-node ${pct >= 25 ? 'unlocked' : ''}" style="left: 25%; position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
                                        <span class="gmd-mystery-chest" style="font-size: ${Math.round((pct >= 25 ? 44 : 32) * s)}px; position: relative; top: -${Math.round(8 * s)}px;">📦</span>
                                        <span class="gmd-mystery-pct" style="font-size: ${Math.round(20 * s)}px; margin-top: ${Math.round(8 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold;">25%</span>
                                    </div>
                                    <div class="gmd-mystery-node ${pct >= 50 ? 'unlocked' : ''}" style="left: 50%; position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
                                        <span class="gmd-mystery-chest" style="font-size: ${Math.round((pct >= 50 ? 44 : 32) * s)}px; position: relative; top: -${Math.round(8 * s)}px;">🧰</span>
                                        <span class="gmd-mystery-pct" style="font-size: ${Math.round(20 * s)}px; margin-top: ${Math.round(8 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold;">50%</span>
                                    </div>
                                    <div class="gmd-mystery-node ${pct >= 75 ? 'unlocked' : ''}" style="left: 75%; position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
                                        <span class="gmd-mystery-chest" style="font-size: ${Math.round((pct >= 75 ? 44 : 32) * s)}px; position: relative; top: -${Math.round(8 * s)}px;">🪙</span>
                                        <span class="gmd-mystery-pct" style="font-size: ${Math.round(20 * s)}px; margin-top: ${Math.round(8 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold;">75%</span>
                                    </div>
                                    <div class="gmd-mystery-node ${pct >= 100 ? 'unlocked' : ''}" style="left: 100%; position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
                                        <span class="gmd-mystery-chest" style="font-size: ${Math.round((pct >= 100 ? 44 : 32) * s)}px; position: relative; top: -${Math.round(8 * s)}px;">💎</span>
                                        <span class="gmd-mystery-pct" style="font-size: ${Math.round(20 * s)}px; margin-top: ${Math.round(8 * s)}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; font-weight: bold;">100%</span>
                                    </div>
                                </div>
                            </div>
                            ${item.subtitleText ? `<div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#fda4af') : (item.subtitleColor || '#fda4af')}; text-align: center; margin-top: ${Math.round(6 * s)}px; font-weight: bold; line-height: 1.2;">${escapeHtml(item.subtitleText)}</div>` : ''}
                        </div>
                    </div>
                `;
            } else if (item.type === 'combo') {
                const count = item.comboCount || 88;
                const titleSize = Math.round((item.fontSize || 40) * s);
                const numSize = Math.round((item.numberFontSize || 64) * s);
                const subSize = Math.round((item.subtitleFontSize || 20) * s);
                const subtitle = item.subtitleText ? `<div style="font-size: ${subSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#fca5a5') : (item.subtitleColor || '#fca5a5')}; font-weight: bold; margin-top: ${Math.round(4 * s)}px; line-height: 1.2;">${escapeHtml(item.subtitleText)}</div>` : '';
                widgetHTML = `
                    <div class="gmd-combo-widget" style="background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, #0a0a14 100%)`)}; border: ${item.hideBg ? 'none' : `1.5px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : (item.barColor || '#ef4444')}`}; font-size: ${titleSize}px; border-radius: ${Math.round(24 * s)}px; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box; width: 100%; padding: ${Math.round(12 * s)}px; gap: ${Math.round(8 * s)}px; display: flex; align-items: center; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : '#ffffff'}; box-shadow: ${item.hideBg ? 'none' : `0 0 ${Math.round(12 * s)}px rgba(239, 68, 68, 0.2)`};">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; align-items: center; gap: ${Math.round(8 * s)}px; width: 100%;">
                            <div class="gmd-combo-num" style="font-size: ${numSize}px; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''}; font-weight: 900;">x${count}</div>
                            <div style="color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : ''}; font-weight: bold;">${escapeHtml(item.name) || 'COMBO ĐANG CHẠY!'}</div>
                            ${subtitle}
                        </div>
                    </div>
                `;
            } else if (item.type === 'goal-list') {
                const title = item.name || 'MỤC TIÊU HÔM NAY 🎯';
                const goals = Array.isArray(item.goals) ? item.goals : [];
                const footerText = item.footerText || '';
                const color = item.barColor || '#ff007f';
                const headerSize = Math.round((item.fontSize || 32) * s);
                const rowSize = Math.round((item.rowFontSize || 22) * s);
                const footerSize = Math.round((item.footerFontSize || 20) * s);
                widgetHTML = `
                    <div class="gmd-goal-list-widget" style="width:100%; height:100%; padding: ${Math.round(24 * s)}px; box-sizing: border-box; background: ${item.hideBg ? 'transparent' : (item.useCustomBg ? getTranslucentBg(item.bgColor) : `radial-gradient(circle at center, ${color}1a, #0a0a14)`)}; border: ${item.hideBg ? '1px solid transparent' : `1px solid ${item.useCustomBg ? getTranslucentBg(item.bgColor) : color}`}; border-radius: ${Math.round(24 * s)}px; display:flex; flex-direction:column; justify-content:center; box-shadow: ${item.hideBg ? 'none' : `0 0 ${Math.round(30 * s)}px ${color}26, 0 ${Math.round(8 * s)}px ${Math.round(32 * s)}px rgba(0,0,0,0.6)`};">
                        <div style="transform: translateY(${Math.round((item.contentOffsetY || 0) * s)}px); display: flex; flex-direction: column; gap: ${Math.round(14 * s)}px; width: 100%;">
                            <div class="gmd-goal-list-header" style="font-weight:900; color: ${item.useCustomTextColor ? (item.textColor || '#ffffff') : color}; text-shadow: 0 0 ${Math.round(10 * s)}px ${color}80; text-align:center; font-size: ${headerSize}px; margin-bottom: ${Math.round(6 * s)}px;">${escapeHtml(title)}</div>
                            <div class="gmd-goal-list-body" style="display:flex; flex-direction:column; gap: ${Math.round(12 * s)}px;">
                                ${goals.map(g => {
                                    const pct = Math.min(100, Math.round((g.current || 0) / (g.target || 1) * 100));
                                    const iconUrl = g.icon ? (g.icon.startsWith('http') ? g.icon : `${apiBase}${g.icon}`) : '';
                                    return `
                                        <div class="gmd-goal-list-row" style="display:flex; flex-direction:column; gap: ${Math.round(8 * s)}px; background:rgba(255,255,255,0.02); padding: ${Math.round(12 * s)}px ${Math.round(16 * s)}px; border-radius: ${Math.round(12 * s)}px;">
                                            <div class="gmd-goal-list-text-row" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                                <div style="display:flex; align-items:center; gap:${Math.round(8 * s)}px;">
                                                    ${iconUrl ? `<img class="gmd-goal-list-icon" src="${iconUrl}" style="width: ${Math.round(28 * s)}px; height: ${Math.round(28 * s)}px; border-radius:50%;" alt="">` : `<div style="font-size:${Math.round(20 * s)}px;">🎁</div>`}
                                                    ${item.showGiftName !== false ? `<span class="gmd-goal-list-label" style="font-size: ${rowSize}px; font-weight:800; color:${item.useCustomTextColor ? (item.textColor || '#cbd5e1') : '#e2e8f0'};">${escapeHtml(g.giftName) || 'Gift'}</span>` : ''}
                                                </div>
                                                <span class="gmd-goal-list-counts" style="font-size: ${rowSize}px; font-weight:800; color: ${item.barColor || '#38bdf8'}; text-shadow: 0 0 ${Math.round(10 * s)}px ${item.barColor || '#38bdf8'}80;">${g.current}/${g.target} (${pct}%)</span>
                                            </div>
                                            <div class="gmd-goal-list-bar-outer" style="width:100%; height: ${Math.round((item.barHeight !== undefined ? item.barHeight : 12) * s)}px; background:rgba(0,0,0,0.35); border-radius:99px; overflow:hidden; border: none; position:relative;">
                                                <div class="gmd-goal-list-bar-inner gmd-bar-style-${item.barStyle || 'solid'}" style="width:${pct}%; height:100%; --bar-color: ${item.barColor || '#38bdf8'}; --bar-glow: ${item.barColor || '#38bdf8'}; background:${item.barColor || '#38bdf8'}; border-radius:99px; box-shadow: 0 0 ${Math.round(12 * s)}px ${item.barColor || '#38bdf8'};"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${footerText ? `<div class="gmd-goal-list-footer" style="text-align:center; font-size: ${footerSize}px; color:#cbd5e1; font-weight:bold; margin-top: ${Math.round(6 * s)}px;">${escapeHtml(footerText)}</div>` : ''}
                        </div>
                    </div>
                `;
            } else if (item.type === 'text') {
                widgetHTML = `
                    <div class="gmd-text-widget" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:${item.color || '#ffffff'}; font-size:${Math.round((item.fontSize || 36) * s)}px; font-weight:${item.fontWeight || 'bold'}; text-shadow:${item.textShadow || 'none'}; text-align:${item.textAlign || 'center'}; font-family:inherit; line-height:1.2; word-break:break-word; pointer-events:none;">
                        ${escapeHtml(item.text) || 'Nhập văn bản'}
                    </div>
                `;
            }

            let finalVisualHTML = '';
            if (isWidget) {
                if (item.lockRatio) {
                    const scaleX = (item.w * sx) / refW;
                    const scaleY = (item.h * sy) / refH;
                    finalVisualHTML = `
                        <div class="gmd-visual-scaled-wrapper" style="width: ${refW}px; height: ${refH}px; transform: scale(${scaleX}, ${scaleY}); transform-origin: top left; position: absolute; top: 0; left: 0; pointer-events: none;">
                            ${widgetHTML}
                        </div>
                    `;
                } else {
                    finalVisualHTML = `
                        <div class="gmd-visual-scaled-wrapper" style="width: ${item.w}px; height: ${item.h}px; transform: scale(${sx}, ${sy}); transform-origin: top left; position: absolute; top: 0; left: 0; pointer-events: none;">
                            ${widgetHTML}
                        </div>
                    `;
                }
            } else {
                finalVisualHTML = widgetHTML;
            }

            if (!skipHTMLUpdate) {
                el.innerHTML = `
                    <div class="gmd-visual" style="width:100%; height:100%; position: relative; overflow: visible;">
                        ${finalVisualHTML}
                    </div>
                `;
            }
            
            stage.appendChild(el);
        });
    }

    // HTML escape helper
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    // Refresh layout on screen resize
    window.addEventListener('resize', render);

    // Initial boot
    loadLayout();
    connectWebSocket();
})();

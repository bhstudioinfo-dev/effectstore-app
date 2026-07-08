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
    let giftsLibrary = [];

    // Load gifts library
    async function loadGiftsLibrary() {
        try {
            const res = await fetch(`${apiBase}/api/tiktok/gifts-library`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    giftsLibrary = data;
                }
            }
        } catch (err) {
            console.error('Failed to load gifts library:', err);
        }
    }

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
                const isVideo = item.isWebM || (item.assetUrl && item.assetUrl.endsWith('.webm')) || (item.assetUrl && item.assetUrl.endsWith('.mp4'));
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
                    widgetHTML = window.MenuDesignerSharedRenderEngine && typeof window.MenuDesignerSharedRenderEngine.renderByType === 'function'
                        ? window.MenuDesignerSharedRenderEngine.renderByType(item, { mode: 'overlay', scale: 1, apiBase: apiBase, escapeText: true, gifts: giftsLibrary })
                        : '';
                }
            } else {
                // Determine layout-specific scale
                // For non-widget text, scale font size
                const renderScale = (item.type === 'text' || item.type === 'gift') ? s : 1;
                widgetHTML = window.MenuDesignerSharedRenderEngine && typeof window.MenuDesignerSharedRenderEngine.renderByType === 'function'
                    ? window.MenuDesignerSharedRenderEngine.renderByType(item, { mode: 'overlay', scale: renderScale, apiBase: apiBase, escapeText: true, gifts: giftsLibrary })
                    : '';
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
    loadGiftsLibrary().then(() => {
        loadLayout();
        connectWebSocket();
    });
})();

const express = require('express');
const router = express.Router();
const os = require('os');
const crypto = require('crypto');

// Mutable so a session reset (account switch) can rotate it — otherwise a
// remote phone that scanned a previous account's QR code would keep
// controlling this deck after that account logs out and a different one
// logs in on the same PC.
let remoteToken = crypto.randomBytes(24).toString('base64url');

// Store current control deck state in memory for remote phone UI
let currentControlDeckState = {
    effect: { slots: [] },
    sound: { slots: [] }
};
let deckRevision = 0;
let activeRemoteClients = new Map();

function getLocalLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function requireRemoteToken(req, res, next) {
    const supplied = String(req.get('x-remote-token') || req.query.token || '');
    const expected = Buffer.from(remoteToken);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return res.status(401).json({ success: false, error: 'Liên kết điều khiển đã hết hạn. Hãy quét lại mã QR trên PC.' });
    }
    next();
}

function requireLoopback(req, res, next) {
    const address = String(req.socket?.remoteAddress || '');
    if (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1') return next();
    return res.status(403).json({ success: false, error: 'Endpoint này chỉ dành cho ứng dụng LiveFlow trên PC.' });
}

function safeDeckType(value) {
    return ['effect', 'sound'].includes(value) ? value : '';
}

function assignDeckItem(indexValue, deckType, requestedItem) {
    const index = Number(indexValue);
    const type = safeDeckType(deckType);
    if (!type || !Number.isInteger(index) || index < 0 || index >= 20) throw new Error('Vị trí nút không hợp lệ.');
    const availableKey = type === 'effect' ? 'availableEffects' : 'availableSounds';
    const available = currentControlDeckState[availableKey] || [];
    const item = available.find((candidate) => String(candidate.id || candidate._id) === String(requestedItem?.id || requestedItem?._id));
    if (!item) throw new Error('Media không còn trong thư viện PC.');
    const slots = (currentControlDeckState[type]?.slots || []).filter(Boolean);
    const slot = type === 'effect'
        ? {
            id: `deck-${crypto.randomUUID()}`,
            effectId: String(item.id || item._id),
            index,
            type,
            name: item.name || 'Hiệu ứng',
            thumbUrl: (item.thumbUrl || (String(item.id || item._id).startsWith('custom-') ? `/custom-effects/${item.id || item._id}/thumbnail.png` : `/uploads/thumbs/${item.id || item._id}.png`)).replace(/^http:\/\/(127\.0\.0\.1|localhost):8080/i, ''),
            hotkey: '',
            volume: 1
        }
        : {
            ...item,
            id: `deck-sound-${crypto.randomUUID()}`,
            soundId: String(item.id),
            index,
            type,
            hotkey: '',
            volume: 1
        };
    currentControlDeckState[type] = {
        ...(currentControlDeckState[type] || {}),
        slots: [...slots.filter((candidate) => Number(candidate?.index) !== index), slot]
    };
    deckRevision += 1;
    return { item, slot, index, type };
}

// Invalidate the current remote-control session (token + deck state) so a
// phone that scanned a previous account's QR code loses access. The desktop
// app calls this on login/logout so Live Control never carries state across
// accounts sharing the same PC.
router.post('/reset-session', requireLoopback, (req, res) => {
    remoteToken = crypto.randomBytes(24).toString('base64url');
    currentControlDeckState = { effect: { slots: [] }, sound: { slots: [] } };
    activeRemoteClients = new Map();
    deckRevision += 1;
    res.json({ success: true, revision: deckRevision });
});

// Get Local LAN IP & QR info
router.get('/lan-info', requireLoopback, async (_req, res) => {
    try {
        const ip = getLocalLanIp();
        const port = process.env.PORT || 9000;
        const remoteUrl = `http://${ip}:${port}/remote/?token=${encodeURIComponent(remoteToken)}`;
        res.json({
            success: true,
            ip,
            port,
            remoteUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sync control deck state from desktop renderer app
router.post('/sync-deck', requireLoopback, async (req, res) => {
    try {
        const { deck } = req.body || {};
        if (deck && typeof deck === 'object') {
            currentControlDeckState = deck;
            deckRevision += 1;
        }
        res.json({ success: true, message: 'Control deck synced to remote', revision: deckRevision });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function cleanRemoteClients() {
    const now = Date.now();
    for (const [id, lastPing] of activeRemoteClients.entries()) {
        if (now - lastPing > 15000) activeRemoteClients.delete(id);
    }
}

router.get('/connection-status', requireLoopback, (_req, res) => {
    cleanRemoteClients();
    res.json({
        success: true,
        connectedClients: activeRemoteClients.size,
        revision: deckRevision,
        deck: currentControlDeckState
    });
});

// Get control deck state for mobile phone remote page
router.get('/deck-state', requireRemoteToken, async (req, res) => {
    try {
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        const deviceId = req.query.deviceId || clientIp;
        const now = Date.now();
        const isNew = !activeRemoteClients.has(deviceId);
        
        activeRemoteClients.set(deviceId, now);
        cleanRemoteClients();

        if (isNew) {
            const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
            if (typeof broadcastFn === 'function') {
                broadcastFn('remote_device_connected', { deviceId, clientIp, count: activeRemoteClients.size });
            }
        }

        res.json({
            success: true,
            deck: currentControlDeckState,
            revision: deckRevision,
            connectedClients: activeRemoteClients.size
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger a slot from mobile phone remote
router.post('/trigger', requireRemoteToken, async (req, res) => {
    try {
        const { slotId, deckType, action } = req.body || {};
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        
        if (typeof broadcastFn === 'function') {
            broadcastFn('control_deck_trigger', { slotId, deckType, action });
        }
        
        res.json({ success: true, message: 'Triggered from remote', slotId, action });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Assign a slot from mobile phone remote
router.post('/assign-slot', requireRemoteToken, async (req, res) => {
    try {
        const { index, deckType, item } = req.body || {};
        const assigned = assignDeckItem(index, deckType, item);
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        
        if (typeof broadcastFn === 'function') {
            broadcastFn('control_deck_assign', { index: assigned.index, deckType: assigned.type, item: assigned.item });
        }
        
        res.json({ success: true, message: 'Slot assigned from remote', slot: assigned.slot, revision: deckRevision });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;

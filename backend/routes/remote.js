const express = require('express');
const router = express.Router();
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const {
    MAX_EFFECT_BYTES,
    remoteUploadDir,
    saveRemoteSound
} = require('../services/remoteMediaService');

const remoteToken = crypto.randomBytes(24).toString('base64url');
const upload = multer({
    dest: remoteUploadDir,
    limits: { fileSize: MAX_EFFECT_BYTES, files: 1, fields: 4 }
});

// Store current control deck state in memory for remote phone UI
let currentControlDeckState = {
    effect: { slots: [] },
    sound: { slots: [] }
};
let deckRevision = 0;
// One effect player is shared by every remote phone.  Keep this guard on the
// server as well as in the phone UI so rapid taps (or multiple devices) cannot
// enqueue duplicate effect commands.
let activeRemoteEffect = null;
let activeRemoteEffectTimer = null;

function getEffectDurationMs(value) {
    const seconds = Number(value);
    // Most catalogue effects store duration in seconds.  Five seconds is the
    // established fallback for older deck slots that predate this field.
    return Math.max(1000, Math.min(120000, Math.round((Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000)));
}

function clearActiveRemoteEffect() {
    activeRemoteEffect = null;
    if (activeRemoteEffectTimer) clearTimeout(activeRemoteEffectTimer);
    activeRemoteEffectTimer = null;
}

function getActiveRemoteEffect() {
    if (activeRemoteEffect && activeRemoteEffect.expiresAt <= Date.now()) clearActiveRemoteEffect();
    return activeRemoteEffect;
}

function lockRemoteEffect(slot) {
    const durationMs = getEffectDurationMs(slot.duration);
    const token = crypto.randomUUID();
    activeRemoteEffect = {
        token,
        slotId: String(slot.id),
        name: String(slot.name || 'Hiệu ứng'),
        durationMs,
        expiresAt: Date.now() + durationMs
    };
    if (activeRemoteEffectTimer) clearTimeout(activeRemoteEffectTimer);
    // A very small grace period makes the lock cover final video/audio frames.
    activeRemoteEffectTimer = setTimeout(() => {
        if (activeRemoteEffect?.token === token) clearActiveRemoteEffect();
    }, durationMs + 250);
    return activeRemoteEffect;
}

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

function isRemoteVideoEffect(effect) {
    if (!effect || effect.isWheel || effect.isWidget || effect.isTemplate) return false;
    const type = String(effect.type || '').toLowerCase();
    const category = String(effect.category || '').toLowerCase();
    if (['wheel', 'widget', 'template', 'challenge-wheel', 'menu_template'].includes(type)) return false;
    if (['wheel', 'widget', 'template', 'challenge-wheel', 'menu_template'].includes(category)) return false;
    const id = String(effect.id || effect._id || '').toLowerCase();
    if (id.startsWith('wheel-') || id.startsWith('challenge-') || id.includes('wheel')) return false;
    const name = String(effect.name || effect.effectName || '').toLowerCase();
    return !name.includes('vòng quay') && !name.includes('wheel') && !name.includes('thử thách');
}

function sanitizeRemoteDeck(deck) {
    const value = deck && typeof deck === 'object' ? deck : {};
    return {
        ...value,
        availableEffects: (value.availableEffects || []).filter(isRemoteVideoEffect),
        availableVips: Array.isArray(value.availableVips) ? value.availableVips : []
    };
}

function assignDeckItem(indexValue, deckType, requestedItem) {
    const index = Number(indexValue);
    const type = safeDeckType(deckType);
    if (!type || !Number.isInteger(index) || index < 0 || index >= 20) throw new Error('Vị trí nút không hợp lệ.');

    // Support VIP honor items
    const isVip = Boolean(requestedItem?.isVip || requestedItem?.type === 'vip_honor' || requestedItem?.vipId);
    if (type === 'effect' && isVip) {
        const availableVips = currentControlDeckState.availableVips || [];
        const item = availableVips.find((candidate) => String(candidate.id || candidate.vipId) === String(requestedItem?.id || requestedItem?.vipId)) || requestedItem;
        const slots = (currentControlDeckState[type]?.slots || []).filter(Boolean);
        const slot = {
            id: `deck-vip-${crypto.randomUUID()}`,
            vipId: String(item.id || item.vipId || requestedItem?.id || requestedItem?.vipId || ''),
            effectId: String(item.effectId || requestedItem?.effectId || ''),
            index,
            type: 'vip_honor',
            name: item.name || `👑 ${item.displayName || item.username || 'VIP'}`,
            customAvatar: item.customAvatar || item.thumbUrl || '',
            thumbUrl: item.thumbUrl || item.customAvatar || '',
            hotkey: '',
            volume: 1,
            duration: 5
        };
        currentControlDeckState[type] = {
            ...(currentControlDeckState[type] || {}),
            slots: [...slots.filter((candidate) => Number(candidate?.index) !== index), slot]
        };
        deckRevision += 1;
        return { item, slot, index, type };
    }

    const availableKey = type === 'effect' ? 'availableEffects' : 'availableSounds';
    const available = currentControlDeckState[availableKey] || [];
    const item = available.find((candidate) => String(candidate.id || candidate._id) === String(requestedItem?.id || requestedItem?._id)) || (requestedItem?.id || requestedItem?._id ? requestedItem : null);
    if (!item) throw new Error('Media không còn trong thư viện PC.');
    if (type === 'effect' && !isRemoteVideoEffect(item)) throw new Error('LiveControl chỉ cho phép thêm hiệu ứng video.');
    const slots = (currentControlDeckState[type]?.slots || []).filter(Boolean);
    const slot = type === 'effect'
        ? {
            id: `deck-${crypto.randomUUID()}`,
            effectId: String(item.id || item._id),
            index,
            type,
            name: item.name || item.effectName || 'Hiệu ứng',
            thumbUrl: (item.thumbUrl || (String(item.id || item._id).startsWith('custom-') ? `/custom-effects/${item.id || item._id}/thumbnail.png` : `/uploads/thumbs/${item.id || item._id}.png`)).replace(/^http:\/\/(127\.0\.0\.1|localhost):8080/i, ''),
            hotkey: '',
            volume: 1,
            duration: Number(item.duration) > 0 ? Number(item.duration) : 5
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
            currentControlDeckState = sanitizeRemoteDeck(deck);
            const active = getActiveRemoteEffect();
            const existingSlots = currentControlDeckState.effect?.slots || [];
            if (active && !existingSlots.some((slot) => String(slot?.id) === active.slotId)) clearActiveRemoteEffect();
            deckRevision += 1;
        }
        res.json({ success: true, message: 'Control deck synced to remote', revision: deckRevision });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

let activeRemoteClients = new Map();

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
            connectedClients: activeRemoteClients.size,
            activeEffect: getActiveRemoteEffect()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger a slot from mobile phone remote
router.post('/trigger', requireRemoteToken, async (req, res) => {
    try {
        const { slotId, deckType, action } = req.body || {};
        const type = safeDeckType(deckType);
        if (action !== 'stop_all_sounds' && (!type || !slotId)) {
            return res.status(400).json({ success: false, error: 'Nút điều khiển không hợp lệ.' });
        }
        let activeEffect = null;
        if (type === 'effect') {
            const active = getActiveRemoteEffect();
            if (active) {
                return res.status(409).json({
                    success: false,
                    error: 'Hiệu ứng đang phát. Vui lòng chờ kết thúc rồi bấm tiếp.',
                    activeEffect: active,
                    retryAfterMs: Math.max(0, active.expiresAt - Date.now())
                });
            }
            const slot = (currentControlDeckState.effect?.slots || []).find((item) => String(item?.id) === String(slotId));
            if (!slot) return res.status(404).json({ success: false, error: 'Nút hiệu ứng không còn tồn tại.' });
            activeEffect = lockRemoteEffect(slot);
        }
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        
        if (typeof broadcastFn === 'function') {
            broadcastFn('control_deck_trigger', { slotId, deckType: type, action, activeEffect });
        }
        
        res.json({ success: true, message: 'Triggered from remote', slotId, action, activeEffect, durationMs: activeEffect?.durationMs || 0 });
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

router.post('/remove-slot', requireRemoteToken, async (req, res) => {
    try {
        const type = safeDeckType(req.body?.deckType);
        const slotId = String(req.body?.slotId || '').trim();
        if (!type || !slotId) throw new Error('Nút cần xóa không hợp lệ.');
        const slots = (currentControlDeckState[type]?.slots || []).filter(Boolean);
        const exists = slots.some((slot) => String(slot.id) === slotId);
        if (!exists) throw new Error('Nút không còn tồn tại.');
        currentControlDeckState[type] = {
            ...(currentControlDeckState[type] || {}),
            slots: slots.filter((slot) => String(slot.id) !== slotId)
        };
        deckRevision += 1;
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        if (typeof broadcastFn === 'function') broadcastFn('control_deck_remove', { slotId, deckType: type });
        res.json({ success: true, message: 'Đã xóa nút.', revision: deckRevision });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/upload/:deckType', requireRemoteToken, upload.single('media'), async (req, res) => {
    try {
        const type = safeDeckType(req.params.deckType);
        const index = Number(req.body?.index);
        if (!type || type === 'effect' || !Number.isInteger(index) || index < 0 || index >= 20 || !req.file) {
            throw new Error('File hoặc vị trí nút không hợp lệ.');
        }
        const item = await saveRemoteSound(req.file, req.body?.name);
        const availableKey = type === 'effect' ? 'availableEffects' : 'availableSounds';
        currentControlDeckState[availableKey] = [
            ...(currentControlDeckState[availableKey] || []).filter((candidate) => String(candidate.id) !== String(item.id)),
            item
        ];
        const assigned = assignDeckItem(index, type, item);
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        if (typeof broadcastFn === 'function') {
            broadcastFn('control_deck_media_uploaded', {
                index,
                deckType: type,
                item,
                slot: assigned.slot
            });
        }
        res.json({ success: true, item, slot: assigned.slot, revision: deckRevision });
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.rmSync(req.file.path, { force: true });
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const os = require('os');
const { authMiddleware } = require('../middleware/auth');

// Store current control deck state in memory for remote phone UI
let currentControlDeckState = {
    effect: { slots: [] },
    sound: { slots: [] }
};

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

// Get Local LAN IP & QR info
router.get('/lan-info', async (_req, res) => {
    try {
        const ip = getLocalLanIp();
        const port = process.env.PORT || 9000;
        const remoteUrl = `http://${ip}:${port}/remote`;
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
router.post('/sync-deck', async (req, res) => {
    try {
        const { deck } = req.body || {};
        if (deck && typeof deck === 'object') {
            currentControlDeckState = deck;
        }
        res.json({ success: true, message: 'Control deck synced to remote' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

let activeRemoteClients = new Map();

// Get control deck state for mobile phone remote page
router.get('/deck-state', async (req, res) => {
    try {
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        const deviceId = req.query.deviceId || clientIp;
        const now = Date.now();
        const isNew = !activeRemoteClients.has(deviceId);
        
        activeRemoteClients.set(deviceId, now);
        // Clean stale clients older than 15s
        for (const [id, lastPing] of activeRemoteClients.entries()) {
            if (now - lastPing > 15000) activeRemoteClients.delete(id);
        }

        if (isNew) {
            const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
            if (typeof broadcastFn === 'function') {
                broadcastFn('remote_device_connected', { deviceId, clientIp, count: activeRemoteClients.size });
            }
        }

        res.json({
            success: true,
            deck: currentControlDeckState,
            connectedClients: activeRemoteClients.size
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger a slot from mobile phone remote
router.post('/trigger', async (req, res) => {
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
router.post('/assign-slot', async (req, res) => {
    try {
        const { index, deckType, item } = req.body || {};
        const broadcastFn = req.app.locals?.broadcastToClients || req.app.get?.('broadcastToClients');
        
        if (typeof broadcastFn === 'function') {
            broadcastFn('control_deck_assign', { index, deckType, item });
        }
        
        res.json({ success: true, message: 'Slot assigned from remote', index, deckType });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./security');

const OVERLAY_ROLES = Object.freeze(['gift-menu', 'goal-board', 'effect-player']);

function getApiHost() {
    return String(process.env.API_HOST || '127.0.0.1').trim();
}

function getWebSocketHost() {
    return String(process.env.WS_HOST || getApiHost()).trim();
}

function getAllowedOrigins() {
    return new Set(String(process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean));
}

function isAllowedOrigin(origin) {
    if (!origin || origin === 'null') return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    if (origin.startsWith('file://') || origin.startsWith('vscode-file://')) return true;
    return getAllowedOrigins().has(origin);
}

function getOverlayAccessToken(role) {
    if (!OVERLAY_ROLES.includes(role)) throw new Error('Invalid overlay role.');
    return crypto.createHmac('sha256', getJwtSecret())
        .update(`effectstore-overlay:${role}:v1`)
        .digest('hex');
}

function verifyOverlayAccessToken(token) {
    const supplied = Buffer.from(String(token || ''));
    for (const role of OVERLAY_ROLES) {
        const expected = Buffer.from(getOverlayAccessToken(role));
        if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) return role;
    }
    return null;
}

function verifyUserSocketToken(token) {
    return jwt.verify(String(token || ''), getJwtSecret());
}

function securityHeaders(_req, res, next) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
}

module.exports = {
    OVERLAY_ROLES,
    getApiHost,
    getWebSocketHost,
    isAllowedOrigin,
    getOverlayAccessToken,
    verifyOverlayAccessToken,
    verifyUserSocketToken,
    securityHeaders
};

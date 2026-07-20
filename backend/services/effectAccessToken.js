const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

const EFFECT_ACCESS_PURPOSES = new Set([
    'library-playback',
    'catalog-preview',
    'effect-player-preview',
    'effect-player-test-mapping',
    'effect-player-live-mapping',
    'legacy-obs-effect'
]);

function issueEffectAccessToken({ effectId, userId, purpose, expiresIn = '5m' }) {
    if (!EFFECT_ACCESS_PURPOSES.has(purpose)) throw new Error('Invalid effect access purpose.');
    if (!String(effectId || '').trim()) throw new Error('effectId is required.');
    if (!String(userId || '').trim()) throw new Error('userId is required.');
    return jwt.sign(
        { effectId: String(effectId), userId: String(userId), purpose },
        getJwtSecret(),
        { expiresIn }
    );
}

function verifyEffectAccessToken(token, effectId, allowedPurposes = EFFECT_ACCESS_PURPOSES) {
    const payload = jwt.verify(String(token || ''), getJwtSecret());
    if (!allowedPurposes.has(payload.purpose)) throw new Error('Invalid effect access purpose.');
    if (String(payload.effectId) !== String(effectId)) throw new Error('Effect token does not match resource.');
    if (!String(payload.userId || '').trim()) throw new Error('Effect token is missing user identity.');
    return payload;
}

function buildEffectStreamUrl(effectId, token) {
    return `/api/stream/effect/${encodeURIComponent(effectId)}?token=${encodeURIComponent(token)}`;
}

module.exports = {
    EFFECT_ACCESS_PURPOSES,
    issueEffectAccessToken,
    verifyEffectAccessToken,
    buildEffectStreamUrl
};

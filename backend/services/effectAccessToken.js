const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');
const { getCloudPrivateKey, getCloudPublicKey } = require('./userToken');

const EFFECT_ACCESS_PURPOSES = new Set([
    'library-playback',
    'catalog-preview',
    'effect-player-preview',
    'effect-player-test-mapping',
    'effect-player-live-mapping',
    'legacy-obs-effect'
]);

function issueEffectAccessToken({ effectId, userId, purpose, expiresIn }) {
    if (!EFFECT_ACCESS_PURPOSES.has(purpose)) throw new Error('Invalid effect access purpose.');
    if (!String(effectId || '').trim()) throw new Error('effectId is required.');
    if (!String(userId || '').trim()) throw new Error('userId is required.');

    const defaultExpiry = (purpose === 'catalog-preview' || purpose === 'library-playback') ? '7d' : '10m';
    const duration = expiresIn || defaultExpiry;

    const payload = { effectId: String(effectId), userId: String(userId), purpose };
    const privateKey = getCloudPrivateKey();
    return privateKey
        ? jwt.sign(payload, privateKey, { expiresIn: duration, algorithm: 'RS256' })
        : jwt.sign(payload, getJwtSecret(), { expiresIn: duration, algorithm: 'HS256' });
}

function verifyEffectAccessToken(token, effectId, allowedPurposes = EFFECT_ACCESS_PURPOSES) {
    const encoded = String(token || '');
    const algorithm = jwt.decode(encoded, { complete: true })?.header?.alg;
    let payload;
    if (algorithm === 'RS256') {
        const publicKey = getCloudPublicKey();
        if (!publicKey) throw new Error('CLOUD_JWT_PUBLIC_KEY is required for cloud effect tokens.');
        payload = jwt.verify(encoded, publicKey, { algorithms: ['RS256'] });
    } else if (algorithm === 'HS256') {
        payload = jwt.verify(encoded, getJwtSecret(), { algorithms: ['HS256'] });
    } else {
        throw new Error('Unsupported effect token algorithm.');
    }
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

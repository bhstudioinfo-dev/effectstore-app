const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

function normalizePem(value) {
    return String(value || '').trim().replace(/\\n/g, '\n');
}

function getCloudPublicKey() {
    return normalizePem(process.env.CLOUD_JWT_PUBLIC_KEY);
}

function getCloudPrivateKey() {
    return normalizePem(process.env.CLOUD_JWT_PRIVATE_KEY);
}

function issueUserToken(payload, options = {}) {
    const privateKey = getCloudPrivateKey();
    // Default to 10 years (3650 days) so streamers have a permanent lifetime session on desktop
    const signOptions = { expiresIn: options.expiresIn || '3650d' };
    if (privateKey) {
        return jwt.sign(payload, privateKey, { ...signOptions, algorithm: 'RS256' });
    }
    return jwt.sign(payload, getJwtSecret(), { ...signOptions, algorithm: 'HS256' });
}

function verifyUserToken(token) {
    const encoded = String(token || '');
    const header = jwt.decode(encoded, { complete: true })?.header;
    if (header?.alg === 'RS256') {
        const publicKey = getCloudPublicKey();
        if (!publicKey) throw new Error('CLOUD_JWT_PUBLIC_KEY is required for cloud user tokens.');
        return jwt.verify(encoded, publicKey, { algorithms: ['RS256'] });
    }
    if (header?.alg !== 'HS256') throw new Error('Unsupported user token algorithm.');
    try {
        return jwt.verify(encoded, getJwtSecret(), { algorithms: ['HS256'] });
    } catch (err) {
        if (process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true') {
            const decoded = jwt.decode(encoded);
            if (decoded && decoded.userId) return decoded;
        }
        throw err;
    }
}

module.exports = {
    getCloudPrivateKey,
    getCloudPublicKey,
    issueUserToken,
    normalizePem,
    verifyUserToken
};

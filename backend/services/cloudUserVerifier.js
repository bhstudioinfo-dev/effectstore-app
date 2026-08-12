const crypto = require('crypto');
const { mirrorUserLocally } = require('./localUserMirror');

const CLOUD_API_URL = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
const CACHE_TTL_MS = 60_000;
const verifiedTokens = new Map();

function tokenCacheKey(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function verifyUserWithCloud(token) {
    if (!CLOUD_API_URL || !token) throw new Error('Cloud token verification is unavailable.');
    const key = tokenCacheKey(token);
    const cached = verifiedTokens.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.userId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(`${CLOUD_API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        const user = payload?.user;
        const userId = String(user?.id || user?._id || '').trim();
        if (!response.ok || !userId || !user?.email) {
            const error = new Error('Cloud rejected the user token.');
            error.code = 'CLOUD_TOKEN_REJECTED';
            throw error;
        }
        const mirrored = await mirrorUserLocally(user);
        if (!mirrored) {
            const error = new Error('Cloud user could not be mirrored locally.');
            error.code = 'CLOUD_USER_MIRROR_FAILED';
            throw error;
        }
        verifiedTokens.set(key, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
        return userId;
    } catch (error) {
        if (error?.code === 'CLOUD_TOKEN_REJECTED') throw error;
        const unavailable = new Error('Cloud authentication is temporarily unavailable.');
        unavailable.code = 'CLOUD_AUTH_UNAVAILABLE';
        unavailable.cause = error;
        throw unavailable;
    } finally {
        clearTimeout(timeout);
    }
}

function clearCloudUserVerificationCache() {
    verifiedTokens.clear();
}

module.exports = { clearCloudUserVerificationCache, tokenCacheKey, verifyUserWithCloud };

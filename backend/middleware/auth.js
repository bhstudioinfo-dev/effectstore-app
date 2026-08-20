const { verifyUserToken } = require('../services/userToken');
const User = require('../models/User');
const { rememberCloudSessionToken } = require('../services/cloudSessionTokenStore');
const { verifyUserWithCloud } = require('../services/cloudUserVerifier');
const { mirrorUserLocally } = require('../services/localUserMirror');
const { isAdminUser } = require('../config/security');

async function resolveUserIdFromToken(token) {
    try {
        const decoded = verifyUserToken(token);
        // In the managed Desktop product Render is the account authority.
        // A legacy local JWT can still pass the old local secret after a cloud
        // password reset, leaving the UI looking logged in while cloud writes
        // fail with "Invalid or expired token". Verify it centrally before
        // accepting it locally so stale sessions are forced back to login.
        if (process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true' && process.env.CLOUD_API_URL) {
            const userId = await verifyUserWithCloud(token);
            if (!userId) throw new Error('Cloud account token rejected');
            return { decoded: { ...decoded, userId }, verifiedByCloud: true };
        }
        return { decoded, verifiedByCloud: false };
    } catch (localError) {
        // During the HS256 -> RS256 migration, installed clients must never
        // receive the central shared secret. Ask the central /auth/me endpoint
        // to validate its own token instead, then mirror only the confirmed
        // user metadata locally. Fail closed when cloud rejects/unavailable.
        let userId = '';
        try {
            userId = await verifyUserWithCloud(token);
        } catch (cloudError) {
            if (cloudError?.code === 'CLOUD_AUTH_UNAVAILABLE') throw cloudError;
            throw localError;
        }
        if (!userId) throw localError;
        return { decoded: { userId }, verifiedByCloud: true };
    }
}

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const { decoded, verifiedByCloud } = await resolveUserIdFromToken(token);
        let user = await User.findById(decoded.userId).select('_id email isAdmin isActive subscription plan subscriptionExpiresAt usedCharactersThisMonth usedSystemVoiceCharactersThisMonth addonCharacters aiMonthKey aiAssistantConfig');
        if (!user && decoded.userId) {
            try {
                // A centrally signed token may verify locally while its User
                // document has not yet been mirrored to this installation.
                // Fetch the authoritative cloud profile before inventing any
                // local fallback identity.
                await verifyUserWithCloud(token);
                user = await User.findById(decoded.userId).select('_id email isAdmin isActive subscription plan subscriptionExpiresAt usedCharactersThisMonth usedSystemVoiceCharactersThisMonth addonCharacters aiMonthKey aiAssistantConfig');
            } catch (_e) {}
        }
        if (!user && decoded.userId) {
            const fallbackEmail = decoded.email || `${decoded.userId}@local.user`;
            await mirrorUserLocally({ id: decoded.userId, email: fallbackEmail, isAdmin: Boolean(decoded.isAdmin) });
            user = await User.findById(decoded.userId).select('_id email isAdmin isActive subscription plan subscriptionExpiresAt usedCharactersThisMonth usedSystemVoiceCharactersThisMonth addonCharacters aiMonthKey aiAssistantConfig');
        }
        if (!user || user.isActive === false) {
            console.warn(`[authMiddleware] rejected: decoded.userId=${decoded.userId} found=${Boolean(user)} isActive=${user?.isActive}`);
            return res.status(401).json({ error: 'Account is unavailable' });
        }
        req.userId = decoded.userId;
        req.user = user;
        req.isAdmin = isAdminUser(user);
        req.machineId = decoded.machineId || null;
        // The central RS256 bearer already lives in the signed-in renderer.
        // Rehydrate the local backend's RAM-only cloud session on every
        // authenticated request so a backend restart does not make purchased
        // effects unplayable until the user signs out and back in.
        const algorithm = require('jsonwebtoken').decode(token, { complete: true })?.header?.alg;
        if (algorithm === 'RS256' || verifiedByCloud) rememberCloudSessionToken(decoded.userId, token);
        next();
    } catch (error) {
        console.warn('[authMiddleware] token rejected:', error.message);
        if (error?.code === 'CLOUD_AUTH_UNAVAILABLE') {
            return res.status(503).json({
                success: false,
                retryable: true,
                error: 'Máy chủ tài khoản đang tạm thời chưa phản hồi. Vui lòng thử lại.'
            });
        }
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            req.userId = null;
            req.user = null;
            req.isAdmin = false;
            return next();
        }
        const { decoded, verifiedByCloud } = await resolveUserIdFromToken(token);
        let user = await User.findById(decoded.userId).select('_id email isAdmin isActive subscription plan subscriptionExpiresAt usedCharactersThisMonth usedSystemVoiceCharactersThisMonth addonCharacters aiMonthKey aiAssistantConfig');
        if (!user && decoded.userId) {
            try {
                const fallbackEmail = decoded.email || `${decoded.userId}@local.user`;
                await mirrorUserLocally({ id: decoded.userId, email: fallbackEmail, isAdmin: Boolean(decoded.isAdmin) });
                user = await User.findById(decoded.userId).select('_id email isAdmin isActive subscription plan subscriptionExpiresAt usedCharactersThisMonth usedSystemVoiceCharactersThisMonth addonCharacters aiMonthKey aiAssistantConfig');
            } catch (_e) {}
        }
        if (user && user.isActive !== false) {
            req.userId = decoded.userId;
            req.user = user;
            req.isAdmin = isAdminUser(user);
            req.machineId = decoded.machineId || null;
            const algorithm = require('jsonwebtoken').decode(token, { complete: true })?.header?.alg;
            if (algorithm === 'RS256' || verifiedByCloud) rememberCloudSessionToken(decoded.userId, token);
        } else if (decoded.userId) {
            req.userId = decoded.userId;
            req.user = { _id: decoded.userId, email: decoded.email || `${decoded.userId}@local.user`, isAdmin: Boolean(decoded.isAdmin) };
            req.isAdmin = Boolean(decoded.isAdmin);
        } else {
            req.userId = null;
            req.user = null;
            req.isAdmin = false;
        }
        next();
    } catch (_error) {
        req.userId = null;
        req.user = null;
        req.isAdmin = false;
        next();
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
};

module.exports = { authMiddleware, optionalAuthMiddleware, adminMiddleware };

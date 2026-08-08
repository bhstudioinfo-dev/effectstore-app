const { verifyUserToken } = require('../services/userToken');
const User = require('../models/User');
const { rememberCloudSessionToken } = require('../services/cloudSessionTokenStore');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const decoded = verifyUserToken(token);
        const user = await User.findById(decoded.userId).select('_id isAdmin isActive');
        if (!user || user.isActive === false) {
            return res.status(401).json({ error: 'Account is unavailable' });
        }
        req.userId = decoded.userId;
        req.isAdmin = user.isAdmin === true;
        req.machineId = decoded.machineId || null;
        // The central RS256 bearer already lives in the signed-in renderer.
        // Rehydrate the local backend's RAM-only cloud session on every
        // authenticated request so a backend restart does not make purchased
        // effects unplayable until the user signs out and back in.
        const algorithm = require('jsonwebtoken').decode(token, { complete: true })?.header?.alg;
        if (algorithm === 'RS256') rememberCloudSessionToken(decoded.userId, token);
        next();
    } catch (error) { res.status(401).json({ error: 'Invalid or expired token' }); }
};

const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            req.userId = null;
            req.isAdmin = false;
            return next();
        }
        const decoded = verifyUserToken(token);
        const user = await User.findById(decoded.userId).select('_id isAdmin isActive');
        if (user && user.isActive !== false) {
            req.userId = decoded.userId;
            req.isAdmin = user.isAdmin === true;
            req.machineId = decoded.machineId || null;
            const algorithm = require('jsonwebtoken').decode(token, { complete: true })?.header?.alg;
            if (algorithm === 'RS256') rememberCloudSessionToken(decoded.userId, token);
        } else {
            req.userId = null;
            req.isAdmin = false;
        }
        next();
    } catch (_error) {
        req.userId = null;
        req.isAdmin = false;
        next();
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
};

module.exports = { authMiddleware, optionalAuthMiddleware, adminMiddleware };

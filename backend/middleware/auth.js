const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const decoded = jwt.verify(token, getJwtSecret());
        const user = await User.findById(decoded.userId).select('_id isAdmin isActive');
        if (!user || user.isActive === false) {
            return res.status(401).json({ error: 'Account is unavailable' });
        }
        req.userId = decoded.userId;
        req.isAdmin = user.isAdmin === true;
        req.machineId = decoded.machineId || null;
        next();
    } catch (error) { res.status(401).json({ error: 'Invalid or expired token' }); }
};

const adminMiddleware = (req, res, next) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
};

module.exports = { authMiddleware, adminMiddleware };

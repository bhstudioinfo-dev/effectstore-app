function createRateLimiter({ windowMs, max, message }) {
    const attempts = new Map();

    return (req, res, next) => {
        const now = Date.now();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${email}`;
        const current = attempts.get(key);
        const entry = !current || current.resetAt <= now
            ? { count: 0, resetAt: now + windowMs }
            : current;

        entry.count += 1;
        attempts.set(key, entry);

        if (attempts.size > 10000) {
            for (const [storedKey, value] of attempts) {
                if (value.resetAt <= now) attempts.delete(storedKey);
            }
        }

        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > max) {
            res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ success: false, error: message });
        }

        next();
    };
}

module.exports = { createRateLimiter };

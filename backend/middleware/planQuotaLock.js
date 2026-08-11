const locks = new Map();

function acquireLock(key) {
    const previous = locks.get(key) || Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => { releaseCurrent = resolve; });
    const tail = previous.catch(() => {}).then(() => current);
    locks.set(key, tail);

    return previous.catch(() => {}).then(() => {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            releaseCurrent();
            if (locks.get(key) === tail) locks.delete(key);
        };
    });
}

function planQuotaLock(feature) {
    return async (req, res, next) => {
        const userId = String(req.userId || 'anonymous');
        const release = await acquireLock(`${userId}:${feature}`);
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            release();
        };
        res.once('finish', finish);
        res.once('close', finish);
        try {
            next();
        } catch (error) {
            finish();
            next(error);
        }
    };
}

module.exports = { acquireLock, planQuotaLock };

const assert = require('assert');
const jwt = require('jsonwebtoken');
const {
    getJwtSecret,
    isAdminUser,
    MIN_JWT_SECRET_LENGTH
} = require('../config/security');
const { createRateLimiter } = require('../middleware/rateLimit');
const { validateCredentials } = require('../routes/auth');

const originalJwtSecret = process.env.JWT_SECRET;

try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'your-secret-key';
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'x'.repeat(MIN_JWT_SECRET_LENGTH - 1);
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'test-only-secure-jwt-secret-value-123456789';
    const secret = getJwtSecret();
    const token = jwt.sign({ userId: 'user-1', isAdmin: false }, secret);
    assert.strictEqual(jwt.verify(token, secret).userId, 'user-1');

    assert.strictEqual(isAdminUser({ email: 'admin@effectstore.vn', isAdmin: false }), false);
    assert.strictEqual(isAdminUser({ email: 'person@example.com', isAdmin: true }), true);
    assert.strictEqual(isAdminUser({ hasAdminUI: true }), false);

    assert.strictEqual(validateCredentials(' USER@Example.com ', 'legacy6').normalizedEmail, 'user@example.com');
    assert.strictEqual(validateCredentials('not-an-email', 'password123').error, 'Email không hợp lệ.');
    assert.strictEqual(validateCredentials('user@example.com', 'short', true).error, 'Mật khẩu phải có từ 8 đến 128 ký tự.');
    assert.strictEqual(validateCredentials('user@example.com', 'strong-password', true).normalizedEmail, 'user@example.com');

    const limiter = createRateLimiter({ windowMs: 60000, max: 1, message: 'limited' });
    const headers = {};
    const req = { ip: '127.0.0.1', body: { email: 'test@example.com' } };
    const res = {
        setHeader(name, value) { headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
    let nextCalls = 0;
    limiter(req, res, () => { nextCalls += 1; });
    limiter(req, res, () => { nextCalls += 1; });
    assert.strictEqual(nextCalls, 1);
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.payload.error, 'limited');
    assert.strictEqual(headers['Retry-After'] !== undefined, true);
} finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
}

console.log('security tests passed');

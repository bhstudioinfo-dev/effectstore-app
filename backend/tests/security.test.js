const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
    getJwtSecret,
    isAdminUser,
    MIN_JWT_SECRET_LENGTH
} = require('../config/security');
const { createRateLimiter } = require('../middleware/rateLimit');
const { validateCredentials } = require('../routes/auth');
const { issueUserToken, verifyUserToken } = require('../services/userToken');

const originalJwtSecret = process.env.JWT_SECRET;
const originalCloudPrivateKey = process.env.CLOUD_JWT_PRIVATE_KEY;
const originalCloudPublicKey = process.env.CLOUD_JWT_PUBLIC_KEY;

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
    assert.strictEqual(verifyUserToken(issueUserToken({ userId: 'local-user' })).userId, 'local-user');
    assert.throws(() => verifyUserToken(jwt.sign({ userId: 'bad' }, secret, { algorithm: 'HS384' })), /Unsupported/);

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    process.env.CLOUD_JWT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
    process.env.CLOUD_JWT_PUBLIC_KEY = publicKey.replace(/\n/g, '\\n');
    const cloudToken = issueUserToken({ userId: 'cloud-user', isAdmin: false });
    assert.strictEqual(jwt.decode(cloudToken, { complete: true }).header.alg, 'RS256');
    assert.strictEqual(verifyUserToken(cloudToken).userId, 'cloud-user');
    delete process.env.CLOUD_JWT_PUBLIC_KEY;
    assert.throws(() => verifyUserToken(cloudToken), /CLOUD_JWT_PUBLIC_KEY/);

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
    if (originalCloudPrivateKey === undefined) delete process.env.CLOUD_JWT_PRIVATE_KEY;
    else process.env.CLOUD_JWT_PRIVATE_KEY = originalCloudPrivateKey;
    if (originalCloudPublicKey === undefined) delete process.env.CLOUD_JWT_PUBLIC_KEY;
    else process.env.CLOUD_JWT_PUBLIC_KEY = originalCloudPublicKey;
}

console.log('security tests passed');

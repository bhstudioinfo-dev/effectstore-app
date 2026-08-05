const assert = require('assert');
const jwt = require('jsonwebtoken');
const {
    getApiHost,
    getWebSocketHost,
    isAllowedOrigin,
    getOverlayAccessToken,
    verifyOverlayAccessToken,
    verifyUserSocketToken,
    securityHeaders
} = require('../config/networkSecurity');

const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    API_HOST: process.env.API_HOST,
    WS_HOST: process.env.WS_HOST,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS
};

try {
    process.env.JWT_SECRET = 'test-only-network-secret-value-123456789';
    delete process.env.API_HOST;
    delete process.env.WS_HOST;
    delete process.env.CORS_ALLOWED_ORIGINS;

    assert.strictEqual(getApiHost(), '0.0.0.0');
    assert.strictEqual(getWebSocketHost(), '0.0.0.0');

    process.env.API_HOST = '0.0.0.0';
    assert.strictEqual(getApiHost(), '0.0.0.0');
    assert.strictEqual(getWebSocketHost(), '0.0.0.0');
    process.env.WS_HOST = '127.0.0.1';
    assert.strictEqual(getWebSocketHost(), '127.0.0.1');

    assert.strictEqual(isAllowedOrigin(undefined), true);
    assert.strictEqual(isAllowedOrigin('null'), true);
    assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
    assert.strictEqual(isAllowedOrigin('https://127.0.0.1:8443'), true);
    assert.strictEqual(isAllowedOrigin('https://evil.example'), false);
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example, https://admin.example';
    assert.strictEqual(isAllowedOrigin('https://app.example'), true);
    assert.strictEqual(isAllowedOrigin('https://admin.example'), true);

    const giftToken = getOverlayAccessToken('gift-menu');
    const goalToken = getOverlayAccessToken('goal-board');
    assert.notStrictEqual(giftToken, goalToken);
    assert.strictEqual(verifyOverlayAccessToken(giftToken), 'gift-menu');
    assert.strictEqual(verifyOverlayAccessToken(goalToken), 'goal-board');
    assert.strictEqual(verifyOverlayAccessToken('invalid'), null);
    assert.throws(() => getOverlayAccessToken('unknown'), /Invalid overlay role/);

    const userToken = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET);
    assert.strictEqual(verifyUserSocketToken(userToken).userId, 'user-1');
    assert.throws(() => verifyUserSocketToken('invalid'));

    const headers = {};
    let nextCalled = false;
    securityHeaders({}, {
        setHeader(name, value) { headers[name] = value; }
    }, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.strictEqual(headers['Referrer-Policy'], 'no-referrer');
} finally {
    for (const [name, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
}

console.log('network security tests passed');

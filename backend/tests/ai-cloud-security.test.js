const assert = require('assert');
const fs = require('fs');
const path = require('path');

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'test-only-ai-secret-encryption-key-1234567890';

try {
    const secretService = require('../services/systemAiSecretService');
    const encrypted = secretService.encrypt('provider-key-that-must-remain-server-side');
    assert.notStrictEqual(encrypted.ciphertext, 'provider-key-that-must-remain-server-side');
    assert.strictEqual(secretService.decrypt(encrypted), 'provider-key-that-must-remain-server-side');

    const aiRoute = fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const desktop = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/home.js'), 'utf8');
    assert(aiRoute.includes("router.post('/admin/secrets', authMiddleware, adminMiddleware"));
    assert(aiRoute.includes("router.post('/speech', authMiddleware"));
    assert(aiRoute.includes('usedCharactersThisMonth: { $lte: usage.totalLimit - reservedCharacters }'));
    assert(server.indexOf("app.use('/api/ai', proxyToCloud)") < server.indexOf("app.use('/api/ai', require('./routes/ai'))"));
    assert(server.includes("app.post('/api/tiktok/ai-buy-addon', proxyToCloud)"));
    assert(!desktop.includes('xi-api-key'));
    assert(!desktop.includes('geminiApiKey'));
    assert(!desktop.includes('elevenLabsApiKey'));

    console.log('AI cloud security tests passed');
} finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
}

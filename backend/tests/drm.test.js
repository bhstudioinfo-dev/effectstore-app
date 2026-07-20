const assert = require('assert');
const {
    issueEffectAccessToken,
    verifyEffectAccessToken,
    buildEffectStreamUrl
} = require('../services/effectAccessToken');
const effectRoutes = require('../routes/effects');

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'test-only-secure-jwt-secret-value-123456789';

try {
    const effectId = '507f1f77bcf86cd799439011';
    const token = issueEffectAccessToken({
        effectId,
        userId: '507f191e810c19729de860ea',
        purpose: 'library-playback'
    });
    const payload = verifyEffectAccessToken(token, effectId);
    assert.strictEqual(payload.effectId, effectId);
    assert.strictEqual(payload.purpose, 'library-playback');
    assert.throws(() => verifyEffectAccessToken(token, '507f1f77bcf86cd799439012'), /does not match/);
    assert.throws(() => issueEffectAccessToken({ effectId, userId: 'user', purpose: 'unknown' }), /purpose/);

    const streamUrl = buildEffectStreamUrl(effectId, token);
    assert.ok(streamUrl.startsWith(`/api/stream/effect/${effectId}?token=`));
    assert.ok(!streamUrl.includes('previewFilePath'));

    const catalogEffect = effectRoutes.sanitizeEffectForCatalog({
        _id: effectId,
        name: 'Paid effect',
        category: 'overlay',
        fileUrl: '/api/stream/effect/internal',
        previewUrl: '/uploads/previews/full.webm',
        previewFilePath: 'C:\\private\\full.webm',
        encryptedFilePath: 'C:\\private\\full.enc',
        thumbFilePath: 'C:\\private\\thumb.png',
        fileSize: 123,
        timeline: { secret: true }
    });
    assert.strictEqual(catalogEffect.fileUrl, null);
    assert.strictEqual(catalogEffect.previewUrl, null);
    assert.strictEqual(catalogEffect.previewFilePath, undefined);
    assert.strictEqual(catalogEffect.encryptedFilePath, undefined);
    assert.strictEqual(catalogEffect.thumbFilePath, undefined);
    assert.strictEqual(catalogEffect.timeline, undefined);

    const protectedCatalogEffect = effectRoutes.sanitizeEffectForCatalog({
        _id: effectId,
        name: 'Paid effect',
        category: 'overlay',
        previewUrl: '/uploads/previews/full.webm'
    }, '507f191e810c19729de860ea');
    assert.ok(protectedCatalogEffect.previewUrl.startsWith(`/api/stream/effect/${effectId}?token=`));
    const catalogToken = new URL(`http://localhost${protectedCatalogEffect.previewUrl}`).searchParams.get('token');
    assert.strictEqual(verifyEffectAccessToken(catalogToken, effectId).purpose, 'catalog-preview');

    const templateEffect = effectRoutes.sanitizeEffectForCatalog({
        _id: effectId,
        category: 'menu_template',
        fileUrl: '507f1f77bcf86cd799439099',
        previewUrl: ''
    });
    assert.strictEqual(templateEffect.fileUrl, '507f1f77bcf86cd799439099');

    const streamLayer = effectRoutes.stack.find((layer) =>
        layer.route?.path === '/stream/effect/:effectId' && layer.route?.methods?.get
    );
    assert.ok(streamLayer, 'Protected stream route must exist');
    const middlewareNames = streamLayer.route.stack.map((layer) => layer.handle.name);
    assert.deepStrictEqual(middlewareNames, ['authorizeEffectStream', 'streamEffectById']);

    const authorizeEffectStream = streamLayer.route.stack[0].handle;
    const unauthorizedResponse = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
    let nextCalled = false;
    authorizeEffectStream(
        { params: { effectId }, query: {} },
        unauthorizedResponse,
        () => { nextCalled = true; }
    );
    assert.strictEqual(unauthorizedResponse.statusCode, 401);
    assert.strictEqual(unauthorizedResponse.payload.error, 'Invalid or expired effect token');
    assert.strictEqual(nextCalled, false);

    console.log('drm tests passed');
} finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
}

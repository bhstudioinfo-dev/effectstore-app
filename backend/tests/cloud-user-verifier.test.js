const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { tokenCacheKey } = require('../services/cloudUserVerifier');

assert.match(tokenCacheKey('central-token'), /^[a-f0-9]{64}$/);
assert.strictEqual(tokenCacheKey('central-token'), tokenCacheKey('central-token'));
assert.notStrictEqual(tokenCacheKey('central-token'), tokenCacheKey('other-token'));
assert.strictEqual(tokenCacheKey('central-token').includes('central-token'), false);

const verifierSource = fs.readFileSync(path.join(__dirname, '../services/cloudUserVerifier.js'), 'utf8');
const proxySource = fs.readFileSync(path.join(__dirname, '../middleware/cloudProxy.js'), 'utf8');
const localMirrorSource = fs.readFileSync(path.join(__dirname, '../services/localUserMirror.js'), 'utf8');
assert(verifierSource.includes('const mirrored = await mirrorUserLocally(user)'));
assert(verifierSource.includes("error.code = 'CLOUD_USER_MIRROR_FAILED'"));
assert(proxySource.indexOf('await mirrorUserLocally(parsed.user)') < proxySource.indexOf('res.send(text)'));
assert(proxySource.includes("req.originalUrl.split('?')[0] === '/api/user/effects'"));
assert(proxySource.includes('await verifyUserWithCloud(effectiveToken)'));
assert(verifierSource.includes('await User.exists({ _id: cached.userId })'));
assert(!localMirrorSource.includes("password: 'central-account-no-local-password',\n                    phone:"), 'mirror must not update phone in both $setOnInsert and $set');

const cloudProxy = require('../middleware/cloudProxy');
const originalRender = process.env.RENDER;
try {
    process.env.RENDER = 'true';
    assert.strictEqual(cloudProxy.isCentralCloudRuntime(), true);
    assert.strictEqual(cloudProxy.isCloudProxyEnabled(), false);
    delete process.env.RENDER;
    assert.strictEqual(cloudProxy.isCentralCloudRuntime(), false);
    assert.strictEqual(cloudProxy.isCloudProxyEnabled(), false);
} finally {
    if (originalRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = originalRender;
}

console.log('cloud user verifier tests passed');

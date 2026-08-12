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
assert(verifierSource.includes('const mirrored = await mirrorUserLocally(user)'));
assert(verifierSource.includes("error.code = 'CLOUD_USER_MIRROR_FAILED'"));
assert(proxySource.indexOf('await mirrorUserLocally(parsed.user)') < proxySource.indexOf('res.send(text)'));

console.log('cloud user verifier tests passed');

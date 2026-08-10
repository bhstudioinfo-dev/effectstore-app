const assert = require('assert');
const { tokenCacheKey } = require('../services/cloudUserVerifier');

assert.match(tokenCacheKey('central-token'), /^[a-f0-9]{64}$/);
assert.strictEqual(tokenCacheKey('central-token'), tokenCacheKey('central-token'));
assert.notStrictEqual(tokenCacheKey('central-token'), tokenCacheKey('other-token'));
assert.strictEqual(tokenCacheKey('central-token').includes('central-token'), false);

console.log('cloud user verifier tests passed');

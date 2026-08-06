const assert = require('assert');
const {
    clearCloudSessionTokens,
    forgetCloudSessionToken,
    getCloudSessionToken,
    rememberCloudSessionToken
} = require('../services/cloudSessionTokenStore');

clearCloudSessionTokens();
assert.strictEqual(rememberCloudSessionToken('', 'token'), false);
assert.strictEqual(rememberCloudSessionToken('user-1', ''), false);
assert.strictEqual(rememberCloudSessionToken('user-1', 'central-session-token'), true);
assert.strictEqual(getCloudSessionToken('user-1'), 'central-session-token');
forgetCloudSessionToken('user-1');
assert.strictEqual(getCloudSessionToken('user-1'), '');

console.log('cloud session token tests passed');

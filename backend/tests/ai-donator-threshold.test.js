const assert = require('assert');
const aiAssistantService = require('../services/aiAssistantService');
const tiktokService = require('../services/tiktokService');

assert.strictEqual(
    aiAssistantService.qualifiesForDonatorMode({ donatorOnly: false, minimumDonatorCoins: 10 }, { donatedCoins: 0 }),
    true
);
assert.strictEqual(
    aiAssistantService.qualifiesForDonatorMode({ donatorOnly: true, minimumDonatorCoins: 10 }, { donatedCoins: 9 }),
    false
);
assert.strictEqual(
    aiAssistantService.qualifiesForDonatorMode({ donatorOnly: true, minimumDonatorCoins: 10 }, { donatedCoins: 10 }),
    true
);

tiktokService.sessionDonatorCoins = new Map();
const viewer = { userId: 'viewer-1', uniqueId: 'friendly-viewer' };
assert.strictEqual(tiktokService.recordSessionGift({ ...viewer, diamondCount: 3, repeatCount: 2 }), 6);
assert.strictEqual(tiktokService.recordSessionGift({ ...viewer, diamondCount: 4, repeatCount: 1 }), 10);
assert.strictEqual(tiktokService.getSessionDonatorCoins(viewer), 10);
assert.strictEqual(tiktokService.getSessionDonatorCoins({ userId: 'viewer-2' }), 0);

console.log('AI donator threshold tests passed');

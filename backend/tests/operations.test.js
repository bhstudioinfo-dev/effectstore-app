const assert = require('assert');
const User = require('../models/User');
const Effect = require('../models/Effect');
const Payment = require('../models/Payment');
const GiftMapping = require('../models/GiftMapping');
const GiftMenuLayout = require('../models/GiftMenuLayout');
const GiftLog = require('../models/GiftLog');
const obsService = require('../services/obsService');
const tiktokService = require('../services/tiktokService');
const { keyForRelease } = require('../services/effectAssetStore');

function hasIndex(model, expected) {
    return model.schema.indexes().some(([fields]) => (
        Object.entries(expected).every(([name, direction]) => fields[name] === direction)
    ));
}

assert.strictEqual(hasIndex(User, { createdAt: -1 }), true);
assert.strictEqual(hasIndex(Effect, { isActive: 1, category: 1, uses: -1 }), true);
assert.strictEqual(hasIndex(Payment, { userId: 1, createdAt: -1 }), true);
assert.strictEqual(hasIndex(GiftMapping, { userId: 1, giftId: 1, isActive: 1 }), true);
assert.strictEqual(hasIndex(GiftMenuLayout, { userId: 1, isTemplate: 1, isActive: 1 }), true);
assert.strictEqual(hasIndex(GiftLog, { userId: 1, triggeredAt: -1 }), true);
assert.strictEqual(typeof obsService.shutdown, 'function');
assert.strictEqual(typeof tiktokService.shutdown, 'function');
assert.strictEqual(keyForRelease('stable', 'latest.yml'), 'updates/stable/latest.yml');
assert.throws(() => keyForRelease('../private', 'latest.yml'), /Invalid/);
assert.throws(() => keyForRelease('stable', '../secret'), /Invalid/);

console.log('operations tests passed');

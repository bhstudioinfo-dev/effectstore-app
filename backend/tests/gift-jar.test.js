const assert = require('assert');
const giftJarRoutes = require('../routes/giftJar');
const GiftJarSettings = require('../models/GiftJarSettings');

try {
    assert.strictEqual(typeof giftJarRoutes, 'function');
    assert.strictEqual(giftJarRoutes.stack.some((layer) => layer.route?.path === '/settings'), true);
    assert.strictEqual(giftJarRoutes.stack.some((layer) => layer.route?.path === '/upload-image'), true);
    assert.strictEqual(giftJarRoutes.stack.some((layer) => layer.route?.path === '/test-drop'), true);
    assert.strictEqual(giftJarRoutes.stack.some((layer) => layer.route?.path === '/reset-coins'), true);

    const schemaKeys = Object.keys(GiftJarSettings.schema.paths);
    assert.strictEqual(schemaKeys.includes('theme'), true);
    assert.strictEqual(schemaKeys.includes('customJarImageUrl'), true);
    assert.strictEqual(schemaKeys.includes('targetCoins'), true);
    assert.strictEqual(schemaKeys.includes('currentCoins'), true);
    assert.strictEqual(schemaKeys.includes('dropItemType'), true);

    console.log('gift-jar tests passed');
} catch (error) {
    console.error('gift-jar test failed:', error);
    process.exit(1);
}

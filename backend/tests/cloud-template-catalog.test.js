const assert = require('assert');

process.env.EFFECTSTORE_DESKTOP_MANAGED = 'true';
process.env.CLOUD_API_URL = 'https://central.example.test/';

const {
    isDesktopManagedBackend,
    resolveCloudAssetUrl,
    templateFields
} = require('../services/cloudTemplateCatalog');

assert.strictEqual(isDesktopManagedBackend(), true);
assert.strictEqual(resolveCloudAssetUrl('/uploads/frame.png'), 'https://central.example.test/uploads/frame.png');
assert.strictEqual(resolveCloudAssetUrl('https://cdn.example.test/frame.png'), 'https://cdn.example.test/frame.png');

const fields = templateFields({
    name: 'Template A',
    items: [{ id: 'one' }],
    exportedItems: [{ id: 'one-export' }],
    price: 199000,
    isPurchased: true,
    usedLayoutId: 'must-not-be-mirrored'
});
assert.strictEqual(fields.name, 'Template A');
assert.strictEqual(fields.price, 199000);
assert.strictEqual(fields.isTemplate, true);
assert.deepStrictEqual(fields.items, [{ id: 'one' }]);
assert.strictEqual(Object.hasOwn(fields, 'isPurchased'), false);
assert.strictEqual(Object.hasOwn(fields, 'usedLayoutId'), false);

console.log('cloud template catalog tests passed');

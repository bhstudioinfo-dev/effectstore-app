const assert = require('assert');
const {
    SUBSCRIPTION_PRODUCTS,
    normalizeEffectIds,
    effectiveEffectPrice
} = require('../services/paymentService');
const paymentRoutes = require('../routes/payment');

assert.deepStrictEqual(normalizeEffectIds([' a ', 'a', '', null, 'b']), ['a', 'b']);
assert.deepStrictEqual(normalizeEffectIds('not-an-array'), []);
assert.strictEqual(effectiveEffectPrice({ price: 100000 }), 100000);
assert.strictEqual(effectiveEffectPrice({
    price: 100000,
    isFlashSale: true,
    flashSalePrice: 75000,
    flashSaleEndsAt: new Date(Date.now() + 60000)
}), 75000);
assert.strictEqual(effectiveEffectPrice({
    price: 100000,
    isFlashSale: true,
    flashSalePrice: 75000,
    flashSaleEndsAt: new Date(Date.now() - 60000)
}), 100000);
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_PRO.amount, 199000);
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_BUSINESS.amount, 399000);

function middlewareNames(path, method) {
    const layer = paymentRoutes.stack.find((candidate) => candidate.route?.path === path && candidate.route?.methods?.[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} must exist`);
    return layer.route.stack.map((entry) => entry.handle.name);
}

assert.ok(middlewareNames('/create-qr', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/claim-free', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/confirm', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/status/:orderId', 'get').includes('authMiddleware'));
assert.ok(middlewareNames('/admin/approve', 'post').includes('adminMiddleware'));
assert.ok(middlewareNames('/admin/reject', 'post').includes('adminMiddleware'));

const orderIdA = paymentRoutes.createOrderId();
const orderIdB = paymentRoutes.createOrderId();
assert.match(orderIdA, /^DH[A-Z0-9]+$/);
assert.notStrictEqual(orderIdA, orderIdB);

const originalWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET;
delete process.env.SEPAY_WEBHOOK_SECRET;
const webhookLayer = paymentRoutes.stack.find((candidate) =>
    candidate.route?.path === '/sepay-webhook' && candidate.route?.methods?.post
);
const webhookHandler = webhookLayer.route.stack[0].handle;
const webhookResponse = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
};

webhookHandler({ headers: {}, body: {} }, webhookResponse)
    .then(() => {
        assert.strictEqual(webhookResponse.statusCode, 503);
        assert.strictEqual(webhookResponse.payload.success, false);
        console.log('payment tests passed');
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        if (originalWebhookSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET;
        else process.env.SEPAY_WEBHOOK_SECRET = originalWebhookSecret;
    });

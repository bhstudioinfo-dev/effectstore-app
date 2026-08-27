const assert = require('assert');
const {
    SUBSCRIPTION_PRODUCTS,
    normalizeEffectIds,
    effectiveEffectPrice,
    claimFreeEffects,
    grantPayment
} = require('../services/paymentService');
const User = require('../models/User');
const Effect = require('../models/Effect');
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
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_BASIC.amount, 199000);
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_PRO.amount, 399000);
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_BUSINESS.amount, 399000);
assert.strictEqual(SUBSCRIPTION_PRODUCTS.SUBSCRIPTION_BUSINESS.purchasable, false);

function middlewareNames(path, method) {
    const layer = paymentRoutes.stack.find((candidate) => candidate.route?.path === path && candidate.route?.methods?.[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} must exist`);
    return layer.route.stack.map((entry) => entry.handle.name);
}

assert.ok(middlewareNames('/create-qr', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/claim-free', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/confirm', 'post').includes('authMiddleware'));
assert.ok(middlewareNames('/status/:orderId', 'get').includes('authMiddleware'));
assert.ok(middlewareNames('/my-orders', 'get').includes('authMiddleware'));
assert.ok(middlewareNames('/admin/approve', 'post').includes('adminMiddleware'));
assert.ok(middlewareNames('/admin/reject', 'post').includes('adminMiddleware'));

const orderIdA = paymentRoutes.createOrderId();
const orderIdB = paymentRoutes.createOrderId();
assert.match(orderIdA, /^DH[A-Z0-9]+$/);
assert.notStrictEqual(orderIdA, orderIdB);

const originalWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET;
const originalAutoApproval = process.env.PAYMENT_AUTO_APPROVAL_ENABLED;
process.env.SEPAY_WEBHOOK_SECRET = 'configured-but-must-not-enable-automation';
process.env.PAYMENT_AUTO_APPROVAL_ENABLED = 'false';
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
    .then(async () => {
        assert.strictEqual(webhookResponse.statusCode, 503);
        assert.strictEqual(webhookResponse.payload.success, false);

        const originalFindById = User.findById;
        const fakeUser = {
            isActive: true,
            subscription: 'free',
            subscriptionExpiresAt: null,
            purchasedEffects: [],
            processedPaymentIds: [],
            addonCharacters: 0,
            totalSpent: 0,
            saveCount: 0,
            async save() { this.saveCount += 1; return this; }
        };
        User.findById = async () => fakeUser;
        try {
            const payment = {
                _id: '66aa00000000000000000001',
                userId: '66aa00000000000000000002',
                effectIds: ['SUBSCRIPTION_PRO', 'AI_ADDON_10K'],
                amount: 409000
            };
            const firstGrant = await grantPayment(payment);
            const firstExpiry = fakeUser.subscriptionExpiresAt.getTime();
            const duplicateGrant = await grantPayment(payment);
            assert.strictEqual(firstGrant.duplicate, false);
            assert.strictEqual(duplicateGrant.duplicate, true);
            assert.strictEqual(fakeUser.subscription, 'pro');
            assert.strictEqual(fakeUser.addonCharacters, 1000);
            assert.strictEqual(fakeUser.totalSpent, 409000);
            assert.strictEqual(fakeUser.subscriptionExpiresAt.getTime(), firstExpiry);
            assert.deepStrictEqual(fakeUser.processedPaymentIds, [payment._id]);
            assert.strictEqual(fakeUser.saveCount, 1);
        } finally {
            User.findById = originalFindById;
        }

        const originalEffectFind = Effect.find;
        const originalUpdateOne = User.updateOne;
        const originalExists = User.exists;
        const freeEffectId = '66aa00000000000000000003';
        let persisted = false;
        Effect.find = () => ({
            lean: async () => [{ _id: freeEffectId, price: 0, isActive: true }]
        });
        User.updateOne = async (filter) => {
            assert.strictEqual(String(filter._id), '66aa00000000000000000002');
            assert.deepStrictEqual(filter['purchasedEffects.effectId'], { $ne: freeEffectId });
            if (persisted) return { modifiedCount: 0 };
            persisted = true;
            return { modifiedCount: 1 };
        };
        User.exists = async () => persisted;
        try {
            const freeUser = { _id: '66aa00000000000000000002', purchasedEffects: [] };
            const firstClaim = await claimFreeEffects([freeEffectId], freeUser);
            const retryClaim = await claimFreeEffects([freeEffectId], freeUser);
            assert.deepStrictEqual(firstClaim.claimedIds, [freeEffectId]);
            assert.deepStrictEqual(firstClaim.alreadyOwnedIds, []);
            assert.deepStrictEqual(retryClaim.claimedIds, []);
            assert.deepStrictEqual(retryClaim.alreadyOwnedIds, [freeEffectId]);
        } finally {
            Effect.find = originalEffectFind;
            User.updateOne = originalUpdateOne;
            User.exists = originalExists;
        }
        console.log('payment tests passed');
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        if (originalWebhookSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET;
        else process.env.SEPAY_WEBHOOK_SECRET = originalWebhookSecret;
        if (originalAutoApproval === undefined) delete process.env.PAYMENT_AUTO_APPROVAL_ENABLED;
        else process.env.PAYMENT_AUTO_APPROVAL_ENABLED = originalAutoApproval;
    });

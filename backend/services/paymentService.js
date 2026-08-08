const Effect = require('../models/Effect');
const User = require('../models/User');
const mongoose = require('mongoose');

const SUBSCRIPTION_PRODUCTS = Object.freeze({
    SUBSCRIPTION_BASIC: Object.freeze({ plan: 'basic', amount: 199000 }),
    SUBSCRIPTION_PRO: Object.freeze({ plan: 'pro', amount: 399000 }),
    SUBSCRIPTION_BUSINESS: Object.freeze({ plan: 'business', amount: 399000 })
});

function normalizeEffectIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);
}

function effectiveEffectPrice(effect, now = Date.now()) {
    const regularPrice = Math.max(0, Number(effect?.price) || 0);
    const salePrice = Number(effect?.flashSalePrice);
    const saleEndsAt = effect?.flashSaleEndsAt ? new Date(effect.flashSaleEndsAt).getTime() : null;
    const saleIsActive = effect?.isFlashSale === true && Number.isFinite(salePrice) && salePrice >= 0 &&
        (!saleEndsAt || saleEndsAt > now);
    return saleIsActive ? salePrice : regularPrice;
}

async function calculateOrder(effectIds, user) {
    const ids = normalizeEffectIds(effectIds);
    if (ids.length === 0) throw Object.assign(new Error('Order must contain at least one item.'), { status: 400 });

    const subscriptionIds = ids.filter((id) => SUBSCRIPTION_PRODUCTS[id]);
    if (subscriptionIds.length > 0) {
        if (ids.length !== 1) throw Object.assign(new Error('Subscription cannot be combined with effects.'), { status: 400 });
        return { effectIds: ids, amount: SUBSCRIPTION_PRODUCTS[subscriptionIds[0]].amount };
    }

    if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) {
        throw Object.assign(new Error('Order contains an invalid effect ID.'), { status: 400 });
    }

    const effects = await Effect.find({ _id: { $in: ids }, isActive: true }).lean();
    if (effects.length !== ids.length) {
        throw Object.assign(new Error('One or more effects are unavailable.'), { status: 400 });
    }

    const ownedIds = new Set((user.purchasedEffects || []).map((item) => String(item.effectId?._id || item.effectId || '')));
    if (effects.some((effect) => ownedIds.has(String(effect._id)))) {
        throw Object.assign(new Error('Order contains an effect already owned by this account.'), { status: 409 });
    }

    const amount = effects.reduce((sum, effect) => sum + effectiveEffectPrice(effect), 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw Object.assign(new Error('Order amount is invalid.'), { status: 400 });
    }
    return { effectIds: ids, amount };
}

async function claimFreeEffects(effectIds, user) {
    const ids = normalizeEffectIds(effectIds);
    if (ids.length === 0) {
        throw Object.assign(new Error('Free claim must contain at least one item.'), { status: 400 });
    }
    if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) {
        throw Object.assign(new Error('Free claim contains an invalid effect ID.'), { status: 400 });
    }

    const effects = await Effect.find({ _id: { $in: ids }, isActive: true }).lean();
    if (effects.length !== ids.length) {
        throw Object.assign(new Error('One or more effects are unavailable.'), { status: 400 });
    }
    if (effects.some((effect) => effectiveEffectPrice(effect) !== 0)) {
        throw Object.assign(new Error('One or more effects require payment.'), { status: 400 });
    }

    const ownedIds = new Set((user.purchasedEffects || []).map((item) => String(item.effectId?._id || item.effectId || '')));
    const claimedIds = effects.map((effect) => String(effect._id)).filter((id) => !ownedIds.has(id));
    for (const effectId of claimedIds) {
        user.purchasedEffects.push({
            effectId,
            purchasedAt: new Date(),
            acquisitionType: 'free',
            acquisitionPrice: 0,
            useCount: 0
        });
    }
    if (claimedIds.length) await user.save();

    return { claimedIds, alreadyOwnedIds: ids.filter((id) => ownedIds.has(id)) };
}

async function grantPayment(payment) {
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(String(payment.userId || ''));
    const user = isObjectId ? await User.findById(payment.userId) : null;
    const paidEffectIds = (payment.effectIds || []).filter((itemId) => !SUBSCRIPTION_PRODUCTS[itemId] && !String(itemId).startsWith('AI_ADDON_') && /^[a-fA-F0-9]{24}$/.test(String(itemId)));
    const paidEffects = paidEffectIds.length
        ? await Effect.find({ _id: { $in: paidEffectIds } }).lean()
        : [];
    const paidEffectsById = new Map(paidEffects.map((effect) => [String(effect._id), effect]));

    for (const itemId of payment.effectIds) {
        if (itemId === 'AI_ADDON_10K') {
            const aiAssistantService = require('./aiAssistantService');
            aiAssistantService.addAddonCharacters(1000, user);
            continue;
        }
        if (itemId === 'AI_ADDON_50K') {
            const aiAssistantService = require('./aiAssistantService');
            aiAssistantService.addAddonCharacters(5500, user);
            continue;
        }
        if (itemId === 'AI_ADDON_100K') {
            const aiAssistantService = require('./aiAssistantService');
            aiAssistantService.addAddonCharacters(12000, user);
            continue;
        }
        if (!user) continue;
        const subscription = SUBSCRIPTION_PRODUCTS[itemId];
        if (subscription) {
            user.subscription = subscription.plan;
            const baseTime = user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
                ? user.subscriptionExpiresAt.getTime()
                : Date.now();
            user.subscriptionExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
            continue;
        }

        const exists = (user.purchasedEffects || []).some((entry) => String(entry.effectId) === String(itemId));
        if (!exists) {
            const effect = paidEffectsById.get(String(itemId));
            user.purchasedEffects = user.purchasedEffects || [];
            user.purchasedEffects.push({
                effectId: itemId,
                purchasedAt: new Date(),
                acquisitionType: 'paid',
                acquisitionPrice: effect ? effectiveEffectPrice(effect) : undefined,
                useCount: 0
            });
        }
    }

    if (user) {
        user.totalSpent = (user.totalSpent || 0) + Number(payment.amount || 0);
        await user.save();
    }
}

async function approvePayment(paymentId, allowedStatuses = ['pending']) {
    const payment = await require('../models/Payment').findOneAndUpdate(
        { _id: paymentId, status: { $in: allowedStatuses } },
        { $set: { status: 'processing' } },
        { new: true }
    );
    if (!payment) return null;

    try {
        await grantPayment(payment);
    } catch (error) {
        await require('../models/Payment').updateOne(
            { _id: payment._id, status: 'processing' },
            { $set: { status: 'pending' } }
        ).catch(() => null);
        throw error;
    }

    await require('../models/Payment').updateOne(
        { _id: payment._id, status: 'processing' },
        { $set: { status: 'approved' } }
    );
    payment.status = 'approved';
    return payment;
}

module.exports = {
    SUBSCRIPTION_PRODUCTS,
    normalizeEffectIds,
    effectiveEffectPrice,
    calculateOrder,
    claimFreeEffects,
    approvePayment
};

const Effect = require('../models/Effect');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const mongoose = require('mongoose');
const { normalizePlan } = require('../config/planEntitlements');

const SUBSCRIPTION_PRODUCTS = Object.freeze({
    SUBSCRIPTION_BASIC: Object.freeze({ plan: 'basic', amount: 199000 }),
    SUBSCRIPTION_PRO: Object.freeze({ plan: 'pro', amount: 399000 }),
    // Kept so historical pending orders can still be granted correctly.
    // New customers must use SUBSCRIPTION_PRO; Business is no longer sold.
    SUBSCRIPTION_BUSINESS: Object.freeze({ plan: 'business', amount: 399000, purchasable: false })
});

function normalizeEffectIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);
}

function effectiveEffectPrice(effect, userPlan = 'free', now = Date.now()) {
    const salePrice = Number(effect?.flashSalePrice);
    const saleEndsAt = effect?.flashSaleEndsAt ? new Date(effect.flashSaleEndsAt).getTime() : null;
    const saleIsActive = effect?.isFlashSale === true && Number.isFinite(salePrice) && salePrice >= 0 &&
        (!saleEndsAt || saleEndsAt > now);

    // Free effects remain 0
    if (Number(effect?.price) === 0) return 0;

    let basePrice;
    if (effect?.isExclusive) {
        basePrice = Math.max(0, Number(effect?.price) || 69000);
        if (userPlan === 'basic') basePrice = Math.round(basePrice * 0.7); // 30% off for Basic
        else if (['pro', 'business', 'studio', 'admin'].includes(userPlan)) basePrice = Math.round(basePrice * 0.5); // 50% off for Pro
    } else {
        // Standard trending effects: 30k for Free, 20k for Basic, 0 for Pro
        if (userPlan === 'basic') {
            basePrice = 20000;
        } else if (['pro', 'business', 'studio', 'admin'].includes(userPlan)) {
            basePrice = 0;
        } else {
            basePrice = 30000;
        }
    }

    if (saleIsActive && salePrice < basePrice) {
        return salePrice;
    }
    return basePrice;
}

async function calculateOrder(effectIds, user, promoCodeInput = null) {
    const ids = normalizeEffectIds(effectIds);
    if (ids.length === 0) throw Object.assign(new Error('Order must contain at least one item.'), { status: 400 });

    const subscriptionIds = ids.filter((id) => SUBSCRIPTION_PRODUCTS[id]);
    let baseAmount = 0;
    const userPlan = normalizePlan(user);

    if (subscriptionIds.length > 0) {
        if (ids.length !== 1) throw Object.assign(new Error('Subscription cannot be combined with effects.'), { status: 400 });
        const subscription = SUBSCRIPTION_PRODUCTS[subscriptionIds[0]];
        if (subscription.purchasable === false) {
            throw Object.assign(new Error('This legacy subscription is no longer available for purchase.'), { status: 410 });
        }
        baseAmount = subscription.amount;
    } else {
        if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) {
            throw Object.assign(new Error('Order contains an invalid effect ID.'), { status: 400 });
        }

        const effects = await Effect.find({ _id: { $in: ids }, isActive: true }).lean();
        if (effects.length !== ids.length) {
            throw Object.assign(new Error('One or more effects are unavailable.'), { status: 400 });
        }

        const ownedIds = new Set((user?.purchasedEffects || []).map((item) => String(item.effectId?._id || item.effectId || '')));
        if (effects.some((effect) => ownedIds.has(String(effect._id)))) {
            throw Object.assign(new Error('Order contains an effect already owned by this account.'), { status: 409 });
        }

        baseAmount = effects.reduce((sum, effect) => sum + effectiveEffectPrice(effect, userPlan), 0);
    }

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        throw Object.assign(new Error('Order amount is invalid.'), { status: 400 });
    }

    let discountAmount = 0;
    let validPromo = null;

    if (promoCodeInput) {
        const cleanCode = String(promoCodeInput).trim().toUpperCase();
        const promo = await PromoCode.findOne({ code: cleanCode, isActive: true });
        if (promo) {
            const now = new Date();
            const notExpired = !promo.expiresAt || new Date(promo.expiresAt) > now;
            const notExhausted = promo.maxUses === null || (promo.usedCount || 0) < promo.maxUses;
            const isSub = subscriptionIds.length > 0;
            const appliesCorrectly = promo.appliesTo === 'all' ||
                (promo.appliesTo === 'subscription' && isSub) ||
                (promo.appliesTo === 'effect' && !isSub);
            const meetsMinOrder = !promo.minOrderValue || baseAmount >= promo.minOrderValue;

            if (notExpired && notExhausted && appliesCorrectly && meetsMinOrder) {
                if (promo.discountType === 'percent') {
                    discountAmount = Math.round(baseAmount * (promo.discountValue / 100));
                } else {
                    discountAmount = Math.min(baseAmount, promo.discountValue);
                }
                validPromo = promo;
            }
        }
    }

    const finalAmount = Math.max(0, baseAmount - discountAmount);
    return {
        effectIds: ids,
        amount: finalAmount,
        originalAmount: baseAmount,
        discountAmount,
        promoCode: validPromo ? validPromo.code : null
    };
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

    const userId = user._id || user.id;
    const ownedIds = new Set((user.purchasedEffects || []).map((item) => String(item.effectId?._id || item.effectId || '')));
    if (!userId) throw Object.assign(new Error('Free claim account is unavailable.'), { status: 409 });

    // Persist each entitlement atomically. Never swallow a database error and
    // report success: the renderer must only celebrate after ownership truly
    // exists in the central User document. The $ne filter also makes retries
    // idempotent and prevents duplicate purchasedEffects entries.
    const claimedIds = [];
    const alreadyOwnedIds = ids.filter((id) => ownedIds.has(id));
    for (const effect of effects) {
        const effectId = String(effect._id);
        if (ownedIds.has(effectId)) continue;
        const purchase = {
            effectId,
            purchasedAt: new Date(),
            acquisitionType: 'free',
            acquisitionPrice: 0,
            useCount: 0
        };
        const result = await User.updateOne(
            { _id: userId, 'purchasedEffects.effectId': { $ne: effectId } },
            { $push: { purchasedEffects: purchase } }
        );
        if (result.modifiedCount === 1) {
            claimedIds.push(effectId);
            ownedIds.add(effectId);
        } else {
            const exists = await User.exists({ _id: userId, 'purchasedEffects.effectId': effectId });
            if (!exists) throw Object.assign(new Error('Unable to persist free effect ownership.'), { status: 500 });
            alreadyOwnedIds.push(effectId);
        }
    }

    return { claimedIds, alreadyOwnedIds };
}

async function grantPayment(payment) {
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(String(payment.userId || ''));
    const user = isObjectId ? await User.findById(payment.userId) : null;
    if (!user || user.isActive === false) {
        throw Object.assign(new Error('Payment account is unavailable.'), { status: 409 });
    }
    const paymentKey = String(payment._id || payment.orderId || '');
    user.processedPaymentIds = Array.isArray(user.processedPaymentIds) ? user.processedPaymentIds : [];
    if (paymentKey && user.processedPaymentIds.includes(paymentKey)) {
        return { duplicate: true, user };
    }
    const paidEffectIds = (payment.effectIds || []).filter((itemId) => !SUBSCRIPTION_PRODUCTS[itemId] && !String(itemId).startsWith('AI_ADDON_') && /^[a-fA-F0-9]{24}$/.test(String(itemId)));
    const paidEffects = paidEffectIds.length
        ? await Effect.find({ _id: { $in: paidEffectIds } }).lean()
        : [];
    const paidEffectsById = new Map(paidEffects.map((effect) => [String(effect._id), effect]));

    for (const itemId of payment.effectIds) {
        // Every branch below mutates a specific account's own document, so a
        // payment that never resolved to a real user (bad/missing userId)
        // must not grant anything — least of all AI_ADDON_*, which used to
        // skip this check and fall through to aiAssistantService's shared
        // no-user fallback file, silently pooling real character grants into
        // a bucket every account's usage widget can read from.
        if (itemId === 'AI_ADDON_10K') {
            user.addonCharacters = (user.addonCharacters || 0) + 1000;
            continue;
        }
        if (itemId === 'AI_ADDON_50K') {
            user.addonCharacters = (user.addonCharacters || 0) + 5500;
            continue;
        }
        if (itemId === 'AI_ADDON_100K') {
            user.addonCharacters = (user.addonCharacters || 0) + 12000;
            continue;
        }
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

    user.totalSpent = (user.totalSpent || 0) + Number(payment.amount || 0);
    if (paymentKey) user.processedPaymentIds.push(paymentKey);
    await user.save();
    return { duplicate: false, user };
}

async function approvePayment(paymentId, allowedStatuses = ['pending'], options = {}) {
    const Payment = require('../models/Payment');
    const now = new Date();
    const staleBefore = new Date(now.getTime() - Math.max(30_000, Number(options.processingTimeoutMs) || 120_000));
    const payment = await Payment.findOneAndUpdate(
        {
            _id: paymentId,
            $or: [
                { status: { $in: allowedStatuses } },
                { status: 'processing', processingStartedAt: { $lte: staleBefore } },
                { status: 'processing', processingStartedAt: { $exists: false } }
            ]
        },
        { $set: { status: 'processing', processingStartedAt: now } },
        { new: true }
    );
    if (!payment) {
        const existing = await Payment.findById(paymentId);
        if (!existing) return { outcome: 'not_found', payment: null };
        if (existing.status === 'approved') return { outcome: 'approved', duplicate: true, payment: existing };
        if (existing.status === 'processing') return { outcome: 'processing', payment: existing };
        return { outcome: 'conflict', payment: existing };
    }

    try {
        const grant = await grantPayment(payment);
        const approvedAt = new Date();
        const reviewFields = {
            status: 'approved',
            approvedAt,
            reviewedAt: approvedAt,
            ...(options.reviewedBy ? { reviewedBy: String(options.reviewedBy) } : {})
        };
        await Payment.updateOne(
            { _id: payment._id, status: 'processing' },
            { $set: reviewFields, $unset: { processingStartedAt: 1, rejectionReason: 1 } }
        );
        if (payment.promoCode) {
            try {
                await PromoCode.updateOne({ code: payment.promoCode }, { $inc: { usedCount: 1 } });
            } catch (_e) { }
        }
        payment.status = 'approved';
        return { outcome: 'approved', duplicate: grant.duplicate === true, payment };
    } catch (error) {
        await Payment.updateOne(
            { _id: payment._id, status: 'processing' },
            { $set: { status: 'pending' }, $unset: { processingStartedAt: 1 } }
        ).catch(() => null);
        throw error;
    }
}

async function recoverStalePayments(timeoutMs = 120_000) {
    const Payment = require('../models/Payment');
    const staleBefore = new Date(Date.now() - Math.max(30_000, Number(timeoutMs) || 120_000));
    const result = await Payment.updateMany(
        {
            status: 'processing',
            $or: [
                { processingStartedAt: { $lte: staleBefore } },
                { processingStartedAt: { $exists: false } }
            ]
        },
        { $set: { status: 'pending' }, $unset: { processingStartedAt: 1 } }
    );
    return Number(result.modifiedCount || 0);
}

module.exports = {
    SUBSCRIPTION_PRODUCTS,
    normalizeEffectIds,
    effectiveEffectPrice,
    calculateOrder,
    claimFreeEffects,
    approvePayment,
    grantPayment,
    recoverStalePayments
};

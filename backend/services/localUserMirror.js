// Keeps a local, offline-usable copy of just-enough account data (ownership,
// admin flag) for the routes that must stay 100% local for live-stream
// smoothness (OBS trigger, TikTok Live) and therefore check the LOCAL
// Mongo User model directly instead of going through the central server.
//
// Without this, a brand-new customer (whose account only exists on the
// central server) or a fresh purchase made through the central server would
// be invisible to those local-only routes — login/catalog would look fine,
// but triggering an owned effect during an actual stream would fail.
//
// Called opportunistically whenever a proxied /api/auth response already
// contains a user object (see middleware/cloudProxy.js) — best-effort, never
// blocks or fails the response being forwarded to the client.

const User = require('../models/User');

function normalizeSubscription(value) {
    if (value && typeof value === 'object') {
        return String(value.plan || value.key || value.name || 'free').toLowerCase();
    }
    return String(value || 'free').toLowerCase();
}

async function mirrorUserLocally(userPayload) {
    const id = String(userPayload?.id || userPayload?._id || '').trim();
    if (!id || !userPayload?.email) return false;

    try {
        const subscription = normalizeSubscription(userPayload.subscription || userPayload.plan);
        const subscriptionExpiresAt = userPayload.subscriptionExpiresAt
            || userPayload.subscription?.endDate
            || userPayload.subscription?.expiresAt
            || null;
        await User.findByIdAndUpdate(
            id,
            {
                $setOnInsert: {
                    _id: id,
                    password: 'central-account-no-local-password',
                    phone: userPayload.phone || ''
                },
                $set: {
                    email: userPayload.email,
                    name: userPayload.name || '',
                    phone: userPayload.phone || '',
                    isAdmin: Boolean(userPayload.isAdmin),
                    subscription,
                    subscriptionExpiresAt,
                    marketingConsent: Boolean(userPayload.marketingConsent),
                    purchasedEffects: Array.isArray(userPayload.purchasedEffects) ? userPayload.purchasedEffects : [],
                    isActive: true
                }
            },
            { upsert: true, setDefaultsOnInsert: true, runValidators: false }
        );
        return true;
    } catch (error) {
        console.warn('[local-user-mirror] failed:', error.message);
        return false;
    }
}

module.exports = { mirrorUserLocally, normalizeSubscription };

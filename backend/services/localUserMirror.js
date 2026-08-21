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
        const accountFields = {
            email: userPayload.email,
            name: userPayload.name || '',
            phone: userPayload.phone || '',
            isAdmin: Boolean(userPayload.isAdmin),
            subscription,
            subscriptionExpiresAt,
            marketingConsent: Boolean(userPayload.marketingConsent),
            isActive: true
        };
        // /api/auth/me intentionally does not always include a purchase list.
        // Do not erase the local entitlement mirror with an empty profile
        // response; /api/user/effects is the authoritative purchase payload.
        if (Array.isArray(userPayload.purchasedEffects) && userPayload.purchasedEffects.length > 0) {
            accountFields.purchasedEffects = userPayload.purchasedEffects;
        }
        await User.findByIdAndUpdate(
            id,
            {
                $setOnInsert: {
                    _id: id,
                    // The local record is never used to authenticate a central
                    // account.  It only keeps entitlement metadata for the
                    // latency-sensitive local OBS/TikTok routes.
                    password: 'central-account-no-local-password'
                },
                $set: accountFields
            },
            { upsert: true, setDefaultsOnInsert: true, runValidators: false }
        );
        return true;
    } catch (error) {
        console.warn('[local-user-mirror] failed:', error.message);
        return false;
    }
}

async function mirrorUserPurchasedEffectsLocally(userId, effectsList) {
    const id = String(userId || '').trim();
    if (!id || !Array.isArray(effectsList)) return false;

    try {
        const purchasedEffects = effectsList
            .filter((e) => !e?.isCustom && (e?._id || e?.id))
            .map((e) => ({
                effectId: String(e._id || e.id),
                purchasedAt: e.purchasedAt || new Date(),
                useCount: Number(e.useCount || 0)
            }));

        // /api/user/effects intentionally contains playable media only. A
        // menu template is still a Store product, so never erase its local
        // entitlement when refreshing the playable-effect library.
        const Effect = require('../models/Effect');
        const existingUser = await User.findById(id).select('purchasedEffects').lean().catch(() => null);
        const existingIds = (existingUser?.purchasedEffects || [])
            .map((entry) => String(entry?.effectId || ''))
            .filter(Boolean);
        const templateProducts = existingIds.length
            ? await Effect.find({ _id: { $in: existingIds }, category: 'menu_template' }).select('_id').lean().catch(() => [])
            : [];
        const incomingIds = new Set(purchasedEffects.map((entry) => String(entry.effectId)));
        for (const product of templateProducts) {
            const effectId = String(product._id);
            if (!incomingIds.has(effectId)) {
                purchasedEffects.push({ effectId, purchasedAt: new Date(), useCount: 0 });
                incomingIds.add(effectId);
            }
        }

        await User.findByIdAndUpdate(
            id,
            {
                $set: {
                    purchasedEffects,
                    isActive: true
                }
            },
            { upsert: false }
        );

        // Also upsert basic metadata into local Effect collection so local queries find it instantly
        for (const e of effectsList) {
            const effectId = String(e._id || e.id || '').trim();
            if (!effectId || e.isCustom) continue;
            await Effect.findByIdAndUpdate(
                effectId,
                {
                    $setOnInsert: { _id: effectId },
                    $set: {
                        name: e.name || 'Effect',
                        category: e.category || '',
                        price: Number(e.price) || 0,
                        duration: Number(e.duration) || 5,
                        icon: e.icon || '🎬',
                        thumbUrl: e.thumbUrl || '',
                        isActive: true
                    }
                },
                { upsert: true, setDefaultsOnInsert: true, runValidators: false }
            ).catch(() => {});
        }
        return true;
    } catch (error) {
        console.warn('[local-user-mirror-purchases] failed:', error.message);
        return false;
    }
}

module.exports = { mirrorUserLocally, mirrorUserPurchasedEffectsLocally, normalizeSubscription };

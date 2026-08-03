const Effect = require('../models/Effect');
const User = require('../models/User');
const { issueEffectAccessToken, buildEffectStreamUrl } = require('./effectAccessToken');

// The OBS/TikTok Live trigger path checks effect ownership against THIS
// machine's own local Effect model (it must stay local-only for stream
// smoothness — no network call while live). But an effect created or
// bought through the central server never lands in local Mongo on its own
// (see docs/COMMERCIAL_CLOUD_ROADMAP.md). So on a local lookup miss, fetch
// the bare catalog metadata once from the central server and cache it
// locally — from then on this effect resolves fully offline, same pattern
// already used for the encrypted video file itself.
async function mirrorEffectFromCentral(effectId) {
    const cloudApiUrl = String(process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
    if (!cloudApiUrl) return null;
    try {
        const response = await fetch(`${cloudApiUrl}/api/effects/item/${effectId}`);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data?.success || !data.effect) return null;
        const e = data.effect;
        await Effect.findByIdAndUpdate(
            effectId,
            {
                $setOnInsert: { _id: effectId },
                $set: {
                    name: e.name, category: e.category, price: e.price,
                    originalPrice: e.originalPrice, description: e.description,
                    icon: e.icon, isActive: e.isActive, isComposite: e.isComposite,
                    duration: e.duration, uses: e.uses, isTrending: e.isTrending,
                    isFlashSale: e.isFlashSale, flashSalePrice: e.flashSalePrice,
                    flashSaleEndsAt: e.flashSaleEndsAt, thumbUrl: e.thumbUrl
                }
            },
            { upsert: true, setDefaultsOnInsert: true, runValidators: false }
        );
        return await Effect.findById(effectId).lean().catch(() => null);
    } catch (_error) {
        return null;
    }
}

const CUSTOM_EFFECT_BASE_URL = 'http://127.0.0.1:8080/custom-effects';

function toEffectId(value) {
    return String(value || '').trim();
}

function toDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function isAdminUser(user) {
    return Boolean(user && user.isAdmin === true);
}

function normalizePurchasedEffect(effect, ownerId = null, isOwned = true) {
    if (!effect) return null;
    const id = toEffectId(effect._id || effect.id);
    if (!id) return null;

    return {
        id,
        _id: id,
        type: 'purchased',
        name: effect.name || 'Effect',
        fileUrl: `/api/stream/effect/${id}`,
        previewUrl: `/api/stream/effect/${id}`,
        thumbUrl: effect.thumbUrl || '',
        duration: toDuration(effect.duration),
        ownerId: ownerId ? toEffectId(ownerId) : null,
        isCustom: false,
        isOwned: Boolean(isOwned),
        icon: effect.icon || '🎬',
        category: effect.category || '',
        uses: Number(effect.uses || 0)
    };
}

function normalizeCustomEffect(customEffect, user) {
    if (!customEffect) return null;
    const id = toEffectId(customEffect.localId || customEffect.id);
    if (!id) return null;

    return {
        id,
        _id: id,
        type: 'custom',
        name: customEffect.name || 'Hiệu ứng cá nhân',
        fileUrl: `${CUSTOM_EFFECT_BASE_URL}/${id}/effect.webm`,
        previewUrl: `${CUSTOM_EFFECT_BASE_URL}/${id}/effect.webm`,
        thumbUrl: `${CUSTOM_EFFECT_BASE_URL}/${id}/thumbnail.png`,
        duration: toDuration(customEffect.duration),
        ownerId: toEffectId(user?._id || user?.id),
        isCustom: true,
        isOwned: true,
        icon: '🎬'
    };
}

function dedupeEffects(effects) {
    const seen = new Set();
    return effects.filter((effect) => {
        const id = toEffectId(effect?.id || effect?._id);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function addProtectedMediaUrl(effect, userId) {
    if (!effect || effect.isCustom) return effect;
    const effectId = toEffectId(effect.id || effect._id);
    const token = issueEffectAccessToken({
        effectId,
        userId,
        purpose: 'library-playback'
    });
    const protectedUrl = buildEffectStreamUrl(effectId, token);
    return { ...effect, fileUrl: protectedUrl, previewUrl: protectedUrl };
}

async function isCustomEffectMediaAvailable(effect, options = {}) {
    if (!effect?.isCustom) return true;
    const url = String(effect.fileUrl || '').trim();
    if (!url) return false;

    const fetchFn = options.fetchFn || global.fetch;
    if (typeof fetchFn !== 'function') return false;

    const timeoutMs = Math.max(250, Math.min(5000, Number(options.timeoutMs) || 1200));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    try {
        const response = await fetchFn(url, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal
        });
        return response?.ok === true;
    } catch (_error) {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function getUserRecord(userId) {
    if (!userId) return null;
    return User.findById(userId).populate('purchasedEffects.effectId').lean().catch(() => null);
}

async function getUserAvailableEffects(userId) {
    const user = await getUserRecord(userId);
    if (!user) return [];

    const purchased = [];
    if (isAdminUser(user)) {
        const allEffects = await Effect.find({ isActive: true, category: { $ne: 'menu_template' } }).sort({ uses: -1 }).lean().catch(() => []);
        purchased.push(...allEffects.map((effect) => normalizePurchasedEffect(effect, user._id, true)).filter(Boolean));
    } else {
        purchased.push(
            ...(user.purchasedEffects || [])
                .filter((item) => item?.effectId && item.effectId.category !== 'menu_template')
                .map((item) => normalizePurchasedEffect(item?.effectId, user._id, true))
                .filter(Boolean)
        );
    }

    const custom = (user.customEffects || [])
        .map((effect) => normalizeCustomEffect(effect, user))
        .filter(Boolean);

    return dedupeEffects([...custom, ...purchased]).map((effect) => addProtectedMediaUrl(effect, user._id));
}

async function resolveEffectForUser(userId, effectId) {
    const id = toEffectId(effectId);
    if (!id) return null;

    const user = await getUserRecord(userId);
    if (!user) return null;

    if (id.startsWith('custom-')) {
        const customEffect = (user.customEffects || []).find((item) => toEffectId(item.localId) === id);
        return customEffect ? normalizeCustomEffect(customEffect, user) : null;
    }

    if (isAdminUser(user)) {
        let effect = await Effect.findById(id).lean().catch(() => null);
        if (!effect) effect = await mirrorEffectFromCentral(id);
        if (effect && effect.category === 'menu_template') return null;
        return normalizePurchasedEffect(effect, user._id, true);
    }

    const purchased = (user.purchasedEffects || []).find((item) => {
        return toEffectId(item?.effectId?._id || item?.effectId) === id;
    });
    if (!purchased) return null;

    let purchasedEffect = purchased.effectId;
    if (!purchasedEffect || typeof purchasedEffect !== 'object' || !purchasedEffect.name) {
        purchasedEffect = await mirrorEffectFromCentral(id);
    }
    if (purchasedEffect?.category === 'menu_template') return null;
    return purchasedEffect ? normalizePurchasedEffect(purchasedEffect, user._id, true) : null;
}

async function resolveEffectDurationForUser(userId, effectId) {
    const effect = await resolveEffectForUser(userId, effectId);
    const normalizedDuration = toDuration(effect?.duration);
    if (normalizedDuration) return normalizedDuration;

    const id = toEffectId(effectId);
    if (!id) return null;

    if (id.startsWith('custom-')) {
        const user = await User.findById(userId).select('customEffects').lean().catch(() => null);
        const customEffect = (user?.customEffects || []).find((item) => toEffectId(item.localId) === id);
        return toDuration(customEffect?.duration);
    }

    const freshEffect = await Effect.findById(id).select('duration').lean().catch(() => null);
    return toDuration(freshEffect?.duration);
}

module.exports = {
    normalizePurchasedEffect,
    normalizeCustomEffect,
    isCustomEffectMediaAvailable,
    getUserAvailableEffects,
    resolveEffectForUser,
    resolveEffectDurationForUser
};

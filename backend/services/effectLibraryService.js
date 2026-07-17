const Effect = require('../models/Effect');
const User = require('../models/User');

const CUSTOM_EFFECT_BASE_URL = 'http://127.0.0.1:8080/custom-effects';

function toEffectId(value) {
    return String(value || '').trim();
}

function toDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function isAdminUser(user) {
    return !!(user && (user.isAdmin || user.hasAdminUI || user.email === 'admin@effectstore.vn'));
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
        fileUrl: effect.fileUrl || `/api/stream/effect/${id}`,
        previewUrl: effect.previewUrl || effect.fileUrl || `/api/stream/effect/${id}`,
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

    return dedupeEffects([...custom, ...purchased]);
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
        const effect = await Effect.findById(id).lean().catch(() => null);
        if (effect && effect.category === 'menu_template') return null;
        return normalizePurchasedEffect(effect, user._id, true);
    }

    const purchased = (user.purchasedEffects || []).find((item) => {
        return toEffectId(item?.effectId?._id || item?.effectId) === id;
    });

    if (purchased?.effectId?.category === 'menu_template') return null;
    return purchased ? normalizePurchasedEffect(purchased.effectId, user._id, true) : null;
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
    getUserAvailableEffects,
    resolveEffectForUser,
    resolveEffectDurationForUser
};

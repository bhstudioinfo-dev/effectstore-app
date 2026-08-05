const fs = require('fs');
const path = require('path');
const Effect = require('../models/Effect');
const User = require('../models/User');
const { issueEffectAccessToken, buildEffectStreamUrl } = require('./effectAccessToken');
const { paths: dataPaths } = require('../config/dataPaths');

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

function getCustomEffectBaseUrl() {
    const port = process.env.PORT || 9000;
    return `http://127.0.0.1:${port}/custom-effects`;
}

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

    let thumbUrl = effect.thumbUrl || '';
    if (!thumbUrl && id && dataPaths?.uploadsDir) {
        const thumbsDir = path.join(dataPaths.uploadsDir, 'thumbs');
        if (fs.existsSync(path.join(thumbsDir, `${id}.png`))) {
            thumbUrl = `/uploads/thumbs/${id}.png`;
        } else if (fs.existsSync(path.join(thumbsDir, `${id}_new.png`))) {
            thumbUrl = `/uploads/thumbs/${id}_new.png`;
        }
    }

    return {
        id,
        _id: id,
        type: 'purchased',
        name: effect.name || 'Effect',
        fileUrl: `/api/stream/effect/${id}`,
        previewUrl: `/api/stream/effect/${id}`,
        thumbUrl,
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

    const baseUrl = getCustomEffectBaseUrl();
    return {
        id,
        _id: id,
        type: 'custom',
        name: customEffect.name || 'Hiệu ứng cá nhân',
        fileUrl: `${baseUrl}/${id}/effect.webm`,
        previewUrl: `${baseUrl}/${id}/effect.webm`,
        thumbUrl: `${baseUrl}/${id}/thumbnail.png`,
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
    const id = toEffectId(effect.id || effect._id || effect.localId);
    if (id && dataPaths?.customEffectsDir) {
        const localPath = path.join(dataPaths.customEffectsDir, id, 'effect.webm');
        if (fs.existsSync(localPath)) {
            return true;
        }
    }

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
        let customEffect = (user.customEffects || []).find((item) => toEffectId(item.localId || item._id || item.id) === id);
        if (!customEffect) {
            customEffect = { localId: id, name: 'Hiệu ứng cá nhân' };
        }
        return normalizeCustomEffect(customEffect, user);
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
        const customEffect = (user?.customEffects || []).find((item) => toEffectId(item.localId || item._id || item.id) === id);
        const duration = toDuration(customEffect?.duration);
        if (duration) return duration;
        if (dataPaths?.customEffectsDir) {
            try {
                const metaPath = path.join(dataPaths.customEffectsDir, id, 'metadata.json');
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    const metaDuration = toDuration(meta?.duration);
                    if (metaDuration) return metaDuration;
                }
            } catch (_e) {}
        }
        return 15;
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

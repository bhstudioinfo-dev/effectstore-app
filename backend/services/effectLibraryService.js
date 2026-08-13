const fs = require('fs');
const path = require('path');
const Effect = require('../models/Effect');
const User = require('../models/User');
const { issueEffectAccessToken, buildEffectStreamUrl } = require('./effectAccessToken');
const { paths: dataPaths } = require('../config/dataPaths');
const { mirrorUserLocally } = require('./localUserMirror');
const { getEntitlements, upgradePayload } = require('../config/planEntitlements');

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

function effectiveEffectPrice(effect, now = Date.now()) {
    if (!effect) return 0;
    const regularPrice = Math.max(0, Number(effect.price) || 0);
    const salePrice = Number(effect.flashSalePrice);
    const saleEndsAt = effect.flashSaleEndsAt ? new Date(effect.flashSaleEndsAt).getTime() : null;
    const saleIsActive = effect.isFlashSale === true && Number.isFinite(salePrice) && salePrice >= 0 &&
        (!saleEndsAt || saleEndsAt > now);
    return saleIsActive ? salePrice : regularPrice;
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
    let user = await User.findById(userId).populate('purchasedEffects.effectId').lean().catch(() => null);
    if (!user || (user.purchasedEffects && user.purchasedEffects.length === 0)) {
        try {
            const { getCloudSessionToken, getAnyCloudSessionToken } = require('./cloudSessionTokenStore');
            const cloudToken = getCloudSessionToken(userId) || getAnyCloudSessionToken();
            const DEFAULT_CLOUD_API_URL = 'https://liveflow-backend-iafw.onrender.com';
            const cloudApiUrl = String(process.env.CLOUD_API_URL || DEFAULT_CLOUD_API_URL).trim().replace(/\/+$/, '');
            if (cloudToken && cloudApiUrl) {
                const res = await fetch(`${cloudApiUrl}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${cloudToken}` }
                });
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.success && data.user) {
                        const { mirrorUserLocally } = require('./localUserMirror');
                        await mirrorUserLocally(data.user);
                        user = await User.findById(userId).populate('purchasedEffects.effectId').lean().catch(() => null);
                    }
                }
            }
        } catch (_e) {}
    }
    if (!user) {
        user = {
            _id: String(userId),
            email: 'user@local',
            isAdmin: false,
            subscription: 'free',
            purchasedEffects: [],
            customEffects: []
        };
    }
    return user;
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

        // Include free / default effects for all users
        const freeEffects = await Effect.find({
            isActive: true,
            category: { $ne: 'menu_template' },
            $or: [{ isFree: true }, { price: 0 }, { isDefault: true }]
        }).sort({ uses: -1 }).lean().catch(() => []);
        if (freeEffects.length > 0) {
            purchased.push(...freeEffects.map((effect) => normalizePurchasedEffect(effect, user._id, true)).filter(Boolean));
        }

        // If user has no purchased or free query matches, fallback to all catalog effects (and seed from cloud if empty)
        if (purchased.length === 0) {
            let fallbackEffects = await Effect.find({ category: { $ne: 'menu_template' } }).lean().catch(() => []);
            if (fallbackEffects.length === 0) {
                const cloudApiUrl = String(process.env.CLOUD_API_URL || 'https://liveflow-backend-iafw.onrender.com').trim().replace(/\/+$/, '');
                try {
                    const cloudRes = await fetch(`${cloudApiUrl}/api/effects`);
                    if (cloudRes.ok) {
                        const cloudData = await cloudRes.json();
                        if (cloudData?.success && Array.isArray(cloudData.effects)) {
                            for (const e of cloudData.effects) {
                                if (e.category === 'menu_template') continue;
                                await Effect.findByIdAndUpdate(
                                    e._id || e.id,
                                    {
                                        $setOnInsert: { _id: e._id || e.id },
                                        $set: {
                                            name: e.name, category: e.category, price: e.price,
                                            icon: e.icon, isActive: e.isActive !== false,
                                            duration: e.duration || 5, thumbUrl: e.thumbUrl,
                                            previewUrl: e.previewUrl, fileUrl: e.fileUrl
                                        }
                                    },
                                    { upsert: true }
                                ).catch(() => {});
                            }
                            fallbackEffects = await Effect.find({ category: { $ne: 'menu_template' } }).lean().catch(() => []);
                        }
                    }
                } catch (_e) {}
            }
            purchased.push(...fallbackEffects.map((effect) => normalizePurchasedEffect(effect, user._id, true)).filter(Boolean));
        }
    }

    const custom = (user.customEffects || [])
        .map((effect) => normalizeCustomEffect(effect, user))
        .filter(Boolean);

    // Auto-discover local custom effects from disk
    if (dataPaths?.customEffectsDir && fs.existsSync(dataPaths.customEffectsDir)) {
        try {
            const dirs = fs.readdirSync(dataPaths.customEffectsDir, { withFileTypes: true });
            for (const d of dirs) {
                if (!d.isDirectory()) continue;
                const effectId = d.name;
                if (custom.some(c => c._id === effectId || c.id === effectId)) continue;
                const metaPath = path.join(dataPaths.customEffectsDir, effectId, 'metadata.json');
                if (fs.existsSync(metaPath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        custom.push(normalizeCustomEffect({
                            localId: effectId,
                            name: meta.name || 'Hiệu ứng cá nhân',
                            duration: meta.duration || 5,
                            fileUrl: meta.fileUrl || `/uploads/custom-effects/${effectId}/video.webm`,
                            thumbUrl: meta.thumbUrl || ''
                        }, user));
                    } catch (_e) {}
                }
            }
        } catch (_e) {}
    }

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
            // Effect files exist on disk (e.g. uploaded via the phone Live
            // Control remote, which never had a userId to register ownership
            // with) but were never added to this user's customEffects. Self-
            // heal it here from the on-disk metadata.json instead of only
            // ever returning a name-only stub with no duration — this is
            // exactly what made "Không đọc được thời lượng..." show up for
            // an effect that actually had a perfectly valid duration.
            let healedDuration = null;
            let healedName = 'Hiệu ứng cá nhân';
            if (dataPaths?.customEffectsDir) {
                try {
                    const metaPath = path.join(dataPaths.customEffectsDir, id, 'metadata.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        healedDuration = toDuration(meta?.duration);
                        if (meta?.name) healedName = String(meta.name);
                    }
                } catch (_e) {}
            }
            if (healedDuration) {
                await registerCustomEffectOwnership(userId, {
                    localId: id,
                    name: healedName,
                    duration: healedDuration,
                    machineId: 'auto-healed'
                }).catch(() => {});
            }
            customEffect = { localId: id, name: healedName, duration: healedDuration || undefined };
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
    if (!purchased) {
        let effect = await Effect.findById(id).lean().catch(() => null);
        if (!effect) effect = await mirrorEffectFromCentral(id);
        if (effect && effect.category !== 'menu_template') {
            return normalizePurchasedEffect(effect, user._id, true);
        }
        return null;
    }

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

// Registers lightweight custom-effect metadata (name/duration/machineId) onto
// a user's account. The actual media file always stays local disk-only; this
// only writes the small record that makes the effect show up as genuinely
// *owned* everywhere ownership is checked (not just wherever there's a
// disk-existence fallback). Shared by the desktop app's own upload-register
// call and the phone Live Control upload path.
async function registerCustomEffectOwnership(userId, { localId, name, duration, machineId }) {
    const rawDuration = Number(duration);
    if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
        return {
            success: false, status: 422, body: {
                success: false,
                warning: 'Custom effect metadata is missing a valid duration.',
                message: 'Không đọc được thời lượng video. Hiệu ứng chưa được lưu.'
            }
        };
    }
    const normalizedDuration = Math.max(0.1, Math.min(60, rawDuration));
    if (!/^custom-[a-zA-Z0-9-]+$/.test(localId || '') || !String(name || '').trim() || !String(machineId || '').trim()) {
        return { success: false, status: 400, body: { success: false, message: 'Thông tin hiệu ứng không hợp lệ.' } };
    }
    const user = await User.findById(userId);
    if (!user) return { success: false, status: 404, body: { success: false, message: 'Không tìm thấy tài khoản.' } };
    if (!Array.isArray(user.customEffects)) {
        user.customEffects = [];
        await User.updateOne({ _id: userId }, { $set: { customEffects: [] } });
    }
    const existing = user.customEffects.find((item) => item && item.localId === localId);
    if (!existing) {
        const entitlements = getEntitlements(user);
        if (!user.isAdmin && Number.isFinite(entitlements.customEffects) && user.customEffects.length >= entitlements.customEffects) {
            return {
                success: false, status: 403,
                body: upgradePayload('customEffects', `Bạn đã dùng hết ${entitlements.customEffects} hiệu ứng cá nhân của gói ${entitlements.label}.`, entitlements)
            };
        }
        const customEffect = { localId, name: String(name).trim().slice(0, 80), machineId, duration: normalizedDuration, createdAt: new Date() };
        const updateResult = await User.updateOne(
            { _id: userId, 'customEffects.localId': { $ne: localId } },
            { $push: { customEffects: customEffect } }
        );
        if (updateResult.modifiedCount > 0) user.customEffects.push(customEffect);
    } else {
        await User.updateOne(
            { _id: userId, 'customEffects.localId': localId },
            {
                $set: {
                    'customEffects.$.name': String(name).trim().slice(0, 80),
                    'customEffects.$.machineId': machineId,
                    'customEffects.$.duration': normalizedDuration
                }
            }
        );
    }
    const freshUser = await User.findById(userId).select('customEffects');
    return { success: true, count: Array.isArray(freshUser?.customEffects) ? freshUser.customEffects.length : user.customEffects.length };
}

module.exports = {
    normalizePurchasedEffect,
    normalizeCustomEffect,
    isCustomEffectMediaAvailable,
    getUserAvailableEffects,
    resolveEffectForUser,
    resolveEffectDurationForUser,
    registerCustomEffectOwnership
};

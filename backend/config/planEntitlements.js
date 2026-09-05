const PLAN_ENTITLEMENTS = Object.freeze({
    free: Object.freeze({
        key: 'free', label: 'Free', devices: 1, mappings: 5, customEffects: 5,
        layouts: 1, menuAssets: 0, goalTrackers: 1, commentsPerSession: 20,
        ttsPerSession: 10, designerLevel: 'lite', mappingAutomation: 'standard',
        storeEffectSlots: 0, defaultStoreEffectPrice: 30000, unlimitedStoreEffects: false,
        vipMapping: false
    }),
    basic: Object.freeze({
        key: 'basic', label: 'Basic', devices: 1, mappings: 30, customEffects: 100,
        // Basic gets 10 active store effect slots + 20k extra purchases
        layouts: 2, menuAssets: 20, goalTrackers: 10, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'basic', mappingAutomation: 'standard',
        storeEffectSlots: 10, defaultStoreEffectPrice: 20000, unlimitedStoreEffects: false,
        vipMapping: false
    }),
    pro: Object.freeze({
        key: 'pro', label: 'Pro', devices: 1, mappings: Infinity, customEffects: Infinity,
        layouts: Infinity, menuAssets: Infinity, goalTrackers: Infinity,
        commentsPerSession: Infinity, ttsPerSession: Infinity, designerLevel: 'advanced',
        mappingAutomation: 'advanced',
        storeEffectSlots: Infinity, defaultStoreEffectPrice: 0, unlimitedStoreEffects: true,
        vipMapping: true
    }),
    // Legacy account value retained only for existing customers/data migration.
    // It is NOT the current Pro product and must not be used to infer that Pro
    // owns paid Store templates or Challenge Wheel products.
    business: Object.freeze({
        key: 'business', label: 'Business (legacy)', devices: 1, mappings: Infinity, customEffects: Infinity,
        layouts: Infinity, menuAssets: Infinity, goalTrackers: Infinity,
        commentsPerSession: Infinity, ttsPerSession: Infinity, designerLevel: 'advanced',
        mappingAutomation: 'advanced',
        storeEffectSlots: Infinity, defaultStoreEffectPrice: 0, unlimitedStoreEffects: true,
        vipMapping: true
    }),
    studio: Object.freeze({
        key: 'studio', label: 'Studio', devices: Infinity, mappings: Infinity,
        customEffects: Infinity, layouts: Infinity, menuAssets: Infinity,
        goalTrackers: Infinity, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'studio',
        mappingAutomation: 'advanced',
        storeEffectSlots: Infinity, defaultStoreEffectPrice: 0, unlimitedStoreEffects: true,
        vipMapping: true
    }),
    admin: Object.freeze({
        key: 'admin', label: 'Admin', devices: Infinity, mappings: Infinity,
        customEffects: Infinity, layouts: Infinity, menuAssets: Infinity,
        goalTrackers: Infinity, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'studio',
        mappingAutomation: 'advanced',
        storeEffectSlots: Infinity, defaultStoreEffectPrice: 0, unlimitedStoreEffects: true,
        vipMapping: true
    })
});

function normalizePlan(user) {
    if (user?.isAdmin === true) return 'admin';
    if (user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now()) return 'free';
    const rawSubscription = user?.subscription || user?.plan || 'free';
    const key = String(
        rawSubscription && typeof rawSubscription === 'object'
            ? (rawSubscription.plan || rawSubscription.key || rawSubscription.name || 'free')
            : rawSubscription
    ).toLowerCase();
    if (key === 'basic') return 'basic';
    if (key === 'pro' || key === 'business') return key;
    if (key === 'studio') return 'studio';
    return PLAN_ENTITLEMENTS[key] ? key : 'free';
}

function getEntitlements(user) {
    return PLAN_ENTITLEMENTS[normalizePlan(user)];
}

function upgradePayload(feature, message, entitlements) {
    const recommendedPlan = entitlements?.key === 'free'
        ? 'basic'
        : (entitlements?.key === 'basic' ? 'pro' : 'studio');
    return {
        success: false,
        upgradeRequired: true,
        code: 'PLAN_LIMIT',
        feature,
        currentPlan: entitlements?.key || 'free',
        recommendedPlan,
        message
    };
}

// A packaged template-bundle (or gift-stack-group) hides its real widgets one
// level deep in `children`. Every type-based limit check must see those too,
// otherwise a free-plan user could bundle several gated widgets into one
// top-level item and bypass the per-plan cap entirely.
function flattenDesignerItems(items) {
    const list = Array.isArray(items) ? items : [];
    const flat = [];
    list.forEach((item) => {
        if (!item) return;
        flat.push(item);
        if (Array.isArray(item.children)) {
            item.children.forEach((child) => { if (child) flat.push(child); });
        }
    });
    return flat;
}

function countGoalTrackers(items) {
    const goalTypes = new Set([
        'goal-bar', 'goal-circle', 'boss-bar', 'mystery-chests',
        'goal-list', 'top-contributors', 'podium-contributors', 'combo'
    ]);
    return flattenDesignerItems(items).filter(item => goalTypes.has(item.type)).length;
}

function validateDesignerItems(items, entitlements) {
    const list = Array.isArray(items) ? items : [];
    const flatList = flattenDesignerItems(list);
    const exceedsFreeTalentLimit = entitlements.key === 'free' && list.some(item =>
        ['talent-live', 'talent-leaderboard'].includes(item?.type)
        && Array.isArray(item?.talentCompetition?.participants)
        && item.talentCompetition.participants.length > 3
    );
    if (exceedsFreeTalentLimit) {
        return upgradePayload(
            'talentParticipants',
            'Gói Free hỗ trợ tối đa 3 thí sinh. Nâng cấp Basic để thêm thí sinh thứ 4 trở đi.',
            entitlements
        );
    }

    const goalCount = countGoalTrackers(list);
    if (Number.isFinite(entitlements.goalTrackers) && goalCount > entitlements.goalTrackers) {
        return upgradePayload('goalTrackers', `Gói ${entitlements.label} chỉ hỗ trợ ${entitlements.goalTrackers} bảng mục tiêu.`, entitlements);
    }

    const hasCustomAsset = flatList.some(item => {
        const url = String(item?.assetUrl || item?.iconUrl || '');
        return item?.type === 'media-asset' || url.includes('/uploads/goal-assets/');
    });
    if (entitlements.menuAssets === 0 && hasCustomAsset) {
        return upgradePayload('menuAssets', 'Nâng cấp Basic để tải ảnh/video riêng vào menu.', entitlements);
    }

    if (entitlements.designerLevel === 'lite') {
        const hiddenLockedItem = list.find(item => item && (item.locked === true || item.visible === false));
        if (hiddenLockedItem) {
            const layerName = hiddenLockedItem.name || 'Lớp thiết kế';
            return upgradePayload(
                'menuAdvanced',
                `Lớp "${layerName}" đang dùng tính năng khóa/ẩn lớp — thuộc gói Basic. Nâng cấp để xuất thiết kế này sang OBS.`,
                entitlements
            );
        }
    }

    if (entitlements.designerLevel === 'lite') {
        const advancedTemplateItem = flatList.find(item => item && [
            'boss-bar', 'mystery-chests', 'goal-list',
            'top-contributors', 'podium-contributors', 'combo'
        ].includes(item.type));
        if (advancedTemplateItem) {
            const widgetLabels = {
                'boss-bar': 'Thanh đối kháng',
                'mystery-chests': 'Rương bí ẩn',
                'goal-list': 'Danh sách mục tiêu',
                'top-contributors': 'Top Supporters Board',
                'podium-contributors': 'Bảng xếp hạng',
                combo: 'Combo quà tặng'
            };
            const widgetName = widgetLabels[advancedTemplateItem.type] || advancedTemplateItem.name || 'Bảng nâng cao';
            return upgradePayload(
                'templates',
                `“${widgetName}” là bảng thuộc gói Basic. Bạn vẫn có thể dùng thử và tùy chỉnh trong trình thiết kế; nâng cấp Basic để xuất bảng này sang OBS.`,
                entitlements
            );
        }
        const colorItem = list.find(item => {
            if (!item) return false;
            if (item.type === 'goal-circle') return false;
            if (item.useCustomBg === true || item.useCustomTextColor === true) return true;
            if (item.barStyle && item.barStyle !== 'solid') return true;
            if (item.themeStyle && item.themeStyle !== 'default') return true;
            if (item.type === 'gift' && item.textColor && String(item.textColor).toLowerCase() !== '#f7cb64') return true;
            if (item.type === 'gift' && item.iconTextColor && String(item.iconTextColor).toLowerCase() !== '#ffffff') return true;
            if (item.type === 'goal-bar' && item.barColor && String(item.barColor).toLowerCase() !== '#ff007f') return true;
            if (item.type === 'goal-bar' && item.glowColor && !['rgba(255,0,127,0.5)', '#ff007f'].includes(String(item.glowColor).toLowerCase())) return true;
            if (item.titleColor && String(item.titleColor).toLowerCase() !== '#ffffff') return true;
            if (item.subtitleColor && String(item.subtitleColor).toLowerCase() !== '#cbd5e1') return true;
            return false;
        });
        if (colorItem) {
            const layerName = colorItem.name || 'Lớp thiết kế';
            return upgradePayload(
                'menuAdvanced',
                `Lớp "${layerName}" đang dùng màu sắc hoặc kiểu hiển thị tùy chỉnh — thuộc gói Basic. Nâng cấp để xuất thiết kế này sang OBS.`,
                entitlements
            );
        }
        const advancedItem = list.find(item => {
            if (!item) return false;
            const animation = String(item.animationType || 'None');
            const aura = String(item.auraType || 'None');
            return animation !== 'None' || aura !== 'None' || item.showTextBg === true ||
                item.panelEffect && item.panelEffect !== 'none' ||
                item.borderEffect && item.borderEffect !== 'none' ||
                item.type === 'gift-stack-group';
        });
        if (advancedItem) {
            const layerName = advancedItem.name || 'Lớp thiết kế';
            const animation = String(advancedItem.animationType || 'None');
            const aura = String(advancedItem.auraType || 'None');
            const reasons = [];
            if (animation !== 'None') reasons.push(`hiệu ứng động (${animation})`);
            if (aura !== 'None') reasons.push(`hào quang (${aura})`);
            if (advancedItem.panelEffect && advancedItem.panelEffect !== 'none') reasons.push('hiệu ứng nền panel');
            if (advancedItem.borderEffect && advancedItem.borderEffect !== 'none') reasons.push('hiệu ứng viền');
            if (advancedItem.showTextBg === true) reasons.push('nền chữ tùy chỉnh');
            if (advancedItem.type === 'gift-stack-group') reasons.push('nhóm quà xếp chồng');
            const reasonText = reasons.length ? reasons.join(', ') : 'tính năng nâng cao';
            return upgradePayload(
                'menuAdvanced',
                `Lớp "${layerName}" đang dùng ${reasonText} — thuộc gói Basic. Nâng cấp để xuất thiết kế này sang OBS.`,
                entitlements
            );
        }
    }

    return null;
}

function validateMappingAutomation(payload, entitlements) {
    if (entitlements?.mappingAutomation === 'advanced') return null;
    const effects = Array.isArray(payload?.effects) ? payload.effects.filter(effect => effect?.effectId) : [];
    const usesAdvanced = effects.length > 1 ||
        String(payload?.playbackMode || 'random') === 'sequential' ||
        Number(payload?.cooldown || 0) > 0 ||
        (Number(payload?.cooldown || 0) > 0 && String(payload?.cooldownAction || 'queue') === 'ignore');
    if (!usesAdvanced) return null;
    return {
        ...upgradePayload(
            'automationAdvanced',
            'Gộp nhiều hiệu ứng, chạy tuần tự và cooldown nâng cao dành cho gói Pro.',
            entitlements
        ),
        recommendedPlan: 'pro'
    };
}

module.exports = {
    PLAN_ENTITLEMENTS,
    normalizePlan,
    getEntitlements,
    upgradePayload,
    countGoalTrackers,
    validateDesignerItems,
    validateMappingAutomation
};

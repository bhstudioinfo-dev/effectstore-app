const PLAN_ENTITLEMENTS = Object.freeze({
    free: Object.freeze({
        key: 'free', label: 'Free', devices: 1, mappings: 5, customEffects: 5,
        layouts: 1, menuAssets: 0, goalTrackers: 1, commentsPerSession: 20,
        ttsPerSession: 10, designerLevel: 'lite'
    }),
    pro: Object.freeze({
        key: 'pro', label: 'Basic', devices: 1, mappings: 30, customEffects: 100,
        layouts: 10, menuAssets: 20, goalTrackers: 10, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'basic'
    }),
    business: Object.freeze({
        key: 'business', label: 'Pro', devices: 3, mappings: Infinity, customEffects: Infinity,
        layouts: Infinity, menuAssets: Infinity, goalTrackers: Infinity,
        commentsPerSession: Infinity, ttsPerSession: Infinity, designerLevel: 'advanced'
    }),
    studio: Object.freeze({
        key: 'studio', label: 'Studio', devices: Infinity, mappings: Infinity,
        customEffects: Infinity, layouts: Infinity, menuAssets: Infinity,
        goalTrackers: Infinity, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'studio'
    }),
    admin: Object.freeze({
        key: 'admin', label: 'Admin', devices: Infinity, mappings: Infinity,
        customEffects: Infinity, layouts: Infinity, menuAssets: Infinity,
        goalTrackers: Infinity, commentsPerSession: Infinity,
        ttsPerSession: Infinity, designerLevel: 'studio'
    })
});

function normalizePlan(user) {
    if (user && user.isAdmin === true) return 'admin';
    if (user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now()) return 'free';
    const key = String(user?.subscription || 'free').toLowerCase();
    return PLAN_ENTITLEMENTS[key] ? key : 'free';
}

function getEntitlements(user) {
    return PLAN_ENTITLEMENTS[normalizePlan(user)];
}

function upgradePayload(feature, message, entitlements) {
    const recommendedPlan = entitlements?.key === 'free'
        ? 'pro'
        : (entitlements?.key === 'pro' ? 'business' : 'studio');
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

function countGoalTrackers(items) {
    const goalTypes = new Set([
        'goal-bar', 'goal-circle', 'boss-bar', 'mystery-chests',
        'goal-list', 'top-contributors', 'podium-contributors', 'combo'
    ]);
    return Array.isArray(items) ? items.filter(item => item && goalTypes.has(item.type)).length : 0;
}

function validateDesignerItems(items, entitlements) {
    const list = Array.isArray(items) ? items : [];
    const goalCount = countGoalTrackers(list);
    if (Number.isFinite(entitlements.goalTrackers) && goalCount > entitlements.goalTrackers) {
        return upgradePayload('goalTrackers', `Gói ${entitlements.label} chỉ hỗ trợ ${entitlements.goalTrackers} bảng mục tiêu.`, entitlements);
    }

    const hasCustomAsset = list.some(item => {
        const url = String(item?.assetUrl || item?.iconUrl || '');
        return item?.type === 'media-asset' || url.includes('/uploads/goal-assets/');
    });
    if (entitlements.menuAssets === 0 && hasCustomAsset) {
        return upgradePayload('menuAssets', 'Nâng cấp Basic để tải ảnh/video riêng vào menu.', entitlements);
    }

    if (['lite', 'basic'].includes(entitlements.designerLevel)) {
        const usesAdvancedLayers = list.some(item => item && (
            item.type === 'gift-stack-group' || item.locked === true || item.visible === false
        ));
        if (usesAdvancedLayers) {
            return upgradePayload('menuAdvanced', 'Hệ thống lớp nâng cao dành cho gói Pro.', entitlements);
        }
    }

    if (entitlements.designerLevel === 'lite') {
        const usesAdvancedTemplateWidget = list.some(item => item && [
            'goal-circle', 'boss-bar', 'mystery-chests', 'goal-list',
            'top-contributors', 'podium-contributors', 'combo'
        ].includes(item.type));
        if (usesAdvancedTemplateWidget) {
            return upgradePayload('templates', 'Gói Free chỉ sử dụng mẫu mục tiêu cơ bản.', entitlements);
        }
        const changesColors = list.some(item => {
            if (!item) return false;
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
        if (changesColors) {
            return upgradePayload('menuAdvanced', 'Nâng cấp Basic để thay đổi màu sắc menu.', entitlements);
        }
        const usesAdvanced = list.some(item => {
            if (!item) return false;
            const animation = String(item.animationType || 'None');
            const aura = String(item.auraType || 'None');
            return animation !== 'None' || aura !== 'None' || item.showTextBg === true ||
                item.panelEffect && item.panelEffect !== 'none' ||
                item.borderEffect && item.borderEffect !== 'none' ||
                item.type === 'gift-stack-group';
        });
        if (usesAdvanced) {
            return upgradePayload('menuAdvanced', 'Nâng cấp Basic để dùng hiệu ứng động và menu quà tặng chuyên nghiệp.', entitlements);
        }
    }

    if (entitlements.designerLevel === 'basic') {
        const basicAnimations = new Set(['None', 'Pulse', 'Bounce', 'Float']);
        const basicAuras = new Set(['None', 'Glow']);
        const usesAdvanced = list.some(item => item && (
            !basicAnimations.has(String(item.animationType || 'None')) ||
            !basicAuras.has(String(item.auraType || 'None')) ||
            (item.panelEffect && !['none', 'breathing'].includes(item.panelEffect)) ||
            (item.borderEffect && !['none', 'glow', 'pulse'].includes(item.borderEffect))
        ));
        if (usesAdvanced) {
            return upgradePayload('menuAdvanced', 'Tính năng chuyển động cao cấp dành cho gói Pro.', entitlements);
        }
    }
    return null;
}

module.exports = {
    PLAN_ENTITLEMENTS,
    normalizePlan,
    getEntitlements,
    upgradePayload,
    countGoalTrackers,
    validateDesignerItems
};

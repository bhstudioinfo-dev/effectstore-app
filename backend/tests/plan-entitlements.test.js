const assert = require('assert');
const {
    PLAN_ENTITLEMENTS,
    getEntitlements,
    validateDesignerItems,
    validateMappingAutomation,
    upgradePayload
} = require('../config/planEntitlements');

const free = getEntitlements({ subscription: 'free' });
const basic = getEntitlements({ subscription: 'basic' });
const pro = getEntitlements({ subscription: 'pro' });
const expired = getEntitlements({ subscription: 'business', subscriptionExpiresAt: new Date(Date.now() - 1000) });

assert.strictEqual(free.mappings, 5);
assert.strictEqual(free.layouts, 1);
assert.strictEqual(free.commentsPerSession, 20);
assert.strictEqual(free.ttsPerSession, 10);
assert.strictEqual(basic.mappings, 30);
assert.strictEqual(basic.layouts, 10);
assert.strictEqual(basic.menuAssets, 20);
assert.strictEqual(basic.goalTrackers, 10);
assert.strictEqual(pro.devices, 1);
assert.strictEqual(pro.mappings, Infinity);
assert.strictEqual(expired.key, 'free');
assert.strictEqual(upgradePayload('mappings', 'x', free).recommendedPlan, 'pro');
assert.strictEqual(upgradePayload('menuAdvanced', 'x', basic).recommendedPlan, 'pro');
assert.strictEqual(PLAN_ENTITLEMENTS.studio.devices, Infinity);

assert.strictEqual(validateDesignerItems([{ type: 'goal-bar', animationType: 'None' }], free), null);
assert.strictEqual(validateDesignerItems([{ type: 'goal-bar', barColor: '#ff007f', glowColor: 'rgba(255,0,127,0.5)', themeStyle: 'default', titleColor: '#ffffff', subtitleColor: '#cbd5e1' }], free), null);
assert.strictEqual(validateDesignerItems([
    { type: 'goal-bar' },
    { type: 'goal-bar' }
], free).feature, 'goalTrackers');
assert.strictEqual(validateDesignerItems([{ type: 'media-asset', assetUrl: '/uploads/goal-assets/u/a.png' }], free).feature, 'menuAssets');
assert.strictEqual(validateDesignerItems([{ type: 'gift', auraType: 'Glow' }], free).feature, 'menuAdvanced');
assert.strictEqual(validateDesignerItems([{ type: 'gift', textColor: '#00ff00' }], free).feature, 'menuAdvanced');
assert.strictEqual(validateDesignerItems([{ type: 'goal-circle' }], free), null);
assert.strictEqual(validateDesignerItems([{
    type: 'goal-circle',
    useCustomBg: true,
    useCustomTextColor: true,
    progressShape: 'star',
    progressEffect: 'rainbow',
    useBarGradient: true,
    progressSize: 180,
    goalIconSize: 90
}], free), null);
const advancedBoardTrial = validateDesignerItems([{ type: 'boss-bar' }], free);
assert.strictEqual(advancedBoardTrial.feature, 'templates');
assert.match(advancedBoardTrial.message, /Thanh đối kháng/);
assert.match(advancedBoardTrial.message, /lưu và xuất/);
assert.strictEqual(validateDesignerItems([{
    type: 'talent-live',
    talentCompetition: { participants: [{}, {}, {}] }
}], free), null);
assert.strictEqual(validateDesignerItems([{
    type: 'talent-live',
    talentCompetition: { participants: [{}, {}, {}, {}] }
}], free).feature, 'talentParticipants');
assert.strictEqual(validateDesignerItems([{
    type: 'talent-live',
    talentCompetition: { participants: [{}, {}, {}, {}] }
}], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Shake' }], basic).feature, 'menuAdvanced');
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Pulse', auraType: 'Glow' }], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift-stack-group', children: [] }], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift-stack-group', children: [], locked: true }], basic).feature, 'menuAdvanced');
assert.strictEqual(validateDesignerItems(Array.from({ length: 11 }, () => ({ type: 'goal-bar' })), basic).feature, 'goalTrackers');
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Shake', auraType: 'Electric Aura' }], pro), null);
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }] }, free), null);
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }, { effectId: 'b' }] }, basic).feature, 'automationAdvanced');
assert.strictEqual(validateMappingAutomation({ playbackMode: 'sequential' }, basic).recommendedPlan, 'business');
assert.strictEqual(validateMappingAutomation({ cooldown: 5, cooldownAction: 'ignore' }, basic).feature, 'automationAdvanced');
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }, { effectId: 'b' }], cooldown: 5 }, pro), null);

const tiktokService = require('../services/tiktokService');
tiktokService.currentLiveUserId = 'free-user';
tiktokService.liveEntitlements = free;
tiktokService.sessionUsage = { comments: 0, tts: 0, commentLimitNotified: false, ttsLimitNotified: false };
for (let index = 0; index < 20; index++) assert.strictEqual(tiktokService.consumeComment().allowed, true);
assert.strictEqual(tiktokService.consumeComment().payload.feature, 'comments');
for (let index = 0; index < 10; index++) assert.strictEqual(tiktokService.consumeTts('free-user').allowed, true);
assert.strictEqual(tiktokService.consumeTts('free-user').payload.feature, 'tts');

console.log('plan-entitlements tests passed');

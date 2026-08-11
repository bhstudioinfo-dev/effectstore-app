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
const activeLegacyBusiness = getEntitlements({ subscription: 'business', subscriptionExpiresAt: new Date(Date.now() + 60_000) });

assert.strictEqual(free.mappings, 5);
assert.strictEqual(free.layouts, 1);
assert.strictEqual(free.commentsPerSession, 20);
assert.strictEqual(free.ttsPerSession, 10);
assert.strictEqual(basic.mappings, 30);
assert.strictEqual(basic.layouts, 2);
assert.strictEqual(basic.menuAssets, 20);
assert.strictEqual(basic.goalTrackers, 10);
assert.strictEqual(pro.devices, 1);
assert.strictEqual(pro.mappings, Infinity);
assert.strictEqual(expired.key, 'free');
assert.strictEqual(activeLegacyBusiness.key, 'business');
assert.strictEqual(upgradePayload('mappings', 'x', free).recommendedPlan, 'basic');
assert.strictEqual(upgradePayload('menuAdvanced', 'x', basic).recommendedPlan, 'pro');
assert.strictEqual(PLAN_ENTITLEMENTS.studio.devices, Infinity);
const aiAssistantService = require('../services/aiAssistantService');
assert.strictEqual(aiAssistantService.getCharacterUsage({ subscription: 'pro' }).baseLimit, 15000);
assert.strictEqual(aiAssistantService.getCharacterUsage({ subscription: 'business' }).baseLimit, 15000);
assert.strictEqual(getEntitlements({ subscription: { plan: 'pro' } }).key, 'pro');
assert.strictEqual(aiAssistantService.getCharacterUsage({ subscription: 'studio' }).baseLimit, 30000);
assert.strictEqual(aiAssistantService.getCharacterUsage({
    subscription: 'pro',
    subscriptionExpiresAt: new Date(Date.now() - 1000)
}).baseLimit, 1000);

const { acquireLock } = require('../middleware/planQuotaLock');
const lockOrder = [];
async function exerciseQuotaLock() {
    const releaseFirst = await acquireLock('user-1:mappings');
    const second = acquireLock('user-1:mappings').then((release) => {
        lockOrder.push('second');
        release();
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(lockOrder, []);
    releaseFirst();
    await second;
    assert.deepStrictEqual(lockOrder, ['second']);
}

assert.strictEqual(validateDesignerItems([{ type: 'goal-bar', animationType: 'None' }], free), null);
assert.strictEqual(validateDesignerItems([{ type: 'goal-bar', barColor: '#ff007f', glowColor: 'rgba(255,0,127,0.5)', themeStyle: 'default', titleColor: '#ffffff', subtitleColor: '#cbd5e1' }], free), null);
assert.strictEqual(validateDesignerItems([
    { type: 'goal-bar' },
    { type: 'goal-bar' }
], free).feature, 'goalTrackers');
assert.strictEqual(validateDesignerItems([{ type: 'media-asset', assetUrl: '/uploads/goal-assets/u/a.png' }], free).feature, 'menuAssets');
assert.strictEqual(validateDesignerItems([{ type: 'gift', auraType: 'Glow' }], free).feature, 'menuAdvanced');
assert.strictEqual(validateDesignerItems([{ type: 'gift', textColor: '#00ff00' }], free).feature, 'menuAdvanced');
// Free-plan export blocks must name the offending layer and its specific
// gated attribute so the upgrade prompt is actionable, not generic.
const namedAnimationViolation = validateDesignerItems([{ type: 'gift', name: 'Tên Fan', animationType: 'Shake' }], free);
assert.match(namedAnimationViolation.message, /Tên Fan/);
assert.match(namedAnimationViolation.message, /Shake/);
const namedColorViolation = validateDesignerItems([{ type: 'gift', name: 'Khung quà', textColor: '#00ff00' }], free);
assert.match(namedColorViolation.message, /Khung quà/);
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
assert.match(advancedBoardTrial.message, /xuất bảng này sang OBS/);
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
// Basic now gets full designer feature access (same as Pro) — only the
// saved-layout count (basic.layouts) still distinguishes it from Pro.
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Shake' }], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Pulse', auraType: 'Glow' }], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift-stack-group', children: [] }], basic), null);
assert.strictEqual(validateDesignerItems([{ type: 'gift-stack-group', children: [], locked: true }], basic), null);
assert.strictEqual(validateDesignerItems(Array.from({ length: 11 }, () => ({ type: 'goal-bar' })), basic).feature, 'goalTrackers');
assert.strictEqual(validateDesignerItems([{ type: 'gift', animationType: 'Shake', auraType: 'Electric Aura' }], pro), null);
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }] }, free), null);
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }, { effectId: 'b' }] }, basic).feature, 'automationAdvanced');
assert.strictEqual(validateMappingAutomation({ playbackMode: 'sequential' }, basic).recommendedPlan, 'pro');
assert.strictEqual(validateMappingAutomation({ cooldown: 5, cooldownAction: 'ignore' }, basic).feature, 'automationAdvanced');
assert.strictEqual(validateMappingAutomation({ effects: [{ effectId: 'a' }, { effectId: 'b' }], cooldown: 5 }, pro), null);

const tiktokService = require('../services/tiktokService');
assert.strictEqual(aiAssistantService.PLAN_LIMITS.free, 1000);
assert.strictEqual(aiAssistantService.PLAN_LIMITS.basic, 5000);
assert.strictEqual(aiAssistantService.PLAN_LIMITS.pro, 15000);
assert.strictEqual(aiAssistantService.PLAN_LIMITS.business, 15000);
assert.strictEqual(aiAssistantService.PLAN_LIMITS.studio, 30000);
assert.strictEqual(aiAssistantService.SYSTEM_VOICE_GIFT_LIMIT, 5000);
const aiFallbackUsage = aiAssistantService.getCharacterUsage({
    subscription: 'free',
    aiMonthKey: new Date().toISOString().slice(0, 7),
    usedCharactersThisMonth: 1000,
    usedSystemVoiceCharactersThisMonth: 4999,
    addonCharacters: 0
});
assert.strictEqual(aiFallbackUsage.responseMode, 'system_gift');
assert.strictEqual(aiFallbackUsage.systemVoiceGiftRemaining, 1);
const aiExhaustedUsage = aiAssistantService.getCharacterUsage({
    subscription: 'free',
    aiMonthKey: new Date().toISOString().slice(0, 7),
    usedCharactersThisMonth: 1000,
    usedSystemVoiceCharactersThisMonth: 5000,
    addonCharacters: 0
});
assert.strictEqual(aiExhaustedUsage.responseMode, 'exhausted');
const aiServiceSource = require('fs').readFileSync(require('path').join(__dirname, '../services/aiAssistantService.js'), 'utf8');
assert(aiServiceSource.includes("hostname: 'api.elevenlabs.io'"));
assert(aiServiceSource.includes('audioDataUrl'));
assert(!aiServiceSource.includes('elevenLabsApiKey: activeElevenKey'));
tiktokService.currentLiveUserId = 'free-user';
tiktokService.liveEntitlements = free;
tiktokService.sessionUsage = { comments: 0, tts: 0, commentLimitNotified: false, ttsLimitNotified: false };
for (let index = 0; index < 20; index++) assert.strictEqual(tiktokService.consumeComment('free-user').allowed, true);
assert.strictEqual(tiktokService.consumeComment('free-user').payload.feature, 'comments');
assert.strictEqual(tiktokService.consumeComment('free-user', true).allowed, true);
assert.strictEqual(tiktokService.consumeComment('another-user').status, 409);
for (let index = 0; index < 10; index++) assert.strictEqual(tiktokService.consumeTts('free-user').allowed, true);
assert.strictEqual(tiktokService.consumeTts('free-user').payload.feature, 'tts');

exerciseQuotaLock().then(() => console.log('plan-entitlements tests passed'));

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/home.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/index.html'), 'utf8');
const effectsRouteSource = fs.readFileSync(path.join(__dirname, '../routes/effects.js'), 'utf8');
const effectLibrarySource = fs.readFileSync(path.join(__dirname, '../services/effectLibraryService.js'), 'utf8');
const paymentServiceSource = fs.readFileSync(path.join(__dirname, '../services/paymentService.js'), 'utf8');

const loadOwnedBody = homeSource.slice(
    homeSource.indexOf('async loadOwnedEffects()'),
    homeSource.indexOf('async loadPersonalEffects()')
);
const mappingBody = homeSource.slice(
    homeSource.indexOf('async loadEffectsForMapping()'),
    homeSource.indexOf('async loadMappings()')
);

assert.ok(homeSource.includes('this.storeEffects = []'));
assert.ok(homeSource.includes('this._renderGrid(storeGrid, visibleStoreEffects'));
assert.ok(homeSource.includes("this.CLOUD_API_URL = 'https://effectstore-app.onrender.com'"));
assert.ok(homeSource.includes('const primaryUrl = normalizeBannerUrl(this.CLOUD_API_URL, data.banner.url)'));
assert.ok(homeSource.includes('const resolveMediaUrl = value => this.resolveCatalogMediaUrl(value)'));
assert.ok(homeSource.includes('const isLocalPlaybackRoute = /^\\/api\\/(?:stream\\/effect\\/|obs\\/effect-player-media\\/)/i.test(raw)'));
assert.ok(homeSource.includes('const baseUrl = isLocalPlaybackRoute ? this.API_URL : this.CLOUD_API_URL'));
assert.ok(homeSource.includes('return `system_vi_v2_${text}`'));
assert.ok(homeSource.includes('clearLegacySystemPreviewVoiceCache(text)'));
assert.ok(homeSource.includes("['pNInz6obpgDQGcFmaJgB', 'N2lVS1w4EtoT3dr4eOWO'].forEach"));
assert.ok(!homeSource.includes('clearLegacyCustomVoiceTtsCache'));
assert.ok(!homeSource.includes("const cacheKey = voiceId + '_' + text"));
assert.ok(homeSource.includes("fetch(this.API_URL + '/api/effects/trending')"));
assert.ok(!loadEffectsBodyRemovesSession(homeSource));
assert.ok(homeSource.includes('await this.preloadAllAppData();'));
assert.ok(homeSource.includes('async checkAuth({ loadDependentData = true } = {})'));
assert.ok(homeSource.includes('this.checkAuth({ loadDependentData: false })'));
assert.ok(homeSource.includes('if (this._aiConfigLoadPromise) return this._aiConfigLoadPromise'));
assert.ok(homeSource.includes('if (!res.ok) return false'));
assert.ok(homeSource.includes('tasks.push(this.preloadMappingLibrary())'));
assert.ok(homeSource.includes('if (!force && this._mappingLibraryPromise) return this._mappingLibraryPromise'));
assert.ok(homeSource.includes('await this.loadChallengeWheels()'));
assert.ok(homeSource.includes('await this.loadEffectsForMapping()'));
assert.ok(homeSource.includes('this.showBootstrapFailure(err.message'));
assert.ok(homeSource.includes("accountStorageKey('es_cache_owned_effects')"));
assert.ok(homeSource.includes("accountStorageKey('es_pending_payments')"));
assert.ok(!homeSource.includes("localStorage.setItem('es_pending_payments'"));
assert.ok(indexSource.includes('id="app-loading-retry"'));
assert.ok(!loadOwnedBody.includes('this.effects = data.effects'));
assert.ok(!mappingBody.includes('this.effects = purchasedEffects'));
assert.ok(indexSource.includes("filterCategory('all')"));
assert.ok(indexSource.includes('🛍️ Tất cả'));

assert.ok(effectsRouteSource.includes("Effect.find({ isActive: true, isTrending: true })"));
const unresolvedPurchaseBody = effectLibrarySource.slice(
    effectLibrarySource.indexOf('    if (!purchased) {', effectLibrarySource.indexOf('async function resolveEffectForUser')),
    effectLibrarySource.indexOf('    let purchasedEffect = purchased.effectId;')
);
assert.ok(unresolvedPurchaseBody.includes('return null;'), 'Unowned effects must fail closed');
assert.ok(!unresolvedPurchaseBody.includes('normalizePurchasedEffect'), 'Catalog existence must not grant ownership');
assert.ok(!effectsRouteSource.includes("const user = await User.findById(req.userId).select('isAdmin')"));
assert.ok(paymentServiceSource.includes("'purchasedEffects.effectId': { $ne: effectId }"));
assert.ok(!paymentServiceSource.includes('await user.save().catch(() => {})'));
assert.ok(homeSource.includes('Máy chủ chưa xác nhận quyền sở hữu'));
assert.ok(homeSource.includes('!wheel.sourceTemplateId || catalogWheelIds.has(String(wheel.sourceTemplateId))'));
assert.ok(effectsRouteSource.includes('ownedProductIds'));
assert.ok(homeSource.includes('this.ownedProductIds = new Set()'));
assert.ok(homeSource.includes("checkoutButton.textContent = total === 0 ? '🎁 Nhận miễn phí'"));
assert.ok(!homeSource.includes('const hasPurchased = effect.isOwned === true'));
assert.ok(effectLibrarySource.includes('!isCentralCloudRuntime()'));

console.log('store regression tests passed');

function loadEffectsBodyRemovesSession(source) {
    const body = source.slice(
        source.indexOf('async loadEffects()'),
        source.indexOf('async loadTrending()')
    );
    return body.includes("localStorage.removeItem('token')");
}

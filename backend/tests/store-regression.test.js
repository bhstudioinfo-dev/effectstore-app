const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Normalize CRLF -> LF: some source files in this repo are saved with
// Windows line endings, which would otherwise break any assertion here
// that checks for a literal '\n'-joined multi-line string.
const readSource = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8').replace(/\r\n/g, '\n');

const homeSource = readSource('../../desktop/renderer/js/home.js');
const indexSource = readSource('../../desktop/renderer/index.html');
const effectsRouteSource = readSource('../routes/effects.js');
const effectLibrarySource = readSource('../services/effectLibraryService.js');
const paymentServiceSource = readSource('../services/paymentService.js');
const authSource = readSource('../middleware/auth.js');
const cloudProxySource = readSource('../middleware/cloudProxy.js');
const paymentRouteSource = readSource('../routes/payment.js');
const tiktokRouteSource = readSource('../routes/tiktok.js');
const designerSource = readSource('../../desktop/renderer/js/gift-menu-designer.js');
const publicDesignerSource = readSource('../public/js/gift-menu-designer.js');
const catalogDeletionSource = readSource('../services/catalogDeletionService.js');
const cloudTemplateCatalogSource = readSource('../services/cloudTemplateCatalog.js');

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
assert.ok(homeSource.includes('const primaryUrl = normalizeBannerUrl(this.API_URL, data.banner.url)'));
assert.ok(homeSource.includes('const resolveMediaUrl = value => this.resolveCatalogMediaUrl(value)'));
assert.ok(homeSource.includes('const isLocalMediaRoute = /^\\/api\\/(?:stream\\/effect\\/|obs\\/effect-player-media\\/)/i.test(raw)'));
assert.ok(homeSource.includes('const baseUrl = isLocalMediaRoute ? this.API_URL : this.CLOUD_API_URL'));
assert.ok(homeSource.includes('return `system_vi_v2_${text}`'));
assert.ok(homeSource.includes('clearLegacySystemPreviewVoiceCache(text)'));
assert.ok(homeSource.includes("['pNInz6obpgDQGcFmaJgB', 'N2lVS1w4EtoT3dr4eOWO'].forEach"));
assert.ok(!homeSource.includes('clearLegacyCustomVoiceTtsCache'));
assert.ok(!homeSource.includes("const cacheKey = voiceId + '_' + text"));
assert.ok(homeSource.includes("fetch(this.API_URL + '/api/effects/trending')"));
assert.ok(!loadEffectsBodyRemovesSession(homeSource));
assert.ok(homeSource.includes('await this.preloadAllAppData();'));
assert.ok(homeSource.includes('await Promise.allSettled(coreTasks);'));
assert.ok(!homeSource.includes('new Promise(resolve => setTimeout(resolve, 800))'));
assert.ok(homeSource.includes('await this.preloadStoreVisualAssets();'));
assert.ok(homeSource.includes('async checkAuth({ loadDependentData = true } = {})'));
assert.ok(homeSource.includes('this.checkAuth({ loadDependentData: false })'));
assert.ok(homeSource.includes('if (this._aiConfigLoadPromise) return this._aiConfigLoadPromise'));
assert.ok(homeSource.includes('if (!res.ok) return false'));
assert.ok(homeSource.includes('deferredTasks.push(this.preloadMappingLibrary())'));
assert.ok(homeSource.includes('if (!force && this._mappingLibraryPromise) return this._mappingLibraryPromise'));
assert.ok(homeSource.includes('await this.loadChallengeWheels()'));
assert.ok(homeSource.includes('await this.loadEffectsForMapping()'));
assert.ok(homeSource.includes('void Promise.allSettled(deferredTasks)'));
assert.ok(homeSource.includes("effect.category !== 'menu_template' && effect.isChallengeWheel !== true"));
assert.ok(homeSource.includes("effect.isChallengeWheel || effect.category === 'menu_template'"));
assert.ok(homeSource.includes("Match the Store's real wheel preview"));
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
assert.ok(homeSource.includes('Boolean(wheel.sourceTemplateId) && catalogWheelIds.has(String(wheel.sourceTemplateId))'));
assert.ok(effectsRouteSource.includes('ownedProductIds'));
assert.ok(homeSource.includes('this.ownedProductIds = new Set()'));
assert.ok(homeSource.includes("checkoutButton.textContent = '💳 Thanh toán ngay'"));
assert.ok(!homeSource.includes('🎁 Nhận miễn phí'));
assert.ok(!homeSource.includes('const hasPurchased = effect.isOwned === true'));
assert.ok(effectLibrarySource.includes('!isCentralCloudRuntime()'));
assert.ok(authSource.includes('await verifyUserWithCloud(token);'));
assert.ok(authSource.includes("process.env.EFFECTSTORE_DESKTOP_MANAGED === 'true'"));
assert.ok(cloudProxySource.includes('const publicCatalogRequest = req.method === \'GET\''));
assert.ok(cloudProxySource.includes('delete anonymousHeaders.authorization;'));
assert.ok(!authSource.includes('user = new User({'));
assert.ok(paymentRouteSource.includes("await User.findById(req.userId).select('purchasedEffects isActive')"));
assert.ok(!paymentRouteSource.includes('const user = req.user ||'));
assert.ok(tiktokRouteSource.includes('if (correspondingEffect && !hasPurchased)'));
assert.ok(tiktokRouteSource.includes('const cloudOwnershipConfirmed = cloudTemplate?.isPurchased === true'));
assert.ok(tiktokRouteSource.includes("'purchasedEffects.effectId': { $ne: effectId }"));
assert.ok(tiktokRouteSource.includes('owned: privileged || !product || purchasedIds.has(String(product._id))'));
assert.ok(designerSource.includes('const isOwned = Boolean(t.isPurchased);'));
assert.ok(!designerSource.includes('Boolean(t.isPurchased) || price === 0'));
assert.ok(homeSource.includes('if (this._checkoutInProgress) return;'));
assert.ok(homeSource.includes('getEffectiveCartPrice(effect, now = Date.now())'));
assert.ok(homeSource.includes('this.cart.reduce((sum, effect) => sum + this.getEffectiveCartPrice(effect), 0)'));
assert.ok(homeSource.includes('const cartItemPrice = this.getEffectiveCartPrice(effect);'));
assert.ok(!homeSource.includes('effect.flashSalePrice > 0'));
assert.ok(publicDesignerSource.includes('const isOwned = Boolean(t.isPurchased);'));
assert.ok(designerSource.includes('await app.loadEffectsForMapping?.();'));
assert.ok(homeSource.includes("const templateEntitlement = effect.category === 'menu_template' && effect.isOwned === true"));
assert.ok(homeSource.includes('resetAuthForms()'));
assert.ok(homeSource.includes("this.switchAuthTab('login');"));
const authTabBody = homeSource.slice(homeSource.indexOf('switchAuthTab(tab, trigger = null)'), homeSource.indexOf('async login()'));
assert.ok(!authTabBody.includes('event.target'));
assert.ok(indexSource.includes("app.switchAuthTab('register', this)"));
assert.ok(catalogDeletionSource.includes("$pull: { purchasedEffects: { effectId: effect._id } }"));
assert.ok(catalogDeletionSource.includes('await ChallengeWheel.deleteMany({ sourceTemplateId: deletedTemplateId })'));
assert.ok(catalogDeletionSource.includes('{ parentTemplateId: deletedTemplateId }'));
assert.ok(loadOwnedBody.includes('await this.loadOwnedTemplates();'));
assert.ok(homeSource.includes(".filter(template => template && template.isActive === true && (isPrivileged || template.isPurchased === true))"));
assert.ok(homeSource.includes('const ownedTemplates = this.getOwnedTemplateProducts();'));
assert.ok(homeSource.includes('this.ownedEffects.length + ownedTemplates.length'));
assert.ok(homeSource.includes("category: 'menu_template',"));
assert.ok(tiktokRouteSource.includes('const hasCloudCatalog = Array.isArray(cloudTemplates)'));
assert.ok(tiktokRouteSource.includes('const activeTemplateProductIds = hasCloudCatalog ? new Set()'));
assert.ok(tiktokRouteSource.includes("cloudById.get(String(template._id))?.isActive === true"));
assert.ok(tiktokRouteSource.includes('isActive: true,\n            isTemplate: true,'));
assert.ok(cloudTemplateCatalogSource.includes('isActive: template.isActive === true'));

console.log('store regression tests passed');

function loadEffectsBodyRemovesSession(source) {
    const body = source.slice(
        source.indexOf('async loadEffects()'),
        source.indexOf('async loadTrending()')
    );
    return body.includes("localStorage.removeItem('token')");
}

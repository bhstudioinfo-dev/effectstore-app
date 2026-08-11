const assert = require('assert');
const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/home.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/index.html'), 'utf8');
const effectsRouteSource = fs.readFileSync(path.join(__dirname, '../routes/effects.js'), 'utf8');

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
assert.ok(homeSource.includes("this.CLOUD_API_URL = 'https://liveflow-backend-iafw.onrender.com'"));
assert.ok(homeSource.includes('const primaryUrl = normalizeBannerUrl(this.CLOUD_API_URL, data.banner.url)'));
assert.ok(homeSource.includes('const resolveMediaUrl = value => this.resolveCatalogMediaUrl(value)'));
assert.ok(homeSource.includes('const isLocalPlaybackRoute = /^\\/api\\/(?:stream\\/effect\\/|obs\\/effect-player-media\\/)/i.test(raw)'));
assert.ok(homeSource.includes('const baseUrl = isLocalPlaybackRoute ? this.API_URL : this.CLOUD_API_URL'));
assert.ok(homeSource.includes("fetch(this.API_URL + '/api/effects/trending')"));
assert.ok(!loadEffectsBodyRemovesSession(homeSource));
assert.ok(homeSource.includes('await this.preloadAllAppData();'));
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

console.log('store regression tests passed');

function loadEffectsBodyRemovesSession(source) {
    const body = source.slice(
        source.indexOf('async loadEffects()'),
        source.indexOf('async loadTrending()')
    );
    return body.includes("localStorage.removeItem('token')");
}

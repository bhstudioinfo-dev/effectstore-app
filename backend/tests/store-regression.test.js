const assert = require('assert');
const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/js/home.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../desktop/renderer/index.html'), 'utf8');

const loadOwnedBody = homeSource.slice(
    homeSource.indexOf('async loadOwnedEffects()'),
    homeSource.indexOf('async loadPersonalEffects()')
);
const mappingBody = homeSource.slice(
    homeSource.indexOf('async loadEffectsForMapping()'),
    homeSource.indexOf('async loadMappings()')
);

assert.ok(homeSource.includes('this.storeEffects = []'));
assert.ok(homeSource.includes('this._renderGrid(storeGrid, this.storeEffects'));
assert.ok(!loadOwnedBody.includes('this.effects = data.effects'));
assert.ok(!mappingBody.includes('this.effects = purchasedEffects'));
assert.ok(indexSource.includes("filterCategory('all')"));
assert.ok(indexSource.includes('🛍️ Tất cả'));

console.log('store regression tests passed');

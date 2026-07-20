const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'effectstore-runtime-'));
const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'effectstore-legacy-'));
fs.mkdirSync(path.join(legacyRoot, 'uploads'), { recursive: true });
fs.writeFileSync(path.join(legacyRoot, 'uploads', 'gift-menu-layout.json'), '{"name":"legacy"}', 'utf8');
process.env.EFFECTSTORE_DATA_DIR = testRoot;
process.env.EFFECTSTORE_LEGACY_DATA_DIR = legacyRoot;

const { paths, ensureRuntimeDirectories, migrateLegacyData } = require('../config/dataPaths');
ensureRuntimeDirectories();
assert.strictEqual(paths.dataRoot, path.resolve(testRoot));
assert.strictEqual(fs.existsSync(paths.tempDir), true);
assert.strictEqual(fs.existsSync(paths.encryptedEffectsDir), true);
assert.strictEqual(migrateLegacyData().migrated, true);
assert.strictEqual(fs.readFileSync(paths.giftMenuLayoutPath, 'utf8'), '{"name":"legacy"}');

console.log('runtime paths tests passed');

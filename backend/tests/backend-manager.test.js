const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ensureBackendConfig,
    isLegacyDefaultMongoUri,
    updateMongoUri,
    rotateLogFile,
    resolveBackendPath
} = require('../../desktop/backend-manager');
const { sanitizeDiagnosticText } = require('../../desktop/diagnostics');

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'effectstore-manager-'));
const codec = {
    protect: (value) => `protected:${Buffer.from(String(value), 'utf8').toString('base64')}`,
    reveal: (value) => Buffer.from(String(value).replace(/^protected:/, ''), 'base64').toString('utf8')
};
const first = ensureBackendConfig(userDataPath, codec);
const second = ensureBackendConfig(userDataPath, codec);
assert.strictEqual(first.JWT_SECRET.length >= 32, true);
assert.strictEqual(first.ENCRYPTION_PASSWORD.length >= 32, true);
assert.strictEqual(first.INITIAL_SETUP_TOKEN.length >= 32, true);
assert.strictEqual(first.JWT_SECRET, second.JWT_SECRET);
assert.strictEqual(first.ENCRYPTION_PASSWORD, second.ENCRYPTION_PASSWORD);
assert.strictEqual(first.INITIAL_SETUP_TOKEN, second.INITIAL_SETUP_TOKEN);
assert.strictEqual(first.API_HOST, '0.0.0.0');
assert.strictEqual(first.WS_HOST, '0.0.0.0');
const ignoredSharedJwt = ensureBackendConfig(userDataPath, codec, {
    jwtSecret: 'shared-cloud-jwt-secret-must-not-be-used-123456789'
});
assert.strictEqual(ignoredSharedJwt.JWT_SECRET, first.JWT_SECRET);
const persisted = JSON.parse(fs.readFileSync(path.join(userDataPath, 'backend-config.json'), 'utf8'));
assert.strictEqual(persisted.version, 2);
assert.strictEqual(persisted.JWT_SECRET, undefined);
assert.strictEqual(persisted.MONGODB_URI, undefined);
assert.notStrictEqual(persisted.secrets.JWT_SECRET, first.JWT_SECRET);
assert.notStrictEqual(persisted.secrets.INITIAL_SETUP_TOKEN, first.INITIAL_SETUP_TOKEN);
assert.notStrictEqual(persisted.secrets.MONGODB_URI, first.MONGODB_URI);

assert.strictEqual(isLegacyDefaultMongoUri('mongodb://127.0.0.1:27017/effectstore'), true);
assert.strictEqual(isLegacyDefaultMongoUri('mongodb://localhost:27017/effectstore'), true);
assert.strictEqual(isLegacyDefaultMongoUri('mongodb://127.0.0.1:27018/effectstore'), false);
assert.strictEqual(isLegacyDefaultMongoUri('mongodb+srv://example.invalid/effectstore'), false);

const legacyUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'effectstore-manager-legacy-'));
const customCloudUri = 'mongodb+srv://custom.atlas.example/effectstore';
assert.strictEqual(ensureBackendConfig(legacyUserDataPath, codec, {}, customCloudUri).MONGODB_URI, customCloudUri);

const atlasUri = 'mongodb+srv://example.invalid/effectstore';
assert.strictEqual(updateMongoUri(userDataPath, atlasUri, codec).MONGODB_URI, atlasUri);
assert.strictEqual(ensureBackendConfig(userDataPath, codec).MONGODB_URI, atlasUri);
assert.throws(() => updateMongoUri(userDataPath, 'https://example.com', codec), /không hợp lệ/);
assert.strictEqual(resolveBackendPath({
    isPackaged: true,
    resourcesPath: 'C:\\app\\resources',
    desktopDirectory: 'ignored'
}), path.join('C:\\app\\resources', 'backend', 'server.js'));

const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'effectstore-log-'));
const logPath = path.join(logDirectory, 'backend.log');
fs.writeFileSync(logPath, '0123456789', 'utf8');
assert.strictEqual(rotateLogFile(logPath, 5, 2), true);
assert.strictEqual(fs.existsSync(logPath), false);
assert.strictEqual(fs.readdirSync(logDirectory).filter((name) => name.startsWith('backend-')).length, 1);

const diagnostic = sanitizeDiagnosticText('MONGODB_URI=mongodb+srv://user:pass@example/db Bearer abc.def JWT_SECRET=topsecret');
assert.strictEqual(diagnostic.includes('user:pass'), false);
assert.strictEqual(diagnostic.includes('abc.def'), false);
assert.strictEqual(diagnostic.includes('topsecret'), false);
assert.strictEqual(diagnostic.includes('[REDACTED]'), true);

console.log('backend manager tests passed');

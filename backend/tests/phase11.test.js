const assert = require('assert');
const authRoutes = require('../routes/auth');
const { CURRENT_SCHEMA_VERSION } = require('../services/schemaMigrationService');
const adminRoutes = require('../routes/admin');

const originalEncryptionPassword = process.env.ENCRYPTION_PASSWORD;
const originalSetupToken = process.env.INITIAL_SETUP_TOKEN;

try {
    process.env.ENCRYPTION_PASSWORD = 'phase-11-backup-password-value-123456789';
    process.env.INITIAL_SETUP_TOKEN = 'phase-11-setup-token-value-1234567890123';
    const backupService = require('../services/databaseBackupService');
    const input = Buffer.from('EffectStore backup round trip', 'utf8');
    const encrypted = backupService.encryptBackup(input);
    assert.strictEqual(encrypted.subarray(0, backupService.MAGIC.length).equals(backupService.MAGIC), true);
    assert.strictEqual(backupService.decryptBackup(encrypted).equals(input), true);
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => backupService.decryptBackup(tampered));

    assert.strictEqual(CURRENT_SCHEMA_VERSION, 2);
    assert.strictEqual(authRoutes.setupTokenMatches(process.env.INITIAL_SETUP_TOKEN), true);
    assert.strictEqual(authRoutes.setupTokenMatches('invalid'), false);
    assert.strictEqual(authRoutes.stack.some((layer) => layer.route?.path === '/setup-status'), true);
    assert.strictEqual(authRoutes.stack.some((layer) => layer.route?.path === '/setup-admin'), true);
    assert.strictEqual(adminRoutes.stack.some((layer) => layer.route?.path === '/database/backups'), true);
    assert.strictEqual(adminRoutes.stack.some((layer) => layer.route?.path === '/database/backup'), true);
    assert.strictEqual(adminRoutes.stack.some((layer) => layer.route?.path === '/database/restore/:filename'), true);
} finally {
    if (originalEncryptionPassword === undefined) delete process.env.ENCRYPTION_PASSWORD;
    else process.env.ENCRYPTION_PASSWORD = originalEncryptionPassword;
    if (originalSetupToken === undefined) delete process.env.INITIAL_SETUP_TOKEN;
    else process.env.INITIAL_SETUP_TOKEN = originalSetupToken;
}

console.log('phase 11 tests passed');

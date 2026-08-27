const mongoose = require('mongoose');
const crypto = require('crypto');
const { getJwtSecret } = require('../config/security');

// Encrypts the OBS WebSocket password at rest (AES-256-GCM, same scheme as
// systemAiSecretService.js) instead of storing it as plain text in MongoDB.
// Implemented as schema get/set so every existing call site that reads
// `settings.password` (routes/obs.js, routes/settings.js, server.js) keeps
// working unchanged and transparently sees the decrypted value.
const ENCRYPTED_PREFIX = 'enc1:';

function encryptionKey() {
    return crypto.createHash('sha256').update(`liveflow-obs-password:v1:${getJwtSecret()}`).digest();
}

function encryptPassword(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return ENCRYPTED_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptPassword(stored) {
    if (typeof stored !== 'string' || !stored.startsWith(ENCRYPTED_PREFIX)) {
        // Legacy plaintext value saved by an install running before this
        // field was encrypted — return as-is instead of failing OBS auth.
        return stored;
    }
    try {
        const raw = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');
        const iv = raw.subarray(0, 12);
        const authTag = raw.subarray(12, 28);
        const ciphertext = raw.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (_error) {
        // Corrupt/undecryptable (e.g. JWT_SECRET rotated) — surface the raw
        // value rather than silently returning an empty password.
        return stored;
    }
}

const OBSSettingsSchema = new mongoose.Schema({
    // Optional/sparse so pre-existing installs keep their single legacy
    // document (no userId) until it's adopted by whichever account first
    // reads/saves OBS settings after this field was introduced.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    host: {
        type: String,
        default: '127.0.0.1',
        set: (value) => (!value || value === 'localhost' ? '127.0.0.1' : value),
        get: (value) => (!value || value === 'localhost' ? '127.0.0.1' : value)
    },
    port: { type: Number, default: 4455 },
    password: {
        type: String,
        default: 'obs123',
        set: (value) => (value === undefined || value === null ? value : encryptPassword(value)),
        get: (value) => (value === undefined || value === null ? value : decryptPassword(value))
    },
    updatedAt: { type: Date, default: Date.now }
});

// Direct `doc.password` access already runs the getter above regardless of
// this setting; this only ensures toObject()/toJSON()/JSON.stringify(doc)
// also yield the decrypted value instead of the raw ciphertext blob.
OBSSettingsSchema.set('toObject', { getters: true });
OBSSettingsSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('OBSSettings', OBSSettingsSchema);

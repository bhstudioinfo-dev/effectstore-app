const crypto = require('crypto');
const SystemSecret = require('../models/SystemSecret');
const { getJwtSecret } = require('../config/security');

const ALLOWED_NAMES = new Set(['gemini', 'elevenlabs']);
const cache = new Map();

function encryptionKey() {
    return crypto.createHash('sha256').update(`liveflow-ai-secrets:v1:${getJwtSecret()}`).digest();
}

function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64')
    };
}

function decrypt(record) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

async function setSecret(name, value, updatedBy = null) {
    if (!ALLOWED_NAMES.has(name)) throw new Error('Unsupported AI secret');
    const normalized = String(value || '').trim();
    if (normalized.length < 16 || normalized.length > 2000) throw new Error('API key is invalid');
    const encrypted = encrypt(normalized);
    await SystemSecret.findOneAndUpdate(
        { name },
        { $set: { ...encrypted, updatedBy: updatedBy || undefined, updatedAt: new Date() } },
        { upsert: true, new: true, runValidators: true }
    );
    cache.set(name, normalized);
    return true;
}

async function getSecret(name) {
    if (!ALLOWED_NAMES.has(name)) return '';
    const environmentName = name === 'gemini' ? 'GEMINI_API_KEY' : 'ELEVENLABS_API_KEY';
    if (cache.has(name)) return cache.get(name);
    const record = await SystemSecret.findOne({ name }).lean();
    if (record) {
        try {
            const value = decrypt(record);
            cache.set(name, value);
            return value;
        } catch (error) {
            console.error(`Unable to decrypt stored ${name} key:`, error.message);
        }
    }
    return String(process.env[environmentName] || '').trim();
}

async function getStatus() {
    const names = await SystemSecret.find({ name: { $in: [...ALLOWED_NAMES] } }).select('name updatedAt').lean();
    const stored = new Map(names.map((item) => [item.name, item.updatedAt]));
    return {
        gemini: { configured: Boolean(process.env.GEMINI_API_KEY || stored.has('gemini')), updatedAt: stored.get('gemini') || null },
        elevenlabs: { configured: Boolean(process.env.ELEVENLABS_API_KEY || stored.has('elevenlabs')), updatedAt: stored.get('elevenlabs') || null }
    };
}

function clearCache() {
    cache.clear();
}

module.exports = { clearCache, decrypt, encrypt, getSecret, getStatus, setSecret };

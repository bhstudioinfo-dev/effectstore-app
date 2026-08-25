// One-time migration: re-encrypts every existing effect from the old single
// shared-catalog AES key to a new key derived per-effect (see
// utils/encrypt-video.js getEncryptionKey(effectId)). Run this ONCE, on the
// central server — the only machine that has both R2 credentials and
// ENCRYPTION_PASSWORD — before the new /effects/:effectId/play-url route
// (which hands out per-effect keys) goes live. Safe to re-run: any effect
// already re-encrypted (tagged via effectData.encryptionKeyVersion === 2) is
// skipped.
//
// Usage: node scripts/migrate-effect-encryption-keys.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { paths: dataPaths } = require('../config/dataPaths');
const Effect = require('../models/Effect');
const {
    isAssetStoreConfigured,
    downloadEncryptedEffect,
    uploadEncryptedEffect
} = require('../services/effectAssetStore');
const { getEncryptionKey } = require('../utils/encrypt-video');

const IV_LENGTH = 16;

// Reproduces the OLD single-shared-key derivation exactly as it existed
// before this migration, so this script alone still knows how to read
// legacy ciphertext. Do not reuse this elsewhere — new code always uses
// getEncryptionKey(effectId) from utils/encrypt-video.js.
function legacySharedKey() {
    const password = String(process.env.ENCRYPTION_PASSWORD || '');
    if (password.length < 32) {
        throw new Error('ENCRYPTION_PASSWORD must be configured with at least 32 characters.');
    }
    return crypto.scryptSync(password, 'salt-aes-256', 32);
}

function decryptWithKey(buffer, key) {
    const iv = buffer.subarray(0, IV_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptWithKey(buffer, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
}

async function migrateOne(effect) {
    const effectId = String(effect._id);
    const localPath = path.join(dataPaths.encryptedEffectsDir, `${effectId}.enc`);

    let ciphertext = null;
    if (fs.existsSync(localPath)) {
        ciphertext = fs.readFileSync(localPath);
    } else if (isAssetStoreConfigured()) {
        const remoteStream = await downloadEncryptedEffect(effectId);
        if (remoteStream) {
            const chunks = [];
            for await (const chunk of remoteStream) chunks.push(chunk);
            ciphertext = Buffer.concat(chunks);
        }
    }
    if (!ciphertext) {
        console.warn(`  skip ${effectId}: no encrypted source found locally or in R2`);
        return false;
    }

    const legacyKey = legacySharedKey();
    const newKey = getEncryptionKey(effectId);

    let plaintext;
    try {
        plaintext = decryptWithKey(ciphertext, legacyKey);
    } catch (error) {
        console.warn(`  skip ${effectId}: does not decrypt with the legacy shared key (already migrated?) — ${error.message}`);
        return false;
    }

    const reEncrypted = encryptWithKey(plaintext, newKey);

    fs.mkdirSync(dataPaths.encryptedEffectsDir, { recursive: true });
    const tempPath = `${localPath}.migrating-${Date.now()}`;
    fs.writeFileSync(tempPath, reEncrypted);
    fs.renameSync(tempPath, localPath);

    if (isAssetStoreConfigured()) {
        await uploadEncryptedEffect(effectId, localPath);
    }

    await Effect.updateOne({ _id: effect._id }, { $set: { encryptionKeyVersion: 2 } });
    console.log(`  migrated ${effectId} (${effect.name || 'untitled'})`);
    return true;
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/effectstore');

    const effects = await Effect.find({
        $or: [{ encryptionKeyVersion: { $ne: 2 } }, { encryptionKeyVersion: { $exists: false } }]
    }).lean(false);

    console.log(`Found ${effects.length} effect(s) to check.`);
    let migrated = 0;
    for (const effect of effects) {
        try {
            if (await migrateOne(effect)) migrated += 1;
        } catch (error) {
            console.error(`  FAILED ${effect._id}:`, error.message);
        }
    }
    console.log(`Done. Migrated ${migrated}/${effects.length} effect(s).`);
    process.exit(0);
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});

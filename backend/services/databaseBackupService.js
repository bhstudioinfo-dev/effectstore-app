const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { paths } = require('../config/dataPaths');

const MAGIC = Buffer.from('ESBK1');

function backupKey(salt) {
    const password = String(process.env.ENCRYPTION_PASSWORD || '');
    if (password.length < 32) throw new Error('ENCRYPTION_PASSWORD is not configured securely.');
    return crypto.scryptSync(password, salt, 32);
}

function encryptBackup(value) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(salt), iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}

function decryptBackup(value) {
    if (!value.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid EffectStore backup.');
    let offset = MAGIC.length;
    const salt = value.subarray(offset, offset += 16);
    const iv = value.subarray(offset, offset += 12);
    const tag = value.subarray(offset, offset += 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(value.subarray(offset)), decipher.final()]);
}

async function createDatabaseBackup() {
    if (mongoose.connection.readyState !== 1) throw new Error('Database is not connected.');
    const collectionInfos = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
    const collections = {};
    for (const { name } of collectionInfos) {
        if (name.startsWith('system.')) continue;
        collections[name] = await mongoose.connection.db.collection(name).find({}).toArray();
    }
    const payload = {
        format: 1,
        createdAt: new Date().toISOString(),
        database: mongoose.connection.name,
        collections
    };
    const compressed = zlib.gzipSync(Buffer.from(EJSON.stringify(payload), 'utf8'), { level: 9 });
    const encrypted = encryptBackup(compressed);
    const filename = `effectstore-${new Date().toISOString().replace(/[:.]/g, '-')}.esbackup`;
    const finalPath = path.join(paths.backupsDir, filename);
    const temporaryPath = `${finalPath}.tmp`;
    await fs.promises.writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 });
    await fs.promises.rename(temporaryPath, finalPath);
    return { filename, size: encrypted.length, createdAt: payload.createdAt };
}

async function listDatabaseBackups() {
    const entries = await fs.promises.readdir(paths.backupsDir, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.esbackup')) continue;
        const stat = await fs.promises.stat(path.join(paths.backupsDir, entry.name));
        backups.push({ filename: entry.name, size: stat.size, createdAt: stat.birthtime.toISOString() });
    }
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function restoreDatabaseBackup(filename) {
    const safeName = path.basename(String(filename || ''));
    if (!/^effectstore-[a-zA-Z0-9-]+\.esbackup$/.test(safeName)) throw new Error('Invalid backup filename.');
    const encrypted = await fs.promises.readFile(path.join(paths.backupsDir, safeName));
    const payload = EJSON.parse(zlib.gunzipSync(decryptBackup(encrypted)).toString('utf8'));
    if (payload?.format !== 1 || !payload.collections) throw new Error('Unsupported backup format.');

    let restoredDocuments = 0;
    for (const [collectionName, documents] of Object.entries(payload.collections)) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(collectionName) || !Array.isArray(documents) || documents.length === 0) continue;
        const operations = documents.filter((document) => document?._id !== undefined).map((document) => ({
            replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true }
        }));
        if (operations.length) {
            await mongoose.connection.db.collection(collectionName).bulkWrite(operations, { ordered: false });
            restoredDocuments += operations.length;
        }
    }
    return { filename: safeName, restoredDocuments, mode: 'merge' };
}

module.exports = {
    MAGIC,
    encryptBackup,
    decryptBackup,
    createDatabaseBackup,
    listDatabaseBackups,
    restoreDatabaseBackup
};

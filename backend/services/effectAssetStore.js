// Shared private storage for encrypted effect files (Cloudflare R2, an
// S3-compatible object store — see docs/COMMERCIAL_CLOUD_ROADMAP.md Giai
// đoạn C). The admin's machine uploads the already-encrypted file here after
// the existing local encryption step; other machines download the same
// still-encrypted bytes on first use and cache them locally. Nothing here
// ever handles a decrypted file — that only ever happens locally at
// playback time via utils/encrypt-video.js, unchanged.

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function isAssetStoreConfigured() {
    return Boolean(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME
    );
}

let client = null;
function getClient() {
    if (client) return client;
    client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
    });
    return client;
}

// One object key per effect id — a re-upload (effect update) simply
// overwrites it, always serving the current version.
function keyForEffect(effectId) {
    return `effects/${effectId}.enc`;
}

async function uploadEncryptedEffect(effectId, localFilePath) {
    const fs = require('fs');
    const body = fs.readFileSync(localFilePath);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForEffect(effectId),
        Body: body,
        ContentType: 'application/octet-stream'
    }));
}

async function deleteEncryptedEffect(effectId) {
    if (!isAssetStoreConfigured()) return;
    try {
        await getClient().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForEffect(effectId)
        }));
    } catch (_error) {}
}

async function effectExistsRemotely(effectId) {
    try {
        await getClient().send(new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForEffect(effectId)
        }));
        return true;
    } catch (_error) {
        return false;
    }
}

// Returns a readable stream of the encrypted bytes, or null if not present.
async function downloadEncryptedEffect(effectId) {
    try {
        const result = await getClient().send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForEffect(effectId)
        }));
        return result.Body; // Node.js Readable stream
    } catch (_error) {
        return null;
    }
}

// Thumbnails are plain marketing images (not the protected video content),
// so unlike the effect file above they're stored as-is, no encryption step.
function keyForThumbnail(effectId) {
    return `thumbs/${effectId}.png`;
}

async function deleteThumbnail(effectId) {
    if (!isAssetStoreConfigured()) return;
    try {
        await getClient().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForThumbnail(effectId)
        }));
    } catch (_error) {}
}

function keyForRelease(channel, filename) {
    const safeChannel = String(channel || '').trim();
    const safeFilename = String(filename || '').trim();
    if (!/^[a-z0-9-]+$/i.test(safeChannel) || !/^[a-zA-Z0-9._-]+$/.test(safeFilename)) {
        throw new Error('Invalid release object path.');
    }
    return `updates/${safeChannel}/${safeFilename}`;
}

async function uploadReleaseArtifact(channel, filename, localFilePath, contentType = 'application/octet-stream') {
    const fs = require('fs');
    const body = fs.readFileSync(localFilePath);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForRelease(channel, filename),
        Body: body,
        ContentType: contentType,
        CacheControl: filename.endsWith('.yml') ? 'no-cache, no-store' : 'public, max-age=31536000, immutable'
    }));
}

async function downloadReleaseArtifact(channel, filename, range) {
    try {
        return await getClient().send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForRelease(channel, filename),
            Range: range || undefined
        }));
    } catch (_error) {
        return null;
    }
}

async function uploadThumbnail(effectId, localFilePath) {
    const fs = require('fs');
    const body = fs.readFileSync(localFilePath);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForThumbnail(effectId),
        Body: body,
        ContentType: 'image/png'
    }));
}

async function downloadThumbnail(effectId) {
    try {
        const result = await getClient().send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForThumbnail(effectId)
        }));
        return result.Body;
    } catch (_error) {
        return null;
    }
}

function keyForVoiceSample(filename) {
    const safeFilename = String(filename || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return `voice-samples/${safeFilename}`;
}

async function uploadVoiceSample(filename, localFilePathOrBuffer) {
    if (!isAssetStoreConfigured()) return;
    const fs = require('fs');
    const body = Buffer.isBuffer(localFilePathOrBuffer) ? localFilePathOrBuffer : fs.readFileSync(localFilePathOrBuffer);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForVoiceSample(filename),
        Body: body,
        ContentType: 'audio/mpeg',
        CacheControl: 'public, max-age=31536000, immutable'
    }));
}

async function downloadVoiceSample(filename) {
    if (!isAssetStoreConfigured()) return null;
    try {
        const result = await getClient().send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForVoiceSample(filename)
        }));
        return result.Body;
    } catch (_error) {
        return null;
    }
}

function keyForBanner(filename) {
    const safeFilename = String(filename || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return `banners/${safeFilename}`;
}

async function uploadBanner(filename, localFilePathOrBuffer) {
    if (!isAssetStoreConfigured()) return;
    const fs = require('fs');
    const body = Buffer.isBuffer(localFilePathOrBuffer) ? localFilePathOrBuffer : fs.readFileSync(localFilePathOrBuffer);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForBanner(filename),
        Body: body,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable'
    }));
}

async function downloadBanner(filename) {
    if (!isAssetStoreConfigured()) return null;
    try {
        const result = await getClient().send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForBanner(filename)
        }));
        return result.Body;
    } catch (_error) {
        return null;
    }
}

async function deleteBanner(filename) {
    if (!isAssetStoreConfigured()) return;
    try {
        await getClient().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: keyForBanner(filename)
        }));
    } catch (_error) {}
}

module.exports = {
    isAssetStoreConfigured,
    uploadEncryptedEffect,
    deleteEncryptedEffect,
    effectExistsRemotely,
    downloadEncryptedEffect,
    uploadThumbnail,
    deleteThumbnail,
    downloadThumbnail,
    uploadReleaseArtifact,
    downloadReleaseArtifact,
    keyForRelease,
    uploadVoiceSample,
    downloadVoiceSample,
    uploadBanner,
    downloadBanner,
    deleteBanner
};

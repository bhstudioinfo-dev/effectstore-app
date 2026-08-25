// Shared private storage for encrypted effect files (Cloudflare R2, an
// S3-compatible object store — see docs/COMMERCIAL_CLOUD_ROADMAP.md Giai
// đoạn C). The admin's machine uploads the already-encrypted file here after
// the existing local encryption step; other machines download the same
// still-encrypted bytes on first use and cache them locally. Nothing here
// ever handles a decrypted file — that only ever happens locally at
// playback time via utils/encrypt-video.js, unchanged.

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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
    const body = fs.createReadStream(localFilePath);
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForEffect(effectId),
        Body: body
    }));
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

// A short-lived, single-object download URL a customer machine can fetch
// directly from R2 (free egress) instead of the central server proxying the
// bytes through its own bandwidth. Only ever call this after the caller has
// already verified the requesting account owns the effect — the URL itself
// carries no ownership check, only R2's own signature/expiry.
async function getPresignedEffectDownloadUrl(effectId, { expiresInSeconds = 300 } = {}) {
    return getSignedUrl(getClient(), new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForEffect(effectId)
    }), { expiresIn: expiresInSeconds });
}

// Thumbnails are plain marketing images (not the protected video content),
// so unlike the effect file above they're stored as-is, no encryption step.
function keyForThumbnail(effectId) {
    return `thumbs/${effectId}.png`;
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
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForRelease(channel, filename),
        Body: fs.createReadStream(localFilePath),
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
    await getClient().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: keyForThumbnail(effectId),
        Body: fs.createReadStream(localFilePath),
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

async function deleteRemoteEffect(effectId) {
    if (!isAssetStoreConfigured()) return;
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const keys = [
        keyForEffect(effectId),
        keyForThumbnail(effectId),
        `previews/${effectId}.webm`
    ];
    for (const key of keys) {
        try {
            await getClient().send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: key
            }));
        } catch (_error) {}
    }
}

module.exports = {
    isAssetStoreConfigured,
    uploadEncryptedEffect,
    effectExistsRemotely,
    downloadEncryptedEffect,
    getPresignedEffectDownloadUrl,
    uploadThumbnail,
    downloadThumbnail,
    uploadReleaseArtifact,
    downloadReleaseArtifact,
    keyForRelease,
    deleteRemoteEffect
};

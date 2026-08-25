const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// One derived key per effect id — a leaked/expired key only ever exposes
// the single effect it was issued for, never the master password or the
// rest of the catalog. The master ENCRYPTION_PASSWORD itself is only ever
// read here, locally, on whichever machine has it configured (the central
// server); it is never transmitted anywhere.
function getEncryptionKey(effectId) {
    const password = String(process.env.ENCRYPTION_PASSWORD || '');
    if (password.length < 32) {
        throw new Error('ENCRYPTION_PASSWORD must be configured with at least 32 characters.');
    }
    if (!effectId) {
        throw new Error('getEncryptionKey requires an effectId.');
    }
    return crypto.scryptSync(password, `salt-aes-256-${effectId}`, 32);
}

// Accepts either a raw key Buffer (already derived centrally and handed to
// this process over the network, e.g. the desktop playback path) or an
// effectId string (derived locally from ENCRYPTION_PASSWORD, e.g. the
// central server's own upload/stream paths).
function resolveKey(keyOrEffectId) {
    if (Buffer.isBuffer(keyOrEffectId)) return keyOrEffectId;
    return getEncryptionKey(keyOrEffectId);
}

// IV length for AES
const IV_LENGTH = 16;

/**
 * Encrypt video file
 * @param {string} inputPath - Path to original video
 * @param {string} outputPath - Path for encrypted file
 * @param {string} effectId - Effect id, used to derive this file's unique key
 */
async function encryptVideo(inputPath, outputPath, effectId) {
    return new Promise((resolve, reject) => {
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(effectId), iv);
        
        // Write IV first (needed for decryption)
        output.write(iv);
        
        input.pipe(cipher).pipe(output);
        
        output.on('finish', () => {
            // Delete original file after encryption
            try {
                fs.unlinkSync(inputPath);
                console.log(`✅ Encrypted: ${inputPath} → ${outputPath}`);
            } catch (err) {
                console.error('⚠️ Could not delete original file:', err);
            }
            resolve(outputPath);
        });
        
        output.on('error', reject);
        input.on('error', reject);
        cipher.on('error', reject);
    });
}

/**
 * Decrypt video stream (for streaming)
 * @param {string} encryptedPath - Path to encrypted file
 * @param {Buffer|string} keyOrEffectId - Raw key Buffer, or an effectId to derive it locally
 * @returns {ReadStream} - Decrypted video stream
 */
function decryptVideoStream(encryptedPath, keyOrEffectId) {
    // fs.readFileSync has no start/end option (that's only for
    // createReadStream) — it silently ignored { end: IV_LENGTH - 1 } and
    // read the WHOLE file as the "IV", which happened to never get
    // exercised before because playback almost always found an already-
    // unencrypted local copy first. Read exactly the first 16 bytes instead.
    const fd = fs.openSync(encryptedPath, 'r');
    const iv = Buffer.alloc(IV_LENGTH);
    try {
        fs.readSync(fd, iv, 0, IV_LENGTH, 0);
    } finally {
        fs.closeSync(fd);
    }
    const decipher = crypto.createDecipheriv('aes-256-cbc', resolveKey(keyOrEffectId), iv);
    const input = fs.createReadStream(encryptedPath, { start: IV_LENGTH });

    return input.pipe(decipher);
}

/**
 * Stream decrypted video with range support
 * @param {string} encryptedPath
 * @param {Object} res - Express response object
 * @param {Buffer|string} keyOrEffectId - Raw key Buffer, or an effectId to derive it locally
 */
function streamDecryptedVideo(encryptedPath, _req, res, keyOrEffectId) {
    // AES-CBC cannot safely decrypt an arbitrary byte range without block-aware
    // alignment and the preceding cipher block. Stream the complete plaintext
    // with chunked transfer instead of returning corrupt partial content.
    res.writeHead(200, {
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, no-store',
        'Content-Type': 'video/webm'
    });
    decryptVideoStream(encryptedPath, keyOrEffectId).pipe(res);
}

module.exports = {
    encryptVideo,
    decryptVideoStream,
    getEncryptionKey,
    streamDecryptedVideo
};

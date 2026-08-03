const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Encryption key từ environment variable
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.ENCRYPTION_PASSWORD || 'effectstore-secret-encryption-key-2024',
    'salt-aes-256',
    32
);

// IV length for AES
const IV_LENGTH = 16;

/**
 * Encrypt video file
 * @param {string} inputPath - Path to original video
 * @param {string} outputPath - Path for encrypted file
 */
async function encryptVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        
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
 * @returns {ReadStream} - Decrypted video stream
 */
function decryptVideoStream(encryptedPath) {
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
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const input = fs.createReadStream(encryptedPath, { start: IV_LENGTH });

    return input.pipe(decipher);
}

/**
 * Stream decrypted video with range support
 * @param {string} encryptedPath 
 * @param {Object} res - Express response object
 */
function streamDecryptedVideo(encryptedPath, _req, res) {
    // AES-CBC cannot safely decrypt an arbitrary byte range without block-aware
    // alignment and the preceding cipher block. Stream the complete plaintext
    // with chunked transfer instead of returning corrupt partial content.
    res.writeHead(200, {
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, no-store',
        'Content-Type': 'video/webm'
    });
    decryptVideoStream(encryptedPath).pipe(res);
}

module.exports = {
    encryptVideo,
    decryptVideoStream,
    streamDecryptedVideo
};

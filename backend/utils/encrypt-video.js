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
    const iv = fs.readFileSync(encryptedPath, { end: IV_LENGTH - 1 });
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const input = fs.createReadStream(encryptedPath, { start: IV_LENGTH });
    
    return input.pipe(decipher);
}

/**
 * Stream decrypted video with range support
 * @param {string} encryptedPath 
 * @param {Object} res - Express response object
 */
function streamDecryptedVideo(encryptedPath, req, res) {
    const stat = fs.statSync(encryptedPath);
    const fileSize = stat.size - IV_LENGTH; // Subtract IV size
    
    const range = req.headers.range;
    if (range) {
        // Handle range requests for seeking
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        const iv = fs.readFileSync(encryptedPath, { end: IV_LENGTH - 1 });
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        
        const stream = fs.createReadStream(encryptedPath, { 
            start: IV_LENGTH + start, 
            end: IV_LENGTH + end 
        });
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/webm'
        });
        
        stream.pipe(decipher).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/webm'
        });
        
        decryptVideoStream(encryptedPath).pipe(res);
    }
}

module.exports = {
    encryptVideo,
    decryptVideoStream,
    streamDecryptedVideo
};
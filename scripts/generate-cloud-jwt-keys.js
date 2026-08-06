const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const secretDirectory = path.join(os.tmpdir(), 'liveflow-release-secrets');
const privateKeyPath = path.join(secretDirectory, 'cloud-jwt-private.pem');
const publicKeyPath = path.join(root, 'desktop', 'assets', 'cloud-jwt-public.pem');

if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
    throw new Error('JWT key files already exist. Refusing to overwrite release keys.');
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.mkdirSync(secretDirectory, { recursive: true });
fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o644, flag: 'wx' });

console.log(`Private key (Render secret only): ${privateKeyPath}`);
console.log(`Public key (packaged with desktop): ${publicKeyPath}`);

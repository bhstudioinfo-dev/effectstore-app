const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
const { isAssetStoreConfigured, uploadReleaseArtifact } = require('../backend/services/effectAssetStore');

const root = path.resolve(__dirname, '..');
const distDirectory = path.join(root, 'desktop', 'dist');
const channel = String(process.env.LIVEFLOW_RELEASE_CHANNEL || 'stable').trim();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'));
const installerName = `LiveFlow-Setup-${packageJson.version}.exe`;
const requiredFiles = ['latest.yml', installerName];
const optionalBlockmap = `${installerName}.blockmap`;
if (fs.existsSync(path.join(distDirectory, optionalBlockmap))) {
    requiredFiles.push(optionalBlockmap);
}

function contentTypeFor(filename) {
    if (filename.endsWith('.yml')) return 'text/yaml; charset=utf-8';
    if (filename.endsWith('.blockmap')) return 'application/octet-stream';
    if (filename.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
    return 'application/octet-stream';
}

async function main() {
    if (!isAssetStoreConfigured()) throw new Error('R2 release credentials are not configured.');
    if (!/^[a-z0-9-]+$/i.test(channel)) throw new Error('LIVEFLOW_RELEASE_CHANNEL is invalid.');

    const missing = requiredFiles.filter((filename) => !fs.existsSync(path.join(distDirectory, filename)));
    if (missing.length) throw new Error(`Missing release artifacts: ${missing.join(', ')}`);

    for (const filename of requiredFiles) {
        const filePath = path.join(distDirectory, filename);
        const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        await uploadReleaseArtifact(channel, filename, filePath, contentTypeFor(filename));
        console.log(`Uploaded ${channel}/${filename} sha256=${digest}`);
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

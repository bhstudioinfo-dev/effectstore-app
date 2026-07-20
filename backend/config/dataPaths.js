const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const dataRoot = path.resolve(process.env.EFFECTSTORE_DATA_DIR || backendRoot);
const uploadsDir = path.join(dataRoot, 'uploads');
const effectsDir = path.join(dataRoot, 'effects');
const runtimeAssetsDir = path.join(dataRoot, 'assets');

const paths = Object.freeze({
    backendRoot,
    dataRoot,
    uploadsDir,
    effectsDir,
    encryptedEffectsDir: path.join(effectsDir, 'encrypted'),
    previewsDir: path.join(uploadsDir, 'previews'),
    tempDir: path.join(uploadsDir, 'temp'),
    bannersDir: path.join(uploadsDir, 'banners'),
    thumbsDir: path.join(uploadsDir, 'thumbs'),
    goalAssetsDir: path.join(uploadsDir, 'goal-assets'),
    giftMenuLayoutPath: path.join(uploadsDir, 'gift-menu-layout.json'),
    goalBoardLayoutPath: path.join(uploadsDir, 'goal-board-layout.json'),
    runtimeGiftIconsDir: path.join(runtimeAssetsDir, 'gift-icons'),
    backupsDir: path.join(dataRoot, 'backups')
});

function ensureRuntimeDirectories() {
    [
        paths.uploadsDir,
        paths.encryptedEffectsDir,
        paths.previewsDir,
        paths.tempDir,
        paths.bannersDir,
        paths.thumbsDir,
        paths.goalAssetsDir,
        paths.runtimeGiftIconsDir,
        paths.backupsDir
    ].forEach((directory) => fs.mkdirSync(directory, { recursive: true }));
    if (dataRoot !== backendRoot) {
        copyMissing(path.join(backendRoot, 'assets', 'gift-icons'), paths.runtimeGiftIconsDir);
    }
}

function copyMissing(source, destination) {
    if (!fs.existsSync(source)) return;
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true });
        for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
            if (entry.name === 'temp') continue;
            copyMissing(path.join(source, entry.name), path.join(destination, entry.name));
        }
        return;
    }
    if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
}

function migrateLegacyData() {
    const legacyRootValue = String(process.env.EFFECTSTORE_LEGACY_DATA_DIR || '').trim();
    if (!legacyRootValue) return { migrated: false };
    const legacyRoot = path.resolve(legacyRootValue);
    if (legacyRoot === dataRoot || !fs.existsSync(legacyRoot)) return { migrated: false };
    copyMissing(path.join(legacyRoot, 'uploads'), paths.uploadsDir);
    copyMissing(path.join(legacyRoot, 'effects'), paths.effectsDir);
    copyMissing(path.join(legacyRoot, 'assets', 'gift-icons'), paths.runtimeGiftIconsDir);
    return { migrated: true, from: legacyRoot, to: dataRoot };
}

module.exports = { paths, ensureRuntimeDirectories, migrateLegacyData };

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const rootPackage = readJson('package.json');
const desktopPackage = readJson('desktop/package.json');
const desktopFiles = new Set(desktopPackage.build?.files || []);
const extraResources = desktopPackage.build?.extraResources || [];
const publishConfig = desktopPackage.build?.publish;
const desktopMain = fs.existsSync(path.join(root, 'desktop', 'main.js'))
    ? fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8')
    : '';
const backendManager = fs.existsSync(path.join(root, 'desktop', 'backend-manager.js'))
    ? fs.readFileSync(path.join(root, 'desktop', 'backend-manager.js'), 'utf8')
    : '';
const backendServer = fs.existsSync(path.join(root, 'backend', 'server.js'))
    ? fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8')
    : '';
const rendererHome = fs.existsSync(path.join(root, 'desktop', 'renderer', 'js', 'home.js'))
    ? fs.readFileSync(path.join(root, 'desktop', 'renderer', 'js', 'home.js'), 'utf8')
    : '';
const rendererIndex = fs.existsSync(path.join(root, 'desktop', 'renderer', 'index.html'))
    ? fs.readFileSync(path.join(root, 'desktop', 'renderer', 'index.html'), 'utf8')
    : '';
const templateCatalogService = fs.existsSync(path.join(root, 'backend', 'services', 'cloudTemplateCatalog.js'))
    ? fs.readFileSync(path.join(root, 'backend', 'services', 'cloudTemplateCatalog.js'), 'utf8')
    : '';
const trackedFiles = require('child_process')
    .execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);

if (rootPackage.scripts?.test?.includes('All tests passed')) {
    failures.push('Root test script is still a placeholder.');
}
if (!rootPackage.scripts?.test?.includes('validate-localization.js')) {
    failures.push('Vietnamese localization validation is missing from the root test script.');
}
if (!desktopFiles.has('assets/**/*')) failures.push('Desktop assets are missing from build.files.');
if (!desktopFiles.has('renderer/**/*')) failures.push('Desktop renderer is missing from build.files.');
if (!desktopFiles.has('backend-manager.js')) failures.push('Desktop backend manager is missing from build.files.');
if (!desktopFiles.has('diagnostics.js')) failures.push('Desktop diagnostics sanitizer is missing from build.files.');
if (backendManager.includes("API_HOST: '0.0.0.0'") || backendManager.includes("WS_HOST: '0.0.0.0'")) {
    // Intentional: Live Control's phone-remote QR flow (backend/routes/remote.js)
    // needs a phone on the same Wi-Fi to reach this backend's LAN IP, not just
    // 127.0.0.1. That surface is protected by requireRemoteToken (timing-safe
    // token check) for control endpoints and requireLoopback for setup/admin
    // endpoints — this is a reminder to re-verify those guards, not a blocker.
    warnings.push('Backend listens on 0.0.0.0 (LAN-reachable) for the phone Live Control feature — confirm remote.js token/loopback guards are intact before shipping.');
}
if (desktopMain.includes('LIVEFLOW_SHARED_JWT_SECRET')) {
    failures.push('Desktop must verify cloud JWTs with a public key, not a shared JWT secret.');
}
if (desktopMain.includes('LIVEFLOW_SHARED_ENCRYPTION_PASSWORD')) {
    failures.push('Desktop must stream cloud effects without receiving the central encryption password.');
}
if (!fs.existsSync(path.join(root, 'desktop', 'assets', 'cloud-jwt-public.pem'))) {
    warnings.push('Cloud JWT public key is not embedded; customer builds must provide desktop/assets/cloud-jwt-public.pem.');
}
if (desktopPackage.build?.nsis?.deleteAppDataOnUninstall !== false) {
    failures.push('NSIS uninstall must preserve application data by default.');
}
if (desktopPackage.build?.win?.signAndEditExecutable === false) {
    failures.push('Production Windows build must not disable executable signing/editing.');
}
if (publishConfig?.provider !== 'generic' || !/^https:\/\//i.test(String(publishConfig?.url || ''))) {
    failures.push('Desktop auto-update must use a configured HTTPS publish provider.');
}
if (!rootPackage.scripts?.['release:windows'] || !rootPackage.scripts?.['release:upload']) {
    failures.push('Windows release build/upload scripts are missing.');
}
const buildWinScript = fs.existsSync(path.join(root, 'desktop', 'scripts', 'build-win.js'))
    ? fs.readFileSync(path.join(root, 'desktop', 'scripts', 'build-win.js'), 'utf8')
    : '';
if (!buildWinScript.includes('app-update.yml')) {
    failures.push('Windows packaging must include app-update.yml for electron-updater.');
}
if (rootPackage.version !== desktopPackage.version) {
    failures.push('Root and desktop package versions must match.');
}
const packagedBackend = extraResources.find((entry) => entry?.to === 'backend');
if (!packagedBackend) failures.push('Backend is missing from desktop extraResources.');
if (packagedBackend && !(packagedBackend.filter || []).includes('!.env')) {
    failures.push('Packaged backend does not explicitly exclude .env.');
}
if (packagedBackend && !(packagedBackend.filter || []).includes('!uploads/**/*')) {
    failures.push('Packaged backend does not exclude runtime uploads.');
}
const packagedMongo = extraResources.find((entry) => entry?.to === 'mongodb');
if (!packagedMongo) failures.push('Bundled MongoDB (mongod.exe) is missing from desktop extraResources.');
if (!backendManager.includes('startBundledMongo')) {
    failures.push('backend-manager.js is missing the bundled-MongoDB lifecycle (startBundledMongo).');
}
if (!backendServer.includes("app.use('/api/payment', proxyToCloud)")) {
    failures.push('All customer and Admin payment routes must use the same cloud Payment collection.');
}
if (!backendServer.includes('commercialApiVersion') || !backendServer.includes("app.get('/api/cloud/status'")) {
    failures.push('Backend/desktop cloud compatibility handshake is missing.');
}
if (!rendererHome.includes('verifyCloudCompatibility()') || !rendererIndex.includes('app-loading-retry')) {
    failures.push('Renderer must block incomplete bootstrap and expose a retry action.');
}
if (!rendererHome.includes("accountStorageKey('es_cache_owned_effects')") || rendererHome.includes("localStorage.setItem('es_pending_payments'")) {
    failures.push('Account-owned caches must be namespaced by user ID.');
}
if (!templateCatalogService.includes('syncCloudTemplateList') || !backendServer.includes("app.use('/api/tiktok'")) {
    failures.push('Shared cloud template synchronization is missing.');
}
if (/\/api\/payment[\s\S]{0,300}includes\(['"]\/admin['"]\)[\s\S]{0,100}return next\(\)/.test(backendServer)) {
    failures.push('Admin payment routes must not bypass the cloud proxy and fall back to local MongoDB.');
}
if (!fs.existsSync(path.join(root, 'desktop', 'vendor', 'mongodb', 'mongod.exe'))) {
    warnings.push('desktop/vendor/mongodb/mongod.exe is not staged yet — run `node desktop/scripts/fetch-mongod.js` (or `npm run build`, which does this automatically) before packaging.');
}
const trackedVendorFiles = trackedFiles.filter((file) => file.startsWith('desktop/vendor/'));
if (trackedVendorFiles.length) {
    failures.push(`desktop/vendor/ (fetched MongoDB binary) must not be committed to git: ${trackedVendorFiles.join(', ')}`);
}
const configuredIcon = String(desktopPackage.build?.icon || '');
if (!configuredIcon || !fs.existsSync(path.join(root, 'desktop', configuredIcon))) {
    failures.push('Configured desktop build icon is missing.');
}

const trackedSecrets = trackedFiles.filter((file) => /(^|\/)\.env($|\.)/i.test(file) && !file.endsWith('.env.example'));
if (trackedSecrets.length) failures.push(`Environment secret files are tracked: ${trackedSecrets.join(', ')}`);

const forbiddenBuildPatterns = (desktopPackage.build?.files || []).filter((pattern) => (
    pattern.includes('.env') || pattern.includes('uploads/temp') || pattern.includes('node_modules/.cache')
));
if (forbiddenBuildPatterns.length) failures.push(`Unsafe build patterns: ${forbiddenBuildPatterns.join(', ')}`);

warnings.push('MongoDB is bundled and starts automatically on a fresh install — still verify a clean-machine first run (no prior backend-config.json) actually connects.');
warnings.push('Run the smoke-test checklist after creating the installer.');

warnings.forEach((message) => console.warn(`WARN: ${message}`));
if (failures.length) {
    failures.forEach((message) => console.error(`FAIL: ${message}`));
    process.exit(1);
}
console.log('Release preflight passed.');

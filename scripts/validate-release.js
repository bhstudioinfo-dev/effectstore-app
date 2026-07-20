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
if (desktopPackage.build?.nsis?.deleteAppDataOnUninstall !== false) {
    failures.push('NSIS uninstall must preserve application data by default.');
}
const packagedBackend = extraResources.find((entry) => entry?.to === 'backend');
if (!packagedBackend) failures.push('Backend is missing from desktop extraResources.');
if (packagedBackend && !(packagedBackend.filter || []).includes('!.env')) {
    failures.push('Packaged backend does not explicitly exclude .env.');
}
if (packagedBackend && !(packagedBackend.filter || []).includes('!uploads/**/*')) {
    failures.push('Packaged backend does not exclude runtime uploads.');
}
if (!fs.existsSync(path.join(root, 'desktop', 'assets', 'icon.ico'))) {
    warnings.push('desktop/assets/icon.ico is missing; Electron default icon will be used.');
}

const trackedSecrets = trackedFiles.filter((file) => /(^|\/)\.env($|\.)/i.test(file) && !file.endsWith('.env.example'));
if (trackedSecrets.length) failures.push(`Environment secret files are tracked: ${trackedSecrets.join(', ')}`);

const forbiddenBuildPatterns = (desktopPackage.build?.files || []).filter((pattern) => (
    pattern.includes('.env') || pattern.includes('uploads/temp') || pattern.includes('node_modules/.cache')
));
if (forbiddenBuildPatterns.length) failures.push(`Unsafe build patterns: ${forbiddenBuildPatterns.join(', ')}`);

warnings.push('Desktop includes the local backend; complete first-run MongoDB setup and verify database readiness.');
warnings.push('Run the smoke-test checklist after creating the installer.');

warnings.forEach((message) => console.warn(`WARN: ${message}`));
if (failures.length) {
    failures.forEach((message) => console.error(`FAIL: ${message}`));
    process.exit(1);
}
console.log('Release preflight passed.');

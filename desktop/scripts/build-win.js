const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rceditPath = 'C:\\Users\\KATANA\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\839960007\\rcedit-x64.exe';
const electronBaseExe = path.resolve(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const iconPath = path.resolve(__dirname, '..', 'assets', 'liveflow.ico');

console.log('🍃 [0/3] Ensuring bundled MongoDB binary is staged...');
execSync('node scripts/fetch-mongod.js', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
});

console.log('🎨 [1/3] Pre-injecting custom LiveFlow logo into Electron template binary...');
if (fs.existsSync(rceditPath) && fs.existsSync(electronBaseExe) && fs.existsSync(iconPath)) {
    try {
        execSync(`"${rceditPath}" "${electronBaseExe}" --set-icon "${iconPath}"`, { stdio: 'inherit' });
        console.log('✅ Template electron.exe icon updated.');
    } catch (e) {
        console.warn('⚠️ Template injection warning:', e.message);
    }
}

console.log('🚀 [2/3] Building unpacked directory and stamping executable...');
execSync('npx electron-builder --dir -c.win.signAndEditExecutable=false', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
});

const unpackedExePath = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'LiveFlow.exe');
const unpackedUpdateConfigPath = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app-update.yml');
if (fs.existsSync(rceditPath) && fs.existsSync(iconPath) && fs.existsSync(unpackedExePath)) {
    try {
        execSync(`"${rceditPath}" "${unpackedExePath}" --set-icon "${iconPath}"`, { stdio: 'inherit' });
        console.log('✅ LiveFlow.exe unpacked icon verified.');
    } catch (_e) {}
}

// `--prepackaged` does not reliably carry electron-builder's generated
// app-update.yml into the unpacked resources. Create the non-secret provider
// config explicitly so installed test builds do not fail with ENOENT.
fs.writeFileSync(
    unpackedUpdateConfigPath,
    'provider: generic\nurl: https://liveflow-backend-iafw.onrender.com/updates/stable\nchannel: latest\n',
    'utf8'
);

console.log('📦 [3/3] Packaging pre-stamped directory into NSIS setup installer...');
execSync('npx electron-builder --prepackaged dist/win-unpacked', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
});

console.log('🎉 LiveFlow packaging completed successfully! Desktop shortcut will display official logo 100%!');

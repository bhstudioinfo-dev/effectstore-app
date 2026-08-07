const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 [1/2] Building LiveFlow win-unpacked package...');
execSync('npx electron-builder --dir -c.win.signAndEditExecutable=false', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
});

const rceditPath = 'C:\\Users\\KATANA\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\839960007\\rcedit-x64.exe';
const exePath = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'LiveFlow.exe');
const iconPath = path.resolve(__dirname, '..', 'assets', 'liveflow.ico');

console.log('🎨 [2/2] Injecting custom LiveFlow logo into LiveFlow.exe...');
if (fs.existsSync(rceditPath) && fs.existsSync(exePath) && fs.existsSync(iconPath)) {
    execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`, { stdio: 'inherit' });
    console.log('✅ Custom logo injected successfully into LiveFlow.exe!');
} else {
    console.warn('⚠️ Could not locate rcedit or executable to inject icon.');
}

console.log('🎉 LiveFlow build ready with custom logo at desktop/dist/win-unpacked/LiveFlow.exe!');

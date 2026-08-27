const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '..', 'desktop', 'renderer', 'assets', 'fonts', 'utm');
const files = fs.readdirSync(fontsDir).filter(f => f.toLowerCase().endsWith('.ttf'));

let cssContent = '/* Auto-generated UTM Fonts CSS with comprehensive fallbacks */\n\n';

files.forEach(file => {
    const fontName = file.replace(/\.ttf$/i, '');
    const encoded = encodeURIComponent(file);
    cssContent += `@font-face {
    font-family: '${fontName}';
    src: local('${fontName}'),
         url('../assets/fonts/utm/${encoded}') format('truetype'),
         url('../assets/fonts/utm/${file}') format('truetype'),
         url('../../assets/fonts/utm/${encoded}') format('truetype'),
         url('../../assets/fonts/utm/${file}') format('truetype'),
         url('/assets/fonts/utm/${encoded}') format('truetype'),
         url('/assets/fonts/utm/${file}') format('truetype');
    font-display: swap;
}

`;
});

const desktopTarget = path.join(__dirname, '..', 'desktop', 'renderer', 'styles', 'utm-fonts.css');
fs.writeFileSync(desktopTarget, cssContent, 'utf8');

// For backend public:
let backendCss = '/* Auto-generated UTM Fonts CSS for Backend Public & OBS */\n\n';
files.forEach(file => {
    const fontName = file.replace(/\.ttf$/i, '');
    const encoded = encodeURIComponent(file);
    backendCss += `@font-face {
    font-family: '${fontName}';
    src: local('${fontName}'),
         url('/assets/fonts/utm/${encoded}') format('truetype'),
         url('/assets/fonts/utm/${file}') format('truetype'),
         url('../assets/fonts/utm/${encoded}') format('truetype');
    font-display: swap;
}

`;
});

const backendTarget = path.join(__dirname, '..', 'backend', 'public', 'utm-fonts.css');
fs.writeFileSync(backendTarget, backendCss, 'utf8');
console.log('Successfully generated utm-fonts.css with', files.length, 'fonts');

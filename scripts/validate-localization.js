const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
    'desktop/main.js',
    'desktop/renderer/index.html',
    'desktop/renderer/admin.html',
    'desktop/renderer/admin-banner.html',
    'desktop/renderer/gift-coins-manager.html',
    'desktop/renderer/js/home.js',
    'desktop/renderer/js/gift-menu-designer.js',
    'desktop/renderer/js/inspector-engine.js',
    'backend/public/effect-player-overlay.html',
    'backend/public/gift-menu-overlay.html',
    'frontend/overlay/goal-board-overlay.js'
];
const corrupted = /Ãƒ|Ã¡|Ã¢|Ã£|Ã¨|Ã©|Ã¬|Ã²|Ã³|Ã´|Ãµ|Ã¹|Ãº|Ä‘|Æ°|Æ¡|áº|á»|â€|ðŸ|ï¿½|�/;
const failures = [];

for (const relativePath of files) {
    const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
        if (corrupted.test(line)) failures.push(`${relativePath}:${index + 1}`);
    });
}

if (failures.length) {
    console.error(`Phát hiện chuỗi có dấu hiệu sai mã hóa:\n${failures.join('\n')}`);
    process.exit(1);
}
console.log(`Vietnamese encoding passed: ${files.length} UI files`);

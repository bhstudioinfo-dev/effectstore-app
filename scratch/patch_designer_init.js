const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'js', 'gift-menu-designer.js');

let content = fs.readFileSync(file, 'utf8');

const regex = /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{\s*const\s+designer\s*=\s*new\s+GiftMenuDesigner\(\);\s*designer\.init\(\);\s*window\.giftMenuDesigner\s*=\s*designer;\s*\}\);/;

const newInitBlock = `const initDesigner = () => {
        const designer = new GiftMenuDesigner();
        designer.init();
        window.giftMenuDesigner = designer;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDesigner);
    } else {
        initDesigner();
    }`;

if (regex.test(content)) {
    content = content.replace(regex, newInitBlock);
    console.log('Successfully patched readyState init via regex');
} else {
    console.warn('Could not match regex in gift-menu-designer.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Completed init updates');

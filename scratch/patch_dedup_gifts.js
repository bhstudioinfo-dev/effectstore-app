const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'backend', 'routes', 'tiktok.js');

let content = fs.readFileSync(file, 'utf8');

const regex = /const\s+mergedById\s*=\s*new\s+Map\(\);\s*\[\s*\.\.\.defaultGifts,\s*\.\.\.fileGifts\s*\]\.forEach\(\s*\(gift\)\s*=>\s*\{\s*if\s*\(!mergedById\.has\(gift\.id\)\)\s*mergedById\.set\(gift\.id,\s*gift\);\s*\}\);/;

const newMergeBlock = `const mergedById = new Map();
        defaultGifts.forEach((gift) => {
            mergedById.set(gift.id, gift);
        });

        fileGifts.forEach((gift) => {
            const fileIconBase = path.basename(gift.icon).toLowerCase().replace(/\\s*\\(\\d+\\)/g, '');
            const exists = Array.from(mergedById.values()).some(existing => {
                const existingBase = path.basename(existing.icon).toLowerCase().replace(/\\s*\\(\\d+\\)/g, '');
                return existingBase === fileIconBase;
            });
            if (!exists) {
                mergedById.set(gift.id, gift);
            }
        });`;

if (regex.test(content)) {
    content = content.replace(regex, newMergeBlock);
    console.log('Successfully patched merging logic via Regex');
} else {
    console.warn('Could not match regex in tiktok.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Patch complete');

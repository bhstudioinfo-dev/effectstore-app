const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'js', 'home.js');

let content = fs.readFileSync(file, 'utf8');

// Target the extra closing brace immediately following the previewHTML block
content = content.replace(/\}\s*\}\s*\r?\n\s*\/\/ Xác định trạng thái/g, '}\n\n            // Xác định trạng thái');
content = content.replace(/\}\s*\}\s*\r?\n\s*\r?\n\s*\/\/ Xác định trạng thái/g, '}\n\n            // Xác định trạng thái');

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully removed extra brace');

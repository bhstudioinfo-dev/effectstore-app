const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'styles', 'main.css');

let content = fs.readFileSync(file, 'utf8');
content = content.replace('}\\nbody {', '}\nbody {');
content = content.replace('}\\nbody {', '}\nbody {');
fs.writeFileSync(file, content, 'utf8');
console.log('Styles fixed');

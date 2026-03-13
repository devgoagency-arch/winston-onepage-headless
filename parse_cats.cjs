
const fs = require('fs');
try {
    let content = fs.readFileSync('all_cats.json', 'utf16le');
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    const cats = JSON.parse(content);
    const parentId = 63; // Zapatos
    const children = cats.filter(c => c.parent === parentId);
    console.log('Children of Zapatos:', children.map(c => c.name));
} catch (e) {
    console.error(e);
}

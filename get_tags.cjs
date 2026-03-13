
const fs = require('fs');
try {
    const raw = fs.readFileSync('acc_products.json', 'utf16le');
    const products = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    const tags = new Map();
    products.forEach(p => {
        p.tags.forEach(t => {
            tags.set(t.slug, t.name);
        });
    });
    console.log(JSON.stringify(Array.from(tags.entries())));
} catch (e) {
    console.error(e);
}

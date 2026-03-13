
const fs = require('fs');
const cats = JSON.parse(fs.readFileSync('all_cats.json', 'utf16le'));
console.log('Total categories:', cats.length);
const acc = cats.find(c => c.slug === 'accesorios');
console.log('Accesorios:', acc);
const children = cats.filter(c => c.parent === acc.id);
console.log('Children of Accesorios:', children);
const allParents = [...new Set(cats.map(c => c.parent))];
console.log('All unique parents:', allParents);
const topLevel = cats.filter(c => c.parent === 0);
console.log('Top level:', topLevel.map(t => t.name));

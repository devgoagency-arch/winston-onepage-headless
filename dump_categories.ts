
import { wcFetch } from './src/lib/woocommerce.ts';
import fs from 'fs';

async function main() {
    try {
        const categories = await wcFetch('/products/categories?per_page=100');
        const hierarchy = categories.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent: c.parent
        }));
        fs.writeFileSync('categories_hierarchy.json', JSON.stringify(hierarchy, null, 2));
        console.log('Hierarchy saved to categories_hierarchy.json');
    } catch (e) {
        console.error(e);
    }
}

main();

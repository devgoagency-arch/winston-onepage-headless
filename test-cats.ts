import { wcFetch } from './src/lib/woocommerce';

async function test() {
    const cats = await wcFetch('/products/categories?per_page=100');
    console.log(cats.map(c => ({ id: c.id, name: c.name, slug: c.slug })));
}

test();

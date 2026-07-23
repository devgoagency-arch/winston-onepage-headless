const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();
const { WC_CONSUMER_KEY, WC_CONSUMER_SECRET, WP_URL } = process.env;

async function run() {
    const res = await fetch(`https://tienda.winstonandharrystore.com/wp-json/wc/v3/products/categories?per_page=100&consumer_key=${WC_CONSUMER_KEY}&consumer_secret=${WC_CONSUMER_SECRET}`);
    const cats = await res.json();
    console.log("ID 190:", cats.find(c => c.id === 190));
    console.log("Any maletas:", cats.filter(c => c.slug.includes('maletas')));
}
run();


const WP_URL = 'https://tienda.winstonandharrystore.com';

async function test() {
    const slug = 'camisa-button-under-linea-gruesa';
    const url = `${WP_URL}/wp-json/wp/v2/product?slug=${slug}`;
    console.log('Fetching WP API:', url);
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log('Result count:', data.length);
        if (data.length > 0) {
            console.log('ID:', data[0].id);
        } else {
            // Try generic posts just in case
            const url2 = `${WP_URL}/wp-json/wp/v2/posts?slug=${slug}`;
            const res2 = await fetch(url2);
            const data2 = await res2.json();
             console.log('Posts Result count:', data2.length);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();

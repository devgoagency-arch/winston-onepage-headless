
async function test() {
    const urls = [
        'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa.jpg',
        'https://tienda.winstonandharrystore.com/wp-content/uploads/winston-and-harry-ropa-desktop.jpg',
        'https://tienda.winstonandharrystore.com/wp-content/uploads/banner-ropa.jpg'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            console.log(`${url} -> ${res.status}`);
        } catch (e) {
            console.error(url, e.message);
        }
    }
}
test();

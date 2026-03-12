
async function test() {
    const ids = [84395, 84396];
    for (const id of ids) {
        const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/media/${id}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            console.log(`ID ${id} URL:`, data.source_url);
        } catch (e) {
            console.error(e.message);
        }
    }
}
test();

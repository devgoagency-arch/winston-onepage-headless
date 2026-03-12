
async function test() {
    const id = 84396;
    const url = `https://tienda.winstonandharrystore.com/wp-json/wp/v2/media/${id}`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log("Media ID 84396 URL:", data.source_url);
        } else {
            console.log("Failed to fetch media:", res.status);
        }
    } catch (e) {
        console.error(e.message);
    }
}
test();

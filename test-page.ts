
import { getPageById } from './src/lib/woocommerce.ts';
import 'dotenv/config';

async function test() {
    console.log("Fetching page 14662...");
    const page = await getPageById(14662);
    if (page) {
        console.log("Success! Title:", page.title?.rendered);
    } else {
        console.log("Failed to fetch page 14662");
    }
}

test();

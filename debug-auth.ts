
import { wcFetch } from './src/lib/woocommerce';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing Size Guide Page (14662)...");
    const page = await wcFetch('wp/v2/pages/14662');
    if (page) {
        console.log("SUCCESS: Fetched page", page.title?.rendered);
    } else {
        console.log("FAILED: Could not fetch page 14662");
    }

    console.log("\nTesting Lookup the Week...");
    const look = await wcFetch('wp/v2/look-semana');
    if (look) {
        console.log("SUCCESS: Fetched look-semana", Array.isArray(look) ? look.length : "Not an array");
    } else {
        console.log("FAILED: Could not fetch look-semana");
    }
}

test();

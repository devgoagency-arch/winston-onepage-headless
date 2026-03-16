import { wcFetch } from "../lib/woocommerce.js";
import dotenv from "dotenv";
dotenv.config();

async function check() {
    try {
        const zones = await wcFetch('shipping/zones');
        console.log("ZONAS:", JSON.stringify(zones, null, 2));
        for (const zone of zones) {
            const methods = await wcFetch(`shipping/zones/${zone.id}/methods`);
            console.log(`METODOS ZONA ${zone.id} (${zone.name}):`, JSON.stringify(methods, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

check();

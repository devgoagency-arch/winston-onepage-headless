import { wcFetch } from "../../lib/woocommerce";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const zones = await wcFetch('shipping/zones');
        const fullConfig = await Promise.all(zones.map(async (zone: any) => {
            const methods = await wcFetch(`shipping/zones/${zone.id}/methods`);
            return {
                id: zone.id,
                name: zone.name,
                methods
            };
        }));

        const result = JSON.stringify(fullConfig, null, 2);
        // Escribir a un archivo para que yo pueda leerlo
        fs.writeFileSync(path.join(process.cwd(), "shipping_debug.json"), result);

        return new Response(result, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

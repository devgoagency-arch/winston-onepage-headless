const fs = require('fs');

// 1. Layout.astro
let layout = fs.readFileSync('src/layouts/Layout.astro', 'utf8');
const utmScript = <script is:inline>
            (function() {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const paramsToTrack = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid'];
                    const hasAnyNew = paramsToTrack.some(param => urlParams.get(param));
                    if (hasAnyNew) {
                        const newStored = {};
                        paramsToTrack.forEach(param => {
                            let val = urlParams.get(param);
                            if (typeof val === 'string') {
                                val = val.trim();
                                if (val) newStored[param] = val;
                            }
                        });
                        localStorage.setItem('wh_utm_data', JSON.stringify(newStored));
                    }
                } catch (e) {}
            })();
        </script>;
if (!layout.includes('wh_utm_data')) {
    layout = layout.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n        ' + utmScript);
    fs.writeFileSync('src/layouts/Layout.astro', layout);
}

// 2. metaEvents.ts
let metaEvents = fs.readFileSync('src/lib/metaEvents.ts', 'utf8');
metaEvents = metaEvents.replace('function hashData(value: string | undefined): string | undefined {', 'function hashData(value: string | undefined, key?: string): string | undefined {');
metaEvents = metaEvents.replace('const normalized = value.toLowerCase().trim();', 'let normalized = value.toLowerCase().trim();\n    if (key === \\'ct\\' || key === \\'st\\' || key === \\'fn\\' || key === \\'ln\\') {\n        normalized = normalized.normalize(\\'NFD\\').replace(/[\\\\u0300-\\\\u036f]/g, \\'\\');\n    }\n    if (key === \\'ct\\' || key === \\'st\\' || key === \\'zp\\' || key === \\'country\\' || key === \\'em\\') {\n        normalized = normalized.replace(/\\\\s+/g, \\'\\');\n    }');
metaEvents = metaEvents.replace('.map(([k, v]) => [k, hashData(v)])', '.map(([k, v]) => [k, hashData(v, k)])');
metaEvents = metaEvents.replace('const body = {\\r\\n        data: [', 'const body = {\\r\\n        test_event_code: import.meta.env.META_TEST_CODE,\\r\\n        data: [');
metaEvents = metaEvents.replace('const body = {\\n        data: [', 'const body = {\\n        test_event_code: import.meta.env.META_TEST_CODE,\\n        data: [');
fs.writeFileSync('src/lib/metaEvents.ts', metaEvents);

// 3. metaPixel.ts
let metaPixel = fs.readFileSync('src/utils/metaPixel.ts', 'utf8');
metaPixel = metaPixel.replace('fbc = b.1..;', 'fbc = b.1..;\n            try {\n                const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();\n                document.cookie = _fbc=; expires=; path=/; domain=.winstonandharrystore.com; SameSite=Lax;\n            } catch (e) {\n                // Silencioso\n            }');
fs.writeFileSync('src/utils/metaPixel.ts', metaPixel);

// 4. CheckoutPage.tsx
let checkout = fs.readFileSync('src/components/checkout/CheckoutPage.tsx', 'utf8');
checkout = checkout.replace('number: data.order_number,\\n                email: form.email,', 'number: data.order_number,\\n                key: data.order_key,\\n                email: form.email,');
checkout = checkout.replace('number: data.order_number,\\r\\n                email: form.email,', 'number: data.order_number,\\r\\n                key: data.order_key,\\r\\n                email: form.email,');
fs.writeFileSync('src/components/checkout/CheckoutPage.tsx', checkout);

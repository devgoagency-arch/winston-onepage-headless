const https = require('https');

const url = 'https://winstonandharrystore.com/wp-json/wc/store/products?per_page=1';

async function checkUrl(url) {
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(500));
        req.end();
    });
}

fetch(url)
    .then(r => r.json())
    .then(async d => {
        const src = d[0].images[0].src;
        console.log('Original:', src);

        // Try variants
        const webp1 = src + '.webp';
        const webp2 = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');

        console.log('Testing:', webp1);
        console.log('Status:', await checkUrl(webp1));

        console.log('Testing:', webp2);
        console.log('Status:', await checkUrl(webp2));

    });

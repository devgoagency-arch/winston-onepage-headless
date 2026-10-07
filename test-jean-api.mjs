import https from 'https';

const auth = Buffer.from('ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f:cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc').toString('base64');
const options = {
  hostname: 'tienda.winstonandharrystore.com',
  path: '/wp-json/wc/v3/products?slug=jean-lucania-slim-ii',
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('Total images in API:', j[0].images.length);
      j[0].images.forEach(i => console.log('-', i.src));
    } catch(e) { console.error(e) }
  });
});
req.end();

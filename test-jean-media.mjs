import https from 'https';

const auth = Buffer.from('gogerman:Jq6W SCmv Ay3R zkJX LvAj SI5J').toString('base64');
const options = {
  hostname: 'tienda.winstonandharrystore.com',
  path: '/wp-json/wp/v2/media?search=lucania',
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
      console.log('Total media found:', j.length);
      if(Array.isArray(j)){
          j.forEach(m => console.log('-', m.source_url));
      } else {
          console.log(j);
      }
    } catch(e) { console.error(e) }
  });
});
req.end();

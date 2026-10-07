import https from 'https';

const auth = Buffer.from('ck_d5f469acc9358b69a4032bf9e54c5ecb01f0dc2f:cs_8799e998019ffc7c66ab19f508ee2cba769ee7dc').toString('base64');
const options = {
  hostname: 'tienda.winstonandharrystore.com',
  path: '/wp-json/wc/v3/products/86379/variations',
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
      if (j.length > 0) {
        j.forEach((v, idx) => {
           const meta = v.meta_data?.find(m => m.key === 'wpcvi_images' || m.key === 'wd_additional_variation_images_data');
           console.log(`Variation ${idx}:`, v.image?.src);
           if (meta) {
               console.log(`Variation ${idx} WPC Meta:`, meta.value);
           }
           if (v.gallery_image_ids && v.gallery_image_ids.length > 0) {
               console.log(`Variation ${idx} gallery IDs:`, v.gallery_image_ids);
           }
        });
      }
    } catch(e) { console.error(e) }
  });
});
req.end();

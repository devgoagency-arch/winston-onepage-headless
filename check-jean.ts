globalThis.import = { meta: { env: { PUBLIC_WP_URL: 'https://tienda.winstonandharrystore.com' } } };
import 'dotenv/config'; // loads .env
import { getProductBySlug } from './src/lib/woocommerce.ts';
getProductBySlug('jean-lucania-slim-ii').then(res => {
  console.log('Images:', res.images.length);
  console.log('Variations Data Length:', res.variations?.length || 0);
  console.log('Variations:', res.variations);
  console.log('Variation Images Map:', res.variation_images_map);
}).catch(console.error);

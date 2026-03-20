// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'static',
  adapter: vercel({
    maxDuration: 300
  }),
  security: {
    checkOrigin: false
  },
  trailingSlash: 'ignore',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover'
  },
  image: {
    domains: ["winstonandharrystore.com", "staging.winstonandharrystore.com", "tienda.winstonandharrystore.com"],
  },
});
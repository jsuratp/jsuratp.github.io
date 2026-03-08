import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://YOUR_USERNAME.github.io', // Will be updated later
  integrations: [tailwind(), sitemap()],
  output: 'static',
  build: {
    format: 'directory'
  }
});

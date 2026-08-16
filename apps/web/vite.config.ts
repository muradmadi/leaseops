import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Single source of truth for the web app manifest. `public/manifest.json` is
    // no longer linked from index.html — keeping two manifests meant the browser
    // silently used whichever came first and ignored the other.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LeaseOps — RevOps PWA for Apartment Hunting',
        short_name: 'LeaseOps',
        description:
          'An autonomous Progressive Web App designed to eliminate emotional fatigue and cognitive overload from apartment hunting with mathematical lead scoring.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        categories: ['productivity', 'finance', 'utilities'],
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // The API is the source of truth for pipeline state; caching it would
        // surface stale scores after reconnecting.
        navigateFallbackDenylist: [/^\/api/],
        // Inter ships as seven unicode-range subsets. Only the latin ones can
        // render German, Spanish or English, so precaching just those keeps the
        // app in its real typeface offline without pulling 200 kB of Cyrillic,
        // Greek and Vietnamese onto a phone that will never display them. The
        // rest stay network-fetched, which is what `unicode-range` already does.
        // Only the defaults plus fonts: `includeAssets` and the plugin already
        // contribute favicon.svg and the manifest, and listing them here again
        // puts duplicate entries in the precache manifest.
        globPatterns: ['**/*.{js,css,html}', '**/inter-latin*.woff2'],
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

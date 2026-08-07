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

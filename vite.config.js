import fs from 'node:fs'
import { defineConfig } from 'vite'
import precacheManifestPlugin from './scripts/vite-precache-manifest.mjs'

// WAWIS 13.76: numer wersji do listy plików service workera (pełne pobranie wersji).
const APP_VERSION = JSON.parse(fs.readFileSync(new URL('./public/app-version.json', import.meta.url), 'utf8')).version

export default defineConfig({
  plugins: [precacheManifestPlugin({ version: APP_VERSION })],
  server: {
    hmr: {
      overlay: true,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/@supabase') || id.includes('node_modules/@supabase')) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
})

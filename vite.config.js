import fs from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import precacheManifestPlugin from './scripts/vite-precache-manifest.mjs'

// WAWIS 13.76: numer wersji do listy plików service workera (pełne pobranie wersji).
const APP_VERSION = JSON.parse(fs.readFileSync(new URL('./public/app-version.json', import.meta.url), 'utf8')).version

// WAWIS 14.50: tryb atrapy Supabase (testy E2E) ustalany przy budowaniu. Stała `false` w wersji produkcyjnej
// pozwala bundlerowi wyciąć atrapę bazy (mockSupabaseClient.js) z kodu wysyłanego na telefony i komputery.
function isSupabaseMockBuild(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return String(env.VITE_SUPABASE_MODE || '').trim().toLowerCase() === 'mock' || String(env.VITE_SUPABASE_MOCK || '') === '1'
}

export default defineConfig(({ mode }) => ({
  define: {
    __WAWIS_SUPABASE_MOCK__: JSON.stringify(isSupabaseMockBuild(mode)),
  },
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
}))

import { defineConfig } from 'vite'

export default defineConfig({
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

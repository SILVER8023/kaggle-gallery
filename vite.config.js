import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/kaggle-gallery/' : '/',
  plugins: [react()],
  build: {
    // Three.js alone exceeds the default 500 kB budget; it is cached separately.
    chunkSizeWarningLimit: 620,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        // Three.js is large but changes rarely; keeping it in its own chunk
        // lets the browser cache it across app edits.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});

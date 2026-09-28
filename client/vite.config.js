import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API in dev (mirrors production where the API is served under /api).
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: false },
      '/media': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router'], query: ['@tanstack/react-query'] },
      },
    },
  },
});

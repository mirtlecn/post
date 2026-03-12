import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/__post_admin_api__': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: () => '/api/admin',
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

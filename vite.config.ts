/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/integration/**',
    ],
  },
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@config': path.resolve(__dirname, 'config'),
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/matchmake': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
      '/colyseus': {
        target: 'http://localhost:2567',
        ws: true,
        changeOrigin: true,
      },
      '/livekit': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
      '/rooms': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
    },
  },
});

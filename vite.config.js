import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game can be hosted from any sub-path (e.g. GitHub Pages).
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});

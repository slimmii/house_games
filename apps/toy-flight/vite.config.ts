import { defineConfig } from 'vite';
import { houseBasisTranscoder, housePublicDir } from '@huis/house/vite';

export default defineConfig({
  plugins: [houseBasisTranscoder()],
  // The house assets (/models, /favicon.svg) live in @huis/house; this build ships them for both games.
  publicDir: housePublicDir,
  build: {
    outDir: 'dist/client',
    chunkSizeWarningLimit: 650,
  },
  server: {
    port: 5173,
    proxy: {
      '/matchmake': 'http://127.0.0.1:2567',
      '/health': 'http://127.0.0.1:2567',
      // Colyseus transports connect to /<processId>/<roomId>.
      '^/[^/]+/[^/]+$': { target: 'http://127.0.0.1:2567', ws: true, bypass(req) {
        if (!req.headers.upgrade) return req.url;
      } },
    },
  },
});

import { defineConfig } from 'vite';
import { houseBasisTranscoder, housePublicDir } from '@huis/house/vite';

// Production: the page is served at /defense/ by the toy-flight container, which
// already ships the house assets (/models, /basis, /favicon.svg). Development: a
// standalone server on http://localhost:5174/ that serves those assets itself.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/defense/' : '/',
  plugins: [houseBasisTranscoder({ emit: false })],
  publicDir: command === 'build' ? false : housePublicDir,
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 650,
  },
  server: { port: 5174 },
}));

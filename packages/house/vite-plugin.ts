import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** The served house assets (models, favicon). Apps use it as their Vite publicDir. */
export const housePublicDir = fileURLToPath(new URL('./public', import.meta.url));

// Serve and bundle the decoder shipped with our exact Three.js version.
// KTX2Loader requires these fixed filenames beside one another (at /basis/).
const basisDir = join(dirname(createRequire(import.meta.url).resolve('three')), '..', 'examples/jsm/libs/basis');

export function houseBasisTranscoder({ emit = true }: { emit?: boolean } = {}): Plugin {
  const assets = ['basis_transcoder.js', 'basis_transcoder.wasm'].map(name => ({ name, bytes: readFileSync(join(basisDir, name)) }));
  return {
    name: 'house-basis-transcoder',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.find(asset => request.url?.split('?')[0] === `/basis/${asset.name}`);
        if (!asset) return next();
        response.setHeader('Content-Type', asset.name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        response.end(asset.bytes);
      });
    },
    generateBundle() {
      if (emit) for (const asset of assets) this.emitFile({ type: 'asset', fileName: `basis/${asset.name}`, source: asset.bytes });
    },
  };
}

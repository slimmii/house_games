/**
 * Write maximum-quality brotli copies (`file.br`) of the built client next to
 * the originals. src/server/index.ts serves them to browsers that accept br,
 * instead of compressing ~60 MB per visitor at a low on-the-fly level.
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);
const root = resolve(process.argv[2] ?? 'dist/client');
const COMPRESSIBLE = /\.(glb|bin|js|mjs|css|html|json|svg|wasm|txt)$/;
const MIN_BYTES = 1024;
// The float debug house (?textures=original) and the server-only paint copy
// would double the build time for files browsers normally never request.
const SKIP = /models\/(house\.glb|paint-surfaces\.meshopt\.bin)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.endsWith('.br')) await rm(path);
    else if (COMPRESSIBLE.test(entry.name) && !SKIP.test(path)) yield path;
  }
}

const started = Date.now();
let before = 0;
let after = 0;
let written = 0;
const jobs = [];
for await (const path of files(root)) {
  jobs.push((async () => {
    const bytes = await readFile(path);
    if (bytes.length < MIN_BYTES) return;
    const encoded = await compress(bytes, { params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    } });
    // Already-compressed payloads (KTX2-heavy files) may not be worth it.
    if (encoded.length > bytes.length * 0.95) return;
    await writeFile(`${path}.br`, encoded);
    before += bytes.length;
    after += encoded.length;
    written++;
  })());
}
await Promise.all(jobs);
console.log(`Brotli 11: ${written} files, ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);

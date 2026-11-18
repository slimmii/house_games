/**
 * Bundles the room server into dist/server/index.js. Workspace packages (@huis/*) are
 * TypeScript sources and get bundled; every other dependency stays external (node_modules).
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const deps = url => Object.keys(JSON.parse(readFileSync(new URL(url, import.meta.url), 'utf8')).dependencies ?? {});
const external = [...new Set([...deps('../package.json'), ...deps('../../../packages/house/package.json')])]
  .filter(name => !name.startsWith('@huis/'));

await build({
  entryPoints: [new URL('../src/server/index.ts', import.meta.url).pathname],
  outfile: new URL('../dist/server/index.js', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: external.flatMap(name => [name, `${name}/*`]),
  logLevel: 'info',
});

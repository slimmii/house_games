/**
 * Copies the tower defense build (apps/tower-defense/dist) into dist/client/defense,
 * so this container serves it at /defense/. Run `npm run build -w @huis/tower-defense` first
 * (the root `npm run build` does that).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';

const source = new URL('../../tower-defense/dist/', import.meta.url);
const target = new URL('../dist/client/defense/', import.meta.url);
if (!existsSync(new URL('index.html', source))) {
  throw new Error('apps/tower-defense/dist is missing. Run `npm run build -w @huis/tower-defense` (or the root `npm run build`).');
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log('Added the tower defense build at dist/client/defense.');

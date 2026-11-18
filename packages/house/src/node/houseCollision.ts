import { readFile } from 'node:fs/promises';
import { decodeHouseCollision, installHouseCollision } from '../shared/collision.js';
import { houseModelPath } from './paths.js';

/** Installs the packed house collision mesh from disk (server startup, tests and node scripts). */
export async function installHouseCollisionFile(path = houseModelPath('house-collision.meshopt.bin')): Promise<void> {
  const file = await readFile(path);
  installHouseCollision(await decodeHouseCollision(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)));
}

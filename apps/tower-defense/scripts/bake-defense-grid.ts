/**
 * Bakes the placement grid of the defense game (src/sim/grid.generated.json)
 * from the packed house collision mesh. `--verify` fails when the committed grid
 * no longer matches the collision asset; `--print` shows the grid as text.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { installHouseCollisionFile } from '@huis/house/node/houseCollision';
import { houseModelPath } from '@huis/house/node/paths';
import { overlapsWorld, rayWorld } from '@huis/house/shared/collision';
import { GRID_SPEC, type GridFile } from '../src/sim/grid';
import { rasteriseGrid } from '../src/sim/gridBake';

const root = new URL('../', import.meta.url);
const collisionPath = pathToFileURL(houseModelPath('house-collision.meshopt.bin'));
const outputPath = new URL('src/sim/grid.generated.json', root);
// The grid depends on the collision mesh and on the rules that classify it.
const digest = createHash('sha256');
for (const path of [collisionPath, new URL('src/sim/gridBake.ts', root), new URL('src/sim/grid.ts', root)]) {
  digest.update(await readFile(path));
}
const collisionSha256 = digest.digest('hex');

if (process.argv.includes('--verify')) {
  const current = JSON.parse(await readFile(outputPath, 'utf8')) as GridFile;
  if (current.collisionSha256 !== collisionSha256) throw new Error('Defense grid is stale. Run npm run bake:defense-grid.');
  console.log('Defense grid is current.');
} else {
  await installHouseCollisionFile(collisionPath.pathname);
  const started = performance.now();
  const rows = rasteriseGrid({ ray: rayWorld, overlaps: overlapsWorld });
  const file: GridFile = { collisionSha256, ...GRID_SPEC, rows };
  if (process.argv.includes('--print')) {
    // Two cells per character keeps the room recognisable in a terminal.
    for (let row = rows.length - 1; row >= 0; row -= 2) {
      let line = (GRID_SPEC.minZ + (row + 0.5) * GRID_SPEC.cell).toFixed(1).padStart(6) + ' ';
      for (let column = 0; column < GRID_SPEC.width; column += 2) {
        const quad = [rows[row][column], rows[row][column + 1], rows[row - 1]?.[column], rows[row - 1]?.[column + 1]];
        line += quad.includes('#') ? '#' : quad.includes('n') ? 'n' : '.';
      }
      console.log(line);
    }
  }
  await writeFile(outputPath, `${JSON.stringify(file, null, 0).replace(/","/g, '",\n"').replace('"rows":[', '"rows":[\n')}\n`);
  const count = (kind: string) => rows.reduce((total, row) => total + row.split(kind).length - 1, 0);
  console.log(`Defense grid: ${count('.')} open, ${count('n')} low, ${count('#')} blocked cells in ${(performance.now() - started).toFixed(0)} ms.`);
}

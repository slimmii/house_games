/** Derive precise interaction targets from the actual moving door hardware. */
import { NodeIO } from '@gltf-transform/core';
import { Box3, Matrix4, Vector3 } from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const asset = new URL('../public/models/doors.glb', import.meta.url);
const document = await new NodeIO().read(asset.pathname);
const manifest = JSON.parse(await readFile(new URL('../src/shared/doors-manifest.json', import.meta.url), 'utf8')) as {
  id: string; label: string; fixed: boolean; min: number[]; max: number[];
}[];
const point = new Vector3();
const targets: Record<string, { min: number[]; max: number[]; sourceName: string }[]> = {};
for (const definition of manifest) {
  const root = document.getRoot().listNodes().find(node => node.getName() === definition.id);
  if (!root) throw new Error(`Missing door assembly ${definition.id}`);
  targets[definition.id] = [];
  if (definition.fixed) continue;
  root.traverse(node => {
    if (!/(handle|lever|door pull)/i.test(node.getName())) return;
    const mesh = node.getMesh();
    if (!mesh) return;
    const box = new Box3();
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (!positions) continue;
      const vertex: number[] = [];
      for (let index = 0; index < positions.getCount(); index++) {
        positions.getElement(index, vertex);
        box.expandByPoint(point.fromArray(vertex).applyMatrix4(matrix));
      }
    }
    if (!box.isEmpty()) targets[definition.id].push({
      min: box.min.toArray().map(value => +value.toFixed(6)),
      max: box.max.toArray().map(value => +value.toFixed(6)),
      sourceName: node.getName(),
    });
  });
  // These two authored assemblies have no handle. Their actual visible panel
  // remains the target; they must never use proximity or an invisible handle.
  if (!targets[definition.id].length) {
    if (!['Garage', 'Veranda slider'].includes(definition.label)) {
      throw new Error(`No handle target found for ${definition.label}`);
    }
    targets[definition.id].push({ min: definition.min, max: definition.max, sourceName: `${definition.label} panel` });
  }
}
const sourceSha256 = createHash('sha256').update(await readFile(asset)).digest('hex');
await writeFile(new URL('../src/shared/room-door-targets.json', import.meta.url), JSON.stringify({ sourceSha256, targets }, null, 2) + '\n');
console.log(`Prepared handle targets for ${manifest.filter(door => !door.fixed).length} room doors.`);

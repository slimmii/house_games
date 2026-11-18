/** Packs the canonical house-collision.json into a compact meshopt asset loaded at runtime. */
import { MeshoptEncoder } from 'meshoptimizer';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeHouseCollision, HOUSE_COLLISION_MAGIC } from '../src/shared/collision';

const root = new URL('../', import.meta.url);
const inputs = ['src/shared/house-collision.json', 'scripts/prepare-house-collision.ts'];
const digest = createHash('sha256');
for (const path of inputs) digest.update(await readFile(new URL(path, root)));
const sourceSha256 = digest.digest('hex');
const output = new URL('public/models/house-collision.meshopt.bin', root);
const manifestPath = new URL('public/models/house-collision.json', root);
if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const assetSha256 = createHash('sha256').update(await readFile(output)).digest('hex');
  if (manifest.sourceSha256 !== sourceSha256 || manifest.assetSha256 !== assetSha256) throw new Error('House collision asset is stale. Run npm run prepare:collision.');
  console.log('House collision asset is current.');
} else {
  const { positions, indices } = JSON.parse(await readFile(new URL(inputs[0], root), 'utf8')) as { positions: number[]; indices: number[] };
  const vertices = positions.length / 3;
  if (!Number.isInteger(vertices) || indices.length % 3 || indices.some(index => !Number.isInteger(index) || index < 0 || index >= vertices)) {
    throw new Error('house-collision.json must contain whole vertices and valid triangle indices');
  }
  // Exported positions are rounded decimals: fixed-point int32 decodes (v / scale) to the identical double.
  const scale = [1e3, 1e4, 1e5, 1e6].find(scale => positions.every(value =>
    Math.abs(Math.round(value * scale)) < 2 ** 31 && Math.round(value * scale) / scale === value)) ?? 0;
  // JSON keeps the sign of -0; the otherwise unused int32 minimum stands for it.
  const raw = scale ? Int32Array.from(positions, value => Object.is(value, -0) ? -(2 ** 31) : Math.round(value * scale)) : Float64Array.from(positions);
  await MeshoptEncoder.ready;
  const vertexStream = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(raw.buffer), vertices, scale ? 12 : 24);
  const indexStream = MeshoptEncoder.encodeIndexSequence(new Uint8Array(Uint32Array.from(indices).buffer), indices.length, 4);
  const encoded = new Uint8Array(24 + vertexStream.length + indexStream.length);
  new Uint32Array(encoded.buffer, 0, 6).set([HOUSE_COLLISION_MAGIC, vertices, indices.length, vertexStream.length, indexStream.length, scale]);
  encoded.set(vertexStream, 24);
  encoded.set(indexStream, 24 + vertexStream.length);
  const decoded = await decodeHouseCollision(encoded.buffer);
  if (decoded.positions.length !== positions.length || decoded.indices.length !== indices.length
    || positions.some((value, i) => !Object.is(decoded.positions[i], value)) || indices.some((value, i) => decoded.indices[i] !== value)) {
    throw new Error('House collision encoding is not lossless');
  }
  await writeFile(output, encoded);
  await writeFile(manifestPath, JSON.stringify({ sourceSha256, assetSha256: createHash('sha256').update(encoded).digest('hex'),
    vertices, triangles: indices.length / 3, positionScale: scale, bytes: encoded.length }, null, 2) + '\n');
  console.log(`${vertices} vertices, ${indices.length / 3} triangles, ${scale ? `int32 at 1/${scale}` : 'float64'}, ${(encoded.length / 1048576).toFixed(1)} MiB meshopt-encoded.`);
}

// Derives area-light emitters for the emissive lamp meshes in public/models/house.glb
// and writes src/client/house-lamp-emitters.json for the offline lighting bake.
// Output is fully derived from the GLB (never hand-edit it) and deterministic.
// Units: game units (1 unit = 1/3 m), Y up.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const GLB_PATH = 'public/models/house.glb';
const FIXTURES_PATH = 'src/client/house-light-fixtures.json';
const MANIFEST_PATH = 'public/models/house-manifest.json';
const OUTPUT_PATH = 'src/client/house-lamp-emitters.json';
const EXCLUDED_PREFIXES = ['Reference lighting /', 'Game lighting /']; // already covered by house-light-fixtures.json
const DEDUPE_DISTANCE = 1.0; // units; emitters this close to a fixture are dropped
// intensity = emissiveStrength * area * INTENSITY_PER_EMISSIVE_AREA. Kept at 1.0 so the
// value is a plain "radiant exitance x area" measure; the bake applies its own scale.
const INTENSITY_PER_EMISSIVE_AREA = 1.0;
const HOUSE_BOUNDS = { min: [-0.3, -0.6, -33.2], max: [22.5, 25.5, 2.1] }; // src/shared/world.ts

const round = (v, d = 6) => Number(v.toFixed(d)) + 0; // "+ 0" normalises -0
const roundVec = (v, d) => v.map((x) => round(x, d));

await MeshoptDecoder.ready;
const glbBytes = await readFile(GLB_PATH);
const sourceSha256 = createHash('sha256').update(glbBytes).digest('hex');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});
const document = await io.readBinary(new Uint8Array(glbBytes));
const fixtures = JSON.parse(await readFile(FIXTURES_PATH, 'utf8'));
const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const floors = [...(manifest.gameFloorElevations ?? [0])].sort((a, b) => a - b);

function emissiveInfo(material) {
  if (!material || EXCLUDED_PREFIXES.some(prefix => material.getName().startsWith(prefix))) return null;
  const factor = material.getEmissiveFactor();
  const max = Math.max(...factor);
  if (!(max > 0)) return null;
  const strength = material.getExtension('KHR_materials_emissive_strength')?.getEmissiveStrength() ?? 1;
  return { factor, max, strength };
}

function transform(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function triangleArea(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
  return 0.5 * Math.hypot(x, y, z);
}

// 1+2. One accumulator per emissive node: merged world AABB + summed world surface area.
const candidates = [];
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const world = node.getWorldMatrix();
  let acc = null;
  for (const prim of mesh.listPrimitives()) {
    const info = emissiveInfo(prim.getMaterial());
    const posAccessor = prim.getAttribute('POSITION');
    if (!info || !posAccessor || prim.getMode() !== 4) continue; // TRIANGLES only
    acc ??= { node, material: prim.getMaterial().getName(), info, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], area: 0 };
    const pts = [];
    for (let i = 0; i < posAccessor.getCount(); i++) {
      const p = transform(world, posAccessor.getElement(i, []));
      pts.push(p);
      for (let k = 0; k < 3; k++) { acc.min[k] = Math.min(acc.min[k], p[k]); acc.max[k] = Math.max(acc.max[k], p[k]); }
    }
    const indices = prim.getIndices();
    const triCount = indices ? indices.getCount() / 3 : pts.length / 3;
    for (let t = 0; t < triCount; t++) {
      const [a, b, c] = [0, 1, 2].map((j) => pts[indices ? indices.getScalar(t * 3 + j) : t * 3 + j]);
      acc.area += triangleArea(a, b, c);
    }
  }
  if (acc) candidates.push(acc);
}

// 3. Dedupe against the hand-placed reference fixtures.
const dropped = [];
const kept = candidates.filter((c) => {
  const centre = c.min.map((v, k) => (v + c.max[k]) / 2);
  for (const f of fixtures) {
    const d = Math.hypot(...centre.map((v, k) => v - f.position[k]));
    if (d < DEDUPE_DISTANCE) {
      dropped.push({ name: c.node.getName(), material: c.material, fixture: f.name, distance: round(d, 3) });
      return false;
    }
  }
  return true;
});

// 4. Build emitter records.
const houseCentre = HOUSE_BOUNDS.min.map((v, k) => (v + HOUSE_BOUNDS.max[k]) / 2);
const emitters = kept.map((c) => {
  const size = c.max.map((v, k) => v - c.min[k]);
  const position = c.min.map((v, k) => (v + c.max[k]) / 2);
  const horizontal = Math.max(size[0], size[2]);
  let direction, radius;
  if (size[1] < 0.25 * horizontal) {
    // Flat in Y: a disc facing straight down or up. It is treated as ceiling-mounted
    // (emitting down) when its lowest point sits more than 2 units (~0.67 m) above the
    // nearest floor elevation at or below it; otherwise it is a floor/table lamp facing up.
    const floorBelow = floors.filter((f) => f <= c.min[1] + 1e-3).at(-1) ?? floors[0];
    direction = c.min[1] - floorBelow > 2 ? [0, -1, 0] : [0, 1, 0];
    radius = horizontal / 2;
  } else {
    // Tall fixture (e.g. a wall lamp). Real wall normals are not known here, so we
    // approximate "away from the nearest wall" with the horizontal direction from the
    // lamp toward the house-bounds centre (lamps on outer walls face inward).
    const dx = houseCentre[0] - position[0], dz = houseCentre[2] - position[2];
    const len = Math.hypot(dx, dz) || 1;
    direction = [dx / len, 0, dz / len];
    radius = size[1] / 2;
  }
  const emissiveStrength = c.info.max * c.info.strength;
  return {
    name: c.node.getName(),
    material: c.material,
    type: 'disc',
    position: roundVec(position),
    direction: roundVec(direction),
    radius: round(radius),
    area: round(c.area),
    emissiveStrength: round(emissiveStrength),
    color: roundVec(c.info.factor.map((v) => v / c.info.max)),
    intensity: round(emissiveStrength * c.area * INTENSITY_PER_EMISSIVE_AREA),
    bounds: { min: roundVec(c.min), max: roundVec(c.max) },
  };
});

// 5. Deterministic output.
emitters.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const output = { sourceSha256, generatedBy: 'scripts/derive-lamp-emitters.mjs', emitters };
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

// 6. Summary.
const outside = emitters.filter((e) => e.position.some((v, k) => v < HOUSE_BOUNDS.min[k] || v > HOUSE_BOUNDS.max[k]));
console.table(emitters.map((e) => ({
  name: e.name,
  material: e.material,
  position: e.position.map((v) => v.toFixed(2)).join(', '),
  direction: e.direction.map((v) => v.toFixed(2)).join(', '),
  radius: e.radius.toFixed(3),
  intensity: e.intensity.toFixed(3),
})));
if (dropped.length) {
  console.log('Dropped (centre within %s unit of a reference fixture):', DEDUPE_DISTANCE);
  console.table(dropped);
}
if (outside.length) console.warn('WARNING: emitters outside HOUSE_BOUNDS:', outside.map((e) => e.name));
console.log(`Wrote ${emitters.length} emitters to ${OUTPUT_PATH} (source ${sourceSha256.slice(0, 12)})`);

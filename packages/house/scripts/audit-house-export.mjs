#!/usr/bin/env node
// Compares a fresh house export against a baseline snapshot so regressions
// (lost meshes, materials, collision or bake coverage) are caught before commit.
//
//   node scripts/audit-house-export.mjs --snapshot <dir>      copy the live assets into <dir>
//   node scripts/audit-house-export.mjs [--baseline <dir>] [--candidate <dir>] [--json <out.json>]
//
// Defaults: baseline = test-results/pipeline-baseline; candidate = $PIPELINE_OUT
// if set, else the live project files. A directory may hold the files flat
// (snapshot layout) or in project layout (public/models/..., src/shared/...).
// Exit 1 when anything is missing in the candidate or a triangle count drops
// by more than 0.5%. Read-only except for --snapshot and --json.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  house: 'public/models/house.glb',
  manifest: 'public/models/house-manifest.json',
  doorsGlb: 'public/models/doors.glb',
  lighting: 'public/models/house-baked-lighting.json',
  paint: 'public/models/paint-surfaces.json',
  collision: 'src/shared/house-collision.json',
  doors: 'src/shared/doors-manifest.json',
  closets: 'src/shared/closets-manifest.json',
  windows: 'src/shared/window-collision.json',
};
const OAK_MATERIAL = 'Reference floor / warm greige oak wide staggered planks';
const STAIR_TEXTURE = 'Stair brick / continuous metric sheet';
const TOLERANCE = 0.005;
const PRINT_CAP = 40;

function usage(message) {
  if (message) console.error(`audit-house-export: ${message}`);
  console.error('Usage: node scripts/audit-house-export.mjs [--baseline <dir>] [--candidate <dir>] [--json <out.json>]\n'
    + '       node scripts/audit-house-export.mjs --snapshot <dir>');
  process.exit(2);
}
const args = { baseline: 'test-results/pipeline-baseline', candidate: process.env.PIPELINE_OUT || null, json: null, snapshot: null };
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in args) || !process.argv[i].startsWith('--')) usage(`unknown argument ${process.argv[i]}`);
  const value = process.argv[++i];
  if (!value || value.startsWith('--')) usage(`--${key} needs a value`);
  args[key] = value;
}

// Snapshot mode: copy live files flat into the directory.
if (args.snapshot) {
  const dir = resolve(args.snapshot);
  await mkdir(dir, { recursive: true });
  for (const rel of Object.values(FILES)) {
    const from = join(ROOT, rel);
    if (!existsSync(from)) { console.warn(`snapshot: ${rel} does not exist, not copied`); continue; }
    await copyFile(from, join(dir, basename(rel)));
  }
  await writeFile(join(dir, 'snapshot.json'), JSON.stringify({ createdAt: new Date().toISOString(), root: ROOT, files: FILES }, null, 2) + '\n');
  console.log(`Snapshot of ${Object.keys(FILES).length} files written to ${dir}`);
  process.exit(0);
}

function locate(dir, rel) {
  if (!dir) return join(ROOT, rel);
  for (const candidate of [join(dir, basename(rel)), join(dir, rel)]) if (existsSync(candidate)) return candidate;
  return null;
}
const sides = {
  baseline: resolve(ROOT, args.baseline),
  candidate: args.candidate ? resolve(ROOT, args.candidate) : null,
};
if (!existsSync(sides.baseline)) {
  usage(`baseline ${sides.baseline} does not exist. Capture one first with --snapshot ${args.baseline}`);
}

const report = { summary: null, missing: [], added: [], changed: [], bytes: [], info: [] };
const fail = (category, detail) => report.missing.push({ category, detail });
const percent = (a, b) => (a === 0 ? (b === 0 ? 0 : Infinity) : (b - a) / a);
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n));

// `triangles`: a drop beyond tolerance fails; any other change beyond tolerance warns.
function compareCount(label, a, b, { triangles = false } = {}) {
  if (a === undefined && b === undefined) return;
  if (a === undefined || b === undefined) { report.changed.push({ label, baseline: a ?? null, candidate: b ?? null, level: 'warn' }); return; }
  if (a === b) return;
  const delta = percent(a, b);
  const beyond = Math.abs(delta) > TOLERANCE;
  const level = triangles && delta < -TOLERANCE ? 'fail' : beyond ? 'warn' : 'info';
  report.changed.push({ label, baseline: a, candidate: b, delta, level });
}
function compareSets(category, a, b) {
  const missing = [...a].filter((x) => !b.has(x)).sort();
  const added = [...b].filter((x) => !a.has(x)).sort();
  if (missing.length) report.missing.push({ category, items: missing });
  if (added.length) report.added.push({ category, items: added });
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// --- GLB summary -----------------------------------------------------------
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const TRIANGLES = 4;

async function summarizeGlb(path) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  const textures = root.listTextures();
  const textureName = (t) => t.getName() || t.getURI() || `#${textures.indexOf(t)}`;
  const materials = root.listMaterials();
  const trianglesByMaterial = new Map();
  let primitives = 0;
  let triangles = 0;
  const nonTriangleModes = new Map();
  // Count per node instance: deduplicated exports share one mesh between many
  // nodes, and the game draws every instance.
  const meshInstances = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh) meshInstances.set(mesh, (meshInstances.get(mesh) ?? 0) + 1);
  }
  for (const mesh of root.listMeshes()) {
    const instances = meshInstances.get(mesh) ?? 1;
    for (const prim of mesh.listPrimitives()) {
      primitives++;
      const mode = prim.getMode();
      if (mode !== TRIANGLES) { nonTriangleModes.set(mode, (nonTriangleModes.get(mode) ?? 0) + 1); continue; }
      const count = instances * (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
      const key = prim.getMaterial()?.getName() || '(no material)';
      trianglesByMaterial.set(key, (trianglesByMaterial.get(key) ?? 0) + count);
      triangles += count;
    }
  }
  const materialInfo = {};
  for (const m of materials) {
    const e = m.getEmissiveFactor();
    materialInfo[m.getName() || '(unnamed)'] = {
      extensions: m.listExtensions().map((x) => x.extensionName).sort(),
      emissive: Boolean(m.getEmissiveTexture()) || e.some((v) => v > 0),
      alphaMode: m.getAlphaMode(),
    };
  }
  return {
    counts: {
      nodes: root.listNodes().length, meshes: root.listMeshes().length, primitives,
      materials: materials.length, textures: textures.length, triangles,
    },
    nodeNames: new Set(root.listNodes().map((n) => n.getName())),
    materialNames: new Set(materials.map((m) => m.getName() || '(unnamed)')),
    textureNames: new Set(textures.map(textureName)),
    trianglesByMaterial: Object.fromEntries(trianglesByMaterial),
    materialInfo,
    nonTriangleModes: Object.fromEntries(nonTriangleModes),
  };
}

const started = Date.now();
const paths = {};
for (const [side, dir] of Object.entries(sides)) {
  paths[side] = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, locate(dir, rel)]));
}
for (const [key, rel] of Object.entries(FILES)) {
  if (!paths.baseline[key]) report.info.push(`baseline has no ${basename(rel)}; not compared`);
  else if (!paths.candidate[key]) fail('Files', basename(rel));
}
const both = (key) => paths.baseline[key] && paths.candidate[key];
const readJson = async (side, key) => JSON.parse(await readFile(paths[side][key], 'utf8'));

// Hashes: byte-level differences are expected after any re-export.
for (const key of Object.keys(FILES)) {
  if (!both(key)) continue;
  const [a, b] = await Promise.all([sha256(paths.baseline[key]), sha256(paths.candidate[key])]);
  if (a !== b) report.bytes.push({ label: basename(FILES[key]), baseline: a.slice(0, 12), candidate: b.slice(0, 12) });
}

if (both('house')) {
  // Sequential loads: only the summaries (not both documents) stay alive.
  const a = await summarizeGlb(paths.baseline.house);
  const b = await summarizeGlb(paths.candidate.house);
  report.summary = { baseline: a.counts, candidate: b.counts };
  for (const k of Object.keys(a.counts)) compareCount(`house.glb ${k}`, a.counts[k], b.counts[k], { triangles: k === 'triangles' });
  compareSets('house.glb node names', a.nodeNames, b.nodeNames);
  compareSets('house.glb material names', a.materialNames, b.materialNames);
  compareSets('house.glb texture names', a.textureNames, b.textureNames);
  for (const [name, count] of Object.entries(a.trianglesByMaterial)) {
    if (!(name in b.trianglesByMaterial)) { if (b.materialNames.has(name)) fail('Material triangles', `${name} (${fmt(count)} triangles, now unused)`); continue; }
    compareCount(`triangles: ${name}`, count, b.trianglesByMaterial[name], { triangles: true });
  }
  for (const [name, info] of Object.entries(a.materialInfo)) {
    const other = b.materialInfo[name];
    if (!other) continue;
    for (const field of ['extensions', 'emissive', 'alphaMode']) {
      const [x, y] = [JSON.stringify(info[field]), JSON.stringify(other[field])];
      if (x !== y) report.changed.push({ label: `material ${field}: ${name}`, baseline: x, candidate: y, level: 'warn' });
    }
  }
  if (Object.keys(b.nonTriangleModes).length) report.info.push(`candidate has non-triangle primitives by mode: ${JSON.stringify(b.nonTriangleModes)}`);
  for (const [label, present] of [[`material "${OAK_MATERIAL}"`, (s) => s.materialNames.has(OAK_MATERIAL)],
    [`texture "${STAIR_TEXTURE}"`, (s) => s.textureNames.has(STAIR_TEXTURE)]]) {
    if (present(a) && !present(b)) fail('Required content', label);
    else if (!present(a)) report.info.push(`baseline lacks ${label}`);
  }
}

if (both('manifest')) {
  const [a, b] = [await readJson('baseline', 'manifest'), await readJson('candidate', 'manifest')];
  compareSets('house-manifest keys', new Set(Object.keys(a)), new Set(Object.keys(b)));
  if (a.continuousStairBrick && !b.continuousStairBrick) fail('Required content', 'house-manifest continuousStairBrick');
  const scopes = (m) => new Set((m.incrementalVisualReplacements ?? []).map((r) => r.scope ?? r.material ?? JSON.stringify(r)));
  compareSets('house-manifest incrementalVisualReplacements scopes', scopes(a), scopes(b));
  if (JSON.stringify(a.houseBounds) !== JSON.stringify(b.houseBounds)) {
    report.changed.push({ label: 'houseBounds', baseline: JSON.stringify(a.houseBounds), candidate: JSON.stringify(b.houseBounds), level: 'warn' });
  }
  compareCount('manifest collisionTriangleCount', a.collisionTriangleCount, b.collisionTriangleCount, { triangles: true });
  compareCount('manifest visualObjectCount', a.visualObjectCount, b.visualObjectCount);
  compareCount('manifest collisionObjectCount', a.collisionObjectCount, b.collisionObjectCount);
  for (const key of ['sourceSha256', 'visualSha256', 'collisionSha256']) {
    if (a[key] !== b[key]) report.bytes.push({ label: `manifest ${key}`, baseline: String(a[key]).slice(0, 12), candidate: String(b[key]).slice(0, 12) });
  }
}

if (both('collision')) {
  const summary = async (side) => {
    const c = await readJson(side, 'collision');
    return { vertices: c.positions.length / 3, triangles: (c.indices ?? c.positions).length / (c.indices ? 3 : 9) };
  };
  const [a, b] = [await summary('baseline'), await summary('candidate')];
  compareCount('house-collision vertices', a.vertices, b.vertices);
  compareCount('house-collision triangles', a.triangles, b.triangles, { triangles: true });
}

if (both('doors')) {
  const [a, b] = [await readJson('baseline', 'doors'), await readJson('candidate', 'doors')];
  compareCount('doors-manifest entries', a.length, b.length);
  compareSets('doors-manifest ids', new Set(a.map((d) => d.id)), new Set(b.map((d) => d.id)));
}
if (both('closets')) {
  const [a, b] = [await readJson('baseline', 'closets'), await readJson('candidate', 'closets')];
  compareCount('closets-manifest entries', a.entries.length, b.entries.length);
  compareSets('closets-manifest ids', new Set(a.entries.map((e) => e.id)), new Set(b.entries.map((e) => e.id)));
}
if (both('windows')) {
  const [a, b] = [await readJson('baseline', 'windows'), await readJson('candidate', 'windows')];
  compareCount('window-collision panes', a.panes.length, b.panes.length);
  const tris = (w) => w.panes.reduce((sum, p) => sum + p.triangleCount, 0);
  compareCount('window-collision triangles', tris(a), tris(b), { triangles: true });
  compareSets('window-collision pane names', new Set(a.panes.map((p) => p.name)), new Set(b.panes.map((p) => p.name)));
}
if (both('lighting')) {
  const [a, b] = [await readJson('baseline', 'lighting'), await readJson('candidate', 'lighting')];
  compareCount('baked lighting entries', a.entries.length, b.entries.length);
  compareCount('baked lighting sourceTriangles', a.subdivision?.sourceTriangles, b.subdivision?.sourceTriangles, { triangles: true });
  compareCount('baked lighting renderedTriangles', a.subdivision?.renderedTriangles, b.subdivision?.renderedTriangles, { triangles: true });
}
if (both('paint')) {
  const [a, b] = [await readJson('baseline', 'paint'), await readJson('candidate', 'paint')];
  compareCount('paint-surfaces meshes', a.meshes, b.meshes);
  compareCount('paint-surfaces vertices', a.vertices, b.vertices);
  compareCount('paint-surfaces triangles', a.triangles, b.triangles, { triangles: true });
}
if (both('doorsGlb')) {
  const summary = async (side) => {
    const doc = await io.read(paths[side].doorsGlb);
    return new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  };
  const [a, b] = [await summary('baseline'), await summary('candidate')];
  compareCount('doors.glb nodes', a.size, b.size);
  compareSets('doors.glb node names', a, b);
}

// --- Report ----------------------------------------------------------------
const seconds = (Date.now() - started) / 1000;
const failures = report.missing.length + report.changed.filter((c) => c.level === 'fail').length;
const list = (items) => {
  const shown = items.slice(0, PRINT_CAP).map((x) => `      ${x}`);
  if (items.length > PRINT_CAP) shown.push(`      ... and ${items.length - PRINT_CAP} more`);
  return shown.join('\n');
};
console.log(`House export audit\n  baseline:  ${sides.baseline}\n  candidate: ${sides.candidate ?? `${ROOT} (live)`}\n`);
if (report.summary) {
  const c = report.summary.candidate;
  console.log(`house.glb (candidate): ${Object.entries(c).map(([k, v]) => `${fmt(v)} ${k}`).join(', ')}\n`);
}
console.log(`Missing in candidate (failures): ${report.missing.length ? '' : 'none'}`);
for (const m of report.missing) console.log(m.items ? `  ${m.category} (${m.items.length}):\n${list(m.items)}` : `  ${m.category}: ${m.detail}`);
console.log(`\nAdded in candidate (info): ${report.added.length ? '' : 'none'}`);
for (const m of report.added) console.log(`  ${m.category} (${m.items.length}):\n${list(m.items)}`);
console.log(`\nChanged counts: ${report.changed.length ? '' : 'none'}`);
for (const c of report.changed) {
  const delta = typeof c.delta === 'number' ? ` (${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(2)}%)` : '';
  console.log(`  [${c.level.toUpperCase()}] ${c.label}: ${fmt(c.baseline)} -> ${fmt(c.candidate)}${delta}`);
}
console.log(`\nByte-level differences (expected): ${report.bytes.length ? '' : 'none'}`);
for (const d of report.bytes) console.log(`  ${d.label}: ${d.baseline} -> ${d.candidate}`);
if (report.info.length) console.log(`\nNotes:\n${report.info.map((x) => `  ${x}`).join('\n')}`);
console.log(`\n${failures ? `FAIL: ${failures} problem(s)` : 'OK: nothing missing, no triangle count dropped by more than 0.5%'} (${seconds.toFixed(1)} s)`);

if (args.json) {
  const out = resolve(args.json);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ baseline: sides.baseline, candidate: sides.candidate ?? ROOT, ok: !failures, seconds, ...report }, null, 2) + '\n');
  console.log(`JSON report written to ${out}`);
}
process.exit(failures ? 1 : 0);

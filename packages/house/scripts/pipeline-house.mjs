#!/usr/bin/env node
// Regenerates every game asset from the canonical Blender file by running the
// existing export/prepare/bake scripts in their required order. Each stage is
// a thin wrapper around the documented command; this file adds no asset logic.
//
//   npm run pipeline:house                          full run
//   npm run pipeline:house -- --list                list stages
//   npm run pipeline:house -- --from compress       resume at a stage
//   npm run pipeline:house -- --only windows,paint  run selected stages
//   npm run pipeline:house -- --skip-blender        skip stages needing Blender
//   HOUSE_BLEND=path/to/copy.blend npm run pipeline:house   export another .blend file
//   npm run pipeline:house -- --closets             include the closet inventory refresh
//   npm run pipeline:house -- --baseline <dir>      audit against a snapshot at the end
//   npm run pipeline:house -- --dry-run             print commands only
//
// Blender: $BLENDER, else /Applications/Blender.app/Contents/MacOS/Blender.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// --source <file> or $HOUSE_BLEND selects another .blend (for example a copy with a test object).
const BLEND = resolve(ROOT, process.env.HOUSE_BLEND || '../../models/Huis_Oude_Terelststraat_15.blend');
const BLEND_ARG = relative(ROOT, BLEND);
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const CLOSET_INVENTORY = join(tmpdir(), 'closet-source-inventory.json');
const TOKTX_HINT = 'Install the official KTX-Software tools (https://github.com/KhronosGroup/KTX-Software/releases), '
  + 'or set TOKTX=/path/to/toktx if the encoder is not on PATH.';

const blender = (script, ...extra) => ({ cmd: BLENDER, args: ['-b', BLEND_ARG, '--python', script, ...extra], blender: true });
const blenderFactory = (script, ...extra) =>
  ({ cmd: BLENDER, args: ['--background', '--factory-startup', BLEND_ARG, '--python', script, ...extra], blender: true });
const node = (...args) => ({ cmd: 'node', args });
const npm = (script) => ({ cmd: 'npm', args: ['run', script] });

function onPath(name) {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => {
    try { accessSync(join(dir, name), constants.X_OK); return true; } catch { return false; }
  });
}

const STAGES = [
  { name: 'export-house', blender: true,
    produces: 'public/models/house.glb, house-manifest.json, src/shared/house-collision.json (+ inventory)',
    steps: [blender('scripts/export-house.py')] },
  { name: 'oak-floor', blender: true,
    produces: 'first-floor reference oak merged into house.glb (skipped when already integrated)',
    steps: [blender('scripts/export-reference-oak-floor.py'),
      { ...node('scripts/merge-reference-oak-floor.mjs'), skipWhen: /Reference oak floor already integrated/ }] },
  { name: 'stair-brick', blender: true,
    produces: 'public/models/stair-brick-continuous.png + repaired stair UVs in house.glb',
    steps: [blender('scripts/bake-stair-brick-sheet.py'), node('scripts/repair-stair-brick-uv.mjs')] },
  { name: 'optimize', produces: 'losslessly packaged house.glb', steps: [npm('optimize:house')] },
  { name: 'doors', blender: true,
    produces: 'public/models/doors.glb, src/shared/doors-manifest.json, room-door-targets.json',
    steps: [blender('scripts/export-doors.py'), node('--import', 'tsx', 'scripts/prepare-door-targets.ts')] },
  { name: 'closets', blender: true, optional: true,
    produces: 'src/shared/closets-manifest.json, refreshed collision, room-door-targets.json (--closets only)',
    steps: [blenderFactory('scripts/closet-inventory.py', '--', '--all', '--output', CLOSET_INVENTORY),
      node('scripts/closet-inventory.mjs', '--source', CLOSET_INVENTORY),
      blenderFactory('scripts/export-house.py', '--', '--collision-only'),
      node('--import', 'tsx', 'scripts/prepare-door-targets.ts')] },
  { name: 'collision', produces: 'public/models/house-collision.meshopt.bin, house-collision.json', steps: [npm('prepare:collision')] },
  { name: 'windows', produces: 'src/shared/window-collision.json', steps: [npm('prepare:windows')] },
  { name: 'compress', produces: 'public/models/house-gpu.glb, house-gpu-manifest.json', steps: [npm('compress:house')],
    precheck: () => {
      if (process.env.TOKTX) return existsSync(process.env.TOKTX) ? null : `TOKTX=${process.env.TOKTX} does not exist. ${TOKTX_HINT}`;
      return onPath('toktx') ? null : `toktx is not on PATH. ${TOKTX_HINT}`;
    } },
  { name: 'backfaces', produces: 'src/client/architecture-backfaces.json', steps: [npm('prepare:backfaces')] },
  { name: 'paint', produces: 'public/models/paint-surfaces.meshopt.bin, paint-surfaces.json', steps: [npm('prepare:paint')] },
  { name: 'emitters', produces: 'src/client/house-lamp-emitters.json', steps: [npm('derive:emitters')],
    precheck: () => existsSync(join(ROOT, 'scripts/derive-lamp-emitters.mjs')) ? null
      : 'scripts/derive-lamp-emitters.mjs is missing (npm run derive:emitters needs it).' },
  { name: 'lighting', produces: 'public/models/house-light-volume.{json,bin} (lamp volume, seconds); with --full-bake also the classic bake', steps: [npm('bake:volume')] },
  { name: 'visibility', produces: 'public/models/house-visibility.{json,bin.gz} (per-voxel batch culling, ~15 min in headless Chrome)',
    steps: [npm('bake:visibility')] },
  { name: 'verify', produces: 'nothing (surface and ceiling checks)', steps: [npm('verify:house'), npm('verify:ceilings')] },
  { name: 'build', produces: 'apps/*/dist (monorepo build: typecheck + companion-asset integrity checks)', steps: [{ cmd: 'npm', args: ['run', 'build', '--prefix', '../..'] }] },
  { name: 'audit', optional: true, produces: 'report: fresh assets vs. --baseline snapshot',
    steps: [] /* filled in from --baseline */ },
];
const NAMES = STAGES.map((s) => s.name);

function fail(message) {
  console.error(`pipeline-house: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { list: false, from: null, only: null, skipBlender: false, closets: false, out: null, baseline: null, dryRun: false };
  const valueOf = (i, flag) => {
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`${flag} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--list': options.list = true; break;
      case '--skip-blender': options.skipBlender = true; break;
      case '--closets': options.closets = true; break;
      case '--no-bake': options.noBake = true; break;
      case '--full-bake': options.fullBake = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--from': options.from = valueOf(i++, arg); break;
      case '--only': options.only = valueOf(i++, arg).split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--out': options.out = resolve(valueOf(i++, arg)); break;
      case '--baseline': options.baseline = resolve(valueOf(i++, arg)); break;
      case '-h': case '--help': options.list = true; break;
      default: fail(`unknown argument ${arg} (see --list)`);
    }
  }
  for (const name of [options.from, ...(options.only ?? [])].filter(Boolean)) {
    if (!NAMES.includes(name)) fail(`unknown stage "${name}". Stages: ${NAMES.join(', ')}`);
  }
  if (options.from && options.only) fail('use either --from or --only, not both');
  return options;
}

function printList() {
  console.log('Stages (in order):');
  for (const [i, stage] of STAGES.entries()) {
    const tags = [stage.blender && 'blender', stage.name === 'closets' && 'needs --closets', stage.name === 'audit' && 'needs --baseline']
      .filter(Boolean).join(', ');
    console.log(`  ${String(i + 1).padStart(2)}. ${stage.name.padEnd(13)} ${stage.produces}${tags ? `  [${tags}]` : ''}`);
  }
  console.log(`
Options: --list, --from <stage>, --only <stage[,stage]>, --skip-blender, --closets,
         --baseline <dir> (adds the audit stage), --out <dir> (sets PIPELINE_OUT), --dry-run
Blender: ${BLENDER}${process.env.BLENDER ? ' ($BLENDER)' : ' (default; override with $BLENDER)'}
Source:  ${BLEND_ARG}`);
}

const quote = (s) => (/^[\w./:=@%+,-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
const show = (step) => [step.cmd === BLENDER ? (process.env.BLENDER ? '$BLENDER' : step.cmd) : step.cmd, ...step.args].map(quote).join(' ');

const options = parseArgs(process.argv.slice(2));
if (options.list) { printList(); process.exit(0); }

const audit = STAGES.find((s) => s.name === 'audit');
if (options.baseline) {
  audit.steps = [node('scripts/audit-house-export.mjs', '--baseline', options.baseline,
    ...(options.out ? ['--candidate', options.out] : []))];
}

if (options.fullBake) STAGES.find((s) => s.name === 'lighting').steps.push(npm('bake:lighting'));

// Select stages. --only names stages explicitly (including closets/audit);
// otherwise optional stages need their flag.
const results = [];
let selected;
if (options.only) {
  selected = STAGES.filter((s) => options.only.includes(s.name));
} else {
  const start = options.from ? NAMES.indexOf(options.from) : 0;
  selected = STAGES.slice(start).filter((s) =>
    (s.name !== 'closets' || options.closets) && (s.name !== 'audit' || options.baseline)
    // --no-bake skips the light bake (enough for ?style=comic or a quick geometry check).
    && (!['emitters', 'lighting'].includes(s.name) || !options.noBake));
  for (const s of STAGES.slice(start)) {
    if (s.name === 'closets' && !options.closets) results.push({ name: s.name, status: 'skipped (no --closets)', seconds: 0 });
    if (s.name === 'audit' && !options.baseline) results.push({ name: s.name, status: 'skipped (no --baseline)', seconds: 0 });
    if (['emitters', 'lighting', 'visibility'].includes(s.name) && options.noBake) results.push({ name: s.name, status: 'skipped (--no-bake)', seconds: 0 });
  }
}
if (selected.some((s) => s.name === 'audit') && !options.baseline) fail('the audit stage needs --baseline <dir>');
if (options.skipBlender) {
  for (const s of selected.filter((st) => st.blender)) results.push({ name: s.name, status: 'skipped (--skip-blender)', seconds: 0 });
  selected = selected.filter((s) => !s.blender);
}
if (!selected.length) fail('no stages selected');

if (options.out) {
  process.env.PIPELINE_OUT = options.out;
  console.log(`Notice: --out sets PIPELINE_OUT=${options.out} for every stage, but scratch mode is implemented only for the`
    + ' audit stage (which reads its candidate from there). All other stages still write into public/models, src/shared'
    + ' and src/client.');
}

// Fail early, before anything runs, if a selected stage cannot start.
const problems = [];
if (selected.some((s) => s.blender)) {
  let ok = false;
  try { ok = statSync(BLENDER).isFile(); accessSync(BLENDER, constants.X_OK); } catch { ok = false; }
  if (!ok) problems.push(`Blender not found or not executable at ${BLENDER}. Set $BLENDER, or pass --skip-blender.`);
  if (!existsSync(BLEND)) problems.push(`Canonical Blender file not found: ${BLEND}`);
}
if (options.baseline && selected.some((s) => s.name === 'audit') && !existsSync(options.baseline)) {
  problems.push(`Baseline ${options.baseline} does not exist. Capture it first: node scripts/audit-house-export.mjs --snapshot <dir>`);
}
for (const s of selected) {
  const problem = s.precheck?.();
  if (problem) problems.push(`[${s.name}] ${problem}`);
}
if (problems.length) {
  if (!options.dryRun) fail(`cannot start:\n  - ${problems.join('\n  - ')}`);
  console.log(`Warning (dry run continues):\n  - ${problems.join('\n  - ')}`);
}

console.log(`${options.dryRun ? 'Dry run: ' : ''}running ${selected.map((s) => s.name).join(' -> ')} in ${ROOT}\n`);
const started = Date.now();
let failed = null;
for (const stage of selected) {
  console.log(`\n=== [${stage.name}] ${stage.produces}`);
  const t0 = Date.now();
  let status = options.dryRun ? 'dry-run' : 'ok';
  for (const step of stage.steps) {
    console.log(`$ ${show(step)}`);
    if (options.dryRun) continue;
    const capture = Boolean(step.skipWhen);
    const child = spawnSync(step.cmd, step.args, {
      cwd: ROOT, env: process.env, stdio: capture ? ['inherit', 'inherit', 'pipe'] : 'inherit',
      encoding: capture ? 'utf8' : undefined, maxBuffer: 64 * 1024 * 1024,
    });
    if (capture && child.stderr) process.stderr.write(child.stderr);
    if (child.status === 0) continue;
    if (capture && step.skipWhen.test(child.stderr ?? '')) {
      console.log(`[${stage.name}] ${step.args.at(-1)} reports the result is already integrated; treating it as skipped.`);
      status = 'ok (merge already integrated)';
      continue;
    }
    status = 'FAILED';
    const why = child.error ? child.error.message : child.signal ? `signal ${child.signal}` : `exit code ${child.status}`;
    console.error(`\n[${stage.name}] failed (${why}): ${show(step)}`);
    break;
  }
  const seconds = options.dryRun ? 0 : (Date.now() - t0) / 1000;
  results.push({ name: stage.name, status, seconds });
  if (!options.dryRun) console.log(`[${stage.name}] ${status} in ${seconds.toFixed(1)} s`);
  if (status === 'FAILED') { failed = stage; break; }
}
if (failed) {
  for (const s of selected.slice(selected.indexOf(failed) + 1)) results.push({ name: s.name, status: 'not run', seconds: 0 });
}

results.sort((a, b) => NAMES.indexOf(a.name) - NAMES.indexOf(b.name));
console.log(`\n${'stage'.padEnd(14)}${'status'.padEnd(32)}seconds`);
for (const r of results) console.log(`${r.name.padEnd(14)}${r.status.padEnd(32)}${r.seconds ? r.seconds.toFixed(1) : '-'}`);
console.log(`${'total'.padEnd(46)}${((Date.now() - started) / 1000).toFixed(1)}`);

if (failed) {
  const keep = [options.skipBlender && '--skip-blender', options.closets && '--closets',
    options.baseline && `--baseline ${quote(options.baseline)}`, options.out && `--out ${quote(options.out)}`].filter(Boolean);
  console.error(`\nStage "${failed.name}" failed. Fix the cause, then resume with:\n  npm run pipeline:house -- --from ${failed.name}${keep.length ? ` ${keep.join(' ')}` : ''}`);
  process.exit(1);
}

// Compare two lighting benchmark phases: node tests/lighting-compare.mjs <phaseA> <phaseB> [--tolerance 0.1]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let tolerance = 0.1;
const phases = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tolerance') tolerance = Number(args[++i]);
  else if (args[i].startsWith('--tolerance=')) tolerance = Number(args[i].slice(12));
  else phases.push(args[i]);
}
if (phases.length !== 2 || !Number.isFinite(tolerance) || tolerance < 0) {
  console.error('Usage: node tests/lighting-compare.mjs <phaseA> <phaseB> [--tolerance 0.1]');
  process.exit(2);
}
const [phaseA, phaseB] = phases;

const load = phase => {
  const file = `test-results/lighting/${phase}.json`;
  try {
    return new Map(JSON.parse(readFileSync(file, 'utf8')).results.map(r => [r.name, r]));
  } catch (error) {
    console.error(`Cannot read ${file}: ${error.message}`);
    process.exit(2);
  }
};
const a = load(phaseA), b = load(phaseB);

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, digits = 2) => (isNum(v) ? v.toFixed(digits) : '-');
const pct = (x, y) => (isNum(x) && isNum(y) && x !== 0 ? (y - x) / x : null);
const fmtPct = p => (p === null ? '-' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)}%`);
const mean = values => { const v = values.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

const cols = [
  ['view', 22, 'l'], ['gpuMs A', 9], ['gpuMs B', 9], ['Δ%', 8], ['cpuMs A', 9], ['cpuMs B', 9], ['Δ%', 8],
  ['calls A', 8], ['calls B', 8], ['tris A', 10], ['tris B', 10],
];
const row = cells => cells.map((c, i) => {
  const [, w, align] = cols[i];
  const s = String(c);
  return align === 'l' ? s.padEnd(w) : s.padStart(w);
}).join(' ');

console.log(`A = ${phaseA}, B = ${phaseB}, tolerance ${(tolerance * 100).toFixed(1)}%`);
console.log(row(cols.map(c => c[0])));
console.log('-'.repeat(cols.reduce((s, c) => s + c[1] + 1, -1)));

const shared = [], failures = [], notCompared = [], missing = [];
for (const name of new Set([...a.keys(), ...b.keys()])) {
  if (!a.has(name)) { missing.push(`${name}: not in ${phaseA}`); continue; }
  if (!b.has(name)) { missing.push(`${name}: not in ${phaseB}`); continue; }
  const ra = a.get(name), rb = b.get(name);
  shared.push([ra, rb]);
  const gpuD = pct(ra.gpuMs, rb.gpuMs), cpuD = pct(ra.cpuMs, rb.cpuMs);
  console.log(row([name, fmt(ra.gpuMs), fmt(rb.gpuMs), fmtPct(gpuD), fmt(ra.cpuMs), fmt(rb.cpuMs), fmtPct(cpuD),
    ra.calls ?? '-', rb.calls ?? '-', ra.triangles ?? '-', rb.triangles ?? '-']));
  if (!isNum(ra.gpuMs) || !isNum(rb.gpuMs)) notCompared.push(`${name}: gpuMs null (no timer extension), not compared`);
  else if (gpuD !== null && gpuD > tolerance) failures.push(`${name}: gpuMs +${(gpuD * 100).toFixed(2)}%`);
  if (!isNum(ra.cpuMs) || !isNum(rb.cpuMs)) notCompared.push(`${name}: cpuMs missing, not compared`);
  else if (cpuD !== null && cpuD > tolerance) failures.push(`${name}: cpuMs +${(cpuD * 100).toFixed(2)}%`);
}

console.log('-'.repeat(cols.reduce((s, c) => s + c[1] + 1, -1)));
const m = (side, key) => mean(shared.map(pair => pair[side][key]));
const [gA, gB, cA, cB] = [m(0, 'gpuMs'), m(1, 'gpuMs'), m(0, 'cpuMs'), m(1, 'cpuMs')];
const r0 = v => (isNum(v) ? Math.round(v) : '-');
console.log(row(['mean', fmt(gA), fmt(gB), fmtPct(pct(gA, gB)), fmt(cA), fmt(cB), fmtPct(pct(cA, cB)),
  r0(m(0, 'calls')), r0(m(1, 'calls')), r0(m(0, 'triangles')), r0(m(1, 'triangles'))]));

for (const line of missing) console.log(line);
for (const line of notCompared) console.log(line);
if (failures.length) {
  console.log(`FAIL: ${failures.length} regression(s) beyond ${(tolerance * 100).toFixed(1)}% in ${phaseB}:`);
  for (const line of failures) console.log(`  ${line}`);
  process.exit(1);
}
console.log(`OK: no view in ${phaseB} exceeds ${phaseA} by more than ${(tolerance * 100).toFixed(1)}%`);

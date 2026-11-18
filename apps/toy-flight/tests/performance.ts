import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DRONE_RADIUS, MAX_PAINTS as PAINT_CAP } from '../src/shared/protocol.js';
import { WORLD_TRIANGLE_COUNT } from '@huis/house/shared/collision';
import { GameSimulation } from '../src/server/simulation.js';
import { INK_PROJECTILE_CAP } from '../src/shared/ink.js';
import { installHouseCollisionFile } from '@huis/house/node/houseCollision';

await installHouseCollisionFile();

const WARMUP_TICKS = 600;
const MEASURED_TICKS = 6_000;
const FIXED_STEP = 1 / 60;
const randomValues = [0.03, 0.38, 0.79];
let randomIndex = 0;
const simulation = new GameSimulation(() => randomValues[randomIndex++ % randomValues.length]);
const ids = ['alpha', 'bravo', 'charlie'];
ids.forEach((id, index) => simulation.addPlayer(id, `Pilot ${index + 1}`));
const sequences = new Map(ids.map(id => [id, 0]));
let lastPaintId = 0;

function drive(tick: number): void {
  ids.forEach((id, index) => {
    const seq = (sequences.get(id) ?? 0) + 1;
    sequences.set(id, seq);
    simulation.setInput(id, {
      seq,
      yaw: Math.sin(tick * 0.017 + index * 2.1) * 0.82,
      pitch: Math.sin(tick * 0.011 + index * 1.3) * 0.58,
      forward: 0.88,
      strafe: Math.sin(tick * 0.013 + index) * 0.35,
      lift: Math.sin(tick * 0.009 + index * 0.7) * 0.3,
      precision: tick % 240 < 30,
      fire: true,
      reset: false,
    });
  });
  simulation.update(FIXED_STEP);

  // Match the room's 20 Hz snapshot and paint-delta work.
  if (tick % 3 === 0) {
    const update = simulation.snapshot(false);
    const newestPaintId = simulation.paints.at(-1)?.id ?? 0;
    if (newestPaintId !== lastPaintId) {
      update.paintAdds = simulation.paints.filter(paint => paint.id > lastPaintId);
      lastPaintId = newestPaintId;
    }
    assert.equal(update.players.length, 3);
  }
}

for (let tick = 0; tick < WARMUP_TICKS; tick++) drive(tick);

const samples = new Float64Array(MEASURED_TICKS);
for (let tick = 0; tick < MEASURED_TICKS; tick++) {
  const start = performance.now();
  drive(tick + WARMUP_TICKS);
  samples[tick] = performance.now() - start;
}

const sorted = Array.from(samples).sort((a, b) => a - b);
const percentile = (value: number) => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];
const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
const p50 = percentile(0.5);
const p95 = percentile(0.95);
const p99 = percentile(0.99);

assert.equal(simulation.tick, WARMUP_TICKS + MEASURED_TICKS);
assert.equal(simulation.players.size, 3);
assert.ok(simulation.projectiles.length <= INK_PROJECTILE_CAP);
assert.ok(simulation.paints.length <= PAINT_CAP);
for (const { drone } of simulation.players.values()) {
  assert.ok(Number.isFinite(drone.position.x) && Number.isFinite(drone.position.y) && Number.isFinite(drone.position.z));
  assert.ok(Number.isFinite(drone.velocity.x) && Number.isFinite(drone.velocity.y) && Number.isFinite(drone.velocity.z));
  assert.ok(drone.speed >= 0);
}
assert.ok(p99 < 1000 / 60, `p99 ${p99.toFixed(3)}ms exceeds a 60 Hz tick`);

console.log(JSON.stringify({
  triangles: WORLD_TRIANGLE_COUNT,
  measuredTicks: MEASURED_TICKS,
  players: simulation.players.size,
  projectileCount: simulation.projectiles.length,
  paintCount: simulation.paints.length,
  droneRadius: DRONE_RADIUS,
  milliseconds: {
    mean: Number(mean.toFixed(4)),
    p50: Number(p50.toFixed(4)),
    p95: Number(p95.toFixed(4)),
    p99: Number(p99.toFixed(4)),
    max: Number(sorted.at(-1)!.toFixed(4)),
  },
}));

import assert from 'node:assert/strict';
import test from 'node:test';
import { DronePredictor, FIXED_STEP, SnapshotBuffer } from '../src/client/movement.js';
import { NEUTRAL_CONTROLS, type DroneState, type Snapshot } from '../src/shared/protocol.js';
import { getSpawns } from '../src/shared/spawns.js';

function drone(x: number): DroneState {
  return {
    id: 'remote', name: 'Remote', color: '#fff', position: { x, y: 3, z: 0 },
    velocity: { x: 1, y: 0, z: 0 }, yaw: 0, pitch: 0, speed: 1, lastSeq: 0,
    respawnAt: 0, invulnerableUntil: 0, paintedUntil: 0, paintColor: '', shots: 0, tags: 0,
  };
}

function snapshot(tick: number, time: number, x = time): Snapshot {
  return { tick, time, players: [drone(x)], projectiles: [], paints: [] };
}

test('remote snapshot rendering advances smoothly and never rewinds under arrival jitter', () => {
  const buffer = new SnapshotBuffer();
  const packets = Array.from({ length: 31 }, (_, index) => {
    const time = index * .05;
    // Ordered WebSocket delivery with alternating latency around the 100 ms render buffer.
    const arrival = time + .1 + [0, .014, -.008, .01, -.004][index % 5];
    return { arrival, value: snapshot(index + 1, time) };
  });
  let packet = 0;
  const rendered: Array<{ now: number; x: number }> = [];
  for (let frame = 0; frame <= 105; frame++) {
    const now = frame / 60;
    while (packets[packet] && packets[packet].arrival <= now) {
      buffer.push(packets[packet].value, packets[packet].arrival);
      packet++;
    }
    const sample = buffer.sample(now)[0];
    if (sample) rendered.push({ now, x: sample.position.x });
  }
  assert.ok(rendered.length > 80);
  for (let index = 1; index < rendered.length; index++) {
    assert.ok(rendered[index].x >= rendered[index - 1].x - 1e-12,
      `late packet rewound remote motion at ${rendered[index].now}`);
  }
  const cruising = rendered.filter(point => point.now >= .35 && point.now <= 1.5);
  const movingFrames = cruising.slice(1).filter((point, index) => point.x > cruising[index].x + 1e-6);
  assert.ok(movingFrames.length >= cruising.length * .9, 'the render clock should absorb packet jitter without visible stalls');
  const largestStep = Math.max(...cruising.slice(1).map((point, index) => point.x - cruising[index].x));
  assert.ok(largestStep < .025, `jitter correction jumped ${largestStep} world units in one frame`);
});

test('late or duplicate snapshots cannot rewind the remote render clock', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1, 0), .1);
  buffer.push(snapshot(2, .05), .15);
  buffer.push(snapshot(3, .1), .2);
  const before = buffer.sample(.25)[0].position.x;
  buffer.push(snapshot(2, .05, -10), .26);
  const after = buffer.sample(.26)[0].position.x;
  assert.ok(after >= before);
});

test('large remote discontinuities snap instead of interpolating through geometry', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1, 0, 0), 0);
  assert.equal(buffer.sample(0)[0].position.x, 0);
  buffer.push(snapshot(2, .05, 4), .05);
  assert.equal(buffer.sample(.05)[0].position.x, 0, 'the discontinuity still respects the render buffer');
  assert.equal(buffer.sample(.2)[0].position.x, 4, 'once due, it snaps without showing an in-between position');
});

function runPredictorAt(renderRate: number) {
  const predictor = new DronePredictor();
  const initial = drone(0);
  initial.position = { ...getSpawns()[0].position };
  initial.yaw = getSpawns()[0].yaw;
  predictor.reconcile(initial);
  let accumulator = 0;
  let sequence = 0;
  const aligned = new Map<number, DroneState>();
  for (let frame = 1; frame <= renderRate; frame++) {
    const frameDt = 1 / renderRate;
    accumulator += frameDt;
    while (accumulator + 1e-12 >= FIXED_STEP) {
      sequence++;
      predictor.advance({
        ...NEUTRAL_CONTROLS,
        seq: sequence,
        lookYaw: initial.yaw,
        lookPitch: 0,
        forward: sequence <= 30 ? 1 : 0,
        strafe: sequence > 30 ? 1 : 0,
      });
      accumulator = Math.max(0, accumulator - FIXED_STEP);
    }
    const wallTime = frame / renderRate;
    if (Math.abs(wallTime - .5) < 1e-12 || Math.abs(wallTime - 1) < 1e-12) {
      aligned.set(wallTime, predictor.sample(accumulator / FIXED_STEP, frameDt)!);
    } else {
      predictor.sample(accumulator / FIXED_STEP, frameDt);
    }
  }
  return { sequence, aligned };
}

test('local fixed-step prediction preserves simulation time at 24 and 60 FPS', () => {
  const low = runPredictorAt(24);
  const high = runPredictorAt(60);
  assert.equal(low.sequence, 60, '24 FPS frames must catch up every 60 Hz simulation command');
  assert.equal(high.sequence, 60);
  for (const time of [.5, 1]) {
    const a = low.aligned.get(time)!;
    const b = high.aligned.get(time)!;
    assert.ok(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) < 1e-9,
      `predicted position diverged by render rate at ${time}s`);
    assert.ok(Math.abs(a.yaw - b.yaw) < 1e-12);
    assert.equal(a.lastSeq, b.lastSeq);
  }
});

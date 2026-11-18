import assert from 'node:assert/strict';
import test from 'node:test';
import { applySnapshotUpdate, DRONE_RADIUS, MAX_PAINTS, NEUTRAL_CONTROLS, type PaintMark, type Snapshot } from '../src/shared/protocol.js';

function mark(id: number): PaintMark {
  return {
    id,
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    color: '#f27654',
    size: 0.2,
    ...(id % 2 ? { attachment: {
      doorId: 'door_0', position: { x: id, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 },
    } } : {}),
  };
}

test('paint deltas preserve history, deduplicate late-join overlap and evict oldest marks', () => {
  const snapshot: Snapshot = { tick: 1, time: 0, players: [], projectiles: [], paints: Array.from({ length: MAX_PAINTS }, (_, i) => mark(i + 1)) };
  const next = applySnapshotUpdate(snapshot, { tick: 2, time: 0.05, players: [], projectiles: [], paintAdds: [mark(MAX_PAINTS), mark(MAX_PAINTS + 1)] });
  assert.equal(next.paints.length, MAX_PAINTS);
  assert.equal(next.paints[0].id, 2);
  assert.equal(next.paints.at(-1)?.id, MAX_PAINTS + 1);
  assert.deepEqual(next.paints.at(-1)?.attachment, mark(MAX_PAINTS + 1).attachment);
  const unchanged = applySnapshotUpdate(next, { tick: 3, time: 0.1, players: [], projectiles: [] });
  assert.strictEqual(unchanged.paints, next.paints);
  const cleared = applySnapshotUpdate(unchanged, { tick: 4, time: 0.15, players: [], projectiles: [], paints: [] });
  assert.equal(cleared.paints.length, 0);
});

test('drone wire defaults expose every movement axis in a neutral state', () => {
  assert.equal(DRONE_RADIUS, .16);
  assert.deepEqual(NEUTRAL_CONTROLS, {
    seq: 0, yaw: 0, pitch: 0, forward: 0, strafe: 0, lift: 0,
    precision: false, fire: false, reset: false,
  });
});

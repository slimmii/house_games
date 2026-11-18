import assert from 'node:assert/strict';
import test from 'node:test';
import type { DroneState, Vec3 } from '../src/shared/protocol';
import { FLOOR_HEIGHTS } from '@huis/house/shared/world';
import { FLOOR_PENALTY, ProximityTracker, distance3d, nearestEligiblePlayer, radarDistance, warmthForDistance } from '../src/client/proximity';

function drone(id: string, position: Vec3, respawnAt = 0): DroneState {
  return { id, name: id, color: '#fff', position, yaw: 0, pitch: 0, speed: 0,
    velocity: { x: 0, y: 0, z: 0 }, lastSeq: 0, respawnAt, invulnerableUntil: 0,
    paintedUntil: 0, paintColor: '', shots: 0, tags: 0 };
}

test('distance and warmth include vertical separation and remain bounded', () => {
  assert.equal(distance3d({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 }), 13);
  assert.equal(warmthForDistance(-10), 100);
  assert.equal(warmthForDistance(100), 0);
  assert.ok(warmthForDistance(5) > warmthForDistance(15));
});

test('a pilot on another storey is never close, even straight above you', () => {
  const self = { x: 10, y: 1, z: -10 };
  const above = { x: 10, y: FLOOR_HEIGHTS[1] + 1, z: -10 };
  const sameFloor = { x: 10 + 12, y: 1, z: -10 };
  assert.equal(radarDistance(self, above), distance3d(self, above) + FLOOR_PENALTY);
  assert.ok(radarDistance(self, above) > radarDistance(self, sameFloor), 'a far pilot on your floor beats one through the ceiling');
  assert.ok(warmthForDistance(radarDistance(self, above)) < 50);
  const players = [drone('self', self), drone('up', above), drone('across', sameFloor)];
  assert.equal(nearestEligiblePlayer(players, 'self', self, 10)?.player.id, 'across');
});

test('nearest selection excludes self and unavailable players with deterministic ties', () => {
  const players = [drone('self', { x: 0, y: 0, z: 0 }), drone('z', { x: 2, y: 0, z: 0 }),
    drone('a', { x: -2, y: 0, z: 0 }), drone('near-respawning', { x: 1, y: 0, z: 0 }, 12)];
  assert.equal(nearestEligiblePlayer(players, 'self', players[0].position, 10)?.player.id, 'a');
});

test('tracker smooths readings, ignores jitter, and reports meaningful movement', () => {
  const tracker = new ProximityTracker();
  const self = drone('self', { x: 0, y: 0, z: 0 });
  const target = drone('target', { x: 10, y: 0, z: 0 });
  assert.equal(tracker.update([self, target], self.id, self.position, 1).trend, 'steady');
  for (const x of [10.1, 9.9, 10.15, 9.85]) {
    target.position.x = x;
    assert.equal(tracker.update([self, target], self.id, self.position, 1).trend, 'steady');
  }
  target.position.x = 6;
  let trend = tracker.update([self, target], self.id, self.position, 1).trend;
  for (let i = 0; i < 4 && trend === 'steady'; i++) trend = tracker.update([self, target], self.id, self.position, 1).trend;
  assert.equal(trend, 'warmer');
  target.position.x = 15;
  for (let i = 0; i < 8 && trend !== 'colder'; i++) trend = tracker.update([self, target], self.id, self.position, 1).trend;
  assert.equal(trend, 'colder');
});

test('tracker resets trend for target switches and lifecycle pauses', () => {
  const tracker = new ProximityTracker();
  const self = drone('self', { x: 0, y: 0, z: 0 });
  const first = drone('first', { x: 8, y: 0, z: 0 });
  assert.equal(tracker.update([self, first], self.id, self.position, 1).status, 'active');
  assert.equal(tracker.update([self], self.id, self.position, 1).status, 'waiting');
  const second = drone('second', { x: 3, y: 0, z: 0 });
  assert.equal(tracker.update([self, second], self.id, self.position, 1).trend, 'steady');
  assert.equal(tracker.update([self, second], self.id, self.position, 1, false).status, 'paused');
  assert.equal(tracker.update([self, second], self.id, self.position, 1).trend, 'steady');
  self.respawnAt = 5;
  assert.equal(tracker.update([self, second], self.id, self.position, 1).status, 'paused');
});

test('target switch cannot resurrect a held trend from the previous pilot', () => {
  const tracker = new ProximityTracker();
  const self = drone('self', { x: 0, y: 0, z: 0 });
  const first = drone('first', { x: 10, y: 0, z: 0 });
  tracker.update([self, first], self.id, self.position, 1);
  first.position.x = 5;
  let trend = tracker.update([self, first], self.id, self.position, 1).trend;
  for (let i = 0; i < 5 && trend === 'steady'; i++) trend = tracker.update([self, first], self.id, self.position, 1).trend;
  assert.equal(trend, 'warmer');

  const second = drone('second', { x: 3, y: 0, z: 0 });
  assert.equal(tracker.update([self, second], self.id, self.position, 1).trend, 'steady');
  for (let i = 0; i < 3; i++) {
    assert.equal(tracker.update([self, second], self.id, self.position, 1).trend, 'steady');
  }
});

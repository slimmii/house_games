import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSimulation } from '../src/server/simulation.js';
import { DronePredictor } from '../src/client/movement.js';
import { stepFlight } from '../src/shared/flight.js';
import { DRONE_LIFT_SPEED, DRONE_SPEED, PRECISION_FACTOR, segmentBoxHit, stepDrone } from '../src/shared/simulation.js';
import { overlapsWorld, sweepWorld } from '@huis/house/shared/collision';
import { HOUSE_BOUNDS } from '@huis/house/shared/world';
import { getSpawns } from '../src/shared/spawns.js';
import { DRONE_RADIUS, MAX_PAINTS, NEUTRAL_CONTROLS, type DroneState, type Vec3 } from '../src/shared/protocol.js';
import { INK_FIRE_INTERVAL, INK_PROJECTILE_CAP } from '../src/shared/ink.js';

const dt = 1 / 60;
function advance(game: GameSimulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds / dt); i++) game.update(dt); }
function freshDrone(): DroneState { return new GameSimulation(() => 0).addPlayer('a', 'Pilot'); }
function distance(a: Vec3, b: Vec3) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

test('swept collision catches thin walls in both directions with outward normals', () => {
  const box = { min: { x: -1, y: -1, z: -.1 }, max: { x: 1, y: 1, z: .1 } };
  const a = segmentBoxHit({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 5 }, box);
  const b = segmentBoxHit({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -5 }, box);
  assert.ok(a && b); assert.equal(a.normal.z, -1); assert.equal(b.normal.z, 1);
  assert.equal(segmentBoxHit({ x: 2, y: 0, z: -5 }, { x: 2, y: 0, z: 5 }, box), null);
});

test('idle surface spawns hover and manual reset respawns in under a second', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot'); const initial = { ...drone.position };
  advance(game, 3); assert.deepEqual(drone.position, initial); assert.deepEqual(drone.velocity, { x: 0, y: 0, z: 0 });
  game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, reset: true }); game.update(dt);
  assert.ok(drone.respawnAt > game.time); advance(game, .8); assert.equal(drone.respawnAt, 0);
  assert.ok(getSpawns().some(s => JSON.stringify(s.position) === JSON.stringify(drone.position)));
});

test('queued held reset cannot loop respawns and must be released before triggering again', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot');
  for (let seq = 1; seq <= 8; seq++) game.setInput('a', { ...NEUTRAL_CONTROLS, seq, reset: true });
  game.update(dt); assert.equal(drone.lastSeq, 8, 'reset discards and acknowledges the queued held copies');
  advance(game, .8); assert.equal(drone.respawnAt, 0);
  const respawned = { ...drone.position }; advance(game, .8); assert.deepEqual(drone.position, respawned, 'queued reset cannot trigger again');
  game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 9 }); game.update(dt);
  game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 10, reset: true }); game.update(dt); assert.ok(drone.respawnAt > game.time);
});

test('invalid, stale, missing and excessive controls cannot corrupt authoritative positions', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot');
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, yaw: NaN }), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1.5 }), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 2, strafe: Infinity }), false);
  const { lift: _lift, ...missingLift } = { ...NEUTRAL_CONTROLS, seq: 2 };
  assert.equal(game.setInput('a', missingLift), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 2, precision: 1 }), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 2, forward: -9000 }), true);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1 }), false);
  let accepted = 0; for (let seq = 3; seq < 1000; seq++) if (game.setInput('a', { ...NEUTRAL_CONTROLS, seq })) accepted++;
  assert.ok(accepted <= 90); advance(game, 1); assert.ok(Object.values(drone.position).every(Number.isFinite));
});

test('received commands are deduplicated immediately but acknowledged one simulated tick at a time', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot');
  for (let seq = 1; seq <= 3; seq++) assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq, forward: 1 }), true);
  assert.equal(drone.lastSeq, 0, 'receipt alone is not an acknowledgement');
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 3, forward: -1 }), false, 'received sequence is already reserved');
  game.update(dt); assert.equal(drone.lastSeq, 1);
  game.update(dt); assert.equal(drone.lastSeq, 2);
  game.update(dt); assert.equal(drone.lastSeq, 3);

  let accepted = 0;
  for (let seq = 4; seq <= 50; seq++) if (game.setInput('a', { ...NEUTRAL_CONTROLS, seq })) accepted++;
  assert.equal(accepted, 30, 'authoritative input queue stays bounded');
});

test('absolute look requires a complete finite pair and applies with its queued command', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot');
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, lookYaw: 1 }), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, lookYaw: 1, lookPitch: NaN }), false);
  assert.equal(game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, lookYaw: 1, lookPitch: .4 }), true);
  assert.notEqual(drone.yaw, 1); game.update(dt);
  assert.equal(drone.yaw, 1); assert.equal(drone.pitch, .4); assert.equal(drone.lastSeq, 1);
});

test('prediction stays continuous through jittered delivery and replay converges on acknowledgements', () => {
  const game = new GameSimulation(() => 0); const authoritative = game.addPlayer('a', 'Pilot');
  authoritative.position = clearShot(); authoritative.yaw = 0;
  const predictor = new DronePredictor(); predictor.reconcile(authoritative);
  const undelivered: typeof NEUTRAL_CONTROLS[] = [];
  let priorZ = predictor.sample(1, 0)!.position.z;
  for (let tick = 1; tick <= 48; tick++) {
    const input = { ...NEUTRAL_CONTROLS, seq: tick, lookYaw: 0, lookPitch: 0, forward: 1 };
    predictor.advance(input); undelivered.push(input);
    if ([8, 21, 32, 48].includes(tick)) {
      for (const command of undelivered.splice(0)) assert.equal(game.setInput('a', command), true);
    }
    game.update(dt);
    if (tick % 3 === 0) predictor.reconcile(game.snapshot().players[0]);
    const rendered = predictor.sample(1, dt)!;
    assert.ok(rendered.position.z > priorZ, `local movement must not pause at jitter tick ${tick}`);
    priorZ = rendered.position.z;
  }
  while (authoritative.lastSeq < 48) game.update(dt);
  predictor.reconcile(game.snapshot().players[0]);
  const settled = predictor.sample(1, 1)!;
  assert.ok(distance(settled.position, authoritative.position) < 1e-8);
  assert.equal(settled.lastSeq, 48);
});

test('forward/back, strafe, lift, and aiming are independent in local space', () => {
  const forward = freshDrone(); forward.position = { x: 0, y: 0, z: 0 }; forward.yaw = 0;
  stepDrone(forward, { ...NEUTRAL_CONTROLS, forward: 1, pitch: 1 }, 1);
  assert.ok(forward.position.z > 0 && Math.abs(forward.position.y) < 1e-12, 'aim pitch does not change altitude');
  const backward = freshDrone(); backward.position = { x: 0, y: 0, z: 0 }; backward.yaw = 0;
  stepDrone(backward, { ...NEUTRAL_CONTROLS, forward: -1 }, 1); assert.ok(backward.position.z < 0);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const left = freshDrone(); left.position = { x: 0, y: 0, z: 0 }; left.yaw = yaw;
    const right = freshDrone(); right.position = { x: 0, y: 0, z: 0 }; right.yaw = yaw;
    stepDrone(left, { ...NEUTRAL_CONTROLS, strafe: -1 }, 1); stepDrone(right, { ...NEUTRAL_CONTROLS, strafe: 1 }, 1);
    assert.ok(left.position.x * right.position.x + left.position.z * right.position.z < 0, `A/D oppose at yaw ${yaw}`);
    const rightComponent = -Math.cos(yaw) * right.position.x + Math.sin(yaw) * right.position.z;
    assert.ok(rightComponent > 0, `positive strafe moves pilot-right at yaw ${yaw}`);
  }
  const lift = freshDrone(); lift.position = { x: 0, y: 0, z: 0 }; stepDrone(lift, { ...NEUTRAL_CONTROLS, lift: 1 }, 1);
  assert.ok(lift.position.y > 0 && Math.abs(lift.position.x) < 1e-12 && Math.abs(lift.position.z) < 1e-12);
});

test('cruise speeds normalize diagonals and precision slows translation and turning', () => {
  const straight = freshDrone(); straight.position = { x: 0, y: 0, z: 0 };
  const diagonal = freshDrone(); diagonal.position = { x: 0, y: 0, z: 0 };
  const lift = freshDrone(); lift.position = { x: 0, y: 0, z: 0 };
  for (let tick = 0; tick < 120; tick++) {
    stepDrone(straight, { ...NEUTRAL_CONTROLS, forward: 1 }, dt);
    stepDrone(diagonal, { ...NEUTRAL_CONTROLS, forward: 1, strafe: 1, lift: 1 }, dt);
    stepDrone(lift, { ...NEUTRAL_CONTROLS, lift: 1 }, dt);
  }
  assert.ok(Math.abs(straight.speed - DRONE_SPEED) < 1e-9, 'full forward reaches its cruise speed');
  assert.ok(diagonal.speed <= DRONE_SPEED + 1e-9, 'diagonal input cannot boost total speed');
  assert.ok(diagonal.speed < straight.speed, 'normalization accounts for the lower vertical speed axis');
  assert.ok(Math.abs(lift.speed - DRONE_LIFT_SPEED) < 1e-9, 'vertical cruise respects its own ceiling');
  const normal = freshDrone(); normal.position = { x: 0, y: 0, z: 0 }; normal.yaw = 0;
  const precise = freshDrone(); precise.position = { x: 0, y: 0, z: 0 }; precise.yaw = 0;
  for (let tick = 0; tick < 60; tick++) {
    stepDrone(normal, { ...NEUTRAL_CONTROLS, forward: 1, yaw: 1 }, dt);
    stepDrone(precise, { ...NEUTRAL_CONTROLS, forward: 1, yaw: 1, precision: true }, dt);
  }
  assert.ok(normal.yaw < 0, 'positive yaw input turns right by decreasing yaw');
  assert.ok(Math.abs(precise.speed - DRONE_SPEED * PRECISION_FACTOR) < 1e-9);
  assert.ok(precise.speed < normal.speed, 'precision translation is actually slower at cruise');
  assert.ok(Math.abs(precise.yaw) < Math.abs(normal.yaw)); assert.ok(DRONE_LIFT_SPEED < DRONE_SPEED);
});

test('release brakes to an exact hover and input timeout also stops movement', () => {
  const drone = freshDrone(); stepDrone(drone, { ...NEUTRAL_CONTROLS, forward: 1 }, .1);
  for (let tick = 0; tick < 20; tick++) stepDrone(drone, NEUTRAL_CONTROLS, dt);
  assert.equal(drone.speed, 0); assert.deepEqual(drone.velocity, { x: 0, y: 0, z: 0 });
  const stopped = { ...drone.position }; stepDrone(drone, NEUTRAL_CONTROLS, 1); assert.deepEqual(drone.position, stopped);
  const game = new GameSimulation(() => 0); const timed = game.addPlayer('a', 'Pilot'); timed.position = clearShot();
  for (let seq = 1; seq <= 30; seq++) game.setInput('a', { ...NEUTRAL_CONTROLS, seq, forward: 1, fire: true });
  advance(game, 1.5);
  assert.equal(timed.lastSeq, 30, 'timeout safely acknowledges commands discarded from the bounded queue');
  assert.equal(timed.speed, 0); assert.ok(timed.shots <= Math.ceil(.32/INK_FIRE_INTERVAL)+1); const timedStop = { ...timed.position }; advance(game, 1);
  assert.deepEqual(timed.position, timedStop);
});

test('oblique wall contact slides without respawning or tunnelling', () => {
  const drone = freshDrone(); const start = clearShot();
  const wall = sweepWorld(start, { ...start, z: HOUSE_BOUNDS.max.z + 2 }, DRONE_RADIUS); assert.ok(wall);
  drone.position = { x: wall.position.x + wall.normal.x * .08, y: wall.position.y, z: wall.position.z + wall.normal.z * .08 };
  drone.yaw = Math.atan2(-wall.normal.x, -wall.normal.z); const before = { ...drone.position };
  for (let tick = 0; tick < 30; tick++) stepFlight(drone, { ...NEUTRAL_CONTROLS, forward: 1, strafe: 1 }, dt);
  assert.equal(drone.respawnAt, 0); assert.ok(!overlapsWorld(drone.position, DRONE_RADIUS * .99));
  assert.ok(distance(drone.position, before) > .1, 'tangential movement continues along wall');
  const contact = { ...drone.position };
  drone.velocity = { x: 0, y: 0, z: 0 }; drone.speed = 0;
  for (let tick = 0; tick < 45; tick++) stepFlight(drone, { ...NEUTRAL_CONTROLS, forward: -1, strafe: -1 }, dt);
  assert.ok(distance(drone.position, contact) > .25, 'reverse input backs away from contact from rest');
  assert.ok(!overlapsWorld(drone.position, DRONE_RADIUS * .99), 'backing out cannot wedge the drone into a corner');
});

test('snapshots deeply copy drone velocity', () => {
  const game = new GameSimulation(() => 0); const drone = game.addPlayer('a', 'Pilot'); drone.velocity = { x: 1, y: 2, z: 3 };
  const snapshot = game.snapshot(); assert.notStrictEqual(snapshot.players[0].velocity, drone.velocity);
  drone.velocity.x = 99; assert.deepEqual(snapshot.players[0].velocity, { x: 1, y: 2, z: 3 });
});

function clearShot(): Vec3 {
  for (let x = HOUSE_BOUNDS.min.x + 2; x < HOUSE_BOUNDS.max.x - 2; x++) for (let z = HOUSE_BOUNDS.min.z + 2; z < HOUSE_BOUNDS.max.z - 3; z++) {
    const point = { x, y: 3, z }; if (!sweepWorld(point, { x, y: 3, z: z + 2 }, .3) && sweepWorld(point, { ...point, z: HOUSE_BOUNDS.max.z + 2 }, .22)) return point;
  }
  throw new Error('No clear flight corridor');
}

test('paint hits cover another pilot briefly without moving or destroying them', () => {
  const game = new GameSimulation(() => 0); const shooter = game.addPlayer('a', 'Painter'); const target = game.addPlayer('b', 'Friend');
  shooter.position = clearShot(); shooter.yaw = 0; target.position = { ...shooter.position, z: shooter.position.z + 1.5 };
  shooter.invulnerableUntil = target.invulnerableUntil = 0; const targetStart = { ...target.position };
  game.setInput('a', { ...NEUTRAL_CONTROLS, seq: 1, fire: true }); advance(game, .2);
  assert.ok(target.paintedUntil > game.time); assert.equal(target.paintColor, shooter.color); assert.ok(shooter.tags > 0);
  assert.equal(target.respawnAt, 0); assert.deepEqual(target.position, targetStart);
});

test('paint history and projectiles remain bounded under sustained play', () => {
  const game = new GameSimulation(() => .3); const drone = game.addPlayer('a', 'Painter'); drone.pitch = -Math.PI / 2;
  for (let tick = 0; tick < 60 * 80; tick++) { if (tick % 2 === 0) game.setInput('a', { ...NEUTRAL_CONTROLS, seq: tick + 1, fire: true }); game.update(dt); }
  assert.ok(drone.shots > MAX_PAINTS); assert.equal(game.paints.length, MAX_PAINTS); assert.ok(game.projectiles.length <= INK_PROJECTILE_CAP);
  assert.ok(!overlapsWorld(drone.position, DRONE_RADIUS));
});

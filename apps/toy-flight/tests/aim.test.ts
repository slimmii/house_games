import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { GameSimulation } from '../src/server/simulation';
import { chaseCameraPose } from '../src/shared/aim';
import { rayWorld, sweepWorld } from '@huis/house/shared/collision';
import { DOORS, sweepDoors } from '@huis/house/shared/doors';
import { NEUTRAL_CONTROLS, type DroneState, type Vec3 } from '../src/shared/protocol';
import { getSpawns } from '../src/shared/spawns';

const dt = 1 / 60;
const vector = (point: Vec3) => new Vector3(point.x, point.y, point.z);

function setup(spawn: number, yaw: number, pitch: number) {
  const game = new GameSimulation(() => 0);
  const drone = game.addPlayer('shooter', 'Painter');
  drone.position = { ...getSpawns()[spawn].position, y: getSpawns()[spawn].position.y + .6 };
  drone.yaw = yaw;
  drone.pitch = pitch;
  return { game, drone };
}

function view(game: GameSimulation, drone: DroneState) {
  const pose = chaseCameraPose(drone, game.doors);
  const camera = new PerspectiveCamera(62, 16 / 9, .06, 90);
  camera.position.copy(vector(pose.position));
  camera.lookAt(vector(pose.target));
  camera.updateMatrixWorld();
  // Use Three.js's actual center-of-screen ray as an independent aim reference.
  const caster = new Raycaster();
  caster.setFromCamera(new Vector2(0, 0), camera);
  return { camera, ray: caster.ray };
}

function fireOnce(game: GameSimulation): void {
  game.setInput('shooter', { ...NEUTRAL_CONTROLS, seq: 1, fire: true });
  game.update(dt);
  game.setInput('shooter', { ...NEUTRAL_CONTROLS, seq: 2 });
  for (let tick = 0; tick < 145 && game.projectiles.length; tick++) game.update(dt);
}

for (const [label, spawn, yaw, pitch] of [
  ['level wall', 0, Math.PI / 2, 0],
  ['upward shot', 0, Math.PI / 2, .6],
  ['nearby floor', 0, Math.PI / 2, -.6],
  ['distant wall', 0, Math.PI, .6],
  ['first-floor room', 5, Math.PI / 2, 0],
  ['compressed camera aiming up', 12, Math.PI / 2, .6],
  ['compressed camera aiming level', 12, Math.PI, 0],
] as const) {
  test(`paint lands at the rendered crosshair: ${label}`, () => {
    const { game, drone } = setup(spawn, yaw, pitch);
    const { camera, ray } = view(game, drone);
    const expected = rayWorld(ray.origin, ray.at(216, new Vector3()));
    const moving = sweepDoors(ray.origin, ray.at(216, new Vector3()), 0, game.doors);
    assert.ok(expected, 'the crosshair must point at a real house surface');
    if (label.startsWith('compressed')) {
      assert.ok(camera.position.distanceTo(vector({ ...drone.position, y: drone.position.y + .04 })) < 1,
        'this case must pull the camera forward to avoid a wall');
    }
    fireOnce(game);
    assert.equal(drone.shots, 1);
    assert.equal(game.paints.length, 1);
    const impact = vector(game.paints[0].position);
    const surface = moving && moving.t < expected.t ? moving : expected;
    assert.ok(impact.distanceTo(vector(surface.position)) < 1e-5, 'impact matches the surface under the crosshair');
    assert.equal(game.paints[0].attachment?.doorId, moving && moving.t < expected.t ? DOORS[moving.doorIndex].id : undefined);
    const screen = impact.project(camera);
    assert.ok(Math.hypot(screen.x, screen.y) < 1e-5, 'impact projects to the center of the screen');
  });
}

for (const [label, position, yaw, axis, expected] of [
  ['Bedroom 3 bear wall', { x: 4, y: 21, z: -6 }, -Math.PI / 2, 'x', .867],
  ['Bedroom 3 door wall', { x: 3, y: 20, z: -6 }, Math.PI, 'z', -9.693],
] as const) {
  test(`paint lands on the visible finish: ${label}`, () => {
    const { game, drone } = setup(0, yaw, 0);
    drone.position = position;
    fireOnce(game);
    assert.equal(game.paints.length, 1);
    assert.ok(Math.abs(game.paints[0].position[axis] - expected) < .001);
  });
}

test('the pilot under the crosshair is hit before the wall behind them', () => {
  const { game, drone } = setup(0, Math.PI / 2, 0);
  const { ray } = view(game, drone);
  const target = game.addPlayer('target', 'Friend');
  target.position = ray.at(4, new Vector3());
  target.invulnerableUntil = 0;
  const start = { ...target.position };
  fireOnce(game);
  assert.equal(drone.tags, 1);
  assert.ok(target.paintedUntil > game.time);
  assert.deepEqual({ ...target.position }, start);
  assert.equal(game.paints.length, 0);
});

test('closed doors receive paint and an open doorway permits a shot through', () => {
  const index = DOORS.findIndex(door => door.label === 'Ground bedroom');
  const door = DOORS[index];
  const center = { x: (door.min[0] + door.max[0]) / 2, y: (door.min[1] + door.max[1]) / 2, z: (door.min[2] + door.max[2]) / 2 };
  for (const open of [false, true]) {
    const { game, drone } = setup(0, Math.PI / 2, 0);
    drone.position = { ...center, x: center.x - .6 };
    const target = game.addPlayer('target', 'Friend');
    target.position = { ...center, x: center.x + .6 };
    target.invulnerableUntil = 0;
    game.doors[index] = { fraction: open ? 1 : 0, opening: open };
    fireOnce(game);
    assert.equal(drone.tags, open ? 1 : 0);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.paints.length, open ? 0 : 1);
    assert.equal(game.paints[0]?.attachment?.doorId, open ? undefined : door.id);
  }
});

test('cover between the drone and crosshair still stops the paintball', () => {
  const { game, drone } = setup(5, Math.PI * 1.5, .6);
  const { ray } = view(game, drone);
  const visible = rayWorld(ray.origin, ray.at(216, new Vector3()));
  assert.ok(visible);
  const blocker = rayWorld(drone.position, visible.position);
  assert.ok(blocker && vector(blocker.position).distanceTo(vector(visible.position)) > 1);
  fireOnce(game);
  assert.equal(game.paints.length, 1);
  assert.ok(vector(game.paints[0].position).distanceTo(vector(blocker.position)) < 1e-5);
});

test('a muzzle next to a thin wall cannot spawn a shot on the other side', () => {
  const { game, drone } = setup(0, Math.PI / 2, 0);
  const wall = rayWorld(drone.position, { ...drone.position, x: drone.position.x + 5 });
  assert.ok(wall);
  drone.position.x = wall.position.x - .17;
  const { ray } = view(game, drone);
  const expected = rayWorld(ray.origin, ray.at(216, new Vector3()));
  assert.ok(expected);
  fireOnce(game);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.paints.length, 1);
  assert.ok(vector(game.paints[0].position).distanceTo(vector(expected.position)) < 1e-5);
});

test('long aiming rays match swept collision from either side of house surfaces', () => {
  for (const spawn of getSpawns()) {
    const start = { ...spawn.position, y: spawn.position.y + .6 };
    for (const direction of [{ x: 1, y: .2, z: .4 }, { x: -.3, y: -.4, z: -1 }]) {
      const end = { x: start.x + direction.x * 216, y: start.y + direction.y * 216, z: start.z + direction.z * 216 };
      for (const [a, b] of [[start, end], [end, start]]) {
        const expected = sweepWorld(a, b, 0);
        const hit = rayWorld(a, b);
        assert.equal(!!hit, !!expected);
        if (hit && expected) {
          assert.ok(vector(hit.position).distanceTo(vector(expected.position)) < 1e-5);
          assert.ok(vector(hit.normal).dot(vector(b).sub(vector(a))) <= 0, 'normal faces the incoming shot');
        }
      }
    }
  }
});

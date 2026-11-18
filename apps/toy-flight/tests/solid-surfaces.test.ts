import assert from 'node:assert/strict';
import test from 'node:test';
import { Triangle, Vector3 } from 'three';
import data from '@huis/house/shared/house-collision.json';
import inventory from '@huis/house/shared/house-collision-inventory.json';
import closets from '@huis/house/shared/closets-manifest.json';
import { overlapsWorld, rayWorld, sweepWorld } from '@huis/house/shared/collision';
import { stepFlight } from '../src/shared/flight';
import { DRONE_RADIUS, NEUTRAL_CONTROLS, type DroneState } from '../src/shared/protocol';

const triangle = new Triangle();
function readTriangle(index: number): Triangle {
  triangle.a.fromArray(data.positions, data.indices[index * 3] * 3);
  triangle.b.fromArray(data.positions, data.indices[index * 3 + 1] * 3);
  triangle.c.fromArray(data.positions, data.indices[index * 3 + 2] * 3);
  return triangle;
}

test('all exported physical objects have collision, with runtime cabinet sources excluded', () => {
  assert.ok(inventory.objects.length > 6900, 'small and dense furnishings must not disappear');
  let next = 0;
  const excluded = new Set(closets.collisionExcludedSourceNames);
  for (const object of inventory.objects) {
    assert.equal(object.firstTriangle, next, object.name);
    assert.ok(object.triangleCount > 0, object.name);
    assert.ok(!excluded.has(object.name), `ghost cabinet: ${object.name}`);
    next += object.triangleCount;
  }
  assert.equal(next * 3, data.indices.length);
  for (const object of inventory.excluded) {
    assert.ok(['runtime cabinet', 'runtime laundry', 'outside playable surroundings', 'printed overlay'].includes(object.reason), object.name);
  }
});

for (const name of [
  'Living craft desk / craft mat 2',
  'Bedroom 1 entry corner / separate soft footstool',
  'Bedroom 2 / neatly made ivory duvet',
  'Small bedroom / pink rumpled duvet',
  'Living LOMSK / red moulded seat insert',
  'Sofa keyboard / silver top deck',
]) {
  test(`previously omitted solid supports landing: ${name}`, () => {
    const object = inventory.objects.find(object => object.name === name);
    assert.ok(object, name);
    const normal = new Vector3(), center = new Vector3();
    let checked = 0;
    for (let i = object.firstTriangle; i < object.firstTriangle + object.triangleCount; i++) {
      readTriangle(i).getNormal(normal);
      if (Math.abs(normal.y) < .95) continue;
      triangle.getMidpoint(center);
      const start = { x: center.x, y: center.y + DRONE_RADIUS + .05, z: center.z };
      if (overlapsWorld(start, DRONE_RADIUS)) continue;
      const end = { ...start, y: center.y - .05 };
      const hit = sweepWorld(start, end, DRONE_RADIUS);
      if (!hit || hit.normal.y < .9 || Math.abs(hit.position.y - DRONE_RADIUS - center.y) > .025) continue;
      assert.ok(rayWorld(start, end), 'surface also blocks point rays');
      const drone: DroneState = {
        id: 'landing', name: 'Landing', color: '#fff', position: start,
        velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, speed: 0, lastSeq: 0,
        respawnAt: 0, invulnerableUntil: 0, paintedUntil: 0, paintColor: '', shots: 0, tags: 0,
      };
      for (let tick = 0; tick < 30; tick++) stepFlight(drone, { ...NEUTRAL_CONTROLS, lift: -1 }, 1 / 60);
      assert.ok(drone.position.y >= center.y + DRONE_RADIUS - .025, 'sustained descent cannot fall through');
      assert.ok(!overlapsWorld(drone.position, DRONE_RADIUS * .99), 'landing stays outside the solid');
      checked++;
      if (checked === 3) break;
    }
    assert.ok(checked > 0, `expected an exposed landable top on ${name}`);
  });
}

// The narrow suspended ring has other rings above it; verify its actual surface
// locally without requiring a full drone to fit between the stacked rings.
test('narrow lamp hardware blocks swept contact at its authored surface', () => {
  const object = inventory.objects.find(object => object.name === 'Dining ceiling lamp / ring 1 bronze housing')!;
  const normal = new Vector3(), center = new Vector3();
  let checked = 0;
  for (let i = object.firstTriangle; i < object.firstTriangle + object.triangleCount; i++) {
    readTriangle(i).getNormal(normal);
    if (Math.abs(normal.y) < .9) continue;
    triangle.getMidpoint(center);
    const start = center.clone().addScaledVector(normal, .01);
    const end = center.clone().addScaledVector(normal, -.01);
    if (overlapsWorld(start, .002)) continue;
    const hit = sweepWorld(start, end, .002);
    assert.ok(hit, 'lamp metal cannot be crossed');
    checked++;
  }
  assert.ok(checked > 0, 'sample actual lamp faces');
});

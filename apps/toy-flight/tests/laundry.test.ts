import test from 'node:test';
import assert from 'node:assert/strict';
import { LAUNDRY, laundryAngularSpeed } from '@huis/house/shared/laundry';
import { DOORS, createDoorStates, sweepDoors } from '@huis/house/shared/doors';
import { overlapsWorld, sweepWorld } from '@huis/house/shared/collision';
import { targetDoorOnRay } from '../src/shared/interaction';
import { DRONE_RADIUS } from '../src/shared/protocol';
import { prepareLaundry, createLaundry } from '@huis/house/client/laundry';
import * as THREE from 'three';

for (const machine of LAUNDRY) test(`${machine.label} has a usable hinged opening and hollow drum`, () => {
  const states = createDoorStates(), index = DOORS.findIndex(d => d.id === machine.id);
  const start = { x: 4.2, y: 2.325, z: machine.center[2] }, inside = { ...start, x: 2.15 };
  assert.equal(overlapsWorld(inside, DRONE_RADIUS), false, 'old solid body is removed');
  assert.equal(sweepWorld(start, inside, DRONE_RADIUS), null, 'front has a genuine round opening');
  assert.equal(targetDoorOnRay(start, start, inside, states), index, 'G targets this machine');
  assert.equal(sweepDoors(start, inside, DRONE_RADIUS, states)?.doorIndex, index, 'closed glass blocks flight');
  states[index] = { fraction: 1, opening: true };
  assert.equal(sweepDoors(start, inside, DRONE_RADIUS, states), null, 'open door clears drum access');
  assert.ok(sweepWorld(inside, { ...inside, x: 1.2 }, DRONE_RADIUS), 'drum has a solid back');
  assert.ok(sweepWorld(inside, { ...inside, y: 1.4 }, DRONE_RADIUS), 'drum has a solid inner wall');
});

test('washer alternates, dryer tumbles slower, and both stop on opening', () => {
  assert.ok(laundryAngularSpeed(0, 0, false, 4) > 0);
  assert.ok(laundryAngularSpeed(0, 0, false, 13) < 0);
  assert.ok(Math.abs(laundryAngularSpeed(0, 0, false, 4)) > laundryAngularSpeed(1, 0, false, 4));
  for (const index of [0, 1]) {
    assert.equal(laundryAngularSpeed(index, 0, true, 4), 0);
    assert.equal(laundryAngularSpeed(index, .2, false, 4), 0);
  }
  const root = prepareLaundry(new THREE.Group()), runtime = createLaundry(root), states = createDoorStates();
  runtime.update(states, 1);
  for (const m of LAUNDRY) {
    const rotor = root.getObjectByName(`${m.id}:rotor`)!;
    assert.notEqual(rotor.rotation.x, 0);
    const before = rotor.rotation.x, index = DOORS.findIndex(d => d.id === m.id);
    states[index] = { fraction: .5, opening: true };
    runtime.update(states, .1);
    assert.equal(rotor.rotation.x, before);
    assert.notEqual(root.getObjectByName(`${m.id}:door`)!.rotation.y, 0);
  }
});

test('G opens and closes both machines through authoritative door state', async () => {
  const { GameSimulation } = await import('../src/server/simulation');
  const { chaseCameraPose } = await import('../src/shared/aim');
  const { advanceDoors, doorWorldPoint } = await import('@huis/house/shared/doors');
  const { targetedDoor } = await import('../src/shared/interaction');
  for (const machine of LAUNDRY) {
    const game = new GameSimulation(() => 0), player = game.addPlayer('pilot', 'Pilot');
    const index = DOORS.findIndex(d => d.id === machine.id);
    const center = { x: machine.center[0], y: machine.center[1], z: machine.center[2] };
    player.position = { ...center, x: 4.5 };
    function aim(point: typeof center) {
      player.yaw = Math.atan2(point.x - player.position.x, point.z - player.position.z);
      let lo = -1.13, hi = 1.13;
      for (let i = 0; i < 40; i++) {
        player.pitch = (lo + hi) / 2;
        const { position: c, target: t } = chaseCameraPose(player, game.doors);
        const desired = Math.atan2(point.y-c.y, Math.hypot(point.x-c.x, point.z-c.z));
        const actual = Math.atan2(t.y-c.y, Math.hypot(t.x-c.x, t.z-c.z));
        if (actual < desired) lo = player.pitch; else hi = player.pitch;
      }
    }
    aim(center);
    assert.equal(targetedDoor(player, game.doors), index);
    assert.equal(game.toggleDoor('pilot'), true);
    advanceDoors(game.doors, 1.1, [], DRONE_RADIUS);
    assert.equal(game.snapshot().doors![index].fraction, 1);
    game.time += .3;
    aim(doorWorldPoint(center, index, 1));
    assert.equal(game.toggleDoor('pilot'), true);
    advanceDoors(game.doors, 1.1, [], DRONE_RADIUS);
    assert.equal(game.doors[index].fraction, 0);
  }
});

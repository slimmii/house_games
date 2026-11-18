import assert from 'node:assert/strict';
import test from 'node:test';
import { FLOOR_HEIGHTS, HOUSE_BOUNDS, ROOMS, getRoomName } from '@huis/house/shared/world';
import { getSpawns } from '../src/shared/spawns.js';
import { DOORS, createDoorStates } from '@huis/house/shared/doors';
import { targetDoorOnRay } from '../src/shared/interaction.js';
import { overlapsWorld, rayWorld, sweepWorld, WORLD_TRIANGLE_COUNT } from '@huis/house/shared/collision';
import { DRONE_RADIUS, type Vec3 } from '../src/shared/protocol.js';

test('Blender house has real collision geometry and supported spawns on all three floors', () => {
  assert.ok(WORLD_TRIANGLE_COUNT > 1000, 'use exported house geometry');
  assert.ok(getSpawns().length >= 6);
  const floorBands = new Set<number>();
  for (const spawn of getSpawns()) {
    assert.ok(!overlapsWorld(spawn.position, DRONE_RADIUS), `Spawn obstructed: ${JSON.stringify(spawn)}`);
    const support = rayWorld(spawn.position, { ...spawn.position, y: spawn.position.y - DRONE_RADIUS - 0.2 });
    assert.ok(support && support.normal.y > 0.5, `Spawn needs a supporting surface: ${JSON.stringify(spawn)}`);
    floorBands.add(spawn.position.y < 7.23 ? 0 : spawn.position.y < 15.93 ? 1 : 2);
  }
  assert.equal(floorBands.size, 3, 'all three real floors have spawn locations');
  assert.ok(getSpawns().some(spawn => {
    const floor = FLOOR_HEIGHTS.filter(y => y < spawn.position.y).at(-1) ?? 0;
    return spawn.position.y - floor > 1;
  }), 'include a raised furniture launch surface');
});

test('the authored curved dining tabletop remains solid after export optimization', () => {
  const hit = rayWorld({ x: 17.31, y: 10.2, z: -18.9 }, { x: 17.31, y: 9.3, z: -18.9 });
  assert.ok(hit && hit.normal.y > .9 && hit.position.y > 9.5, 'do not discard the 508-triangle tabletop as decoration');
});

test('the living craft desk has a solid worktop and body while retaining usable legroom', () => {
  // Source desk center: wall X 2.981m, U .84m, D .40m; top Z 3.155m.
  const top = rayWorld(
    { x: 3.381 * 3, y: 3.35 * 3, z: -6.195 * 3 },
    { x: 3.381 * 3, y: 3.00 * 3, z: -6.195 * 3 },
  );
  assert.ok(top && top.position.y >= 3.155 * 3 - .001 && top.position.y <= 3.165 * 3 && top.normal.y > .9,
    'desk worktop and its physical craft mat block downward flight and paint');

  const bodyHeight = 2.75 * 3;
  const front = { x: 3.65 * 3, y: bodyHeight, z: -5.56 * 3 };
  const behindPedestal = { x: 3.05 * 3, y: bodyHeight, z: -5.56 * 3 };
  assert.ok(sweepWorld(front, behindPedestal, DRONE_RADIUS), 'left desk pedestal blocks frontal flight');

  const legroom = { x: 3.30 * 3, y: 2.75 * 3, z: -6.00 * 3 };
  assert.ok(!overlapsWorld(legroom, DRONE_RADIUS), 'desk knee space remains usable drone airspace');
});

test('the kitchen ceiling meets the pendant canopy and blocks flight and paint', () => {
  // Original Blender canopy top: z=4.85m, directly under the room's lowered ceiling.
  const from = { x: 1.96545 * 3, y: 4.80 * 3, z: -9.46948 * 3 };
  const to = { ...from, y: 5.00 * 3 };
  const hit = rayWorld(from, to);
  assert.ok(hit && Math.abs(hit.position.y - 4.85 * 3) < .002 && hit.normal.y < -.9);
  assert.ok(sweepWorld(from, to, DRONE_RADIUS), 'drones must collide with the visible ceiling');
});

test('ceiling finishes close the living-room seams and kitchen plenum without closing the passage', () => {
  for (const [x, y, height] of [[1.2, 1, 5.07], [4.5, 2, 5.07], [2.90, 8, 4.85]]) {
    const from = { x: x * 3, y: (height - .06) * 3, z: -y * 3 };
    const hit = rayWorld(from, { ...from, y: 5.18 * 3 });
    assert.ok(hit && Math.abs(hit.position.y - height * 3) < .002 && hit.normal.y < -.9);
  }
  const plenum = rayWorld({ x: 3.1 * 3, y: 5 * 3, z: -8 * 3 }, { x: 2.7 * 3, y: 5 * 3, z: -8 * 3 });
  assert.ok(plenum && Math.abs(plenum.position.x - 2.97 * 3) < .002, 'the dropped ceiling has a closed vertical edge');
  assert.equal(sweepWorld({ x: 2.5 * 3, y: 4 * 3, z: -8 * 3 }, { x: 3.4 * 3, y: 4 * 3, z: -8 * 3 }, DRONE_RADIUS), null);
});

test('all authored upper bedroom and bathroom ceilings block flight and paint', () => {
  // Authored finishes sit 3 mm below the roof plane to avoid depth flicker.
  for (const [x, y, height] of [[4.5, 2.5, 8.106], [4.5, 6.5, 8.107], [1.5, 7.5, 8.107], [1.5, 1.5, 8.107]]) {
    const from = { x: x * 3, y: (height - .1) * 3, z: -y * 3 };
    const to = { ...from, y: (height + .1) * 3 };
    const hit = rayWorld(from, to);
    assert.ok(hit && Math.abs(hit.position.y - height * 3) < .002 && hit.normal.y < -.9);
    assert.ok(sweepWorld(from, to, DRONE_RADIUS));
  }
});

test('the first-floor landing and living ceiling meet at one height', () => {
  for (const [x, z] of [[7.5, -12.5], [4, -5], [15, -15], [15, -26], [8.84, -8], [8.86, -8]]) {
    const from = { x, y: 15.0, z }, to = { x, y: 15.4, z };
    const hit = rayWorld(from, to);
    assert.ok(hit && Math.abs(hit.position.y - 15.21) < .00002 && hit.normal.y < -.9,
      `Ceiling collision must stay level at ${x},${z}`);
    assert.ok(sweepWorld(from, to, DRONE_RADIUS), 'Upward flight must stop at the corrected ceiling');
  }
});

test('Bedroom 3 paint hits its visible wall linings instead of the structure behind them', () => {
  const bearWall = rayWorld(
    { x: 4, y: 21, z: -6 },
    { x: 0, y: 21, z: -6 },
  );
  assert.ok(bearWall && bearWall.normal.x > .9);
  assert.ok(Math.abs(bearWall.position.x - .867) < .001,
    'bear-wall paint must land on the room-side pink lining');

  const doorWall = rayWorld(
    { x: 3, y: 20, z: -6 },
    { x: 3, y: 20, z: -11 },
  );
  assert.ok(doorWall && doorWall.normal.z > .9);
  assert.ok(Math.abs(doorWall.position.z - -9.693) < .001,
    'door-wall paint must land on the room-side white lining');
});

test('the existing interior door openings are clear for a drone', () => {
  // Centers come from the source house's door construction scripts, in Blender meters.
  const doors: [string, number, number, number, 'x' | 'z'][] = [
    ['Ground bedroom', 2.875, 6.185, 0, 'x'],
    ['Ground bathroom', 4.0, 5.75, 0, 'z'],
    ['Living stair door', 2.345, 5.205, 2.41, 'z'],
    ['Bedroom 1', 2.84, 3.79, 5.31, 'x'],
    ['Bedroom 2', 2.84, 5.51, 5.31, 'x'],
    ['Bedroom 3', 2.25, 3.29, 5.31, 'z'],
    ['Storage', 1.855, 5.81, 5.31, 'x'],
    ['Upper bathroom', 2.27, 6.49, 5.31, 'z'],
  ];
  for (const [name, x, y, floor, axis] of doors) {
    const center = { x: x * 3, y: (floor + 1.2) * 3, z: -y * 3 };
    const from = { ...center, [axis]: center[axis] - 0.6 };
    const to = { ...center, [axis]: center[axis] + 0.6 };
    assert.equal(sweepWorld(from, to, DRONE_RADIUS), null, `${name} is blocked`);
  }
});

test('the real rooms and floors connect through flyable geometry', { timeout: 90000 }, () => {
  const step = 0.65;
  const origin = { x: HOUSE_BOUNDS.min.x + 0.3, y: HOUSE_BOUNDS.min.y + 0.3, z: HOUSE_BOUNDS.min.z + 0.3 };
  const nx = Math.ceil((HOUSE_BOUNDS.max.x - origin.x) / step);
  const ny = Math.ceil((HOUSE_BOUNDS.max.y - origin.y) / step);
  const nz = Math.ceil((HOUSE_BOUNDS.max.z - origin.z) / step);
  const count = nx * ny * nz;
  assert.ok(count < 500000, 'navigation grid should cover the house, not unbounded context');
  const state = new Int8Array(count); // 0 unknown, -1 obstructed, 1 reached, 2 clear
  const queue = new Int32Array(count);
  const index = (x: number, y: number, z: number) => x + nx * (z + nz * y);
  function point(i: number): Vec3 {
    return { x: origin.x + (i % nx) * step, y: origin.y + Math.floor(i / (nx * nz)) * step, z: origin.z + (Math.floor(i / nx) % nz) * step };
  }
  const seed = getSpawns()[0].position;
  let tail = 0;
  for (let i = 0; i < count; i++) {
    const p = point(i);
    if (Math.hypot(p.x - seed.x, p.y - seed.y, p.z - seed.z) < step * 1.8 && !overlapsWorld(p, DRONE_RADIUS) && !sweepWorld(seed, p, DRONE_RADIUS)) {
      state[i] = 1;
      queue[tail++] = i;
      break;
    }
  }
  assert.ok(tail, 'first spawn can enter free air');
  const offsets = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % nx, y = Math.floor(i / (nx * nz)), z = Math.floor(i / nx) % nz;
    const from = point(i);
    for (const [dx, dy, dz] of offsets) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
      const next = index(xx, yy, zz);
      if (state[next] === 1 || state[next] === -1) continue;
      const to = point(next);
      if (state[next] === 0) state[next] = overlapsWorld(to, DRONE_RADIUS) ? -1 : 2;
      if (state[next] === -1 || sweepWorld(from, to, DRONE_RADIUS)) continue;
      state[next] = 1;
      queue[tail++] = next;
    }
  }
  const reached = Array.from(queue.subarray(0, tail), point);
  const disconnectedRooms = ROOMS.filter(room => !reached.some(p => p.x > room.min.x + .2 && p.x < room.max.x - .2 && p.y > room.min.y + .2 && p.y < room.max.y - .2 && p.z > room.min.z + .2 && p.z < room.max.z - .2));
  const disconnectedSpawns = getSpawns().filter(spawn => !reached.some(p => Math.hypot(p.x - spawn.position.x, p.y - spawn.position.y, p.z - spawn.position.z) < step * 1.8 && !sweepWorld(spawn.position, p, DRONE_RADIUS)));
  assert.deepEqual({ rooms: disconnectedRooms.map(r => r.name), spawns: disconnectedSpawns }, { rooms: [], spawns: [] }, 'All actual rooms and spawns must be reachable');
  console.log(`Verified ${ROOMS.length} rooms and ${getSpawns().length} spawns through ${tail} reachable air cells.`);
});

test('no spawn sits in the garage or outside the labelled rooms', () => {
  for (const spawn of getSpawns()) {
    const room = getRoomName(spawn.position);
    assert.notEqual(room, 'Bicycle room', `garage spawn: ${JSON.stringify(spawn)}`);
    assert.notEqual(room, 'Stairwell', `spawn outside every room: ${JSON.stringify(spawn)}`);
  }
});

test('doors to the outside cannot be opened in hide and seek', () => {
  const states = createDoorStates();
  for (const label of ['Entrance', 'Garage', 'Veranda slider']) {
    const index = DOORS.findIndex(door => door.label === label), door = DOORS[index];
    assert.ok(door?.exterior, `${label} leads outside`);
    const center = { x: (door.min[0] + door.max[0]) / 2, y: (door.min[1] + door.max[1]) / 2, z: (door.min[2] + door.max[2]) / 2 };
    // Aim from inside, one metre off the thin axis, straight at the panel.
    const axis = [0, 1, 2].reduce((a, b) => (door.max[b] - door.min[b] < door.max[a] - door.min[a] ? b : a));
    for (const side of [-1.5, 1.5]) {
      const start = { ...center, [['x', 'y', 'z'][axis]]: [center.x, center.y, center.z][axis] + side };
      assert.equal(targetDoorOnRay(start, start, center, states, true), -1, `${label} targeted from ${side}`);
    }
  }
  // Free flight opens the garage from its wall buttons, inside and outside; hide and seek does not.
  const garage = DOORS.findIndex(door => door.label === 'Garage');
  for (const [from, to] of [[-2.2, -.87], [1.4, .12]]) {
    const start = { x: 20.37, y: 1.96, z: from };
    assert.equal(targetDoorOnRay(start, start, { ...start, z: to }, states), garage, `garage button at z ${to}`);
    assert.equal(targetDoorOnRay(start, start, { ...start, z: to }, states, true), -1, `hide and seek garage button at z ${to}`);
  }
});

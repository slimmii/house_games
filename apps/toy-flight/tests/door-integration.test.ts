import { CLOSET_DOORS } from '@huis/house/shared/closet-interiors';
import { LAUNDRY_DOORS } from '@huis/house/shared/laundry';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOORS,
  ROOM_DOOR_COUNT,
  createDoorStates,
  doorComponentBoxes,
  doorComponentCount,
  doorFixedTargetBoxes,
  doorLocalPoint,
  doorLocalVector,
  doorTargetComponents,
  doorWorldPoint,
  doorWorldVector,
  overlapsDoor,
  type SolidBox,
} from '@huis/house/shared/doors';
import { targetDoorOnRay } from '../src/shared/interaction';
import type { Vec3 } from '../src/shared/protocol';

const EPSILON = 2e-6;
const center = (box: SolidBox): Vec3 => ({
  x: (box.min[0] + box.max[0]) / 2,
  y: (box.min[1] + box.max[1]) / 2,
  z: (box.min[2] + box.max[2]) / 2,
});
const close = (actual: Vec3, expected: Vec3, label: string) => assert.ok(
  Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < EPSILON,
  `${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
);
const axes: Vec3[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

function worldBounds(index: number, fraction: number): SolidBox {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let partIndex = 0; partIndex < doorComponentCount(index); partIndex += 1) {
    for (const box of doorComponentBoxes(index, partIndex, 'collision')) {
      for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
        const point = doorWorldPoint({ x, y, z }, index, fraction, partIndex);
        for (const axis of [0, 1, 2] as const) {
          const value = axis === 0 ? point.x : axis === 1 ? point.y : point.z;
          min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
      }
    }
  }
  return { min, max };
}

function overlapsVolume(a: SolidBox, b: SolidBox): boolean {
  return a.min.every((value, axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(value, b.min[axis]) > 1e-5);
}

test('all door definitions have finite component geometry and invertible current poses', () => {
  assert.equal(DOORS.length, ROOM_DOOR_COUNT + CLOSET_DOORS.length + LAUNDRY_DOORS.length, 'room, cabinet and appliance doors are reviewed');
  for (let index = 0; index < DOORS.length; index += 1) {
    const door = DOORS[index];
    assert.ok(door.min.every((value, axis) => Number.isFinite(value) && value < door.max[axis]), `${door.id}: bounds`);
    assert.ok(doorComponentCount(index) >= 1, `${door.id}: component count`);
    for (let partIndex = 0; partIndex < doorComponentCount(index); partIndex += 1) {
      const boxes = doorComponentBoxes(index, partIndex, 'collision');
      assert.ok(boxes.length, `${door.id}:${partIndex}: collision geometry`);
      const point = center(boxes[0]);
      const normal = { x: .31, y: -.47, z: .826 };
      for (const fraction of [0, .5, 1]) {
        close(doorLocalPoint(doorWorldPoint(point, index, fraction, partIndex), index, fraction, partIndex), point,
          `${door.id}:${partIndex} point roundtrip at ${fraction}`);
        close(doorLocalVector(doorWorldVector(normal, index, fraction, partIndex), index, fraction, partIndex), normal,
          `${door.id}:${partIndex} vector roundtrip at ${fraction}`);
      }
    }
  }
});

test('every operable definition exposes a reachable current-pose target when closed, moving, and open', () => {
  for (const fraction of [0, .5, 1]) {
    const states = createDoorStates();
    states.forEach(state => { state.fraction = fraction; });
    for (let index = 0; index < DOORS.length; index += 1) {
      const door = DOORS[index];
      if (door.fixed) continue;
      const targets = [
        ...doorTargetComponents(index).flatMap(component => component.boxes.map(box => ({ box, partIndex: component.partIndex, fixed: false }))),
        ...doorFixedTargetBoxes(index).map(box => ({ box, partIndex: 0, fixed: true })),
      ];
      assert.ok(targets.length, `${door.id}: has a control or visible grip`);
      const targetable = targets.some(target => {
        const localCenter = center(target.box);
        const point = target.fixed ? localCenter : doorWorldPoint(localCenter, index, fraction, target.partIndex);
        return axes.some(axis => {
          const normal = target.fixed ? axis : doorWorldVector(axis, index, fraction, target.partIndex);
          const start = { x: point.x + normal.x * .55, y: point.y + normal.y * .55, z: point.z + normal.z * .55 };
          const end = { x: point.x - normal.x * .12, y: point.y - normal.y * .12, z: point.z - normal.z * .12 };
          return targetDoorOnRay(start, start, end, states) === index;
        });
      });
      assert.ok(targetable, `${door.id}: reachable target at fraction ${fraction}`);
    }
  }
});

test('drawers and hinged cupboards initially move into their authored open direction', () => {
  for (let index = ROOM_DOOR_COUNT; index < DOORS.length; index += 1) {
    const door = DOORS[index] as typeof DOORS[number] & { outward?: number[] };
    const outward = door.outward ?? [0, 0, 0];
    if (door.kind === 'drawer') {
      assert.ok(door.slide[0] * outward[0] + door.slide[2] * outward[2] > .1, `${door.id}: drawer travels outward`);
      continue;
    }
    if (door.kind !== 'cupboard') continue;
    const tangent: 0 | 2 = door.max[0] - door.min[0] > door.max[2] - door.min[2] ? 0 : 2;
    const values = [
      (door.min[0] + door.max[0]) / 2,
      (door.min[1] + door.max[1]) / 2,
      (door.min[2] + door.max[2]) / 2,
    ];
    values[tangent] = Math.abs(door.min[tangent] - door.pivot[tangent]) > Math.abs(door.max[tangent] - door.pivot[tangent])
      ? door.min[tangent] : door.max[tangent];
    const point = { x: values[0], y: values[1], z: values[2] };
    const moved = doorWorldPoint(point, index, .12);
    assert.ok((moved.x - point.x) * outward[0] + (moved.z - point.z) * outward[2] > 0,
      `${door.id}: free edge starts outward`);
  }
});

test('tracked sliders unseat onto parallel lanes, clear their openings, and never intersect their partner', () => {
  const pairs = [
    ['door_12', 'door_11'],
    ['closet_123', 'closet_124'],
    ['closet_125', 'closet_126'],
  ];
  const fractions = [0, .03, .06, .09, .12, .25, .5, .75, 1];
  for (const [firstId, secondId] of pairs) {
    const first = DOORS.findIndex(door => door.id === firstId), second = DOORS.findIndex(door => door.id === secondId);
    assert.ok(first >= 0 && second >= 0);
    const sampledFractions = firstId === 'closet_125'
      ? Array.from({ length: 101 }, (_value, index) => index / 100)
      : fractions;
    for (const firstFraction of sampledFractions) for (const secondFraction of sampledFractions) {
      assert.equal(overlapsVolume(worldBounds(first, firstFraction), worldBounds(second, secondFraction)), false,
        `${firstId}@${firstFraction}/${secondId}@${secondFraction}: separate rails in independently commanded states`);
    }
  }
  for (let index = 0; index < DOORS.length; index += 1) {
    const door = DOORS[index];
    if (door.kind !== 'sliding' && door.id !== 'door_12') continue;
    assert.equal(door.angle, 0, `${door.id}: parallel translation, no yaw swing`);
    assert.equal(overlapsDoor(center(door), .01, index, 1), false, `${door.id}: original opening clears`);
    const thicknessAxis: 0 | 2 = door.max[0] - door.min[0] < door.max[2] - door.min[2] ? 0 : 2;
    const trackAxis: 0 | 2 = thicknessAxis === 0 ? 2 : 0;
    const closed = center(door), open = doorWorldPoint(closed, index, 1);
    const trackTravel = Math.abs((trackAxis === 0 ? open.x - closed.x : open.z - closed.z));
    const width = door.max[trackAxis] - door.min[trackAxis];
    assert.ok(trackTravel >= width * .85, `${door.id}: full travel clears most of its leaf width`);
  }
});

test('fully overhead garage remains operable from both fixed jamb controls, except in hide and seek', () => {
  const index = DOORS.findIndex(door => door.id === 'door_5');
  const controls = doorFixedTargetBoxes(index);
  assert.deepEqual(controls.map(box => box.sourceName), ['garage-control:outside', 'garage-control:inside']);
  const states = createDoorStates(); states[index].fraction = 1;
  for (const box of controls) {
    const point = center(box), outside = point.z > -.4;
    const direction = outside ? 1 : -1;
    const start = { ...point, z: point.z + direction * .65 };
    const end = { ...point, z: point.z - direction * .12 };
    assert.equal(targetDoorOnRay(start, start, end, states), index, `${box.sourceName}: reachable with leaf overhead`);
    assert.equal(targetDoorOnRay(start, start, end, states, true), -1, `${box.sourceName}: hiders may not leave the house`);
  }
});

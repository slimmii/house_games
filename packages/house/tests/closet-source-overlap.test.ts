import test from 'node:test';
import assert from 'node:assert/strict';
import manifestJson from '../src/shared/closets-manifest.json';
import {
  CLOSET_DOORS,
  CLOSET_UNITS,
  CLOSET_DRAWER_BOXES,
  getClosetStaticBoxes,
  getClosetStructuralBoxes,
  type ClosetEntry,
} from '../src/shared/closet-interiors';
import type { SolidBox } from '../src/shared/door-types';

const EPSILON = 1e-6;

type AuthoredTrayEntry = ClosetEntry & {
  authoredTrayVisual?: boolean;
  authoredTrayBounds?: Array<SolidBox & { name: string }>;
};

function depthAxis(entry: ClosetEntry): 0 | 2 {
  return Math.abs(entry.outward[0] ?? 0) >= Math.abs(entry.outward[2] ?? 0) ? 0 : 2;
}

test('every closet unit derives its shell from audited source geometry', () => {
  for (const unit of CLOSET_UNITS) {
    const entries = CLOSET_DOORS.filter(entry => entry.unitId === unit.id);
    assert.ok(
      unit.authoredStructureBounds?.length || entries.some(entry => entry.sourceSolidBounds?.length),
      `${unit.id}: declares exact authored boards or a removed source-solid envelope`,
    );
  }
});

test('replacement cabinet backs remain inside the removed source-solid envelope', () => {
  for (const unit of CLOSET_UNITS) {
    if (unit.authoredStructureBounds?.length) continue;
    const entries = CLOSET_DOORS.filter(entry => entry.unitId === unit.id);
    const sourceSolids = entries.flatMap(entry => entry.sourceSolidBounds ?? []);
    if (!sourceSolids.length) continue;

    const axis = depthAxis(entries[0]);
    const sourceMin = Math.min(...sourceSolids.map(box => box.min[axis]));
    const sourceMax = Math.max(...sourceSolids.map(box => box.max[axis]));
    const sign = Math.sign(entries[0].outward[axis]) || 1;
    const generated = getClosetStructuralBoxes(unit.id);
    const back = generated[4 - (unit.openSides?.length ?? 0)];

    assert.ok(back, `${unit.id}: replacement shell has a rear board`);
    assert.ok(back.min[axis] >= sourceMin - EPSILON, `${unit.id}: rear board starts inside old solid`);
    assert.ok(back.max[axis] <= sourceMax + EPSILON, `${unit.id}: rear board ends inside old solid`);
    if (sign > 0) {
      assert.ok(Math.abs(unit.interior.min[axis] - back.max[axis]) < EPSILON,
        `${unit.id}: positive-facing cavity starts at the rebuilt rear board`);
    } else {
      assert.ok(Math.abs(unit.interior.max[axis] - back.min[axis]) < EPSILON,
        `${unit.id}: negative-facing cavity ends at the rebuilt rear board`);
    }
  }
});

test('Bedroom 1 SMÅSTAD opens toward +Z and keeps its authored body behind the fronts', () => {
  const unit = CLOSET_UNITS.find(candidate => candidate.id === 'bedroom1-smastad')!;
  const fronts = CLOSET_DOORS.filter(entry => entry.unitId === unit.id);

  assert.ok(fronts.length > 0);
  assert.ok(fronts.every(entry => entry.outward[2] === 1), 'the room-facing direction is +Z');
  const back = unit.authoredStructureBounds?.find(box => box.name === 'Bedroom 1 / SMÅSTAD cupboard back');
  assert.ok(back);
  const frontRearFace = Math.min(...fronts.map(entry => entry.min[2]));
  assert.ok(unit.authoredStructureBounds!.every(box => box.max[2] <= frontRearFace + EPSILON),
    'retained back, sides, and shelves stay behind the closed fronts');
  assert.ok(Math.abs(unit.interior.min[2] - back.max[2]) < EPSILON,
    'usable cavity starts at the authored back inner face');
});

test('retained authored cabinetry is the complete static structure and receives no generic fixtures', () => {
  const representativeUnits = [
    'camber-a-tall',
    'camber-b-upper-1',
    'camber-tv-1',
    'bathroom-vanity',
    'bedroom1-smastad',
    'bedroom1-horse-cupboard',
    'bedroom2-white-storage',
    'bedroom2-armoire',
    'small-bedroom-cubes',
    'bedroom2-wardrobe',
    'living-coffee-table',
    'bedroom1-wire-drawer-1',
    'bedroom1-wire-drawer-2',
    'bedroom1-wire-drawer-3',
  ];

  for (const id of representativeUnits) {
    const unit = CLOSET_UNITS.find(candidate => candidate.id === id);
    assert.ok(unit, `${id}: unit exists`);
    assert.ok(unit.authoredStructureBounds?.length, `${id}: exact source boards are declared`);
    assert.deepEqual(getClosetStructuralBoxes(id), unit.authoredStructureBounds,
      `${id}: structural collision uses the retained boards`);
    assert.deepEqual(getClosetStaticBoxes(id), unit.authoredStructureBounds,
      `${id}: no generic shelf, back, rail, hanger, or sink fixture is layered over source geometry`);
  }
});

test('authored drawer assemblies move with their fronts and replace generated tray visuals', () => {
  const collisionExcluded = new Set(
    (manifestJson as { collisionExcludedSourceNames: string[] }).collisionExcludedSourceNames,
  );
  const entries = CLOSET_DOORS as readonly AuthoredTrayEntry[];
  const authored = entries.filter(entry => entry.authoredTrayVisual);
  const exactTrays = authored.filter(entry => entry.authoredTrayBounds?.length);

  assert.ok(authored.some(entry => entry.unitId === 'bedroom1-divider'));
  assert.ok(authored.some(entry => entry.unitId.startsWith('bedroom2-wardrobe-drawers-')));
  assert.ok(authored.some(entry => entry.unitId === 'living-coffee-table'));
  assert.ok(authored.some(entry => entry.unitId.startsWith('bedroom1-wire-drawer-')));

  const assignedParts = new Set<string>();
  for (const entry of exactTrays) {
    const sourceParts = entry.authoredTrayBounds!;
    assert.equal(sourceParts.length, 4, `${entry.label}: bottom, left, right, and back`);
    assert.equal(CLOSET_DRAWER_BOXES[entry.id].length, 4, `${entry.label}: collision follows exact tray`);
    sourceParts.forEach((part, index) => {
      assert.ok(!assignedParts.has(part.name), `${part.name}: source part belongs to one drawer only`);
      assignedParts.add(part.name);
      assert.ok(entry.attachedNames.includes(part.name), `${part.name}: travels with its front pivot`);
      assert.ok(entry.removeNames.includes(part.name), `${part.name}: leaves the static source scene`);
      assert.ok(collisionExcluded.has(part.name), `${part.name}: leaves static collision`);
      assert.deepEqual(CLOSET_DRAWER_BOXES[entry.id][index].min, part.min, `${part.name}: collision min`);
      assert.deepEqual(CLOSET_DRAWER_BOXES[entry.id][index].max, part.max, `${part.name}: collision max`);
    });
  }

  for (const entry of authored.filter(candidate => candidate.unitId.startsWith('bedroom1-wire-drawer-'))) {
    assert.equal(entry.authoredTrayBounds, undefined, `${entry.label}: fine wire keeps compact tray collision`);
    assert.ok(entry.frontNames.length > 100, `${entry.label}: authored wire meshes are the moving visual`);
    assert.ok(entry.frontNames.every(name => entry.attachedNames.includes(name) && collisionExcluded.has(name)),
      `${entry.label}: every wire part moves and is excluded from static collision`);
  }

  const coffee = authored.find(entry => entry.unitId === 'living-coffee-table')!;
  for (const name of [
    'Living / coffee table reference / handle mounting block',
    'Living / coffee table reference / handle mounting block.001',
  ]) {
    assert.ok(coffee.attachedNames.includes(name), `${name}: follows the pull`);
    assert.ok(coffee.removeNames.includes(name), `${name}: is not left behind in the static scene`);
    assert.ok(collisionExcluded.has(name), `${name}: is not left behind in static collision`);
  }
});

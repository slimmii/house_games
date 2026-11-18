import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSET_DOORS,
  CLOSET_UNITS,
  getClosetStructuralBoxes,
  type ClosetEntry,
} from '../src/shared/closet-interiors';

const BOARD_THICKNESS = 0.045;
const EPSILON = 1e-6;

function depthAxis(entry: ClosetEntry): 0 | 2 {
  return Math.abs(entry.outward[0] ?? 0) >= Math.abs(entry.outward[2] ?? 0) ? 0 : 2;
}

function generatedBack(unitId: string) {
  const unit = CLOSET_UNITS.find(candidate => candidate.id === unitId)!;
  const index = 4 - (unit.openSides?.length ?? 0);
  return getClosetStructuralBoxes(unitId)[index];
}

test('reconstructed backs stay in the removed solid carcass depth envelope', () => {
  let covered = 0;
  for (const unit of CLOSET_UNITS) {
    if (unit.authoredStructureBounds?.length) continue;
    const entries = CLOSET_DOORS.filter(entry => entry.unitId === unit.id);
    const sourceSolids = entries.flatMap(entry => entry.sourceSolidBounds ?? []);
    if (!sourceSolids.length) continue;
    covered += 1;

    const entry = entries[0];
    const axis = depthAxis(entry);
    const sign = Math.sign(entry.outward[axis]) || 1;
    const sourceMin = Math.min(...sourceSolids.map(box => box.min[axis]));
    const sourceMax = Math.max(...sourceSolids.map(box => box.max[axis]));
    const back = generatedBack(unit.id);

    assert.ok(back, `${unit.id}: missing generated back`);
    assert.ok(back.min[axis] >= sourceMin - EPSILON, `${unit.id}: back escapes source rear`);
    assert.ok(back.max[axis] <= sourceMax + EPSILON, `${unit.id}: back escapes source front`);
    assert.ok(Math.abs(back.max[axis] - back.min[axis] - BOARD_THICKNESS) < EPSILON,
      `${unit.id}: back thickness`);
    if (sign > 0) {
      assert.ok(Math.abs(back.min[axis] - sourceMin) < EPSILON,
        `${unit.id}: positive-facing back must start at the old carcass rear`);
      assert.ok(Math.abs(unit.interior.min[axis] - back.max[axis]) < EPSILON,
        `${unit.id}: cavity starts at the back's usable inner face`);
    } else {
      assert.ok(Math.abs(back.max[axis] - sourceMax) < EPSILON,
        `${unit.id}: negative-facing back must end at the old carcass rear`);
      assert.ok(Math.abs(unit.interior.max[axis] - back.min[axis]) < EPSILON,
        `${unit.id}: cavity ends at the back's usable inner face`);
    }
  }
  assert.ok(covered >= 30, 'the invariant covers every removed solid-carcass class');
});

test('entrance cupboard backs clear the authored brick wall at their visible face', () => {
  // Evaluated bound of `Hall photo / continuous reference brick side wall`
  // from /tmp/closet-all-objects.json. The former generated inner face was
  // exactly 1.035 and visibly z-fought this wall through the open cupboards.
  const brickInnerFaceX = 1.035;
  for (const id of ['hall-tall', 'hall-narrow', 'hall-shoes-1', 'hall-shoes-2']) {
    const unit = CLOSET_UNITS.find(candidate => candidate.id === id)!;
    const back = generatedBack(id);
    assert.equal(back.min[0], 1.05, `${id}: preserve the authored carcass rear`);
    assert.equal(back.max[0], 1.095, `${id}: expose the rebuilt back inside the cupboard`);
    assert.equal(unit.interior.min[0], back.max[0], `${id}: collision and usable cavity agree`);
    assert.ok(back.max[0] - brickInnerFaceX >= BOARD_THICKNESS - EPSILON,
      `${id}: visible white back must be separated from brick`);
  }
});

test('every modular-cube print moves with its illustrated door', () => {
  const cubes = CLOSET_DOORS.filter(entry => entry.unitId === 'small-bedroom-cubes');
  const prints = cubes.flatMap(entry => entry.attachmentBounds ?? [])
    .filter(box => /(?:print|printed|mushroom)/.test(box.name));
  assert.equal(cubes.length, 6);
  assert.equal(prints.length, 33, 'all authored tree, leaf, mushroom, and hedgehog pieces are attached');
  assert.ok(cubes.every(entry => (entry.attachmentBounds ?? [])
    .some(box => /(?:print|printed|mushroom)/.test(box.name))), 'every illustrated door owns visible artwork');
});

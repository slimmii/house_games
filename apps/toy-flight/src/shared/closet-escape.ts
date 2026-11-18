import { CLOSET_DOORS, CLOSET_UNITS, type ClosetEntry } from '@huis/house/shared/closet-interiors';
import { DOORS, doorWorldPoint, insideDrawer, type DoorState } from '@huis/house/shared/doors';
import { DRONE_RADIUS, type Vec3 } from './protocol';

export type ClosetEscape = {
  index: number;
  /** Group intent for the next deliberate inside interaction. */
  opening: boolean;
  changes: { index: number; opening: boolean }[];
  drawerIndex: number;
};

const CONTAINMENT_EPSILON = .008;
const EXIT_CLEARANCE = DRONE_RADIUS + .015;
const fronts = CLOSET_DOORS.map(entry => ({ entry, index: DOORS.findIndex(door => door.id === entry.id) }));
const units = CLOSET_UNITS.map(unit => ({ unit, fronts: fronts.filter(front => front.entry.unitId === unit.id) }));
const depthAxis = (entry: ClosetEntry): 0 | 2 => Math.abs(entry.outward[0]) > .5 ? 0 : 2;
const coordinates = (point: Vec3) => [point.x, point.y, point.z];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function projectionDistance(point: readonly number[], entry: ClosetEntry): number {
  const h = depthAxis(entry) === 0 ? 2 : 0;
  return Math.hypot(point[h] - clamp(point[h], entry.min[h], entry.max[h]),
    point[1] - clamp(point[1], entry.min[1], entry.max[1]));
}

/** A sliding pair must stack at one end. Opening both leaves swaps their
 * positions and can seal the same opening again. Find the nearest clear bay. */
function slidingExit(group: typeof units[number], point: readonly number[], states: readonly DoorState[]) {
  const d = depthAxis(group.fronts[0].entry), h = d === 0 ? 2 : 0;
  const min = group.unit.interior.min[h] + EXIT_CLEARANCE;
  const max = group.unit.interior.max[h] - EXIT_CLEARANCE;
  let best: { distance: number; travel: number; changes: ClosetEscape['changes'] } | undefined;
  const sliding = group.fronts.filter(front => front.entry.kind === 'sliding');
  for (let mask = 0; mask < 2 ** sliding.length; mask++) {
    const blocked: [number, number][] = [];
    const changes = sliding.map(({ index }, bit) => ({ index, opening: Boolean(mask & (1 << bit)) }));
    let travel = 0;
    for (const change of changes) {
      const fraction = change.opening ? 1 : 0;
      travel += Math.abs(fraction - (states[change.index]?.fraction ?? 0));
      for (const box of DOORS[change.index].collisionBoxes) {
        if (point[1] + EXIT_CLEARANCE < box.min[1] || point[1] - EXIT_CLEARANCE > box.max[1]) continue;
        const a = coordinates(doorWorldPoint({ x: box.min[0], y: box.min[1], z: box.min[2] }, change.index, fraction));
        const b = coordinates(doorWorldPoint({ x: box.max[0], y: box.max[1], z: box.max[2] }, change.index, fraction));
        blocked.push([Math.min(a[h], b[h]) - EXIT_CLEARANCE, Math.max(a[h], b[h]) + EXIT_CLEARANCE]);
      }
    }
    blocked.sort((a, b) => a[0] - b[0]);
    const gaps: [number, number][] = [];
    let cursor = min;
    for (const [lo, hi] of blocked) {
      if (lo > cursor) gaps.push([cursor, Math.min(lo, max)]);
      cursor = Math.max(cursor, hi);
      if (cursor >= max) break;
    }
    if (cursor < max) gaps.push([cursor, max]);
    for (const [lo, hi] of gaps) {
      if (hi - lo < .01) continue;
      const distance = Math.abs(point[h] - clamp(point[h], lo + .002, hi - .002));
      if (!best || distance < best.distance - 1e-6
        || (Math.abs(distance - best.distance) <= 1e-6 && travel < best.travel - 1e-6)) {
        best = { distance, travel, changes };
      }
    }
  }
  return best?.changes ?? [];
}

/** Interior controls are independent of visible handles and interaction history.
 * Shared by the HUD and server. The resolved safe exit pose is one group: when
 * every member is already commanded toward that pose, G closes the group;
 * otherwise G opens it. */
export function closetEscape(position: Vec3, states: readonly DoorState[]): ClosetEscape | null {
  const point = coordinates(position);
  if (!point.every(Number.isFinite)) return null;
  const contained = new Set<typeof units[number]>();
  const candidates: { index: number; distance: number; drawer: boolean; volume: number }[] = [];
  const changes = new Map<number, boolean>();

  for (const group of units) {
    const { min, max } = group.unit.interior;
    const h = depthAxis(group.fronts[0].entry) === 0 ? 2 : 0;
    // L-shaped cabinets share an open side, with small authored gaps between
    // their cavity bounds. Cover the join without expanding solid outer walls.
    const stationary = point.every((value, axis) => {
      const lo = axis === h && group.unit.openSides?.includes('min') ? DRONE_RADIUS : CONTAINMENT_EPSILON;
      const hi = axis === h && group.unit.openSides?.includes('max') ? DRONE_RADIUS : CONTAINMENT_EPSILON;
      return value >= min[axis] - lo && value <= max[axis] + hi;
    });
    const trays = group.fronts.filter(({ entry, index }) => entry.kind === 'drawer'
      && insideDrawer(position, index, states[index]?.fraction ?? 0));
    if (!stationary && !trays.length) continue;
    contained.add(group);
    const projected = group.fronts.map(front => ({ ...front, distance: projectionDistance(point, front.entry) }));
    const nearest = Math.min(...projected.map(front => front.distance));
    const selected = stationary ? projected.filter(front => front.distance <= Math.max(nearest, EXIT_CLEARANCE) + 1e-6) : [];
    for (const front of trays) if (!selected.some(item => item.index === front.index)) selected.push({ ...front, distance: 0 });
    for (const { entry, index, distance } of selected) {
      candidates.push({ index, distance, drawer: entry.kind === 'drawer', volume: (max[0]-min[0])*(max[1]-min[1])*(max[2]-min[2]) });
      if (entry.kind !== 'sliding') changes.set(index, true);
    }
  }
  if (!candidates.length) return null;

  // Inner drawers can extend beyond the outer wardrobe's cavity. Include its
  // enclosing front even when the pilot's center is behind that cavity's back.
  for (const inner of [...contained]) {
    const entry = inner.fronts[0].entry, d = depthAxis(entry), sign = entry.outward[d];
    for (const outer of units) {
      if (contained.has(outer) || !outer.fronts.some(front => front.entry.kind !== 'drawer')) continue;
      const outerEntry = outer.fronts[0].entry;
      if (depthAxis(outerEntry) !== d || outerEntry.outward[d] !== sign) continue;
      const a = inner.unit.interior, b = outer.unit.interior;
      if (!a.min.every((value, axis) => value < b.max[axis] && a.max[axis] > b.min[axis])) continue;
      const innerFace = sign > 0 ? entry.max[d] : entry.min[d];
      const outerFace = sign > 0 ? outerEntry.max[d] : outerEntry.min[d];
      if ((outerFace - innerFace) * sign <= .01) continue;
      contained.add(outer);
      for (const front of outer.fronts) {
        if (front.entry.kind !== 'sliding' && projectionDistance(point, front.entry) <= EXIT_CLEARANCE) changes.set(front.index, true);
      }
    }
  }

  for (const group of contained) if (group.fronts.some(front => front.entry.kind === 'sliding')) {
    for (const change of slidingExit(group, point, states)) changes.set(change.index, change.opening);
  }
  candidates.sort((a, b) => Number(b.drawer) - Number(a.drawer) || a.distance - b.distance || a.volume - b.volume || a.index - b.index);
  let index = candidates[0].index;
  if (DOORS[index].kind === 'sliding' && !changes.get(index)) {
    const unit = fronts.find(front => front.index === index)!.entry.unitId;
    index = fronts.find(front => front.entry.unitId === unit && changes.get(front.index))?.index ?? index;
  }
  const openChanges = [...changes].map(([index, opening]) => ({ index, opening }));
  const opening = !openChanges.every(change => states[change.index]?.opening === change.opening);
  return { index, opening, changes: opening ? openChanges : openChanges.map(change => ({ index: change.index, opening: false })),
    drawerIndex: candidates.find(candidate => candidate.drawer)?.index ?? -1 };
}

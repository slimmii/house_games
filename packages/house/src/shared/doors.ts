import { LAUNDRY_DOORS } from './laundry';
import manifest from './doors-manifest.json';
import { CLOSET_DOORS, CLOSET_DRAWER_BOXES, CLOSET_DYNAMIC_BOXES } from './closet-interiors';
import roomTargets from './room-door-targets.json';
import { overlapsWorld, sweepWorld, type WorldHit } from './collision';
import type { Vec3 } from './vec';
import type { DoorDefinition, DoorPartPose, SolidBox } from './door-types';
import {
  doorMotionComponentBounds,
  doorMotionComponentCount,
  doorMotionDuration,
  doorMotionLocalPoint,
  doorMotionLocalVector,
  doorMotionPartPose,
  doorMotionWorldPoint,
  doorMotionWorldVector,
} from './door-motion';

export type { DoorDefinition, SolidBox } from './door-types';
export const ROOM_DOOR_COUNT = manifest.length;
const GARAGE_CONTROL_BOXES: SolidBox[] = [
  { min:[20.30,1.85,.09],max:[20.44,2.07,.15],fixed:true,sourceName:'garage-control:outside' },
  { min:[20.30,1.85,-.90],max:[20.44,2.07,-.84],fixed:true,sourceName:'garage-control:inside' },
];
/** In hide and seek pilots stay inside: the front door, garage door and veranda slider stay shut. */
const EXTERIOR_DOOR_LABELS = new Set(['Entrance', 'Garage', 'Veranda slider']);
export const DOORS: DoorDefinition[] = [
  ...(manifest as unknown as DoorDefinition[]).map(d => ({
    ...d, kind: 'door' as const, exterior: EXTERIOR_DOOR_LABELS.has(d.label),
    targetBoxes: [
      { min: d.min, max: d.max },
      ...((roomTargets.targets as Record<string, SolidBox[]>)[d.id] ?? []),
      ...(d.label==='Garage' ? GARAGE_CONTROL_BOXES : []),
    ],
    collisionBoxes: [{ min: d.min, max: d.max }],
  })),
  ...CLOSET_DOORS.map(d => ({ ...d, collisionBoxes: [...CLOSET_DYNAMIC_BOXES[d.id]] })),
  ...LAUNDRY_DOORS,
];
export type DoorState = { fraction: number; /** Target pose. */ opening: boolean };
export type DoorHit = WorldHit & { doorIndex: number; partIndex: number };
export const DOOR_REACH = 2.4;
export const createDoorStates = (): DoorState[] => DOORS.map(() => ({ fraction: 0, opening: false }));

/** Stable bottom-to-top moving component count. Legacy doors have one component. */
export function doorComponentCount(index: number): number {
  return DOORS[index] ? doorMotionComponentCount(DOORS[index]) : 0;
}

export function doorPartPose(index: number, fraction: number, partIndex = 0): DoorPartPose {
  return doorMotionPartPose(DOORS[index], fraction, partIndex);
}

/** Transform points/vectors between current pose and closed-pose world coordinates. */
export function doorLocalPoint(p: Vec3, index: number, fraction: number, partIndex = 0): Vec3 {
  return doorMotionLocalPoint(DOORS[index], p, fraction, partIndex);
}
export function doorWorldPoint(p: Vec3, index: number, fraction: number, partIndex = 0): Vec3 {
  return doorMotionWorldPoint(DOORS[index], p, fraction, partIndex);
}
export function doorLocalVector(p: Vec3, index: number, fraction: number, partIndex = 0): Vec3 {
  return doorMotionLocalVector(DOORS[index], p, fraction, partIndex);
}
export function doorWorldVector(p: Vec3, index: number, fraction: number, partIndex = 0): Vec3 {
  return doorMotionWorldVector(DOORS[index], p, fraction, partIndex);
}

function intersectBoxes(box: SolidBox, component: SolidBox, gap: number): SolidBox | undefined {
  const min = box.min.map((value, axis) => Math.max(value, component.min[axis]));
  const max = box.max.map((value, axis) => Math.min(value, component.max[axis]));
  if (gap > 0) {
    min[1] = Math.max(min[1], component.min[1] + gap * .5);
    max[1] = Math.min(max[1], component.max[1] - gap * .5);
  }
  return min.every((value, axis) => value < max[axis] - 1e-8)
    ? { ...box, min, max, fixed: false } : undefined;
}

/** Closed-pose boxes owned by one rigid moving component. */
export function doorComponentBoxes(
  index: number,
  partIndex: number,
  kind: 'collision' | 'target',
): SolidBox[] {
  const definition = DOORS[index];
  if (!definition) return [];
  const boxes = (kind === 'collision' ? definition.collisionBoxes : definition.targetBoxes)
    .filter(box => !box.fixed);
  if (doorMotionComponentCount(definition) === 1) return boxes;
  const component = doorMotionComponentBounds(definition, partIndex);
  const gap = definition.motion?.type === 'sectional' ? definition.motion.panelGap : 0;
  return boxes.map(box => intersectBoxes(box, component, gap)).filter((box): box is SolidBox => !!box);
}

export function doorTargetComponents(index: number): Array<{ partIndex: number; boxes: SolidBox[] }> {
  return Array.from({ length: doorComponentCount(index) }, (_, partIndex) => ({
    partIndex,
    boxes: doorComponentBoxes(index, partIndex, 'target'),
  })).filter(component => component.boxes.length > 0);
}

export function doorFixedTargetBoxes(index: number): SolidBox[] {
  return DOORS[index]?.targetBoxes.filter(box => box.fixed) ?? [];
}
function overlapsBox(p: Vec3, radius: number, box: SolidBox): boolean {
  const x = Math.max(box.min[0], Math.min(box.max[0], p.x));
  const y = Math.max(box.min[1], Math.min(box.max[1], p.y));
  const z = Math.max(box.min[2], Math.min(box.max[2], p.z));
  return (p.x-x)**2 + (p.y-y)**2 + (p.z-z)**2 < radius * radius;
}
export function overlapsDoor(p: Vec3, radius: number, index: number, fraction: number): boolean {
  for (let partIndex = 0; partIndex < doorComponentCount(index); partIndex++) {
    const local = doorLocalPoint(p, index, fraction, partIndex);
    if (doorComponentBoxes(index, partIndex, 'collision').some(box => overlapsBox(local, radius, box))) return true;
  }
  return false;
}

function pointBoxDistanceSquared(p: Vec3, box: SolidBox): number {
  const x=Math.max(box.min[0],Math.min(box.max[0],p.x));
  const y=Math.max(box.min[1],Math.min(box.max[1],p.y));
  const z=Math.max(box.min[2],Math.min(box.max[2],p.z));
  return (p.x-x)**2+(p.y-y)**2+(p.z-z)**2;
}

function approachingDoorPadding(
  p: Vec3,
  radius: number,
  index: number,
  currentFraction: number,
  nextFraction: number,
): boolean {
  const padded=radius+.035;
  for (let partIndex=0;partIndex<doorComponentCount(index);partIndex++) {
    const current=doorLocalPoint(p,index,currentFraction,partIndex);
    const next=doorLocalPoint(p,index,nextFraction,partIndex);
    for (const box of doorComponentBoxes(index,partIndex,'collision')) {
      const nextDistance=pointBoxDistanceSquared(next,box);
      if (nextDistance < radius*radius) return true;
      // Padding anticipates this particular approaching component. A different,
      // constantly-nearer tray part must not mask its movement.
      if (nextDistance < padded*padded
        && nextDistance < pointBoxDistanceSquared(current,box)-1e-10) return true;
    }
  }
  return false;
}

/** The usable moving cavity of a generated drawer tray at its current pose. */
export function insideDrawer(position: Vec3, index: number, fraction: number): boolean {
  const door = DOORS[index];
  if (!door || door.kind !== 'drawer') return false;
  const boxes = CLOSET_DRAWER_BOXES[door.id];
  if (!boxes || boxes.length < 4) return false;
  const local = doorLocalPoint(position, index, fraction);
  const depthAxis: 0 | 2 = Math.abs(door.slide[0]) >= Math.abs(door.slide[2]) ? 0 : 2;
  const horizontalAxis: 0 | 2 = depthAxis === 0 ? 2 : 0;
  const sign = Math.sign(door.slide[depthAxis]) || 1;
  const bottom = boxes[0];
  const sides = [boxes[1], boxes[2]].sort((a,b) => a.min[horizontalAxis]-b.min[horizontalAxis]);
  const back = boxes[3];
  const horizontalMin = sides[0].max[horizontalAxis];
  const horizontalMax = sides[1].min[horizontalAxis];
  const depthMin = sign > 0 ? back.max[depthAxis] : door.max[depthAxis];
  const depthMax = sign > 0 ? door.min[depthAxis] : back.min[depthAxis];
  const epsilon = 1e-6;
  const values = [local.x,local.y,local.z];
  return values[horizontalAxis] >= horizontalMin-epsilon
    && values[horizontalAxis] <= horizontalMax+epsilon
    && local.y >= bottom.max[1]-epsilon
    && local.y <= door.max[1]+epsilon
    && values[depthAxis] >= Math.min(depthMin,depthMax)-epsilon
    && values[depthAxis] <= Math.max(depthMin,depthMax)+epsilon;
}

/** Segment versus expanded box; initial contacts block inward travel but allow retreat. */
export function intersectBox(start: Vec3, end: Vec3, box: SolidBox, radius = 0, ray = false): { t: number; normal: Vec3 } | null {
  if (radius > 0 && !ray) return sweepSphereBox(start, end, box, radius);
  const av = [start.x, start.y, start.z], bv = [end.x, end.y, end.z];
  let enter = -Infinity, exit = Infinity, normalAxis = 0, normalSign = 0;
  let inside = true, nearestFace = Infinity, insideAxis = 0, insideSign = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = bv[axis] - av[axis], lo = box.min[axis] - radius, hi = box.max[axis] + radius;
    if (av[axis] < lo || av[axis] > hi) inside = false;
    if (av[axis] - lo < nearestFace) { nearestFace = av[axis] - lo; insideAxis = axis; insideSign = -1; }
    if (hi - av[axis] < nearestFace) { nearestFace = hi - av[axis]; insideAxis = axis; insideSign = 1; }
    if (Math.abs(delta) < 1e-10) {
      if (av[axis] < lo || av[axis] > hi) return null;
      continue;
    }
    let t0 = (lo - av[axis]) / delta, t1 = (hi - av[axis]) / delta;
    const sign = delta > 0 ? -1 : 1;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > enter) { enter = t0; normalAxis = axis; normalSign = sign; }
    exit = Math.min(exit, t1);
  }
  if (inside) {
    if (!ray && (bv[insideAxis]-av[insideAxis]) * insideSign >= -1e-10) return null;
    enter = 0; normalAxis = insideAxis; normalSign = insideSign;
  }
  if (enter < 0 || enter > 1 || enter > exit) return null;
  const n = [0, 0, 0]; n[normalAxis] = normalSign;
  return { t: enter, normal: { x: n[0], y: n[1], z: n[2] } };
}

/** Exact rounded box: squared point-to-box distance is quadratic between
 * crossings of its six planes. This preserves sliding around edges without
 * letting a sweep that starts near a corner pass through the panel. */
function sweepSphereBox(start: Vec3, end: Vec3, box: SolidBox, radius: number): { t: number; normal: Vec3 } | null {
  if (!intersectBox(start, end, box, radius, true)) return null;
  const p = [start.x, start.y, start.z], v = [end.x-start.x, end.y-start.y, end.z-start.z];
  const normalAt = (t: number): Vec3 => {
    const n = p.map((value, axis) => {
      const point = value+v[axis]*t;
      return point-Math.max(box.min[axis], Math.min(box.max[axis], point));
    });
    const length = Math.hypot(...n);
    if (length > 1e-10) return { x:n[0]/length, y:n[1]/length, z:n[2]/length };
    let nearest = Infinity, faceAxis = 0, sign = -1;
    for (let axis = 0; axis < 3; axis++) {
      const value = p[axis]+v[axis]*t;
      if (value-box.min[axis] < nearest) { nearest = value-box.min[axis]; faceAxis = axis; sign = -1; }
      if (box.max[axis]-value < nearest) { nearest = box.max[axis]-value; faceAxis = axis; sign = 1; }
    }
    n.fill(0); n[faceAxis] = sign;
    return { x:n[0], y:n[1], z:n[2] };
  };
  const distanceSquared = p.reduce((sum,value,axis) => sum+(value-Math.max(box.min[axis],Math.min(box.max[axis],value)))**2,0);
  if (distanceSquared <= radius*radius+1e-10) {
    const normal = normalAt(0);
    return v[0]*normal.x+v[1]*normal.y+v[2]*normal.z < -1e-10 ? { t:0, normal } : null;
  }
  const breaks = [0,1];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(v[axis]) < 1e-10) continue;
    for (const plane of [box.min[axis],box.max[axis]]) {
      const t = (plane-p[axis])/v[axis];
      if (t > 0 && t < 1) breaks.push(t);
    }
  }
  breaks.sort((a,b)=>a-b);
  for (let interval = 0; interval < breaks.length-1; interval++) {
    const lo = breaks[interval], hi = breaks[interval+1], mid = (lo+hi)/2;
    let a = 0, b = 0, c = -radius*radius;
    for (let axis = 0; axis < 3; axis++) {
      const value = p[axis]+v[axis]*mid;
      if (value >= box.min[axis] && value <= box.max[axis]) continue;
      const offset = p[axis]-(value < box.min[axis] ? box.min[axis] : box.max[axis]);
      a += v[axis]*v[axis]; b += 2*offset*v[axis]; c += offset*offset;
    }
    if (a < 1e-15) continue;
    const discriminant = b*b-4*a*c;
    if (discriminant < 0) continue;
    const t = (-b-Math.sqrt(Math.max(0,discriminant)))/(2*a);
    if (t >= lo-1e-9 && t <= hi+1e-9 && t >= 0 && t <= 1) {
      const normal = normalAt(t);
      if (v[0]*normal.x+v[1]*normal.y+v[2]*normal.z < -1e-10) return { t, normal };
    }
  }
  return null;
}

/** Compound oriented panels, trays and handles, including at their open positions. */
export function sweepDoors(start: Vec3, end: Vec3, radius: number, states: readonly DoorState[]): DoorHit | null {
  let best: DoorHit | null = null;
  for (let i = 0; i < DOORS.length; i++) {
    const f = states[i]?.fraction ?? 0;
    for (let partIndex=0;partIndex<doorComponentCount(i);partIndex++) {
      const a = doorLocalPoint(start, i, f, partIndex), b = doorLocalPoint(end, i, f, partIndex);
      for (const box of doorComponentBoxes(i,partIndex,'collision')) {
        const hit = intersectBox(a, b, box, radius, radius === 0);
        if (!hit || (best && hit.t >= best.t)) continue;
        best = { doorIndex: i, partIndex, t: hit.t,
          position: { x: start.x + (end.x-start.x)*hit.t, y: start.y + (end.y-start.y)*hit.t, z: start.z + (end.z-start.z)*hit.t },
          normal: doorWorldVector(hit.normal,i,f,partIndex) };
      }
    }
  }
  return best;
}

function sweepOtherDoors(
  start: Vec3,
  end: Vec3,
  radius: number,
  states: readonly DoorState[],
  excludedIndex: number,
): DoorHit | null {
  let best: DoorHit | null = null;
  for (let i = 0; i < DOORS.length; i++) {
    if (i === excludedIndex) continue;
    const fraction = states[i]?.fraction ?? 0;
    for (let partIndex=0;partIndex<doorComponentCount(i);partIndex++) {
      const a = doorLocalPoint(start, i, fraction, partIndex), b = doorLocalPoint(end, i, fraction, partIndex);
      for (const box of doorComponentBoxes(i,partIndex,'collision')) {
        const hit = intersectBox(a, b, box, radius, false);
        if (!hit || (best && hit.t >= best.t)) continue;
        best = {
          doorIndex: i,
          partIndex,
          t: hit.t,
          position: {
            x: start.x+(end.x-start.x)*hit.t,
            y: start.y+(end.y-start.y)*hit.t,
            z: start.z+(end.z-start.z)*hit.t,
          },
          normal: doorWorldVector(hit.normal,i,fraction,partIndex),
        };
      }
    }
  }
  return best;
}

function segmentPointDistanceSquared(start: Vec3, end: Vec3, point: Vec3): number {
  const dx = end.x-start.x, dy = end.y-start.y, dz = end.z-start.z;
  const lengthSquared = dx*dx+dy*dy+dz*dz;
  const projection = lengthSquared > 1e-12
    ? Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy+(point.z-start.z)*dz)/lengthSquared))
    : 0;
  const x = start.x+dx*projection-point.x;
  const y = start.y+dy*projection-point.y;
  const z = start.z+dz*projection-point.z;
  return x*x+y*y+z*z;
}

function worldSweepBlocked(start: Vec3, end: Vec3, radius: number): boolean {
  let queryStart={...start},queryEnd={...end};
  for (let contact=0;contact<4;contact++) {
    const hit: WorldHit|null=sweepWorld(queryStart,queryEnd,radius);
    if (!hit) return false;
    if (hit.t>1e-7) return true;
    const dx=queryEnd.x-queryStart.x,dy=queryEnd.y-queryStart.y,dz=queryEnd.z-queryStart.z;
    if (dx*hit.normal.x+dy*hit.normal.y+dz*hit.normal.z < -1e-10) return true;
    // The BVH reports an initial tangent even when travel separates. Bias only
    // the collision query a hair outward and resweep the complete remaining
    // path, so a later wall is still found instead of being hidden by t=0.
    const bias=1e-5;
    queryStart={x:queryStart.x+hit.normal.x*bias,y:queryStart.y+hit.normal.y*bias,z:queryStart.z+hit.normal.z*bias};
    queryEnd={x:queryEnd.x+hit.normal.x*bias,y:queryEnd.y+hit.normal.y*bias,z:queryEnd.z+hit.normal.z*bias};
  }
  return true;
}

// Conservative full-path displacement for adaptive obstruction substeps. A
// sectional panel turns a corner, so endpoint distance alone is insufficient.
const travel = DOORS.map((definition,index) => {
  let longest = 0;
  for (let partIndex=0;partIndex<doorComponentCount(index);partIndex++) {
    for (const box of doorComponentBoxes(index,partIndex,'collision')) {
      for (const x of [box.min[0],box.max[0]]) for (const y of [box.min[1],box.max[1]]) for (const z of [box.min[2],box.max[2]]) {
        const source={x,y,z};
        let distance=0, previous=doorMotionWorldPoint(definition,source,0,partIndex);
        for (let sample=1;sample<=32;sample++) {
          const current=doorMotionWorldPoint(definition,source,sample/32,partIndex);
          distance+=Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z);
          previous=current;
        }
        longest=Math.max(longest,distance);
      }
    }
  }
  return longest;
});

// Sliding wardrobe leaves enclose three inner drawer bays. When a grouped
// inside toggle closes both, the outer leaves hold open until every drawer has
// fully retracted, preventing a leaf from crossing an occupied moving tray.
const closingDependencies = new Map<number,number[]>();
for (let closetIndex=0;closetIndex<CLOSET_DOORS.length;closetIndex++) {
  const outer=CLOSET_DOORS[closetIndex];
  if (outer.kind!=='sliding') continue;
  const dependent=CLOSET_DOORS.flatMap((entry,index) =>
    entry.kind==='drawer' && entry.unitId.startsWith(`${outer.unitId}-drawers-`)
      ? [ROOM_DOOR_COUNT+index] : []);
  if (dependent.length) closingDependencies.set(ROOM_DOOR_COUNT+closetIndex,dependent);
}
/** Stop before sweeping any part through an occupant; resume when the space clears.
 * Optional drawer indices parallel occupants and authorize inside-release carry.
 * A successful carry updates those occupant positions together with the tray. */
export function advanceDoors(
  states: DoorState[],
  dt: number,
  occupants: readonly Vec3[],
  radius: number,
  ridingDrawers: readonly number[] = [],
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (let i = 0; i < Math.min(states.length, DOORS.length); i++) {
    const state = states[i], target = state.opening ? 1 : 0;
    if (DOORS[i].fixed || state.fraction === target) continue;
    if (!state.opening && closingDependencies.get(i)?.some(index => (states[index]?.fraction ?? 0)>1e-8)) continue;
    const duration=doorMotionDuration(DOORS[i]);
    const next = state.opening ? Math.min(1, state.fraction + dt/duration) : Math.max(0, state.fraction - dt/duration);
    const start = state.fraction;
    // smoothstep peaks at 1.5x linear velocity, so keep the spatial substep
    // conservative even around the middle of a large animation tick.
    const steps = occupants.length ? Math.max(1, Math.ceil(Math.abs(next-start)*travel[i]*1.6 / Math.max(.01, radius*.35))) : 1;
    for (let step = 1; step <= steps; step++) {
      const fraction = start + (next-start)*step/steps;
      const riders = DOORS[i].kind === 'drawer'
        ? occupants.map((_position,index) => index)
          .filter(index => ridingDrawers[index] === i && insideDrawer(occupants[index],i,state.fraction))
        : [];
      const riderSet = new Set(riders);
      const riderMoves = riders.map(index => {
        const start=occupants[index];
        const closedPoint=doorLocalPoint(start,i,state.fraction);
        return { index,start,end:doorWorldPoint(closedPoint,i,fraction) };
      });
      let blocked = occupants.some((position,index) =>
        !riderSet.has(index) && approachingDoorPadding(position,radius,i,state.fraction,fraction));
      for (const move of riderMoves) {
        if (blocked) break;
        // The pilot moves rigidly with this tray, so its physical contact with
        // the tray is unchanged. Use the real radius here; the ordinary .035
        // closing allowance would reject harmless bottom/side tangency.
        if (overlapsDoor(move.end,radius,i,fraction)) { blocked=true; break; }
        if (worldSweepBlocked(move.start,move.end,radius)
          || overlapsWorld(move.end,radius)
          || sweepOtherDoors(move.start,move.end,radius,states,i)) {
          blocked=true;
          break;
        }
        for (let otherIndex=0;otherIndex<occupants.length;otherIndex++) {
          if (otherIndex===move.index || riderSet.has(otherIndex)) continue;
          if (segmentPointDistanceSquared(move.start,move.end,occupants[otherIndex]) < (radius*2)**2) {
            blocked=true;
            break;
          }
        }
      }
      if (blocked) break;
      state.fraction = fraction;
      for (const move of riderMoves) {
        occupants[move.index].x=move.end.x;
        occupants[move.index].y=move.end.y;
        occupants[move.index].z=move.end.z;
      }
    }
  }
}
